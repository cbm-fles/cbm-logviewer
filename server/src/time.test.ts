import { describe, expect, it } from "vitest";
import { FilterError } from "./dsl.js";
import { resolveTime, resolveTimes } from "./time.js";

const now = new Date("2026-11-04T10:00:00.000Z");

describe("resolveTime", () => {
  it("resolves relative times", () => {
    expect(resolveTime("now", now)).toBe("2026-11-04T10:00:00.000Z");
    expect(resolveTime("now-90s", now)).toBe("2026-11-04T09:58:30.000Z");
    expect(resolveTime("now-24h", now)).toBe("2026-11-03T10:00:00.000Z");
    expect(resolveTime("now-1w", now)).toBe("2026-10-28T10:00:00.000Z");
  });

  it("keeps ISO timestamps with their precision", () => {
    expect(resolveTime("2026-11-04T09:00:00.123456789Z", now)).toBe(
      "2026-11-04T09:00:00.123456789Z",
    );
  });

  it("rejects other times", () => {
    for (const t of ["now-1y", "now+1h", "yesterday", "1793786400000"]) {
      expect(() => resolveTime(t, now)).toThrow(FilterError);
    }
  });
});

describe("resolveTimes", () => {
  it("resolves both ends and keeps the other filters", () => {
    expect(
      resolveTimes({ from: "now-1h", to: "now", severities: [13] }, now),
    ).toEqual({
      from: "2026-11-04T09:00:00.000Z",
      to: "2026-11-04T10:00:00.000Z",
      severities: [13],
    });
  });
});
