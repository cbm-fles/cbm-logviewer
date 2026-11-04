import type { LogMessage } from "@cbm-logviewer/shared";

const time = (m: LogMessage) => m["@timestamp"];

// Merges messages sorted by time into others, keeping the newest `limit`.
// New messages are mostly at or near the end, so only the tail is merged.
export function mergeNewest(
  messages: LogMessage[],
  added: LogMessage[],
  limit: number,
): LogMessage[] {
  if (added.length === 0) return messages;
  // the first position whose time is after the first added message
  let lo = 0;
  let hi = messages.length;
  const first = time(added[0]!);
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (time(messages[mid]!) <= first) lo = mid + 1;
    else hi = mid;
  }
  const tail = messages.slice(lo);
  const merged: LogMessage[] = messages.slice(0, lo);
  let i = 0;
  let j = 0;
  while (i < tail.length || j < added.length) {
    if (
      j >= added.length ||
      (i < tail.length && time(tail[i]!) <= time(added[j]!))
    ) {
      merged.push(tail[i++]!);
    } else {
      merged.push(added[j++]!);
    }
  }
  return merged.length > limit ? merged.slice(merged.length - limit) : merged;
}
