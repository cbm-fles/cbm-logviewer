import { describe, expect, it } from "vitest";
import { chooseInterval } from "./interval.js";

describe("chooseInterval", () => {
  it("chooses the shortest interval that fits", () => {
    expect(chooseInterval(0, 100)).toBe("1ms");
    expect(chooseInterval(86400000, 12)).toBe("3h");
    expect(chooseInterval(86400000, 100)).toBe("30m");
    expect(chooseInterval(3600000, 60)).toBe("5m");
    expect(chooseInterval(3600000, 61)).toBe("1m");
  });

  it("falls back to the longest interval", () => {
    expect(chooseInterval(1e12, 10)).toBe("30d");
  });
});
