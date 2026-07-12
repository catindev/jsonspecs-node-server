# Testing guide

## Current gates

Run before deployment:

```bash
npm test
```

What it covers today:

- `snapshot.json` and `build-info.json` consistency;
- boot through `jsonspecs.compileSnapshot()`;
- `/health`;
- `/v1/validate`;
- absence of trace by default;
- ruleset provenance in HTTP responses;
- engine `ABORT` surfaced as HTTP 500;
- rejection of malformed requests;
- rejection of HTTP `trace: "verbose"`;
- basic trace without raw payload values;
- custom identifier operators using `ctx.get()`.

## Recommended additions

### P1

- Boot failure tests for:
  - missing snapshot file;
  - invalid JSON snapshot;
  - empty `artifacts`;
  - snapshot hash mismatch;
  - incompatible `engine.minVersion`.
- HTTP request-size test for the current `2mb` JSON body limit.
- Docker smoke test:
  - build image;
  - start container;
  - check `/health`;
  - run one `/v1/validate` request.
- Registry materialization test that `npm run deps:registry` installs the exact `config.jsonspecsVersion`.

### P2

- Trace response limit tests once a trace cap is introduced:
  - max entries;
  - max serialized response size;
  - explicit truncation marker.
- Negative tests for non-object `payload`, missing `context.pipelineId`, and malformed JSON body.
- Public endpoint hardening tests if auth/rate-limit middleware is added.
