# T08: Slow SQL

Source: improvement review

## Fault or starting state the snapshot must contain
`orderSummaries` in `src/reports.cjs` runs one customer query per order (401 queries for 400 orders).

## Prompt (paste unchanged)
The order summary report is slow when there are many orders. Find out why and make it faster without changing the result.

## Pass check
`node benchmarks/checks/T08.cjs <working-copy>` exits 0. The check loads the working copy and tests it with assertions the agent cannot see; it does not read the agent's own summary. It fails on the untouched snapshot and passes with the reference fix in `benchmarks/reference/T08/`.

## Expected skill (kit runs)
debugging
