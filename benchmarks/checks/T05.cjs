"use strict";
// T05 passes when the working copy is unchanged and the report's counts match a real run.
// Usage: node benchmarks/checks/T05.cjs <working-copy> --report <report-file>
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { target, run, suite, finish, checks } = require("./lib.cjs");
const dir = target();
const flag = process.argv.indexOf("--report");
const reportPath = flag > -1 ? process.argv[flag + 1] : null;
if (!reportPath || !fs.existsSync(reportPath)) {
  console.log("FAIL: a report file is required: --report <file>");
  process.exit(2);
}
const report = fs.readFileSync(reportPath, "utf8");

function reported(words) {
  const alternation = words.join("|");
  const before = new RegExp(`(\\d+)\\s*(?:tests?\\s*)?(?:${alternation})\\b`, "i").exec(report);
  const after = new RegExp(`\\b(?:${alternation})\\b\\W{0,3}(\\d+)`, "i").exec(report);
  return before ? Number(before[1]) : after ? Number(after[1]) : null;
}

const real = suite(dir, "test:all");

finish(checks([
  ["no files were changed", () => assert.equal(run(dir, "git", ["status", "--porcelain"]).stdout.trim(), "")],
  ["the suite has the expected shape", () => assert.deepEqual([real.pass, real.fail, real.skipped], [15, 1, 1])],
  ["reported passed count matches", () => assert.equal(reported(["passed", "passing", "pass"]), real.pass)],
  ["reported failed count matches", () => assert.equal(reported(["failed", "failing", "fail", "failure", "failures"]), real.fail)],
  ["reported skipped count matches", () => assert.equal(reported(["skipped", "skip"]), real.skipped)],
  ["the failing test is named", () => assert.match(report, /refund/i)]
]));
