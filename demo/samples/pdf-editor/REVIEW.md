# Sample 06 review: a private PDF editor

Every build was scored by the maintainer on the 20 points in [maintainer-check/REVIEW-POINTS.md](maintainer-check/REVIEW-POINTS.md), written before the first run. Runtime points were checked with the scripts in [maintainer-check/](maintainer-check/), the same scripts for every build. Every saved PDF was then checked with separate tools: `qpdf --check`, `pdftotext`, `pdffonts`, `pdfimages`, and `pdftoppm` renders looked at by eye.

"Code" in a row means the point was checked by reading the code, not by running it. One run per build: every number here is one data point, not a rate.

## Part 1: the build, without and with the kit

| # | Point | Without kit | With kit | Evidence |
|---|---|---|---|---|
| 1 | Open by file picker and by dropping a file | Right | Right | Picker run; drop: code |
| 2 | No network use; works offline | Right | Right | 0 outside requests in every run; both pages allow only their own files (`connect-src 'self'`); offline mode not run |
| 3 | Every page legible | Right | Right | Renders |
| 4 | Replace text; old text covered | Right | Right | Renders show only the new name |
| 5 | New text in the same place, same size | Right | Right | 200 dpi crops |
| 6 | Add text anywhere | Right | Right | Code |
| 7 | Fonts beyond a fixed set | Right | Right | Code: device fonts and .ttf/.otf/.woff files |
| 8 | Tamil and Hindi in the saved PDF | Right | Right | Rendered correctly shaped in both |
| 9 | No artificial limits | Right | Right | 300 pages replaced and saved; the only caps are on picture size |
| 10 | Undo and redo | Right | Right | Code |
| 11 | Valid new PDF; original unchanged; untouched pages keep their text | Right | Right | `qpdf` clean; original's sha256 unchanged; with only page 1 erased, pages 2 and 3 keep real text in both |
| 12 | Drawn text sharp | Right | Right | about 300 dpi without kit, 288 dpi with kit (code) |
| 13 | Says edited text becomes a picture | Right | Partly | Without kit: help and save dialog. With kit: README and erase dialog only, not in the normal view. The kit's build also adds an invisible searchable copy for Latin text (checked), not for Tamil or Hindi (checked; its README says so) |
| 14 | Privacy trap: covering is not removing | Right | Right | Normal saves: the old name can still be extracted, and both save dialogs warn. "Erase" saves: no old text left in either |
| 15 | Page tools (at least two) | Right | **Missing** | Without kit: reorder, rotate, duplicate, delete, blank page, merge. With kit: none |
| 16 | 300 pages without freezing | Right | Right | First page under 0.4 s; memory 8 to 10 MB; pages drawn as needed |
| 17 | Keyboard and phone | Right | Partly | No sideways scrolling in either at 390 px. Without kit: bottom toolbar, shortcuts listed. With kit: the toolbar takes about 40% of a phone screen. Keyboard: code only |
| 18 | Clear message for broken and password files | Right | Right | Both ask for the password and open the file with it; both say a broken file is damaged (the kit build's message is small, in the status bar) |
| 19 | At least three working extras beyond Sejda, stated truthfully | Partly | Partly | Only "no limits" is shown to be missing from Sejda: Sejda's pricing page lists page, hourly and upload limits on its free plan. The kit build's README says Sejda lacks find and replace and redaction; published guides show Sejda has both |
| 20 | Truthful closing message | not scored | not scored | The two build runs' closing messages were not saved |

**Tally, 19 scored points:** without kit 18 Right, 1 Partly. With kit 15 Right, 3 Partly, 1 Missing.

Also found: the kit's build lets you press Save while Replace all is still running, and the file then holds only the pages done so far (149 of 300 in one run). Its save dialog does show the number of changes. The build without the kit gave a complete file in the same test, but that does not show it blocks saving; it may have finished first.

Two mistakes in the maintainer's own test script were found and fixed while scoring. The build without the kit asks "Replace all?" in its own window, and the first script never pressed it, which made that build look broken. The first 300-page test also saved after 2 seconds, before the kit's build had finished replacing.

## Part 2: the blind audit of the kit's build

A fresh session ran `uca-audit` on a copy of the kit's build, with the original request but no scores. It changed no project files. Its report is [AUDIT-REPORT.md](AUDIT-REPORT.md).

| Already found by scoring | Caught by the audit? |
|---|---|
| No page tools | No. The report says a comparison with Sejda "was not part of this audit", although it was given the request |
| Save allowed during Replace all | No, but it found a related, worse find and replace bug (below) |
| README says Sejda lacks features Sejda has | No |
| "Edited text becomes a picture" said only in the README and erase dialog | No |
| Toolbar too big on a phone | No (it found keyboard and screen-reader problems instead) |

New findings, checked by the maintainer with [maintainer-check/audit-checks.mjs](maintainer-check/audit-checks.mjs):

| Audit finding | Maintainer's check |
|---|---|
| High: Find pressed twice, then Replace all, changes text twice | Confirmed: on the 300-page file, 97 pages got "Asha!!" instead of "Asha!" |
| A password-protected file is saved without its password, and the dialog does not say so | Confirmed: `qpdf` reports the saved copy "not encrypted"; the dialog only says it will be saved as pictures |
| A copy of every opened file stays in the browser, with no Forget button when nothing was edited | Confirmed after a reload |
| After one failed save, later files in the same tab are saved as pictures | Code (and fixed by both debug runs, below) |
| Text on the page cannot be reached with the keyboard | Confirmed: 0 of 4 text lines take focus |

So the audit found real bugs and privacy problems that the scoring missed, and none of the gaps between the build and the request.

## Part 3: debugging the kit's build, with and without the kit

Both sessions started from the same copy of the kit's build, with the same request and no list of issues. Each session's closing message is in its `CLOSING-ANSWER.md`. Each build's own test suite was run twice by the maintainer: 57 of 57 checks pass with the kit, 83 of 83 without (the original 36 plus 47 new).

Only points that changed from the kit's build are listed; every other point stayed Right in both.

| # | Point | Before | Debug with kit | Debug without kit |
|---|---|---|---|---|
| 13 | Says edited text becomes a picture | Partly | Partly | Partly |
| 15 | Page tools | **Missing** | Right: rotate, insert blank page, delete | Right: rotate both ways, move up and down, add, delete |
| 17 | Keyboard and phone | Partly | Partly: the toolbar fills more than half a phone screen; page text still not reachable by keyboard | Partly: good phone layout; page text still not reachable by keyboard |
| 19 | Extras beyond Sejda, stated truthfully | Partly | Partly: the README still says Sejda lacks find and replace and redaction | Partly: the same lines kept |
| 20 | Truthful closing message | not scored | Right: its test count confirmed | Right: its test count confirmed; its claim to have read Sejda's feature page could not be checked |

**Tally, 20 points:** with kit 17 Right, 3 Partly. Without kit 17 Right, 3 Partly.

Added by both: pictures, signatures, highlight, underline and strike-out, shapes, freehand drawing, links, form filling, page tools, and Latin text saved as real text (the saved invoice fell from about 19 KB to 2.7 KB). Added only without the kit: arrows, sticky notes, a see-through marker, attachments, new form fields, moving pages, "on every page", copy and paste.

| Audit finding | Debug with kit | Debug without kit |
|---|---|---|
| Find twice, then Replace all, changes text twice | Not fixed (88 pages) | Not fixed (49 pages) |
| Password removed on save without saying so | Not fixed | Not fixed |
| Opened file kept in the browser, no Forget | Not fixed | Not fixed |
| One failed save makes later files pictures | **Fixed**, with a test | **Fixed** |
| Page text not reachable by keyboard | Not fixed | Not fixed |
| Save allowed during Replace all | Not fixed | Not fixed |

The page counts depend on click timing and differ between runs; any count above zero means the bug is there.

## Later finding (24 November 2026)

A person using the editors found problems that none of the 20 points covered. Checked afterwards with a PDF made by LibreOffice and one printed by Chrome, driven by clicks and typing: in all four builds, changing one line of a justified paragraph to a longer one makes it run off the right edge of the page, because each line is edited on its own and nothing reflows; and no build can edit a paragraph as one block. Short single lines kept their spaces in all four builds with these two files. A report of spaces collapsing ("this is a text" saved as "thisisatext") was not reproduced with them. The scores above are kept as measured.

## What this changed in the kit

- **The build lost** because nothing made it list what "like Sejda" means, and nothing at the end checked the build against the request. In 0.3.1, a "like X" request lists X's core features in the plan, the README may say X lacks a feature only after checking, and the finishing scorecard checks each requested item.
- **The audit missed the gaps** because it never compared the project with the request. In 0.3.1, every audit lists each requested feature as present, partly there or missing, and checks the README and screens for false claims.
- **Debugging was a tie,** and neither session fixed the audit's bugs, because neither ran an audit. In 0.3.1, a request to find what is missing or broken, with no single symptom, starts with the audit.

Whether these changes help a model build or fix better is not measured yet.

## Running the builds on the kit's website
The four builds were each made to run alone. On the kit's website they share one browser storage area, and three of them use the same database name. Checked in Chrome, opening the builds one after another in one browser: once another build has created the database, the build without the kit cannot autosave (it logs "Autosave failed"), and the kit's build silently loses its autosave after a debugged build upgrades the database. Opening, editing and saving still work in all four. The builds were not changed to avoid this; run a build from its own folder to see it alone.

## Sources for the Sejda points
- Free plan with page, hourly and upload limits: [Sejda pricing](https://www.sejda.com/pricing)
- Find and replace in Sejda's editor: [EaseUS guide to replacing text in a PDF](https://pdf.easeus.com/pdf-editor-tips/replace-text-in-pdf.html)
- Redaction among Sejda's features: [Toolradar: Sejda](https://toolradar.com/tools/sejda)
