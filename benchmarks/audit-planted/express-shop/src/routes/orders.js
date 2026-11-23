const express = require("express");
const db = require("../db");
const auth = require("../auth");

const router = express.Router();

router.get("/orders", auth.required, async (req, res) => {
  const { rows } = await db.query("SELECT * FROM orders");
  res.json(rows);
});

router.get("/orders/recent", auth.required, async (req, res) => {
  const { rows } = await db.query("SELECT id, total FROM orders WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20", [req.user.id]);
  res.json(rows);
});

router.get("/orders/with-items", auth.required, async (req, res) => {
  const { rows: orders } = await db.query("SELECT id, total FROM orders WHERE user_id = $1 LIMIT 50", [req.user.id]);
  for (const order of orders) {
    const { rows: items } = await db.query("SELECT sku, qty FROM order_items WHERE order_id = $1", [order.id]);
    order.items = items;
  }
  res.json(orders);
});

router.get("/orders/summary", auth.required, async (req, res) => {
  const { rows: orders } = await db.query("SELECT id, total FROM orders WHERE user_id = $1 LIMIT 50", [req.user.id]);
  const ids = orders.map((order) => order.id);
  const { rows: items } = await db.query("SELECT order_id, sku, qty FROM order_items WHERE order_id = ANY($1)", [ids]);
  const labels = [];
  for (const order of orders) labels.push(`#${order.id}: ${order.total}`);
  res.json({ orders, items, labels });
});

module.exports = router;
