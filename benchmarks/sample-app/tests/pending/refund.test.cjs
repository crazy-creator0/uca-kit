"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");

// Known failing: refunds are not implemented yet.
test("a refund returns the order total", () => {
  const { refund } = require("../../src/refund.cjs");
  assert.equal(refund({ total: 40 }), 40);
});

// Known skipped: waiting on a payment sandbox.
test.skip("a refund is sent to the original payment method", () => {});
