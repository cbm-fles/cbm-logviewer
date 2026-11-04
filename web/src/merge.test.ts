import type { LogMessage } from "@cbm-logviewer/shared";
import { describe, expect, it } from "vitest";
import { mergeNewest } from "./merge.js";

const m = (s: number): LogMessage => ({
  id: String(s),
  "@timestamp": `2026-11-04T10:00:${String(s).padStart(2, "0")}.000000Z`,
  severity_code: 9,
  severity_text: "INFO",
  message: "",
});
const ids = (ms: LogMessage[]) => ms.map((x) => Number(x.id));

describe("mergeNewest", () => {
  it("appends newer messages", () => {
    expect(ids(mergeNewest([m(1), m(2)], [m(3), m(4)], 10))).toEqual([
      1, 2, 3, 4,
    ]);
  });

  it("merges late messages by time", () => {
    expect(
      ids(mergeNewest([m(1), m(3), m(5)], [m(2), m(4), m(6)], 10)),
    ).toEqual([1, 2, 3, 4, 5, 6]);
    expect(ids(mergeNewest([m(5)], [m(1)], 10))).toEqual([1, 5]);
  });

  it("keeps the newest up to the limit", () => {
    expect(ids(mergeNewest([m(1), m(2), m(3)], [m(4), m(5)], 3))).toEqual([
      3, 4, 5,
    ]);
  });

  it("returns the same array without new messages", () => {
    const ms = [m(1)];
    expect(mergeNewest(ms, [], 10)).toBe(ms);
  });
});
