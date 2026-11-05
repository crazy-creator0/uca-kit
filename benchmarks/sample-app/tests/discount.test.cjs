"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { applyDiscount } = require("../src/discount.cjs");

test("SAVE10 takes ten percent off", () => assert.equal(applyDiscount(50, "SAVE10"), 45));
test("FLAT5 takes five off but never below zero", () => {
  assert.equal(applyDiscount(50, "FLAT5"), 45);
  assert.equal(applyDiscount(3, "FLAT5"), 0);
});
test("an unknown code changes nothing", () => assert.equal(applyDiscount(50, "NOPE"), 50));
