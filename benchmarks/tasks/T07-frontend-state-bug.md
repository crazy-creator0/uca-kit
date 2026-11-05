# T07: Frontend state bug

Source: improvement review

## Fault or starting state the snapshot must contain
`createQuantityControl` captures the store state once, so every click starts from the same old value.

## Prompt (paste unchanged)
In `src/quantity-control.cjs`, clicking the quantity control twice shows "Qty: 1" instead of "Qty: 2". Find the cause and fix it.

## Pass check
`node benchmarks/checks/T07.cjs <working-copy>` exits 0. The check loads the working copy and tests it with assertions the agent cannot see; it does not read the agent's own summary. It fails on the untouched snapshot and passes with the reference fix in `benchmarks/reference/T07/`.

## Expected skill (kit runs)
debugging
