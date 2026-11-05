"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const check = require("../scripts/uca-design-check.cjs");

const fixture = (name) => fs.readFileSync(path.join(__dirname, "fixtures", "design", name), "utf8");
const ruleIds = (text) => new Set(check.checkText(text).map((finding) => finding.rule));
const ALL = ["default-typeface", "purple-blue-gradient", "glow-or-blob", "generic-copy", "three-up-cards", "emoji-icons", "uniform-rounding-and-shadow", "no-design-tokens"];

test("a typical template page trips every rule, each with a line and evidence", () => {
  const findings = check.checkText(fixture("template.html"));
  assert.deepEqual([...new Set(findings.map((finding) => finding.rule))].sort(), [...ALL].sort());
  for (const finding of findings) {
    assert.ok(finding.line >= 1 && finding.evidence && finding.why, JSON.stringify(finding));
  }
});

test("a page with chosen type, tokens and plain copy is not flagged", () => {
  assert.deepEqual(check.checkText(fixture("specific.html")), []);
});

test("each rule fires on its own tell and not on a near miss", () => {
  assert.ok(ruleIds("body { font-family: Inter, sans-serif; }").has("default-typeface"));
  assert.ok(!ruleIds('body { font-family: "Newsreader", serif; }').has("default-typeface"));
  assert.ok(!ruleIds('@import url("https://fonts.googleapis.com/css2?family=Lora"); body { font-family: system-ui; }').has("default-typeface"));
  assert.ok(ruleIds("a { background: linear-gradient(90deg, #8b5cf6, #3b82f6); }").has("purple-blue-gradient"));
  assert.ok(!ruleIds("a { background: linear-gradient(90deg, #1d1b16, #3b3a33); }").has("purple-blue-gradient"));
  assert.ok(!ruleIds("a { background: linear-gradient(90deg, #ef4444, #f59e0b); }").has("purple-blue-gradient"));
  assert.ok(ruleIds('<div class="bg-gradient-to-r from-purple-500 to-blue-500">').has("purple-blue-gradient"));
  assert.ok(ruleIds('<div class="blur-3xl">').has("glow-or-blob"));
  assert.ok(!ruleIds('<div class="blur-sm">').has("glow-or-blob"));
  assert.ok(ruleIds("<p>Seamlessly connect</p>").has("generic-copy"));
  assert.ok(ruleIds('<button class="x">Get Started</button>').has("generic-copy"));
  assert.ok(!ruleIds("<button>Record payment</button>").has("generic-copy"));
  assert.ok(ruleIds('<div class="md:grid-cols-3">').has("three-up-cards"));
  assert.ok(!ruleIds('<div class="grid-cols-2">').has("three-up-cards"));
  assert.ok(ruleIds("<h2>🚀 Fast</h2><h2>✨ Easy</h2>").has("emoji-icons"));
  assert.ok(!ruleIds("<h2>🚀 Fast</h2>").has("emoji-icons"));
  assert.ok(!ruleIds("<!-- 🚀 ✨ --><p>text</p>").has("emoji-icons"));
});

test("hue detection separates purple, blue and grey", () => {
  assert.ok(check.hueOf("#7c3aed") > 255 && check.hueOf("#7c3aed") < 310);
  assert.ok(check.hueOf("#2563eb") >= 195 && check.hueOf("#2563eb") < 255);
  assert.equal(check.hueOf("#888888"), null);
});

test("each rule can fail: removing one makes the template test notice", () => {
  const rules = check.RULES;
  for (const rule of [...rules]) {
    const index = rules.indexOf(rule);
    rules.splice(index, 1);
    try {
      const seen = new Set(check.checkText(fixture("template.html")).map((finding) => finding.rule));
      assert.equal(seen.has(rule.id), false, rule.id);
      assert.ok(seen.size < ALL.length, `${rule.id} removal changed nothing`);
    } finally {
      rules.splice(index, 0, rule);
    }
  }
  assert.equal(check.RULES.length, ALL.length);
});

function withFolder(files, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "uca-design-"));
  try {
    for (const [name, text] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
      fs.writeFileSync(path.join(dir, name), text);
    }
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
function run(args) {
  const out = [];
  const err = [];
  const code = check.run(args, { out: (text) => out.push(text), err: (text) => err.push(text) });
  return { code, out: out.join("\n"), err: err.join("\n") };
}

test("the command reports files, exits 1 on findings, 0 on none, 2 when there is nothing to check", () => {
  withFolder({ "a/template.html": fixture("template.html"), "b/specific.html": fixture("specific.html"), "node_modules/x/bad.html": fixture("template.html") }, (dir) => {
    const bad = run([path.join(dir, "a")]);
    assert.equal(bad.code, 1);
    assert.match(bad.out, /\[purple-blue-gradient\]/);
    assert.match(bad.out, /does not prove|cannot judge/);
    const good = run([path.join(dir, "b")]);
    assert.equal(good.code, 0);
    assert.match(good.out, /does not prove the design is good/);
    const all = run([dir, "--json"]);
    assert.equal(JSON.parse(all.out).filesChecked, 2, "node_modules is skipped");
  });
  withFolder({ "notes.txt": "x" }, (dir) => assert.equal(run([dir]).code, 2));
  assert.equal(run([]).code, 2);
});

test("it never writes and never follows symlinks out of the folder", () => {
  withFolder({ "a.html": fixture("specific.html") }, (dir) => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "uca-design-out-"));
    try {
      fs.writeFileSync(path.join(outside, "t.html"), fixture("template.html"));
      try { fs.symlinkSync(outside, path.join(dir, "link")); } catch { return; }
      assert.equal(run([dir]).code, 0);
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });
});

const briefProblems = (name) => check.checkBrief(fixture(name));

test("a brief with concrete fonts, hex values, a signature and a departure passes", () => {
  assert.deepEqual(briefProblems("DESIGN-good.md"), []);
  assert.deepEqual(Object.keys(check.parseBrief(fixture("DESIGN-good.md"))).sort(), [...check.BRIEF_FIELDS].sort());
});

test("a brief made of adjectives is rejected field by field", () => {
  const problems = briefProblems("DESIGN-vague.md").join("\n");
  for (const expected of ["Departure: missing", "Direction: only vague words", "Layout: only vague words", "Signature: only vague words", "Color: 0 hex", "Type: no named typeface", "Space: no number", "Stack: no tool named", "Job: too short"]) {
    assert.ok(problems.includes(expected), expected);
  }
});

test("each brief rule fails when its field is weakened", () => {
  const good = fixture("DESIGN-good.md");
  const weaken = (pattern, replacement) => check.checkBrief(good.replace(pattern, replacement)).join("\n");
  assert.match(weaken(/\*\*Type:\*\*.*/, "**Type:** Inter and system-ui"), /Type: no named typeface/);
  assert.match(weaken(/\*\*Color:\*\*.*/, "**Color:** #111111, #222222, #333333"), /Color: 3 hex/);
  assert.match(weaken(/\*\*Signature:\*\*.*/, "**Signature:** modern and sleek"), /Signature: only vague/);
  assert.match(weaken(/\*\*Departure:\*\*.*/, "**Departure:** none"), /Departure: too short/);
  assert.match(weaken(/\*\*Space:\*\*.*/, "**Space:** comfortable"), /Space: no number/);
  assert.match(weaken(/\*\*Stack:\*\*.*/, "**Stack:** whatever works"), /Stack: no tool/);
  assert.match(weaken(/\*\*Job:\*\*.*/, "**Job:** a cafe app"), /Job: too short/);
  assert.match(weaken(/\*\*Direction:\*\*.*\n/, ""), /Direction: missing/);
});

test("heading style briefs are read too, and the command checks a brief file", () => {
  const headings = BRIEF_AS_HEADINGS();
  assert.deepEqual(check.checkBrief(headings), []);
  withFolder({ "DESIGN.md": fixture("DESIGN-good.md") }, (dir) => {
    assert.equal(run(["--brief", path.join(dir, "DESIGN.md")]).code, 0);
  });
  withFolder({ "DESIGN.md": fixture("DESIGN-vague.md") }, (dir) => {
    const result = run(["--brief", path.join(dir, "DESIGN.md")]);
    assert.equal(result.code, 1);
    assert.match(result.out, /problem\(s\) in the brief/);
  });
  assert.equal(run(["--brief", path.join(os.tmpdir(), "uca-no-such-brief.md")]).code, 2);
});

function BRIEF_AS_HEADINGS() {
  const fields = check.parseBrief(fixture("DESIGN-good.md"));
  return check.BRIEF_FIELDS.map((name) => `## ${name}\n${fields[name]}\n`).join("\n");
}
