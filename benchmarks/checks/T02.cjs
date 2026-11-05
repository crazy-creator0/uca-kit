"use strict";
const assert = require("node:assert/strict");
const { target, load, suite, finish, checks, green } = require("./lib.cjs");
const dir = target();

finish(checks([
  ["suffix option replaces the ellipsis within the limit", () => assert.equal(load(dir, "src/text.cjs").truncate("hello world", 8, { suffix: "..." }), "hello...")],
  ["default behavior is unchanged", () => assert.equal(load(dir, "src/text.cjs").truncate("hello world", 8), "hello w…")],
  ["short text is untouched with a suffix", () => assert.equal(load(dir, "src/text.cjs").truncate("hi", 8, { suffix: "..." }), "hi")],
  ["the suite still passes", () => green(dir)]
]));
