"use strict";

const crypto = require("node:crypto");

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 32).toString("hex");
}

function createAuth() {
  const users = new Map();
  const tokens = new Map();
  const tokensByUser = new Map();

  return {
    register(username, password) {
      const salt = crypto.randomBytes(8).toString("hex");
      users.set(username, { username, salt, hash: hashPassword(password, salt) });
    },
    login(username, password) {
      const user = users.get(username);
      if (!user || hashPassword(password, user.salt) !== user.hash) return null;
      const token = crypto.randomBytes(16).toString("hex");
      tokens.set(token, username);
      tokensByUser.set(username, token);
      return token;
    },
    logout(token) {
      const username = tokens.get(token);
      if (username) tokensByUser.delete(username);
    },
    authenticate(token) {
      return tokens.get(token) || null;
    }
  };
}

module.exports = { createAuth };
