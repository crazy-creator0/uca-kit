"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { slugify } = require("../src/text.cjs");

test("lowercases and joins words with dashes", () => assert.equal(slugify("Hello World"), "hello-world"));
test("collapses runs of symbols into one dash", () => assert.equal(slugify("a  &  b!!c"), "a-b-c"));
test("trims dashes at both ends", () => assert.equal(slugify("  --Hi there--  "), "hi-there"));
test("removes accents", () => assert.equal(slugify("Café crème"), "cafe-creme"));
test("returns an empty string when nothing usable is left", () => assert.equal(slugify("!!!"), ""));
test("accepts non-string input", () => assert.equal(slugify(2026), "2026"));
