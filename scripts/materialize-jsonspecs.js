#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const version = require(path.join(root, "package.json")).config.jsonspecsVersion;
const target = path.resolve(root, "..", "jsonspecs");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "jsonspecs-server-engine-"));

try {
  if (fs.existsSync(path.join(target, ".git"))) throw new Error(`refusing to replace the jsonspecs git checkout at ${target}`);
  if (fs.existsSync(target) && !fs.existsSync(path.join(target, "package.json"))) throw new Error(`refusing to replace an unrecognized directory at ${target}`);
  if (fs.existsSync(path.join(target, "package.json"))) {
    const current = JSON.parse(fs.readFileSync(path.join(target, "package.json"), "utf8"));
    if (current.name !== "jsonspecs") throw new Error(`refusing to replace non-jsonspecs package at ${target}`);
  }
  const packed = spawnSync("npm", ["pack", "--json", "--ignore-scripts", "--pack-destination", temp, `jsonspecs@${version}`], { encoding: "utf8" });
  if (packed.status !== 0) throw new Error(`unable to download jsonspecs@${version}: ${packed.stderr || packed.stdout}`);
  const result = JSON.parse(packed.stdout)[0];
  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(target, { recursive: true });
  const extracted = spawnSync("tar", ["-xzf", path.join(temp, result.filename), "--strip-components=1", "-C", target], { encoding: "utf8" });
  if (extracted.status !== 0) throw new Error(`unable to extract jsonspecs@${version}: ${extracted.stderr || extracted.stdout}`);
  console.log(`[jsonspecs-node-server] materialized jsonspecs@${version} at ${target}`);
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
