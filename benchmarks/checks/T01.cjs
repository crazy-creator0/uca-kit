"use strict";
const assert = require("node:assert/strict");
const { target, load, suite, finish, checks, green } = require("./lib.cjs");
const dir = target();

finish(checks([
  ["25 items at 10 per page is 3 pages", () => assert.equal(load(dir, "src/paginate.cjs").paginate(Array(25).fill(0), 1, 10).totalPages, 3)],
  ["20 items at 10 per page is 2 pages", () => assert.equal(load(dir, "src/paginate.cjs").paginate(Array(20).fill(0), 1, 10).totalPages, 2)],
  ["no items is 0 pages", () => assert.equal(load(dir, "src/paginate.cjs").paginate([], 1, 10).totalPages, 0)],
  ["the suite still passes", () => green(dir)]
]));
