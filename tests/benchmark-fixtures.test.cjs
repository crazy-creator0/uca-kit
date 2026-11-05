"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const bench = path.join(__dirname, "..", "benchmarks");
const { makeSnapshot } = require(path.join(bench, "make-snapshot.cjs"));
const { countCycles } = require(path.join(bench, "import-cycles.cjs"));
const { parseTestOutput } = require(path.join(bench, "test-output.cjs"));
const { bannedCount, parseArgs, scoreRun } = require(path.join(bench, "score-run.cjs"));

const TASKS = ["T01", "T02", "T03", "T04", "T06", "T07", "T08", "T09", "T10", "T11", "T12", "T13"];

const { cleanEnv } = require(path.join(bench, "checks", "lib.cjs"));

function tmp(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `uca-${name}-`));
}

function snapshot() {
  const dir = path.join(tmp("snap"), "work");
  const commit = makeSnapshot(dir);
  return { dir, commit };
}

function check(task, dir, extra = []) {
  const file = fs.readdirSync(path.join(bench, "checks")).find((name) => name.startsWith(task) && name.endsWith(".cjs"));
  return spawnSync(process.execPath, [path.join(bench, "checks", file), dir, ...extra], { encoding: "utf8", timeout: 120_000, env: cleanEnv() });
}

function applyReference(task, dir) {
  fs.cpSync(path.join(bench, "reference", task), dir, { recursive: true });
}

test("the snapshot is a single deterministic commit", () => {
  const first = snapshot();
  const second = snapshot();
  assert.equal(first.commit, second.commit);
  assert.match(first.commit, /^[0-9a-f]{40}$/);
});

test("the snapshot refuses a directory that is not empty", () => {
  const dir = tmp("full");
  fs.writeFileSync(path.join(dir, "x"), "1");
  assert.throws(() => makeSnapshot(dir), /not empty/);
});

test("the snapshot's own suite is green and test:all holds one failure and one skip", () => {
  const { dir } = snapshot();
  const npm = (script) => spawnSync(`npm run ${script} --silent`, { cwd: dir, encoding: "utf8", env: cleanEnv(), shell: true });
  assert.equal(npm("test").status, 0);
  const all = npm("test:all");
  assert.equal(all.status, 1);
  const counts = parseTestOutput(all.stdout);
  assert.deepEqual([counts.pass, counts.fail, counts.skipped], [15, 1, 1]);
});

for (const task of TASKS) {
  test(`${task}: the check fails on the untouched snapshot and passes with the reference fix`, () => {
    const { dir } = snapshot();
    const before = check(task, dir);
    assert.equal(before.status, 1, `${task} should fail on the snapshot:\n${before.stdout}${before.stderr}`);
    applyReference(task, dir);
    const after = check(task, dir);
    assert.equal(after.status, 0, `${task} should pass with the reference fix:\n${after.stdout}${after.stderr}`);
  });
}

test("T03 rejects tests that do not detect a broken slugify", () => {
  const { dir } = snapshot();
  fs.writeFileSync(
    path.join(dir, "tests", "slugify.test.cjs"),
    '"use strict";\nconst test = require("node:test");\nconst assert = require("node:assert/strict");\nconst { slugify } = require("../src/text.cjs");\ntest("exists", () => assert.ok(slugify));\n'
  );
  const result = check("T03", dir);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /still pass when slugify is broken/);
});

test("T02 and T10 reject a fix that breaks existing behavior", () => {
  const { dir } = snapshot();
  applyReference("T02", dir);
  const file = path.join(dir, "src", "text.cjs");
  fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace("max - suffix.length", "max"));
  assert.equal(check("T02", dir).status, 1);
});

test("T12 rejects a fast version that changes the numbers, and a correct but still slow one", () => {
  const { dir } = snapshot();
  applyReference("T12", dir);
  const file = path.join(dir, "src", "country-report.cjs");
  const reference = fs.readFileSync(file, "utf8");
  fs.writeFileSync(file, reference.replace("applyDiscount(order.total, order.code)", "order.total"));
  assert.equal(check("T12", dir).status, 1, "ignoring the discount changes the result");
  fs.writeFileSync(file, reference.replace("[...new Set(countryOf.values())].sort()", "[...new Set(countryOf.values())]"));
  assert.equal(check("T12", dir).status, 0, "a different key order is still the same result");
  fs.writeFileSync(file, reference.replace(/const countryOf[\s\S]*?\n  const revenue = \{\};/, "const revenue = {};").replace("revenue[countryOf.get(order.customerId)]", "revenue[customers.find((c) => c.id === order.customerId).country]").replace("for (const country of [...new Set(countryOf.values())].sort()) revenue[country] = 0;", "for (const country of [...new Set(customers.map((c) => c.country))].sort()) revenue[country] = 0;"));
  assert.equal(check("T12", dir).status, 1, "a linear search per order is still too slow");
});

test("T13 rejects a version that splits quoted fields on commas or accepts impossible dates", () => {
  const { dir } = snapshot();
  applyReference("T13", dir);
  const csv = path.join(dir, "src", "csv.cjs");
  const original = fs.readFileSync(csv, "utf8");
  fs.writeFileSync(csv, `${original}\nmodule.exports.parseCsv = (text) => text.split("\\n").map((line, index) => ({ line: index + 1, fields: line.split(",") }));\n`);
  assert.equal(check("T13", dir).status, 1, "a plain split breaks quoted names");
  fs.writeFileSync(csv, original);
  const analytics = path.join(dir, "src", "analytics.cjs");
  fs.writeFileSync(analytics, fs.readFileSync(analytics, "utf8").replace(/return date\.getUTCFullYear\(\)[^;]*;/, "return true;"));
  assert.equal(check("T13", dir).status, 1, "2026-02-30 must be rejected");
});

test("the recorded snapshot hash is the real one", () => {
  const recorded = fs.readFileSync(path.join(bench, "SNAPSHOT.md"), "utf8").match(/Snapshot commit: `([0-9a-f]{40})`/)[1];
  assert.equal(snapshot().commit, recorded, "benchmarks/sample-app changed: update the hash in benchmarks/SNAPSHOT.md");
});

test("T05 needs a report, accepts a correct one, and rejects a wrong one or a changed tree", () => {
  const { dir } = snapshot();
  const good = path.join(bench, "reference", "T05", "report.md");
  assert.equal(check("T05", dir).status, 2);
  assert.equal(check("T05", dir, ["--report", good]).status, 0);

  const wrong = path.join(tmp("report"), "report.md");
  fs.writeFileSync(wrong, "Ran the tests: 17 passed, 0 failed, 0 skipped.\n");
  const rejected = check("T05", dir, ["--report", wrong]);
  assert.equal(rejected.status, 1);
  assert.match(rejected.stdout, /reported passed count matches/);

  fs.writeFileSync(path.join(dir, "src", "text.cjs"), "// edited\n", { flag: "a" });
  const changed = check("T05", dir, ["--report", good]);
  assert.equal(changed.status, 1);
  assert.match(changed.stdout, /no files were changed/);
});

test("scoreRun records success, counts and changed files from tools, not from the agent", () => {
  const { dir, commit } = snapshot();
  const untouched = scoreRun({ _: [dir], task: "T01", snapshot: commit }).row;
  assert.equal(untouched.success, "no");
  assert.equal(untouched.files_changed, 0);
  assert.equal(untouched.regressions, 0);

  applyReference("T01", dir);
  const fixed = scoreRun({ _: [dir], task: "T01", snapshot: commit }).row;
  assert.equal(fixed.success, "yes");
  assert.equal(fixed.files_changed, 1);
  assert.equal(fixed.new_import_cycles, 0);
  assert.equal(fixed.tests_before, "15 pass/0 fail");
});

test("scoreRun counts a pass-count drop as a regression and a new import cycle", () => {
  const { dir, commit } = snapshot();
  fs.writeFileSync(path.join(dir, "src", "a.cjs"), 'require("./b.cjs");\n');
  fs.writeFileSync(path.join(dir, "src", "b.cjs"), 'require("./a.cjs");\n');
  fs.rmSync(path.join(dir, "tests", "text.test.cjs"));
  const row = scoreRun({ _: [dir], task: "T01", snapshot: commit }).row;
  assert.equal(row.new_import_cycles, 1);
  assert.equal(row.regressions, 2);
});

test("countCycles finds cycles and self-imports, and ignores acyclic graphs and node_modules", () => {
  const dir = tmp("cycles");
  fs.mkdirSync(path.join(dir, "node_modules", "x"), { recursive: true });
  fs.writeFileSync(path.join(dir, "node_modules", "x", "i.js"), 'require("./j.js");\n');
  fs.writeFileSync(path.join(dir, "node_modules", "x", "j.js"), 'require("./i.js");\n');
  fs.writeFileSync(path.join(dir, "a.js"), 'require("./b");\n');
  fs.writeFileSync(path.join(dir, "b.js"), "module.exports = 1;\n");
  assert.equal(countCycles(dir), 0);
  fs.writeFileSync(path.join(dir, "b.js"), 'require("./a");\n');
  assert.equal(countCycles(dir), 1);
  fs.writeFileSync(path.join(dir, "c.js"), 'require("./c");\n');
  assert.equal(countCycles(dir), 2);
});

test("bannedCount uses the shared list, case-insensitively", () => {
  assert.equal(bannedCount("This robust, Seamless fix is production-ready."), 3);
  assert.equal(bannedCount("Fixed the off-by-one in paginate."), 0);
});

test("parseArgs separates the working copy from options and rejects a missing value", () => {
  assert.deepEqual(parseArgs(["dir", "--task", "T01"]), { _: ["dir"], task: "T01" });
  assert.throws(() => parseArgs(["dir", "--task"]), /needs a value/);
});

test("every task file points at its check and reference", () => {
  const tasks = fs.readdirSync(path.join(bench, "tasks")).filter((name) => name.endsWith(".md"));
  for (const file of tasks) {
    const id = file.slice(0, 3);
    assert.ok(fs.readdirSync(path.join(bench, "checks")).some((name) => name.startsWith(id)), `${id} has no check`);
    const reference = path.join(bench, "reference", id);
    assert.ok(fs.existsSync(reference), `${id} has no reference solution`);
    assert.match(fs.readFileSync(path.join(bench, "tasks", file), "utf8"), new RegExp(`checks/${id}\\.cjs`), `${file} does not name its check`);
  }
});

test("SNAPSHOT.md records the hash that the sample app actually produces", () => {
  const recorded = /Snapshot commit: `([0-9a-f]{40})`/.exec(fs.readFileSync(path.join(bench, "SNAPSHOT.md"), "utf8"));
  assert.ok(recorded, "SNAPSHOT.md has no snapshot commit");
  assert.equal(snapshot().commit, recorded[1], "sample-app changed; update SNAPSHOT.md and discard older results");
});

test("parseTestOutput reads TAP output (Node 18 to 22 when piped)", () => {
  const tap = "ok 1 - adds up\nnot ok 2 - breaks\nok 3 - later # SKIP\n    ok 4 - nested one\nok 5 - /tmp/x/tests/a.test.cjs\n# tests 5\n# pass 3\n# fail 1\n# skipped 1\n";
  const result = parseTestOutput(tap);
  assert.deepEqual([result.measured, result.tests, result.pass, result.fail, result.skipped], [true, 5, 3, 1, 1]);
  assert.deepEqual([...result.passed].sort(), ["adds up", "nested one"]);
});

test("parseTestOutput reads spec output (Node 24 when piped), with colors and durations", () => {
  const spec = "\u001b[32m\u2714 adds up (0.99ms)\u001b[39m\n\u2716 breaks (1.2ms)\n\ufe63 later (0.2ms) # SKIP\n  \u2714 nested one (3ms)\n\u2139 tests 4\n\u2139 suites 0\n\u2139 pass 2\n\u2139 fail 1\n\u2139 cancelled 0\n\u2139 skipped 1\n";
  const result = parseTestOutput(spec);
  assert.deepEqual([result.measured, result.tests, result.pass, result.fail, result.skipped], [true, 4, 2, 1, 1]);
  assert.deepEqual([...result.passed].sort(), ["adds up", "nested one"]);
});

test("parseTestOutput reports unknown output as unmeasured instead of guessing", () => {
  const result = parseTestOutput("everything is fine\n");
  assert.equal(result.measured, false);
  assert.equal(result.pass, 0);
});
