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
import { chooseInterval } from "./interval.js";
import { resolveTimes } from "./time.js";

interface Hit {
  _id: string;
  _source: Record<string, unknown>;
  sort: Types.Common.SortResults;
}

// Numbers beyond 2^53 in data lose precision, as the client does not parse
// them as BigInt: that is several times slower. data_text keeps them exactly.
export function toMessage(hit: Pick<Hit, "_id" | "_source">): LogMessage {
  return { id: hit._id, ...hit._source } as LogMessage;
}

type Aggregations = Record<
  string,
  Types.Common_Aggregations.AggregationContainer
>;

// The client's types of aggregations lack common fields such as `field`.
export function aggregations(aggs: Record<string, unknown>): Aggregations {
  return aggs as Aggregations;
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
    const query = buildQuery(resolveTimes(req.filters));
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
      // The sort value of @timestamp is in ns, beyond 2^53, so the client
      // cannot parse it exactly. OpenSearch also takes the timestamp itself.
      const last = hits.at(-1)!;
      after = [last._source["@timestamp"] as string, ...last.sort.slice(1)];
    }
    messages.reverse();
    return { messages, total: count, took_ms: Date.now() - start };
  }

  async stats(req: StatsRequest): Promise<StatsResponse> {
    const now = new Date();
    const filters = resolveTimes(req.filters, now);
    const query = buildQuery(filters);
    const bySeverity = { terms: { field: "severity_text", size: 20 } };

    const { body: span } = await this.client.search({
      index: this.index,
      ignore_unavailable: true,
      body: {
        query,
        size: 0,
        track_total_hits: true,
        aggs: aggregations({
          by_severity: bySeverity,
          min: { min: { field: "@timestamp" } },
          max: { max: { field: "@timestamp" } },
        }),
      },
    });
    const spanAggs = span.aggregations as unknown as
      SpanAggregations | undefined;
    const counts = (agg: TermsAggregation | undefined) =>
      Object.fromEntries(
        (agg?.buckets ?? []).map((b) => [b.key, Number(b.doc_count)]),
      );
    const result: StatsResponse = {
      total: total(span),
      by_severity: counts(spanAggs?.by_severity),
      histogram: { interval: "", buckets: [] },
    };
    // the histogram covers the time range of the filters, or else of the
    // messages
    const min = filters.from ?? spanAggs?.min.value_as_string;
    const max =
      filters.to ??
      (filters.from !== undefined
        ? now.toISOString()
        : spanAggs?.max.value_as_string);
    if (result.total === 0 || min === undefined || max === undefined) {
      return result;
    }

    const interval = chooseInterval(
      Date.parse(max) - Date.parse(min),
      req.buckets ?? 100,
    );
    const { body } = await this.client.search({
      index: this.index,
      ignore_unavailable: true,
      body: {
        query,
        size: 0,
        aggs: aggregations({
          histogram: {
            date_histogram: {
              field: "@timestamp",
              fixed_interval: interval,
              min_doc_count: 0,
              extended_bounds: { min, max },
            },
            aggs: { by_severity: bySeverity },
          },
        }),
      },
    });
    const aggs = body.aggregations as unknown as
      HistogramAggregations | undefined;
    result.histogram = {
      interval,
      buckets: (aggs?.histogram.buckets ?? []).map((b) => ({
        time: b.key_as_string,
        count: Number(b.doc_count),
        by_severity: counts(b.by_severity),
      })),
    };
    return result;
  }

  // The most frequent values of a keyword field
  async values(
    field: string,
    filters: Filters,
    size = 100,
  ): Promise<ValuesResponse> {
    filters = resolveTimes(filters);
    const { body } = await this.client.search({
      index: this.index,
      ignore_unavailable: true,
      body: {
        query: buildQuery(filters),
        size: 0,
        aggs: aggregations({ values: { terms: { field, size } } }),
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

interface SpanAggregations {
  by_severity: TermsAggregation;
  min: { value: number | null; value_as_string?: string };
  max: { value: number | null; value_as_string?: string };
}

interface HistogramAggregations {
  histogram: {
    buckets: {
      key_as_string: string;
      doc_count: number | bigint;
      by_severity: TermsAggregation;
    }[];
  };
}
