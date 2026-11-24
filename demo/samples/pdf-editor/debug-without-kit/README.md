# Private PDF Editor

A PDF editor that runs entirely in your web browser. Your files are not uploaded anywhere.

- **Change text** that is already on a page: click it and type. The editor matches the original size, colour, boldness and (as closely as your device allows) the font.
- **Add text** anywhere, in any language your device can show (Hindi, Tamil, Arabic, Chinese and so on).
- **Any font**: fonts installed on your device, any font file you add (.ttf, .otf, .woff, .woff2; it is remembered in this browser), and on Chrome/Edge computers, "Show all fonts on this computer".
- **Images**: put a picture (PNG, JPEG, WebP, GIF, SVG…) on a page, move it, resize it from its corner. You can also drop a picture onto the window.
- **Signature**: draw it, type it, or upload a photo of it (the white paper is made see-through).
- **Cover area** (whiteout): hide part of a page with a box in the page's own background colour.
- **Mark up**: highlight, strike out and underline (they follow the lines of text you drag over), freehand drawing, see-through marker, and sticky notes.
- **Shapes**: rectangle, ellipse, line and arrow, with colour, fill, line width and see-through setting.
- **Links**: make an area clickable, to a web address, an email address, a phone number or a page of the document.
- **Forms**: fill in the form boxes a PDF already has (text, tick boxes, choices, lists), and add new text fields and tick boxes.
- **Pages**: turn, move up or down, delete, or add a blank page, with the buttons above each page.
- **Attachments**: see and download files attached inside a PDF, and attach new ones.
- **On every page**: copy a picture, shape, box, link or added text to all pages at once. Ctrl+C / Ctrl+V copy and paste a change; arrow keys move it.
- **No limits** on pages, changes or file size, apart from your device's memory.

Extras that Sejda's online editor does not offer:
- **Find & replace** across the whole document.
- **Erase covered text for real** when saving, so hidden text cannot be copied out.
- **Your work is kept in this browser** while you edit (including pictures and page changes); if the tab closes you can continue where you left off.
- **Works offline** once it has been opened once, and nothing is ever uploaded.
- **Show original** button to compare before and after; a mark in the left margin shows every change.
- **Unlimited undo / redo** (also for page changes); edited English text stays searchable in the saved file.
- **Safety check before download**: the new file is reopened and checked before you get it. The original is never changed.
- Works on rotated pages, any page size, and on phones.

## How to start it

The browser needs the files served by a tiny local web server (opening `index.html` by double-click does not work, because the PDF library is not allowed to load that way).

1. Open a terminal in this folder.
2. Run: `python3 -m http.server 8000` (on Windows: `py -m http.server 8000`)
3. Open <http://localhost:8000> in Chrome, Edge, Firefox or Safari.

After the first visit it also works without internet.

**On a phone:** the phone must load the page from a web address. Either put this folder on any static web host you control (it contains no server code, and files are still processed only on the phone), or, on the same Wi-Fi, open `http://<your-laptop-ip>:8000`. On that second option offline use and "kept in this browser" may not work, because browsers only allow those on `localhost` or `https://` addresses.

## Things to know (limits)

- Changed and added text in Arial/Helvetica, Times or Courier-style fonts (including Liberation, Arimo, Tinos, Cousine) is saved as real text. Other fonts and other scripts are saved as a high-resolution picture of the text (about 290 dpi), because this editor cannot put font files into the PDF. It looks the same when viewed and printed. English/Latin letters in those pictures also get an invisible searchable copy; other scripts are not searchable in the saved file.
- When you change text, the old text is **covered, not deleted**, unless you tick "Erase covered text for real" when saving. With that ticked, those pages become pictures: text on them can no longer be selected, and links on them stop working.
- "Erase for real" removes text from the page itself. It does not touch copies of the same words elsewhere in the file (for example bookmarks or document properties).
- Only level (horizontal) text can be changed. Text that runs sideways or at an angle can be covered and replaced with new text instead.
- Find & replace finds words within one line. Words split across two lines are not found.
- Protected PDFs (with editing restrictions) are saved as pictures of the pages.
- Digitally signed PDFs: any change makes the signature invalid (the editor warns you).
- Highlights, shapes, drawings and signatures become part of the page drawing (they print everywhere); notes, links and new form fields are real PDF annotations and fields.
- Deleted pages are taken out of the copy; bookmarks that pointed to them stop working.
- Existing pictures in the PDF cannot be moved or deleted; cover them with "Cover area" instead.
- If a font is not installed on your device, a similar one is used. "Original font" in the style bar tells you what the document used, so you can add that font file.

## Files

- `index.html`, `styles.css` — the page
- `js/app.js` — screen and editing
- `js/export.js` — writes the new PDF and checks it
- `js/textdraw.js` — draws text the same way on screen and in the file
- `js/objects.js` — pictures, shapes, mark-up, links, notes and fields: how they are drawn on screen and in the file
- `js/sign.js` — reading pictures and the signature window
- `js/fonts.js` — fonts on the device and added fonts
- `js/store.js` — keeps your work in this browser
- `sw.js` — offline support
- `vendor/` — pdf.js (Apache-2.0) and pdf-lib (MIT)

## Testing

`node tests/e2e.mjs` (text, cover, find & replace, fonts, protected files, 300 pages, phone) and
`node tests/e2e-features.mjs` (pictures, signatures, mark-up, shapes, links, notes, forms, page tools, attachments)
drive the editor in Chrome and check the saved files with qpdf, pdftotext, pdftoppm and pypdf.
They need Playwright, Chrome, qpdf, poppler-utils and Python with pypdf, Pillow and fontTools installed, and test files made first:

```
mkdir -p .uca-workspace/pdfs && cd .uca-workspace
python3 ../tests/make_pdfs.py pdfs && node ../tests/make_more.mjs pdfs && python3 -I ../tests/make_font.py
qpdf --encrypt "" owner123 256 --print=none -- pdfs/invoice.pdf pdfs/protected.pdf
qpdf --encrypt userpw owner123 256 -- pdfs/invoice.pdf pdfs/password.pdf
python3 -I -c "from PIL import Image, ImageDraw as D; i=Image.new('RGB',(400,200),(30,120,200)); i.save('pdfs/photo.jpg'); l=Image.new('RGBA',(300,150)); D.Draw(l).rectangle((20,20,280,130),fill=(200,30,30,255)); l.save('pdfs/logo.png'); s=Image.new('RGB',(600,200),'white'); D.Draw(s).line((40,150,200,40,360,160,560,60),fill=(10,10,80),width=8); s.save('pdfs/signature.jpg')"
cd .. && node tests/e2e.mjs && node tests/e2e-features.mjs
```
