// The messages as a file to save.

import type { LogMessage } from "@cbm-logviewer/shared";

export function toJson(messages: LogMessage[]): string {
  return messages.map((m) => JSON.stringify(m)).join("\n") + "\n";
}

function csvField(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toCsv(
  messages: LogMessage[],
  columns: { id: string; label: string }[],
  text: (m: LogMessage, field: string) => string,
): string {
  const lines = [columns.map((c) => csvField(c.label)).join(",")];
  for (const m of messages) {
    lines.push(columns.map((c) => csvField(text(m, c.id))).join(","));
  }
  return lines.join("\r\n") + "\r\n";
}

export function save(content: string, type: string, name: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// e.g. "logs-2026-11-04T10-25-37Z.json"
export function fileName(format: string, now = new Date()): string {
  const time = now
    .toISOString()
    .replace(/\.\d+Z$/, "Z")
    .replace(/:/g, "-");
  return `logs-${time}.${format}`;
}
