#!/usr/bin/env node
"use strict";

// Records the machine-measurable fields for one benchmark run.
// Usage:
//   node benchmarks/score-run.cjs <working-copy> --task T01 --snapshot <commit> [--report report.md]
//        [--out results.csv] [--model m --model-build b --host h --condition baseline|kit --tier lite|standard|full
//         --run 1 --seconds 90 --input-tokens N --output-tokens N --tokens-source <where the counts came from>]
//        [--allow-other-snapshot]
//
// Exit codes: 0 scored, 2 refused (bad input, nothing recorded), 3 scored but incomplete (recorded as "incomplete").
// A run is never recorded as "yes" unless the task check exited 0 and every measurement it relies on was taken.
// The fields only a person can fill (routing, unsupported claims, notes) are left empty.

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { countCycles } = require("./import-cycles.cjs");
const { parseTestOutput } = require("./test-output.cjs");

const COLUMNS = fs.readFileSync(path.join(__dirname, "results-template.csv"), "utf8").trim().split(",");
const BANNED = JSON.parse(fs.readFileSync(path.join(__dirname, "banned-wording.json"), "utf8"));
const FLAGS = new Set(["allow-other-snapshot"]);

class Refused extends Error {}

function parseArgs(argv) {
  const options = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg.startsWith("--")) {
      const name = arg.slice(2);
      if (FLAGS.has(name)) {
        options[name] = true;
        continue;
      }
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) throw new Refused(`Option ${arg} needs a value.`);
      options[name] = value;
      index += 1;
    } else {
      options._.push(arg);
    }
  }
  return options;
}

// Nested "node --test" runs must not inherit the outer runner's context, or they exit 0 without running.
function cleanEnv() {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  return env;
}

function sh(dir, command, args) {
  return spawnSync(command, args, { cwd: dir, encoding: "utf8", timeout: 180_000, env: cleanEnv() });
}

// npm is started through a shell: Node 20.12+ refuses to spawn npm.cmd directly on Windows.
function runSuite(dir) {
  const result = spawnSync("npm run test --silent", { cwd: dir, encoding: "utf8", timeout: 180_000, env: cleanEnv(), shell: true });
  const text = `${result.stdout}\n${result.stderr}`;
  return { ...parseTestOutput(text), exitCode: result.status, text };
}

function filesChanged(dir, snapshot) {
  const tracked = sh(dir, "git", ["diff", "--name-only", snapshot]).stdout.split(/\r?\n/).filter(Boolean);
  const untracked = sh(dir, "git", ["ls-files", "--others", "--exclude-standard"]).stdout.split(/\r?\n/).filter(Boolean);
  return new Set([...tracked, ...untracked]).size;
}

function bannedCount(text) {
  const lower = text.toLowerCase();
  return BANNED.reduce((total, phrase) => total + lower.split(phrase.toLowerCase()).length - 1, 0);
}

function recordedSnapshot() {
  const text = fs.readFileSync(path.join(__dirname, "SNAPSHOT.md"), "utf8");
  const found = /Snapshot commit: `([0-9a-f]{40})`/.exec(text);
  return found ? found[1] : null;
}

function validate(options) {
  const [workingCopy] = options._;
  if (!workingCopy || !options.task || !options.snapshot) {
    throw new Refused("Usage: score-run.cjs <working-copy> --task T01 --snapshot <commit> [--report file] [--out csv]");
  }
  const dir = path.resolve(workingCopy);
  if (!fs.existsSync(path.join(dir, "package.json"))) throw new Refused(`${dir} is not a project folder (no package.json).`);
  if (sh(dir, "git", ["rev-parse", "--is-inside-work-tree"]).status !== 0) {
    throw new Refused(`${dir} is not a git repository, so changes cannot be measured against the snapshot.`);
  }
  if (!/^[0-9a-f]{40}$/.test(options.snapshot)) throw new Refused("--snapshot must be the full 40-character commit hash.");
  const recorded = recordedSnapshot();
  if (!options["allow-other-snapshot"] && recorded && options.snapshot !== recorded) {
    throw new Refused(`--snapshot ${options.snapshot} is not the recorded benchmark snapshot ${recorded}. Pass --allow-other-snapshot only for a different, documented snapshot.`);
  }
  if (sh(dir, "git", ["cat-file", "-e", `${options.snapshot}^{commit}`]).status !== 0) {
    throw new Refused(`Commit ${options.snapshot} is not in ${dir}. Build the working copy with benchmarks/make-snapshot.cjs.`);
  }
  const checkFile = fs.readdirSync(path.join(__dirname, "checks")).find((name) => name.startsWith(`${options.task}-`) || name === `${options.task}.cjs`);
  if (!checkFile) throw new Refused(`No pass check for task ${options.task}.`);
  if (options.report) {
    if (!fs.existsSync(options.report) || !fs.statSync(options.report).isFile()) throw new Refused(`Report file not found: ${options.report}`);
  }
  return { dir, checkFile };
}

function scoreRun(options) {
  const { dir, checkFile } = validate(options);
  const problems = [];

  const args = [path.join(__dirname, "checks", checkFile), dir];
  if (options.report) args.push("--report", path.resolve(options.report));
  const check = spawnSync(process.execPath, args, { encoding: "utf8", timeout: 300_000, env: cleanEnv() });
  if (check.status !== 0 && check.status !== 1) {
    problems.push(`the task check could not run to a verdict (exit ${check.status === null ? "none" : check.status})`);
  }

  const before = fs.mkdtempSync(path.join(os.tmpdir(), "uca-bench-before-"));
  let beforeSuite;
  let cyclesBefore;
  try {
    fs.cpSync(dir, before, { recursive: true, filter: (file) => !file.includes("node_modules") });
    const reset = sh(before, "git", ["checkout", "-q", "-f", options.snapshot, "--", "."]);
    if (reset.status !== 0) throw new Refused(`Cannot restore snapshot ${options.snapshot}: ${reset.stderr.trim()}`);
    sh(before, "git", ["clean", "-fdxq"]);
    beforeSuite = runSuite(before);
    cyclesBefore = countCycles(before);
  } finally {
    fs.rmSync(before, { recursive: true, force: true });
  }
  const afterSuite = runSuite(dir);

  if (!beforeSuite.measured) problems.push("the snapshot's tests could not be measured (no test summary found)");
  if (!afterSuite.measured) problems.push("the tests in the working copy could not be measured (no test summary found)");

  // A regression is a test that passed on the snapshot and no longer passes. Matching is by name, so
  // deleting a test and adding another cannot hide it.
  const lost = [...beforeSuite.passed].filter((name) => !afterSuite.passed.has(name));

  const hasInput = options["input-tokens"] !== undefined;
  const hasOutput = options["output-tokens"] !== undefined;
  if (hasInput !== hasOutput) problems.push("only one of --input-tokens and --output-tokens was given");
  for (const name of ["input-tokens", "output-tokens"]) {
    if (options[name] !== undefined && !/^\d+$/.test(options[name])) problems.push(`--${name} must be a whole number`);
  }
  if ((hasInput || hasOutput) && !options["tokens-source"]) problems.push("token counts were given without --tokens-source");

  let success = check.status === 0 ? "yes" : check.status === 1 ? "no" : "incomplete";
  if (problems.length > 0) success = "incomplete";

  const report = options.report ? fs.readFileSync(options.report, "utf8") : "";
  const notes = [];
  if (problems.length > 0) notes.push(`INCOMPLETE: ${problems.join("; ")}`);
  if (lost.length > 0) notes.push(`tests no longer passing: ${lost.join(" | ")}`);
  if (!hasInput && !hasOutput) notes.push("tokens not measured");

  const row = {
    date: new Date().toISOString().slice(0, 10),
    model: options.model || "",
    model_build: options["model-build"] || "",
    host: options.host || "",
    condition: options.condition || "",
    tier: options.tier || "",
    task: options.task,
    run: options.run || "",
    success,
    tests_before: beforeSuite.measured ? `${beforeSuite.pass} pass/${beforeSuite.fail} fail` : "unmeasured",
    tests_after: afterSuite.measured ? `${afterSuite.pass} pass/${afterSuite.fail} fail` : "unmeasured",
    regressions: beforeSuite.measured && afterSuite.measured ? lost.length : "unmeasured",
    seconds: options.seconds || "",
    input_tokens: hasInput ? options["input-tokens"] : "",
    output_tokens: hasOutput ? options["output-tokens"] : "",
    tokens_source: options["tokens-source"] || "",
    files_changed: filesChanged(dir, options.snapshot),
    routing_expected_skill: "",
    routing_opened: "",
    unsupported_claims: "",
    new_import_cycles: countCycles(dir) - cyclesBefore,
    banned_wording: options.report ? bannedCount(report) : "",
    notes: notes.join("; ")
  };
  return { row, problems, checkOutput: `${check.stdout}${check.stderr}`.trim() };
}

function csvCell(value) {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function main(argv = process.argv.slice(2)) {
  try {
    const options = parseArgs(argv);
    const { row, problems, checkOutput } = scoreRun(options);
    console.log(checkOutput);
    if (options.out) {
      const out = path.resolve(options.out);
      fs.mkdirSync(path.dirname(out), { recursive: true });
      if (!fs.existsSync(out)) fs.writeFileSync(out, `${COLUMNS.join(",")}\n`);
      fs.appendFileSync(out, `${COLUMNS.map((column) => csvCell(row[column] ?? "")).join(",")}\n`);
      console.log(`Row appended to ${out}`);
    } else {
      console.log(JSON.stringify(row, null, 2));
    }
    if (problems.length > 0) {
      console.error(`INCOMPLETE: ${problems.join("; ")}`);
      return 3;
    }
    return 0;
  } catch (error) {
    console.error(`Error: ${error.message}`);
    return 2;
  }
}

if (require.main === module) process.exitCode = main();

module.exports = { Refused, bannedCount, csvCell, main, parseArgs, runSuite, scoreRun };
