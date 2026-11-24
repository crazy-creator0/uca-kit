---
name: design-taste-discovery
description: Use when building or restyling a site, page, component, animation, canvas or 3D view where looks matter; learns the user's taste and commits to a specific brief first.
metadata:
  domain: ui-design
  triggers: look and feel, style choice, make it beautiful, new UI
  prerequisites: the user goal for the interface
  outputs: a confirmed visual direction and component choices
  priority: situational
---

# Design Taste Discovery — Ask Before Choosing

## Read first
Use when: a new site, page, redesign, styling, animation, canvas or 3D where looks matter.
Not when: backend or non-visual work; a small fix inside an existing design system.
Must do: learn the domain and real data; at most one taste question; a written brief with real fonts, hex colors and a signature; avoid Step 5 patterns.
Done when: the build follows the brief and was looked at and marked pass or fail with evidence.
Stop here if: the user only asked which direction to take.
Read on only for: Step 3 before building; `review.md` before finishing; `directions.md`, `techniques.md` or `motion.md` when a step points there.

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
Plain HTML/CSS first; climb to SVG, Canvas 2D, WebGL, 3D or WebGPU only as far as the brief needs, and name a simpler alternative. Install nothing without asking. The full ladder is in `.agents/skills/design-taste-discovery/techniques.md`.

## Step 5 — avoid generic AI-generated UI patterns
Give the product's main job and its main action visual priority, and test with realistic content. Before finishing, read `.agents/skills/design-taste-discovery/review.md`: it lists the warning signs (such as a row of three feature cards, or a purple gradient with no purpose) and the visual-system rules.

## Step 6 — design intentional, distinctive motion when requested
When the user asks for advanced animation, page transitions or a unique animated experience, treat motion as part of the brief and follow `.agents/skills/design-taste-discovery/motion.md`.

## Step 7 — review like a product designer
Check each item in `.agents/skills/design-taste-discovery/review.md`, and mark it pass or fail with the evidence. Then judge what the user produces, not only the screen: do the main task with "Check it like the user" in `testing-and-code-review` and compare the result with what they expect. Do not claim visual inspection when only source code was checked. Fix every failed item with a targeted change.

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
