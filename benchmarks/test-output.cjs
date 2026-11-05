"use strict";

// Reads the output of `node --test`. The format depends on the Node version and on whether the output
// is a terminal: older versions print TAP ("ok 1 - name", "# pass 15"), newer ones print the spec
// format ("✔ name (1.2ms)", "ℹ pass 15"). Both are understood. Unknown output is reported as unmeasured.

const SUMMARY = /^(?:# |ℹ )(tests|pass|fail|skipped)\s+(\d+)\s*$/;
const TAP_OK = /^\s*ok \d+ - (.+?)(?:\s+# (SKIP|TODO).*)?$/;
const SPEC_OK = /^\s*✔ (.+?)(?:\s+\(\d+(?:\.\d+)?ms\))?$/;
const SPEC_SKIP = /−|﹣|# SKIP|# TODO/;
const FILE_ENTRY = /\.(c|m)?(js|ts)$/;

function parseTestOutput(text) {
  const counts = {};
  const passed = new Set();
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.replace(/\u001b\[[0-9;]*m/g, "");
    const summary = SUMMARY.exec(line);
    if (summary) {
      counts[summary[1]] = Number(summary[2]);
      continue;
    }
    const match = TAP_OK.exec(line) || SPEC_OK.exec(line);
    if (!match || SPEC_SKIP.test(line)) continue;
    const name = match[1].trim();
    // Some versions list each test file as an entry named by its path; paths differ between folders.
    if (!FILE_ENTRY.test(name)) passed.add(name);
  }
  return {
    measured: counts.tests !== undefined,
    tests: counts.tests || 0,
    pass: counts.pass || 0,
    fail: counts.fail || 0,
    skipped: counts.skipped || 0,
    passed
  };
}

module.exports = { parseTestOutput };
