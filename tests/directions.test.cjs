"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const text = fs.readFileSync(path.join(root, ".agents", "skills", "design-taste-discovery", "directions.md"), "utf8");
const FIELDS = ["Fits", "Type", "Color", "Shape", "Layout", "Signature idea", "Motion", "Avoid"];
const GENERIC = new Set(["inter", "system-ui", "roboto", "arial", "helvetica", "sans-serif"]);

function parse(source) {
  return source.split(/^## /m).slice(1).map((block) => {
    const lines = block.split("\n");
    const fields = {};
    for (const line of lines.slice(1)) {
      const match = /^- \*\*([^:]+):\*\*\s*(.+)$/.exec(line);
      if (match) fields[match[1]] = match[2];
    }
    return { name: lines[0].trim(), fields };
  });
}
function problemsOf(source) {
  const list = parse(source);
  const problems = [];
  for (const direction of list) for (const field of FIELDS) if (!direction.fields[field]) problems.push(`${direction.name} is missing ${field}`);
  const palettes = list.map((d) => ((d.fields.Color || "").match(/#[0-9A-Fa-f]{6}/g) || []).join(",").toLowerCase());
  if (new Set(palettes).size !== list.length) problems.push("two directions share a palette");
  if (new Set(list.map((d) => d.name)).size !== list.length) problems.push("two directions share a name");
  return problems;
}
const directions = parse(text);

test("the direction library has at least ten directions with every field", () => {
  assert.ok(directions.length >= 10, `${directions.length} directions`);
  for (const direction of directions) for (const field of FIELDS) assert.ok(direction.fields[field], `${direction.name} is missing ${field}`);
});

test("directions are distinct: unique names, unique accent palettes, and different type pairings", () => {
  assert.equal(new Set(directions.map((d) => d.name)).size, directions.length);
  const palettes = directions.map((d) => (d.fields.Color.match(/#[0-9A-Fa-f]{6}/g) || []).join(",").toLowerCase());
  assert.equal(new Set(palettes).size, directions.length, "two directions share a palette");
  const types = directions.map((d) => d.fields.Type.toLowerCase());
  assert.equal(new Set(types).size, directions.length, "two directions share a type pairing");
});

test("every direction gives real hex values and at least one named, non-default typeface", () => {
  for (const direction of directions) {
    assert.ok((direction.fields.Color.match(/#[0-9A-Fa-f]{6}\b/g) || []).length >= 4, `${direction.name}: needs at least 4 hex values`);
    const fonts = direction.fields.Type.split(/[,(]/).map((part) => part.replace(/\)/g, "").trim().toLowerCase()).filter(Boolean);
    assert.ok(fonts.some((font) => /^[a-z0-9 ]+$/.test(font) && !GENERIC.has(font) && font.length > 3), `${direction.name}: no named typeface`);
  }
});

test("the library tells the model to adapt a direction and never use it unchanged", () => {
  assert.match(text, /Using a direction unchanged is a failure of the brief/);
  assert.match(text, /signature element, and one deliberate departure/);
  const skill = fs.readFileSync(path.join(root, ".agents", "skills", "design-taste-discovery", "SKILL.md"), "utf8");
  assert.match(skill, /read `\.agents\/skills\/design-taste-discovery\/directions\.md`, shortlist two that fit the domain/);
  assert.match(skill, /Never use a direction unchanged/);
  assert.match(skill, /Save the accepted brief as `DESIGN\.md`/);
  assert.match(skill, /--brief DESIGN\.md/);
});

test("directions are original: no known brand, product or template name is used", () => {
  for (const banned of ["Stripe", "Linear", "Vercel", "Notion", "Apple", "Material", "Bootstrap", "Tailwind UI", "Aceternity", "shadcn"]) {
    assert.doesNotMatch(text, new RegExp(`\\b${banned}\\b`, "i"), banned);
  }
});

test("the library ships with the skill in standard and full installs", () => {
  const cli = require(path.join(root, "bin", "cli.cjs"));
  const os = require("node:os");
  for (const tier of ["standard", "full"]) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "uca-dir-"));
    try {
      assert.equal(cli.installKit({ packageRoot: root, projectRoot: dir, platform: "generic", tier }).errors, 0);
      for (const file of ["SKILL.md", "directions.md", "motion.md"]) assert.ok(fs.existsSync(path.join(dir, ".agents", "skills", "design-taste-discovery", file)), `${tier}: ${file}`);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

test("the library check can fail: a duplicated palette or a missing field is caught", () => {
  assert.deepEqual(problemsOf(text), []);
  const duplicate = text.replace(/#F4EFE6, ink #1D1B16, rule #C9BFA9, stamp #B3261E/, "#22282A, ink #EDE9DD, rule #E8B04B, stamp #8A9496");
  assert.notEqual(duplicate, text);
  assert.ok(problemsOf(duplicate).includes("two directions share a palette"));
  const cut = text.replace(/- \*\*Avoid:\*\* stat-card rows, rounded panels, gradients\.\n/, "");
  assert.ok(problemsOf(cut).some((problem) => /Ledger is missing Avoid/.test(problem)));
});
