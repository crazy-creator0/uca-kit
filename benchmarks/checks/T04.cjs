"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { target, load, suite, finish, checks, green } = require("./lib.cjs");
const dir = target();
const source = fs.readFileSync(path.join(dir, "src", "validate.cjs"), "utf8");

finish(checks([
  ["the email pattern appears once", () => assert.equal(source.split("[^\\s@]+@[^\\s@]+").length - 1, 1)],
  ["the name rule appears once", () => assert.equal(source.split("trim().length < 2").length - 1, 1)],
  ["customer errors are unchanged", () => assert.deepEqual(load(dir, "src/validate.cjs").validateCustomer({ name: "A", email: "x" }).errors, ["name is too short", "email is invalid", "country is required"])],
  ["supplier errors are unchanged", () => assert.deepEqual(load(dir, "src/validate.cjs").validateSupplier({ name: "A", email: "x" }).errors, ["name is too short", "email is invalid", "taxId is required"])],
  ["valid input stays valid", () => {
    assert.equal(load(dir, "src/validate.cjs").validateCustomer({ name: "Asha", email: "a@b.co", country: "IN" }).valid, true);
    assert.equal(load(dir, "src/validate.cjs").validateSupplier({ name: "Acme", email: "s@a.co", taxId: "T" }).valid, true);
  }],
  ["the suite still passes", () => green(dir)]
]));
