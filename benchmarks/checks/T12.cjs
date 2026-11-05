"use strict";
// T12 passes when revenueByCountry returns the same numbers but touches its inputs a bounded number of times.
// It counts reads of the input arrays instead of timing, so the result does not depend on the machine.
const assert = require("node:assert/strict");
const { target, load, finish, checks, green } = require("./lib.cjs");
const dir = target();

const COUNTRIES = ["IN", "US", "DE", "BR"];
const CODES = [undefined, "SAVE10", "FLAT5", "UNKNOWN"];

function data(orderCount, customerCount) {
  const customers = Array.from({ length: customerCount }, (_, index) => ({ id: index + 1, country: COUNTRIES[index % COUNTRIES.length] }));
  const orders = Array.from({ length: orderCount }, (_, index) => ({ id: index + 1, customerId: ((index * 7) % customerCount) + 1, total: 10 + (index % 90) + 0.5, code: CODES[index % CODES.length] }));
  return { orders, customers };
}

function counted(array, tally) {
  return new Proxy(array, {
    get(target, key, receiver) {
      if (typeof key === "string" && /^\d+$/.test(key)) tally.reads += 1;
      return Reflect.get(target, key, receiver);
    }
  });
}

// An independent one-pass answer, rounded to cents.
function expectedRevenue(orders, customers) {
  const { applyDiscount } = load(dir, "src/discount.cjs");
  const countryOf = new Map(customers.map((customer) => [customer.id, customer.country]));
  const revenue = {};
  for (const country of [...countryOf.values()].sort()) revenue[country] = 0;
  for (const order of orders) revenue[countryOf.get(order.customerId)] += applyDiscount(order.total, order.code);
  return revenue;
}

const near = (actual, expected) => {
  assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected).sort());
  for (const key of Object.keys(expected)) assert.ok(Math.abs(actual[key] - expected[key]) < 0.005, `${key}: ${actual[key]} is not ${expected[key]}`);
};

finish(checks([
  ["the revenue per country is unchanged", () => {
    const { revenueByCountry } = load(dir, "src/country-report.cjs");
    const { orders, customers } = data(1000, 300);
    near(revenueByCountry(orders, customers), expectedRevenue(orders, customers));
  }],
  ["it reads its inputs a bounded number of times (1000 orders, 300 customers)", () => {
    const { revenueByCountry } = load(dir, "src/country-report.cjs");
    const { orders, customers } = data(1000, 300);
    const tally = { reads: 0 };
    revenueByCountry(counted(orders, tally), counted(customers, tally));
    const limit = 20 * (orders.length + customers.length);
    assert.ok(tally.reads <= limit, `read the inputs ${tally.reads} times; the limit is ${limit}`);
  }],
  ["a country with no orders is still listed with 0, and no customers gives an empty result", () => {
    const { revenueByCountry } = load(dir, "src/country-report.cjs");
    assert.deepEqual(revenueByCountry([], [{ id: 1, country: "IN" }, { id: 2, country: "US" }]), { IN: 0, US: 0 });
    assert.deepEqual(revenueByCountry([], []), {});
  }],
  ["the suite still passes", () => green(dir)]
]));
