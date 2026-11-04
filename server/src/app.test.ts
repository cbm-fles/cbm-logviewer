import type { Client } from "@opensearch-project/opensearch";
import { describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";

const config = loadConfig({ OPENSEARCH_PASSWORD: "x" });

function fakeClient(health: () => Promise<unknown>): Client {
  return { cluster: { health } } as unknown as Client;
}

describe("GET /api/status", () => {
  it("reports the cluster status", async () => {
    const app = buildApp(
      config,
      fakeClient(async () => ({ body: { status: "yellow" } })),
      { logger: false },
    );
    const res = await app.inject({ method: "GET", url: "/api/status" });
    expect(res.json()).toEqual({
      opensearch: "ok",
      cluster_status: "yellow",
      index: "logs-flesnet-*",
    });
  });

  it("reports OpenSearch as unavailable", async () => {
    const app = buildApp(
      config,
      fakeClient(async () => {
        throw new Error("connection refused");
      }),
      { logger: false },
    );
    const res = await app.inject({ method: "GET", url: "/api/status" });
    expect(res.json()).toMatchObject({ opensearch: "unavailable" });
  });
});

describe("request validation", () => {
  const app = buildApp(
    config,
    fakeClient(async () => ({})),
    { logger: false },
  );

  it.each([
    ["no limit", { filters: {} }],
    ["a limit too large", { filters: {}, limit: 1000000 }],
    [
      "an unknown field",
      { filters: { fields: { nofield: { match: ["x"] } } }, limit: 10 },
    ],
    ["an unknown severity", { filters: { severities: [12] }, limit: 10 }],
    [
      "a non-integer pid",
      { filters: { fields: { pid: { match: ["12*"] } } }, limit: 10 },
    ],
  ])("rejects a query with %s", async (_, payload) => {
    const res = await app.inject({
      method: "POST",
      url: "/api/query",
      payload,
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects values of a non-keyword field", async () => {
    const res = await app.inject({ method: "GET", url: "/api/values/message" });
    expect(res.statusCode).toBe(400);
  });
});

describe("compression", () => {
  it("compresses large responses", async () => {
    const app = buildApp(
      config,
      fakeClient(async () => ({})),
      {
        logger: false,
      },
    );
    const res = await app.inject({
      method: "GET",
      url: "/api/fields",
      headers: { "accept-encoding": "gzip, br" },
    });
    expect(res.headers["content-encoding"]).toBe("gzip");
  });
});
