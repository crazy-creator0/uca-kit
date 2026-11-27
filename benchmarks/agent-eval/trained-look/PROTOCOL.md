# Trained look: protocol, fixed before any run

Pushed with release 0.3.7, before the runs. Results go in `RESULTS.md` next to this file; changes go under Deviations.

On 27 Nov one prompt (`prompt-company-site.txt`) gave nearly the same page with and without the kit on OpenCode with Big Pickle: numbered section labels, a status card beside the hero, a faint grid background, three equal cards and the same stock lines. Both builds are kept as test fixtures (`tests/fixtures/design/trained-look/`). 0.3.7 adds a default-look step to R-NEW and the design brief, and teaches the design check this look. This run asks whether the kit's page now differs from the no-kit page, and whether a person prefers it.

## Arms and prompts
- **Prompts:** `prompt-company-site.txt` and `../round-2/prompts/task-3-snake.txt`, each byte for byte as the whole first message.
- **Host and model:** OpenCode with Big Pickle; the OpenCode version and operating system are recorded.
- **Kit arm:** an empty folder, `init . --platform opencode --tier standard` from the release branch or tag; the commit is recorded.
- **No-kit arm:** an empty folder holding only `.opencode/plugins/uca-usage.js`.
- **Step log:** `UCA_USAGE_STEPS` set in each window to its own file before OpenCode starts; after the first reply the log's first line must be a start line.
- **Operator:** answers questions with "Go ahead, use your judgment" and types nothing else until the agent says it is done.
- **Runs:** one per arm per prompt. One run is thin evidence.

## Measures
1. **Design check:** `node scripts/uca-design-check.cjs <build folder>` on both builds; the count of trained-look findings (numbered-section-labels, grid-paper-background, status-panel, stock-lines) per build.
2. **The kit's plan block:** whether it holds a default line and three named changes, quoted as written.
3. **Blind preference:** before looking, a helper copies each build of one prompt to folders `A` and `B` by a coin flip and writes which is which in a file the scorer does not open until scoring is done. The scorer opens A and B at desktop and phone width and writes, for each: does it look like a page any company could have (yes or no), the one thing that makes it specific to the subject, and which of the two they would ship.
4. **Cost:** requests and summed input from the step logs (`uca-usage steps`).

## What counts
- The kit helps on looks if its build has fewer trained-look findings than the no-kit build and the scorer would ship it, on both prompts.
- If the kit's build still shows the trained look, the default-look step is not enough on its own; the next change aims at what the plan block shows the model skipped.

## Deviations
None yet.
