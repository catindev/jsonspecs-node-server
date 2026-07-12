#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const expected = require(path.join(root, "package.json")).config.jsonspecsVersion;
const sourcePackage = path.join(root, "..", "jsonspecs", "package.json");

if (!fs.existsSync(sourcePackage)) {
  throw new Error("jsonspecs source is missing; clone it as ../jsonspecs or run `npm run deps:registry` after jsonspecs is published");
}
const actual = JSON.parse(fs.readFileSync(sourcePackage, "utf8"));
if (actual.name !== "jsonspecs" || actual.version !== expected) {
  throw new Error(`expected jsonspecs@${expected} in ../jsonspecs, found ${actual.name || "unknown"}@${actual.version || "unknown"}`);
}
