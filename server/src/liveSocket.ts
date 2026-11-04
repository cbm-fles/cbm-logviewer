// A WebSocket of the live mode: polls OpenSearch for new messages while it is
// started and sends them. It never waits for a slow browser: if the browser
// does not keep up, messages are dropped and counted.

import type { LiveEvent, LiveRequest } from "@cbm-logviewer/shared";
import type { WebSocket } from "ws";
import type { Client } from "@opensearch-project/opensearch";
import { Ajv } from "ajv";
import type { FastifyBaseLogger } from "fastify";
import { type LiveOptions, LiveTail } from "./live.js";
import { liveRequestSchema } from "./schemas.js";

const validate = new Ajv().compile<LiveRequest>(liveRequestSchema);

export interface LiveSocketOptions extends LiveOptions {
  intervalMs?: number;
  // the amount of unsent data above which messages are dropped
  maxBufferedBytes?: number;
}

export function serveLive(
  socket: WebSocket,
  client: Client,
  index: string,
  log: FastifyBaseLogger,
  options: LiveSocketOptions = {},
): void {
  const intervalMs = options.intervalMs ?? 1000;
  const maxBufferedBytes = options.maxBufferedBytes ?? 16 << 20;
  // a new start or a stop ends the polls of the previous start
  let generation = 0;
  let timer: NodeJS.Timeout | undefined;
  let dropped = 0;
  let arrived = 0;

  const send = (event: LiveEvent) => socket.send(JSON.stringify(event));
  const errorMessage = (err: unknown) =>
    err instanceof Error ? err.message : String(err);

  function stop() {
    generation++;
    clearTimeout(timer);
  }

  async function poll(tail: LiveTail, gen: number) {
    try {
      const res = await tail.poll();
      if (gen !== generation) return;
      dropped += res.dropped;
      arrived += res.arrived;
      if (socket.bufferedAmount > maxBufferedBytes) {
        dropped += res.messages.length;
      } else if (res.messages.length > 0 || dropped > 0 || arrived > 0) {
        send({ type: "messages", messages: res.messages, dropped, arrived });
        dropped = 0;
        arrived = 0;
      }
    } catch (err) {
      if (gen !== generation) return;
      log.warn({ err }, "live poll failed");
      send({ type: "error", error: "OpenSearch request failed" });
    }
    if (gen === generation) {
      timer = setTimeout(() => void poll(tail, gen), intervalMs);
    }
  }

  async function start(filters: LiveRequest & { type: "start" }) {
    stop();
    const gen = generation;
    dropped = 0;
    arrived = 0;
    try {
      const tail = new LiveTail(client, index, filters.filters, options);
      await tail.start();
      if (gen !== generation) return;
      send({ type: "started" });
      timer = setTimeout(() => void poll(tail, gen), intervalMs);
    } catch (err) {
      if (gen !== generation) return;
      log.warn({ err }, "live start failed");
      send({ type: "error", error: errorMessage(err) });
    }
  }

  socket.on("message", (data) => {
    let request: unknown;
    try {
      request = JSON.parse(data.toString());
    } catch {
      send({ type: "error", error: "invalid JSON" });
      return;
    }
    if (!validate(request)) {
      send({ type: "error", error: "invalid request" });
      return;
    }
    if (request.type === "start") void start(request);
    else stop();
  });
  socket.on("close", stop);
}
