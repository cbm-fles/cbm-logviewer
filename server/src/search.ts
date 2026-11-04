// The queries of the API against OpenSearch.

import type {
  Filters,
  LogMessage,
  QueryRequest,
  QueryResponse,
  StatsRequest,
  StatsResponse,
  ValuesResponse,
} from "@cbm-logviewer/shared";
import type { Client, Types } from "@opensearch-project/opensearch";
import { buildQuery, newestFirst } from "./dsl.js";

interface Hit {
  _id: string;
  _source: Record<string, unknown>;
  sort: Types.Common.SortResults;
}

// The client parses numbers beyond 2^53 as BigInt, which JSON cannot hold.
function withoutBigInt(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(withoutBigInt);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, withoutBigInt(v)]),
    );
  }
  return value;
}

function toMessage(hit: Hit): LogMessage {
  return {
    id: hit._id,
    ...(withoutBigInt(hit._source) as object),
  } as LogMessage;
}

function total(body: { hits: { total?: unknown } }): number {
  const t = body.hits.total;
  return typeof t === "object" && t !== null
    ? Number((t as { value: unknown }).value)
    : 0;
}

export class Search {
  constructor(
    private readonly client: Client,
    private readonly index: string,
    // OpenSearch returns at most 10000 hits per request
    private readonly pageSize = 10000,
  ) {}

  // The newest `limit` matching messages, in pages from the
  // newest backwards, returned the oldest first.
  async query(req: QueryRequest): Promise<QueryResponse> {
    const start = Date.now();
    const query = buildQuery(req.filters);
    const messages: LogMessage[] = [];
    let after: Types.Common.SortResults | undefined;
    let count = 0;
    while (messages.length < req.limit) {
      const { body } = await this.client.search({
        index: this.index,
        ignore_unavailable: true,
        body: {
          query,
          size: Math.min(this.pageSize, req.limit - messages.length),
          sort: newestFirst,
          track_total_hits: after === undefined,
          ...(after && { search_after: after }),
        },
      });
      if (after === undefined) count = total(body);
      const hits = body.hits.hits as unknown as Hit[];
      for (const hit of hits) messages.push(toMessage(hit));
      if (hits.length === 0 || messages.length >= count) break;
      after = hits.at(-1)!.sort;
    }
    messages.reverse();
    return { messages, total: count, took_ms: Date.now() - start };
  }

  async stats(req: StatsRequest): Promise<StatsResponse> {
    const bySeverity = { terms: { field: "severity_text", size: 20 } };
    const { body } = await this.client.search({
      index: this.index,
      ignore_unavailable: true,
      body: {
        query: buildQuery(req.filters),
        size: 0,
        track_total_hits: true,
        aggs: {
          by_severity: bySeverity,
          histogram: {
            auto_date_histogram: {
              field: "@timestamp",
              buckets: req.buckets ?? 100,
            },
            aggs: { by_severity: bySeverity },
          },
        },
      },
    });
    const aggs = body.aggregations as unknown as StatsAggregations | undefined;
    const counts = (agg: TermsAggregation | undefined) =>
      Object.fromEntries(
        (agg?.buckets ?? []).map((b) => [b.key, Number(b.doc_count)]),
      );
    return {
      total: total(body),
      by_severity: counts(aggs?.by_severity),
      histogram: {
        interval: aggs?.histogram.interval ?? "",
        buckets: (aggs?.histogram.buckets ?? []).map((b) => ({
          time: b.key_as_string,
          count: Number(b.doc_count),
          by_severity: counts(b.by_severity),
        })),
      },
    };
  }

  // The most frequent values of a keyword field
  async values(
    field: string,
    filters: Filters,
    size = 100,
  ): Promise<ValuesResponse> {
    // not inline, as the client's type of terms lacks `field`
    const terms = { field, size };
    const { body } = await this.client.search({
      index: this.index,
      ignore_unavailable: true,
      body: {
        query: buildQuery(filters),
        size: 0,
        aggs: { values: { terms } },
      },
    });
    const aggs = body.aggregations as unknown as
      { values: TermsAggregation } | undefined;
    return {
      field,
      values: (aggs?.values.buckets ?? []).map((b) => ({
        value: String(b.key),
        count: Number(b.doc_count),
      })),
    };
  }
}

interface TermsAggregation {
  buckets: { key: string; doc_count: number | bigint }[];
}

interface StatsAggregations {
  by_severity: TermsAggregation;
  histogram: {
    interval: string;
    buckets: {
      key_as_string: string;
      doc_count: number | bigint;
      by_severity: TermsAggregation;
    }[];
  };
}
