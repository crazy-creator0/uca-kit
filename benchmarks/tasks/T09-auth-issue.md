# T09: Authentication issue

Source: improvement review

## Fault or starting state the snapshot must contain
`logout` in `src/auth.cjs` removes the user's entry from `tokensByUser` but leaves the token in `tokens`, so it still authenticates.

## Prompt (paste unchanged)
After a user logs out, their old token still gives access to `GET /orders/summary`. Find out why and fix it without weakening any other check.

## Pass check
`node benchmarks/checks/T09.cjs <working-copy>` exits 0. The check loads the working copy and tests it with assertions the agent cannot see; it does not read the agent's own summary. It fails on the untouched snapshot and passes with the reference fix in `benchmarks/reference/T09/`.

## Expected skill (kit runs)
debugging
