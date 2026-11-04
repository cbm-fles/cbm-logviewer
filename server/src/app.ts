import {
  type CountRequest,
  type CountResponse,
  type Filters,
  type QueryRequest,
  type StatsRequest,
  fields,
} from "@cbm-logviewer/shared";
import fastifyCompress from "@fastify/compress";
import fastifyStatic from "@fastify/static";
import fastifyWebsocket from "@fastify/websocket";
import type { Client } from "@opensearch-project/opensearch";
import Fastify, { type FastifyError, type FastifyServerOptions } from "fastify";
import type { Config } from "./config.js";
import { FilterError } from "./dsl.js";
import { type LiveSocketOptions, serveLive } from "./liveSocket.js";
import {
  countBodySchema,
  queryBodySchema,
  statsBodySchema,
} from "./schemas.js";
import { Search } from "./search.js";

export interface Status {
  opensearch: "ok" | "unavailable";
  cluster_status?: string;
  index: string;
}

const keywordFields = fields
  .filter((f) => f.type === "keyword")
  .map((f) => f.name);

export function buildApp(
  config: Config,
  client: Client,
  options: FastifyServerOptions = { logger: true },
  liveOptions: LiveSocketOptions = {},
) {
  // reject unknown properties instead of dropping them
  const app = Fastify({
    ...options,
    ajv: { customOptions: { removeAdditional: false } },
  });
  const search = new Search(client, config.index);

  // a query returns up to some 30 MB of JSON, which gzip reduces to a seventh;
  // level 1 is much faster than the default and compresses almost as well
  app.register(fastifyCompress, {
    encodings: ["gzip"],
    zlibOptions: { level: 1 },
  });

  app.setErrorHandler((err: FastifyError, req, reply) => {
    if (err instanceof FilterError) {
      return reply.code(400).send({ error: err.message });
    }
    if (err.validation) {
      return reply.code(400).send({ error: err.message });
    }
    req.log.error({ err }, "request failed");
    return reply.code(502).send({ error: "OpenSearch request failed" });
  });

  app.register(fastifyWebsocket);

  // in a plugin, as the hooks of compression apply only to the routes that
  // are registered after it
  app.register(async (api) => {
    api.get("/api/status", async (): Promise<Status> => {
      try {
        const { body } = await client.cluster.health({ timeout: "5s" });
        return {
          opensearch: "ok",
          cluster_status: body.status,
          index: config.index,
        };
      } catch (err) {
        api.log.warn({ err }, "OpenSearch is not available");
        return { opensearch: "unavailable", index: config.index };
      }
    });

    api.get("/api/fields", async () => fields);

    api.get("/api/live", { websocket: true }, (socket, req) =>
      serveLive(socket, client, config.index, req.log, liveOptions),
    );

    api.post<{ Body: QueryRequest }>(
      "/api/query",
      { schema: { body: queryBodySchema } },
      async (req) => search.query(req.body),
    );

    api.post<{ Body: CountRequest }>(
      "/api/count",
      { schema: { body: countBodySchema } },
      async (req): Promise<CountResponse> => ({
        count: await search.count(req.body.filters),
      }),
    );

    api.post<{ Body: StatsRequest }>(
      "/api/stats",
      { schema: { body: statsBodySchema } },
      async (req) => search.stats(req.body),
    );

    api.get<{ Params: { field: string }; Querystring: Filters }>(
      "/api/values/:field",
      {
        schema: {
          params: {
            type: "object",
            properties: { field: { enum: keywordFields } },
          },
          querystring: {
            type: "object",
            additionalProperties: false,
            properties: {
              from: { type: "string", maxLength: 100 },
              to: { type: "string", maxLength: 100 },
            },
          },
        },
      },
      async (req) =>
        search.values(req.params.field, {
          from: req.query.from ?? "now-7d",
          ...(req.query.to !== undefined && { to: req.query.to }),
        }),
    );
  });

  if (config.webRoot) {
    app.register(fastifyStatic, { root: config.webRoot });
  }

  return app;
}
