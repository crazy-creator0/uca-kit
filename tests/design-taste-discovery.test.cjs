"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const skillPath = path.resolve(__dirname, "../.agents/skills/design-taste-discovery/SKILL.md");
const skill = fs.readFileSync(skillPath, "utf8");

test("design taste skill has valid metadata and relevant activation scope", () => {
  assert.match(skill, /^---\nname: design-taste-discovery\ndescription: .+\n(?:metadata:\n(?:  .+\n)+)?---/);
  assert.match(skill, /## When to use this skill/);
});

test("skill warns against generic AI-generated UI patterns without banning styles blindly", () => {
  assert.match(skill, /## Step 5 — avoid generic AI-generated UI patterns/);
  assert.match(skill, /Treat these as warning signs to evaluate, not a rigid ban/);
  assert.match(skill, /Do not treat any style checklist as a substitute for product-specific judgment/);
});

test("skill treats advanced motion as a first-class design goal, with the detail in motion.md", () => {
  const motion = fs.readFileSync(path.join(path.dirname(skillPath), "motion.md"), "utf8");
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
  assert.match(skill, /identify the product's primary job/);
  assert.match(skill, /task input and task list should lead/);
  assert.match(skill, /Empty states should explain the next useful action/);
  assert.match(skill, /Do not add a date, score, stats panel, quote, icon, or other decoration unless it helps/);
});

test("skill requires realistic state and responsive/accessibility review", () => {
  assert.match(skill, /empty, populated, completed, long-text, and error states/);
  assert.match(skill, /keyboard use, contrast, reduced motion, and empty\/error states/);
  assert.match(skill, /Do not claim visual inspection when only source code was checked/);
});

test("skill keeps design choices intentional rather than equating minimalism with quality", () => {
  assert.match(skill, /Choose type scale, density, spacing, contrast, borders, and corner radius intentionally/);
  assert.match(skill, /equate “less AI-looking” with “unstyled\.?”/);
});

test("the design skill makes the model learn the domain and use real data before choosing a look", () => {
  const skill = fs.readFileSync(path.join(__dirname, "..", ".agents", "skills", "design-taste-discovery", "SKILL.md"), "utf8");
  assert.match(skill, /## Step 1 — learn the domain/);
  assert.match(skill, /create a cafe management file/);
  assert.match(skill, /Real objects and states/);
  assert.match(skill, /Believable sample data/);
  assert.match(skill, /Never "Item 1" or lorem ipsum/);
});
