"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { truncate } = require("../src/text.cjs");

test("truncate leaves short text alone", () => {
  assert.equal(truncate("hello", 8), "hello");
});

test("truncate shortens long text with an ellipsis character", () => {
  assert.equal(truncate("hello world", 8), "hello w…");
});
