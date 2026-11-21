# Design brief: UCA Kit home page

- **Job:** A developer who already uses an AI coding assistant understands what UCA Kit is within seconds and copies the install command. Main action: copy the install command.
- **Direction:** Shortlisted Control room (developer tools) and Ledger (records). Picked Ledger, because the kit is about keeping an honest record: what was planned, what was checked, what was not. Changes from the stock direction: the stamp color marks the honest limits ("NOT A GUARANTEE", "NOT BENCHMARKED", "NOT TESTED ON EVERY TOOL") instead of PAID/LATE, and the wide ruled table carries the kit's numbers (11 / 3 / 16 / 5 / 0) instead of invoices.
- **Type:** Serif for headings and body, using a local-only stack: "Iowan Old Style", Charter, "Bitstream Charter", "Sitka Text", Cambria, Georgia. Monospace for figures and commands: "IBM Plex Mono", "JetBrains Mono", "SF Mono", "Cascadia Mono", Menlo, Consolas, "DejaVu Sans Mono". No web fonts, so the page makes zero outside requests. Scale: 14 / 16 / 18 / 22 / 30 / clamp(36px, 7vw, 68px). Weights: 400 and 600.
- **Color:** paper #F4EFE6, ink #1D1B16, muted text #5A5346, rule #C9BFA9, stamp #B3261E (the only accent), success text #2F6B3A for "Copied".
- **Space:** 8px step (8, 16, 24, 40, 64, 96). Corner radius 2px. 1px rules instead of cards. No shadows, no gradients.
- **Layout:** The headline (the three behaviours: plan first, check the work, say what was not checked) leads, with the install command right under it so both fit on the first phone screen. Below that: a three-line "how it works" list, the ruled numbers table, the honest limits with stamps, then the license and author footer. One column on phones; on laptops the section labels sit in a narrow left margin column.
- **Stack:** Plain HTML, CSS and a few lines of JavaScript in one index.html. No dependencies, no build, opens from disk.
- **Signature:** Rubber-stamp marks on the honest limits. The page states what the kit does not promise as loudly as what it does.
- **Departure:** The install command sits on a solid ink block, the only dark surface on the paper page, because it is the one action that matters.
