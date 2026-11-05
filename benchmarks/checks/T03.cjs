"use strict";
// T03 passes when new tests for slugify pass, and fail when slugify is broken in two separate ways.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { target, suite, finish, checks, green } = require("./lib.cjs");
const dir = target();

function testFiles(root) {
  const base = path.join(root, "tests");
  return fs.readdirSync(base).filter((name) => /\.test\.c?js$/.test(name)).map((name) => path.join(base, name));
}

const mentioning = testFiles(dir).filter((file) => /slugify/.test(fs.readFileSync(file, "utf8")));

// "from" is a string or a regular expression; the mutation must find exactly the code it means to break.
function mutate(label, from, to) {
  return [label, () => {
    const copy = fs.mkdtempSync(path.join(os.tmpdir(), "uca-bench-t03-"));
    try {
      fs.cpSync(dir, copy, { recursive: true });
      const file = path.join(copy, "src", "text.cjs");
      const source = fs.readFileSync(file, "utf8");
      const found = typeof from === "string" ? source.includes(from) : from.test(source);
      assert.ok(found, "mutation target not found; the snapshot changed");
      fs.writeFileSync(file, source.replace(from, to));
      assert.equal(suite(copy).ok, false, "the tests still pass when slugify is broken");
    } finally {
      fs.rmSync(copy, { recursive: true, force: true });
    }
  }];
}

finish(checks([
  ["a test file mentions slugify", () => assert.ok(mentioning.length > 0, "no test mentions slugify")],
  ["the suite passes", () => green(dir)],
  mutate("tests fail when edge dashes are no longer trimmed", '.replace(/^-+|-+$/g, "")', ""),
  mutate("tests fail when accents are no longer removed", /\.replace\(\/\[(?:\\u0300|\u0300)[^\]]*\]\/g, ""\)/, "")
]));
