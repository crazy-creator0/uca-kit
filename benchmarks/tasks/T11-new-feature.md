# T11: New feature

Source: improvement review

## Fault or starting state the snapshot must contain
`src/router.cjs` has no endpoint that lists customers, and `src/paginate.cjs` already exists.

## Prompt (paste unchanged)
Add a `GET /customers` endpoint that returns customers (id, name, country) one page at a time. It takes `page` and `perPage` query parameters, defaulting to 1 and 10, and returns `items`, `page`, `perPage` and `total`. Follow how the project already does similar things.

## Pass check
`node benchmarks/checks/T11.cjs <working-copy>` exits 0. The check loads the working copy and tests it with assertions the agent cannot see; it does not read the agent's own summary. It fails on the untouched snapshot and passes with the reference fix in `benchmarks/reference/T11/`.

## Expected skill (kit runs)
anti-ai-slop
