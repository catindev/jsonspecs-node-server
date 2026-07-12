const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const buildInfo = require("../build-info.json");
const snapshot = require("../snapshot.json");
const validInn = require("../lib/operators/check/valid_inn");
const validOgrn = require("../lib/operators/check/valid_ogrn");
const { bootstrap, createApp } = require("../server");

const SNAPSHOT_PATH = path.join(__dirname, "..", "snapshot.json");
const PIPELINE_ID = "entrypoints.fl_resident.full_validation";

async function listen(t) {
  const runtime = bootstrap(SNAPSHOT_PATH);
  const server = createApp(runtime).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => server.close());
  return `http://127.0.0.1:${server.address().port}`;
}

function requestBody(overrides = {}) {
  return {
    context: {
      pipelineId: PIPELINE_ID,
      currentDate: "2026-03-29",
    },
    payload: {
      beneficiary: { type: "FL_RESIDENT" },
    },
    ...overrides,
  };
}

async function post(base, body) {
  return fetch(`${base}/v1/validate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

test("snapshot and build-info describe the same build", () => {
  assert.deepEqual(Object.keys(snapshot).sort(), ["artifacts", "engine", "format", "formatVersion", "meta", "sourceHash"]);
  assert.equal(buildInfo.jsonspecsVersion, snapshot.engine.minVersion);
  assert.equal(buildInfo.snapshotFormat, snapshot.format);
  assert.equal(buildInfo.snapshotFormatVersion, snapshot.formatVersion);
  assert.equal(buildInfo.sourceHash, snapshot.sourceHash);
  assert.equal(buildInfo.artifactCount, snapshot.artifacts.length);
  assert.equal(buildInfo.projectId, snapshot.meta.projectId);
  assert.equal(buildInfo.projectTitle, snapshot.meta.projectTitle);
  assert.equal(Object.hasOwn(snapshot, "createdAt"), false);
  assert.equal(Object.hasOwn(snapshot, "createdBy"), false);
  assert.equal(Object.hasOwn(snapshot, "manifest"), false);
  assert.deepEqual(
    buildInfo.entrypoints,
    snapshot.artifacts
      .filter((artifact) => artifact.type === "pipeline" && artifact.entrypoint === true)
      .map((artifact) => artifact.id),
  );
});

test("boots the normative snapshot and validates a request", async (t) => {
  const base = await listen(t);

  const healthResponse = await fetch(`${base}/health`);
  assert.equal(healthResponse.status, 200);
  assert.deepEqual(await healthResponse.json(), { ok: true });

  const response = await post(base, requestBody());
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.control, "STOP");
  assert.equal(Object.hasOwn(result, "trace"), false);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
});

test("returns engine ABORT as HTTP 500", async (t) => {
  const base = await listen(t);
  const response = await post(
    base,
    `{"context":{"pipelineId":"${PIPELINE_ID}"},"payload":{"__proto__":{"polluted":true}}}`,
  );

  assert.equal(response.status, 500);
  const result = await response.json();
  assert.equal(result.status, "ABORT");
  assert.equal(result.control, "STOP");
  assert.equal(result.error.code, "DANGEROUS_PAYLOAD_KEY");
});

test("allows only an explicit basic trace without payload values", async (t) => {
  const base = await listen(t);
  const secret = "TRACE_SECRET_MARKER";
  const response = await post(base, requestBody({
    trace: "basic",
    payload: {
      beneficiary: {
        type: "FL_RESIDENT",
        inn: secret,
      },
    },
  }));

  assert.equal(response.status, 200);
  const result = await response.json();
  assert.ok(Array.isArray(result.trace));
  assert.ok(result.trace.length > 0);
  assert.equal(JSON.stringify(result.trace).includes(secret), false);

  const verboseResponse = await post(base, requestBody({ trace: "verbose" }));
  assert.equal(verboseResponse.status, 400);
  assert.deepEqual(await verboseResponse.json(), {
    error: true,
    message: '"trace" must be false or "basic" if provided',
  });
});

test("rejects a malformed request", async (t) => {
  const base = await listen(t);
  const response = await post(base, {});
  assert.equal(response.status, 400);
});

test("custom identifier operators read fields through ctx.get", () => {
  const requestedPaths = [];
  const ctx = {
    get(field) {
      requestedPaths.push(field);
      const values = {
        "company.inn": "7707083893",
        "company.ogrn": "1027700132195",
      };
      return Object.hasOwn(values, field)
        ? { ok: true, value: values[field] }
        : { ok: false, value: undefined };
    },
  };

  assert.deepEqual(validInn({ field: "company.inn" }, ctx), { status: "OK" });
  assert.deepEqual(validOgrn({ field: "company.ogrn" }, ctx), { status: "OK" });
  assert.deepEqual(requestedPaths, ["company.inn", "company.ogrn"]);
});
