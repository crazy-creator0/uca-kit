I've built the tool in `<project folder>/`. Open `index.html` in a browser and choose one or more CSV statements. To share, use "Download summary page": it saves one file that opens on any phone and shows totals only. Change a wrong category on the "Check transactions" tab; it asks whether to remember the fix for every description containing a word like SWIGGY. For money moved between your own accounts, pick "Not spending" so it isn't counted twice.

What I chose, since I couldn't ask you:
- **Spending** means money going out. Salary, refunds and interest show as "Money in" and are not subtracted from spending, so an Amazon refund won't lower your Shopping total.
- **The same file opened twice** is refused. If two statements overlap, rows with the same date, amount and description are counted once. There is a tick box to count them again.
- **Statements are not saved** when you close the page; you reopen the files each time. Only your category rules and column settings are kept, in this browser on this device. "Save my rules to a file" moves them to another browser.
- **Built-in keywords** sort common Indian merchants (Swiggy, BigBasket, Uber, BESCOM, Amazon and so on). Your own rules always win over them.

## Can I trust the totals?

**What I checked:**
- **Your sample statement:** the tool reads 8 transactions: money out ₹29,505.90 and money in ₹85,112.35. I added these by hand first and they match. Each of the 7 balance steps agrees with the bank's own balance column (₹50,000.00 at the start, ₹1,05,606.45 at the end). The amount in every category cell matches its row.
- **Other bank layouts:** I made 6 test statements of 600 rows each, imitating common Indian bank layouts:
  - extra lines at the top and summary lines at the bottom
  - tab-separated files listed newest first
  - one plus-or-minus amount column
  - an amount with a separate Dr/Cr column
  - "Dr"/"Cr" written after the number
  - different date styles
  
  A separate Python script worked out the right answers, and the tool matched them to the paisa for every month and category. All 6 opened without needing help, and where a file had a balance column, every row agreed with it. A file with no column titles made the tool ask which column is which, as intended.
- **Using it in a browser:** I used it in headless Chrome the way you would: opened files, fixed a category, closed and reopened, downloaded all three exports. 80 checks on the money logic and 23 in the browser all pass.
- **Privacy:** the browser test confirmed the page made no internet requests. The page also has a built-in block on using the internet.
- **On screen:** every time, the tool shows that the table adds up across and down, and that money out = spending + not counted.

**What I did not check:**
- **Real statements from your bank or your wife's.** The "other banks" were files I made up, so her real layout may differ. When you open a file, compare the "money out / money in" lines with her statement's totals. The tool also tells you if the balance column disagrees.
- **Category accuracy.** Correct adding doesn't make the labels correct, so look through the "Check transactions" tab.
- **Real devices.** I didn't test on a real phone or on Firefox or Safari. On a phone, the downloaded summary page is the reliable part; opening the tool itself there may be awkward.
- **Excel and PDF statements.** These aren't read; you'll be asked to download a CSV instead.
- **Odd date styles.** If dates like 05/06 could be either day or month first, the tool assumes day first and shows a warning.

Files are in `<project folder>/`:
- index.html
- core.js
- app.js
- styles.css
- tests/

To rerun the checks: `python3 tests/make_fixtures.py`, then `node tests/test_core.js`, then `node tests/test_browser.js`.
