"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const skillsDir = path.join(root, ".agents", "skills");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const skills = fs.readdirSync(skillsDir).filter((n) => fs.statSync(path.join(skillsDir, n)).isDirectory());

function textFiles(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === ".git") continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) textFiles(p, out);
    else if (/\.(md|mdc|json|cjs|mjs|py|yml|yaml)$/.test(e.name)) out.push(p);
  }
  return out;
}

test("every text file is valid UTF-8 with no replacement characters", () => {
  const decoder = new TextDecoder("utf-8", { fatal: true });
  for (const file of textFiles(root)) {
    let text;
    try {
      text = decoder.decode(fs.readFileSync(file));
    } catch {
      assert.fail(`${path.relative(root, file)} is not valid UTF-8`);
    }
    assert.ok(!text.includes(String.fromCharCode(0xfffd)), `${path.relative(root, file)} contains a replacement character`);
  }
});

test("every skill has frontmatter whose name matches its folder", () => {
  assert.ok(skills.length > 0);
  for (const name of skills) {
    const text = read(`.agents/skills/${name}/SKILL.md`);
    const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
    assert.ok(fm, `${name}: missing frontmatter`);
    assert.match(fm[1], new RegExp(`^name:\\s*${name}\\s*$`, "m"), `${name}: name must match folder`);
    assert.match(fm[1], /^description:\s*\S+/m, `${name}: missing description`);
  }
});

test("profiles only reference skills that exist", () => {
  const profiles = JSON.parse(read(".agents/profiles/profiles.json"));
  for (const [profile, def] of Object.entries(profiles)) {
    for (const s of def.skills) {
      if (s === "*") continue;
      assert.ok(skills.includes(s), `profile ${profile} references unknown skill ${s}`);
    }
  }
});

test("router reaches every skill and names no unknown skill", () => {
  const router = read(".agents/router-rule.md");
  for (const s of skills) assert.ok(router.includes("`" + s + "`"), `router does not mention ${s}`);
  for (const m of router.matchAll(/`([a-z0-9-]+)`/g)) {
    const name = m[1];
    const looksLikeSkill = /-(engineering|api|operations|review|slop|hallucination|router|discovery|3d)$/.test(name) || name === "debugging";
    if (looksLikeSkill) assert.ok(skills.includes(name), `router names unknown skill ${name}`);
  }
});

test("router keeps tags optional and is the declared source of truth", () => {
  const router = read(".agents/router-rule.md");
  assert.match(router, /never a requirement/i);
  assert.match(router, /single source of truth/i);
  assert.match(read("AGENTS.md"), /router-rule\.md/);
  assert.match(read("AGENT-SKILL-MAP.md"), /single source of truth/i);
});

test("catalog lists every skill", () => {
  const catalog = read(".agents/catalog/skill-catalog.md");
  for (const s of skills) assert.ok(catalog.includes(`**${s}**`), `catalog missing ${s}`);
});

test("git is never required before changes", () => {
  const agents = read("AGENTS.md");
  assert.doesNotMatch(agents, /Save a commit\/branch before any change/);
  assert.match(agents, /Only run git commands if the user agrees/);
});

test("publishing docs point at the same repository as package.json", () => {
  const pkg = JSON.parse(read("package.json"));
  const slug = /github\.com\/([^/]+\/[^/.]+)/.exec(pkg.repository.url)[1];
  const pub = read("PUBLISHING.md");
  for (const m of pub.matchAll(/github\.com\/([^/\s)]+\/[^/\s).]+)/g)) assert.equal(m[1], slug);
});

// The hand-offs between the planning workflow and the skills it names must point at things that exist and say the same thing.
test("new-project hands off to the design and front-end skills, and each hand-off target exists", () => {
  const root = path.join(__dirname, "..");
  const workflow = fs.readFileSync(path.join(root, ".agents", "workflows", "new-project.md"), "utf8");
  const frontend = fs.readFileSync(path.join(root, ".agents", "skills", "frontend-engineering", "SKILL.md"), "utf8");
  const design = fs.readFileSync(path.join(root, ".agents", "skills", "design-taste-discovery", "SKILL.md"), "utf8");
  assert.match(workflow, /## Size the plan first/);
  assert.match(workflow, /\*\*Plan block/);
  assert.match(workflow, /`design-taste-discovery` Step 1/);
  assert.match(workflow, /"Stack decision" in `frontend-engineering`/);
  assert.match(workflow, /`design-taste-discovery` Step 3/);
  assert.match(workflow, /`design-taste-discovery` Step 7/);
  assert.match(workflow, /scripts\/uca-design-check\.cjs/);
  assert.match(frontend, /## Stack decision/);
  for (const phrase of ["One file, a single page", "Small interactive tool", "Several views sharing state", "Mostly content, SEO", "Needs accounts, shared data"]) assert.ok(frontend.includes(phrase), phrase);
  assert.match(design, /## Step 1 — learn the domain/);
  assert.match(design, /## Step 3 — commit to a design brief/);
  assert.match(design, /## Step 7 — review like a product designer/);
  assert.match(design, /"Stack decision"/);
  assert.ok(fs.existsSync(path.join(root, "scripts", "uca-design-check.cjs")));
  // Every skill name in backticks inside a workflow is a real skill.
  const skills = new Set(fs.readdirSync(path.join(root, ".agents", "skills")));
  for (const file of fs.readdirSync(path.join(root, ".agents", "workflows"))) {
    const text = fs.readFileSync(path.join(root, ".agents", "workflows", file), "utf8");
    for (const [, name] of text.matchAll(/`([a-z0-9]+(?:-[a-z0-9]+)+)`/g)) {
      if (/-(engineering|review|hallucination|slop|discovery|router|hygiene|api|operations|analytics|3d)$/.test(name)) assert.ok(skills.has(name), `${file} names ${name}, which is not a skill`);
    }
  }
});
