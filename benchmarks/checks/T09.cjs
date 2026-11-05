"use strict";
const assert = require("node:assert/strict");
const { target, load, suite, finish, checks, green } = require("./lib.cjs");
const dir = target();

function app() {
  const { createUserStore } = load(dir, "src/users.cjs");
  const { createRouter } = load(dir, "src/router.cjs");
  const { createAuth } = load(dir, "src/auth.cjs");
  const { open, seed } = load(dir, "src/db.cjs");
  const auth = createAuth();
  auth.register("asha", "correct horse");
  return { auth, router: createRouter({ users: createUserStore(), db: seed(open(), 3, 6), auth }) };
}
finish(checks([
  ["a logged-in user can open the summary", () => {
    const { auth, router } = app();
    const token = auth.login("asha", "correct horse");
    assert.equal(router.handle({ method: "GET", path: "/orders/summary", token }).status, 200);
  }],
  ["after logout the token is rejected", () => {
    const { auth, router } = app();
    const token = auth.login("asha", "correct horse");
    auth.logout(token);
    assert.equal(auth.authenticate(token), null);
    assert.equal(router.handle({ method: "GET", path: "/orders/summary", token }).status, 401);
  }],
  ["logging out one session leaves a second one working", () => {
    const { auth } = app();
    const first = auth.login("asha", "correct horse");
    const second = auth.login("asha", "correct horse");
    auth.logout(first);
    assert.equal(auth.authenticate(first), null);
    assert.equal(auth.authenticate(second), "asha");
  }],
  ["a wrong password still fails", () => assert.equal(app().auth.login("asha", "wrong"), null)],
  ["an unknown token is rejected", () => assert.equal(app().auth.authenticate("nope"), null)],
  ["the suite still passes", () => green(dir)]
]));
