import type { LogMessage } from "@cbm-logviewer/shared";
import { describe, expect, it } from "vitest";
import { fileName, toCsv, toJson } from "./download.js";

const m: LogMessage = {
  id: "a",
  "@timestamp": "2026-11-04T10:00:00.123456Z",
  severity_code: 13,
  severity_text: "WARN",
  message: 'Build timeout, "slow"',
  data: { build_time_ms: 1001 },
};

describe("downloads", () => {
  it("write JSON lines", () => {
    expect(toJson([m, m]).split("\n")).toHaveLength(3);
    expect(JSON.parse(toJson([m]))).toEqual(m);
  });

  it("write CSV with quoting", () => {
    const csv = toCsv(
      [m],
      [
        { id: "severity_text", label: "Severity" },
        { id: "message", label: "Message" },
      ],
      (msg, field) =>
        String((msg as unknown as Record<string, unknown>)[field]),
    );
    expect(csv).toBe('Severity,Message\r\nWARN,"Build timeout, ""slow"""\r\n');
  });

  it("name files by time", () => {
    expect(fileName("csv", new Date("2026-11-04T10:25:37.123Z"))).toBe(
      "logs-2026-11-04T10-25-37Z.csv",
    );
  });
});
