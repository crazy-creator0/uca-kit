# Snapshot record

Do not edit after runs start. If the sample app changes, the hash changes and every earlier result belongs to the old snapshot.

- Project: `benchmarks/sample-app` (shopdesk): a small order service with a request router, SQLite-backed orders (`node:sqlite`), a quantity control and a login flow. No dependencies.
- Built by: `node benchmarks/make-snapshot.cjs <new-directory>`, which creates a git repository with one commit. Author, committer and dates are fixed, so the same files always give the same hash.
- Snapshot commit: `cf3ff21bb7835707c4c7ff779439c890900e5131`
- Test commands: `npm test` (15 tests, all passing) and `npm run test:all` (adds one known failing test and one skipped test from `tests/pending/`).
- Runtime: Node 22.13 or newer. Recorded on Node v22.23.4 with git 2.43.0 on Linux.
- Date created: 2026-11-03
- Faults confirmed present: T01 to T13. Each task's check fails on this snapshot and passes with the reference fix in `benchmarks/reference/<task>/` (verified by `tests/benchmark-fixtures.test.cjs`).
- Line endings: `.gitattributes` forces LF for `benchmarks/`. A checkout with CRLF files gives a different hash; run `make-snapshot.cjs` and compare before the first run.
