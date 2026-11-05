"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const SCRIPT = path.join(__dirname, "verify.cjs");
const { CHECKS, judgeTestRun, nodeAtLeast, parseCounts } = require(SCRIPT);

const tap = (pass, fail, extra = "") => `# tests ${pass + fail}\n# pass ${pass}\n# fail ${fail}\n${extra}`;
const cli = (args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8", timeout: 120_000 });

test("parseCounts reads the last totals in TAP output", () => {
  assert.deepEqual(parseCounts(`${tap(3, 0)}\n${tap(10, 2, "# skipped 1\n")}`), { tests: 12, pass: 10, fail: 2, skipped: 1 });
  assert.deepEqual(parseCounts("nothing here"), { tests: null, pass: null, fail: null, skipped: null });
});

test("parseCounts also reads the summary newer Node versions print, with colour codes", () => {
  const spec = "\u001b[34mℹ tests 12\u001b[39m\nℹ suites 0\n\u001b[32mℹ pass 10\u001b[39m\nℹ fail 2\nℹ cancelled 0\nℹ skipped 1\n";
  assert.deepEqual(parseCounts(spec), { tests: 12, pass: 10, fail: 2, skipped: 1 });
  assert.equal(judgeTestRun({ status: 0, text: "ℹ tests 5\nℹ pass 5\nℹ fail 0\n" }).status, "PASS");
  assert.equal(judgeTestRun({ status: 0, text: "ℹ tests 5\nℹ pass 4\nℹ fail 1\n" }).status, "FAIL");
});

test("a run passes only when it exits 0, has no failures and reports passing tests", () => {
  assert.equal(judgeTestRun({ status: 0, text: tap(5, 0) }).status, "PASS");
  assert.equal(judgeTestRun({ status: 1, text: tap(5, 1) }).status, "FAIL");
  assert.equal(judgeTestRun({ status: 1, text: tap(5, 0) }).status, "FAIL", "a non-zero exit fails even if the counts look fine");
  assert.equal(judgeTestRun({ status: 0, text: tap(4, 1) }).status, "FAIL", "a failure count fails even with exit 0");
  assert.equal(judgeTestRun({ status: 0, text: "" }).status, "FAIL", "exit 0 with no tests reported is a broken runner, not a pass");
  assert.equal(judgeTestRun({ status: 0, text: tap(0, 0) }).status, "FAIL");
  assert.equal(judgeTestRun({ status: null, text: "", timedOut: true }).status, "FAIL");
});

test("nodeAtLeast compares major and minor", () => {
  assert.equal(nodeAtLeast(0, 0), true);
  assert.equal(nodeAtLeast(999, 0), false);
});

test("every check has an id, a title and a run function, and ids are unique", () => {
  const ids = CHECKS.map((check) => check.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(ids, ["suite", "bench", "python", "pack", "route", "context", "smoke"]);
  for (const check of CHECKS) assert.ok(check.title && typeof check.run === "function", check.id);
});

test("the fast checks run for real and pass", () => {
  const result = cli(["--only", "pack,route,context,smoke"]);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  for (const id of ["npm package contents", "Reference router", "Instruction size", "Real CLI"]) assert.match(result.stdout, new RegExp(`PASS\\s+${id}`));
  assert.match(result.stdout, /ALL CHECKS PASSED \(4 ran\)/);
  assert.match(result.stdout, /Not verified by this command/);
  assert.match(result.stdout, /No model has been scored/);
});

test("--json is parseable, --list names the checks, and bad options are refused", () => {
  const json = JSON.parse(cli(["--only", "context", "--json"]).stdout);
  assert.equal(json.ok, true);
  assert.equal(json.results[0].id, "context");
  assert.ok(json.notVerified.length >= 3);
  assert.match(cli(["--list"]).stdout, /smoke\s+Real CLI/);
  assert.equal(cli(["--nope"]).status, 2);
  assert.equal(cli(["--only", "nothing"]).status, 2);
  assert.equal(cli(["--only"]).status, 2);
});

test("a failing check makes the command exit 1 and is named in the summary", () => {
  const original = CHECKS.find((check) => check.id === "context").run;
  CHECKS.find((check) => check.id === "context").run = () => ({ status: "FAIL", detail: "forced" });
  try {
    const lines = [];
    const log = console.log;
    console.log = (line = "") => lines.push(String(line));
    const code = require(SCRIPT).main(["--only", "context"]);
    console.log = log;
    assert.equal(code, 1);
    assert.match(lines.join("\n"), /1 CHECK\(S\) FAILED: context/);
  } finally {
    CHECKS.find((check) => check.id === "context").run = original;
  }
});
