const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../db");
const auth = require("../auth");

const router = express.Router();

router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const { rows } = await db.query("SELECT id, role, password_hash FROM users WHERE email = $1", [email]);
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) return res.status(401).json({ error: "Wrong email or password" });
  res.json({ token: auth.sign(user) });
});

router.get("/users/search", auth.required, async (req, res) => {
  const { rows } = await db.query(`SELECT id, name FROM users WHERE name LIKE '%${req.query.q}%'`);
  res.json(rows);
});

router.get("/users/:id", auth.required, async (req, res) => {
  const { rows } = await db.query("SELECT id, name FROM users WHERE id = $1", [req.params.id]);
  res.json(rows[0] || null);
});

router.delete("/users/:id", async (req, res) => {
  await db.query("DELETE FROM users WHERE id = $1", [req.params.id]);
  res.status(204).end();
});

router.patch("/users/:id/role", auth.required, auth.admin, async (req, res) => {
  await db.query("UPDATE users SET role = $1 WHERE id = $2", [req.body.role, req.params.id]);
  res.status(204).end();
});

module.exports = router;
