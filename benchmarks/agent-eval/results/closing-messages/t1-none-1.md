I've built the spending tool. To use it, double-click `index.html` in the `t1-none-1` folder and press **Choose statement files**; you can pick several statements at once. I also ran it through a test browser on laptop and phone screen sizes.

**What it does**
- Opens your bank's layout and other common Indian bank layouts, including ones with the bank's details on top, money in and out in one column, or newest transactions first. I tested 8 layouts. If it reads a statement wrongly, the **Check columns** button lets you correct it, and it remembers that layout next time.
- Shows a table of each month against your six categories, with totals. Tap any amount to see the transactions behind it.
- When you change a category, it also changes similar transactions (for example everything from Amazon) and remembers your choice. A message lets you undo it, or change only that one transaction.
- **Download summary (Excel)** gives you a file to share with your wife, or you can print it or save it as a PDF.
- **Privacy:** the page tells the browser it may not contact the internet. In the test, it made no network requests at all, and an attempt to reach a website from inside the page was blocked.

**Choices I made for you**
- "Total spent" counts only money going out. Salary, refunds and interest are shown separately as "Money in" and are not subtracted, so a refunded purchase still counts as spent.
- ATM cash withdrawals go to "Other".
- I added one extra category, **Not spending (transfer)**. Use it when you send money to your wife: otherwise the money is counted once when you send it and again when she spends it.
- Statements are not saved. Close the page and you'll need to open them again. Only your category choices and column settings are kept, in this browser on this device.

## Can I trust the totals? What I checked

**Checked:**
1. **Your sample statement, by hand.** Money out is ₹29,505.90 and money in is ₹85,112.35. The tool shows exactly these figures, and each of the six spending rows lands in the expected category.
2. **Against the bank's own balance.** I recalculated all 7 of your rows that can be checked (the first row has no earlier balance to start from), and every one matches. The tool does this check on every file that has a balance column and tells you if any row doesn't match.
3. **Seven other made-up statements in different layouts,** including one with 600 rows. A separate Python script worked out the correct totals, and the tool matched them to the paisa for every month and category: 116 automatic checks, all passing. These layouts imitate common bank formats; they are not real files from those banks.
4. **The real page in a headless Chrome browser.** It loaded several files together and gave the right combined total. It noticed when two statements overlap and counted those rows only once. It refused to add the same file twice. Changing categories never changed the total. The downloaded summary's total matched the screen, and a remembered choice was still there after reloading the page. It also clearly flags an amount it can't read (I tested "12O" with a letter O) instead of quietly leaving it out.
5. **A check on every total it shows.** The tool recounts the money out from your files a second way. If the two answers ever differ, a red warning appears.

**Not checked:**
- **Your wife's real statement.** I haven't seen it. When you open it, look for the green **"Every row matches the bank's running balance"** line. Also compare "Money out" with the total withdrawals printed on her statement.
- **Real files from any other bank.** All my test files were made up.
- **A real phone.** I only tested a phone-sized screen on this computer, and opening a file stored on a phone can be awkward.
- **Firefox, Safari and Edge.** I only tested Chrome.
- **Real Excel.** I didn't open the downloaded file in Excel itself.
- **Category accuracy beyond simple cases.** Sorting works by keywords, so some transactions will land in "Other" and you'll need to fix them. "Similar" means the first one or two meaningful words of the description match. For example, two different people called "Ramesh Kumar" would be grouped together.
- **Overlapping statements without a balance column.** Repeated rows are only removed automatically when the file has a balance column. Otherwise they could be counted twice.

In short, the adding up is exact and has been checked several ways. Whether a new bank's file was *read* correctly is shown on each file's card, so check that green line or red warning for every statement you open.

Files are in `<project folder>/`:
- `index.html`
- `style.css`
- `js/engine.js`
- `js/app.js`
- `tests/`: the test files, test scripts and two screenshots. You don't need it to use the tool.
