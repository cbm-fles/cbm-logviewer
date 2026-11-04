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
