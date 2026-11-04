// Live mode: follows the messages as they arrive in OpenSearch.
//
// Each log index has one shard, in which _seq_no counts the writes in the
// order they arrive. So the live mode keeps, for each index, a checkpoint: the
// _seq_no up to which it has seen all messages. Each poll asks for the
// messages beyond the checkpoints. Unlike following @timestamp, this finds
// messages that arrive late, e.g. from a node whose Fluent Bit was buffering.
//
// Writes become visible at a refresh, not necessarily in the order of their
// _seq_no, so there can be gaps. The aggregations of a poll count all messages
// beyond each checkpoint, filtered or not: if their number fills the range up
// to the highest _seq_no, there is no gap and the checkpoint moves there.
// Otherwise the checkpoint stays and the messages beyond it that were sent
// already are skipped. A gap that is not filled within gapTimeoutMs is a write
// that failed or was deleted, and is passed over.

import type { Filters, LogMessage } from "@cbm-logviewer/shared";
import type { Client } from "@opensearch-project/opensearch";
import { buildQuery } from "./dsl.js";
import { aggregations, toMessage } from "./search.js";

// OpenSearch returns at most this many hits per request
const maxHits = 10000;

export interface LiveOptions {
  // the maximum number of messages per poll; more are dropped
  maxMessages?: number;
  gapTimeoutMs?: number;
}

export interface LivePoll {
  messages: LogMessage[];
  dropped: number;
  // all messages that arrived, whether they match or not
  arrived: number;
}

interface IndexBucket {
  key: string;
  doc_count: number;
  max_seq_no: { value: number | null };
}

interface Hit {
  _id: string;
  _index: string;
  _seq_no: number;
  _source: Record<string, unknown>;
}

export class LiveTail {
  private readonly checkpoints = new Map<string, number>();
  // when a gap beyond the checkpoint of an index was found
  private readonly gapSince = new Map<string, number>();
  // the messages beyond the checkpoints that were sent, by index and _seq_no
  private readonly sent = new Map<string, Set<number>>();
  private readonly postFilter: Record<string, unknown>;
  private readonly maxMessages: number;
  private readonly gapTimeoutMs: number;

  constructor(
    private readonly client: Client,
    private readonly index: string,
    filters: Omit<Filters, "from" | "to">,
    options: LiveOptions = {},
  ) {
    this.postFilter = buildQuery(filters);
    this.maxMessages = options.maxMessages ?? 5000;
    this.gapTimeoutMs = options.gapTimeoutMs ?? 30000;
  }

  // Sets the checkpoints to the current ends of the indices, so that the
  // first poll returns the messages that arrive from now on.
  async start(): Promise<void> {
    const { body } = await this.client.search({
      index: this.index,
      ignore_unavailable: true,
      body: { size: 0, aggs: this.indexAggregation() },
    });
    for (const b of this.indexBuckets(body)) {
      this.checkpoints.set(b.key, b.max_seq_no.value ?? -1);
    }
  }

  async poll(now = Date.now()): Promise<LivePoll> {
    const known = [...this.checkpoints];
    const beyondCheckpoints = {
      bool: {
        should: [
          ...known.map(([index, seqNo]) => ({
            bool: {
              filter: [
                { term: { _index: index } },
                { range: { _seq_no: { gt: seqNo } } },
              ],
            },
          })),
          // indices created since
          {
            bool: {
              must_not: { terms: { _index: known.map(([index]) => index) } },
            },
          },
        ],
        minimum_should_match: 1,
      },
    };
    const { body } = await this.client.search({
      index: this.index,
      ignore_unavailable: true,
      seq_no_primary_term: true,
      body: {
        query: beyondCheckpoints,
        post_filter: this.postFilter,
        // more than allowed, for the ones sent already
        size: Math.min(maxHits, this.maxMessages + this.sentCount()),
        sort: [{ _index: "asc" }, { _seq_no: "asc" }],
        track_total_hits: true,
        aggs: this.indexAggregation(),
      },
    });

    const hits = body.hits.hits as unknown as Hit[];
    const fresh = hits.filter((h) => !this.sent.get(h._index)?.has(h._seq_no));
    // all sent messages beyond the checkpoints match, and are in the total
    const matching =
      Number((body.hits.total as { value: number }).value) - this.sentCount();
    const delivered = fresh.slice(0, this.maxMessages);
    const dropped = Math.max(0, matching - delivered.length);

    for (const h of delivered) {
      let seqNos = this.sent.get(h._index);
      if (!seqNos) this.sent.set(h._index, (seqNos = new Set()));
      seqNos.add(h._seq_no);
    }
    let arrived = 0;
    for (const b of this.indexBuckets(body)) {
      arrived += this.advance(b, now, dropped > 0);
    }

    const messages = delivered.map(toMessage);
    messages.sort((a, b) =>
      a["@timestamp"] < b["@timestamp"]
        ? -1
        : a["@timestamp"] > b["@timestamp"]
          ? 1
          : 0,
    );
    return { messages, dropped, arrived };
  }

  // Moves the checkpoint of an index, if it can, and returns by how many
  // messages.
  private advance(b: IndexBucket, now: number, overflow: boolean): number {
    const max = b.max_seq_no.value;
    if (max === null) return 0;
    const checkpoint = this.checkpoints.get(b.key) ?? -1;
    const complete = b.doc_count === max - checkpoint;
    if (!complete && !overflow) {
      const since = this.gapSince.get(b.key);
      if (since === undefined) {
        this.gapSince.set(b.key, now);
        return 0;
      }
      if (now - since < this.gapTimeoutMs) return 0;
    }
    this.checkpoints.set(b.key, max);
    this.gapSince.delete(b.key);
    this.sent.delete(b.key);
    return max - checkpoint;
  }

  private sentCount(): number {
    let n = 0;
    for (const s of this.sent.values()) n += s.size;
    return n;
  }

  private indexAggregation() {
    return aggregations({
      indices: {
        terms: { field: "_index", size: 1000 },
        aggs: { max_seq_no: { max: { field: "_seq_no" } } },
      },
    });
  }

  private indexBuckets(body: { aggregations?: unknown }): IndexBucket[] {
    const aggs = body.aggregations as unknown as
      { indices: { buckets: IndexBucket[] } } | undefined;
    return aggs?.indices.buckets ?? [];
  }
}
