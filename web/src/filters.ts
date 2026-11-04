// The filters of the page: what is entered, the filters of the server API it
// becomes, and its form in the URL, so that a view can be shared as a link.

import {
  type FieldFilter,
  type FilterField,
  type Filters,
  filterFields,
  severities,
} from "@cbm-logviewer/shared";

export type Mode = "query" | "live";

export const ranges = [
  { id: "15m", label: "15 min", from: "now-15m" },
  { id: "1h", label: "1 hour", from: "now-1h" },
  { id: "6h", label: "6 hours", from: "now-6h" },
  { id: "24h", label: "24 hours", from: "now-24h" },
  { id: "7d", label: "7 days", from: "now-7d" },
  { id: "custom", label: "Custom", from: undefined },
] as const;

export type RangeId = (typeof ranges)[number]["id"];

// the text in the match and exclude fields of a column
export interface FieldInput {
  match: string;
  exclude: string;
}

export type FieldInputs = Partial<Record<FilterField, FieldInput>>;

export interface View {
  mode: Mode;
  range: RangeId;
  // datetime-local values, in local time
  customFrom: string;
  customTo: string;
  severities: number[];
  fields: FieldInputs;
}

// all but TRACE and DEBUG
export const defaultSeverities = severities
  .filter((s) => s.code >= 9)
  .map((s) => s.code);

export const defaultView: View = {
  mode: "query",
  range: "1h",
  customFrom: "",
  customTo: "",
  severities: defaultSeverities,
  fields: {},
};

export function isFilterField(field: string): field is FilterField {
  return (filterFields as readonly string[]).includes(field);
}

// Patterns are separated by commas. A pattern in double quotes can contain
// commas, and "" in it stands for a quote. In patterns, * and ? are wildcards,
// \*, \? and \\ stand for themselves.
export function parsePatterns(text: string): string[] {
  const patterns: string[] = [];
  let i = 0;
  while (i < text.length) {
    while (text[i] === " ") i++;
    if (text[i] === '"') {
      let p = "";
      i++;
      while (i < text.length) {
        if (text[i] === '"') {
          if (text[i + 1] !== '"') break;
          i++;
        }
        p += text[i++];
      }
      const comma = text.indexOf(",", i);
      i = comma < 0 ? text.length : comma + 1;
      if (p) patterns.push(p);
    } else {
      const comma = text.indexOf(",", i);
      const end = comma < 0 ? text.length : comma;
      const p = text.slice(i, end).trim();
      i = end + 1;
      if (p) patterns.push(p);
    }
  }
  return patterns;
}

// The pattern that matches a value exactly, as it is written in a filter
export function literalPattern(value: string): string {
  const escaped = value.replace(/[\\*?]/g, "\\$&");
  return /[,"]|^\s|\s$/.test(escaped)
    ? `"${escaped.replace(/"/g, '""')}"`
    : escaped;
}

// Adds a pattern, as it is written, to the text of a filter, unless it is
// there.
export function addPattern(text: string, pattern: string): string {
  const [added] = parsePatterns(pattern);
  if (added === undefined || parsePatterns(text).includes(added)) return text;
  return text.trim() ? `${text.trimEnd()}, ${pattern}` : pattern;
}

// a datetime-local value, which is local time, as ISO
function localToIso(value: string): string | undefined {
  const d = new Date(value);
  return value && !Number.isNaN(d.getTime()) ? d.toISOString() : undefined;
}

export function fieldFilters(fields: FieldInputs): Filters["fields"] {
  const result: Partial<Record<FilterField, FieldFilter>> = {};
  for (const [field, input] of Object.entries(fields) as [
    FilterField,
    FieldInput,
  ][]) {
    const match = parsePatterns(input.match);
    const exclude = parsePatterns(input.exclude);
    if (match.length || exclude.length) {
      result[field] = {
        ...(match.length && { match }),
        ...(exclude.length && { exclude }),
      };
    }
  }
  return result;
}

// the filters of live mode, which has no time range
export function liveFilters(view: View): Omit<Filters, "from" | "to"> {
  const fields = fieldFilters(view.fields);
  return {
    ...(view.severities.length < severities.length && {
      severities: view.severities,
    }),
    ...(fields && Object.keys(fields).length > 0 && { fields }),
  };
}

export function queryFilters(view: View): Filters {
  const preset = ranges.find((r) => r.id === view.range);
  const from = preset?.from ?? localToIso(view.customFrom);
  const to = view.range === "custom" ? localToIso(view.customTo) : undefined;
  return {
    ...liveFilters(view),
    ...(from !== undefined && { from }),
    ...(to !== undefined && { to }),
  };
}

// The view in the query of a URL, e.g.
// ?mode=live&severities=13,17,21&host=node1*&-service=tsclient
// with only what differs from the default view.
export function viewToSearch(view: View): string {
  const params = new URLSearchParams();
  if (view.mode !== defaultView.mode) params.set("mode", view.mode);
  if (view.range !== defaultView.range) params.set("range", view.range);
  if (view.range === "custom") {
    if (view.customFrom) params.set("from", view.customFrom);
    if (view.customTo) params.set("to", view.customTo);
  }
  if (view.severities.join() !== defaultView.severities.join()) {
    params.set("severities", view.severities.join(","));
  }
  for (const field of filterFields) {
    const input = view.fields[field];
    if (input?.match.trim()) params.set(field, input.match.trim());
    if (input?.exclude.trim()) params.set(`-${field}`, input.exclude.trim());
  }
  const search = params.toString();
  return search ? `?${search}` : "";
}

export function viewFromSearch(search: string): View {
  const params = new URLSearchParams(search);
  const mode = params.get("mode");
  const range = params.get("range");
  const codes = params.get("severities");
  const fields: FieldInputs = {};
  for (const field of filterFields) {
    const match = params.get(field) ?? "";
    const exclude = params.get(`-${field}`) ?? "";
    if (match || exclude) fields[field] = { match, exclude };
  }
  return {
    mode: mode === "live" ? "live" : "query",
    range: ranges.find((r) => r.id === range)?.id ?? defaultView.range,
    customFrom: params.get("from") ?? "",
    customTo: params.get("to") ?? "",
    severities:
      codes === null
        ? defaultView.severities
        : codes
            .split(",")
            .map(Number)
            .filter((c) => severities.some((s) => s.code === c)),
    fields,
  };
}
