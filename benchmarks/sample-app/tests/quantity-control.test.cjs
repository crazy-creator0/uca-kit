"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createStore, createQuantityControl } = require("../src/quantity-control.cjs");

test("one click adds one", () => {
  const store = createStore({ count: 0 });
  const control = createQuantityControl(store);
  control.increment();
  assert.equal(control.render(), "Qty: 1");
});
