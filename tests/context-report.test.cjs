"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const SCRIPT = path.join(__dirname, "..", "scripts", "uca-context-report.cjs");
const { duplicateOverhead, estimateTokens, report } = require(SCRIPT);
const rows = Object.fromEntries(report().map((row) => [row.tier, row]));

test("every tier is measured, with positive sizes", () => {
  assert.deepEqual(Object.keys(rows), ["lite", "standard", "full"]);
  for (const row of Object.values(rows)) {
    assert.ok(row.alwaysOnTokens > 0 && row.typicalTask > row.alwaysOnTokens && row.worstCaseTask >= row.typicalTask, row.tier);
  }
});

test("lighter tiers really are lighter, on every measure that matters per task", () => {
  assert.ok(rows.lite.alwaysOnTokens < rows.standard.alwaysOnTokens && rows.standard.alwaysOnTokens < rows.full.alwaysOnTokens);
  assert.ok(rows.lite.typicalTask < rows.standard.typicalTask && rows.standard.typicalTask < rows.full.typicalTask);
  assert.ok(rows.lite.worstCaseTask < rows.standard.worstCaseTask && rows.standard.worstCaseTask < rows.full.worstCaseTask);
});

test("the lite tier stays inside its stated budget and standard stays well inside a 32K-token model", () => {
  assert.ok(rows.lite.worstCaseTask <= 1600, `lite worst case is ${rows.lite.worstCaseTask}`);
  assert.ok(rows.standard.worstCaseTask <= 9000, `standard worst case is ${rows.standard.worstCaseTask}`);
});

test("a task loads one primary and one companion, never every skill", () => {
  assert.ok(rows.full.worstCaseTask < rows.full.alwaysOnTokens + rows.full.guardrailTokens + rows.full.routerTokens + rows.full.allSkillsTokens);
  assert.equal(rows.lite.routerTokens, 0, "lite has no router file to read");
  assert.ok(rows.full.routerTokens > 0);
});

test("no tier carries duplicated instruction lines", () => {
  for (const row of Object.values(rows)) assert.deepEqual(row.duplicateLines, [], `${row.tier}: ${JSON.stringify(row.duplicateLines)}`);
  for (const row of Object.values(rows)) assert.equal(row.duplicateTokens, 0, row.tier);
});

test("duplicateOverhead counts every repeat after the first, ignores short lines, headings and code fences", () => {
  const line = "Always read the file before relying on its contents.";
  const result = duplicateOverhead({
    a: `# Heading that repeats here\n- ${line}\nshort line\n\`\`\`\n${line}\n\`\`\`\n`,
    b: `# Heading that repeats here\n1. ${line}\nshort line\n`,
    c: `* ${line}\n`
  });
  assert.equal(result.repeated.length, 1);
  assert.deepEqual(result.repeated[0].files.sort(), ["a", "b", "c"]);
  assert.equal(result.tokens, estimateTokens(line.toLowerCase()) * 2);
  assert.equal(duplicateOverhead({ a: "- one unique line that is long enough\n", b: "- another unique line that is long enough\n" }).tokens, 0);
});

test("the report says task success per token is not measured", () => {
  for (const row of Object.values(rows)) assert.match(row.successPerContext, /not measured/);
  const text = spawnSync(process.execPath, [SCRIPT], { encoding: "utf8" });
  assert.equal(text.status, 0);
  assert.match(text.stdout, /Task success per token: not measured/);
});

test("CLI: --json parses, --help works, unknown options are refused", () => {
  assert.equal(JSON.parse(spawnSync(process.execPath, [SCRIPT, "--json"], { encoding: "utf8" }).stdout).length, 3);
  assert.equal(spawnSync(process.execPath, [SCRIPT, "--help"], { encoding: "utf8" }).status, 0);
  assert.equal(spawnSync(process.execPath, [SCRIPT, "--nope"], { encoding: "utf8" }).status, 2);
});
