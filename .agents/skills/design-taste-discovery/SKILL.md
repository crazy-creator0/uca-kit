---
name: design-taste-discovery
description: Discover the user's visual preferences before planning UI work and selecting components, animation, canvas, 3D, or WebGPU tools.
metadata:
  domain: ui-design
  triggers: look and feel, style choice, make it beautiful, new UI
  prerequisites: the user goal for the interface
  outputs: a confirmed visual direction and component choices
  priority: situational
---

# Design Taste Discovery — Ask Before Choosing

## When to use this skill
Use for new websites, landing pages, UI redesigns, component styling, interactive visuals, animation, canvas effects, or 3D scenes, where visual taste materially affects the result. Not for backend-only or non-visual tasks.

## Principle
The user's taste comes before the tool list. Do not pick a design library because the kit lists it. Understand the look the user wants, commit to a specific design, then suggest only tools that fit.

## Step 1 — learn the domain, and what the user already told us
A short request such as "create a cafe management file" is a domain brief: the design must come from the real work. Before any visual choice, write:
- **Who and where:** the people using it, on which device, in which moment (a cashier at the rush hour, an owner closing the day).
- **Real objects and states:** for a cafe, menu items, orders, tables, shifts, stock levels; an order goes open, served, paid.
- **Daily jobs in order, and the words people use for them.** Use those words on screen, not generic ones.
- **Believable sample data** (names, prices, quantities, times). Never "Item 1" or lorem ipsum. If the user named a file or format, deliver that.
Then read any images, screenshots, URLs or existing UI they shared (describe only the cues you can see) and inspect the project's framework, design system and dependencies. Do not ask for what they already said.

## Step 2 — ask one concise taste question when needed
If the direction is still unclear, ask one conversational question before designing. Invite a reference and offer a few examples, not a questionnaire:
> What visual feel do you like: clean and minimal, editorial and type-led, dark and dense like a tool, playful, or immersive 3D? A site you like is enough.


## Step 3 — commit to a design brief
Before any code, write these down in a few lines. Every line must be a concrete choice, not an adjective ("modern" and "clean" are not choices):
- **Job:** what the user does here, and the one main action.
- **Direction:** read `.agents/skills/design-taste-discovery/directions.md`, shortlist two that fit the domain from Step 1, pick one and say why (or follow the user's reference). Then make it yours: change at least two of its attributes using real objects or words from the domain, add one **signature** element taken from the domain, and one deliberate **departure** from the direction. Never use a direction unchanged.
- **Type:** the actual typefaces (not the framework default), a size scale, and the weights used.
- **Color:** hex values for background, text, one accent, and status colors. One accent only unless the brief needs more.
- **Space and shape:** a spacing step, one corner radius, border or shadow rule.
- **Layout:** what leads the screen, what sits beside it, and why that order suits the job.
- **Stack:** the existing one first; for a new project, the `frontend-engineering` "Stack decision". A new dependency needs its trade-off stated.

For a substantial new UI or a new dependency, show the brief and ask for approval; for a small change in an established design system, confirm the inferred direction. If the user says to decide, state your assumptions and proceed.

## Step 4 — pick the cheapest technique that fits the taste, not a trend
Read `UI-EFFECTS-GUIDE.md` only when an effect beyond plain HTML/CSS is relevant.
- Minimal, editorial or content-led: semantic HTML/CSS and design tokens; no library may be needed.
- Polished motion on components: CSS transitions, or the motion library the project already has.
- Liquid, particle, shader or procedural canvas effects: CSS/SVG first, then Canvas 2D, then WebGL.
- A real authored 3D scene that serves the product: needs a real asset and a size budget; use the 3D approach already in the project.
- A real custom GPU/WebGPU/WGSL or compute need: WebGPU. Never use it for a fashionable glow.

Suggest only techniques with clear value, and name a simpler alternative. Install nothing without asking.

## Step 5 — avoid generic AI-generated UI patterns
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

## Step 6 — design intentional, distinctive motion when requested
When the user asks for advanced animation, page transitions or a unique animated experience, treat motion as part of the brief and follow `.agents/skills/design-taste-discovery/motion.md`.

## Step 7 — review like a product designer
Check each item, and mark it pass or fail with the evidence:
1. **Brief followed:** the type, colors, spacing and layout in the code match the Step 3 brief.
2. **Not a template:** run `node scripts/uca-design-check.cjs <ui folder>` when it exists. Each finding needs a product reason or a change; a clean result is not proof, so also check the Step 5 patterns by eye.
3. **Three specific choices:** name three decisions that suit this product, not "looks modern".
4. **Hierarchy:** the main action and main content are the most prominent things on screen.
5. **Quality:** alignment, density, responsive behavior, keyboard use, contrast, reduced motion, and empty/error states.
6. **Evidence:** if screenshots or a browser are available, look at the result. Do not claim visual inspection when only source code was checked.

Fix every failed item with a targeted change. Do not replace one generic template with another, and do not equate “less AI-looking” with “unstyled.”

## Step 8 — approval and implementation
- Ask before adding dependencies, external services, plugins or third-party code. Do not install reference tools as a preset.
- Save the accepted brief as `DESIGN.md` (fields: Job, Direction, Type, Color, Space, Layout, Stack, Signature, Departure) and run `node scripts/uca-design-check.cjs --brief DESIGN.md`.
- Build one vertical slice first and check it against the accepted brief.
- Keep accessibility, responsiveness, loading states and the project's design system.
- If the result drifts from the agreed taste, revise it rather than defending the tool choice.

## Non-negotiable rules
- Never code a substantial new visual direction before asking about taste when the user gave no clear preference or reference.
- Never recommend a tool before understanding the design goal and the stack.
- Never mistake your aesthetic assumptions for user-approved decisions.
- Never claim a reference was inspected if it was not accessible.
- Do not treat any style checklist as a substitute for product-specific judgment.
- Keep discovery light; it is not an interview.
