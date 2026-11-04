// The requests to the server.

import type {
  CountResponse,
  Filters,
  LiveEvent,
  LiveRequest,
  QueryRequest,
  QueryResponse,
} from "@cbm-logviewer/shared";

export async function query(
  req: QueryRequest,
  signal?: AbortSignal,
): Promise<QueryResponse> {
  const res = await fetch("/api/query", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(req),
    ...(signal && { signal }),
  });
  const body = (await res.json()) as QueryResponse | { error: string };
  if ("error" in body) throw new Error(body.error);
  return body;
}

export async function count(
  filters: Filters,
  signal?: AbortSignal,
): Promise<number> {
  const res = await fetch("/api/count", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ filters }),
    ...(signal && { signal }),
  });
  const body = (await res.json()) as CountResponse | { error: string };
  if ("error" in body) throw new Error(body.error);
  return body.count;
}

export type LiveState = "connecting" | "live" | "closed";

// A WebSocket of the live mode that reconnects after it was closed, and then
// starts again with the last filters.
export class LiveConnection {
  private socket: WebSocket | undefined;
  private request: LiveRequest | undefined;
  private retryMs = 1000;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private closed = false;

  constructor(
    private readonly onEvent: (event: LiveEvent) => void,
    private readonly onState: (state: LiveState) => void,
  ) {
    this.connect();
  }

  send(request: LiveRequest) {
    this.request = request;
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(request));
    }
  }

  close() {
    this.closed = true;
    clearTimeout(this.timer);
    this.socket?.close();
  }

  private connect() {
    const scheme = location.protocol === "https:" ? "wss" : "ws";
    const socket = new WebSocket(`${scheme}://${location.host}/api/live`);
    this.socket = socket;
    this.onState("connecting");
    socket.onopen = () => {
      this.retryMs = 1000;
      if (this.request) socket.send(JSON.stringify(this.request));
    };
    socket.onmessage = (e) => {
      const event = JSON.parse(e.data as string) as LiveEvent;
      if (event.type === "started") this.onState("live");
      this.onEvent(event);
    };
    socket.onclose = () => {
      if (this.closed) return;
      this.onState("closed");
      this.timer = setTimeout(() => this.connect(), this.retryMs);
      this.retryMs = Math.min(this.retryMs * 2, 30000);
    };
  }
}
