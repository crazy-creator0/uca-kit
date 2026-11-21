# Design brief: Python Basics, Visualised

## Job
An adult who has never programmed reads one topic at a time: a short explanation, a picture, a small code example, then what Python prints. The main action is reading code next to its real output (and predicting it first).

## Direction
Shortlist: Field notebook (study, personal tools) and Clinic calm (accessibility first). Picked Field notebook, because this is a study page you read like notes. Changed: the body font is a plain system sans for legibility on phones (not a serif), and the yellow highlight marks "what just changed" in diagrams instead of decoration. Borrowed from Clinic calm: 44px minimum targets and visible focus rings.

## Type
Offline, so no web fonts. Headings: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif, weight 700. Body: system-ui, "Segoe UI", Roboto, sans-serif, 400 and 600, 17px, line height 1.6. Code: ui-monospace, "Cascadia Mono", "SF Mono", Menlo, Consolas, "DejaVu Sans Mono", monospace, 15px. Scale: 14 / 17 / 22 / 30 / 40px.

## Color
Page #FBF7EE, ink #26241F, muted text #5E584C, rule #D9CFBA, margin red #B83A33 (warnings, the left margin line), highlight #F6E27F (what changed), one accent #1F4E79 (links, buttons, focus), code panel #F3EDE0, output strip #26241F with text #F3EEDC, correct #2E6B3A, wrong #B42318.

## Space
8px step (8, 16, 24, 32, 48). One corner radius: 4px. 1px rules, no shadows.

## Layout
One reading column, at most about 72 characters wide. On wide screens (1100px and up) the contents list sits beside it and stays visible. On phones the contents list is at the top. Each topic runs: sentence, picture, code, output.

## Stack
Plain HTML, one CSS file, two small JavaScript files, no libraries, no build step: it must open from a double-click and work offline.

## Signature
Python names are drawn as luggage tags tied by a string to their value, in every diagram, so "a name points to a value" looks the same everywhere.

## Departure
The output is a dark console strip (ink background, cream text) with an "Output" label. This deliberately breaks the paper look so "what Python prints" can never be confused with the code.
