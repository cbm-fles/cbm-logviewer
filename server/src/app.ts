import fastifyStatic from "@fastify/static";
import type { Client } from "@opensearch-project/opensearch";
import Fastify, { type FastifyServerOptions } from "fastify";
import type { Config } from "./config.js";

export interface Status {
  opensearch: "ok" | "unavailable";
  cluster_status?: string;
  index: string;
}

export function buildApp(
  config: Config,
  client: Client,
  options: FastifyServerOptions = { logger: true },
) {
  const app = Fastify(options);

  app.get("/api/status", async (): Promise<Status> => {
    try {
      const { body } = await client.cluster.health({ timeout: "5s" });
      return {
        opensearch: "ok",
        cluster_status: body.status,
        index: config.index,
      };
    } catch (err) {
      app.log.warn({ err }, "OpenSearch is not available");
      return { opensearch: "unavailable", index: config.index };
    }
  });

  if (config.webRoot) {
    app.register(fastifyStatic, { root: config.webRoot });
  }

  return app;
}
