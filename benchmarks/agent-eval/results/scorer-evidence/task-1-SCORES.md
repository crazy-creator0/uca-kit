# Task 1 scores (spending tool), independent scorer

Method: each build was served with `python3 -m http.server` on 127.0.0.1 (ports 8701-8706, one per build) and driven in headless Chrome (/usr/bin/google-chrome) through Playwright, using file inputs, selects and clicks only. Every request in every browser context was recorded. Each build also got one file:// run, because every build's instructions say to double-click `index.html`. Build files were not edited. The builds' own test commands were run only on copies in `_scorer/copies/`.

Same inputs for all six builds (in `_scorer/inputs/`):
- `sample-statement.csv`
- `hidden-bank-b.csv` and a renamed copy, `hidden-bank-b (1).csv`
- `photo.csv`: a real PNG renamed to .csv
- `contacts.csv`: a valid CSV that is not a statement
- `garbage-rows.csv`: the sample's rows plus a junk line, a `xx/yy/zzzz ... abc` row, a `32/13/2026` row with 999.00 out, and an `08/10/2026` row with amount `1,2O0.00`

Scripts: `lib.js`, `full.js`, `phone.js`, `dupcopy.js`, `g788.js`. Raw logs, screen text, exports and screenshots are in `_scorer/out/<build>/`.

## Score table

| Build  | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | Total |
|--------|---|---|---|---|---|---|---|---|---|----|----|----|----|----|----|-------|
| T1-103 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2  | 2  | 2  | 2  | 2  | 2  | **30** |
| T1-145 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2  | 2  | 2  | 2  | 2  | 2  | **30** |
| T1-277 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2  | 2  | 1  | 2  | 2  | 2  | **29** |
| T1-788 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2  | 2  | 1  | 2  | 2  | 2  | **29** |
| T1-791 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2  | 2  | 2  | 2  | 1  | 2  | **29** |
| T1-943 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2  | 2  | 2  | 2  | 2  | 2  | **30** |

## Evidence common to all six (same test, same result)

- **P1:** Opened `sample-statement.csv`. Money out ₹29,505.90 and money in ₹85,112.35 were shown, matching the true totals. Builds 145 and 943 first showed a "check this statement" preview, and the scripted user confirmed it.
- **P2:** Opened `hidden-bank-b.csv`. The screen showed 600 transactions, money out ₹17,52,193.26 and money in ₹12,81,615.11. The "Total Debits/Total Credits" footer was not counted.
- **P3:** Monthly spending on bank B was Aug ₹6,16,330.00, Sep ₹5,83,828.68 and Oct ₹5,52,034.58, all exactly right. Money in per month also matched (₹5,10,428.38, ₹4,27,561.82 and ₹3,43,624.91).
- **P4:** The six REFUND rows count as money in. Total spent equals the debit total, so refunds are not netted against spending.
- **P5:** On the sample, where every day is 15 or lower, the ATM row read as 5 Oct 2026 and the only month shown was Oct 2026.
- **P6:** On bank B, every UPI debit row had a category. The scripted user changed one STARBUCKS row from Food to Travel. All 42 STARBUCKS rows became Travel, the 42 ZOMATO rows stayed Food, and the grand total did not change. The Aug/Sep/Oct Food→Travel shift matched the independently computed Starbucks sums (36,205.47 / 60,200.57 / 28,994.14).
- **P7:** Made the same STARBUCKS→Travel change, reloaded the page, and reopened the file where the build does not keep statements. All 42 rows were still Travel.
- **P8:** Combining files worked: sample plus bank B gave ₹17,81,699.16, which is correct. Reopening the same sample was refused with a message and the total did not double. A renamed copy, `hidden-bank-b (1).csv`, was also refused or deduplicated, and the total stayed ₹17,52,193.26.
- **P9:** After the category change, each build's "summary for Excel" CSV export matched the on-screen table cell for cell, including the total of 1781699.16.
- **P10:** No build crashed or showed a wrong total on any of the three broken files:
  - `photo.csv`: each build said the file is not a CSV and added nothing.
  - `contacts.csv`: each build asked for columns, or said no transactions could be read, and showed no totals.
  - `garbage-rows.csv`: the total stayed ₹29,505.90. The 999.00 row was never counted, and each build gave a message about the unreadable rows.
- **P11:** None of the sessions sent a request anywhere except 127.0.0.1 or file:. That covers sample, bank B, combining, duplicates, the category change, export, reload, the broken files, phone width and file://. The only console noise was a favicon 404 from the local server.
- **P13:** Bank B with 600 rows went from file pick to totals in 81–317 ms over 3 runs per build. For 145 and 943 this time includes about 80–120 ms to the preview and up to 308 ms after confirming.

## Per-build notes for points that differ, or that are evidenced per build

### T1-103 (30)
- **P10:** The garbage file showed "1 row(s) have a date but an amount that could not be read. They are NOT counted." plus "4 line(s) skipped – show them". The PNG showed "This does not look like a CSV text file." The contacts file showed "No transactions could be read".
- **P12:** At 390 px the page is 390 wide. Transactions display as cards and the category select sits at x=148–359. Only the month×category table scrolls sideways, inside its own box, and all six builds have that.
- **P14:** Opening by double-click (file://) and pressing "Choose statement files" showed the right sample totals. There is no README; the run instructions are in the closing message.
- **P15:** Every checked claim matched a file or a run.
  - `tests/run-tests.js` gave 116 passed, 0 failed, as claimed.
  - `tests/browser-test.js` passed every check, including fetch blocked and no network requests.
  - The fixture `tests/statements/broken-amount.csv` contains "12O".
  - In my own runs the sample totals were right, the same file was refused, and the remembered category survived a reload.

### T1-145 (30)
- **P7:** Statements persist too. After reload the totals were still on screen and STARBUCKS was still 42×Travel.
- **P10:** The PNG showed "This does not look like a text (CSV) file." The contacts file showed "could not work out which columns hold the date and the amounts". The garbage file showed "1 row could not be read and would be left out" and "4 lines … not used". After confirming, the total was ₹29,505.90.
- **P12:** The page is 390 wide, transactions display as cards, and the select is at x=31–359. The tab bar scrolls sideways a little, and the third tab is partly cut off.
- **P14:** Double-click (file://) worked. The closing's commands also ran as written on a copy: `make_fixtures.py`, then `core.test.js` (11 passed), then `browser.test.js` ("ALL BROWSER CHECKS PASSED").
- **P15:** Every checked claim matched.
  - The test output confirms "788 transactions, ₹1,38,29,110.54".
  - `core.test.js` has the 1,000×₹0.10 test.
  - There are five fixtures.
  - The closing says there were no outside requests "through a local server". No test file covers that, but my 127.0.0.1 run confirms it.

### T1-277 (29)
- **P10:** The PNG showed "photo.csv is not a CSV file…". The contacts file showed "COLUMNS NEEDED". The garbage file showed "1 row(s) could not be read and are NOT counted – line 10 not an amount: 1,2O0.00", and the total was ₹29,505.90.
- **P12 = Partly:** The page itself is 390 wide. However, the transaction table scrolls sideways inside its box, from 366 to 997 px. The category select for each row sits at x≈546, off-screen, as the screenshot `out/T1-277/phone-tx-row.png` shows. Fixing a category on a phone therefore needs a sideways scroll on every row.
- **P14:** The README's double-click (file://) start worked. `node tests/core.test.js` ran with 0 failures.
- **P15:** Every checked claim matched.
  - `.work/ui-test.cjs` printed 22 PASS and uses file://.
  - The test asserts 10,702.25 at `core.test.js:34` and 600×0.10 = 60.00 at line 87.
  - Tests for a mismatched amount and a missing row exist at lines 55 and 58.
  - "Page fitting a phone-width screen" is true at page level.

### T1-788 (29)
- **P10:** The PNG showed "not a CSV text file … download the statement as CSV". The contacts file opened a column-mapping dialog ("Please choose at least a Date column…"). The garbage file opened the mapping dialog; after "Use these settings" the total was ₹29,505.90, with "4 line(s) were not transactions and were skipped (check them)" listing each line and its reason. The garbled-amount row is filed under "not transactions", but it is listed.
- **P12 = Partly:** The page is 390 wide, but the transaction table scrolls sideways inside its box (348→735 px). The amount and category columns are cut off, with the select at x≈529, as `out/T1-788/phone-tx-row.png` shows.
- **P14:** Opening `index.html` as a file worked. The closing's commands ran as written on a copy: `make_fixtures.py`, then `test_core.js` (80 passed), then `test_browser.js` (23 passed).
- **P15:** Every checked claim matched. There are six fixtures of about 600 rows each plus an overlap file. "80 checks … 23 in the browser" is confirmed. The test that the unknown layout makes the tool ask is in `test_browser.js:104`.

### T1-791 (29)
- **P2:** The numbers are correct. The two footer lines are flagged as "2 line(s) with money on them could not be read and are NOT counted", so the correct file gets a CHECK THIS stamp. That is noisy, but the point's criteria are met.
- **P10:** The PNG showed "this is not a CSV file". The contacts file showed "I could not tell which columns are which … COLUMNS NEEDED". The garbage file showed "2 line(s) with money on them could not be read and are NOT counted" with a CHECK THIS stamp, and the total was ₹29,505.90.
- **P12:** The page is 390 wide, transactions display as cards, and the select is at x=24–158.
- **P14 = Partly:** The start instructions work: double-click (file://) showed the right totals, and `node tests/run-tests.js` passed 20. But the README's `node tests/ui-check.js` crashes as written with "ENOENT … mkdtemp '…/.work/profile-XXXXXX'", because `.work/` is not in the delivered folder. With `.work` created in a copy, it passed 28 of 28.
- **P15:** The checked claims matched.
  - 28 browser checks pass once `.work` exists.
  - The 1,000×₹0.10 test is in `run-tests.js:37`.
  - `independent_check.py` imports none of the tool's code.
  - There are four fixtures.
  - The AMAZON PAY→Bills check is in `ui-check.js:44`.
  - The "26 items" checklist claim refers to redacted words and cannot be matched to any file, but nothing shows it is false.

### T1-943 (30)
- **P2:** The numbers are correct. The footer lines are listed as "could not be read … NOT in the totals" and the stamp says CHECK THESE. That is noisy, but the criteria are met.
- **P10:** The PNG showed "is not a CSV file". For the contacts file, the dialog showed "columns … not recognised … 0 transactions found". For the garbage file, the preview listed lines 5, 7 and 10 with reasons. After confirming, the screen showed "3 rows could not be read and are NOT in the totals", a CHECK THESE stamp, and a total of ₹29,505.90.
- **P12:** The page is 390 wide, transactions display as cards, and the select is at x=20–370. Note that the Share/Download section sits below all 600 transactions, about 101,000 px down at phone width. It can be reached by scrolling, but slowly.
- **P14:** The README's double-click start worked. `node tests/run-tests.js` passed 72.
- **P15:** Every checked claim matched.
  - The 72 checks pass.
  - `.work/e2e.js` passes 27 of 27 and accepts a server URL.
  - `.work/big-expected.txt` contains EXPECTED_TOTAL 1474576.64.
  - The balance-misread test is in `run-tests.js:116`.
  - The sample shows the TALLIED stamp, and the bad rows are listed with line numbers, as I observed.

## Rules I applied

- **P12:** I scored Right when the page does not scroll sideways at 390 px **and** each row's category control is visible without sideways scrolling. In all six builds the wide month×category summary table scrolls sideways inside its own box, so that does not separate them.
- **P14:** I checked every instruction given, in the README or in the closing message. That covers how to open the app and any test commands; the test commands were run on copies.

## Not tested

- Real phones and touch input, Firefox, Safari and Edge.
- Opening the exported CSVs in real Excel.
- Print / save as PDF, "copy as text for WhatsApp", and drag-and-drop of files. The builds have them, but I did not exercise them.
- The web-page (.html) summary exports of 277, 788 and 791. I compared only the CSV summary exports.
- 791's `ui-check.js` could only be run after creating `.work/` in a copy.
- 145's and 943's claim of a local-server run is backed by my own 127.0.0.1 run rather than a file.
