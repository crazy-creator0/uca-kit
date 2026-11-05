"use strict";

const { getUserHandler } = require("./users.cjs");
const { orderSummaries } = require("./reports.cjs");

function createRouter({ users, db, auth }) {
  const routes = {
    "GET /users/:id": (request) => getUserHandler(users, request),
    "GET /orders/summary": (request) => {
      if (!auth.authenticate(request.token)) return { status: 401, body: { error: "login required" } };
      return { status: 200, body: orderSummaries(db) };
    }
  };

  function match(method, path) {
    for (const key of Object.keys(routes)) {
      const [routeMethod, pattern] = key.split(" ");
      if (routeMethod !== method) continue;
      const names = [];
      const regex = new RegExp("^" + pattern.replace(/:([a-z]+)/g, (_, name) => (names.push(name), "([^/]+)")) + "$");
      const found = regex.exec(path);
      if (found) return { handler: routes[key], params: Object.fromEntries(names.map((n, i) => [n, found[i + 1]])) };
    }
    return null;
  }

  return {
    handle(request) {
      const [path, queryString = ""] = request.path.split("?");
      const matched = match(request.method, path);
      if (!matched) return { status: 404, body: { error: "not found" } };
      const query = Object.fromEntries(new URLSearchParams(queryString));
      try {
        return matched.handler({ ...request, params: matched.params, query });
      } catch {
        return { status: 500, body: { error: "internal error" } };
      }
    }
  };
}

module.exports = { createRouter };
