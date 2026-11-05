"use strict";

const { parseCsv } = require("./csv.cjs");

function realDate(text) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function monthlyRevenue(csvText) {
  const revenue = {};
  const rejected = [];
  const seen = new Set();
  const rows = parseCsv(csvText).slice(1);
  for (const { line, fields } of rows) {
    if (fields.length === 1 && fields[0].trim() === "") continue;
    const reject = (reason) => rejected.push({ line, reason });
    if (fields.length !== 5) {
      reject(`expected 5 fields, found ${fields.length}`);
      continue;
    }
    const [id, , status, totalText, created] = fields;
    if (!realDate(created)) {
      reject(`bad date: ${created}`);
      continue;
    }
    const total = Number(totalText);
    if (totalText.trim() === "" || !Number.isFinite(total) || total < 0) {
      reject(`bad total: ${totalText}`);
      continue;
    }
    if (seen.has(id)) {
      reject(`duplicate order id: ${id}`);
      continue;
    }
    seen.add(id);
    if (status === "completed") {
      const month = created.slice(0, 7);
      revenue[month] = (revenue[month] || 0) + total;
    }
  }
  for (const month of Object.keys(revenue)) revenue[month] = Math.round(revenue[month] * 100) / 100;
  return { revenue, rejected };
}

module.exports = { monthlyRevenue };
