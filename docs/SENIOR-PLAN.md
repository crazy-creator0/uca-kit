# Senior-grade plan

Goal: a new vibe coder installs the kit and the project comes out looking carefully built, and later questions about the project are answered like a senior developer would answer them.

Status: Phase 0 only. Nothing below Phase 0 is built, and no claim here has been measured.

## Phases

| Phase | What | How we will know it worked |
|---|---|---|
| 0 | A static Senior Bar check and a baseline benchmark kit | The check has tests; the benchmark kit exists and is marked "not run" |
| 1 | Smarter intake in the new-project workflow (ask the few questions that change the build) | Fewer rework rounds on the benchmark prompts |
| 2 | A senior build loop with a scorecard at the end | Senior Bar score on built projects goes up against the baseline |
| 3 | Reference-to-build: build from a screenshot or video the user gives | A person scores the result against the reference |
| 4 | Attacker-mindset security audit workflow and secure defaults | Findings are real and reproducible on a test app |
| 5 | Mentor mode: answers grounded in the user's own files, with file and line | Answers cite lines that exist |
| 6 | A compressed version of the bar for the lite tier | Lite core stays inside its token budget |
| 7 | Evaluate with real models | Scored runs recorded in the results sheet |

## Rules for every phase

- One small pull request per phase, tests passing before merge.
- No claim without evidence. If it has not been run, the docs say "not run".
- Read-only checks stay read-only. Nothing prints a secret.
- Adding a dependency or touching config needs the user's approval, as in the rest of the kit.

## Before a public release

- An install path that needs no terminal knowledge.
- An honest compatibility table: untested tools stay marked untested.
- Safe defaults for beginners: ask before deleting, deploying or spending.
- Supply chain: no install scripts, a pinned and signed release.
- Testing with non-English prompts and on Windows, macOS and Linux.
- Wording that does not promise results or guarantee security.
- A way for users to report bad output.

## Needs the owner

Real-model benchmark runs need the owner's own models and a person to score design. Choosing the license, making the repository public and publishing to npm are the owner's decisions.
