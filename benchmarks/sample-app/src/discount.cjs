"use strict";

const CODES = {
  SAVE10: (total) => total * 0.9,
  FLAT5: (total) => Math.max(0, total - 5)
};

function applyDiscount(total, code) {
  const apply = CODES[code];
  return apply ? Math.round(apply(total) * 100) / 100 : total;
}

module.exports = { applyDiscount };
