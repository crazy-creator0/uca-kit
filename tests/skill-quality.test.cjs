"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const skillsDir = path.join(__dirname, "..", ".agents", "skills");
const MAX_BYTES = 9000;
const skills = fs.readdirSync(skillsDir).sort().map((name) => ({ name, text: fs.readFileSync(path.join(skillsDir, name, "SKILL.md"), "utf8") }));

function body(text) {
  return text.replace(/^---\n[\s\S]*?\n---\n/, "");
}
function field(text, key) {
  const match = text.match(new RegExp(`^\\s*${key}:\\s*(.+)$`, "m"));
  return match ? match[1].trim() : "";
}

// Each rule is a plain text signal that a section exists. It cannot judge whether the section is any good.
const RULES = {
  purpose: (text) => field(text, "description").length >= 40 && /^# .+/m.test(body(text)),
  triggers: (text) => field(text, "triggers").length >= 10,
  boundaries: (text) => /\b(do not|don't|never|not for|only when|only if|avoid|instead of|owns?)\b/i.test(body(text)),
  workflow: (text) => /^(?:#{2,3} )?\d+\.\s/m.test(body(text)) || /^#{2,3} .*(workflow|steps?|process|procedure|strategy|checklist|approach|rules|controls)/im.test(body(text)),
  outputFormat: (text) => field(text, "outputs").length >= 10,
  verification: (text) => /\b(verif\w*|confirm\w*|evidence|run the|re-run|test\w*)\b/i.test(body(text))
};

for (const [rule, passes] of Object.entries(RULES)) {
  test(`every skill states its ${rule}`, () => {
    const failing = skills.filter((skill) => !passes(skill.text)).map((skill) => skill.name);
    assert.deepEqual(failing, []);
  });
}

test("no skill is longer than the size limit, so a small-context model can read it", () => {
  const big = skills.filter((skill) => Buffer.byteLength(skill.text) > MAX_BYTES).map((skill) => `${skill.name} (${Buffer.byteLength(skill.text)})`);
  assert.deepEqual(big, []);
});

test("the checks can fail: a skill stripped of each part is caught", () => {
  const sample = skills.find((skill) => skill.name === "testing-and-code-review").text;
  assert.ok(Object.values(RULES).every((passes) => passes(sample)));
  assert.equal(RULES.purpose(sample.replace(/^# .+$/m, "")), false);
  assert.equal(RULES.triggers(sample.replace(/triggers: .+/, "triggers: one")), false);
  assert.equal(RULES.outputFormat(sample.replace(/outputs: .+/, "outputs: x")), false);
  const bare = "---\nname: x\ndescription: " + "d".repeat(50) + "\nmetadata:\n  triggers: a, b\n  outputs: " + "o".repeat(12) + "\n---\n# X\nSome plain words.\n";
  assert.equal(RULES.boundaries(bare), false);
  assert.equal(RULES.workflow(bare), false);
  assert.equal(RULES.verification(bare), false);
});

test("testing-and-code-review tells the model how to trace what a change affects", () => {
  const text = skills.find((skill) => skill.name === "testing-and-code-review").text;
  assert.match(text, /## Change impact/);
  assert.match(text, /callers and dependents with a search, not from memory/);
  assert.match(text, /affected, possibly affected, or unaffected/);
  assert.match(text, /which possibly affected parts you could not check/);
});

test("the design skill commits to concrete choices and ends with a pass/fail review", () => {
  const text = skills.find((skill) => skill.name === "design-taste-discovery").text;
  assert.match(text, /## Step 3 — commit to a design brief/);
  assert.match(text, /hex values/);
  assert.match(text, /"modern" and "clean" are not choices/);
  assert.match(text, /mark it pass or fail with the evidence/);
  assert.match(text, /three feature cards/);
});

// Skills with a "Read first" block let a model decide early what to read. Checked here: the block exists,
// is short, and carries the fields. Whether models obey it is a benchmark question, not tested here.
const READ_FIRST_PILOT = ["debugging", "testing-and-code-review", "performance-engineering", "data-engineering-analytics"];
const READ_FIRST_FIELDS = ["Use when:", "Not when:", "Must do:", "Done when:", "Stop here if:", "Read on only for:"];

function readFirstBlock(text) {
  const match = body(text).match(/^## Read first\n([\s\S]*?)(?=\n\n|\n## |(?![\s\S]))/m);
  return match ? match[0].split("\n").filter(Boolean) : null;
}

test("pilot skills open with a short Read first block that has every field", () => {
  for (const name of READ_FIRST_PILOT) {
    const block = readFirstBlock(skills.find((skill) => skill.name === name).text);
    assert.ok(block, `${name} has no Read first block`);
    assert.ok(block.length <= 8, `${name} Read first block is ${block.length} lines`);
    for (const field of READ_FIRST_FIELDS) assert.ok(block.some((line) => line.startsWith(field)), `${name} is missing "${field}"`);
  }
});

test("the Read first block comes before any other section", () => {
  for (const name of READ_FIRST_PILOT) {
    const headings = body(skills.find((skill) => skill.name === name).text).match(/^## .+$/gm);
    assert.equal(headings[0], "## Read first", name);
  }
});

test("the router rule tells the model to read that block first", () => {
  const rule = fs.readFileSync(path.join(__dirname, "..", ".agents", "router-rule.md"), "utf8");
  assert.match(rule, /## Read first/);
});

test("the Read first check can fail: a missing field or a long block is caught", () => {
  const good = skills.find((skill) => skill.name === "debugging").text;
  assert.ok(readFirstBlock(good));
  assert.equal(readFirstBlock(good.replace("## Read first", "## Intro")), null);
  const noDone = readFirstBlock(good.replace(/^Done when:.*\n/m, ""));
  assert.equal(noDone.some((line) => line.startsWith("Done when:")), false);
  const long = readFirstBlock(good.replace("Stop here if:", "x\nx\nx\nx\nStop here if:"));
  assert.ok(long.length > 8);
});
