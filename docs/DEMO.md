# UCA Kit demo: same task, with and without the kit

This is a demo plan, not a report of a run already performed.

## Goal

Show whether UCA Kit helps an agent make a focused, tested change without unnecessary repository scanning.

## Example task

Use a small sample repository with a reproducible bug and existing tests. Keep the exact task, starting commit, host, model, permissions, and test environment the same in both runs.

## Run A — Without UCA Kit

1. Start from a clean worktree at the recorded commit.
2. Give the agent the task only.
3. Save the diff, test output, elapsed time, and token/usage data if the host exposes it.
4. Record whether it found and fixed the bug, added a regression test, and reported unverified areas.

## Run B — With UCA Kit

1. Reset to the same recorded commit in a separate clean worktree.
2. Install/use the documented UCA Kit version and record it.
3. Give the same task to the same host/model.
4. Save the same measurements and artifacts.

## Report

| Measure | Without kit | With kit |
|---|---|---|
| Task completed correctly | Not yet measured | Not yet measured |
| Relevant tests passed | Not yet measured | Not yet measured |
| Regression test added when appropriate | Not yet measured | Not yet measured |
| Files changed outside the needed area | Not yet measured | Not yet measured |
| Elapsed time | Not yet measured | Not yet measured |
| Token usage | Not available until measured | Not available until measured |
| Limitations reported honestly | Not yet measured | Not yet measured |

Repeat tasks when possible; one run is anecdotal, not a benchmark. Publish failures and limitations alongside wins. Never fill the table with invented results.
