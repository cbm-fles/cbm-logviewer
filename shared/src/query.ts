// The requests and responses of the server API.

import type { LogMessage } from "./fields.js";

// The fields that can be filtered by value
export const filterFields = [
  "host",
  "service",
  "thread",
  "tid",
  "pid",
  "timeslice",
  "message",
  "message_template",
  "file_name",
  "line",
  "function",
  "version",
  "log_file",
  "data",
] as const;

export type FilterField = (typeof filterFields)[number];

// A message passes if it matches one of the patterns in `match` (if any) and
// none in `exclude`. On text fields (message, data), a pattern is a phrase;
// on the others, it is a value. In both, `*` and `?` are wildcards.
export interface FieldFilter {
  match?: string[];
  exclude?: string[];
}

export interface Filters {
  // the time range, as ISO timestamps or OpenSearch date math ("now-1h")
  from?: string;
  to?: string;
  // the severities to show, as their base codes (see severities); all if unset
  severities?: number[];
  fields?: Partial<Record<FilterField, FieldFilter>>;
}

export const maxQueryLimit = 100000;

export interface QueryRequest {
  filters: Filters;
  // the number of messages to return, at most maxQueryLimit
  limit: number;
}

export interface QueryResponse {
  // the newest `limit` matching messages, the oldest first
  messages: LogMessage[];
  // the number of matching messages
  total: number;
  took_ms: number;
}

export interface StatsRequest {
  filters: Filters;
  // the number of histogram buckets
  buckets?: number;
}

export interface StatsResponse {
  total: number;
  // the number of messages per severity, by severity_text
  by_severity: Record<string, number>;
  histogram: {
    interval: string;
    buckets: {
      time: string;
      count: number;
      by_severity: Record<string, number>;
    }[];
  };
}

export interface ValuesResponse {
  field: string;
  values: { value: string; count: number }[];
}
