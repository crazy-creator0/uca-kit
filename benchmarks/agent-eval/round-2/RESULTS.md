# Agent evaluation round 2: results

Protocol: `PROTOCOL.md` in this folder, pushed before any run (commit `029dee9`, 25 November 2026, 11:37). Unblinded the same day. Model A only (the maintainer's frontier model, three runs per arm per task). Kit arm: UCA Kit v0.3.4, standard tier. Model B (OpenCode with Big Pickle on Windows) is a separate cross-check, still to be run by the maintainer.

## Scores (out of 30, blind scorers)

| Task | Kit runs | No-kit runs | Kit median | No-kit median |
|---|---|---|---|---|
| 3. Snake game (detailed spec) | 30, 30, 30 | 28, 30, 29 | **30** | 29 |
| 4. Bakery orders (one-line request) | 28, 25, 26 | 26, 24, 25 | **26** | 25 |

**Privacy points** (task 3 point 12, task 4 point 12): 2 of 2 in all 12 builds.

## Decision (rule fixed in the protocol)

**Helps.** The kit median is higher on both tasks, and no privacy point is worse.

**How much:** one point of 30 on each task, from three runs per arm on one model. That is the smallest margin the rule can count. It is a result, not a rate. Another round could reverse it.

## Cost (complete counts; no session was paused)

| Task | Kit, average tokens per build | No kit | Difference |
|---|---|---|---|
| 3. Snake game | 73,214 | 65,123 | +12% |
| 4. Bakery orders | 80,355 | 64,988 | +24% |

Time per build: kit 75 to 133 s, no kit 62 to 111 s.

Cost rule: because the kit side scored higher, the cost increase is reported next to the gain rather than counted against it. The gain was one point per task; the cost was 12 to 24% more tokens.

## Where the points came from

**Task 3, snake.**
- **Extras beyond the spec (point 13), where the arms differ most:**
  - Kit builds scored 2, 2 and 2. Each had 4 or 5 working extras, and all three had a sound on/off switch.
  - No-kit builds scored 1, 2 and 1. They had 2 or 3 extras, and none had a sound switch.
  - This is the behaviour 0.3.4 changed ("extras users expect are requirements"). Round 1 had no extras point, so this is the first measurement of it.
- **Bugs (point 14):** one no-kit build ends the game when the head enters the square the tail is just leaving.
- **Scorer's judgement call on point 13:** the scorer counted "Space starts the game" as a separate extra from the pause key. Counted the other way, one no-kit build drops from 30 to 29, and the no-kit median stays 29.

**Task 4, bakery.**
- **The best build was a kit build:** 28 of 30, the only one with working edit, search and large tap targets together.
- **Edit bug** (the cake field comes back empty when editing): two kit builds, two no-kit builds.
- **No customer search:** one kit build, two no-kit builds.
- **No build works offline after loading.** None has a service worker, so every build scored 1 on point 6. This is a shared gap. The kit's "check it like the user" ladder did not catch it, although the request said the baker uses a phone.

## What this round can and cannot say

- **The tasks separated the builds better than round 1.** Bakery scores ranged from 24 to 28; round 1's ranged from 29 to 30.
- **The extras finding matches its cause.** The snake gap is in exactly the place 0.3.4 targeted, and it agrees with the user's own Windows snake test, run before that change. Three runs per arm still cannot rule out chance.
- **The bakery gap is small and mixed.** Both arms share the edit bug and the offline gap.
- **One model.** Model B's cross-check is still to come.

## Maintainer notes

- **No deviations from the protocol.** Every build finished without a pause.
- **Blinding:** build folders were copied under random codes, and only files identical to a fresh kit install were removed. A file-list check found no missing builder file, and a code check found no changed code file apart from the scratch-folder name and the folder path. All 12 pages loaded without errors before scoring.
- **Code key:** SHA-256 begins `c03d54f06885bd17`, recorded before unblinding.

## Files

- `code-key.json`: code to run.
- `scorer-evidence/`: both scorers' tables and the evidence for every score.
- `closing-messages/`: each build's `CLOSING.md`, with local paths shortened.
- `tokens.log`: tokens, tool calls and time per build session.
