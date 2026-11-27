# Changelog

All notable changes are listed here. The project is early-stage, and nothing below has been benchmarked against real models.

## Unreleased

Nothing yet.

## 0.3.7 (2026-11-26)

Everything since 0.3.6, in one release. The kit now counts what a run cost in model requests, and what every request carries is lighter on every host than in 0.3.6. Real runs still show the kit making more requests than no kit: a real OpenCode run on 26 Nov (Big Pickle, snake prompt, one run per arm) made 43 requests with the kit against 24 without, both games passing 8 of 8 browser checks. Cost is about requests times context per request, and 0.3.6 cut only what is read. This release measures requests and fixes the defects that run found; cutting requests comes next, aimed by the step log.

The pre-release tags 0.3.7-pre.1 to 0.3.8-pre.4 were withdrawn; every change they held is here.

Added
- **Run summary**: `node scripts/uca-usage.cjs steps <file> [second file] [--json]` totals a run: requests and how each ended (tool calls, reply, cut off), input summed over all requests (new, cache read, cache write), output, peak context, wall time, tool calls by kind, reads before the first write, and kit files opened. A second file prints two runs side by side. A number the file does not hold prints as unknown, a partial total as "at least"; it reads only.
- **Run sheet for every host without a step log**: `benchmarks/agent-eval/RUN-SHEET.md` and `run-sheet.csv`, one row per request or one totals row, each figure marked exact or estimated, with requests counted from the transcript where a host shows none. `steps` reads it like a step log.
- **Page check** (standard and full): `scripts/uca-page-check.cjs` runs the user's steps, written by the agent one per line, on a local page, and reports page and console errors, overflow, images without alt, unnamed controls, and a note when a clicked button keeps keyboard focus (the pause or restart bug behind round 3's lost snake point). Steps: `click`, `type`, `press`, `wait`, `expect text <text>`, `expect text <selector> <text>`, `expect visible`, `expect count`, `expect focus`. Local files and localhost only; uses Playwright if installed and never installs it; without a browser it runs static checks and says the steps were not run.
- **Fixed cost per host**: `scripts/uca-host-cost.cjs` installs the kit for each of the 11 platforms in a temporary folder and measures what the host is meant to load every session. Every row says "intended, from install files, not run": no host has been checked in a real session yet; `docs/TOOL-COMPATIBILITY.md` says what to record when one is.
- **Cost ratchet**: `scripts/uca-cost-baseline.cjs` and `tests/cost-baseline.test.cjs` hold 71 numbers (always-on per tier, fixed cost per host, every Read first block, every task path, skill chains). The build fails when one rises without a written reason, or falls without the baseline being lowered.
- **Next lines** in ten Read first blocks, for real handoffs only (for example `design-taste-discovery` to `frontend-engineering`, `import-hygiene` and `testing-and-code-review` to `debugging`); every other skill ends at R-FINISH. `tests/flow.test.cjs` checks that names exist, that a cycle has only conditional edges, and that a chain is at most four skills. Two-skill chains read 381 to 512 estimated tokens of Read first blocks.
- **`init --model small|mid|large`**: a plain-words preset for `--context` (8,000, 32,000 or 128,000 tokens); a suggestion, or applied with `--auto-tier`; an explicit `--tier` wins.

Changed
- **Small build path.** A small request (one file or one screen, one person using it) follows "Small build" in `new-project`: a six-line plan, a one-file stack, the design skill's own "Small build", "Check it like the user" read in full, finish items 4 to 9 in one pass, and a closing message of 300 words or less. Medium and large builds, or any doubt about the size, keep every step. Lite's small build is its always-on text (1,175).
- **Split into parts.** `new-project`, `audit`, `stack-migration`, `design-taste-discovery`, `testing-and-code-review`, `frontend-engineering` and the design directions keep their Read first block in the main file and list every other section, with its own file, under `## Parts`; a model without Node opens only the part it needs, and `uca-read` follows the list.
- **What every call carries.** `AGENTS.md` keeps what a model needs if it never opens CORE (538 to 357 estimated tokens); the Route paragraph is shorter; the host entry files carry only what each call needs (25 to 52 fewer tokens per host); skill descriptions name their triggers only (the listed skills fall from 799 to 519 tokens on the six hosts that list them).
- **Read first blocks** for `project-notes`, `bug-investigation` and `production-deployment`, which printed whole before.
- **R-LOOP**, same words in every tier: also stops after two failed tries at one step, and the handover reports facts, not guesses.
- **New project**: its Read first names "Check it like the user"; the closing message starts with the R-FINISH lines and leaves out recaps of what the files show.
- **Kit bookkeeping**: standard and full say not to open files in `.uca/` unless a rule names one (three of six round 3 kit builds read the manifest, about 2,200 tokens).
- **Design review evidence**: text checks first; at most two looks, for a model that can read images; a text-only model marks the item "read, not looked" and hands the look to the user.
- **Tier by model.** On OpenCode, `full` installs the same files as `standard` and adds only the subagent rule to the core (about 154 estimated tokens per request); each subagent it starts is a whole extra run of requests. Large models are now suggested `standard`, like mid and free-tier models; `full` is chosen with `--tier full`. `--profile` without `--tier` now narrows `standard`, not `full`. `init` prints what each tier puts on every request on the chosen host. README, the demo page and the OpenCode, generic and platform setup docs say which tier fits which model.
- **The OpenCode step log** (`UCA_USAGE_STEPS`) names every tool call with its tool name and a kind worked out on the machine (read, write, check, shell, agent, other), and how each request ended. Paths other than the kit's, command text, arguments and file contents are never written (`USAGE-PRIVACY.md`). The OpenCode setup doc shows how to turn it on and total it, and how to count a run without the kit the same way.
- **A file the user did not build is not audited.** Audit and application-security say, for an APK, EXE or installer, that they cannot tell whether it is safe, and to name a malware scanner.

Fixed
- **The page check took every text check as page text**, so `expect text #score 00` looked for the words "#score 00". That is how a model wrote all five of its text checks on 26 Nov, and the file failed 5 of 5 on the build it was written for. Now a first word starting with #, . or [ names an element; a missing element fails as "no element matches"; a failed element check shows up to 40 characters of that element's text; a difference in letter case only (CSS `text-transform`) passes and says so; every unknown line is named in one error that lists every accepted form. The 26 Nov steps file is a test fixture and passes 26 of 26 on that build.
- **The OpenCode plugin never started.** In a real run on Windows (27 Nov) neither arm wrote a step log and the kit arm wrote no usage ledger. The plugin was `uca-usage.mjs`, and OpenCode's docs list `.js` and `.ts` plugins; OpenCode 2.x also needs a different plugin shape. The plugin is now `.opencode/plugins/uca-usage.js` with one default export: `server()` for OpenCode 1.18.29 or newer and `setup()` for 2.x (tool hooks and event stream, from OpenCode's docs). Its first step-log line says which API started it, so an empty log means it did not start; on 2.x, whose message event fields are undocumented, it also names each event type seen (names only). A host that starts it twice adds hooks once and counts each message once. The run summary reports the start line, warns when there is none, and lists the event types when no request was counted. `update --prune` removes the old `.mjs`.
- **The no-kit arm could not be logged.** Without the kit's scripts the OpenCode plugin did nothing, so a run without the kit had no step log and its requests had to be counted by hand. Now, in a folder that holds only the plugin file, it writes the step log and nothing else (no ledger, no budget guard); with no step log asked for it still does nothing. A test runs it in such a folder and plants a path, file content and a prompt, none of which reach the log. The run summary's `--json` also gives the number of subagent calls (`agents`).
- The 0.3.6 entry said "not yet released"; it was published on 2026-11-25.

Sizes against 0.3.6, estimated tokens (characters / 4)
- Always-on: standard 2,035 (2,200); lite 851 (851), worst case 1,600 (1,600).
- Fixed per host, standard: generic 2,035 (2,200), Codex and OpenCode 2,554 (2,999), Claude Code 2,645 (3,139), Gemini 2,650 (3,145), Cursor 2,183 (2,400). Lite: Claude Code 1,059 (1,108), Gemini 1,064 (1,114).
- Task paths, standard: bug 2,253 (2,429), feature 2,510 (2,673), audit 4,977 (5,035), small build 4,315 (7,636 on the full path), medium or large new build 7,844 (7,636).
- Reason for the one rise, the medium or large new build (+208): the routing line to "Small build", the page-check line in "Check it like the user", the text-first evidence rule in the design review, and the Next line to frontend, all added on purpose.

Not done, by decision
- No reading budget in `.uca/config.json`: no rule in any tier would read it.
- Lite is not split into parts: its four skills total 749 tokens and lite sits at its 1,600 limit, so Parts lists would cost more than they save.
- No five-line handoff between skills in CORE: within one session the earlier work is already in context; it belongs where separate agents hand work to each other.

Not reached
- A small build at 4,000 estimated tokens or less (4,315): always-on text alone is 2,035, and cutting further would change shared rules.

Checked before release
- What ran: `node tests/verify.cjs` (7 checks, all passed, exit code checked) before each commit; `node scripts/uca-cost-baseline.cjs` (all 71 numbers match); the 26 Nov steps file on the 26 Nov kit build with Playwright (5 failed with the earlier script; 26 passed, 0 failed now); uca-audit on the whole repository: `node scripts/uca-readiness.cjs .`, `node scripts/uca-audit-check.cjs .`, `node scripts/uca-wiring-check.cjs .`, and a hand review of each change.
- Readiness: Gold, 25 of 26, unchanged from 0.3.6 (the orphan `demo/docs/index.html`). The audit check read 200 files with no findings; the wiring check passed.
- Hand review: every line removed from AGENTS.md is in CORE, or was a pointer only, and the tests that pin its safety lines pass unchanged; R-LOOP matches word for word in the three cores; a Parts list cannot reach files outside `.agents` (tested); the page check and host-cost scripts run no other programs and refuse non-local pages (tested); the step log writes no path outside the kit, no command text and no arguments (a test plants a secret path, file content and token); the summary reads at most 20 MB and writes nothing; without the kit's scripts the plugin starts no program and writes no ledger (tested). The `.js` plugin: one default export only, so no host starts it twice from two exports (tested); on 2.x a second client connection adds no second set of hooks, a repeated message counts once, and no path, content or prompt reaches the log (tested); an event type is written only if it is a plain name of at most 60 characters.
- Protocol for the logged run, fixed before it: `benchmarks/agent-eval/step-log-baseline/PROTOCOL.md` (snake, Big Pickle on OpenCode, standard tier, step log in both arms, one run per arm, measurement only).
- Limits found: `design-taste-discovery` is at its 9,000-byte limit, so its next addition must remove as much as it adds.
- Not covered: the `.js` plugin has not yet run in a real OpenCode session, on 1.x or 2.x; on 2.x, token counts depend on an event shape OpenCode does not document; whether Bun loads it in a project whose own `package.json` says CommonJS is unconfirmed. The step log has not yet run in a real OpenCode session, so whether OpenCode reports a tool call before or after the request that asked for it is unconfirmed (the summary counts tool calls between two requests and does not assign them); wall time starts at the first logged event; no host has been checked in a real session; the page check's browser path ran on Linux only (Playwright is not installed in CI); whether models follow the small-build path, the Next lines and the shorter closing, and whether scores hold, is for round 4.

## 0.3.6 (2026-11-25)

Cuts what the kit asks a model to read on every task, for every task type. Round 3 below measured it: the kit builds read less, but cost no less, and the protocol's rollback rule was triggered by a one-point snake drop. It was published as a release; 0.3.7 reworks the change linked to the lost point instead of rolling 0.3.6 back.

Changed
- **Route table in the core.** Standard and full pick a skill from a short table in `.agents/CORE.md`. `router-rule.md` stays the source of truth and is read only when no row fits, two rows fit equally, or the task spans three or more areas. `AGENTS.md` now sends the model to the core before every task, and no longer to the skill map and catalog. A test keeps the table in step with the router.
- **Guardrail lines in the core.** The must-do lines of `anti-hallucination` and `anti-ai-slop` are in the standard and full cores. The full files open only when those lines say so; both now start with a Read first block.
- **Removed the repeated "Expanded guidance"** from the standard and full cores. Its one unique line moved to the PROJECT.md template.
- **Read in parts.** `new-project`, `audit` and `stack-migration` open with a Read first block. A new read-only helper, `scripts/uca-read.cjs` (standard and full), prints a skill's or workflow's Read first block, one section, or each heading with its first line. It takes names, never paths. A pointer to one section of a skill now means that section only, and the design step lists the directions before reading the two it shortlists.
- **R-PROJECT** applies to an existing or ongoing project, in the same words in every tier. Lite stays at 1,600 estimated tokens through a shorter line in lite's own `AGENTS.md`.
- **One finishing report.** R-FINISH is the report; the guardrails' completion sections point to it. A small new build walks scorecard items 4 to 9 and skips the README, readiness run, scorecard and deliverables list unless asked.
- **Measurement.** `scripts/uca-context-report.cjs` measures four task paths (bug, feature, new app with a screen, audit) against the same files read whole. The new-app figure now counts `directions.md` and `review.md`, which the old one left out. Opt-in step logs: `UCA_USAGE_STEPS` in the OpenCode plugin (per-message tokens and kit files opened; simulated in tests, not yet tried in a real OpenCode) and a read log in the helper. Neither logs prompts, replies or file contents; see `USAGE-PRIVACY.md`.
- Sizes, estimated tokens (standard): always on 1,832 to 2,168. Per task, what the instructions ask: bug 2,397 (was 5,251 with the router, guardrails and skill read whole), new app with a screen 7,604 (was about 11,500 counting the design references), audit 5,003 (was 7,687). Lite unchanged at 851 always on, 1,600 worst case.

Fixed
- `package.json` and `CITATION.cff` read 0.3.6. The v0.3.5 tag points at the round 2 results commit (`e65699d`), whose `package.json` still read 0.3.4.
- Round 2's results listed a `tokens.log` that was never committed; the line is removed. Its per-task averages are in its cost table.

Evaluation round 3 (`benchmarks/agent-eval/round-3/`)
- Same tasks and prompts as round 2, three runs per arm on one model, blind scorers, protocol pushed first.
- Scores: snake kit median 29, no kit 29 (round 2 kit: 30). Bakery kit median 29, no kit 28 (round 2 kit: 26). Verdict under the rule: no clear difference.
- Cost: the kit used 30% (snake) and 28% (bakery) more tokens than no kit; round 2 measured 12% and 24%. Not cheaper.
- Reads, measured: every kit build read its skills in parts, and none opened the router or a guardrail file. Kit instructions came to about 7,600 to 10,200 estimated tokens per build. Most of the cost gap was extra checking work: about 9 more tool calls per build.
- Rollback rule: triggered by the snake median, 29 against 30. The lost point is a pause or restart bug in the scripted session, which two no-kit builds also had. One kit build that lost it never opened the testing section; the results say what that does and does not show.

Checked before release
- What ran: the full test suite (`node tests/verify.cjs`, 7 checks), and the readiness, audit and link checks on the whole repository.
- Readiness: Gold, 25 of 26, unchanged. The audit check read 197 files with no findings. The link check found nothing new: the one orphan page (`demo/docs/index.html`) is also on main.
- Not covered: Model B (OpenCode) for round 3, and any host other than the one used for round 3.

## 0.3.4 (2026-11-25)

The kit changes meant for 0.3.3, which missed that tag. Not measured yet: whether they help.

Changed
- `anti-ai-slop` now says its rules cut needless code, not features: the small extras a user of this kind of product expects are requirements once the plan lists them, and none is dropped to make the diff smaller. A user's own snake-game test, run outside the evaluation, showed the build with the kit plainer than the one without (no best score, speed display or sound switch).
- New project: the plan block lists 3 to 5 small extras a user of this kind of product would expect, each marked in or out. In an empty folder the project-discovery script is skipped until the first slice exists; PROJECT.md starts with the brief.
- Sizes, estimated tokens: `anti-ai-slop` +73 (read on every task in standard and full), new-project +76 (read for new projects only). Lite unchanged.

Checked before release
- What ran: the full test suite (7 checks), the readiness, audit and link checks on the whole repository.
- Readiness: Gold, 25 of 26, unchanged; the audit check read 196 files with no findings; the link check found nothing new.
- Not covered: whether the new wording changes what a model builds. That is what evaluation round 2 is for.

## 0.3.3 (2026-11-25)

Tagged on the evaluation commit, so it contains 0.3.2 plus the round 1 evaluation below; the kit changes first listed here ship in 0.3.4. Its package.json still reads 0.3.2.

Added
- Agent evaluation round 1 in `benchmarks/agent-eval/`: two tasks (a household spending tool, a trip expense splitter), three runs with and three without the kit, scored blind on 15 points each, with the protocol, hidden inputs and decision rule fixed and pushed before any run. Result under that rule: no clear difference. Every build scored 29 or 30 of 30, so the tasks were too easy to separate the two sides. The kit side used roughly 10 to 17% more tokens (partial counts). Scores, evidence, closing messages and the maintainer's own blinding errors are published.

## 0.3.2 (2026-11-24)

A patch release that finishes the 0.3.1 work. Not measured yet: whether any of it helps a model build, route or fix better.

Added
- Project brief: for an empty folder or a project with no clear direction, the agent drafts title, description, goal and the main task steps, each marked assumed, and the user edits them; "go ahead" accepts. They live in PROJECT.md under "Project brief", in `key: value` lines, outside the generated blocks. `uca-project-check` prints a note when the brief is missing or empty; the note never changes the exit code. (The 0.3.1 "Main task" section is still recognised.)
- Attached documents or images are the spec: the brief and plan are drafted from them, naming where each point came from, and only what they leave open is asked. The whole documented scope is planned and built slice by slice to the end. A model that cannot read an image says so and asks for a description.
- `uca-context-report` also reports the two largest workflow tasks (a new app with a screen, an audit), which it used to leave out.

Changed
- `skill-gap-router` is still installed in every profile but no longer read on every task: only for unclear or many-area tasks or a missing capability (`router-rule.md` step 7). Its rules found nowhere else moved to the router rule: outside skills only when the user asks; nothing third-party installed or run without showing it and a yes; web research separate from skill search. The skill itself is shorter, with a Read first block, and leaves verifying and reporting to the testing skill and the core.
- Core rules (all tiers): R-NEW's plan also names the title and goal. Checks lines use the form `step | level | result`.
- Sizes, estimated tokens (characters / 4): a typical standard task falls from about 6,520 to 5,070 (−22%), a new app with a screen from about 10,490 to 9,045, an audit from about 9,040 to 7,590. Lite worst case is exactly at its 1,600 limit, paid for by shorter wording of R-LOOP.

Removed
- An unlinked planning document from the repository root (listed under 0.3.1 by mistake; see the correction there).

Checked before release
- What ran: the full test suite (591 tests, 7 checks), the readiness, audit and link checks on the whole repository, the reference router on five tasks (a bug, "improve this", a many-area payment flow, a new app, a greeting), and a search for documents still calling `skill-gap-router` always read.
- Readiness: Gold, 25 of 26, unchanged; the one left is the old docs address, kept as a redirect on purpose. The audit check read 196 files with no findings. The link check found nothing new.
- Found and fixed: the 0.3.1 entry listed a file as removed that was still in the repository; the removal ships here and the 0.3.1 entry carries a correction.
- Not covered: Windows; hosts other than Claude Code; any real model run on the changed routing.

## 0.3.1 (2026-11-24)

A patch release. Sample 06 showed agents building and testing from their own assumptions: every build passed its own tests, and a person using the editors found the main job, changing text on a page, did not work the way they expected. This release makes the kit check the main task the way the user does it, for any model: text-only or image-reading, small or large, on any host or operating system. Not measured yet: whether these changes help a model build or fix better. No claim is made until a planned evaluation is run.

Added
- Sample 06, a private PDF editor "like Sejda, but better", in three rounds, each scored on the same 20 points written before the first run: the build with and without the kit, a blind `uca-audit` of the kit's build, and the kit's build debugged by two fresh sessions, one with the kit and one without. All four builds, the audit report, the debug sessions' closing messages and the maintainer's test scripts are in `demo/samples/pdf-editor/`. The kit's build lost the build round, 15 to 18 of 19 scored points, and the debug round was a tie, 17 of 20 each. Later testing by a person found problems the 20 points did not cover: in all four builds, a longer line typed into a paragraph runs off the page, and a paragraph cannot be edited as one block. One run per side: data points, not rates.
- "Check it like the user", in `testing-and-code-review`: before saying the main task works, check it from the user's expected results, with at least one hard input from their world, at the highest level the model can actually use. Ability is shown by running a command, not assumed. The levels: read the code (any model); a short script with what is installed that does what the user does and prints at most about 20 lines (models that run commands); one picture of the app's own page for what a script cannot judge, only after reading a known test picture (models that read images); and steps or a research prompt for the user (always, for whatever is left). Scripts print counts and positions, never the user's content; nothing is installed without asking; no whole-screen pictures.
- PROJECT.md gets a "Main task" section in the user's words, outside the generated blocks. `uca-project-check` prints a note when it is missing or not filled in; the note never changes the exit code, so existing cards keep passing.

Changed
- Core rules (all tiers): R-NEW's plan now includes the main task steps with expected results; R-FINISH reports Checks per main step (read, script run, image really read, or steps left for the user).
- New project: the plan block holds the main task as the user would do it, 3 to 6 steps in their words, each with a concrete input and the expected result, confirmed by the user or marked assumed. A "like X" request lists X's core features with one line on how each behaves in X, marked checked or unchecked, and the README may say X lacks a feature only after checking. The scorecard checks each main-task step like the user, and "Does what was asked" now includes: the output matches the expected results, with nothing collapsed, cut off or overflowing.
- Audit: the user lenses are merged into one, "The people who use it": the ordinary user's main task first, through the same check, then edge users, then the request and every claim in the README and screens. A missing requested feature or a false claim is at least Medium. The workflow is 32 tokens shorter.
- Finding what is broken: a request with no single symptom starts with the audit; the fix is re-checked the way the user hit the problem.
- Design review (Step 7) judges what the user produces, not only the screen. The OpenCode verifier agent uses the same check.
- Sizes, estimated tokens: lite worst case 1,598 of its 1,600 limit (paid for by shorter wording of R-AUDIENCE and R-TOKENS, and by removing a lite skill line that repeated R-IMPORT word for word); the testing skill grows by about 500, loaded only when checking; new-project grows by about 135.

Removed
- An unlinked planning document from the repository root. Correction: this removal was listed here but merged after the 0.3.1 tag; it ships in 0.3.2.

Checked before release
- What ran: the full test suite, the readiness, audit and link checks on the whole repository, an install of every tier, and the sample page in Chrome (service workers, browser storage, outside requests).
- Readiness: Gold, 25 of 26, the same as 0.3.0; the one left is the old docs address, kept as a redirect on purpose. The audit check read 197 files with no findings.
- Found and fixed: the sample page linked to a folder with no page in it (found by the link check).
- Found and documented, not changed: on the website the four sample builds share one browser storage area, so one can lose another's autosave; editing and saving still work.
- Not covered: Windows; hosts other than Claude Code reading the new skill text; models other than one frontier model.

## 0.3.0 (2026-11-24)

A minor release: the audit. "uca-audit" runs a read-only review of your own project, an audit check finds ten kinds of problem in what the code does, and readiness levels (Bronze, Silver, Gold) turn the Senior Bar and the audit into a to-do list. Measured: 13 of 13 planted problems on the audit benchmark with no false alarms, and on three real repositories, checked by hand, 7 real findings and 1 false alarm. Not measured yet: any of this with a real model, and whether the Key file notes from 0.2.1 save tokens (the token test is designed, not run).

Checked before release
Before this release we ran "uca-audit" on this repository itself, read-only, and fixed what it found. Every fix has a test that fails on the code before it.
- What ran: the readiness check and the audit check on the whole repository; a hand review of the installer, update and uninstall (the code that writes and deletes files in your project), the four scanners and the skill-copying script; worst-case files for the scanners (400 KB of crafted input each); symbolic links pointing outside a test project.
- Found and fixed, medium: `scripts/sync_skills.py` followed a symbolic link. If a project's `.claude` folder was a link, the skills were written wherever it pointed, outside the project (reproduced: 20 files written outside). `--custom-dir ../outside` was accepted too. It now refuses linked folders and paths that leave the project, like the installer already did.
- Found and fixed, low: a crafted file with thousands of unclosed loops made the audit check slow (5.8 s for one 390 KB file, growing with the square of the size). Loop bodies are now read up to a fixed limit: 0.13 s for the same file.
- Found and fixed, accuracy: the readiness check gave this repository no level because of five false failures in the Senior Bar: fake keys in the secret guard's own tests, deliberately bad HTML pages used to test the design check, a command-line tool with no `start` script, and optional tuning settings asked to have an `.env.example`. Now: secret-shaped values in tests are a hint, not a failure; test fixtures are not scored for accessibility; a `bin` entry counts as a run command; a setting read with a default, or checked before use, is optional. After the fixes this repository reached Gold, 24 of 24 checks; with the two wiring checks added later in this release it is Gold, 25 of 26, the one left being an old address kept as a redirect on purpose, listed for a person to confirm.
- Found and fixed, coverage: the audit check skipped the kit's own scripts everywhere, so it never read them in this repository. It now skips them only in projects where the kit is installed; on this repository it read 112 files with no false alarms (113 at release, with the wiring check added).
- Checked and found safe: update and uninstall delete only files the kit installed and the user has not edited, refuse `..`, absolute paths and linked folders, so a crafted manifest in a cloned repository cannot reach outside the kit's files; all four scanners ignore symbolic links; no check prints a secret value.
- Second pass, after the fixes above were merged: the same checks again (all fixes held), plus the parts the first pass did not cover, the guard script, the usage meter and its OpenCode plugin.
- Found and fixed, medium: the guard wrote `HANDOFF.md` with a plain write. If a repository shipped `HANDOFF.md` as a link, the guard's report overwrote the file the link pointed to, outside the project (reproduced). It now writes a new temporary file and renames it into place, which replaces a link instead of following it; its state file is written the same way.
- Found and fixed, medium: the guard's redaction let a Stripe secret key (`sk_live_…`) through into `HANDOFF.md`. Stripe secret, restricted and webhook keys (`sk_live_`, `sk_test_`, `rk_live_`, `whsec_`) are now redacted, and the Senior Bar now reports them in source. Eleven other formats we tried were already redacted (database URLs with a password, bearer and basic auth headers, JSON Web Tokens, AWS, GitHub, Slack and Google keys, `KEY=value` lines, JSON passwords, URL tokens).
- Checked and found safe in the second pass: the guard's copies, backups and restores refuse paths that leave the project and resolve links first, and it refuses a linked `.uca` folder; the usage meter refuses linked folders and files and writes through a new temporary file; the OpenCode plugin runs the project's own copy of the usage script, which is how OpenCode treats project plugins.
- The new wiring check went through the same worst-case test before release: a crafted file of unclosed `<a href="` tags took 6.6 s, because each tag was re-read to the end of the file. Tag attributes are now read up to 4,000 characters: 0.4 s, with a test.
- Not covered: Windows (the checks ran on Linux).

Fixed (Senior Bar, found by the readiness levels on real repositories)
- Reading only `NODE_ENV` or Vite's `import.meta.env.MODE/DEV/PROD/SSR/BASE_URL` no longer counts as reading settings, so a library such as Koa is no longer told to ignore `.env` and ship an `.env.example`.
- A `.gitignore` in a subfolder now counts for dependency folders (`backend/.gitignore` listing `__pycache__`, as in the FastAPI template).

Added (audit)
- "uca-audit": `.agents/workflows/audit.md`, a read-only review of the user's own project: run the checks, confirm or reject each "needs a human" finding, then read for what static checks cannot see (object-level permissions, input edges, cost per request, secrets in logs, concurrency, problems one function away). Limits come first in the file: read-only, own project only, no requests to live systems, no working exploits, no secret values. The attacker mindset is written only in this file; a test fails if it appears anywhere else in the kit's instructions. Standard and full point to it; lite is unchanged (its instruction budget is full).
- Audit check (`scripts/uca-audit-check.cjs`): reads JavaScript, TypeScript and Python and reports ten kinds of problem with file, line, risk, fix and a confidence ("certain" or "needs a human"); never runs code, never reads `.env`, never prints a secret value; skips tests, examples and benchmarks.
- Readiness levels (`scripts/uca-readiness.cjs`): Bronze (safe to share), Silver (safe to show users), Gold (ready for production traffic), from 16 Senior Bar checks and the 10 audit kinds (and two wiring checks, added later in this release). "Needs a human" findings are listed to confirm, not failed; checks that do not apply are left out; the percentage is checks passed and is labelled as a to-do list. `--min` for CI. On the three real repositories: Koa reaches Gold (21 of 21); the FastAPI template reaches no level, because its `.env` file is committed and not ignored (true), 21 of 25 (22 of 27 at release, with the wiring checks); the Express RealWorld example reaches no level because of the `superSecret` fallback (true), 18 of 22.
- "uca-audit" looks through three more lenses after the attacker: every kind of user, a careful spender (cost per request and the cheapest change that keeps the result) and a breaker who assumes the project is already rated 10/10. It must look harder but never invent: every finding points to a file and line that was read, and every lens says what it looked at. It ends with a fix plan (grouped by cause, ordered, a failing test and a re-check for each fix, the user's decisions marked), waits for approval, then fixes one item at a time and runs the checks again after each, instead of fixing everything at once.
- Wiring check, link words and moved links: a link whose words match nothing on the page it opens (title, headings, file name, opening text) is listed for a person to confirm; actions such as "Open full page" and long card text are skipped. `--save` keeps a map of every link; `--compare` after a change lists each link whose words stayed but whose target moved, with its line. On a copy of this repository's demo site, swapping a card link and the "Docs" link: the word check caught the card (the other target page happens to mention docs), and the compare caught both. On the demo site and three real apps the word check raised no false alarm after tuning (a first version raised 31 on the demo site, all from card links and action phrases). The map file is written only inside the project, through a new file and a rename; links, dangling ones included, are refused.
- Wiring check (`scripts/uca-wiring-check.cjs`): do links between pages and routes lead somewhere, and back? It finds links, images, scripts and forms pointing to missing files, `#anchors` with no matching id, React Router and Next.js links (and menu entries such as `{ href: "/x" }`) to routes the app never defines, and pages with no way out or no way in. Links starting with `/` are also looked up in `public/`; build placeholders such as `%PUBLIC_URL%`, email templates, embedded pages and app shells are handled. It does not follow links built at run time, cannot see past a top-level catch-all route (it says so), and does not measure lag. Readiness gains two Silver checks from it: "Links and routes lead somewhere" and "Every page has a way in and a way out" (the second is only ever "to confirm").
- Wiring results, every finding checked by hand. This repository's demo site: 18 pages, 141 links, none broken, one orphan (an old address kept as a redirect, on purpose). The FastAPI full-stack template: one real broken link (`/vite.svg`, in no folder of the repository). The React RealWorld example: 12 route links, none broken; changing one link to `/setings` was caught. Taxonomy (Next.js): 49 route links, none broken; a misspelled menu link was not caught because its top-level catch-all route accepts every path, which the check now reports. A first version had a route bug that made any link match a route with a parameter (`/article/:id` matched `/profile`); the tests caught it before release.
- Readiness target: Silver and at least 80% of the checks that apply, shown as met or not met with the failing checks to fix first, lowest level first; a high percentage with a failing Bronze check does not meet it (the FastAPI template passes 81% but commits its `.env` file). `--target`, `--target-level` and `--require-target` (exit 1 below it). The new-project workflow ends by reaching the target or saying what keeps the project below it, and the audit's fix plan aims at it. It is a goal for the work, not a promise that every product reaches it.
- Standard and full install the audit check, the readiness check, the wiring check and the Senior Bar check.
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
