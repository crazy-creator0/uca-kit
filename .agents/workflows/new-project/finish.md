## Senior finish: the scorecard
Scale it to the build. **A small build** (as in "Size the plan first") walks items 4 to 9 below, fixes what they find, and reports with R-FINISH in a few lines: no README, .env.example, readiness run, scorecard or deliverables list unless the user asked for them. **A medium or large build** walks every item and ends with the scorecard. Either way, the closing message starts with the R-FINISH lines (Changed, Checks, Still unknown) and leaves out what the user can see in the files: no recap of the code, the plan or each step. A small build's closing message is 300 words or less; never shorten Still unknown to fit.

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
