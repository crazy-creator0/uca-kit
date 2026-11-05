"use strict";

function orderSummaries(db) {
  return db
    .prepare(
      "SELECT o.id AS orderId, c.name AS customerName, o.total AS total FROM orders o JOIN customers c ON c.id = o.customer_id ORDER BY o.id"
    )
    .all()
    .map((row) => ({ orderId: row.orderId, customerName: row.customerName, total: row.total }));
}

module.exports = { orderSummaries };
