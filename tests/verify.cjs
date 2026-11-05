#!/usr/bin/env node
"use strict";

// One command that runs every check this repository has and prints PASS, FAIL or SKIPPED for each.
//   npm run verify              run everything
//   npm run verify -- --list    list the checks
//   npm run verify -- --only pack,route
// Exit code: 0 when nothing failed (skipped checks are listed, never counted as passes), 1 when anything failed.
// A check that exits 0 but ran no tests is a FAIL, because that is how a broken test runner looks.

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.join(__dirname, "..");
const { parseTestOutput } = require(path.join(root, "benchmarks", "test-output.cjs"));

function cleanEnv() {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT; // a nested "node --test" would otherwise exit 0 without running anything
  return env;
}

function run(command, { cwd = root, timeout = 900_000 } = {}) {
  const result = spawnSync(command, { cwd, encoding: "utf8", timeout, env: cleanEnv(), shell: true, maxBuffer: 64 * 1024 * 1024 });
  return { status: result.status, text: `${result.stdout || ""}\n${result.stderr || ""}`, timedOut: Boolean(result.error && result.error.code === "ETIMEDOUT") };
}

// Understands both the TAP summary ("# pass 5") and the spec summary newer Node versions print ("ℹ pass 5").
function parseCounts(text) {
  const parsed = parseTestOutput(text);
  if (!parsed.measured) return { tests: null, pass: null, fail: null, skipped: null };
  return { tests: parsed.tests, pass: parsed.pass, fail: parsed.fail, skipped: parsed.skipped };
}

// Decides PASS or FAIL for a test-runner check from its exit code and counts.
function judgeTestRun(result) {
  const counts = parseCounts(result.text);
  if (result.timedOut) return { status: "FAIL", detail: "timed out" };
  if (result.status !== 0 || (counts.fail || 0) > 0) return { status: "FAIL", detail: `${counts.fail ?? "?"} failing, exit ${result.status}` };
  if (!counts.pass) return { status: "FAIL", detail: "exited 0 but no tests were reported as passing" };
  return { status: "PASS", detail: `${counts.pass} tests passed${counts.skipped ? `, ${counts.skipped} skipped` : ""}` };
}

function nodeAtLeast(major, minor) {
  const [a, b] = process.versions.node.split(".").map(Number);
  return a > major || (a === major && b >= minor);
}

const CHECKS = [
  {
    id: "suite",
    title: "Unit and integration tests (installer, lifecycle, routing, skills, docs)",
    run: () => judgeTestRun(run("npm run check --silent"))
  },
  {
    id: "bench",
    title: "Benchmark harness (13 tasks fail on the snapshot and pass with the reference fix)",
    run: () => {
      if (!nodeAtLeast(22, 13)) return { status: "SKIPPED", detail: `needs Node 22.13 or newer (node:sqlite); this is ${process.version}` };
      return judgeTestRun(run("npm run check:bench --silent"));
    }
  },
  {
    id: "python",
    title: "Python skill-sync tests",
    run: () => {
      const probe = run("python3 --version");
      if (probe.status !== 0) return { status: "SKIPPED", detail: "python3 is not available" };
      const result = run("python3 -I tests/test_sync_skills.py");
      const ran = /Ran (\d+) tests?/.exec(result.text);
      if (result.status !== 0 || !ran) return { status: "FAIL", detail: `exit ${result.status}` };
      return { status: "PASS", detail: `${ran[1]} tests passed` };
    }
  },
  {
    id: "pack",
    title: "npm package contents",
    run: () => {
      const result = run("npm pack --dry-run --json");
      if (result.status !== 0) return { status: "FAIL", detail: `npm pack exited ${result.status}` };
      let files;
      try {
        files = JSON.parse(result.text.slice(result.text.indexOf("[")))[0].files.map((file) => file.path);
      } catch {
        return { status: "FAIL", detail: "could not read the npm pack file list" };
      }
      const missing = ["bin/cli.cjs", "bin/lifecycle.cjs", "AGENTS.md", ".agents/tiers.json", "scripts/uca-route.cjs"].filter((file) => !files.includes(file));
      const leaked = files.filter((file) => /^(?:tests?|docs|benchmarks)\//.test(file) || /^\.github\/workflows\//.test(file));
      if (missing.length || leaked.length) return { status: "FAIL", detail: `missing: ${missing.join(", ") || "none"}; leaked: ${leaked.join(", ") || "none"}` };
      return { status: "PASS", detail: `${files.length} files, nothing maintainer-only` };
    }
  },
  {
    id: "route",
    title: "Reference router on the routing cases (a keyword reference, not a model)",
    run: () => {
      const read = (name) => JSON.parse(fs.readFileSync(path.join(root, "tests", "fixtures", name), "utf8"));
      const { evaluate } = require(path.join(root, "scripts", "uca-route.cjs"));
      const tuned = evaluate(read("routing-cases.json"));
      const sets = ["routing-holdout.json", "routing-holdout-2.json", "routing-holdout-3.json", "routing-holdout-4.json"];
      const unseen = sets.map((name) => evaluate(read(name)));
      const known = sets.flatMap(read).filter((item) => item.knownMiss).length;
      const misses = unseen.reduce((total, report) => total + report.rows.filter((row) => !row.okPrimary || !row.okCompanion).length, 0);
      if (tuned.primaryAccuracy < 1 || tuned.unnecessaryLoads > 0) return { status: "FAIL", detail: `tuned set ${Math.round(tuned.primaryAccuracy * 100)}%, ${tuned.unnecessaryLoads} unnecessary loads` };
      if (misses !== known) return { status: "FAIL", detail: `${misses} misses on the unseen sets, ${known} recorded` };
      return { status: "PASS", detail: `${tuned.total} tuned cases correct; unseen sets match their recorded results (${known} known miss)` };
    }
  },
  {
    id: "context",
    title: "Instruction size per tier",
    run: () => {
      const { report } = require(path.join(root, "scripts", "uca-context-report.cjs"));
      const rows = report();
      const lite = rows.find((row) => row.tier === "lite");
      const duplicated = rows.filter((row) => row.duplicateTokens > 0).map((row) => row.tier);
      if (lite.worstCaseTask > 1600) return { status: "FAIL", detail: `lite worst case is ${lite.worstCaseTask} estimated tokens (limit 1600)` };
      if (duplicated.length) return { status: "FAIL", detail: `duplicate instruction lines in: ${duplicated.join(", ")}` };
      return { status: "PASS", detail: rows.map((row) => `${row.tier} ${row.alwaysOnTokens}/${row.worstCaseTask}`).join("; ") + " (always-on/worst-case estimated tokens)" };
    }
  },
  {
    id: "smoke",
    title: "Real CLI: install, doctor, edit, update, uninstall in a temporary project",
    run: () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "uca-verify-"));
      try {
        const cli = `node "${path.join(root, "bin", "cli.cjs")}"`;
        const steps = [
          [`${cli} init "${dir}" --platform claude --tier standard --yes`, 0, "init"],
          [`${cli} doctor "${dir}"`, 0, "doctor"]
        ];
        for (const [command, expected, label] of steps) {
          const result = run(command);
          if (result.status !== expected) return { status: "FAIL", detail: `${label} exited ${result.status}` };
        }
        const file = path.join(dir, ".agents", "skills", "debugging", "SKILL.md");
        fs.appendFileSync(file, "\nmy edit\n");
        fs.writeFileSync(path.join(dir, "notes.md"), "mine\n");
        // Pretend the kit has a newer version of the file you edited: the manifest remembers an older one.
        const manifestFile = path.join(dir, ".uca", "manifest.json");
        const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
        manifest.files[".agents/skills/debugging/SKILL.md"] = require("node:crypto").createHash("sha256").update("an older version of the kit").digest("hex");
        fs.writeFileSync(manifestFile, JSON.stringify(manifest));
        if (run(`${cli} update "${dir}"`).status !== 0) return { status: "FAIL", detail: "update failed" };
        if (!fs.readFileSync(file, "utf8").includes("my edit")) return { status: "FAIL", detail: "update overwrote an edited file without --force" };
        if (fs.existsSync(path.join(dir, ".uca", "backup"))) return { status: "FAIL", detail: "update made a backup although it changed nothing of yours" };
        if (run(`${cli} uninstall "${dir}"`).status !== 2) return { status: "FAIL", detail: "uninstall did not ask for --yes" };
        if (run(`${cli} uninstall "${dir}" --yes`).status !== 0) return { status: "FAIL", detail: "uninstall failed" };
        const left = fs.readdirSync(dir, { recursive: true }).filter((name) => fs.statSync(path.join(dir, name)).isFile()).map((name) => name.split(path.sep).join("/")).sort();
        if (left.join(",") !== ".agents/skills/debugging/SKILL.md,notes.md") return { status: "FAIL", detail: `uninstall left: ${left.join(", ")}` };
        return { status: "PASS", detail: "your edited file and your own file survived; everything else was removed" };
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }
  }
];

const NOT_VERIFIED = [
  "Benchmark runs with real models: EVALUATION.md status is \"designed, not run\". No model has been scored.",
  "Compatibility with real IDEs and coding tools: docs/TOOL-COMPATIBILITY.md rows stay \"untested\" until someone tries them.",
  "Whether the rewritten design skill produces less templated screens: needs real runs and a person looking at them.",
  "Task success per token: needs the benchmark runs."
];

function main(argv = process.argv.slice(2)) {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log("Usage: npm run verify [-- --list] [-- --only id,id] [-- --json]\nRuns every check and prints PASS, FAIL or SKIPPED for each. Exit 1 if anything failed.");
    return 0;
  }
  const known = new Set(CHECKS.map((check) => check.id));
  const unknown = argv.filter((arg, index) => !["--list", "--only", "--json"].includes(arg) && argv[index - 1] !== "--only");
  if (unknown.length) {
    console.error(`Error: unknown option ${unknown[0]}. Run with --help.`);
    return 2;
  }
  if (argv.includes("--list")) {
    for (const check of CHECKS) console.log(`${check.id.padEnd(8)} ${check.title}`);
    return 0;
  }
  let selected = CHECKS;
  const onlyIndex = argv.indexOf("--only");
  if (onlyIndex !== -1) {
    const ids = (argv[onlyIndex + 1] || "").split(",").filter(Boolean);
    const bad = ids.filter((id) => !known.has(id));
    if (!ids.length || bad.length) {
      console.error(`Error: --only needs ids from: ${[...known].join(", ")}${bad.length ? ` (unknown: ${bad.join(", ")})` : ""}`);
      return 2;
    }
    selected = CHECKS.filter((check) => ids.includes(check.id));
  }
  const json = argv.includes("--json");
  const results = [];
  for (const check of selected) {
    if (!json && process.stdout.isTTY) process.stdout.write(`... ${check.title}\r`);
    const started = Date.now();
    let outcome;
    try {
      outcome = check.run();
    } catch (error) {
      outcome = { status: "FAIL", detail: `the check itself crashed: ${error.message}` };
    }
    results.push({ id: check.id, title: check.title, ...outcome, seconds: Math.round((Date.now() - started) / 100) / 10 });
    if (!json) console.log(`${outcome.status.padEnd(7)} ${check.title}\n        ${outcome.detail} (${results[results.length - 1].seconds}s)`);
  }
  const failed = results.filter((result) => result.status === "FAIL");
  const skipped = results.filter((result) => result.status === "SKIPPED");
  if (json) {
    console.log(JSON.stringify({ ok: failed.length === 0, results, notVerified: NOT_VERIFIED }, null, 2));
  } else {
    console.log("");
    console.log(failed.length === 0 ? `ALL CHECKS PASSED (${results.length - skipped.length} ran${skipped.length ? `, ${skipped.length} skipped` : ""}).` : `${failed.length} CHECK(S) FAILED: ${failed.map((result) => result.id).join(", ")}`);
    if (skipped.length) console.log(`Skipped checks did not run, so they prove nothing: ${skipped.map((result) => result.id).join(", ")}.`);
    console.log("\nNot verified by this command:");
    for (const item of NOT_VERIFIED) console.log(`  - ${item}`);
  }
  return failed.length === 0 ? 0 : 1;
}

if (require.main === module) process.exitCode = main();

module.exports = { CHECKS, judgeTestRun, main, nodeAtLeast, parseCounts };
