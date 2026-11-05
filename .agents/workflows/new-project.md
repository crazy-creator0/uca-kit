# Workflow: New Project

## Goal
Turn an idea into a small, verifiable, maintainable application without overengineering.

## Size the plan first
A small request (one file, one screen, one person using it, for example "create a cafe management file") gets a short plan, not an interview: write the plan block below in about six lines, state your assumptions, ask at most one question and only if a wrong guess would be costly, then build. A larger or riskier request gets the full steps and your plan is approved before you build.

**Plan block (show it before any code):** who uses it and what they do; the main objects and states; the stack decision (choice, why, cost, what would make you switch); the files you will create; the first slice; how you will check it.

## Intake: only the questions that change the build
Before asking anything, read what the user already gave you (the request, attached files, the folder). Ask only what a wrong guess would make expensive to redo, at most three questions, in plain words, each with your default so "go ahead" works. Good candidates:
- Who uses it, and on what device (phone, laptop, both)?
- Does it store anything about people, take payments, or need logins? (This changes the stack and the security work.)
- Where will it run: just their machine, or on the internet?

Do not ask about colors, fonts or folder names; pick sensible defaults and say what you picked. If the user cannot answer, use your default, write it under "Assumptions" in the plan block, and keep going.

## Steps
1. Clarify users, problem, key journeys, constraints, data sensitivity, hosting, and acceptance criteria. If the product has a screen, do `design-taste-discovery` Step 1 here (who uses it, real objects and states, daily jobs in their own words, believable sample data).
2. Inspect repository and existing conventions before choosing a stack.
3. Separate confirmed requirements from assumptions.
4. Choose the simplest suitable stack for the confirmed requirements and existing conventions; do not assume a language or framework in advance. For a screen, follow "Stack decision" in `frontend-engineering`, and write the look as a brief with `design-taste-discovery` Step 3 before building.
5. Sketch the request/data flow and a minimal schema.
6. Identify security boundaries and test strategy.
7. Create a prioritized backlog; define a small MVP.
8. Implement the first vertical slice end-to-end, with realistic data from the domain. For a screen, review it with `design-taste-discovery` Step 7 and run `node scripts/uca-design-check.cjs` on the UI files when it exists.
9. Add tests and verify the slice. When `scripts/uca-senior-check.cjs` is installed, run `node scripts/uca-senior-check.cjs .`, fix the failing basics that are in scope (README, .gitignore, .env.example, test command), and report the result honestly; it is a static checklist, not proof of quality.
10. Document setup, decisions, and next milestone.
11. Check whether the project is already under Git. If not, explain the benefits of Git and ask whether the user wants to initialize it; if they decline, continue locally without blocking project work.

## Senior finish: the scorecard
Do this once the first slice works, before you say it is done. Walk the list, fix what is in scope, and mark each line Done, Not applicable (say why) or Left (say why). Never mark a line Done without having looked at the file or run the command.

1. **Runs from the README.** README says what it is and the exact steps to install and start it. Follow them yourself.
2. **Basics for the stack.** .gitignore covers dependency folders and .env; .env.example lists the settings the code reads; a lockfile or pinned versions; a start or build command.
3. **No secrets in code.** Nothing key-like in source; settings come from the environment.
4. **Real states.** Loading, empty and error states exist for every screen that fetches or lists data, with plain wording and no raw error text shown to users.
5. **Input is checked.** Every form or request body is validated on the server side too, and the message says what to fix.
6. **Works small.** The page is usable at phone width, images have alt text, controls are reachable by keyboard.
7. **Tested.** At least one test for the main journey and one for a failure; the test command passes.
8. **Safe by default.** No eval or raw HTML from user input, no wide-open CORS, no TLS checks turned off, no debug mode left on.
9. **Static check.** Run `node scripts/uca-senior-check.cjs .` when installed and fix the failures that are in scope.

Then give the user a scorecard of at most 12 lines in plain words: what is Done, what is Left and why, what you could not check (for example "not opened in a real browser"), and one next step. Do not call the project production-ready: say what was checked, not how good it is.

## Deliverables
- Requirements and acceptance criteria.
- The plan block, with the stack rationale and architecture sketch.
- For a screen: the design brief and what the design check reported.
- Initial backlog.
- Reproducible local setup, whether or not Git is used.
- First tested vertical slice.
- The senior-finish scorecard.

Do not generate the whole application in one unexplained response.
