#!/usr/bin/env node
"use strict";

// Scores an audit's findings against the planted problems and decoys in key.json.
//
//   node benchmarks/audit-planted/score.cjs <findings.json> [--json]
//
// findings.json is a list of { "kind", "file", "line" }; file is relative to this folder
// (for example "express-shop/src/auth.js"). A finding matches a planted problem with the same
// kind and file and a line within 1 of the evidence line. Every other finding is a false alarm;
// one that lands on a decoy line is also counted as a decoy hit.
// Exit codes: 0 done, 2 usage error.

const fs = require("node:fs");
const path = require("node:path");

const ROOT = __dirname;
const WINDOW = 1;

function lineOf(file, has) {
  const lines = fs.readFileSync(path.join(ROOT, file), "utf8").split("\n");
  return lines.map((text, index) => (text.includes(has) ? index + 1 : 0)).filter(Boolean);
}

function loadKey() {
  const key = JSON.parse(fs.readFileSync(path.join(ROOT, "key.json"), "utf8"));
  for (const item of [...key.planted, ...key.decoys]) item.lines = lineOf(item.file, item.has);
  return key;
}

function score(findings, key = loadKey()) {
  const near = (item, finding) => item.file === finding.file && item.lines.some((line) => Math.abs(line - finding.line) <= WINDOW);
  const found = new Set();
  const falseAlarms = [];
  for (const finding of findings) {
    const hit = key.planted.find((item) => item.kind === finding.kind && near(item, finding));
    if (hit) found.add(hit.id);
    else {
      const decoy = key.decoys.find((item) => near(item, finding));
      falseAlarms.push({ ...finding, decoy: decoy ? decoy.id : null });
    }
  }
  const missed = key.planted.filter((item) => !found.has(item.id)).map((item) => item.id);
  return { planted: key.planted.length, found: found.size, missed, falseAlarms, decoyHits: falseAlarms.filter((item) => item.decoy).length };
}

function main(argv) {
  const json = argv.includes("--json");
  const file = argv.find((arg) => arg !== "--json");
  if (!file) {
    console.error("Usage: score.cjs <findings.json> [--json]");
    return 2;
  }
  const findings = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!Array.isArray(findings) || findings.some((item) => !item || typeof item.kind !== "string" || typeof item.file !== "string" || !Number.isInteger(item.line))) {
    console.error("findings.json must be a list of { kind, file, line }");
    return 2;
  }
  const result = score(findings);
  if (json) console.log(JSON.stringify(result, null, 1));
  else {
    console.log(`Found ${result.found} of ${result.planted} planted problems; ${result.falseAlarms.length} false alarm(s), ${result.decoyHits} on decoys.`);
    if (result.missed.length) console.log(`Missed: ${result.missed.join(", ")}`);
    for (const alarm of result.falseAlarms) console.log(`False alarm: ${alarm.kind} at ${alarm.file}:${alarm.line}${alarm.decoy ? ` (decoy ${alarm.decoy})` : ""}`);
  }
  return 0;
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));

module.exports = { score, loadKey, lineOf };
