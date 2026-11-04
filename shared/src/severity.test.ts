import { describe, expect, it } from "vitest";
import { severityOf } from "./severity.js";

describe("severityOf", () => {
  it("maps the flesnet codes", () => {
    expect(severityOf(9)?.level).toBe("status");
    expect(severityOf(11)?.level).toBe("info");
    expect(severityOf(13)?.text).toBe("WARN");
  });

  it("maps codes within a range", () => {
    expect(severityOf(10)?.text).toBe("INFO");
    expect(severityOf(24)?.text).toBe("FATAL");
  });

  it("rejects codes out of range", () => {
    expect(severityOf(0)).toBeUndefined();
    expect(severityOf(25)).toBeUndefined();
  });
});
