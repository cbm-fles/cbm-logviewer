// The levels of the flesnet logger and their OpenTelemetry severities, see
// doc/logging.md in flesnet.

export interface Severity {
  code: number;
  text: string;
  level: string;
}

export const severities: readonly Severity[] = [
  { code: 1, text: "TRACE", level: "trace" },
  { code: 5, text: "DEBUG", level: "debug" },
  { code: 9, text: "INFO", level: "status" },
  { code: 11, text: "NOTICE", level: "info" },
  { code: 13, text: "WARN", level: "warning" },
  { code: 17, text: "ERROR", level: "error" },
  { code: 21, text: "FATAL", level: "fatal" },
];

// The severity a code belongs to: OpenTelemetry codes come in ranges of four,
// e.g. 9 to 12 are INFO to INFO4.
export function severityOf(code: number): Severity | undefined {
  if (code < 1 || code > 24) return undefined;
  return severities.findLast((s) => s.code <= code);
}
