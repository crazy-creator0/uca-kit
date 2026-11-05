# T13: Monthly revenue from a CSV export

Source: new skill

## Fault or starting state the snapshot must contain
`data/orders-export.csv` holds the export, including quoted names with commas, a duplicate order id, bad dates and totals, and a short row. `src/csv.cjs` has a `parseLine` that splits on commas and cannot handle quoted fields. There is no `src/analytics.cjs`.

## Prompt (paste unchanged)
Add `monthlyRevenue(csvText)` in `src/analytics.cjs`. It reads the orders export format shown in `data/orders-export.csv` (a header line, then order_id, customer, status, total, created_at) and returns `{ revenue, rejected }`. `revenue` maps each month (`YYYY-MM`) to the total of `completed` orders in that month, rounded to cents. Orders with any other status are valid but not counted. A row that cannot be used is left out of `revenue` and listed in `rejected` as `{ line, reason }`, where `line` is its 1-based line number in the file (the header is line 1) and `reason` is a short text. Reject a row with the wrong number of fields, a date that is not a real calendar date in `YYYY-MM-DD` form, a total that is not a non-negative number, or an order_id that already appeared earlier (the first occurrence counts). Skip blank lines without rejecting them.

## Pass check
`node benchmarks/checks/T13.cjs <working-copy>` exits 0. The check loads the working copy and tests it with assertions the agent cannot see; it does not read the agent's own summary. It fails on the untouched snapshot and passes with the reference fix in `benchmarks/reference/T13/`.

## Expected skill (kit runs)
data-engineering-analytics
