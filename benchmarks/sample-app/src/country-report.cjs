"use strict";

const { applyDiscount } = require("./discount.cjs");

// Revenue per country after discounts.
// orders: [{ id, customerId, total, code }]   customers: [{ id, country }]
function revenueByCountry(orders, customers) {
  const countries = [...new Set(customers.map((customer) => customer.country))].sort();
  const revenue = {};
  for (const country of countries) {
    revenue[country] = 0;
    for (const order of orders) {
      const customer = customers.find((candidate) => candidate.id === order.customerId);
      if (customer.country === country) revenue[country] += applyDiscount(order.total, order.code);
    }
  }
  return revenue;
}

module.exports = { revenueByCountry };
