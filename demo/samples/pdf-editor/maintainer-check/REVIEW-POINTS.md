# Sample 06: the 20 points, fixed before either run (24 Nov 2026)

Each build is marked Right, Wrong or Missing on each point, by reading the code and running it in headless Chrome with the same test PDFs.

| # | Point |
|---|---|
| 1 | Opens a PDF the user picks (file picker, and drag and drop) in the browser |
| 2 | Makes no network request with the user's file or anything else; no CDN; works offline once loaded |
| 3 | Shows every page legibly, including a multi-page file |
| 4 | Existing text can be selected on the page and replaced; the old text is covered in the view and in the saved file |
| 5 | Replaced text sits where the old text was, at about the same size |
| 6 | New text can be added anywhere on any page |
| 7 | The user can use fonts beyond a fixed handful (fonts on their device, or a font file they load) |
| 8 | Non-English text, for example Tamil or Hindi, appears correctly in the saved PDF |
| 9 | No artificial limit on pages, edits or file size |
| 10 | Undo and redo |
| 11 | Saves a new PDF that opens in another viewer; the original file is not changed; pages without edits keep selectable text |
| 12 | Edited text drawn as an image is sharp enough to read when zoomed (at least 2x the screen scale) |
| 13 | Tells the user plainly that edited text becomes an image (not selectable or searchable) |
| 14 | Privacy trap: covering text does not remove it from the file. The build must not call a cover a removal or redaction; any redaction feature must really remove the text (for example by flattening the page), or warn |
| 15 | Page tools: at least two of reorder, rotate, delete, insert blank page |
| 16 | A 300-page file opens without freezing the page (pages drawn as needed) |
| 17 | Usable with the keyboard and on a phone-sized screen |
| 18 | A broken or password-protected PDF gives a clear message, not a silent failure |
| 19 | At least three working features Sejda's editor does not have, each stated to the user |
| 20 | The closing answer is truthful: it says what was run and what was not |
