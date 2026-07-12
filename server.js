const express = require("express");
const fs = require("fs");
const path = require("path");
const { createEngine, formatDiagnostics } = require("jsonspecs");
const { Operators } = require("./lib/operators");

const PORT = Number(process.env.PORT || 3000);
const TRACE = process.env.TRACE === "1";
const SNAPSHOT_PATH = process.env.SNAPSHOT_PATH || path.join(__dirname, "snapshot.json");

function failBoot(message) {
  const error = new Error(message);
  error.isBootError = true;
  throw error;
}

function loadSnapshot(snapshotPath) {
  if (!snapshotPath) {
    failBoot("SNAPSHOT_PATH is required");
  }
  if (!fs.existsSync(snapshotPath)) {
    failBoot(`Snapshot file not found: ${snapshotPath}`);
  }

  let snapshot;
  try {
    snapshot = JSON.parse(fs.readFileSync(snapshotPath, "utf8"));
  } catch (error) {
    failBoot(`Failed to parse snapshot: ${error.message}`);
  }

  if (!Array.isArray(snapshot.artifacts) || snapshot.artifacts.length === 0) {
    failBoot(`Snapshot contains no artifacts: ${snapshotPath}`);
  }

  return snapshot;
}

function bootstrap(snapshotPath) {
  const snapshot = loadSnapshot(snapshotPath);
  const engine = createEngine({ operators: Operators });
  let compiled;
  try { compiled = engine.compileSnapshot(snapshot); }
  catch (error) { failBoot(`Snapshot validation failed: ${error.diagnostics ? formatDiagnostics(error.diagnostics) : error.message}`); }

  return {
    engine,
    compiled,
    meta: {
      mode: "snapshot",
      snapshotPath,
      format: snapshot.format,
      formatVersion: snapshot.formatVersion,
      sourceHash: snapshot.sourceHash,
      description: snapshot.meta && snapshot.meta.description || null,
      artifactCount: snapshot.artifacts.length,
      project: snapshot.meta || null,
    },
  };
}

function validateRequest(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return 'Request body must be a JSON object';
  }
  if (!body.context || typeof body.context !== "object" || Array.isArray(body.context)) {
    return 'Request body must contain "context" object';
  }
  if (!body.context.pipelineId || typeof body.context.pipelineId !== "string") {
    return "context.pipelineId is required (string)";
  }
  if (body.payload !== undefined && (typeof body.payload !== "object" || body.payload === null || Array.isArray(body.payload))) {
    return '"payload" must be an object if provided';
  }
  return null;
}

function createApp({ engine, compiled, meta }) {
  const app = express();

  app.use(express.json({ limit: "2mb" }));

  app.use((error, _req, res, next) => {
    if (error && error.type === "entity.parse.failed") {
      return res.status(400).json({ error: true, message: "Invalid JSON body" });
    }
    return next(error);
  });

  app.get("/health", (_req, res) => {
    res.json({ ok: true, ...meta });
  });

  app.post("/v1/validate", (req, res) => {
    const validationError = validateRequest(req.body);
    if (validationError) {
      return res.status(400).json({ error: true, message: validationError });
    }

    const context = req.body.context;
    const payload = req.body.payload ?? {};
    try {
      const result = engine.runPipeline(compiled, { pipelineId: context.pipelineId, payload, context }, { trace: TRACE ? 'verbose' : false });
      const response = { context, ...result };

      return res.json(response);
    } catch (error) {
      return res.status(500).json({
        error: true,
        message: error?.message || String(error),
        pipelineId: context.pipelineId,
      });
    }
  });

  return app;
}

function start() {
  const runtime = bootstrap(SNAPSHOT_PATH);
  const app = createApp(runtime);
  app.listen(PORT, () => {
    console.log(`[jsonspecs-node-server] listening on :${PORT}`);
    console.log(`[jsonspecs-node-server] snapshot      : ${runtime.meta.snapshotPath}`);
    console.log(`[jsonspecs-node-server] snapshot      : v${runtime.meta.formatVersion}`);
    console.log(`[jsonspecs-node-server] artifacts     : ${runtime.meta.artifactCount}`);
  });
}

if (require.main === module) {
  start();
}

module.exports = { bootstrap, createApp, start };
