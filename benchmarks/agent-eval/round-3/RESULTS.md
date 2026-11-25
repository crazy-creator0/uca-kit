# Agent evaluation round 3: results

Protocol: `PROTOCOL.md` in this folder, pushed before any run (commit `dda1865`, 25 November 2026, 16:24 IST). Unblinded the same day. Model A only: agent sessions started from the maintainer's Claude Code session (Claude Opus 5.5), three runs per arm per task. Kit arm: this branch at `dda1865` (0.3.6 changes), standard tier. Model B (OpenCode) was not run.

## Scores (out of 30, blind scorers)

| Task | Kit runs | No-kit runs | Kit median | No-kit median | Round 2 kit median |
|---|---|---|---|---|---|
| 3. Snake game | 29, 29, 30 | 30, 29, 29 | 29 | 29 | 30 |
| 4. Bakery orders | 28, 29, 29 | 28, 27, 29 | **29** | 28 | 26 |

**Privacy points** (task 3 point 12, task 4 point 12): 2 of 2 in all 12 builds.

## Decisions (rules fixed in the protocol)

1. **Same-day verdict: no clear difference.** The kit median is higher on the bakery task and equal on the snake task.
2. **Cost: not cheaper than 0.3.5.** The kit used 30% (snake) and 28% (bakery) more tokens than no kit. Round 2 measured +12% and +24%.
3. **Rollback rule: triggered.** The snake kit median (29) is one point below round 2's (30). Under the rule, 0.3.6 is not released as it stands, and the maintainer decides. What the evidence says about the cause is set out below.

## Cost (complete counts; no session was paused)

| Task | Kit, average tokens per build | No kit | Difference | Tool calls per build, kit / no kit |
|---|---|---|---|---|
| 3. Snake game | 103,009 | 79,507 | +30% | 23.7 / 14.7 |
| 4. Bakery orders | 112,789 | 88,128 | +28% | 25.0 / 15.3 |

Time per build: kit 199 to 480 s, no kit 136 to 316 s. The no-kit builds also used more tokens than in round 2 (79,507 against 65,123 for snake; 88,128 against 64,988 for bakery), so the two rounds' host counts are not on the same footing. Only the same-day differences are compared.

## What the kit builds read

From the read helper's log and the kit files' access times (`kit-reads.json`):

- **Every kit build read the kit through the new path.** Each opened `new-project` and `design-taste-discovery` at their Read first blocks, then only the sections it needed (14 to 17 helper reads). Each listed the design directions and read only the two it shortlisted. None opened `router-rule.md`, either guardrail file, the skill catalog or the skill map.
- **Kit instructions read per build: about 7,600 to 10,200 estimated tokens.** That is 4,000 to 4,900 through the helper, plus the core, `AGENTS.md`, `CLAUDE.md`, `review.md` and, in three builds, `.uca/manifest.json` (about 2,200). The context report's estimate of the same path is 7,604. For 0.3.5 the report estimated about 11,500 for the same task with whole files, but no round-2 read log exists to compare with.
- **The difference in totals is mostly not instructions.** The kit builds' total was about 24,000 tokens above no kit, of which about 8,000 to 10,000 were instructions. The rest went with the extra work: on average 9 or 10 more tool calls per build (test scripts kept in `.uca-workspace/`, screenshots looked at, the design check run) and longer closing messages.
- **Five of six kit builds touched all 16 files in `.claude/skills/`.** No other unread skill file was touched, which fits the host scanning the skill folder rather than the model reading each file. Those files are left out of the figures above; counted whole, they would add about 14,900 per build.

## Where the snake point went

- **Point 14 (the scripted two-minute session) is the only point the kit builds lost.** The no-kit builds also lost it, in two of three builds.
  - **Kit build 1:** after Restart was clicked with the mouse, Space restarted the game instead of pausing it. Kit build 3 found and fixed this same bug during its own testing.
  - **Kit build 2:** the drawn snake jumps by part of a cell at pause and resume. Two no-kit builds have the same jump. The game logic is correct.
- **The round-3 scorer measured drawing at pause, which the round-2 scorer did not.** The scorer notes that if a drawing-only jump is not counted, three builds rise to 30. The snake medians would then be kit 30 and no kit 30.
- **The traces show one possible link.** Five of six kit builds read "Check it like the user", the section that drives testing like a player. Snake kit build 2, one of the two kit builds that lost the point, never opened the testing skill. In 0.3.6 the new-project Read first block says to check the main task like the user but does not name that section; the pointer is further down, under "Steps" and "Senior finish", which this build did read. Whether 0.3.5's whole-file reading made the section harder to miss cannot be told, because round 2 has no read log.
- **The checks a small build now skips** (the readiness script, README, scorecard) do not test play or pause, so they are not linked to this point.

## Bakery

- **Totals:** kit 28, 29 and 29; no kit 28, 27 and 29. One no-kit build has no overall unpaid total and searches only finished orders; another has small tap targets on its order page.
- **Bad input (point 8): every build scored 1.** None warns about a date in the past. One kit build silently drops the minus sign from a negative price, and its closing message claimed wrong amounts get a message (point 15).
- **Offline:** this scorer gave point 6 to every build (no network calls after loading). Round 2's scorer gave every build 1 for the missing service worker. Under round 2's reading, every total drops by one and the medians become kit 28 and no kit 27. That is still above round 2's kit median of 26.

## What this round can and cannot say

- **The trims work as instructions.** Each kit build read its skills in parts, and none read the router or the guardrail files. That is measured, not estimated.
- **The trims did not lower what a kit build costs.** The cost is now in the checking the kit asks for, not in reading the kit.
- **The rules cannot separate a one-point snake drop from scorer differences.** Three runs per arm on one model, with a different scorer each round.

## Maintainer notes

- **Deviations:** none from the protocol. Model B was optional and was not run.
- **Blinding:** builds were copied under random codes. Only files identical to each build's fresh install were removed, plus the read log and folders the install created that were left empty. A file-list check showed only the builders' own files, including `.uca-workspace/` in kit builds, as in round 2.
- **Code key:** SHA-256 begins `537f67f8c3e4d267`, recorded before unblinding.

## Files

- `code-key.json`: code to run.
- `costs.tsv`: tokens, tool calls and time per build session, as the host reported them.
- `kit-reads.json`: the read trace per kit build.
- `scorer-evidence/`: both scorers' tables and the evidence for every score.
- `closing-messages/`: each build's `CLOSING.md`, with local paths shortened.
- `run-tools.cjs`: the setup, trace and blinding helper used for this round.
