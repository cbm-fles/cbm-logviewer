// Helpers for the tests against OpenSearch.

import type { Client } from "@opensearch-project/opensearch";

// the mapping of flesnet's contrib/loggingstack/setup-opensearch
export const mappings = {
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
    instance: { type: "keyword" },
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

export async function createLogIndex(client: Client, index: string) {
  await client.indices.create({
    index,
    body: {
      settings: { number_of_shards: 1, number_of_replicas: 0 },
      mappings,
    },
  });
}
