import { defineConfig, devices } from "@playwright/test";

// Tests of the viewer in a browser, against the server and an OpenSearch at
// OPENSEARCH_TEST_URL, see README.md. Run `npm run build` first.

const port = 5612;

export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    timezoneId: "UTC",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "node server/dist/main.js",
    port,
    env: {
      OPENSEARCH_URL:
        process.env.OPENSEARCH_TEST_URL ?? "http://localhost:9201",
      OPENSEARCH_PASSWORD: "x",
      LOGVIEWER_INDEX: "logviewer-e2e-*",
      LOGVIEWER_PORT: String(port),
      LOGVIEWER_WEB_ROOT: "web/dist",
    },
  },
});
