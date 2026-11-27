---
name: design-taste-discovery
description: Use when building or restyling a site, page, component, animation, canvas or 3D view where looks matter.
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
Read on only for: "Small build" for a small build; else Steps 1 and 3 before building, Step 7 and `review.md` before finishing, other files when a step points there.
Next: `frontend-engineering` to build.

## Parts
- Small build: `.agents/skills/design-taste-discovery/parts/small.md`
- Step 1 — learn the domain, and what the user already told us; Step 2 — ask one concise taste question when needed: `.agents/skills/design-taste-discovery/parts/domain.md`
- Step 3 — commit to a design brief: `.agents/skills/design-taste-discovery/parts/brief.md`
- Step 4 — pick the cheapest technique that fits the taste, not a trend; Step 5 — avoid generic AI-generated UI patterns; Step 6 — design intentional, distinctive motion when requested: `.agents/skills/design-taste-discovery/parts/build.md`
- Step 7 — review like a product designer; Step 8 — approval and implementation: `.agents/skills/design-taste-discovery/parts/approve.md`

## Principle
The user's taste comes before the tool list. Understand the look the user wants, commit to a specific design, then suggest only tools that fit.

## Non-negotiable rules
- Never code a substantial new visual direction before asking about taste when the user gave no clear preference or reference.
- Never present your own taste as the user's choice.
- Never claim a reference was inspected if it was not accessible.
- Do not treat any style checklist as a substitute for product-specific judgment.
