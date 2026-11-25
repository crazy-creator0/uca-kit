# Workflow: New Project

## Read first
Use when: a new app, site, page or tool, even from a one-line request.
Not when: a feature in a project that already has code (`feature-development`).
Must do: read "Size the plan first" now; show the plan block before any code; build slice by slice with real data from the domain; check the main task like the user; never drop a feature the user named.
Done when: the finish for the build's size is done, every plan item is marked Done or Left with a reason, and the closing message is truthful.
Stop here if: the user only wants the plan; then "Size the plan first" is enough.
Read on only for: "Intake" before asking questions or when documents or images are attached; "Steps" before building; "Senior finish" before saying it is done.

## Goal
Turn an idea into a small, verifiable, maintainable application without overengineering.

## Size the plan first
A small request (one file, one screen, one person using it, for example "create a cafe management file") gets a short plan, not an interview: write the plan block below in about six lines, state your assumptions, ask at most one question and only if a wrong guess would be costly, then build. A larger or riskier request gets the full steps and your plan is approved before you build.

**Project brief first** (an empty folder, or no clear direction): draft four short lines yourself, each marked assumed: title, description (one sentence), goal (what "done" means for the user), and the main task below. The user edits what is wrong; "go ahead" accepts them. Keep them in PROJECT.md under "Project brief" when the project will go on past this session; for a small one-off build the brief in the plan is enough. In an empty folder, skip R-PROJECT's discovery script (there is no code to read yet): a kept PROJECT.md starts with the brief, and run discovery once the first slice exists.

**Plan block (show it before any code):** who uses it; their main task as they would do it, in 3 to 6 steps in their words, each with a concrete input and the result they expect (one input hard: long, real-tool file, another language or the largest size), confirmed by the user or marked assumed; 3 to 5 small extras a user of this kind of product would expect (for a game: best score, sound on/off, a pause key), each marked in or out; the main objects and states; the stack decision (choice, why, cost, what would make you switch); the files you will create; the first slice; how you will check it.

**"Like X" or "better than X".** When the request names a product to match or beat, add to the plan block the core features a user of X would expect, with one line on how each behaves in X, each marked "in this build", "later" or "not planned" with a short reason; the user corrects the list, not the code. List only features you know X has or have checked; if you could not check, say so. For "better than X", name each extra and how you know X lacks it. Never write in the README or the app that X lacks a feature unless you checked.

## Intake: only the questions that change the build
Before asking anything, read what the user already gave you (the request, attached files, the folder). **Attached documents or images are the spec:** draft the brief and plan from them, naming where each point came from (file and section, or which image), and ask only what they leave open. Plan the whole documented scope and build it slice by slice to the end, saying which parts are done and which are left. If you cannot read an image, say so and ask for a short description; never guess from its name. Ask only what a wrong guess would make expensive to redo, at most three questions, in plain words, each with your default so "go ahead" works. Good candidates:
- Who uses it, and on what device (phone, laptop, both)?
- Does it store anything about people, take payments, or need logins? (This changes the stack and the security work.)
- Where will it run: just their machine, or on the internet?

Do not ask about colors, fonts or folder names; pick sensible defaults and say what you picked. If the user cannot answer, use your default, write it under "Assumptions" in the plan block, and keep going.

## Steps
Where a step names one section of a skill, read that section only: `node scripts/uca-read.cjs <skill> --section "<heading>"`.

1. Clarify users, problem, constraints, data sensitivity and hosting; the main task in the plan block is the acceptance criteria. If the product has a screen, do `design-taste-discovery` Step 1 here (real objects and states, daily jobs in their own words, believable sample data).
2. Inspect repository and existing conventions before choosing a stack.
3. Separate confirmed requirements from assumptions.
4. Choose the simplest suitable stack for the confirmed requirements and existing conventions; do not assume a language or framework in advance. For a screen, follow "Stack decision" in `frontend-engineering`, and write the look as a brief with `design-taste-discovery` Step 3 before building.
5. Sketch the request/data flow and a minimal schema.
6. Identify security boundaries and test strategy.
7. Create a prioritized backlog; define a small MVP.
8. Implement the first vertical slice end-to-end, with realistic data from the domain. For a screen, review it with `design-taste-discovery` Step 7 and run `node scripts/uca-design-check.cjs` on the UI files when it exists.
9. Add tests and verify the slice. For a medium or large build, when `scripts/uca-readiness.cjs` is installed, run `node scripts/uca-readiness.cjs .` (it includes the Senior Bar, `scripts/uca-senior-check.cjs`, plus the audit and link checks), fix the failing basics that are in scope (README, .gitignore, .env.example, test command), and report the result honestly; it is a static checklist, not proof of quality.
10. Medium or large build: document setup, decisions, and next milestone.
11. Check whether the project is already under Git. If not, explain the benefits of Git and ask whether the user wants to initialize it; if they decline, continue locally without blocking project work.

## Senior finish: the scorecard
Scale it to the build. **A small build** (as in "Size the plan first") walks items 4 to 9 below, fixes what they find, and reports with R-FINISH in a few lines: no README, .env.example, readiness run, scorecard or deliverables list unless the user asked for them. **A medium or large build** walks every item and ends with the scorecard.

Do this once the first slice works, before you say it is done. Walk the list, fix what is in scope, and mark each line Done, Not applicable (say why) or Left (say why). Never mark a line Done without having looked at the file or run the command.

1. **Runs from the README.** README says what it is and the exact steps to install and start it. Follow them yourself.
2. **Basics for the stack.** .gitignore covers dependency folders and .env; .env.example lists the settings the code reads; a lockfile or pinned versions; a start or build command.
3. **No secrets in code.** Nothing key-like in source; settings come from the environment.
4. **Real states.** Loading, empty and error states exist for every screen that fetches or lists data, with plain wording and no raw error text shown to users.
5. **Input is checked.** Every form or request body is validated on the server side too, and the message says what to fix.
6. **Works small.** The page is usable at phone width, images have alt text, controls are reachable by keyboard.
7. **Checked like the user.** Each main-task step checked with "Check it like the user" in `testing-and-code-review`, at the highest level available, one Checks line per step; at least one test for a failure; the test command passes.
8. **Safe by default.** No eval or raw HTML from user input, no wide-open CORS, no TLS checks turned off, no debug mode left on.
9. **Does what was asked.** Read the request again, and the "like X" list if there is one. Mark each item Done or Left (say why); a feature the user named is never silently dropped. The output matches the expected results in the plan: nothing collapsed, cut off, overflowing or changed that the user did not change.
10. **Reach the target.** Run `node scripts/uca-readiness.cjs .` when installed (otherwise `node scripts/uca-senior-check.cjs .`). The target is Silver and at least 80% of the checks that apply. Fix the items it lists, lowest level first. If something in scope still keeps the project below the target, say which item and why; the user decides whether to accept the gap. A "to confirm" item needs the user's answer, not a guess.

Then give the user a scorecard of at most 12 lines in plain words: the readiness level and checks passed against the target, what is Done, what is Left and why, what you could not check (for example "not opened in a real browser"), and one next step. Do not call the project production-ready: say what was checked, not how good it is.

## Deliverables (medium or large build)
- Requirements and acceptance criteria.
- The plan block, with the stack rationale and architecture sketch.
- For a screen: the design brief and what the design check reported.
- Initial backlog.
- Reproducible local setup, whether or not Git is used.
- First tested vertical slice.
- The senior-finish scorecard.

Do not generate the whole application in one unexplained response.
