# T12: Make it faster

Source: new skill

## Fault or starting state the snapshot must contain
`revenueByCountry` in `src/country-report.cjs` looks up each order's customer with a linear search inside a loop over countries, so its work grows with countries x orders x customers.

## Prompt (paste unchanged)
`revenueByCountry` in `src/country-report.cjs` is far too slow on the nightly data (about 20,000 orders and 3,000 customers). Make it fast without changing what it returns. Measure it before and after, and report the numbers you measured.

## Pass check
`node benchmarks/checks/T12.cjs <working-copy>` exits 0. The check loads the working copy and tests it with assertions the agent cannot see; it does not read the agent's own summary. It counts how often the function reads its input arrays instead of timing it, so the result does not depend on the machine. It fails on the untouched snapshot and passes with the reference fix in `benchmarks/reference/T12/`. The check cannot tell whether the agent really measured; read the run's report and count unsupported claims by hand.

## Expected skill (kit runs)
performance-engineering
