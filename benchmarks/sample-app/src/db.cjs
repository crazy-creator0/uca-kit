"use strict";

const { DatabaseSync } = require("node:sqlite");

// Wraps statements so tests can count how many queries a code path runs.
function open() {
  const raw = new DatabaseSync(":memory:");
  const db = {
    raw,
    queries: 0,
    exec(sql) {
      raw.exec(sql);
    },
    prepare(sql) {
      const statement = raw.prepare(sql);
      return {
        all: (...args) => { db.queries += 1; return statement.all(...args); },
        get: (...args) => { db.queries += 1; return statement.get(...args); },
        run: (...args) => { db.queries += 1; return statement.run(...args); }
      };
    }
  };
  db.exec(`
    CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT NOT NULL, country TEXT NOT NULL);
    CREATE TABLE orders (id INTEGER PRIMARY KEY, customer_id INTEGER NOT NULL, total REAL NOT NULL, created_at TEXT NOT NULL);
  `);
  return db;
}

function seed(db, customers = 50, orders = 400) {
  const addCustomer = db.prepare("INSERT INTO customers (id, name, country) VALUES (?, ?, ?)");
  const addOrder = db.prepare("INSERT INTO orders (id, customer_id, total, created_at) VALUES (?, ?, ?, ?)");
  for (let id = 1; id <= customers; id += 1) addCustomer.run(id, `Customer ${id}`, id % 2 ? "IN" : "US");
  for (let id = 1; id <= orders; id += 1) {
    addOrder.run(id, ((id * 7) % customers) + 1, 10 + (id % 90), `2026-01-${String((id % 28) + 1).padStart(2, "0")}`);
  }
  db.queries = 0;
  return db;
}

module.exports = { open, seed };
