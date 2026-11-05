"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const SKILLS_DIR = path.join(ROOT, ".agents", "skills");
const skills = fs
  .readdirSync(SKILLS_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), "utf8");

const KEYS = ["domain", "triggers", "prerequisites", "outputs", "priority"];
const PRIORITIES = ["guardrail", "task", "situational"];

function frontmatterOf(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  assert.ok(match, "missing frontmatter");
  return match[1];
}

function metadataOf(name) {
  const front = frontmatterOf(read(`.agents/skills/${name}/SKILL.md`));
  const block = /^metadata:\r?\n((?:[ \t]+.*(?:\r?\n|$))+)/m.exec(front);
  assert.ok(block, `${name}: missing metadata block`);
  const fields = {};
  for (const line of block[1].split(/\r?\n/)) {
    const match = /^[ \t]+([a-z]+):\s*(.*)$/.exec(line);
    if (match) fields[match[1]] = match[2].trim();
  }
  return fields;
}

test("every skill has router metadata with all five fields filled in", () => {
  for (const name of skills) {
    const fields = metadataOf(name);
    for (const key of KEYS) {
      assert.ok(fields[key] && fields[key].length > 0, `${name}: metadata.${key} is empty`);
    }
    assert.deepEqual(Object.keys(fields).sort(), [...KEYS].sort(), `${name}: unexpected metadata fields`);
  }
});

test("metadata priority is one of guardrail, task, or situational", () => {
  for (const name of skills) {
    assert.ok(PRIORITIES.includes(metadataOf(name).priority), `${name}: invalid priority`);
  }
});

test("the guardrail skills are exactly the always-on ones named in the router", () => {
  const router = read(".agents/router-rule.md");
  const always = /Guardrails are always on\*\* \(([^)]*)\)/.exec(router);
  assert.ok(always, "router should name its always-on guardrails");
  const named = [...always[1].matchAll(/`([a-z0-9-]+)`/g)].map((match) => match[1]).sort();
  const tagged = skills.filter((name) => metadataOf(name).priority === "guardrail").sort();
  assert.deepEqual(tagged, named);
});

test("the router routes on intent, checks the real stack, explains its choice, and honors user override", () => {
  const router = read(".agents/router-rule.md");
  assert.match(router, /Check the real stack first/);
  assert.match(router, /not by a word it contains/);
  assert.match(router, /Say why in one line/);
  assert.match(router, /If the user names a skill or asks you to skip one, follow that/);
  assert.match(router, /never a requirement/);
  assert.match(router, /single source of truth/i);
});

test("skills share no guidance lines (exact, near-duplicate, or copied into a longer line) with other skills", () => {
  const normalize = (line) => line.trim().replace(/^[-*\d.\s]+/, "").replace(/\s+/g, " ").toLowerCase();
  const lines = [];
  for (const name of skills) {
    const text = read(`.agents/skills/${name}/SKILL.md`);
    const body = text.slice(text.indexOf("\n---", 3) + 4);
    for (const line of body.split(/\r?\n/)) {
      const normalized = normalize(line);
      if (normalized.length >= 30) lines.push({ name, normalized, words: new Set(normalized.split(" ")) });
    }
  }
  const similar = [];
  for (let i = 0; i < lines.length; i += 1) {
    for (let j = i + 1; j < lines.length; j += 1) {
      if (lines[i].name === lines[j].name) continue;
      const shared = [...lines[i].words].filter((word) => lines[j].words.has(word)).length;
      const union = lines[i].words.size + lines[j].words.size - shared;
      const smaller = Math.min(lines[i].words.size, lines[j].words.size);
      // Similar when the lines overlap heavily, or when most of the shorter line appears in the longer one.
      if (shared / union >= 0.7 || (smaller >= 8 && shared / smaller >= 0.85)) {
        similar.push(`${lines[i].name} <> ${lines[j].name}: ${lines[i].normalized.slice(0, 60)}`);
      }
    }
  }
  assert.deepEqual(similar, [], "move shared guidance to one canonical skill and point to it");
});
