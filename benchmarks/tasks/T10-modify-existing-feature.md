# T10: Modify an existing feature

Source: improvement review

## Fault or starting state the snapshot must contain
`applyDiscount` in `src/discount.cjs` only accepts codes in exact upper case.

## Prompt (paste unchanged)
Change `applyDiscount` so discount codes are accepted in any letter case and with spaces around them (for example " save10 "). Codes that already work must keep working, and unknown or missing codes must still leave the total unchanged.

## Pass check
`node benchmarks/checks/T10.cjs <working-copy>` exits 0. The check loads the working copy and tests it with assertions the agent cannot see; it does not read the agent's own summary. It fails on the untouched snapshot and passes with the reference fix in `benchmarks/reference/T10/`.

## Expected skill (kit runs)
testing-and-code-review
