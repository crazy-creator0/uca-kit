# Closing answer: debug run WITHOUT kit (verbatim)

I've added most of the Sejda features that were missing and fixed the problems I found. Nothing is sent anywhere, and everything that worked before still works. Both automated test suites pass: the original 36 checks and 47 new ones.

## What was missing compared with Sejda (now added)
I compared against Sejda's own feature list ([Sejda online PDF editor](https://www.sejda.com/pdf-editor)).
- **Pictures:** insert a picture, drag it, and resize it from the corner. You can also drop a picture onto the window. Phone photos come out the right way up.
- **Signature:** draw it, type it, or upload a photo of it. The white paper in an uploaded photo becomes see-through.
- **Mark up:** highlight, strike out and underline. They snap to the lines of text you drag over. There is also freehand drawing, a see-through marker, and sticky notes, which are saved as real PDF notes.
- **Shapes:** rectangle, ellipse, line and arrow. You can set the colour, fill, line width and how see-through they are.
- **Links:** to a web address, an email address, a phone number, or a page number. They are saved as real links.
- **Forms:** you can fill in a PDF's existing form boxes (text, tick boxes, choices, lists), and add new text fields and tick boxes.
- **Pages:** each page has buttons to turn it, move it up or down, add a blank page after it, or delete it. All of these can be undone.
- **Attachments:** you can see and download files attached inside a PDF, and attach new ones.
- **Smaller extras:** "On every page" copies a change to all pages. Ctrl+C / Ctrl+V copy and paste a change, arrow keys move it, and Ctrl + mouse wheel zooms.
- The tools now sit in a rail on the left; on phones it becomes a scrolling row.

## What was broken (fixed)
- **Changed text was saved as a picture**, even in Arial, Times or Courier-style fonts. That made it blurry and the files bigger. Those fonts are now saved as sharp, real text. I checked in the saved file that "Priya Sharma" now uses the PDF's own Times-Bold font.
- **Changed text was covered too widely:** spaces at the end of a line made the cover box wider than the words.
- **Dragging could break** if the page finished redrawing in the middle of the drag.
- **The tests were unreliable:** they sometimes started before the local test server was ready. This caused a failure in my first run of your existing tests.

## How I tested it
I drove the real editor in headless Chrome and checked the saved files with separate tools (qpdf, pdftotext, pdftoppm and pypdf):
- `tests/e2e.mjs` is your existing suite, slightly adjusted. It still passes in full.
- `tests/e2e-features.mjs` is new. It covers every new tool, filling a form, the page tools, attachments, "erase for real" alongside the new objects, protected files, restoring work after a reload, and a phone-sized screen.
- `tests/make_more.mjs` now also makes a test form PDF.

In every run, no request left the computer. The only outside connections were headless Chrome's own Google sign-in and update attempts, which the network blocked; the editor itself made none. I also looked at the rendered pages to check them by eye.

`npm test` runs both suites. The README explains how to make the test files.

## What I did not do
- **Other fonts as real text:** text in your own font files, or in Hindi, Arabic and other scripts, is still saved as a sharp picture. Putting those fonts into the PDF needs a font library that isn't available offline here.
- **Existing content:** you can't move or delete pictures already in a PDF (Cover area hides them), and you can't edit existing links or notes.
- **Some Sejda extras:** stamps, signing with the camera, adding new radio buttons or drop-down fields, tab order, inserting pages from another PDF, and dragging pages to reorder them (it's done with buttons). Sejda's online form publishing is left out on purpose, because it would send data out.
- **Older limits:** sideways text still can't be edited, and Find still misses words split across two lines.
- **Deleted pages:** if a deleted page had form fields, they stay in the file's list of fields, but its contents are removed.
- **Other browsers:** I only tested in Chrome, including a phone-sized emulation. I didn't test Firefox, Safari or a real phone.

## Files changed
In `<project folder>/`:
- **New:** `js/objects.js`, `js/sign.js`, `tests/e2e-features.mjs`
- **Rewritten:** `js/app.js`, `js/export.js`
- **Updated:** `index.html`, `styles.css`, `sw.js`, `README.md`, `DESIGN.md`, `package.json`, `tests/e2e.mjs`, `tests/make_more.mjs`
