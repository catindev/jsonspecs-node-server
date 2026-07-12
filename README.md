# Polka jsonspecs Demo Server

Snapshot-only HTTP demo service for the `polka-checkout` jsonspecs rules package.

The server boots a prebuilt `jsonspecs` snapshot, exposes validation over HTTP, and serves Swagger UI for interactive testing.

## What is included

- `snapshot.json` — built from `polka-checkout` rules.
- `build-info.json` — deterministic build metadata.
- `samples/*.json` — executable request examples used by tests and Swagger examples.
- `lib/operators/polka-operators.js` — Polka custom operator pack.
- `POST /v1/validate` — validation endpoint.
- `GET /docs` — Swagger UI.
- `GET /openapi.json` — OpenAPI 3.0 spec.
- `GET /v1/meta` — ruleset metadata, entrypoints, samples.
- `GET /v1/samples` and `GET /v1/samples/:name` — bundled examples.

The service does not compile source rules at runtime. It loads only the snapshot and operator pack.

## Ruleset

Current embedded ruleset:

```text
projectId:        polka-checkout
projectTitle:     Полка — проверки
rulesetVersion:   1.1.0
jsonspecsVersion: 2.1.1
artifactCount:    91
```

Entrypoints:

```text
entrypoints.checkout.validation
entrypoints.checkout.b2b
entrypoints.customer.profile
entrypoints.return.request
```

## Local run

```bash
npm install
npm start
```

Open:

```text
http://127.0.0.1:3000/docs
```

Healthcheck:

```bash
curl http://127.0.0.1:3000/health
```

## Validate request

```bash
curl -s -X POST http://127.0.0.1:3000/v1/validate \
  -H 'Content-Type: application/json' \
  --data-binary @samples/checkout.ok.json | jq
```

The bundled sample files include `expect`; `/v1/validate` ignores that field and uses only `context`, `payload`, and optional `trace`.

Minimal request shape:

```json
{
  "context": {
    "pipelineId": "entrypoints.checkout.validation",
    "currentDate": "2026-07-12",
    "minOrderAmount": 500,
    "cashOnDeliveryLimit": 15000
  },
  "payload": {
    "customer": {
      "name": "Иван Петров",
      "phone": "+79161234567",
      "email": "ivan@example.com"
    },
    "delivery": {
      "type": "COURIER",
      "regionCode": "77",
      "address": "Москва, ул. Полковая, д. 3, кв. 12"
    },
    "payment": { "method": "CARD" },
    "order": {
      "amount": 4250,
      "currency": "RUB",
      "items": [
        { "sku": "BKS-0412", "qty": 2, "price": 1200 }
      ]
    }
  }
}
```

`context.pipelineId` is required. `payload`, if provided, must be a JSON object.

## Trace policy

HTTP API allows only:

- omitted / `false` — no trace;
- `"basic"` — structural trace without raw payload values.

`"verbose"` is rejected because it may expose payload data.

Trace is capped by `TRACE_MAX_ENTRIES` to prevent oversized public responses. If the trace is truncated, the response includes:

```json
{
  "traceTruncated": true,
  "traceLimit": 500,
  "traceOriginalLength": 731
}
```

## HTTP semantics

- `200` — validation request was processed. Business status is in JSON body: `OK`, `OK_WITH_WARNINGS`, `ERROR`, or `EXCEPTION`.
- `400` — invalid JSON or invalid HTTP request contract.
- `500` — engine `ABORT` or server execution failure.

`ABORT` is returned as structured jsonspecs runtime result with `status: "ABORT"` and `control: "STOP"`.

## Metadata endpoints

```bash
curl -s http://127.0.0.1:3000/v1/meta | jq
curl -s http://127.0.0.1:3000/v1/samples | jq
curl -s http://127.0.0.1:3000/v1/samples/checkout.ok | jq
```

## Docker

```bash
docker build -t polka-jsonspecs-demo .
docker run --rm -p 3000:3000 polka-jsonspecs-demo
```

The Dockerfile materializes the pinned `jsonspecs` engine from npm during build.

## Coolify

Recommended Coolify settings:

- source: GitHub repository;
- branch: `main`;
- build pack: Dockerfile;
- exposed port: `3000`;
- healthcheck path: `/health`;
- domain: `polka-demo.vladimirandreevich.ru`;
- environment:

```text
PORT=3000
SNAPSHOT_PATH=/workspace/jsonspecs-node-server/snapshot.json
BUILD_INFO_PATH=/workspace/jsonspecs-node-server/build-info.json
SAMPLES_PATH=/workspace/jsonspecs-node-server/samples
TRACE_MAX_ENTRIES=500
```

After deploy:

```bash
curl https://polka-demo.vladimirandreevich.ru/health
open https://polka-demo.vladimirandreevich.ru/docs
```

## Updating embedded Polka rules

From `polka-checkout`:

```bash
cd /Users/vladimirtitskiy/Dev/jsonspecs-test/polka-checkout
npx jsonspecs-cli@2.1.2 build
```

Then copy:

```bash
cp dist/snapshot.json /Users/vladimirtitskiy/Dev/jsonspecs-node-server/snapshot.json
cp dist/build-info.json /Users/vladimirtitskiy/Dev/jsonspecs-node-server/build-info.json
cp operators/node/index.js /Users/vladimirtitskiy/Dev/jsonspecs-node-server/lib/operators/polka-operators.js
rsync -a --delete samples/ /Users/vladimirtitskiy/Dev/jsonspecs-node-server/samples/
```

Run:

```bash
cd /Users/vladimirtitskiy/Dev/jsonspecs-node-server
npm test
```

## Tests

```bash
npm test
```

Tests cover:

- snapshot/build-info consistency;
- boot through `jsonspecs.compileSnapshot()`;
- all bundled Polka samples;
- `/health`;
- `/docs`;
- `/openapi.json`;
- `/v1/meta`;
- `/v1/samples`;
- default no-trace behavior;
- `basic` trace redaction;
- `verbose` trace rejection;
- engine `ABORT` as HTTP 500;
- malformed request rejection;
- custom operator `inn10_valid`.
