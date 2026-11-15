"use strict";

// The samples gallery (demo/samples/) must match what is on disk: every tile has its prompt, both results and both
// closing answers; the prompt shown on the page is the one in PROMPT.md; version labels are real releases; and the
// pages stay self-contained and free of local paths.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const samples = path.join(root, "demo", "samples");
const read = (...parts) => fs.readFileSync(path.join(...parts), "utf8");
const gallery = read(samples, "index.html");
const slugs = [...gallery.matchAll(/<a class="tile" href="([a-z0-9-]+)\/">/g)].map((match) => match[1]);
const unescape = (text) => text.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, "&");

test("the gallery lists every sample folder, and each folder has the prompt, both results and both closing answers", () => {
  const folders = fs.readdirSync(samples, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  assert.ok(slugs.length >= 3, "expected at least three samples");
  assert.deepEqual([...slugs].sort(), folders, "tiles and folders differ");
  for (const slug of slugs) {
    for (const file of ["index.html", "PROMPT.md", "without-kit/index.html", "with-kit/index.html", "without-kit/CLOSING-ANSWER.md", "with-kit/CLOSING-ANSWER.md"]) {
      assert.ok(fs.existsSync(path.join(samples, slug, file)), `${slug}/${file} is missing`);
    }
  }
});

test("each sample page has the three tabs, both results framed, and the tile labels", () => {
  for (const slug of slugs) {
    const page = read(samples, slug, "index.html");
    for (const label of [">Prompt<", ">Without kit<", ">With kit<"]) assert.ok(page.includes(label), `${slug}: tab ${label} missing`);
    assert.match(page, /<iframe src="without-kit\/index.html"/);
    assert.match(page, /<iframe src="with-kit\/index.html"/);
    for (const chip of ["Category:", "Made with:", "View:", "Motion:"]) assert.ok(page.includes(chip), `${slug}: ${chip} missing`);
  }
});

test("the prompt on each page is the prompt in its PROMPT.md, word for word", () => {
  for (const slug of slugs) {
    const fromFile = read(samples, slug, "PROMPT.md").match(/```\n([\s\S]*?)\n```/)[1].trim();
    const fromPage = unescape(read(samples, slug, "index.html").match(/<pre class="prompt">([\s\S]*?)<\/pre>/)[1]).trim();
    assert.equal(fromPage, fromFile, `${slug}: the page shows a different prompt`);
  }
});

test("every 'Made with' label is a released version in the changelog, or says it came before the first release", () => {
  const changelog = read(root, "CHANGELOG.md");
  for (const [, label] of gallery.matchAll(/<b>Made with:<\/b> ([^<]+)</g)) {
    if (label === "before v0.1.0") continue;
    const version = label.replace(/^v/, "");
    assert.match(label, /^v\d+\.\d+\.\d+$/, `odd version label: ${label}`);
    assert.match(changelog, new RegExp(`^## ${version.replace(/\./g, "\\.")} \\(`, "m"), `${label} is not in CHANGELOG.md`);
  }
});

test("site pages are self-contained and contain no local paths or personal addresses", () => {
  const pages = [path.join(root, "demo", "index.html"), path.join(samples, "index.html"), ...slugs.map((slug) => path.join(samples, slug, "index.html"))];
  for (const file of pages) {
    const html = fs.readFileSync(file, "utf8");
    assert.doesNotMatch(html, /<script[^>]+src=|<link[^>]+stylesheet/i, `${file} loads code or styles from elsewhere`);
    assert.doesNotMatch(html, /\/home\/|C:\\Users\\|@gmail\./i, `${file} has a local path or personal address`);
    assert.match(html, /Created with UCA Kit/);
    assert.match(html, /not proof/);
  }
  for (const slug of slugs) {
    for (const side of ["without-kit", "with-kit"]) {
      assert.doesNotMatch(read(samples, slug, side, "CLOSING-ANSWER.md"), /\/home\/|C:\\Users\\/, `${slug}/${side}: local path in the closing answer`);
    }
  }
});

test("the old docs address sends visitors to the home page", () => {
  assert.match(read(root, "demo", "docs", "index.html"), /http-equiv="refresh" content="0; url=\.\.\/"/);
});
