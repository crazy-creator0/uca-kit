# Agent evaluation 0.3: results

The protocol in `../PROTOCOL.md` was fixed before any run. This file was added after unblinding on 24 November 2026. One model only (the maintainer's frontier model), three runs per arm per task. Kit arm: UCA Kit v0.3.2, standard tier.

## Scores (out of 30, blind scorers)

| Task | Kit runs | No-kit runs | Kit median | No-kit median |
|---|---|---|---|---|
| 1. Spending tool | 30 (T1-943), 29 (T1-277), 29 → 30* (T1-791) | 30 (T1-103), 30 (T1-145), 29 (T1-788) | 29 → 30* | 30 |
| 2. Trip splitter | 30 (T2-915), 30 (T2-808), 30 (T2-241) | 30 (T2-998), 29 (T2-720), 30 (T2-576) | 30 | 30 |

\* **T1-791 was 29 as scored.** It lost point 14 because a test command needs a `.uca-workspace` folder (blinded name `.work`). The kit's installer creates that folder empty, and the second blinding step removed empty folders. So the point was lost to the maintainer's blinding, not to the build. Corrected, it is 30, and the kit median for task 1 is 30.

**Privacy points** (task 1 point 11, task 2 point 13): 2 of 2 in all 12 builds. No build made a request off the computer.

**Where points were lost:**
- **Phone layout (category control off-screen at 390 px):** T1-277 (kit) and T1-788 (no kit).
- **Phone layout (a message covers "+ Add expense" for 4 to 7 seconds after each save):** T2-720 (no kit).
- **Run instructions:** T1-791 (kit), the blinding artefact above.

## Decision (rule fixed in the protocol)

**No clear difference.** "Helps" needed the kit median to be higher on both tasks. "Hurts" needed it lower on both. As scored, task 1 is 29 against 30 and task 2 is 30 against 30. After the correction, both are 30 against 30. Either way the rule gives "no clear difference".

## What this round can and cannot say

- **The tasks were too easy for this model.** 11 of 12 builds scored 29 or 30 (12 of 12 after the correction). With every build at the ceiling, the round cannot separate the arms either way. It does not show the kit is useless, and it does not show the kit helps.
- **Both arms checked their own work well.** Every closing message's "checked" claims held up against the scorers' own runs. Every build got the hidden bank statement exactly right, although no builder saw that file.
- **One model, three runs per arm.** This is one data point per arm per task, not a rate.

## Cost (partial)

Tokens reported by each build session for its final stretch, after the shared pause (see Deviations). These are incomplete, so they show a direction, not a measurement.

| Task | Kit (3 runs) | No kit (3 runs) | Difference |
|---|---|---|---|
| 1. Spending tool | 476,419 | 436,551 | kit +9% |
| 2. Trip splitter | 407,186 | 348,127 | kit +17% |

The kit arm also wrote extra files (PROJECT.md, DESIGN.md) and ran its own readiness checks. Full per-session token counts were not recorded. The next round must record them.

## Maintainer errors in this round

All are listed under Deviations in the protocol:
- **The first blinding broke code.** It redacted words inside code files, which broke four task-1 builds and removed builders' test files. Those scores were discarded.
- **The second blinding removed an empty kit folder.** That cost T1-791 one point, corrected above.
- **The two scorers used different judgment on phone layout.** The task-1 scorer counted a category control off-screen as "Partly". The task-2 scorer found no such case. This affected one build in each arm.

## Next round

1. **Harder and more open tasks,** where completeness and delight matter. One will be a user's own prompt word for word: a snake game that a separate Windows test, run outside this protocol, built with and without the kit. Without the kit it showed more extras: best score, speed meter, sound switch, WASD keys.
2. **Scoring points for completeness and delight,** not only correctness.
3. **A second model and host.** OpenCode with a different model, on Windows.
4. **Tokens recorded per session, input and output separately,** with a cost rule fixed in advance.
5. **Blinding that never touches code or folders.** Only the closing messages are redacted, and build folders are renamed. A check confirms every build's file list is unchanged apart from the kit's own installed files.

## Files

- `code-key.json`: code to run. Its SHA-256 begins `d101fb28eb49bd9a`, recorded before unblinding.
- `scorer-evidence/`: both scorers' full tables and the evidence for every score.
- `closing-messages/`: each build session's final message, unredacted. Local paths are shortened.
- `../inputs/hidden-bank-b.csv` and `.totals.txt`: their SHA-256 values match the commitment in the protocol.
