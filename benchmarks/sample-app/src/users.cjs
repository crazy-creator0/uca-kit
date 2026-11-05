"use strict";

function createUserStore() {
  const users = new Map();
  return {
    add(user) {
      users.set(user.id, user);
    },
    get(id) {
      return users.get(id) || null;
    },
    all() {
      return [...users.values()];
    }
  };
}

function getUserHandler(store, request) {
  const user = store.get(Number(request.params.id));
  if (!user) return { status: 404, body: { error: "user not found" } };
  return { status: 200, body: { id: user.id, username: user.username, displayName: user.profile.displayName } };
}

module.exports = { createUserStore, getUserHandler };
