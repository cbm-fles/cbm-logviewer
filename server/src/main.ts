import { Client } from "@opensearch-project/opensearch";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";

const config = loadConfig();
const client = new Client({
  node: config.opensearchUrl,
  auth: {
    username: config.opensearchUser,
    password: config.opensearchPassword,
  },
  ssl: { rejectUnauthorized: config.opensearchVerifyTls },
});

const app = buildApp(config, client);
await app.listen({ host: config.host, port: config.port });
