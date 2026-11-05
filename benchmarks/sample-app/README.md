# shopdesk

A small order-desk service with a request router, an in-memory user store, SQLite-backed orders, a quantity control, a country revenue report and a sample orders CSV export in `data/`.
Run the tests with `npm test`. `npm run test:all` also runs `tests/pending/`, which holds one known failing test and one skipped test.
Requires Node 22.13 or newer (`node:sqlite`). No dependencies.
