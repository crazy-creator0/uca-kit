"use strict";

// Fixed cost per host: every platform the installer knows is measured, from a real install, and no host is
// reported as checked unless a check was recorded.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { HOSTS, HOST_CHECKED, listedText, report } = require("../scripts/uca-host-cost.cjs");
const { PLATFORM_ENTRIES } = require("../bin/cli.cjs");

const rows = report("standard");

test("every platform the installer supports has a host row, and every entry file exists after install", () => {
  assert.deepEqual(Object.keys(HOSTS).sort(), Object.keys(PLATFORM_ENTRIES).sort());
  for (const row of rows) assert.deepEqual(row.entryFiles, HOSTS[row.platform].entry, `${row.platform}: an entry file was not installed`);
});

test("fixed cost adds up, includes AGENTS.md and CORE once, and lists skills only for hosts that list them", () => {
  for (const row of rows) {
    assert.equal(row.fixed, row.entry + row.everyTask + row.skillList, row.platform);
    assert.ok(row.everyTask > 0 || row.entryFiles.includes("AGENTS.md"), row.platform);
    if (HOSTS[row.platform].skills) assert.equal(row.skills, 16, `${row.platform}: all 16 skills listed`);
    else assert.equal(row.skillList, 0, row.platform);
  }
  const lite = report("lite");
  for (const row of lite) assert.ok(row.fixed < rows.find((item) => item.platform === row.platform).fixed, `${row.platform}: lite is lighter`);
});

test("only name and description are counted for a listed skill", () => {
  const text = listedText(path.join(__dirname, "..", ".agents", "skills", "debugging", "SKILL.md"));
  assert.match(text, /^name: debugging\ndescription: Use when /);
  assert.doesNotMatch(text, /metadata|##/);
});

test("no host is reported as checked until a check is recorded", () => {
  assert.deepEqual(HOST_CHECKED, {});
  for (const row of rows) assert.equal(row.basis, "intended, from install files, not run");
  const doc = fs.readFileSync(path.join(__dirname, "..", "docs", "TOOL-COMPATIBILITY.md"), "utf8");
  assert.match(doc, /node scripts\/uca-host-cost\.cjs/);
});
