# T01: Bug fix

Source: tier plan

## Fault or starting state the snapshot must contain
`src/paginate.cjs` computes `totalPages` with `Math.floor`, so a list that does not divide evenly loses its last page.

## Prompt (paste unchanged)
There is a bug in the project: `paginate` returns the wrong `totalPages` for some input. For 25 items with 10 per page it reports 2, and it should report 3. Find the cause and fix it.

## Pass check
`node benchmarks/checks/T01.cjs <working-copy>` exits 0. The check loads the working copy and tests it with assertions the agent cannot see; it does not read the agent's own summary. It fails on the untouched snapshot and passes with the reference fix in `benchmarks/reference/T01/`.

## Expected skill (kit runs)
debugging
