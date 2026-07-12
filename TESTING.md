# Testing guide

## Required gate

Run before commit and deploy:

```bash
npm test
```

Current coverage:

- `snapshot.json` and `build-info.json` describe the same Polka build;
- snapshot boots through `jsonspecs.compileSnapshot()`;
- all bundled `samples/*.json` execute through HTTP and match expected statuses/issues;
- `/health`;
- `/docs`;
- `/openapi.json`;
- `/v1/meta`;
- `/v1/samples`;
- no trace by default;
- `trace: "basic"` does not expose raw payload values;
- `trace: "verbose"` is rejected;
- malformed requests return 400;
- engine `ABORT` returns HTTP 500 with structured jsonspecs result;
- custom operator `inn10_valid` reads fields through `ctx.get()`.

## Manual local smoke

```bash
npm start
```

In another terminal:

```bash
curl -s http://127.0.0.1:3000/health
curl -s http://127.0.0.1:3000/v1/meta | jq '.project, .entrypoints[].id'
curl -s -X POST http://127.0.0.1:3000/v1/validate \
  -H 'Content-Type: application/json' \
  --data-binary @samples/checkout.error.json | jq '.status, .issues[].code'
```

Open:

```text
http://127.0.0.1:3000/docs
```

## Docker smoke

```bash
docker build -t polka-jsonspecs-demo .
docker run --rm -p 3000:3000 polka-jsonspecs-demo
```

Then run the manual smoke commands against `http://127.0.0.1:3000`.

## Deployment smoke

After Coolify deploy:

```bash
curl -s https://polka-demo.vladimirandreevich.ru/health
curl -s https://polka-demo.vladimirandreevich.ru/v1/meta | jq '.project.projectId'
curl -s -X POST https://polka-demo.vladimirandreevich.ru/v1/validate \
  -H 'Content-Type: application/json' \
  --data-binary @samples/checkout.ok.json | jq '.status'
```

Expected:

```text
health.ok = true
projectId = polka-checkout
status = OK
```

Also verify:

```text
https://polka-demo.vladimirandreevich.ru/docs
https://polka-demo.vladimirandreevich.ru/openapi.json
```

## Recommended additions

- Request-size limit test for the current `2mb` JSON limit.
- Explicit trace truncation test with low `TRACE_MAX_ENTRIES` in a subprocess.
- Boot failure tests for missing/invalid snapshot and incompatible `engine.minVersion`.
- CI Docker smoke with container healthcheck.
