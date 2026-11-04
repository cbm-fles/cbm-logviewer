// The configuration of the server, from the environment.

export interface Config {
  host: string;
  port: number;
  opensearchUrl: string;
  opensearchUser: string;
  opensearchPassword: string;
  // OpenSearch uses a self-signed certificate in contrib/loggingstack
  opensearchVerifyTls: boolean;
  index: string;
  // the built frontend, served if set
  webRoot: string | undefined;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const password = env.OPENSEARCH_PASSWORD;
  if (!password) throw new Error("OPENSEARCH_PASSWORD is not set");
  return {
    host: env.LOGVIEWER_HOST ?? "127.0.0.1",
    port: Number(env.LOGVIEWER_PORT ?? 5602),
    opensearchUrl: env.OPENSEARCH_URL ?? "https://localhost:9200",
    opensearchUser: env.OPENSEARCH_USER ?? "logviewer",
    opensearchPassword: password,
    opensearchVerifyTls: env.OPENSEARCH_VERIFY_TLS === "true",
    index: env.LOGVIEWER_INDEX ?? "logs-flesnet-*",
    webRoot: env.LOGVIEWER_WEB_ROOT || undefined,
  };
}
