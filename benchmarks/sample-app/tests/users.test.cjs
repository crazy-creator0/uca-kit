"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createUserStore } = require("../src/users.cjs");
const { createRouter } = require("../src/router.cjs");
const { createAuth } = require("../src/auth.cjs");
const { open, seed } = require("../src/db.cjs");

function app() {
  const users = createUserStore();
  users.add({ id: 1, username: "asha", profile: { displayName: "Asha K" } });
  const auth = createAuth();
  return { router: createRouter({ users, db: seed(open(), 5, 20), auth }), users, auth };
}

test("returns a user with a display name", () => {
  const { router } = app();
  const response = router.handle({ method: "GET", path: "/users/1" });
  assert.equal(response.status, 200);
  assert.equal(response.body.displayName, "Asha K");
});

test("unknown user is 404", () => {
  assert.equal(app().router.handle({ method: "GET", path: "/users/9" }).status, 404);
});

test("order summary needs a login", () => {
  assert.equal(app().router.handle({ method: "GET", path: "/orders/summary" }).status, 401);
});
