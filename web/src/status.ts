// The texts of the status line.

import { fields } from "@cbm-logviewer/shared";
import { type FieldInputs, parsePatterns } from "./filters";
import { formatTime } from "./format";

const n = (x: number) => x.toLocaleString("en");

export interface QueryCounts {
  // the messages shown, that match, and all in the time range
  shown: number;
  matching: number;
  all: number | undefined;
}

// e.g. "1,086 of 80,520 messages match" or, beyond the limit,
// "112,000 of 300,000 messages match, the newest 100,000 shown"
export function queryText(c: QueryCounts): string {
  let text =
    c.all === undefined || c.all === c.matching
      ? `${n(c.matching)} messages`
      : `${n(c.matching)} of ${n(c.all)} messages match`;
  if (c.matching > c.shown) text += `, the newest ${n(c.shown)} shown`;
  return text;
}

export interface LiveCounts {
  shown: number;
  // all messages since `since`, as far as known
  all: number | undefined;
  since: string | undefined;
  // the most messages kept
  limit: number;
  utc: boolean;
  now?: Date;
}

// the time, with the date unless it is today
export function shortTime(iso: string, utc: boolean, now = new Date()): string {
  const t = formatTime(iso, utc);
  const today = formatTime(now.toISOString(), utc).slice(0, 10);
  return t.startsWith(today) ? t.slice(11, 19) : t.slice(0, 19);
}

// e.g. "1,086 of 52,310 messages since 14:02:11 match"
export function liveText(c: LiveCounts): string {
  if (c.since === undefined) return `${n(c.shown)} messages`;
  const since = shortTime(c.since, c.utc, c.now);
  if (c.shown >= c.limit)
    return `the newest ${n(c.shown)} messages since ${since}`;
  if (c.all === undefined || c.all <= c.shown) {
    return `${n(c.shown)} messages since ${since}`;
  }
  return `${n(c.shown)} of ${n(c.all)} messages since ${since} match`;
}

// the filters of the columns, e.g. "Host node9, node1* · not Message *x*"
export function describeFilters(inputs: FieldInputs): string[] {
  const parts: string[] = [];
  for (const f of fields) {
    const input = inputs[f.name as keyof FieldInputs];
    if (!input) continue;
    if (parsePatterns(input.match).length > 0) {
      parts.push(`${f.label} ${input.match.trim()}`);
    }
    if (parsePatterns(input.exclude).length > 0) {
      parts.push(`not ${f.label} ${input.exclude.trim()}`);
    }
  }
  return parts;
}
