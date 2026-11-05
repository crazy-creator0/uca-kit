# T03: Add a test

Source: tier plan

## Fault or starting state the snapshot must contain
`slugify` in `src/text.cjs` has no tests.

## Prompt (paste unchanged)
Add tests for `slugify` in `src/text.cjs`. Cover normal use and the edge cases you find by reading the code. Do not change the source file.

## Pass check
`node benchmarks/checks/T03.cjs <working-copy>` exits 0. The check loads the working copy and tests it with assertions the agent cannot see; it does not read the agent's own summary. It fails on the untouched snapshot and passes with the reference fix in `benchmarks/reference/T03/`.

## Expected skill (kit runs)
testing-and-code-review
