import { Client } from "@opensearch-project/opensearch";
import type { Config } from "./config.js";

export function createClient(config: Config): Client {
  return new Client({
    node: config.opensearchUrl,
    auth: {
      username: config.opensearchUser,
      password: config.opensearchPassword,
    },
    ssl: { rejectUnauthorized: config.opensearchVerifyTls },
    // the sort values of date_nanos fields are beyond 2^53
    enableLongNumeralSupport: true,
  });
}
