# Private PDF Editor

A PDF editor that runs entirely in your web browser. Your files are not uploaded anywhere.

- **Change text** that is already on a page: click it and type. The editor matches the original size, colour, boldness and (as closely as your device allows) the font.
- **Add text** anywhere, in any language your device can show (Hindi, Tamil, Arabic, Chinese and so on).
- **Any font**: fonts installed on your device, any font file you add (.ttf, .otf, .woff, .woff2; it is remembered in this browser), and on Chrome/Edge computers, "Show all fonts on this computer".
- **Cover area**: hide part of a page with a box in the page's own background colour.
- **No limits** on pages, changes or file size, apart from your device's memory.

Extras that Sejda's online editor does not offer:
- **Find & replace** across the whole document.
- **Erase covered text for real** when saving, so hidden text cannot be copied out.
- **Your work is kept in this browser** while you edit; if the tab closes you can continue where you left off.
- **Works offline** once it has been opened once.
- **Show original** button to compare before and after; a mark in the left margin shows every change.
- **Unlimited undo / redo**; edited English text stays searchable in the saved file.
- **Safety check before download**: the new file is reopened and checked before you get it. The original is never changed.

## How to start it

The browser needs the files served by a tiny local web server (opening `index.html` by double-click does not work, because the PDF library is not allowed to load that way).

1. Open a terminal in this folder.
2. Run: `python3 -m http.server 8000` (on Windows: `py -m http.server 8000`)
3. Open <http://localhost:8000> in Chrome, Edge, Firefox or Safari.

After the first visit it also works without internet.

**On a phone:** the phone must load the page from a web address. Either put this folder on any static web host you control (it contains no server code, and files are still processed only on the phone), or, on the same Wi-Fi, open `http://<your-laptop-ip>:8000`. On that second option offline use and "kept in this browser" may not work, because browsers only allow those on `localhost` or `https://` addresses.

## Things to know (limits)

- Changed and added text is saved as a high-resolution picture of the text (about 290 dpi), because this editor cannot embed fonts into the PDF. It looks the same when viewed and printed. English/Latin letters also get an invisible searchable copy; other scripts are not searchable in the saved file.
- When you change text, the old text is **covered, not deleted**, unless you tick "Erase covered text for real" when saving. With that ticked, those pages become pictures: text on them can no longer be selected, and links on them stop working.
- "Erase for real" removes text from the page itself. It does not touch copies of the same words elsewhere in the file (for example bookmarks or document properties).
- Only level (horizontal) text can be changed. Text that runs sideways or at an angle can be covered and replaced with new text instead.
- Find & replace finds words within one line. Words split across two lines are not found.
- Protected PDFs (with editing restrictions) are saved as pictures of the pages.
- Digitally signed PDFs: any change makes the signature invalid (the editor warns you).
- If a font is not installed on your device, a similar one is used. "Original font" in the style bar tells you what the document used, so you can add that font file.

## Files

- `index.html`, `styles.css` — the page
- `js/app.js` — screen and editing
- `js/export.js` — writes the new PDF and checks it
- `js/textdraw.js` — draws text the same way on screen and in the file
- `js/fonts.js` — fonts on the device and added fonts
- `js/store.js` — keeps your work in this browser
- `sw.js` — offline support
- `vendor/` — pdf.js (Apache-2.0) and pdf-lib (MIT)

## Testing

`node tests/e2e.mjs` drives the editor in Chrome and checks the saved files with qpdf, pdftotext and pdftoppm.
It needs Playwright, Chrome, qpdf and poppler-utils installed, and test files made first:

```
mkdir -p .uca-workspace/pdfs && cd .uca-workspace
python3 ../tests/make_pdfs.py pdfs && node ../tests/make_more.mjs pdfs && python3 -I ../tests/make_font.py
qpdf --encrypt "" owner123 256 --print=none -- pdfs/invoice.pdf pdfs/protected.pdf
qpdf --encrypt userpw owner123 256 -- pdfs/invoice.pdf pdfs/password.pdf
cd .. && node tests/e2e.mjs
```
