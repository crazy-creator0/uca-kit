# Audit benchmark: planted problems and decoys

The ruler for the audit check, built before the check itself so the check could not be tuned to it after the fact.

Two small apps, written for this benchmark and never meant to run in production:

| App | Stack | Planted | Decoys |
| --- | --- | --- | --- |
| `express-shop/` | Express, `pg`, JSON Web Tokens | 7 | 7 |
| `fastapi-notes/` | FastAPI, SQLModel | 6 | 5 |

`key.json` lists each planted problem with its kind, file, the line that proves it, how it could be abused and the fix. Decoys are correct code that looks like a problem: a parameterised query beside an injectable one, a batched query beside a query in a loop, a loop with no query in it, a bounded read, an indexed column, a required setting with no fallback. Flagging a decoy is a false alarm.

Kinds: `hardcoded-secret`, `sql-injection`, `missing-auth`, `unbounded-read`, `query-in-loop`, `error-detail-leak`, `no-rate-limit`, `debug-mode`, `cors-credentials-wildcard`, `missing-index`.

## Scoring

```
node benchmarks/audit-planted/score.cjs findings.json
```

`findings.json` is a list of `{ "kind", "file", "line" }`, with `file` relative to this folder. A finding matches a planted problem with the same kind and file and a line within 1 of its evidence line, so pointing at the loop or at the query inside it both count. Every other finding is a false alarm, and one on a decoy line is also counted as a decoy hit. The score reports found, missed, false alarms and decoy hits; a good audit needs all four, not only "found".

## Baseline, 23 Nov 2026

The Senior Bar check (`scripts/uca-senior-check.cjs`, v0.2.1) finds **0 of 13**. On `express-shop` it passes "No secret is written into the source" despite the fallback secret in `src/auth.js`, and its risky-pattern hint does not flag either SQL injection. It was built as a checklist of what a project has, not an audit of what its code does; that gap is what v0.4.0 is for.

## Limits

- Thirteen problems in two small apps, chosen by one person, in JavaScript and Python only.
- Every problem sits in one place. A query reached through a helper function, or a problem that shows only at run time, is not here; a static audit is expected to miss those, and this benchmark does not measure it.
- "No rate limit" and "missing index" need the whole app in view (no limiter anywhere; a column looked up in another file). An audit may reasonably report these as "needs a human"; they still count when reported.
