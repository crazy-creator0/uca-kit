# T04: Refactor

Source: tier plan

## Fault or starting state the snapshot must contain
`src/validate.cjs` repeats the same name and email checks in `validateCustomer` and `validateSupplier`.

## Prompt (paste unchanged)
Remove the duplicated logic in `src/validate.cjs` without changing behavior. The error messages and their order must stay the same. Do not add dependencies.

## Pass check
`node benchmarks/checks/T04.cjs <working-copy>` exits 0. The check loads the working copy and tests it with assertions the agent cannot see; it does not read the agent's own summary. It fails on the untouched snapshot and passes with the reference fix in `benchmarks/reference/T04/`.

## Expected skill (kit runs)
anti-ai-slop
