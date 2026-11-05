"use strict";

// Shared helpers for task pass checks. A check loads modules from the working copy
// given as its first argument, so the agent's own report is never trusted.

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { parseTestOutput } = require("../test-output.cjs");

function target() {
  const dir = path.resolve(process.argv[2] || ".");
  if (!fs.existsSync(path.join(dir, "package.json"))) {
    console.error(`usage: node benchmarks/checks/<task>.cjs <working-copy>   (no package.json in ${dir})`);
    process.exit(2);
  }
  return dir;
}

function load(dir, relative) {
  const full = path.join(dir, relative);
  delete require.cache[require.resolve(full)];
  return require(full);
}

// Nested "node --test" runs must not inherit the outer runner's context, or they exit 0 without running.
function cleanEnv() {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  return env;
}

function run(dir, command, args) {
  return spawnSync(command, args, { cwd: dir, encoding: "utf8", timeout: 120_000, env: cleanEnv() });
}

// npm is started through a shell: Node 20.12+ refuses to spawn npm.cmd directly on Windows.
function suite(dir, script = "test") {
  const result = spawnSync(`npm run ${script} --silent`, { cwd: dir, encoding: "utf8", timeout: 120_000, env: cleanEnv(), shell: true });
  const text = `${result.stdout}\n${result.stderr}`;
  const parsed = parseTestOutput(text);
  return { ok: result.status === 0, pass: parsed.pass, fail: parsed.fail, skipped: parsed.skipped, text };
}

// Throws with the real reason when the working copy's suite does not pass.
function green(dir, script = "test") {
  const result = suite(dir, script);
  if (result.ok) return result;
  let reason = result.text.split(/\r?\n/).filter((line) => /error|Error|not ok/.test(line)).slice(0, 2).join(" | ").trim();
  if (/ERR_UNKNOWN_BUILTIN_MODULE|node:sqlite/.test(result.text)) {
    reason = `node:sqlite is not available on Node ${process.version}; the sample app needs Node 22.13 or newer`;
  }
  throw new Error(`the suite exited with an error${reason ? `: ${reason}` : ""}`);
}

function finish(failures) {
  if (failures.length === 0) {
    console.log("PASS");
    process.exit(0);
  }
  for (const failure of failures) console.log(`FAIL: ${failure}`);
  process.exit(1);
}

// Runs each named assertion and collects failures instead of stopping at the first.
function checks(list) {
  const failures = [];
  for (const [name, fn] of list) {
    try {
      fn();
    } catch (error) {
      failures.push(`${name}: ${String(error.message).split("\n")[0]}`);
    }
  }
  return failures;
}

module.exports = { cleanEnv, target, load, run, suite, green, finish, checks };
