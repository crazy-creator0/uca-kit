# T02: Small feature

Source: tier plan

## Fault or starting state the snapshot must contain
`truncate(text, max)` in `src/text.cjs` always ends with the ellipsis character.

## Prompt (paste unchanged)
Add an optional `suffix` setting to `truncate` in `src/text.cjs`, passed as `truncate(text, max, { suffix: "..." })`. The result, suffix included, must not be longer than `max`. When no suffix is given, behavior must stay exactly as it is.

## Pass check
`node benchmarks/checks/T02.cjs <working-copy>` exits 0. The check loads the working copy and tests it with assertions the agent cannot see; it does not read the agent's own summary. It fails on the untouched snapshot and passes with the reference fix in `benchmarks/reference/T02/`.

## Expected skill (kit runs)
testing-and-code-review
