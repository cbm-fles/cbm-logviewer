// Formatting of message fields for the table.

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

// "2026-11-04 10:25:37.247123", in UTC or local time, with the microseconds of
// the timestamp, which Date does not keep
export function formatTime(iso: string, utc: boolean): string {
  const fraction = /\.(\d+)Z$/.exec(iso)?.[1] ?? "";
  const d = new Date(iso.replace(/\.\d+Z$/, "Z"));
  if (Number.isNaN(d.getTime())) return iso;
  const [y, mo, day, h, mi, s] = utc
    ? [
        d.getUTCFullYear(),
        d.getUTCMonth() + 1,
        d.getUTCDate(),
        d.getUTCHours(),
        d.getUTCMinutes(),
        d.getUTCSeconds(),
      ]
    : [
        d.getFullYear(),
        d.getMonth() + 1,
        d.getDate(),
        d.getHours(),
        d.getMinutes(),
        d.getSeconds(),
      ];
  return (
    `${y}-${pad(mo)}-${pad(day)} ${pad(h)}:${pad(mi)}:${pad(s)}.` +
    fraction.padEnd(6, "0").slice(0, 6)
  );
}

export function formatValue(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

// the offset of local time, e.g. "UTC+1"
export function localZone(date = new Date()): string {
  const minutes = -date.getTimezoneOffset();
  if (minutes === 0) return "UTC";
  const sign = minutes > 0 ? "+" : "-";
  const h = Math.floor(Math.abs(minutes) / 60);
  const m = Math.abs(minutes) % 60;
  return `UTC${sign}${h}${m ? `:${pad(m)}` : ""}`;
}
