# Design scoring rubric

Used to decide whether the kit's design output reaches 9 out of 10. It is scored by a person, blind: the scorer does not know which variant (kit version or model) made an output. The automatic checks are supporting evidence and never replace this score.

## What the scorer sees
Open each blind output (made with `node benchmarks/design/design-eval.cjs blind <outputs-folder>`) in a browser at a desktop width and a phone width. Do not read the code before scoring.

## Scores (1 to 10 each; 5 = acceptable generic work, 9 = a designer would sign it)
| # | Criterion | Ask |
|---|---|---|
| 1 | Domain fit | Does it use the real objects, words and sample data of this domain, or generic placeholders? |
| 2 | Distinctiveness | Could this screen belong to any product? Is there one memorable, purposeful element? |
| 3 | Hierarchy | Is the main job and main action the most prominent thing? |
| 4 | Type and color | Chosen typefaces, a restrained palette, readable contrast? |
| 5 | Layout and density | Does the arrangement suit how the work is done (rush hour, scanning, writing)? |
| 6 | States and realism | Empty, populated, long text and error states handled with believable data? |
| 7 | Responsive and access | Phone width, keyboard use, visible focus, touch targets? |
| 8 | Polish | Alignment, spacing, consistency, no broken details? |
| **O** | **Overall** | **Your honest 1 to 10 for the whole thing. This is the number the target uses.** |

## Yes or no (filled from the run, not from taste)
- **Plan:** a plan block with a stack decision (choice, reason, cost) was shown before building.
- **Brief:** a `DESIGN.md` exists and passes `node scripts/uca-design-check.cjs --brief DESIGN.md`.
- **Checker:** `node scripts/uca-design-check.cjs <ui folder>` reports no tells, or each one has a stated product reason.

## The target
For each model: the median Overall is 9 or higher on at least 6 of the 8 prompts. Two different models must both reach it. Until scored runs exist, the status is "not run", never "9 out of 10".
