# Changelog

All notable changes are listed here. The project is early-stage, and nothing below has been benchmarked against real models.

## Unreleased

Fixed (Senior Bar, found by the readiness levels on real repositories)
- Reading only `NODE_ENV` or Vite's `import.meta.env.MODE/DEV/PROD/SSR/BASE_URL` no longer counts as reading settings, so a library such as Koa is no longer told to ignore `.env` and ship an `.env.example`.
- A `.gitignore` in a subfolder now counts for dependency folders (`backend/.gitignore` listing `__pycache__`, as in the FastAPI template).

Added (audit)
- "uca-audit": `.agents/workflows/audit.md`, a read-only review of the user's own project: run the checks, confirm or reject each "needs a human" finding, then read for what static checks cannot see (object-level permissions, input edges, cost per request, secrets in logs, concurrency, problems one function away). Limits come first in the file: read-only, own project only, no requests to live systems, no working exploits, no secret values. The attacker mindset is written only in this file; a test fails if it appears anywhere else in the kit's instructions. Standard and full point to it; lite is unchanged (its instruction budget is full).
- Audit check (`scripts/uca-audit-check.cjs`): reads JavaScript, TypeScript and Python and reports ten kinds of problem with file, line, risk, fix and a confidence ("certain" or "needs a human"); never runs code, never reads `.env`, never prints a secret value; skips tests, examples and benchmarks.
- Readiness levels (`scripts/uca-readiness.cjs`): Bronze (safe to share), Silver (safe to show users), Gold (ready for production traffic), from 16 Senior Bar checks and the 10 audit kinds. "Needs a human" findings are listed to confirm, not failed; checks that do not apply are left out; the percentage is checks passed and is labelled as a to-do list. `--min` for CI. On the three real repositories: Koa reaches Gold (21 of 21); the FastAPI template reaches no level, because its `.env` file is committed and not ignored (true), 21 of 25; the Express RealWorld example reaches no level because of the `superSecret` fallback (true), 18 of 23.
- Standard and full install the audit check, the readiness check and the Senior Bar check.
- Results. Audit benchmark: 13 of 13 found, 0 false alarms, 0 decoys hit (the benchmark was written before the check, but by the same author, so this score alone proves little). On three real repositories it was not written for, every finding was checked by hand: the FastAPI full-stack template, 3 findings, all real (no rate limit on the two login routes, `Item.owner_id` used in lookups with no index); the Express RealWorld example, 5 findings, 4 real (the `superSecret` fallback in 3 places, no rate limit on login) and 1 false alarm (`POST /users` is sign-up, public by design); Koa, 0 findings, right for a library. A first version also reported two queries in loops in RealWorld that were not; the loop-body bug behind them is fixed and tested.

Added (benchmarks)
- Audit benchmark (`benchmarks/audit-planted/`): two small apps, Express and FastAPI, with 13 planted problems (hard-coded fallback secret, SQL injection twice, a delete route with no login, unbounded reads, queries in loops, stack traces sent to clients, no login rate limit, debug mode, wildcard CORS with credentials, a looked-up column with no index) and 12 decoys that look similar but are correct. `score.cjs` counts found, missed, false alarms and decoy hits. Baseline: the Senior Bar check finds 0 of 13. This is the ruler for the v0.4.0 audit, written before the audit.

## 0.2.1 (2026-11-23)

Patch release after the Sample 05 review: false facts fixed in the project scanner and the Senior Bar check, plus the first project-view pieces for v0.3.0, each tested. Not yet measured with a model: whether Key file notes save tokens (the token test in `benchmarks/project-questions/` is designed, not run).

Added (benchmarks)
- Project questions (`benchmarks/project-questions/`): 30 fixed questions about three real repositories pinned to one commit each (the FastAPI full-stack template at 252 files, the Express RealWorld example, Koa), with answer keys read from the code. `score.cjs verify` proves every key against its file (37 of 37 evidence lines found); `score.cjs map` counts what the project scanner's card answers alone (7 of 30 today, the baseline for the v0.3.0 project view); `score.cjs answers` scores a model's answers for the token test, which has not been run yet.

Added (samples)
- Sample 05, Python basics visualised: a long study page for beginners, built without and with the kit (v0.2.0). The maintainer re-ran every shown output in Python (132 of 132 and 82 of 82 right) and read both pages against a 20-point list of beginner traps (0 wrong statements on either). Without the kit the page is bigger and more visual; with the kit it is shorter and leaves a README, tests and a design brief. Full review in `demo/samples/python-basics/REVIEW.md`.

Changed (project scanner)
- FastAPI routes are listed with their full path (`POST /api/v1/login/access-token`) instead of a prefix and a short path side by side.
- Docker Compose files (root or one folder down, not examples or tests): their services are listed under Structure, services running a database image (PostgreSQL, MySQL, MariaDB, MongoDB, Redis, Valkey) are listed under Data, and Deployment says Compose files exist instead of "not discovered".
- Python dependencies: SQLModel, asyncpg, PyMySQL and PyMongo are listed under Data; passlib, pwdlib, bcrypt and argon2-cffi under Authentication; the psycopg drivers are labelled as PostgreSQL drivers.
- Express routes are listed with the prefix they are mounted under (`GET /api/articles`). The scanner follows `app.use("/api", router)`, `Router().use("/api", api)` and `router.use("/admin", require("./admin"))` through imports and local routers, nested mounts included. A router mounted at two different prefixes keeps its own paths and the line names both prefixes; nothing is guessed. A file that exports several routers is treated as one.
- On the project questions benchmark, the scanner's card alone now answers 11 of 30 questions (7 before this release).
- A new "Key files" block lists up to 8 files where behaviour lives, for writing Key file notes: one entry, auth, config, data model and route file first, then the next of each, then the files an entry imports directly (so a library such as Koa gets its request, response and context files). Picked from file names, entries and route counts without reading the files. Name parts are matched whole, so `author.mapper.ts` is not auth; tool configs (`vite.config.ts`), pages, migrations, tests and generated files are left out. On the three benchmark repositories the first three picks are the entry, the token or security file and the app config (or, for Koa, request and response). The block adds 700 to 1,100 characters to each card and answers no question by itself.

Added (PROJECT.md checks)
- Quoted notes: a fact can quote the line it came from, `(source: src/auth.ts:5 "expiresIn: '60d'")`. `uca-project-check.cjs` now checks every quote against its file: a quote not in the file is reported as WRONG, one on another line than cited as MOVED (with the line it is on now), and one under 6 characters as SHORT. All three exit 1. The template has a new "Key file notes" section for these. On the RealWorld example app, four true notes passed and a planted false one ("port 8080"; the code says 3000) was reported as WRONG. A found quote proves the line exists, not that the sentence around it is right.

Added (Key file notes)
- Workflow `.agents/workflows/project-notes.md`, and "uca-notes" in the R-PROJECT rule of every tier: on "uca-notes" (or offered once when the agent is about to read the Key files anyway) the agent reads the Key files (the first 3 on lite), writes up to 5 quoted notes per file under `## Key file notes`, outside the generator's markers, and runs `uca-project-check.cjs` until it passes. Lines holding real-looking secrets are described and cited, never quoted. "uca-notes" is a phrase the core rules know, not a registered slash command. R-PROJECT was reworded to make room, so the lite worst case is 1,597 estimated tokens, under the 1,600 limit and 2 less than before; the "fill the template by hand" fallback was dropped from the rule because installing the kit already needs Node, which runs the generator.
- Tested on a copy of Koa by following the workflow by hand: 6 notes passed, a wrong line number was reported as MOVED and fixed, regenerating the card kept the notes, and a code change flagged only the changed file and its now-false note. A test repeats this cycle. Whether a model writes good notes, and whether notes save tokens, needs model runs (not done yet).

Fixed
- Senior Bar check: passing the whole environment to a child process (`dict(os.environ, ...)`, `{ ...process.env }`) no longer counts as reading settings, so it no longer asks for an `.env.example`. Reading a named value (`os.environ["X"]`, `os.getenv`, `process.env.X`, `import.meta.env.X`) still does. Sample 05 found this false alarm.
- Project scanner (`uca-project-discover.cjs`): four wrong facts it reported when run on this repository. A route-like `path:` in a file that only mentions react-router (or one built from a template) was listed as a page route; now only files that import react-router are read, and template paths are skipped. `node:sqlite` was reported as the app's database from a benchmark file, and would have been from any string containing the name; now only an import in app code counts. Auth-named files under examples, tests or benchmarks were listed as the app's authentication; now they are set apart like other sample files. TODO/FIXME/HACK words inside strings and regular expressions were counted, and the same line counted several times; now only comments count, once per line (on this repository: 14 reported before, 0 real ones). Each fix has a test that fails on the old code.

## 0.2.0 (2026-11-21)

A minor release: a new license, sharper skills, a project scanner that finds the real entry file and maps imports, and a fourth sample. Nothing here has been benchmarked against real models.

License
- UCA Kit is now licensed under the Apache License, Version 2.0, starting with v0.2.0. v0.1.0 and v0.1.1 were published under MIT, and copies obtained under those releases stay under MIT. Every commit so far is by Crazy Creators, and no third-party material is included, so the change needed no other permission.
- New `NOTICE` (attribution, kept with copies under section 4(d)) and `CITATION.cff` (GitHub's "Cite this repository" button).
- The installer copies `LICENSE` and `NOTICE` into `.agents/` in every tier, recorded in the manifest. The installed `AGENTS.md` ends with one credit line; the lite tier's worst case stays within its limit (1,599 of 1,600 estimated tokens).
- Contributions are accepted under Apache-2.0 (CONTRIBUTING.md).

Skills
- Every one of the 13 task skills opens with a "Read first" block: Use when, Not when, Must do, Done when, Stop here if, Read on only for. The three always-on guardrails are left out, because they are read on every task.
- Every skill description, full and lite, now opens with "Use when" (or "Use for") and names the situation first. A test fails if one stops doing so.
- `backend-api` serves any backend stack, not only Python: it finds the stack from its manifest. Before, the router sent Node, Go and Java APIs to a skill that told them it did not apply.
- `design-taste-discovery` moved its long lists into `techniques.md` and `review.md`, read only when a step points to them. SKILL.md went from 104 to 74 lines.
- Estimated size after all of the above (characters / 4): lite worst case 1,599 of 1,600; standard worst case 8,209 of 9,000.

Changed
- Project scanner (`uca-project-discover.cjs`): the entry point the package declares now comes first (main, bin, exports, or Node's default `index.js`); a built path such as `dist/index.js` points to its source file when one exists. Entry-like files and routes inside example, test, fixture and benchmark folders are counted on one line instead of listed as the app's own. On Express this cut the entry list from 26 lines to 2 and the routes from 47 lines to 2.
- Routes written inside comments are skipped, and a FastAPI decorator is no longer also reported as a plain router call.
- Routes are grouped one line per file within a budget of about 3,000 characters. FastAPI prefixes from `APIRouter(prefix=...)` and `include_router(..., prefix=...)` are joined into full paths; a prefix that is not a string literal (or a constant set to one in an imported file) is shown as `{unread prefix}` instead of guessed. On the FastAPI full-stack template the routes block went from 3,193 to 1,175 bytes.
- `fuzz/`, `testdata/`, `benches/` and `test_*` folders are treated like tests.
- Design check: fonts named through a CSS variable (`font-family: var(--serif)` with `--serif` set in the same file) now count as a chosen typeface. Sample 04 found this false alarm.
- Samples site: every sample page has a **Side by side** tab that runs both results live next to each other, at phone (390 px) or laptop (1280 px) width scaled to fit, with an option to scroll both together.

Added (samples)
- Sample 04, the UCA Kit home page: the same prompt of plain facts, built once without and once with the kit (main after v0.1.1). Both runs chose the same headline. With the kit, the run wrote a design brief first, kept the install command on one line at laptop width and checked two of the numbers against the installed files. The Senior Bar check gave both 5 of 8.

Added
- An import map block: starting from the entry files, it follows local imports breadth first (JavaScript, TypeScript with tsconfig path aliases, Python, Go packages through the `go.mod` module path, and Rust `mod`, `use crate::` and workspace crates) and lists who imports what, within a fixed budget of about 3,000 characters. Leaf files share one line, and source files no entry reaches are counted. Tested on Express, Koa, Fastify, got, chalk, the FastAPI full-stack template, gin, ripgrep and axum.

## 0.1.1 (2026-11-15)

Fixes from the first safety audit (playbook items P0.1 to P0.4). Each bug was first reproduced as a failing test, then fixed; the tests stay in the suite.

Fixed
- Handoff guard: a tampered `.uca/state.json` could make a passing run delete a file outside the project; a dangling link could make a restore write outside; a linked `.uca`, mirror or backup folder redirected reset, copies and snapshots; a wrongly shaped state ended in success. The guard now refuses linked folders and checks the state file field by field.
- Install, update and uninstall: an update that failed halfway left kit files looking like your edits; a manifest edited to list your own file made `uninstall` and `update --prune` delete it; a linked `.uca` folder made `uninstall` delete a file outside the project. Updates now record what they wrote, and deletes are limited to paths the kit installs.
- Usage ledger: writers running at the same time lost counts (8 of 17 kept in a test with 16 writers); fractional or oversized counts, unknown fields and bad dates were accepted. Writes now hold a lock, and every field is checked. A writer clearing a lock left by an exited process first moves it aside and checks it is still that lock, so it can never remove a newer writer's lock (CI caught one lost count before this).
- Package: a `.env`, key, certificate or log file left in a shipped folder would have been published. Secret-looking files are now excluded.

Added
- Adversarial test files for the guard, lifecycle, usage ledger and package boundary.
- A run-time check that the installer and scripts make no network requests and start no program except read-only git.

Changed
- `uninstall` and `update --prune` keep a file outside the kit's known paths and ask you to delete it by hand.
- README and SECURITY name the project scanner's `--verify` option, which runs the command you give it.

## 0.1.0 (2026-11-06)

First public release.

Added
- Installer with three tiers (lite, standard, full), a manifest, and `init`, `doctor`, `diff`, `update` and `uninstall` commands.
- A short core rulebook per tier, sixteen skills, workflows (new project, feature, bug, deployment, stack migration), and a keyword reference router.
- Handoff guard (`scripts/uca-guard.cjs`): runs a check, detects triggers in code, snapshots, restores the last passing copy, writes a redacted `HANDOFF.md`, and names the next model.
- Senior Bar check (`scripts/uca-senior-check.cjs`): a read-only static checklist of sixteen basics, plus unscored hints.
- Design check, project card generator and checker, and a local usage meter.
- New-project workflow with a short intake (at most three questions with defaults) and a finishing scorecard.
- A scratch folder rule: throwaway work goes in a gitignored `.uca-workspace/` folder.
- Benchmark kit and a with/without-kit demo. The demo is one run per side and is not a result.
- A documentation page at `demo/docs/`.

Known limits
- No scored runs against real models have been published.
- Host compatibility is untested for every listed tool.
- Instructions are followed by a model and are not enforced by code.
- The static checks read text and cannot judge correctness or security.
- Windows is covered lightly in CI.
