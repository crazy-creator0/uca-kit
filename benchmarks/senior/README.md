# Senior benchmark (baseline kit)

Status: designed, not run. No model has been scored.

Purpose: measure whether a project built with the kit looks more carefully built than one built without it.

## Steps

1. Pick a model. Use the same model for both arms.
2. Create two empty folders. Leave one bare (arm A, without the kit) and install the kit in the other (arm B, with the kit).
3. Give each the same prompt from prompts.md, one prompt per fresh session, without extra hints.
4. Let it finish. Do not fix anything by hand.
5. Run `node scripts/uca-senior-check.cjs <folder> --json` on each result and record the percent.
6. Score the human rubric in rubric.md for each result (a person, not the model that built it).
7. Record both in `benchmarks/results-template.csv` format, one row per prompt and arm.

## First trial

A ready-to-run pair of arms with scripted follow-up turns is in trial-tuition-tracker.md.

## Reading the result

The static check is only a floor. Compare arms on the same prompt. Report the model, date and number of prompts. Do not report a win from fewer than 10 prompts, and say plainly when arms are close.
