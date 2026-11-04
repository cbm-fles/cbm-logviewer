// Resolves the times of filters once per request, so that "now-1h" means the
// same in all requests to OpenSearch that answer it.

import type { Filters } from "@cbm-logviewer/shared";
import { FilterError } from "./dsl.js";

const units: Record<string, number> = {
  ms: 1,
  s: 1000,
  m: 60000,
  h: 3600000,
  d: 86400000,
  w: 604800000,
};

// "now", "now-<n><unit>" or an ISO timestamp, which stays as it is to keep
// its precision
export function resolveTime(time: string, now: Date): string {
  const relative = /^now(?:-(\d+)(ms|s|m|h|d|w))?$/.exec(time);
  if (relative) {
    const [, n, unit] = relative;
    const offset = n ? Number(n) * units[unit!]! : 0;
    return new Date(now.getTime() - offset).toISOString();
  }
  if (!/^\d{4}-\d{2}-\d{2}/.test(time) || Number.isNaN(Date.parse(time))) {
    throw new FilterError(`invalid time "${time}"`);
  }
  return time;
}

export function resolveTimes(filters: Filters, now = new Date()): Filters {
  return {
    ...filters,
    ...(filters.from !== undefined && { from: resolveTime(filters.from, now) }),
    ...(filters.to !== undefined && { to: resolveTime(filters.to, now) }),
  };
}
