"use strict";
const assert = require("node:assert/strict");
const { target, load, suite, finish, checks, green } = require("./lib.cjs");
const dir = target();

finish(checks([
  ["a user with no profile gets 200 and falls back to the username", () => {
    const { createUserStore } = load(dir, "src/users.cjs");
    const { createRouter } = load(dir, "src/router.cjs");
    const { createAuth } = load(dir, "src/auth.cjs");
    const { open, seed } = load(dir, "src/db.cjs");
    const users = createUserStore();
    users.add({ id: 2, username: "ravi", profile: null });
    const response = createRouter({ users, db: seed(open(), 3, 6), auth: createAuth() }).handle({ method: "GET", path: "/users/2" });
    assert.equal(response.status, 200);
    assert.equal(response.body.displayName, "ravi");
  }],
  ["a profile without a display name also falls back", () => {
    const { createUserStore } = load(dir, "src/users.cjs");
    const { createRouter } = load(dir, "src/router.cjs");
    const { createAuth } = load(dir, "src/auth.cjs");
    const { open, seed } = load(dir, "src/db.cjs");
    const users = createUserStore();
    users.add({ id: 3, username: "mei", profile: {} });
    const response = createRouter({ users, db: seed(open(), 3, 6), auth: createAuth() }).handle({ method: "GET", path: "/users/3" });
    assert.equal(response.status, 200);
    assert.equal(response.body.displayName, "mei");
  }],
  ["a user with a profile keeps the display name", () => {
    const { createUserStore } = load(dir, "src/users.cjs");
    const { createRouter } = load(dir, "src/router.cjs");
    const { createAuth } = load(dir, "src/auth.cjs");
    const { open, seed } = load(dir, "src/db.cjs");
    const users = createUserStore();
    users.add({ id: 1, username: "asha", profile: { displayName: "Asha K" } });
    assert.equal(createRouter({ users, db: seed(open(), 3, 6), auth: createAuth() }).handle({ method: "GET", path: "/users/1" }).body.displayName, "Asha K");
  }],
  ["a missing user is still 404", () => {
    const { createUserStore } = load(dir, "src/users.cjs");
    const { createRouter } = load(dir, "src/router.cjs");
    const { createAuth } = load(dir, "src/auth.cjs");
    const { open, seed } = load(dir, "src/db.cjs");
    assert.equal(createRouter({ users: createUserStore(), db: seed(open(), 3, 6), auth: createAuth() }).handle({ method: "GET", path: "/users/9" }).status, 404);
  }],
  ["the suite still passes", () => green(dir)]
]));
