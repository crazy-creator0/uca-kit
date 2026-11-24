# Design brief — Private PDF Editor

**Job:** open a PDF, click words to change them or click empty space to add words, then save a new copy. The one main action is **Save a copy**.

**Direction:** shortlisted *Clinic calm* (accessibility first, large targets) and *Ledger* (office paperwork). Picked Clinic calm because the user is not technical and also works on a phone. Changed: the background is a grey "desk" (#E4E7E5) so the pages read as paper on a table; the accent is used only for "your changes" (change marks, selection, Save), never for decoration.

**Type:** the device's own interface font (`"Atkinson Hyperlegible", "Segoe UI", system-ui, sans-serif`). Product reason: the editor must work offline and ships no font files, and the fonts *inside the document* belong to the user's choice, not ours. Sizes 13 / 15 / 18 px; weights 400 and 600.

**Color:** desk #E4E7E5, bars #F7F9F8, text #14211C, muted #4D5B55, accent #0F6E5C, soft accent #DCEBE6, alert #B42318, warning #8A5A00, borders #C5CFCB.

**Space:** 8 px spacing step; 40 px minimum touch targets.

**Shape:** 8 px radius on controls, 1 px borders, no shadows except one soft paper shadow under each page.

**Layout:** a top bar (Open · Undo/Redo · Find · Show original · Attachments · zoom · page, Save on the far right) and a tool rail on the left grouped as Text / Insert / Mark up / Shapes / Links & forms (a scrolling row on phones). Each page has a small row of page buttons above it (turn, move, add blank page, delete). A style bar appears under it only while a text is selected. The pages fill the rest, centred. A thin status strip sits at the bottom.

**Stack:** plain HTML, CSS and JavaScript modules; pdf.js to show pages, pdf-lib to write the new file (both already in `vendor/`). No build step, no new dependencies.

**Signature:** the bottom "safety strip": *Stays on this device · Original never changed · 7 changes · Saved in this browser 10:42*. It is the trust indicator the user asked for.

**Departure:** change marks — every edit puts a small accent tick in the page's left margin, so on a 300-page file you can see at a glance where you changed something.
