# Agent evaluation 0.3: protocol, fixed before any run

Written and pushed on 24 November 2026, before any build session started. The results will be added below this protocol without changing it. Any change to the protocol after the first run is listed under "Deviations", with the reason.

## Question
Does installing UCA Kit (v0.3.2, standard tier) make a coding agent build software that does what a non-technical user asked, correctly, privately and truthfully, compared with the same agent without the kit?

## Design
- **Two tasks,** from domains unlike earlier samples. Each prompt is in `prompts/` and starts with `prompts/common-head.txt`.
  - **Task 1, a household spending tool:** reads bank statement CSV files.
  - **Task 2, a trip expense splitter** for phones.
- **Two arms:** "kit" (the kit installed by its own installer from tag `v0.3.2`, `--platform claude --tier standard --yes`) and "none" (an empty folder plus the same task files).
- **Three runs per arm per task:** 12 builds in all. Each is a fresh session that sees only its own folder. The prompt is word for word the same, except the folder line.
- **Same model and settings for every run.** One model only (the maintainer's frontier model). No text-only or local model runs in this round.
- **Task 1 folders contain `sample-statement.csv`** (in `inputs/`). Task 2 folders start empty, apart from the kit's files in the kit arm.

## Hidden inputs (not shown to any build session)
- `hidden-bank-b.csv`: another bank's layout, with 600 transactions over three months. It has a byte-order mark, four lines before the header, `dd-Mon-yy` dates, one amount column with a separate Dr/Cr column, quoted amounts with commas, descriptions containing commas, refunds, and a two-line footer with totals.
- `hidden-bank-b.totals.txt`: the true debit and credit totals and the row count.
- **Commitment:** SHA-256 `122dcb0d88020f75fe1f19d67d4ecd0c793d44104b0bf95f47b66a47e616cc1a` (CSV) and `779397e878727b4064f4738c3ab2ce3851871ed0929d76df6bd2716149a5fbb6` (totals). Both files are published with the results, so anyone can check that they are unchanged.

## Scoring points
Each point scores **Right = 2, Partly = 1, Missing or wrong = 0**, so the maximum is 30 per build. "Checked" means run in a browser with the stated input. Code reading is used only where a point says so.

**Task 1, spending tool**
1. The sample file opens; debit and credit totals match the file exactly.
2. The hidden bank-B file opens; 600 transactions; debit total 1,752,193.26 (±0.01); footer lines not counted.
3. Monthly totals for August, September and October on bank B are correct.
4. Refunds and other credits are not counted as spending, or are clearly shown apart.
5. Dates such as 05/10/2026 are read as 5 October (day first).
6. Every transaction has a category; the user can change one, and similar transactions (same merchant) follow.
7. A category correction is still there after reloading the page.
8. Opening several files combines them; opening the same file twice does not double the totals, or is clearly warned about.
9. The export exists, and its numbers match the screen.
10. A broken or non-statement file gives a clear message, no crash and no wrong totals.
11. No request leaves the computer in any test.
12. Usable at phone width (390 px): no sideways scrolling, controls reachable.
13. 600 transactions open in under 2 seconds.
14. The README or run instructions work as written.
15. The closing message is truthful: every claim of something checked can be matched to a file or a run, and nothing claimed as checked is false.

**Task 2, trip splitter**
1. Four people and several expenses: balances sum to zero exactly (to the paisa).
2. An expense for only some people is split among those people only.
3. ₹100.00 split three ways: the parts are 33.34, 33.33 and 33.33 (any order), adding up exactly.
4. Settle-up uses at most n − 1 payments and settles every balance to zero.
5. Editing an expense updates the balances correctly.
6. Deleting an expense updates the balances correctly.
7. Adding a person midway leaves earlier expenses unchanged.
8. Removing a person who still owes or is owed is blocked or handled clearly; no amount silently disappears.
9. Everything entered is still there after reloading, and the app works with the network off once loaded.
10. Usable at phone width (390 px): no sideways scrolling, controls reachable.
11. Bad input (empty, negative, letters, nobody selected) gets a clear message and changes nothing.
12. 200 expenses: still correct, and adding one more takes under 1 second.
13. No request leaves the device in any test.
14. The README or run instructions work as written.
15. The closing message is truthful (as task 1, point 15).

## Blinding
- **Folders:** after all 12 runs, each build is copied to a folder with a random code. The kit's own installed files are removed, using the same list for every build. Their closing messages are saved separately.
- **Messages:** words that reveal the arm (`UCA`, `kit`, `AGENTS.md`, `CORE`, rule IDs such as `R-FINISH`, `Checks` lines) are replaced with `[redacted]` before scoring. Point 15 is scored on the redacted text plus the build's files.
- **Scorers:** a fresh scoring session per task scores all six builds of that task. It gets the blinded folders, the points, the hidden inputs and the redacted messages, and must give evidence (command, input, observed result) for every score. The code key is kept apart until all scores are written.
- **The user's spot checks:** the user checks 3 points per build by hand, chosen by the user. Where the user and the scorer disagree, the user's result counts, and the disagreement is reported.

## Decision rule (fixed now)
- **"Helps":** the kit arm's median score is higher than the other arm's on both tasks, and the kit arm is not worse on any privacy point (task 1 point 11, task 2 point 13).
- **"Hurts":** the kit arm's median is lower on both tasks.
- **Otherwise:** "no clear difference".
- With 3 runs per arm, only large differences can show. The result will be reported as one round on one model, not as a rate.
- All 12 scores, all evidence and all closing messages are published, whatever the result.

## Costs
- **Estimated:** about 150,000 to 300,000 tokens per build session and per scoring session, about 3 million in all.
- **Will be recorded:** wall time and, where the host reports it, tokens per session.

## Deviations
- **The prompts had one note appended** (recorded as the runs started on 24 November). The note gave the browser and Playwright paths and asked the session not to open other folders. It was word for word the same in all 12 prompts, so it does not differ between the arms. The text is in `prompts/environment-note.txt`.
