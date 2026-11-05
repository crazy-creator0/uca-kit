"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("stack migration workflow requires evidence, comparison, and scope definition", () => {
  const workflow = read(".agents/workflows/stack-migration.md");
  assert.match(workflow, /Inspect, where available and relevant/);
  assert.match(workflow, /concrete problem/);
  assert.match(workflow, /Compare the current stack/);
  assert.match(workflow, /migration scope/i);
  assert.match(workflow, /acceptance checks/);
});

test("broad or destructive migration requires explicit approval and rollback planning", () => {
  const workflow = read(".agents/workflows/stack-migration.md");
  assert.match(workflow, /obtain explicit user approval/i);
  assert.match(workflow, /backup and rollback/i);
  assert.match(workflow, /migrate incrementally/i);
  assert.match(workflow, /Do not delete the old implementation or remove dependencies/i);
});

test("shared rules route existing stack changes through migration workflow", () => {
  for (const file of ["AGENTS.md", ".agents/AGENTS.md", "AGENT-SKILL-MAP.md", ".agents/workflows/feature-development.md"]) {
    assert.match(read(file), /stack-migration\.md/, `${file} should reference the migration workflow`);
  }
});
