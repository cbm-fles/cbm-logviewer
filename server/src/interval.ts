// The interval of a histogram. auto_date_histogram does not work on date_nanos
// fields (OpenSearch 3.9 puts all into one bucket of a year), so the server
// chooses a fixed interval from the time span of the messages.

const intervals: [string, number][] = [
  ["1ms", 1],
  ["10ms", 10],
  ["100ms", 100],
  ["1s", 1000],
  ["5s", 5000],
  ["10s", 10000],
  ["30s", 30000],
  ["1m", 60000],
  ["5m", 300000],
  ["10m", 600000],
  ["30m", 1800000],
  ["1h", 3600000],
  ["3h", 10800000],
  ["6h", 21600000],
  ["12h", 43200000],
  ["1d", 86400000],
  ["7d", 604800000],
  ["30d", 2592000000],
];

// The shortest interval that divides the span into at most `buckets` buckets
export function chooseInterval(spanMs: number, buckets: number): string {
  for (const [name, ms] of intervals) {
    if (Math.floor(spanMs / ms) + 1 <= buckets) return name;
  }
  return intervals.at(-1)![0];
}
