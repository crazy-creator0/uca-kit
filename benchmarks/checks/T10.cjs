"use strict";
const assert = require("node:assert/strict");
const { target, load, suite, finish, checks, green } = require("./lib.cjs");
const dir = target();

finish(checks([
  ["codes ignore case and surrounding spaces", () => {
    const { applyDiscount } = load(dir, "src/discount.cjs");
    assert.equal(applyDiscount(50, " save10 "), 45);
    assert.equal(applyDiscount(50, "Flat5"), 45);
  }],
  ["exact codes still work", () => {
    const { applyDiscount } = load(dir, "src/discount.cjs");
    assert.equal(applyDiscount(50, "SAVE10"), 45);
    assert.equal(applyDiscount(3, "FLAT5"), 0);
  }],
  ["unknown, empty and missing codes change nothing and do not throw", () => {
    const { applyDiscount } = load(dir, "src/discount.cjs");
    assert.equal(applyDiscount(50, "NOPE"), 50);
    assert.equal(applyDiscount(50, ""), 50);
    assert.equal(applyDiscount(50, undefined), 50);
    assert.equal(applyDiscount(50, null), 50);
  }],
  ["inherited object keys are not codes", () => {
    const { applyDiscount } = load(dir, "src/discount.cjs");
    assert.equal(applyDiscount(50, "constructor"), 50);
    assert.equal(applyDiscount(50, "toString"), 50);
  }],
  ["the suite still passes", () => green(dir)]
]));
