# Agent evaluation round 3: protocol, fixed before any run

Pushed on 25 November 2026 on branch `kit/cost-trim`, before any round-3 build started. Approved by the maintainer. Results go in `RESULTS.md` without changing this text; changes go under Deviations.

Round 2 found the kit helped by one point per task, at 12% (snake) and 24% (bakery) more tokens than no kit. Round 3 asks whether the 0.3.6 changes cut that cost without losing the points.

## What 0.3.6 changes
- Skills are picked from a short Route table in the core; the full router is read only when the route is unclear.
- The guardrails' must-do lines are in the core; the full guardrail files are read only when needed.
- Skills and workflows are opened at their Read first block, one section at a time (`scripts/uca-read.cjs`).
- PROJECT.md is for existing or ongoing projects; a small new build has a lighter finish.

## Tasks, prompts and arms
- **Tasks:** the same two as round 2 (task 3, snake; task 4, bakery).
- **Prompts:** `../round-2/prompts/`, used byte for byte: `common-head.txt`, then the task text, then `ending.txt`.
- **Kit arm:** the kit installed by its own installer from this branch at the commit that adds this file, with `--platform claude --tier standard --yes`.
- **No-kit arm:** an empty folder.
- **Runs:** 3 per arm per task, 12 builds, in 3 batches of 4. Each batch mixes both arms.
- **Model A:** agent sessions started from the maintainer's Claude Code session, as in round 2. The model name is recorded in the results.
- **Model B (optional):** the maintainer's OpenCode with Big Pickle on Windows, 1 run per arm per task, with `UCA_USAGE_STEPS` set for per-message token counts. A cross-check only; not used in the decision.

## What is measured
- **Quality:** the same 15 points per task as round 2 (see `../round-2/PROTOCOL.md`), each Right 2 / Partly 1 / Missing 0, by one blind scorer per task.
- **Cost:** tokens, tool calls and time per session, as the host reports them.
- **Kit reads (kit arm only):** two traces, written by `run-tools.cjs trace` before blinding:
  - the read helper's own log (an empty `.uca/read-log.jsonl` is created in each kit build before the run): which skill or workflow, which part, and its estimated tokens;
  - which installed kit files were opened, from file access times (set to 1 January 2000 after the install).
  - A kit file opened directly is counted whole. A file the helper read from is counted at the helper's size, even if the agent also opened it directly, so direct reads can be undercounted. Neither trace shows how many turns a read stayed in context.

## Blinding
- `run-tools.cjs blind` copies each build under a random code.
- It removes only files identical to that build's fresh install, the read log, and folders the install created that are now empty.
- Kit words in `CLOSING.md` (UCA, kit file names, rule names) are replaced with "[redacted]".
- A file-list check before scoring confirms nothing else was removed. The code key's hash is recorded before unblinding.

## Decision rules (model A, fixed now)
1. **Same-day verdict, as in round 2:** "helps" if the kit median is higher on both tasks with no privacy point worse; "hurts" if lower on both; otherwise "no clear difference".
2. **Cost:** the kit's token difference against the same-day no-kit arm, per task, set next to round 2's +12% and +24%. "Cheaper than 0.3.5" means a smaller difference on both tasks.
3. **Rollback:** if the kit median on either task is lower than round 2's kit median (snake 30, bakery 26), or lower than the same-day no-kit median, 0.3.6 is not released as it stands. The scorer evidence and the read traces are used to find which change lost the points; that change is rolled back, or reworked and re-run, and the maintainer decides.

## Budget and order
- About 12 builds × 150,000 tokens plus 2 scorers × 200,000, or about 2.2 million tokens.
- Order: push this protocol; run batches 1 to 3; trace the kit reads; blind and check the file lists; score; unblind; write `RESULTS.md`.

## Deviations
None yet.
