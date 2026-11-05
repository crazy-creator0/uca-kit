"use strict";

function orderSummaries(db) {
  const orders = db.prepare("SELECT id, customer_id, total FROM orders ORDER BY id").all();
  return orders.map((order) => {
    const customer = db.prepare("SELECT name FROM customers WHERE id = ?").get(order.customer_id);
    return { orderId: order.id, customerName: customer.name, total: order.total };
  });
}

module.exports = { orderSummaries };
