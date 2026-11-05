"use strict";

function paginate(items, page = 1, perPage = 10) {
  const start = (page - 1) * perPage;
  return {
    items: items.slice(start, start + perPage),
    page,
    perPage,
    total: items.length,
    totalPages: Math.ceil(items.length / perPage)
  };
}

module.exports = { paginate };
