// The messages of the live mode on the WebSocket /api/live.

import type { LogMessage } from "./fields.js";
import type { Filters } from "./query.js";

// from the browser: start, or restart with other filters, or stop. The time
// range of the filters does not apply, live mode shows the messages that
// arrive from now on.
export type LiveRequest =
  { type: "start"; filters: Omit<Filters, "from" | "to"> } | { type: "stop" };

// to the browser
export type LiveEvent =
  | { type: "started" }
  // new messages, in the order of their timestamps; `dropped` is the number of
  // matching messages left out since the last event, as there were too many
  // or the browser did not keep up; `arrived` is the number of all messages
  // that arrived since the last event, whether they match or not
  | {
      type: "messages";
      messages: LogMessage[];
      dropped: number;
      arrived: number;
    }
  | { type: "error"; error: string };
