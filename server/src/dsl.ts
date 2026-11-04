// Translates the filters of the API into OpenSearch queries.

import {
  type FieldFilter,
  type Filters,
  fields,
  severities,
} from "@cbm-logviewer/shared";

type Query = Record<string, unknown>;

const textFields: Record<string, string> = {
  message: "message",
  data: "data_text",
};

// `*` and `?` are wildcards, `\*`, `\?` and `\\` stand for themselves.
function hasWildcard(pattern: string): boolean {
  return /(?:^|[^\\])(?:\\\\)*[*?]/.test(pattern);
}

function unescape(pattern: string): string {
  return pattern.replace(/\\([*?\\])/g, "$1");
}

function patternQuery(field: string, pattern: string): Query {
  const textField = textFields[field];
  if (textField) {
    return hasWildcard(pattern)
      ? {
          wildcard: {
            [textField]: {
              value: pattern.toLowerCase(),
              case_insensitive: true,
            },
          },
        }
      : { match_phrase: { [textField]: unescape(pattern) } };
  }
  const type = fields.find((f) => f.name === field)?.type;
  if (type === "integer") {
    // as a string, as timeslice ids can be beyond 2^53
    if (!/^-?\d+$/.test(pattern)) {
      throw new FilterError(`${field}: "${pattern}" is not an integer`);
    }
    return { term: { [field]: pattern } };
  }
  return hasWildcard(pattern)
    ? { wildcard: { [field]: { value: pattern, case_insensitive: true } } }
    : { term: { [field]: unescape(pattern) } };
}

function anyOf(queries: Query[]): Query {
  return queries.length === 1
    ? queries[0]!
    : { bool: { should: queries, minimum_should_match: 1 } };
}

export class FilterError extends Error {}

export function buildQuery(filters: Filters): Query {
  const filter: Query[] = [];
  const mustNot: Query[] = [];

  if (filters.from !== undefined || filters.to !== undefined) {
    filter.push({
      range: {
        "@timestamp": {
          ...(filters.from !== undefined && { gte: filters.from }),
          ...(filters.to !== undefined && { lte: filters.to }),
        },
      },
    });
  }

  if (filters.severities !== undefined) {
    // a severity covers its code and the three above, as in OpenTelemetry
    filter.push(
      anyOf(
        filters.severities.map((code) => {
          if (!severities.some((s) => s.code === code)) {
            throw new FilterError(`unknown severity code ${code}`);
          }
          return { range: { severity_code: { gte: code, lte: code + 3 } } };
        }),
      ),
    );
  }

  for (const [field, f] of Object.entries(filters.fields ?? {}) as [
    string,
    FieldFilter,
  ][]) {
    if (f.match?.length) {
      filter.push(anyOf(f.match.map((p) => patternQuery(field, p))));
    }
    for (const p of f.exclude ?? []) {
      mustNot.push(patternQuery(field, p));
    }
  }

  if (filter.length === 0 && mustNot.length === 0) return { match_all: {} };
  return {
    bool: {
      ...(filter.length && { filter }),
      ...(mustNot.length && { must_not: mustNot }),
    },
  };
}

// The order of the messages, newest first. The indices have one shard each,
// so _index and _seq_no make it unique for search_after.
export const newestFirst: Record<string, "asc" | "desc">[] = [
  { "@timestamp": "desc" },
  { _index: "desc" },
  { _seq_no: "desc" },
];
