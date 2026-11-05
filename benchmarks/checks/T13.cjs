"use strict";
// T13 passes when monthlyRevenue handles real CSV: quoted fields, bad rows reported with their line numbers,
// duplicates, real calendar dates, blank lines and CRLF.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { target, load, finish, checks, green } = require("./lib.cjs");
const dir = target();

const HEADER = "order_id,customer,status,total,created_at";
const monthly = () => load(dir, "src/analytics.cjs").monthlyRevenue;
const lines = (rejected) => rejected.map((item) => item.line);

finish(checks([
  ["the sample export gives the expected months and rejected lines", () => {
    const result = monthly()(fs.readFileSync(path.join(dir, "data", "orders-export.csv"), "utf8"));
    assert.deepEqual(result.revenue, { "2026-01": 200.5, "2026-02": 19.99, "2026-03": 230.25 });
    assert.deepEqual(lines(result.rejected), [6, 7, 8, 13, 14]);
    for (const item of result.rejected) assert.ok(typeof item.reason === "string" && item.reason.length > 0, "every rejection needs a reason");
  }],
  ["a comma and doubled quotes inside a quoted name do not split the row", () => {
    const result = monthly()(`${HEADER}\n1,"Smith, Anna",completed,10.50,2026-01-05\n2,"Quote ""Q"" Co",completed,4.50,2026-01-06`);
    assert.deepEqual(result.revenue, { "2026-01": 15 });
    assert.deepEqual(result.rejected, []);
  }],
  ["only completed orders are counted, and other statuses are not rejected", () => {
    const result = monthly()(`${HEADER}\n1,A,completed,10,2026-01-05\n2,B,refunded,20,2026-01-06\n3,C,cancelled,30,2026-01-07`);
    assert.deepEqual(result.revenue, { "2026-01": 10 });
    assert.deepEqual(result.rejected, []);
  }],
  ["dates must be real calendar dates in YYYY-MM-DD form", () => {
    const result = monthly()([HEADER, "1,A,completed,1,2024-02-29", "2,A,completed,1,2026-02-29", "3,A,completed,1,2026-13-01", "4,A,completed,1,01/02/2026", "5,A,completed,1,2026-1-5"].join("\n"));
    assert.deepEqual(result.revenue, { "2024-02": 1 });
    assert.deepEqual(lines(result.rejected), [3, 4, 5, 6]);
  }],
  ["totals that are not non-negative numbers are rejected", () => {
    const result = monthly()([HEADER, "1,A,completed,abc,2026-01-01", "2,A,completed,-1,2026-01-01", "3,A,completed,,2026-01-01", "4,A,completed,2.5,2026-01-01"].join("\n"));
    assert.deepEqual(result.revenue, { "2026-01": 2.5 });
    assert.deepEqual(lines(result.rejected), [2, 3, 4]);
  }],
  ["a repeated order id is rejected and the first one counts", () => {
    const result = monthly()([HEADER, "7,A,completed,10,2026-01-01", "7,A,completed,99,2026-01-02"].join("\n"));
    assert.deepEqual(result.revenue, { "2026-01": 10 });
    assert.deepEqual(lines(result.rejected), [3]);
  }],
  ["rows with the wrong number of fields are rejected", () => {
    const result = monthly()([HEADER, "1,A,completed,10", "2,A,completed,10,2026-01-01,extra", "3,A,completed,10,2026-01-01"].join("\n"));
    assert.deepEqual(result.revenue, { "2026-01": 10 });
    assert.deepEqual(lines(result.rejected), [2, 3]);
  }],
  ["blank lines are skipped but still count as lines; CRLF line endings work", () => {
    const result = monthly()(`${HEADER}\r\n\r\n1,A,completed,10,2026-01-01\r\n\r\n2,A,completed,x,2026-01-01\r\n`);
    assert.deepEqual(result.revenue, { "2026-01": 10 });
    assert.deepEqual(lines(result.rejected), [5]);
  }],
  ["totals are rounded to cents", () => {
    const result = monthly()([HEADER, "1,A,completed,0.1,2026-01-01", "2,A,completed,0.2,2026-01-02"].join("\n"));
    assert.deepEqual(result.revenue, { "2026-01": 0.3 });
  }],
  ["a header-only file gives an empty result", () => {
    assert.deepEqual(monthly()(`${HEADER}\n`), { revenue: {}, rejected: [] });
  }],
  ["the suite still passes", () => green(dir)]
]));
