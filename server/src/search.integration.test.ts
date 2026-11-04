// Tests against a real OpenSearch, if OPENSEARCH_TEST_URL is set, e.g.
// http://localhost:9201 for a container without the security plugin.

import type { Client } from "@opensearch-project/opensearch";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { createClient } from "./client.js";
import { loadConfig } from "./config.js";
import { Search } from "./search.js";

const url = process.env.OPENSEARCH_TEST_URL;
const prefix = "logviewer-test";

// the mapping of flesnet's contrib/loggingstack/setup-opensearch
const mappings = {
  dynamic_templates: [
    {
      strings_as_keywords: {
        match_mapping_type: "string",
        mapping: { type: "keyword" },
      },
    },
  ],
  properties: {
    "@timestamp": { type: "date_nanos" },
    message: { type: "text", norms: false },
    message_template: { type: "keyword" },
    data: { type: "flat_object" },
    data_text: { type: "text", norms: false },
    severity_code: { type: "integer" },
    severity_text: { type: "keyword" },
    timeslice: { type: "long" },
    host: { type: "keyword" },
    service: { type: "keyword" },
    thread: { type: "keyword" },
    tid: { type: "long" },
    pid: { type: "long" },
    file_name: { type: "keyword" },
    line: { type: "integer" },
    function: { type: "keyword" },
    version: { type: "keyword" },
    log_file: { type: "keyword" },
  },
};

// 30 messages: 10 timestamps one hour apart, each with a status message in the
// oper index and a debug and a warning message in the debug and oper
// indices, so that messages share timestamps across indices.
function messages() {
  const docs: { index: string; doc: Record<string, unknown> }[] = [];
  for (let i = 0; i < 10; i++) {
    const ts = `2026-11-04T${10 + i}:00:00.000123456Z`;
    const base = {
      "@timestamp": ts,
      host: `node0${i % 3}`,
      service: i % 2 ? "tsbuilder" : "tsclient",
      pid: 1000 + i,
      timeslice: 17900000000 + i,
    };
    docs.push(
      {
        index: `${prefix}-oper`,
        doc: {
          ...base,
          severity_code: 9,
          severity_text: "INFO",
          message: `Status ${i}`,
        },
      },
      {
        index: `${prefix}-debug`,
        doc: {
          ...base,
          severity_code: 5,
          severity_text: "DEBUG",
          message: `Debug ${i}`,
        },
      },
      {
        index: `${prefix}-oper`,
        doc: {
          ...base,
          severity_code: 13,
          severity_text: "WARN",
          message: `Build timeout (after ${1000 + i} ms)`,
          message_template: "Build timeout (after {} ms)",
          data: { build_time_ms: 1000 + i },
          data_text: `build_time_ms=${1000 + i}`,
        },
      },
    );
  }
  return docs;
}

describe.skipIf(!url)("Search against OpenSearch", () => {
  let client: Client;
  let search: Search;

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
    for (const index of [`${prefix}-oper`, `${prefix}-debug`]) {
      await client.indices.create({
        index,
        body: {
          settings: { number_of_shards: 1, number_of_replicas: 0 },
          mappings,
        },
      });
    }
    await client.bulk({
      refresh: true,
      body: messages().flatMap(({ index, doc }) => [
        { create: { _index: index } },
        doc,
      ]),
    });
    // small pages, to test paging
    search = new Search(client, `${prefix}-*`, 7);
  });

  afterAll(async () => {
    await client?.indices.delete({
      index: `${prefix}-*`,
      ignore_unavailable: true,
    });
  });

  it("returns all messages, the oldest first, across pages", async () => {
    const res = await search.query({ filters: {}, limit: 1000 });
    expect(res.total).toBe(30);
    expect(res.messages).toHaveLength(30);
    expect(new Set(res.messages.map((m) => m.id)).size).toBe(30);
    const times = res.messages.map((m) => m["@timestamp"]);
    expect(times).toEqual([...times].sort());
    expect(times[0]).toBe("2026-11-04T10:00:00.000123456Z");
  });

  it("returns the newest messages up to the limit", async () => {
    const res = await search.query({ filters: {}, limit: 10 });
    expect(res.total).toBe(30);
    expect(res.messages).toHaveLength(10);
    expect(res.messages.at(-1)!["@timestamp"]).toBe(
      "2026-11-04T19:00:00.000123456Z",
    );
    expect(res.messages[0]!["@timestamp"]).toBe(
      "2026-11-04T16:00:00.000123456Z",
    );
  });

  it("filters by severity, field values and text", async () => {
    const warn = await search.query({
      filters: { severities: [13] },
      limit: 100,
    });
    expect(warn.total).toBe(10);

    const res = await search.query({
      filters: {
        severities: [9, 13],
        fields: {
          host: { match: ["node0*"], exclude: ["node00"] },
          message: { match: ["build timeout"] },
        },
      },
      limit: 100,
    });
    expect(res.messages.map((m) => m.host).sort()).toEqual([
      "node01",
      "node01",
      "node01",
      "node02",
      "node02",
      "node02",
    ]);
    expect(res.messages[0]!.data).toEqual({ build_time_ms: 1001 });
  });

  it("filters integer and data fields", async () => {
    const ts = await search.query({
      filters: { fields: { timeslice: { match: ["17900000004"] } } },
      limit: 100,
    });
    expect(ts.total).toBe(3);
    const data = await search.query({
      filters: { fields: { data: { match: ["build_time_ms=1007"] } } },
      limit: 100,
    });
    expect(data.messages.map((m) => m.message)).toEqual([
      "Build timeout (after 1007 ms)",
    ]);
  });

  it("counts messages by severity and time", async () => {
    const res = await search.stats({ filters: {}, buckets: 10 });
    expect(res.total).toBe(30);
    expect(res.by_severity).toEqual({ DEBUG: 10, INFO: 10, WARN: 10 });
    expect(res.histogram.interval).toBe("1h");
    expect(res.histogram.buckets).toHaveLength(10);
    expect(res.histogram.buckets[0]).toEqual({
      time: "2026-11-04T10:00:00.000Z",
      count: 3,
      by_severity: { DEBUG: 1, INFO: 1, WARN: 1 },
    });
  });

  it("covers the time range of the filters in the histogram", async () => {
    const res = await search.stats({
      filters: { from: "2026-11-04T06:00:00Z", to: "2026-11-04T12:00:00Z" },
      buckets: 7,
    });
    expect(res.total).toBe(9);
    expect(res.histogram.interval).toBe("1h");
    expect(res.histogram.buckets.map((b) => b.count)).toEqual([
      0, 0, 0, 0, 3, 3, 3,
    ]);
  });

  it("serves queries over HTTP", async () => {
    const config = loadConfig({
      OPENSEARCH_URL: url,
      OPENSEARCH_PASSWORD: "x",
      LOGVIEWER_INDEX: `${prefix}-*`,
    });
    const app = buildApp(config, client, { logger: false });
    const res = await app.inject({
      method: "POST",
      url: "/api/query",
      payload: { filters: { severities: [5] }, limit: 3 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ total: 10 });
    expect(res.json().messages).toHaveLength(3);
  });

  it("lists the values of a field", async () => {
    const res = await search.values("service", {});
    expect(res.values).toEqual([
      { value: "tsbuilder", count: 15 },
      { value: "tsclient", count: 15 },
    ]);
  });
});
