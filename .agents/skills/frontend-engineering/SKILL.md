---
name: frontend-engineering
description: Use for screens, components, forms, client state, browser API calls, accessibility or front-end speed.
metadata:
  domain: frontend
  triggers: screen, component, accessibility, state, front-end speed
  prerequisites: a UI layer in the project
  outputs: a working UI with states and accessibility checks
  priority: task
---

# Frontend Engineering

## Read first
Use when: screens, components, forms, state, accessibility, browser API calls, front-end speed.
Not when: choosing the look (design-taste-discovery); 3D or shaders (frontend-visuals-and-3d).
Must do: keep the stack; one slice with loading, empty, error and success states; keyboard, labels, contrast; no secrets in the browser.
Done when: key behavior is tested and checked at phone and desktop widths.
Stop here if: a text or style tweak in one component.
Read on only for: "Stack decision" for a new project; "API integration" for backend calls.

## Parts
- Stack decision (new project or no existing stack): `.agents/skills/frontend-engineering/parts/stack.md`
- Implementation; API integration: `.agents/skills/frontend-engineering/parts/build.md`
- Performance and design quality; Review checklist: `.agents/skills/frontend-engineering/parts/quality.md`

## Inspect first
Identify the actual framework, routing, component and styling conventions, design system, package scripts, test setup, and API contracts. Keep the current stack unless a change is justified.
