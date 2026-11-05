"use strict";

// Keeps the documentation page honest: what it names must exist in the repository.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const page = fs.readFileSync(path.join(root, "demo", "docs", "index.html"), "utf8");
const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
const tiers = JSON.parse(fs.readFileSync(path.join(root, ".agents", "tiers.json"), "utf8"));
const text = page.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, "");

test("the page is a well-formed, self-contained document", () => {
  assert.match(page, /^<!doctype html>/i);
  assert.match(page, /<html lang="en">/);
  assert.match(page, /<meta name="viewport"/);
  assert.match(page, /<title>[^<]+<\/title>/);
  assert.ok(!/<script[^>]+src=/i.test(page), "no external scripts");
  assert.ok(!/<link[^>]+href=/i.test(page), "no external stylesheets or fonts");
  const external = [...page.matchAll(/https?:\/\/[^\s"'<)]+/g)].map((m) => m[0]).filter((url) => !url.startsWith("https://github.com/crazy-creator0/uca-kit"));
  assert.deepEqual(external, []);
});

test("it respects reduced motion, can be paused, and hides decoration from screen readers", () => {
  assert.match(page, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(page, /data-pause=/);
  const svgs = page.match(/<svg\b[^>]*>/g) || [];
  assert.ok(svgs.length >= 3);
  for (const tag of svgs) assert.match(tag, /aria-hidden="true"/);
});

test("every file path the page names exists in the repository", () => {
  const named = new Set([...text.matchAll(/<code>([^<]+)<\/code>/g)].map((m) => m[1]).filter((value) => /^(?:\.agents|\.uca|scripts|docs)\/[\w./-]+$/.test(value)));
  const generated = new Set([".uca/config.json", ".uca/backup/", "HANDOFF.md"]);
  assert.ok(named.size >= 5);
  for (const file of named) if (!generated.has(file)) assert.ok(fs.existsSync(path.join(root, file)), `${file} is named on the page but does not exist`);
});

test("the install command matches the README and the tiers match tiers.json", () => {
  assert.ok(readme.includes("npx --yes github:crazy-creator0/uca-kit init . --platform generic"));
  assert.ok(text.includes("npx --yes github:crazy-creator0/uca-kit init . --platform generic"));
  for (const tier of Object.keys(tiers)) assert.ok(text.includes(`<code>${tier}</code>`), `tier ${tier} missing from the page`);
});

test("the Senior Bar section lists as many checks as the script scores", () => {
  const { CHECKS } = require(path.join(root, "scripts", "uca-senior-check.cjs"));
  assert.equal(CHECKS.length, 16);
  assert.match(text, /The 16 scored checks/);
});

test("the guard's exit codes on the page match the script", () => {
  const { EXIT } = require(path.join(root, "scripts", "uca-guard.cjs"));
  assert.deepEqual(Object.values(EXIT).sort(), [0, 1, 2, 3, 4]);
  assert.match(text, /0 passed, 1 failed with no trigger yet, 2 usage or config error, 3 handoff written, 4 stop/);
});

test("the page says it was created with the kit, and makes no result claims", () => {
  assert.match(text, /Created with UCA Kit/);
  assert.match(text, /not proof that the kit improves results/);
  assert.ok(!/\b(guarantee[sd]?|proven|best[- ]in[- ]class|10x)\b/i.test(text.replace(/does not guarantee results/g, "").replace(/not guarantee/g, "")));
  assert.match(text, /No scored runs against real models have been published yet/);
});
