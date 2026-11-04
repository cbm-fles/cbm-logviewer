import { describe, expect, it } from "vitest";
import { formatTime, formatValue } from "./format.js";

describe("formatTime", () => {
  it("keeps the microseconds", () => {
    expect(formatTime("2026-11-04T10:25:37.247123000Z", true)).toBe(
      "2026-11-04 10:25:37.247123",
    );
    expect(formatTime("2026-11-04T10:25:37.2Z", true)).toBe(
      "2026-11-04 10:25:37.200000",
    );
    expect(formatTime("2026-11-04T10:25:37Z", true)).toBe(
      "2026-11-04 10:25:37.000000",
    );
  });

  it("leaves invalid timestamps as they are", () => {
    expect(formatTime("yesterday", true)).toBe("yesterday");
  });
});

describe("formatValue", () => {
  it("formats objects as JSON", () => {
    expect(formatValue({ build_time_ms: 1001 })).toBe('{"build_time_ms":1001}');
    expect(formatValue(undefined)).toBe("");
    expect(formatValue(17)).toBe("17");
  });
});
