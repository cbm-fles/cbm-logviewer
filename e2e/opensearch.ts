// The test data of the browser tests in OpenSearch.

import { Client } from "@opensearch-project/opensearch";
import { createLogIndex } from "../server/src/opensearch.testing.js";

export const index = "logviewer-e2e-oper";

export const client = new Client({
  node: process.env.OPENSEARCH_TEST_URL ?? "http://localhost:9201",
});

export function message(
  text: string,
  severity: [number, string],
  ago: number,
  instance?: string,
) {
  return {
    "@timestamp": new Date(Date.now() - ago).toISOString(),
    host: `node0${text.length % 3}`,
    service: "tsclient",
    ...(instance !== undefined && { instance }),
    severity_code: severity[0],
    severity_text: severity[1],
    message: text,
  };
}

export async function write(...docs: object[]) {
  await client.bulk({
    refresh: true,
    body: docs.flatMap((doc) => [{ create: { _index: index } }, doc]),
  });
}

export async function reset() {
  await client.indices.delete({
    index: "logviewer-e2e-*",
    ignore_unavailable: true,
  });
  await createLogIndex(client, index);
}
