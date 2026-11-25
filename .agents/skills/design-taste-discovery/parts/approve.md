## Step 7 — review like a product designer
Check each item in `.agents/skills/design-taste-discovery/review.md`, and mark it pass or fail with the evidence. Then judge what the user produces, not only the screen: do the main task with "Check it like the user" in `testing-and-code-review` and compare the result with what they expect. Do not claim visual inspection when only source code was checked. Fix every failed item with a targeted change.

## Step 8 — approval and implementation
- Ask before adding dependencies, external services, plugins or third-party code. Do not install reference tools as a preset.
- Save the accepted brief as `DESIGN.md` (fields: Job, Direction, Type, Color, Space, Layout, Stack, Signature, Departure) and run `node scripts/uca-design-check.cjs --brief DESIGN.md`.
- Build one vertical slice first and check it against the accepted brief.
- Keep accessibility, responsiveness, loading states and the project's design system.
- If the result drifts from the agreed taste, revise it rather than defending the tool choice.
