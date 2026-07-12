const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const buildInfo = require("../build-info.json");
const snapshot = require("../snapshot.json");
const PolkaOperators = require("../lib/operators/polka-operators");
const { bootstrap, createApp } = require("../server");

const SNAPSHOT_PATH = path.join(__dirname, "..", "snapshot.json");
const SAMPLES_PATH = path.join(__dirname, "..", "samples");
const CHECKOUT_PIPELINE_ID = "entrypoints.checkout.validation";

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
      pipelineId: CHECKOUT_PIPELINE_ID,
      currentDate: "2026-07-12",
      minOrderAmount: 500,
      cashOnDeliveryLimit: 15000,
    },
    payload: {
      customer: {
        name: "Иван Петров",
        phone: "+79161234567",
        email: "ivan@example.com",
      },
      delivery: {
        type: "COURIER",
        regionCode: "77",
        address: "Москва, ул. Полковая, д. 3, кв. 12",
        pickupPointId: null,
      },
      payment: { method: "CARD" },
      order: {
        amount: 4250,
        currency: "RUB",
        items: [
          { sku: "BKS-0412", qty: 2, price: 1200 },
          { sku: "BKS-0987", qty: 1, price: 1850 },
        ],
      },
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

function loadSamples() {
  return fs.readdirSync(SAMPLES_PATH)
    .filter((fileName) => fileName.endsWith(".json"))
    .sort((a, b) => a.localeCompare(b))
    .map((fileName) => ({
      fileName,
      sample: JSON.parse(fs.readFileSync(path.join(SAMPLES_PATH, fileName), "utf8")),
    }));
}

function hasExpectedIssue(result, expected) {
  return result.issues.some((actual) => (
    actual.code === expected.code
    && actual.level === expected.level
    && (expected.field === undefined || actual.field === expected.field)
  ));
}

test("snapshot and build-info describe the Polka build", () => {
  assert.deepEqual(Object.keys(snapshot).sort(), ["artifacts", "engine", "format", "formatVersion", "meta", "sourceHash"]);
  assert.equal(snapshot.meta.projectId, "polka-checkout");
  assert.equal(snapshot.meta.projectTitle, "Полка — проверки");
  assert.equal(buildInfo.projectId, snapshot.meta.projectId);
  assert.equal(buildInfo.projectTitle, snapshot.meta.projectTitle);
  assert.equal(buildInfo.rulesetVersion, snapshot.meta.rulesetVersion);
  assert.equal(buildInfo.jsonspecsVersion, snapshot.engine.minVersion);
  assert.equal(buildInfo.snapshotFormat, snapshot.format);
  assert.equal(buildInfo.snapshotFormatVersion, snapshot.formatVersion);
  assert.equal(buildInfo.sourceHash, snapshot.sourceHash);
  assert.equal(buildInfo.artifactCount, snapshot.artifacts.length);
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

test("boots the Polka snapshot and validates a request", async (t) => {
  const base = await listen(t);

  const healthResponse = await fetch(`${base}/health`);
  assert.equal(healthResponse.status, 200);
  assert.deepEqual(await healthResponse.json(), { ok: true });

  const response = await post(base, requestBody());
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.status, "OK");
  assert.equal(result.control, "CONTINUE");
  assert.equal(Object.hasOwn(result, "trace"), false);
  assert.deepEqual(result.ruleset, {
    sourceHash: snapshot.sourceHash,
    rulesetVersion: snapshot.meta.rulesetVersion,
    projectId: snapshot.meta.projectId,
  });
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
});

test("serves metadata, sample index and OpenAPI docs", async (t) => {
  const base = await listen(t);

  const metaResponse = await fetch(`${base}/v1/meta`);
  assert.equal(metaResponse.status, 200);
  const meta = await metaResponse.json();
  assert.equal(meta.project.projectId, "polka-checkout");
  assert.deepEqual(meta.entrypoints.map((entrypoint) => entrypoint.id), buildInfo.entrypoints);
  assert.equal(meta.samples.length, loadSamples().length);

  const samplesResponse = await fetch(`${base}/v1/samples`);
  assert.equal(samplesResponse.status, 200);
  const samples = await samplesResponse.json();
  assert.equal(samples.items.some((sample) => sample.name === "checkout.ok"), true);

  const sampleResponse = await fetch(`${base}/v1/samples/checkout.ok`);
  assert.equal(sampleResponse.status, 200);
  const sample = await sampleResponse.json();
  assert.equal(sample.pipelineId, CHECKOUT_PIPELINE_ID);
  assert.equal(sample.expectedStatus, "OK");
  assert.equal(sample.request.context.pipelineId, CHECKOUT_PIPELINE_ID);

  const openApiResponse = await fetch(`${base}/openapi.json`);
  assert.equal(openApiResponse.status, 200);
  const openApi = await openApiResponse.json();
  assert.equal(openApi.openapi, "3.0.3");
  assert.equal(openApi.info.title, "Polka jsonspecs Demo API");
  assert.ok(openApi.paths["/v1/validate"]);
  assert.ok(openApi.components.schemas.ValidationRequest);

  const docsResponse = await fetch(`${base}/docs`);
  assert.equal(docsResponse.status, 200);
  assert.equal((await docsResponse.text()).includes("SwaggerUIBundle"), true);
});

test("bundled samples execute with their expected statuses and issues", async (t) => {
  const base = await listen(t);

  for (const { fileName, sample } of loadSamples()) {
    const response = await post(base, { context: sample.context, payload: sample.payload });
    assert.equal(response.status, 200, fileName);
    const result = await response.json();
    assert.equal(result.status, sample.expect.status, fileName);

    const expectedIssues = sample.expect.issues || [];
    for (const expected of expectedIssues) {
      assert.equal(hasExpectedIssue(result, expected), true, `${fileName}: missing issue ${JSON.stringify(expected)}`);
    }
    if (sample.expect.exact === true) {
      assert.equal(result.issues.length, expectedIssues.length, fileName);
    }
  }
});

test("returns engine ABORT as HTTP 500", async (t) => {
  const base = await listen(t);
  const response = await post(
    base,
    `{"context":{"pipelineId":"${CHECKOUT_PIPELINE_ID}"},"payload":{"__proto__":{"polluted":true}}}`,
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
      customer: {
        name: secret,
        phone: "+79161234567",
        email: "secret@example.com",
      },
      delivery: {
        type: "PICKUP",
        pickupPointId: "PVZ-77-001",
      },
      payment: { method: "CARD" },
      order: {
        amount: 800,
        currency: "RUB",
        items: [{ sku: "BKS-0412", qty: 1, price: 800 }],
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

test("rejects malformed requests", async (t) => {
  const base = await listen(t);
  assert.equal((await post(base, {})).status, 400);
  assert.equal((await post(base, { context: { pipelineId: CHECKOUT_PIPELINE_ID }, payload: [] })).status, 400);
});

test("Polka custom operator reads fields through ctx.get", () => {
  const requestedPaths = [];
  const ctx = {
    get(field) {
      requestedPaths.push(field);
      const values = { "organization.inn": "7707083893" };
      return Object.hasOwn(values, field)
        ? { ok: true, value: values[field] }
        : { ok: false, value: undefined };
    },
  };

  assert.deepEqual(PolkaOperators.check.inn10_valid({ field: "organization.inn" }, ctx), {
    status: "OK",
    actual: "7707083893",
  });
  assert.deepEqual(requestedPaths, ["organization.inn"]);
});
