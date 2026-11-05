"use strict";

function truncate(text, max, { suffix = "…" } = {}) {
  if (text.length <= max) return text;
  return text.slice(0, max - suffix.length) + suffix;
}

function slugify(text) {
  return String(text)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

module.exports = { truncate, slugify };
