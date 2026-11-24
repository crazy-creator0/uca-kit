# Maintainer checks for Sample 06

The scripts that produced the scores in [../REVIEW.md](../REVIEW.md). They serve each build on 127.0.0.1 with Python's web server, drive it in headless Chrome with Playwright, and write saved PDFs and screenshots to `results/` (not kept in the repository). The saved PDFs were then checked with separate tools: `qpdf --check`, `pdftotext`, `pdffonts`, `pdfimages` and `pdftoppm`.

Needs Node 20+, Python 3, Playwright and Chrome or Chromium. If Playwright or the browser is somewhere Node cannot find, set `PLAYWRIGHT` (path to the Playwright module) and `CHROME` (path to the browser).

| Script | What it does |
|---|---|
| `REVIEW-POINTS.md` | The 20 points, fixed before either build was made |
| `harness.mjs <A\|B\|K\|N>` | Open a 3-page invoice, replace "Asha Raman" with "Priya Kumar", save normally and with "erase", log every request |
| `harness2.mjs <A\|B\|K\|N>` | Erase with only page 1 edited, Tamil and Hindi text, the broken and password files, the 300-page file, and Save pressed while Replace all is still running |
| `audit-checks.mjs <folder> <port>` | The blind audit's runtime findings: Find clicked twice, password kept on save, file kept in the browser, keyboard reach |
| `phone.mjs` | A 390-pixel-wide view of each build with a file open |
| `make-pdfs.mjs` | Remakes the test PDFs in `testpdfs/` |

A = `without-kit`, B = `with-kit`, K = `debug-with-kit`, N = `debug-without-kit`.

Counts that depend on click timing (pages changed twice, pages done when Save was pressed) differ from run to run; what matters is whether the count is above zero.
