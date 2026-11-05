"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { target, load, suite, finish, checks, green } = require("./lib.cjs");
const dir = target();

function app(customers = 12) {
  const { createUserStore } = load(dir, "src/users.cjs");
  const { createRouter } = load(dir, "src/router.cjs");
  const { createAuth } = load(dir, "src/auth.cjs");
  const { open, seed } = load(dir, "src/db.cjs");
  return createRouter({ users: createUserStore(), db: seed(open(), customers, 24), auth: createAuth() });
}

finish(checks([
  ["page 2 of 5 returns customers 6 to 10", () => {
    const response = app().handle({ method: "GET", path: "/customers?page=2&perPage=5" });
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.items.map((c) => c.id), [6, 7, 8, 9, 10]);
    assert.equal(response.body.page, 2);
    assert.equal(response.body.perPage, 5);
    assert.equal(response.body.total, 12);
  }],
  ["defaults are page 1 and 10 per page", () => {
    const response = app().handle({ method: "GET", path: "/customers" });
    assert.equal(response.status, 200);
    assert.equal(response.body.items.length, 10);
    assert.equal(response.body.page, 1);
    assert.equal(response.body.perPage, 10);
  }],
  ["customers carry id, name and country", () => {
    const first = app().handle({ method: "GET", path: "/customers" }).body.items[0];
    assert.deepEqual(Object.keys(first).sort(), ["country", "id", "name"]);
  }],
  ["existing routes still work", () => assert.equal(app().handle({ method: "GET", path: "/users/9" }).status, 404)],
  ["no dependency was added", () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
    assert.deepEqual(Object.keys(manifest.dependencies || {}), []);
    assert.deepEqual(Object.keys(manifest.devDependencies || {}), []);
  }],
  ["the suite still passes", () => green(dir)]
]));
