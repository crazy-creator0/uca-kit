"use strict";

// Scenario tests for benchmarks/score-run.cjs. They need Node 22.13+ because the sample app uses node:sqlite.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const bench = path.join(__dirname, "..", "benchmarks");
const { makeSnapshot } = require(path.join(bench, "make-snapshot.cjs"));
const { cleanEnv } = require(path.join(bench, "checks", "lib.cjs"));
const { csvCell, scoreRun, parseArgs } = require(path.join(bench, "score-run.cjs"));

const SCRIPT = path.join(bench, "score-run.cjs");
const GOOD_REPORT = path.join(bench, "reference", "T05", "report.md");

function snapshot(folder = "work") {
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "uca-score-")), folder);
  return { dir, commit: makeSnapshot(dir) };
}

function reference(task, dir) {
  fs.cpSync(path.join(bench, "reference", task), dir, { recursive: true });
}

function cli(args) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8", env: cleanEnv(), timeout: 300_000 });
}

function score(dir, commit, task = "T01", extra = {}) {
  return scoreRun({ _: [dir], task, snapshot: commit, ...extra });
}

function tempFile(name, text) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "uca-score-file-")), name);
  fs.writeFileSync(file, text);
  return file;
}

test("a successful fix is recorded as yes with no regressions, one changed file and no new cycles", () => {
  const { dir, commit } = snapshot();
  reference("T01", dir);
  const { row, problems } = score(dir, commit);
  assert.deepEqual(problems, []);
  assert.equal(row.success, "yes");
  assert.equal(row.regressions, 0);
  assert.equal(row.files_changed, 1);
  assert.equal(row.new_import_cycles, 0);
});

test("a failed task check is recorded as no, not as a measurement problem", () => {
  const { dir, commit } = snapshot();
  const { row, problems } = score(dir, commit);
  assert.equal(row.success, "no");
  assert.deepEqual(problems, []);
});

test("deleting existing tests is recorded as regressions and named", () => {
  const { dir, commit } = snapshot();
  reference("T01", dir);
  fs.rmSync(path.join(dir, "tests", "text.test.cjs"));
  const { row } = score(dir, commit);
  assert.equal(row.regressions, 2);
  assert.match(row.notes, /truncate leaves short text alone/);
});

test("adding new tests does not hide deleted ones", () => {
  const { dir, commit } = snapshot();
  reference("T01", dir);
  fs.rmSync(path.join(dir, "tests", "text.test.cjs"));
  fs.writeFileSync(
    path.join(dir, "tests", "extra.test.cjs"),
    '"use strict";\nconst test = require("node:test");\ntest("extra one", () => {});\ntest("extra two", () => {});\n'
  );
  const { row } = score(dir, commit);
  assert.equal(row.tests_after, "15 pass/0 fail");
  assert.equal(row.regressions, 2, "two tests were deleted and two were added; the count alone would say zero");
});

test("newly added tests are not regressions", () => {
  const { dir, commit } = snapshot();
  reference("T03", dir);
  const { row } = score(dir, commit, "T03");
  assert.equal(row.success, "yes");
  assert.equal(row.regressions, 0);
  assert.equal(row.tests_after, "21 pass/0 fail");
});

test("untracked files and committed changes both count as changed files", () => {
  const { dir, commit } = snapshot();
  reference("T01", dir);
  fs.writeFileSync(path.join(dir, "notes.txt"), "scratch\n");
  assert.equal(score(dir, commit).row.files_changed, 2);
  const git = (...args) => spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.invalid", ...args], { cwd: dir, encoding: "utf8" });
  git("add", "-A");
  assert.equal(git("commit", "-q", "-m", "agent commit").status, 0);
  assert.equal(score(dir, commit).row.files_changed, 2, "a commit made by the agent must not hide its changes");
});

test("a new import cycle is counted", () => {
  const { dir, commit } = snapshot();
  fs.writeFileSync(path.join(dir, "src", "a.cjs"), 'require("./b.cjs");\n');
  fs.writeFileSync(path.join(dir, "src", "b.cjs"), 'require("./a.cjs");\n');
  assert.equal(score(dir, commit).row.new_import_cycles, 1);
});

test("T05 without a report is incomplete, and the CLI exits 3 and still records the row", () => {
  const { dir, commit } = snapshot();
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "uca-out-")), "results.csv");
  const result = cli([dir, "--task", "T05", "--snapshot", commit, "--out", out]);
  assert.equal(result.status, 3, result.stdout + result.stderr);
  assert.match(result.stderr, /INCOMPLETE: the task check could not run to a verdict/);
  const lines = fs.readFileSync(out, "utf8").trim().split("\n");
  assert.equal(lines.length, 2);
  assert.match(lines[1], /,incomplete,/);
  assert.doesNotMatch(lines[1], /,yes,/);
});

test("a report file that does not exist is refused and nothing is recorded", () => {
  const { dir, commit } = snapshot();
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "uca-out-")), "results.csv");
  const result = cli([dir, "--task", "T05", "--snapshot", commit, "--report", path.join(dir, "no-such-report.md"), "--out", out]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Report file not found/);
  assert.equal(fs.existsSync(out), false);
});

test("an empty or wrong report fails T05 instead of passing it", () => {
  const { dir, commit } = snapshot();
  assert.equal(score(dir, commit, "T05", { report: tempFile("report.md", "") }).row.success, "no");
  assert.equal(score(dir, commit, "T05", { report: tempFile("report.md", "All 20 tests passed.") }).row.success, "no");
  assert.equal(score(dir, commit, "T05", { report: GOOD_REPORT }).row.success, "yes");
});

test("a wrong, short or unknown snapshot hash is refused", () => {
  const { dir, commit } = snapshot();
  for (const bad of ["0".repeat(40), commit.slice(0, 7), "nonsense"]) {
    const result = cli([dir, "--task", "T01", "--snapshot", bad]);
    assert.equal(result.status, 2, `${bad}: ${result.stdout}${result.stderr}`);
    assert.match(result.stderr, /Error: /);
  }
  const shortWithOverride = cli([dir, "--task", "T01", "--snapshot", commit.slice(0, 7), "--allow-other-snapshot"]);
  assert.equal(shortWithOverride.status, 2);
  assert.match(shortWithOverride.stderr, /40-character/);
  const unknown = cli([dir, "--task", "T01", "--snapshot", "0".repeat(40), "--allow-other-snapshot"]);
  assert.equal(unknown.status, 2);
  assert.match(unknown.stderr, /is not in/);
});

test("a folder that is not a git repository is refused", () => {
  const { dir, commit } = snapshot();
  fs.rmSync(path.join(dir, ".git"), { recursive: true, force: true });
  const outer = fs.mkdtempSync(path.join(os.tmpdir(), "uca-nogit-"));
  const plain = path.join(outer, "plain");
  fs.cpSync(dir, plain, { recursive: true });
  const result = cli([plain, "--task", "T01", "--snapshot", commit]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /not a git repository/);
});

test("missing token measurements are left empty, never recorded as zero", () => {
  const { dir, commit } = snapshot();
  const { row, problems } = score(dir, commit);
  assert.equal(row.input_tokens, "");
  assert.equal(row.output_tokens, "");
  assert.match(row.notes, /tokens not measured/);
  assert.deepEqual(problems, []);
});

test("incomplete token data makes the run incomplete", () => {
  const { dir, commit } = snapshot();
  reference("T01", dir);
  const oneCount = score(dir, commit, "T01", { "input-tokens": "100", "tokens-source": "host usage panel" });
  assert.equal(oneCount.row.success, "incomplete");
  assert.match(oneCount.problems.join(" "), /only one of/);
  const noSource = score(dir, commit, "T01", { "input-tokens": "100", "output-tokens": "50" });
  assert.equal(noSource.row.success, "incomplete");
  assert.match(noSource.problems.join(" "), /without --tokens-source/);
  assert.equal(score(dir, commit, "T01", { "input-tokens": "ten", "output-tokens": "50", "tokens-source": "host" }).row.success, "incomplete");
  const complete = score(dir, commit, "T01", { "input-tokens": "100", "output-tokens": "50", "tokens-source": "host usage panel" });
  assert.equal(complete.row.success, "yes");
  assert.equal(complete.row.input_tokens, "100");
});

test("a working copy whose tests cannot run is incomplete, not a pass", () => {
  const { dir, commit } = snapshot();
  reference("T01", dir);
  const manifest = path.join(dir, "package.json");
  fs.writeFileSync(manifest, fs.readFileSync(manifest, "utf8").replace(/"test": "[^"]*"/, '"test": "node -e 0"'));
  const { row, problems } = score(dir, commit);
  assert.equal(row.success, "incomplete");
  assert.match(problems.join(" "), /could not be measured/);
  assert.equal(row.regressions, "unmeasured");
});

test("a working copy in a folder with spaces in its path is scored", () => {
  const { dir, commit } = snapshot("my work copy");
  reference("T01", dir);
  assert.equal(score(dir, commit).row.success, "yes");
});

test("the CLI appends one quoted CSV row per run and keeps the header once", () => {
  const { dir, commit } = snapshot();
  reference("T01", dir);
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "uca-out-")), "nested", "results.csv");
  for (let run = 1; run <= 2; run += 1) {
    const result = cli([dir, "--task", "T01", "--snapshot", commit, "--out", out, "--model", "m, with comma", "--run", String(run)]);
    assert.equal(result.status, 0, result.stdout + result.stderr);
  }
  const lines = fs.readFileSync(out, "utf8").trim().split("\n");
  assert.equal(lines.length, 3);
  assert.match(lines[1], /"m, with comma"/);
  assert.equal(lines.filter((line) => line.startsWith("date,")).length, 1);
});

test("csvCell quotes commas, quotes and line breaks", () => {
  assert.equal(csvCell("a,b"), '"a,b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell("a\r\nb"), '"a\r\nb"');
  assert.equal(csvCell("plain"), "plain");
});

test("parseArgs treats --allow-other-snapshot as a flag and rejects other missing values", () => {
  assert.equal(parseArgs(["x", "--allow-other-snapshot"])["allow-other-snapshot"], true);
  assert.throws(() => parseArgs(["x", "--task"]), /needs a value/);
});

test("a suite that prints the spec format is scored the same as one that prints TAP", () => {
  const { dir, commit } = snapshot();
  reference("T01", dir);
  const manifest = path.join(dir, "package.json");
  fs.writeFileSync(manifest, fs.readFileSync(manifest, "utf8").replace('"test": "node --test ', '"test": "node --test --test-reporter=spec '));
  const { row, problems } = score(dir, commit);
  assert.deepEqual(problems, []);
  assert.equal(row.tests_after, "15 pass/0 fail");
  assert.equal(row.regressions, 0);
  assert.equal(row.success, "yes");
});
