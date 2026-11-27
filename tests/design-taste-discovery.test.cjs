"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { readWithParts: readKitFile } = require("../scripts/uca-read.cjs");

const skillPath = path.resolve(__dirname, "../.agents/skills/design-taste-discovery/SKILL.md");
const skill = readKitFile(skillPath);
// Detail moved into reference files that load only when a step points to them (to keep SKILL.md small).
// Rules that moved are checked in the skill together with those files.
const review = readKitFile(path.join(path.dirname(skillPath), "review.md"));
const techniques = readKitFile(path.join(path.dirname(skillPath), "techniques.md"));
const withRefs = `${skill}\n${review}\n${techniques}`;

test("design taste skill has valid metadata and relevant activation scope", () => {
  assert.match(skill, /^---\nname: design-taste-discovery\ndescription: .+\n(?:metadata:\n(?:  .+\n)+)?---/);
  assert.match(skill, /## Read first/); // the old "When to use this skill" section now lives in this block
  assert.match(skill, /Not when: backend or non-visual work/);
});

test("skill warns against generic AI-generated UI patterns without banning styles blindly", () => {
  assert.match(skill, /## Step 5 — avoid generic AI-generated UI patterns/);
  assert.match(withRefs, /Treat these as warning signs to evaluate, not a rigid ban/);
  assert.match(withRefs, /Do not treat any style checklist as a substitute for product-specific judgment/);
});

test("skill treats advanced motion as a first-class design goal, with the detail in motion.md", () => {
  const motion = readKitFile(path.join(path.dirname(skillPath), "motion.md"));
  assert.match(skill, /## Step 6 — design intentional, distinctive motion when requested/);
  assert.match(skill, /page transitions/);
  assert.match(skill, /follow `\.agents\/skills\/design-taste-discovery\/motion\.md`/);
  assert.match(motion, /page-switching transitions/);
  assert.match(motion, /shared-element transitions/);
  assert.match(motion, /do not default to the same fade-up-on-scroll effect/);
  assert.match(motion, /prefers-reduced-motion/);
  assert.match(motion, /rapid repeated input/);
});

test("skill prioritizes product purpose and meaningful interface content", () => {
  assert.match(withRefs, /identify the product's primary job/);
  assert.match(withRefs, /task input and task list should lead/);
  assert.match(withRefs, /Empty states should explain the next useful action/);
  assert.match(withRefs, /Do not add a date, score, stats panel, quote, icon, or other decoration unless it helps/);
});

test("skill requires realistic state and responsive/accessibility review", () => {
  assert.match(withRefs, /empty, populated, completed, long-text, and error states/);
  assert.match(withRefs, /keyboard use, contrast, reduced motion, and empty\/error states/);
  assert.match(withRefs, /Do not claim visual inspection when only source code was checked/);
});

test("skill keeps design choices intentional rather than equating minimalism with quality", () => {
  assert.match(withRefs, /Choose type scale, density, spacing, contrast, borders, and corner radius intentionally/);
  assert.match(withRefs, /equate “less AI-looking” with “unstyled\.?”/);
});

test("the design skill makes the model learn the domain and use real data before choosing a look", () => {
  const skill = readKitFile(path.join(__dirname, "..", ".agents", "skills", "design-taste-discovery", "SKILL.md"));
  assert.match(skill, /## Step 1 — learn the domain/);
  assert.match(skill, /create a cafe management file/);
  assert.match(skill, /Real objects and states/);
  assert.match(skill, /Believable sample data/);
  assert.match(skill, /Never "Item 1" or lorem ipsum/);
});

test("the skill points to its reference files at the step that needs them, and they hold the detail", () => {
  assert.match(skill, /## Step 4[\s\S]*?`\.agents\/skills\/design-taste-discovery\/techniques\.md`/);
  assert.match(skill, /## Step 5[\s\S]*?`\.agents\/skills\/design-taste-discovery\/review\.md`/);
  assert.match(skill, /## Step 7[\s\S]*?`\.agents\/skills\/design-taste-discovery\/review\.md`[\s\S]*?mark it pass or fail with the evidence/);
  assert.match(skill, /Do not claim visual inspection when only source code was checked/);
  assert.match(review, /three feature cards/);
  assert.match(review, /uca-design-check\.cjs/);
  assert.match(techniques, /WebGPU/);
});

test("the design review checks with text first and caps looks at two pictures, with a path for text-only models", () => {
  const evidence = review.split("\n").find((line) => line.startsWith("6. **Evidence:**"));
  assert.match(evidence, /text first: the design check, then a script that prints sizes, positions and overflow/);
  assert.match(evidence, /one look at the main screen[^.]*and a second only at phone width; no more\./);
  assert.match(evidence, /cannot read images marks this item "read, not looked" and hands the look to the user/);
  assert.match(evidence, /Do not claim visual inspection when only source code was checked\./);
});

// The trained look (27 Nov): with and without the kit, one prompt gave nearly the same page.
// Wording checks: they show the step is written down, not that a model follows it.
test("the brief starts from the model's own default look and changes three parts of it", () => {
  const dir = path.join(__dirname, "..", ".agents", "skills", "design-taste-discovery");
  const small = fs.readFileSync(path.join(dir, "parts", "small.md"), "utf8");
  const brief = fs.readFileSync(path.join(dir, "parts", "brief.md"), "utf8");
  for (const text of [small, brief]) {
    assert.match(text, /default look in one line|\*\*Default:\*\* the page you would build with no brief/);
    assert.match(text, /change three parts of it with things from the domain/);
    assert.match(text, /one concrete fact about this business \(invent one if fictional\)/);
  }
  for (const sign of ["01 / About", "status or log card beside the hero", "row of three stats", "faint grid background", "holds up"]) assert.ok(small.includes(sign), sign);
});

test("R-NEW asks for the default look in every tier, word for word", () => {
  const rule = (tier) => fs.readFileSync(path.join(__dirname, "..", ".agents", tier, "CORE.md"), "utf8").match(/^- \*\*R-NEW\*\*.*$/m)[0];
  assert.match(rule("lite"), /your default look and three changes to it from the subject/);
  assert.equal(rule("standard"), rule("lite"));
  assert.equal(rule("full"), rule("lite"));
});

test("directions give a kind of signature, not a device to copy", () => {
  const dir = path.join(__dirname, "..", ".agents", "skills", "design-taste-discovery");
  assert.match(fs.readFileSync(path.join(dir, "directions.md"), "utf8"), /take yours from the domain, never the example itself/);
  const all = fs.readdirSync(path.join(dir, "directions")).map((name) => fs.readFileSync(path.join(dir, "directions", name), "utf8")).join("\n");
  assert.doesNotMatch(all, /rotated label/);
});
