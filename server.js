const express = require("express");
const fs = require("fs");
const path = require("path");
const { createEngine, formatDiagnostics } = require("jsonspecs");
const { Operators } = require("./lib/operators");

const PORT = Number(process.env.PORT || 3000);
const SNAPSHOT_PATH = process.env.SNAPSHOT_PATH || path.join(__dirname, "snapshot.json");
const BUILD_INFO_PATH = process.env.BUILD_INFO_PATH || path.join(__dirname, "build-info.json");
const SAMPLES_PATH = process.env.SAMPLES_PATH || path.join(__dirname, "samples");
const TRACE_MAX_ENTRIES = Number(process.env.TRACE_MAX_ENTRIES || 500);

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

function loadBuildInfo(buildInfoPath) {
  if (!buildInfoPath || !fs.existsSync(buildInfoPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(buildInfoPath, "utf8"));
  } catch (error) {
    failBoot(`Failed to parse build info: ${error.message}`);
  }
}

function loadSamples(samplesPath) {
  if (!samplesPath || !fs.existsSync(samplesPath)) return [];
  return fs.readdirSync(samplesPath)
    .filter((name) => name.endsWith(".json"))
    .sort((a, b) => a.localeCompare(b))
    .map((fileName) => {
      const fullPath = path.join(samplesPath, fileName);
      try {
        const sample = JSON.parse(fs.readFileSync(fullPath, "utf8"));
        return {
          name: fileName.replace(/\.json$/, ""),
          fileName,
          pipelineId: sample && sample.context && sample.context.pipelineId || null,
          expectedStatus: sample && sample.expect && sample.expect.status || null,
          request: {
            context: sample.context || {},
            payload: sample.payload || {},
          },
          expect: sample.expect || null,
        };
      } catch (error) {
        failBoot(`Failed to parse sample ${fileName}: ${error.message}`);
      }
    });
}

function bootstrap(snapshotPath) {
  const snapshot = loadSnapshot(snapshotPath);
  const buildInfo = loadBuildInfo(BUILD_INFO_PATH);
  const samples = loadSamples(SAMPLES_PATH);
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
      buildInfo,
      entrypoints: snapshot.artifacts
        .filter((artifact) => artifact.type === "pipeline" && artifact.entrypoint === true)
        .map((artifact) => ({
          id: artifact.id,
          description: artifact.description || null,
          strict: Boolean(artifact.strict),
          requiredContext: Array.isArray(artifact.required_context) ? artifact.required_context : [],
        })),
      samples: samples.map(({ name, fileName, pipelineId, expectedStatus }) => ({
        name,
        fileName,
        pipelineId,
        expectedStatus,
      })),
    },
    samples,
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
  if (body.trace !== undefined && body.trace !== false && body.trace !== "basic") {
    return '"trace" must be false or "basic" if provided';
  }
  return null;
}

function traceLimit() {
  if (!Number.isFinite(TRACE_MAX_ENTRIES) || TRACE_MAX_ENTRIES < 0) return null;
  return Math.floor(TRACE_MAX_ENTRIES);
}

function applyTraceLimit(response) {
  const limit = traceLimit();
  if (limit === null || !Array.isArray(response.trace) || response.trace.length <= limit) {
    return response;
  }
  return {
    ...response,
    trace: response.trace.slice(0, limit),
    traceTruncated: true,
    traceLimit: limit,
    traceOriginalLength: response.trace.length,
  };
}

function schemaRef(name) {
  return { $ref: `#/components/schemas/${name}` };
}

function buildOpenApiSpec(runtime) {
  const project = runtime.meta.project || {};
  const examples = Object.fromEntries(runtime.samples.map((sample) => [
    sample.name.replace(/[^A-Za-z0-9._-]/g, "_"),
    {
      summary: `${sample.name} → ${sample.expectedStatus || "unknown"}`,
      description: sample.pipelineId || undefined,
      value: sample.request,
    },
  ]));

  return {
    openapi: "3.0.3",
    info: {
      title: "Polka jsonspecs Demo API",
      version: project.rulesetVersion || "0.0.0",
      description: project.description || "Demo HTTP API for Polka validation rules powered by jsonspecs.",
    },
    servers: [{ url: "/" }],
    paths: {
      "/health": {
        get: {
          summary: "Healthcheck",
          responses: {
            200: {
              description: "Server is alive",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    required: ["ok"],
                    properties: { ok: { type: "boolean", example: true } },
                  },
                },
              },
            },
          },
        },
      },
      "/v1/meta": {
        get: {
          summary: "Ruleset metadata",
          responses: {
            200: {
              description: "Snapshot metadata, entrypoints and sample index",
              content: { "application/json": { schema: schemaRef("MetaResponse") } },
            },
          },
        },
      },
      "/v1/samples": {
        get: {
          summary: "List bundled demo samples",
          responses: {
            200: {
              description: "Sample index",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    required: ["items"],
                    properties: { items: { type: "array", items: schemaRef("SampleSummary") } },
                  },
                },
              },
            },
          },
        },
      },
      "/v1/samples/{name}": {
        get: {
          summary: "Get one bundled demo sample",
          parameters: [
            { name: "name", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: {
            200: {
              description: "Sample request and expectation",
              content: { "application/json": { schema: schemaRef("Sample") } },
            },
            404: {
              description: "Sample not found",
              content: { "application/json": { schema: schemaRef("ErrorResponse") } },
            },
          },
        },
      },
      "/v1/validate": {
        post: {
          summary: "Validate payload against one Polka entrypoint",
          description: "HTTP status 200 means the validation request was processed. Business validation status is returned in the JSON body as OK, OK_WITH_WARNINGS, ERROR or EXCEPTION. Engine ABORT is returned as HTTP 500.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: schemaRef("ValidationRequest"),
                examples,
              },
            },
          },
          responses: {
            200: {
              description: "Runtime validation result",
              content: { "application/json": { schema: schemaRef("ValidationResponse") } },
            },
            400: {
              description: "Invalid HTTP request",
              content: { "application/json": { schema: schemaRef("ErrorResponse") } },
            },
            500: {
              description: "Engine ABORT or internal server error",
              content: { "application/json": { schema: schemaRef("ValidationResponse") } },
            },
          },
        },
      },
    },
    components: {
      schemas: {
        ErrorResponse: {
          type: "object",
          required: ["error", "message"],
          properties: {
            error: { type: "boolean", example: true },
            message: { type: "string" },
          },
        },
        MetaResponse: {
          type: "object",
          properties: {
            mode: { type: "string", example: "snapshot" },
            format: { type: "string", example: "jsonspecs-snapshot" },
            formatVersion: { type: "integer", example: 1 },
            sourceHash: { type: "string" },
            artifactCount: { type: "integer" },
            project: { type: "object", additionalProperties: true },
            buildInfo: { type: "object", additionalProperties: true, nullable: true },
            entrypoints: { type: "array", items: schemaRef("Entrypoint") },
            samples: { type: "array", items: schemaRef("SampleSummary") },
          },
        },
        Entrypoint: {
          type: "object",
          required: ["id", "strict", "requiredContext"],
          properties: {
            id: { type: "string", example: "entrypoints.checkout.validation" },
            description: { type: "string", nullable: true },
            strict: { type: "boolean" },
            requiredContext: { type: "array", items: { type: "string" } },
          },
        },
        SampleSummary: {
          type: "object",
          required: ["name", "fileName"],
          properties: {
            name: { type: "string", example: "checkout.ok" },
            fileName: { type: "string", example: "checkout.ok.json" },
            pipelineId: { type: "string", nullable: true },
            expectedStatus: { type: "string", nullable: true },
          },
        },
        Sample: {
          type: "object",
          required: ["name", "request"],
          properties: {
            name: { type: "string" },
            fileName: { type: "string" },
            pipelineId: { type: "string", nullable: true },
            expectedStatus: { type: "string", nullable: true },
            request: schemaRef("ValidationRequest"),
            expect: { type: "object", nullable: true, additionalProperties: true },
          },
        },
        ValidationRequest: {
          type: "object",
          required: ["context"],
          properties: {
            trace: { enum: [false, "basic"], default: false },
            context: {
              type: "object",
              required: ["pipelineId"],
              properties: {
                pipelineId: {
                  type: "string",
                  enum: runtime.meta.entrypoints.map((entrypoint) => entrypoint.id),
                  example: "entrypoints.checkout.validation",
                },
              },
              additionalProperties: true,
            },
            payload: { type: "object", additionalProperties: true },
          },
        },
        ValidationResponse: {
          type: "object",
          required: ["context", "status", "control", "issues"],
          properties: {
            context: { type: "object", additionalProperties: true },
            status: { enum: ["OK", "OK_WITH_WARNINGS", "ERROR", "EXCEPTION", "ABORT"] },
            control: { enum: ["CONTINUE", "STOP"] },
            issues: { type: "array", items: schemaRef("Issue") },
            error: { type: "object", additionalProperties: true },
            ruleset: { type: "object", additionalProperties: true },
            trace: { type: "array", items: { type: "object", additionalProperties: true } },
            traceTruncated: { type: "boolean" },
            traceLimit: { type: "integer" },
            traceOriginalLength: { type: "integer" },
          },
        },
        Issue: {
          type: "object",
          required: ["kind", "level", "code", "message"],
          properties: {
            kind: { type: "string", example: "ISSUE" },
            level: { enum: ["WARNING", "ERROR", "EXCEPTION"] },
            code: { type: "string", example: "1001" },
            message: { type: "string" },
            field: { type: "string" },
            ruleId: { type: "string" },
            pipelineId: { type: "string" },
            actual: {},
            expected: {},
            meta: { type: "object", additionalProperties: true },
          },
        },
      },
    },
  };
}

function swaggerHtml() {
  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Polka jsonspecs Demo API</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css" />
  <style>body{margin:0;background:#fafafa}.topbar{display:none}</style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    window.ui = SwaggerUIBundle({
      url: "/openapi.json",
      dom_id: "#swagger-ui",
      deepLinking: true,
      displayRequestDuration: true,
      persistAuthorization: false
    });
  </script>
</body>
</html>`;
}

function createApp(runtime) {
  const { engine, compiled } = runtime;
  const app = express();

  app.use(express.json({ limit: "2mb" }));

  app.use((error, _req, res, next) => {
    if (error && error.type === "entity.parse.failed") {
      return res.status(400).json({ error: true, message: "Invalid JSON body" });
    }
    return next(error);
  });

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.get("/", (_req, res) => {
    res.redirect(302, "/docs");
  });

  app.get("/docs", (_req, res) => {
    res.type("html").send(swaggerHtml());
  });

  app.get("/openapi.json", (_req, res) => {
    res.json(buildOpenApiSpec(runtime));
  });

  app.get("/v1/meta", (_req, res) => {
    res.json(runtime.meta);
  });

  app.get("/v1/samples", (_req, res) => {
    res.json({ items: runtime.meta.samples });
  });

  app.get("/v1/samples/:name", (req, res) => {
    const sample = runtime.samples.find((item) => item.name === req.params.name || item.fileName === req.params.name);
    if (!sample) {
      return res.status(404).json({ error: true, message: `Sample not found: ${req.params.name}` });
    }
    return res.json(sample);
  });

  app.post("/v1/validate", (req, res) => {
    const validationError = validateRequest(req.body);
    if (validationError) {
      return res.status(400).json({ error: true, message: validationError });
    }

    const context = req.body.context;
    const payload = req.body.payload ?? {};
    try {
      const trace = req.body.trace === "basic" ? "basic" : false;
      const result = engine.runPipeline(compiled, { pipelineId: context.pipelineId, payload, context }, { trace });
      const response = applyTraceLimit({ context, ...result });

      return res.status(result.status === "ABORT" ? 500 : 200).json(response);
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
    console.log(`[jsonspecs-node-server] project       : ${runtime.meta.project && runtime.meta.project.projectId || "unknown"}`);
  });
}

if (require.main === module) {
  start();
}

module.exports = { bootstrap, createApp, start };
