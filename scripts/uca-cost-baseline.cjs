#!/usr/bin/env node
"use strict";

// Per-call cost baseline: what every call pays (always-on text per tier and host, each Read first block) and what
// each task path reads, in estimated tokens. tests/cost-baseline.test.cjs fails when a number rises above its
// baseline without a written reason, or falls below it without the baseline being lowered, so a saving is kept.
//
//   node scripts/uca-cost-baseline.cjs           print the current numbers next to the baseline
//   node scripts/uca-cost-baseline.cjs --write   set the baseline to the current numbers, keeping each reason
//
// A rise needs a reason: add "reason" to that entry in tests/cost-baseline.json, then run --write.

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const BASELINE = path.join(ROOT, "tests", "cost-baseline.json");

function current() {
  const { report } = require("./uca-context-report.cjs");
  const hostCost = require("./uca-host-cost.cjs");
  const { pick, readWhole, resolve } = require("./uca-read.cjs");
  const agents = path.join(ROOT, ".agents");
  const numbers = {};
  for (const row of report()) {
    numbers[`always-on ${row.tier}`] = row.alwaysOnTokens;
    numbers[`small build ${row.tier}`] = row.smallBuildTask;
    if (row.taskPaths) for (const [task, item] of Object.entries(row.taskPaths)) numbers[`task ${task} ${row.tier}`] = item.readFirst;
  }
  for (const item of require("./uca-context-report.cjs").flowChains()) numbers[`chain ${item.chain.join(" > ")}`] = item.tokens;
  for (const tier of ["lite", "standard"]) for (const row of hostCost.report(tier)) numbers[`host ${row.platform} ${tier}`] = row.fixed;
  const names = [
    ...fs.readdirSync(path.join(agents, "skills")),
    ...fs.readdirSync(path.join(agents, "workflows")).filter((name) => name.endsWith(".md")).map((name) => name.slice(0, -3))
  ].sort();
  for (const name of names) numbers[`read first ${name}`] = Math.ceil(pick(readWhole(resolve(name, agents), agents), {}).text.length / 4);
  return numbers;
}

function load() {
  return fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, "utf8")) : {};
}

// Each finding names the number, the baseline and what to do.
function compare(now, baseline) {
  const findings = [];
  for (const [key, value] of Object.entries(now)) {
    const entry = baseline[key];
    if (!entry) findings.push(`${key}: ${value}, not in the baseline (run --write)`);
    else if (value > entry.tokens) findings.push(`${key}: ${value}, up from ${entry.tokens}${entry.reason ? "" : " with no reason (add \"reason\" to its entry, then run --write)"}`);
    else if (value < entry.tokens) findings.push(`${key}: ${value}, down from ${entry.tokens} (run --write to keep the saving)`);
  }
  for (const key of Object.keys(baseline)) if (!(key in now)) findings.push(`${key}: no longer measured (run --write)`);
  return findings;
}

function main(argv = process.argv.slice(2), { out = console.log } = {}) {
  const now = current();
  const baseline = load();
  if (argv.includes("--write")) {
    const next = {};
    for (const [key, value] of Object.entries(now)) next[key] = baseline[key] && baseline[key].reason ? { tokens: value, reason: baseline[key].reason } : { tokens: value };
    fs.writeFileSync(BASELINE, `${JSON.stringify(next, null, 2)}\n`);
    out(`Baseline written: ${Object.keys(next).length} numbers.`);
    return 0;
  }
  const findings = compare(now, baseline);
  for (const line of findings) out(line);
  out(findings.length ? `${findings.length} difference(s) from the baseline.` : `All ${Object.keys(now).length} numbers match the baseline.`);
  return 0;
}

if (require.main === module) process.exitCode = main();

module.exports = { compare, current, load };
