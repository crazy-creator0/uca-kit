"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { validateCustomer, validateSupplier } = require("../src/validate.cjs");

test("a complete customer is valid", () => {
  assert.deepEqual(validateCustomer({ name: "Asha", email: "a@b.co", country: "IN" }), { valid: true, errors: [] });
});
test("a customer with a bad email and no country reports both", () => {
  const result = validateCustomer({ name: "Asha", email: "nope" });
  assert.deepEqual(result.errors, ["email is invalid", "country is required"]);
});
test("a complete supplier is valid", () => {
  assert.equal(validateSupplier({ name: "Acme", email: "s@acme.co", taxId: "T1" }).valid, true);
});
test("a supplier without a tax id is invalid", () => {
  assert.deepEqual(validateSupplier({ name: "Acme", email: "s@acme.co" }).errors, ["taxId is required"]);
});
