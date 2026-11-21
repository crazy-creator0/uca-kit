# Changelog

All notable changes are listed here. The project is early-stage, and nothing below has been benchmarked against real models.

## Unreleased

Changed
- Project scanner (`uca-project-discover.cjs`): the entry point the package declares now comes first (main, bin, exports, or Node's default `index.js`); a built path such as `dist/index.js` points to its source file when one exists. Entry-like files and routes inside example, test, fixture and benchmark folders are counted on one line instead of listed as the app's own. On Express this cut the entry list from 26 lines to 2 and the routes from 47 lines to 2.
- Routes written inside comments are skipped, and a FastAPI decorator is no longer also reported as a plain router call.

Added
- An import map block: starting from the entry files, it follows local imports breadth first (JavaScript, TypeScript with tsconfig path aliases, and Python) and lists who imports what, within a fixed budget of about 3,000 characters. Leaf files share one line, and source files no entry reaches are counted. Tested on Express, Koa, Fastify, got, chalk and the FastAPI full-stack template.

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
