# Design review

Read from Steps 5 and 7 of `.agents/skills/design-taste-discovery/SKILL.md`, before calling a design done.

## Warning signs and visual system (Step 5)
Treat these as warning signs to evaluate, not a rigid ban. Keep one only when it serves the product and the user's references:
- A hero with a large headline, subhead and two buttons on a page whose job is not marketing.
- A row of three feature cards with an icon, a heading and two lines of text.
- Purple-to-blue gradients, glows, blobs, sparkles or floating shapes with no product purpose.
- Rounded cards inside rounded cards, pill buttons everywhere, a shadow on every surface.
- The framework's default font and one pastel palette regardless of the app.
- Slogans, testimonials, stats and "trusted by" strips that could belong to any product.

Before styling, identify the product's primary job and the information users need most. Give that content and its main action visual priority. For a task manager, the task input and task list should lead; a brand statement and decorative side panel should not.

Prefer a specific visual system over a fashionable template:
- Choose type scale, density, spacing, contrast, borders, and corner radius intentionally for the content and audience.
- Use flat surfaces, restrained color and compact controls when they help scanning; do not flatten everything by default.
- Empty states should explain the next useful action in the app's own terms, not add generic encouragement.
- Do not add a date, score, stats panel, quote, icon, or other decoration unless it helps the user decide or finish a task.
- Test with realistic content: empty, populated, completed, long-text, and error states, plus narrow mobile widths.

## Review checklist (Step 7)
Check each item, and mark it pass or fail with the evidence:
1. **Brief followed:** the type, colors, spacing and layout in the code match the Step 3 brief.
2. **Not a template:** run `node scripts/uca-design-check.cjs <ui folder>` when it exists. Each finding needs a product reason or a change; a clean result is not proof, so also check the Step 5 patterns by eye.
3. **Three specific choices:** name three decisions that suit this product, not "looks modern".
4. **Hierarchy:** the main action and main content are the most prominent things on screen.
5. **Quality:** alignment, density, responsive behavior, keyboard use, contrast, reduced motion, and empty/error states.
6. **Evidence:** if screenshots or a browser are available, look at the result. Do not claim visual inspection when only source code was checked.

Fix every failed item with a targeted change. Do not replace one generic template with another, and do not equate “less AI-looking” with “unstyled.”
