import { buildApp } from "./app.js";
import { createClient } from "./client.js";
import { loadConfig } from "./config.js";

const config = loadConfig();
const app = buildApp(config, createClient(config));
await app.listen({ host: config.host, port: config.port });
