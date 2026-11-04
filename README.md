# CBM Log Viewer

A web interface for the log messages of the CBM online systems in OpenSearch,
in the style of the ALICE InfoLogger GUI: a table of messages coloured by
severity, filters per column, a live mode and a query mode.

It reads the indices of the log collection in flesnet,
`contrib/loggingstack`, and expects their fields (see `doc/logging.md` in
flesnet).

```
Browser ⇄ HTTP, WebSocket ⇄ server (Node.js) ⇄ OpenSearch
```

The repository has three npm workspaces:

| Directory | Content                                                     |
| --------- | ----------------------------------------------------------- |
| `shared/` | the fields and severities of the log messages, used by both |
| `server/` | the server: Fastify, queries OpenSearch as a read-only user |
| `web/`    | the frontend: React, built with Vite                        |

## API

| Request                 |                                                                            |
| ----------------------- | -------------------------------------------------------------------------- |
| `GET /api/status`       | whether OpenSearch is available                                            |
| `GET /api/fields`       | the fields of the messages                                                 |
| `POST /api/query`       | the newest `limit` messages that pass `filters`, the oldest first          |
| `POST /api/stats`       | the number of messages per severity and over time                          |
| `GET /api/values/FIELD` | the most frequent values of a keyword field, by default of the last 7 days |

The filters and the responses are defined in
[shared/src/query.ts](shared/src/query.ts), e.g.:

```json
{
  "filters": {
    "from": "now-1h",
    "severities": [13, 17, 21],
    "fields": {
      "host": { "match": ["node1*"] },
      "service": { "exclude": ["tsclient"] },
      "message": { "match": ["build timeout"] }
    }
  },
  "limit": 10000
}
```

Times are ISO timestamps or `now`, `now-<n><unit>` with the units `ms`, `s`,
`m`, `h`, `d` and `w`; the server resolves them once per request.

The server sorts the messages by `@timestamp`, `_index` and `_seq_no`, which
is unique as the log indices have one shard each. Numbers in `data` beyond
2^53 lose precision, as parsing them exactly makes queries several times
slower; `data_text` keeps them exactly.

## Configuration

The server reads its settings from the environment:

| Variable                | Default                  |                                   |
| ----------------------- | ------------------------ | --------------------------------- |
| `OPENSEARCH_URL`        | `https://localhost:9200` |                                   |
| `OPENSEARCH_USER`       | `logviewer`              |                                   |
| `OPENSEARCH_PASSWORD`   |                          | required                          |
| `OPENSEARCH_VERIFY_TLS` | `false`                  | `true` to check the certificate   |
| `LOGVIEWER_INDEX`       | `logs-flesnet-*`         | the indices to read               |
| `LOGVIEWER_HOST`        | `127.0.0.1`              | the address to listen on          |
| `LOGVIEWER_PORT`        | `5602`                   |                                   |
| `LOGVIEWER_WEB_ROOT`    |                          | the built frontend, served if set |

## Development

With Node.js 22:

```bash
npm install
npm run build
npm test
npm run lint

# with the tests against OpenSearch, here in a container without security
docker run -d --name logviewer-opensearch -p 127.0.0.1:9201:9200 \
  -e discovery.type=single-node -e DISABLE_SECURITY_PLUGIN=true \
  -e DISABLE_INSTALL_DEMO_CONFIG=true \
  docker.io/opensearchproject/opensearch:3.9.0
OPENSEARCH_TEST_URL=http://localhost:9201 npm test

# server and frontend with reloading, the frontend on http://localhost:5173
OPENSEARCH_PASSWORD=... npm run dev:server
npm run dev:web
```

For OpenSearch on the login node, forward its port:
`ssh -L 9200:localhost:9200 login`.

## Docker

```bash
docker build -t cbm-logviewer .
docker run --rm -p 127.0.0.1:5602:5602 -e OPENSEARCH_PASSWORD=... \
  -e OPENSEARCH_URL=https://opensearch:9200 cbm-logviewer
```

CI publishes the image of `main` as `ghcr.io/cbm-fles/cbm-logviewer:latest`.
