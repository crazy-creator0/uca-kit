"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");
const taskFiles = fs.readdirSync(path.join(root, "benchmarks", "tasks")).filter((f) => f.endsWith(".md")).sort();
const skills = fs.readdirSync(path.join(root, ".agents", "skills"));

test("there are thirteen benchmark tasks with consecutive ids", () => {
  assert.equal(taskFiles.length, 13);
  taskFiles.forEach((file, index) => assert.ok(file.startsWith(`T${String(index + 1).padStart(2, "0")}-`), file));
});

test("every task has a fault, a verbatim prompt, an external pass check and an expected skill", () => {
  for (const file of taskFiles) {
    const text = read("benchmarks", "tasks", file);
    for (const heading of [
      "## Fault or starting state the snapshot must contain",
      "## Prompt (paste unchanged)",
      "## Pass check",
      "## Expected skill (kit runs)"
    ]) {
      assert.ok(text.includes(heading), `${file} is missing "${heading}"`);
    }
    const skill = text.split("## Expected skill (kit runs)")[1].trim();
    assert.ok(skills.includes(skill), `${file} names an unknown skill: ${skill}`);
    const check = text.split("## Pass check")[1].split("##")[0];
    assert.doesNotMatch(check, /agent'?s? (own )?(report|claim)s? (says|states)/i, `${file} pass check trusts the agent`);
  }
});

test("the results template has a column for every metric in EVALUATION.md", () => {
  const header = read("benchmarks", "results-template.csv").trim().split(",");
  for (const column of [
    "success", "tests_before", "tests_after", "regressions", "seconds", "input_tokens", "output_tokens",
    "tokens_source", "files_changed", "routing_expected_skill", "routing_opened", "unsupported_claims",
    "new_import_cycles", "banned_wording", "condition", "model", "task", "run"
  ]) {
    assert.ok(header.includes(column), `missing column ${column}`);
  }
  assert.equal(new Set(header).size, header.length, "duplicate column");
});

test("the evaluation states it has not been run and records no results", () => {
  const text = read("EVALUATION.md");
  assert.match(text, /designed, not run/i);
  assert.match(text, /never estimated as characters divided by four/i);
  assert.equal(fs.existsSync(path.join(root, "benchmarks", "results")), false, "results exist; update the status line and add limits");
});

test("the handoff test requires a false claim and evidence-only input", () => {
  const text = read("benchmarks", "handoff-test.md");
  assert.match(text, /at least one false claim/);
  assert.match(text, /Do not include Model 1's free-text conclusions/);
  assert.match(text, /before relying on any claim/);
});

test("the evaluation files are maintainer-only and not shipped in the package", () => {
  const files = JSON.parse(read("package.json")).files;
  assert.ok(!files.some((entry) => /benchmarks|EVALUATION/.test(entry)));
});
