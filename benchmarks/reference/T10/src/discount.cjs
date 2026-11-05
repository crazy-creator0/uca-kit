"use strict";

const CODES = {
  SAVE10: (total) => total * 0.9,
  FLAT5: (total) => Math.max(0, total - 5)
};

function applyDiscount(total, code) {
  const key = typeof code === "string" ? code.trim().toUpperCase() : "";
  const apply = Object.hasOwn(CODES, key) ? CODES[key] : null;
  return apply ? Math.round(apply(total) * 100) / 100 : total;
}

module.exports = { applyDiscount };
