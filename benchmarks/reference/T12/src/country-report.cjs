"use strict";

const { applyDiscount } = require("./discount.cjs");

// Revenue per country after discounts.
// orders: [{ id, customerId, total, code }]   customers: [{ id, country }]
function revenueByCountry(orders, customers) {
  const countryOf = new Map(customers.map((customer) => [customer.id, customer.country]));
  const revenue = {};
  for (const country of [...new Set(countryOf.values())].sort()) revenue[country] = 0;
  for (const order of orders) revenue[countryOf.get(order.customerId)] += applyDiscount(order.total, order.code);
  return revenue;
}

module.exports = { revenueByCountry };
