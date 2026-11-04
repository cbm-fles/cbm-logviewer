// Tests of the live mode against a real OpenSearch, if OPENSEARCH_TEST_URL is
// set, see search.integration.test.ts.

import type { LiveEvent } from "@cbm-logviewer/shared";
import type { Client } from "@opensearch-project/opensearch";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { WebSocket } from "ws";
import { buildApp } from "./app.js";
import { createClient } from "./client.js";
import { loadConfig } from "./config.js";
import { LiveTail } from "./live.js";
import { createLogIndex } from "./opensearch.testing.js";

const url = process.env.OPENSEARCH_TEST_URL;
const prefix = "logviewer-livetest";

let counter = 0;

function message(text: string, severity = 9, time = new Date()) {
  return {
    "@timestamp": time.toISOString(),
    host: "node01",
    service: "tsclient",
    severity_code: severity,
    severity_text: severity === 13 ? "WARN" : "INFO",
    message: text,
  };
}

describe.skipIf(!url)("live mode against OpenSearch", () => {
  let client: Client;

  // a set of indices of its own for each test
  async function indices(...names: string[]) {
    const pattern = `${prefix}-${++counter}`;
    for (const name of names)
      await createLogIndex(client, `${pattern}-${name}`);
    return pattern;
  }

  async function write(index: string, ...docs: object[]) {
    await client.bulk({
      refresh: true,
      body: docs.flatMap((doc) => [{ create: { _index: index } }, doc]),
    });
  }

  const texts = (messages: { message: string }[]) =>
    messages.map((m) => m.message);

  beforeAll(async () => {
    const config = loadConfig({
      OPENSEARCH_URL: url,
      OPENSEARCH_PASSWORD: "x",
    });
    client = createClient(config);
    await client.indices.delete({
      index: `${prefix}-*`,
      ignore_unavailable: true,
    });
  });

  afterAll(async () => {
    await client?.indices.delete({
      index: `${prefix}-*`,
      ignore_unavailable: true,
    });
  });

  it("returns the messages that arrive after the start, once", async () => {
    const p = await indices("oper");
    await write(`${p}-oper`, message("before"));
    const tail = new LiveTail(client, `${p}-*`, {});
    await tail.start();
    expect(await tail.poll()).toEqual({ messages: [], dropped: 0 });

    const t = Date.now();
    await write(
      `${p}-oper`,
      message("second", 9, new Date(t + 1)),
      message("first", 9, new Date(t)),
    );
    const res = await tail.poll();
    expect(texts(res.messages)).toEqual(["first", "second"]);
    expect(res.dropped).toBe(0);
    expect(await tail.poll()).toEqual({ messages: [], dropped: 0 });
  });

  it("returns messages that arrive late", async () => {
    const p = await indices("oper");
    const tail = new LiveTail(client, `${p}-*`, {});
    await tail.start();
    await write(`${p}-oper`, message("now"));
    expect(texts((await tail.poll()).messages)).toEqual(["now"]);
    await write(
      `${p}-oper`,
      message("an hour ago", 9, new Date(Date.now() - 3600000)),
    );
    expect(texts((await tail.poll()).messages)).toEqual(["an hour ago"]);
  });

  it("applies the filters", async () => {
    const p = await indices("oper");
    const tail = new LiveTail(client, `${p}-*`, { severities: [13] });
    await tail.start();
    await write(
      `${p}-oper`,
      message("status"),
      message("warning", 13),
      message("status"),
    );
    expect(texts((await tail.poll()).messages)).toEqual(["warning"]);
    await write(`${p}-oper`, message("status"), message("another warning", 13));
    expect(texts((await tail.poll()).messages)).toEqual(["another warning"]);
  });

  it("follows indices created after the start", async () => {
    const p = await indices("oper");
    const tail = new LiveTail(client, `${p}-*`, {});
    await tail.start();
    await createLogIndex(client, `${p}-debug`);
    await write(`${p}-debug`, message("in the new index"));
    await write(`${p}-oper`, message("in the old index"));
    expect(texts((await tail.poll()).messages).sort()).toEqual([
      "in the new index",
      "in the old index",
    ]);
    expect((await tail.poll()).messages).toEqual([]);
  });

  it("passes over a gap that is not filled", async () => {
    const p = await indices("oper");
    const index = `${p}-oper`;
    const tail = new LiveTail(client, `${p}-*`, {}, { gapTimeoutMs: 1000 });
    await tail.start();
    // a write that is deleted leaves a gap in _seq_no
    const { body } = await client.index({
      index,
      body: message("deleted"),
      refresh: true,
    });
    await client.delete({ index, id: body._id, refresh: true });
    await write(index, message("after the gap"));

    const t = Date.now();
    expect(texts((await tail.poll(t)).messages)).toEqual(["after the gap"]);
    // the checkpoint waits for the gap, but nothing is sent twice
    expect((await tail.poll(t + 500)).messages).toEqual([]);
    expect((await tail.poll(t + 1500)).messages).toEqual([]);
    await write(index, message("later"));
    expect(texts((await tail.poll(t + 2000)).messages)).toEqual(["later"]);
  });

  it("drops and counts the messages beyond the maximum", async () => {
    const p = await indices("oper");
    const tail = new LiveTail(client, `${p}-*`, {}, { maxMessages: 2 });
    await tail.start();
    await write(`${p}-oper`, ...[1, 2, 3, 4, 5].map((i) => message(`m${i}`)));
    const res = await tail.poll();
    expect(res.messages).toHaveLength(2);
    expect(res.dropped).toBe(3);
    expect(await tail.poll()).toEqual({ messages: [], dropped: 0 });
  });

  describe("over the WebSocket", () => {
    async function connect(p: string) {
      const config = loadConfig({
        OPENSEARCH_URL: url,
        OPENSEARCH_PASSWORD: "x",
        LOGVIEWER_INDEX: `${p}-*`,
      });
      const app = buildApp(
        config,
        client,
        { logger: false },
        { intervalMs: 50 },
      );
      await app.ready();
      const ws = await app.injectWS("/api/live");
      const events: LiveEvent[] = [];
      ws.on("message", (data) => events.push(JSON.parse(data.toString())));
      return { app, ws, events };
    }

    async function until(events: LiveEvent[], type: LiveEvent["type"]) {
      for (let i = 0; i < 100; i++) {
        const e = events.find((e) => e.type === type);
        if (e) return e;
        await new Promise((r) => setTimeout(r, 20));
      }
      throw new Error(`no ${type} event`);
    }

    const send = (ws: WebSocket, request: object) =>
      ws.send(JSON.stringify(request));

    it("sends new messages after a start", async () => {
      const p = await indices("oper");
      const { app, ws, events } = await connect(p);
      send(ws, { type: "start", filters: { severities: [13] } });
      await until(events, "started");
      await write(`${p}-oper`, message("status"), message("warning", 13));
      const e = await until(events, "messages");
      expect(e.type === "messages" && texts(e.messages)).toEqual(["warning"]);
      ws.terminate();
      await app.close();
    });

    it("rejects invalid requests", async () => {
      const p = await indices("oper");
      const { app, ws, events } = await connect(p);
      send(ws, { type: "start", filters: { from: "now-1h" } });
      expect(await until(events, "error")).toEqual({
        type: "error",
        error: "invalid request",
      });
      ws.terminate();
      await app.close();
    });
  });
});
