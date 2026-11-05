"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { paginate } = require("../src/paginate.cjs");

test("returns the requested page", () => {
  const result = paginate([1, 2, 3, 4, 5, 6], 2, 2);
  assert.deepEqual(result.items, [3, 4]);
});

test("totalPages is exact for evenly divisible lists", () => {
  assert.equal(paginate([1, 2, 3, 4], 1, 2).totalPages, 2);
});
