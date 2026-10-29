# Spatial Shift Todo — tokenization experiment

This is a self-contained, dependency-free HTML prototype. Open `index.html` in a modern browser.

## Fixed brief used in both prompt conditions

> Create a genuinely original Todo app concept, not a standard template. Choose this creative direction: Spatial Shift — tasks use depth, rotation, morphing, and spatial reorganization. Design a unique task-completion animation and implement the app.

The app should support adding, completing, deleting, and resetting tasks; adapt to mobile; and respect reduced-motion preferences.

## Condition A — non-tokenized prompt

Use the fixed brief above as one natural-language prompt. Do not pre-extract design requirements or rewrite it as structured fields.

## Condition B — tokenized prompt

Use the exact same brief, but represent its requirements as explicit tokens/fields before implementation:

- `PRODUCT`: Todo app
- `NOVELTY_CONSTRAINT`: original concept; avoid standard templates
- `MOTION_DIRECTION`: Spatial Shift
- `MOTION_PRIMITIVES`: depth, rotation, morphing, spatial reorganization
- `SIGNATURE_EVENT`: completion of a task
- `CORE_ACTIONS`: add, complete, delete, reset
- `ACCESSIBILITY`: reduced-motion support, keyboard-visible focus, readable controls
- `RESPONSIVE`: desktop and mobile
- `IMPLEMENTATION_CONSTRAINT`: working implementation, not a concept-only description

These tokens unpack the same requirements; they must not add features or change the creative brief.

## What is actually implemented

The current prototype uses a dark, field-like layout with an orbit motif. Completing a task triggers a lift/tilt/depth-recede animation, emits small particles, removes the completed item, and lets the remaining task list settle. It includes task entry, delete and reset actions, responsive styling, and a `prefers-reduced-motion` fallback.

## Fair comparison protocol

Run Condition A and Condition B in the same agent, model/version, repository state, and tool permissions. Start from identical clean copies and do not let either run inspect the other's output. Use the same browser/test steps. Record the actual results for each run:

1. Required actions work (add, complete, delete, reset).
2. Completion animation includes depth/rotation and meaningful reflow.
3. Design avoids a generic Todo template.
4. Mobile layout and keyboard focus work.
5. Reduced-motion preference keeps completion functional.
6. Runtime errors and broken interactions.
7. Implementation time and number of corrective iterations.

Score each criterion 0 (missing/broken), 1 (partial), or 2 (works well), and attach evidence such as test output or screenshots. Do not infer that tokenization is better merely because its prompt looks more structured. This repository contains the prototype and paired prompt conditions; it does **not** contain results from two independent agent runs, so no measured winner is claimed yet.
