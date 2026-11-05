"use strict";
const assert = require("node:assert/strict");
const { target, load, suite, finish, checks, green } = require("./lib.cjs");
const dir = target();

finish(checks([
  ["the summaries are the same as an independent join", () => {
    const { open, seed } = load(dir, "src/db.cjs");
    const { orderSummaries } = load(dir, "src/reports.cjs");
    const db = seed(open(), 50, 400);
    const expected = db.raw.prepare("SELECT o.id AS orderId, c.name AS customerName, o.total AS total FROM orders o JOIN customers c ON c.id = o.customer_id ORDER BY o.id").all().map((row) => ({ ...row }));
    db.queries = 0;
    const actual = orderSummaries(db).map((row) => ({ ...row }));
    assert.deepEqual(actual, expected);
  }],
  ["it runs at most two queries for 400 orders", () => {
    const { open, seed } = load(dir, "src/db.cjs");
    const { orderSummaries } = load(dir, "src/reports.cjs");
    const db = seed(open(), 50, 400);
    orderSummaries(db);
    assert.ok(db.queries <= 2, `ran ${db.queries} queries`);
  }],
  ["an empty orders table gives an empty list", () => {
    const { open } = load(dir, "src/db.cjs");
    const { orderSummaries } = load(dir, "src/reports.cjs");
    assert.deepEqual(orderSummaries(open()), []);
  }],
  ["the suite still passes", () => green(dir)]
]));
