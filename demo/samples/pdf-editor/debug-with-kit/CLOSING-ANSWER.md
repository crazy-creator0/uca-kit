# Closing answer: debug run WITH kit (verbatim)

The editor now has the missing Sejda tools and two bugs are fixed. I found no other breakage: the features people already had (changing text, cropped and rotated pages, moving, zoom, multi-line, find & replace, fonts, protected files, 300-page files) all worked in my checks and still do. Nothing is sent anywhere: across every test run, all requests stayed on this computer.

## What was broken (now fixed)
- **One failed save spoiled later files.** If a save failed once, every file you opened afterwards was also saved as pictures of the pages, until you reloaded the page. The new test for this fails without the fix and passes with it.
- **Cover boxes couldn't be resized** after drawing them. They now have a corner handle, and so do pictures, shapes, highlights and links.

## What was missing (now added)
- **Image:** add a picture, then move and resize it.
- **Sign:** draw a signature (mouse, finger or pen) or type it in a handwriting font. You can tick a box to remember it in this browser only; that's off by default, and saved signatures can be forgotten.
- **Highlight, underline, strike out:** drag over text, or click a line to mark the whole line.
- **Shapes and drawing:** rectangle, ellipse and line, with colour, thickness and fill; plus freehand drawing.
- **Links:** to a web address, an email address or a page number.
- **Fill in forms:** text fields, tick boxes, radio buttons and dropdowns, with the values saved into the file's own form.
- **Pages:** turn a page, insert a blank page, or delete a page. All of these can be undone.
- **Sharper text:** changed text in Arial/Helvetica, Times or Courier (and look-alikes like Liberation Sans) is now saved as real text instead of a picture, when it uses Western European letters.
- Your work in progress kept in the browser now also includes form values, pictures and page changes.

## Problems I caused and fixed along the way
- The extra buttons pushed **Save a copy** off-screen on a laptop, and made the toolbar scroll sideways on a phone. The toolbar now wraps onto more rows instead.
- The Find & replace panel then covered the Save button. It now opens just below the toolbars.
- Form fields at first broke the page display, because your copy of pdf.js lacks a function I used. Fixed.

## How I tested
- I ran the existing automated test (`node tests/e2e.mjs`) first: all 36 checks passed before any change.
- I added 21 checks covering the bug fix and every new tool. Each saved file is checked with separate tools (qpdf, pdftotext, poppler and pypdf) for page turns, links, form values, the inserted and deleted pages, and that pictures and highlights actually appear.
- Final result: **57 of 57 checks pass**, on two runs in a row. One earlier run was cut short when the local test web server dropped its connection; the next two full runs passed.
- I looked at screenshots at laptop and phone sizes, and the kit's design and wiring checks found nothing.

## What I did not do
- **Fonts:** other fonts and non-Latin scripts (Hindi, for example) are still saved as high-resolution pictures of the text. Saving them as real text needs a font library, which would be a new dependency, so I left it out. One is available offline on this machine if you want it.
- **Not built:** adding new form fields, moving pages to a different position, resizing freehand drawings, and editing a whole paragraph as one block (it's still line by line).
- **Form values in other scripts:** if you type, say, Hindi into a form field, the value is saved but other PDF readers draw it themselves.
- **Phone toolbar:** on a phone the toolbar now takes several rows of the screen.
- **Not tested:** Firefox and Safari, real touch devices, and drawing a signature by actual touch (the test drew it with the mouse).
- No git, as instructed; I made no git checkpoint, so there is no automatic undo point for these edits.

Files changed: `js/app.js`, `js/export.js`, `js/store.js`, `index.html`, `styles.css`, `sw.js`, `README.md` and `tests/e2e.mjs`; new: `js/items.js` and `tests/make_form.mjs`. All are in `<project folder>/`.
