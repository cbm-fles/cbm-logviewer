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

## Use

In **query mode**, the viewer shows the newest messages of a time range, up to
100,000, the newest at the bottom. In **live mode**, it first shows the newest
100,000 messages, then adds the ones that arrive, in the order of their
timestamps, and keeps the newest 100,000. It follows the newest while the table is scrolled to the end. A change
of the filters loads the newest messages for them again. Pause keeps the new
messages until Resume.

The buttons TRACE to FATAL choose the severities, TRACE and DEBUG are off at
first. Under each column header, a message can be required to match a filter
or to not match it (exclude); Enter applies them. A filter is a list of
patterns separated by commas, of which one must match, e.g. `node1*, node02`.
`*` and `?` are wildcards; `\*`, `\?` and `\\` stand for themselves. A pattern
in double quotes can contain commas, `""` stands for a quote in it. In Message
and Data, a pattern is a phrase, and wildcards apply to single words.

The toolbar shows how many filters of columns are active; Edit lists them all
beside the table, also those of hidden columns, with the syntax of patterns.
The status line shows how many messages match of all messages in the time
range, in live mode of all since the oldest one shown, which filters of
columns apply, and the number of messages shown per severity.

A click on a message shows all its fields beside the table; there, + and −
add a filter on a value. The arrow keys, Page Up/Down, Home and End move
through the messages, Escape closes it. A right click on a cell offers to
match or exclude its value, to clear the filter of its column, to copy the
value and to inspect the message. The URL has the view, so it can be shared
as a link. Download saves the messages, as JSON lines with all fields or as
CSV with the visible columns.

Columns shows and hides columns. A column moves by dragging its name onto
another column. Its width changes by dragging the edge of its header, and a
double click on the edge resets it; Message takes the remaining width until
its width is set. Reset columns restores them all. The browser keeps these
settings and whether times are in UTC.

## API

| Request                 |                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------ |
| `GET /api/status`       | whether OpenSearch is available                                                      |
| `GET /api/fields`       | the fields of the messages                                                           |
| `POST /api/query`       | the newest `limit` messages that pass `filters`, the oldest first                    |
| `POST /api/stats`       | the number of messages per severity and over time                                    |
| `GET /api/values/FIELD` | the most frequent values of a keyword field, by default of the last 7 days           |
| `GET /api/live`         | WebSocket: the messages as they arrive, see [shared/src/live.ts](shared/src/live.ts) |

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

In live mode, the browser sends `{"type": "start", "filters": {...}}` (without
a time range) or `{"type": "stop"}`, and gets the new messages about once a
second. The server follows the indices by `_seq_no`, the order in which
messages arrive, so it also shows messages that arrive late, e.g. from a node
whose Fluent Bit was buffering, each once. If there are more than 5000 new
messages in a second, or the browser does not keep up, the rest is dropped
and counted, so that the view stays current.

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

# the tests in a browser, after npm run build; Playwright starts the server
npx playwright install chromium
OPENSEARCH_TEST_URL=http://localhost:9201 npm run test:e2e

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

CI publishes the image of `main` as `ghcr.io/cbm-fles/cbm-logviewer:latest`,
and as `ghcr.io/cbm-fles/cbm-logviewer:COMMIT` with the full commit hash.
flesnet's `contrib/loggingstack` runs it next to OpenSearch.
