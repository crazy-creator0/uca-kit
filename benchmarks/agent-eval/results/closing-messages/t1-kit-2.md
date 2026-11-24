I've built the spending tool. Double-click `index.html` in this folder to open it; nothing needs installing, and it works without internet.

**What it does**
- **Opens several statements at once**, including different bank layouts. It finds the column names even when the bank puts account details above them. It handles separate Debit/Credit or Withdrawal/Deposit columns, a single Amount column with a Dr/Cr marker, files that list the newest transaction first, and dates like "05/10/26" or "05-Nov-2026". If it can't recognise a layout, it asks you to pick the columns and shows a preview. It remembers that layout for the same bank's next statement.
- **Shows a table of months against categories** (Food, Groceries, Travel, Bills, Shopping, Other), with totals and money coming in shown separately. Click any amount to see the transactions behind it.
- **Lets you fix a category.** Change it in the list, then choose "Remember for all like this", for example everything containing "UBER" goes to Travel, now and in future statements. You can see and delete these rules at the bottom of the page.
- **Exports a summary for your wife**: a spreadsheet file and a web page file with monthly totals only, no individual transactions.
- **Keeps your data private.** The page is locked by the browser so it can't contact any other computer. Only your category rules and layouts are remembered, in this browser on this laptop. The statements aren't stored, so you open them again each time.

**Choices I made for you** (all can be changed):
- "Spent" means money going out. Salary, interest and refunds aren't subtracted.
- Rent and utilities count as Bills; ATM cash counts as Other.
- I added a seventh choice, "Not spending (own transfer)". Use it for money moved between your two accounts, which would otherwise be counted twice when both statements are open.
- A transaction that appears in two downloaded statements is counted once.

**Can I trust the totals? What I checked:**
- **Your file, by hand.** Your six payments add up to ₹29,505.90, and the tool shows exactly that.
- **The bank's own balance.** On every statement, the tool checks each row against the bank's balance column. If they all agree, the statement gets a green **TALLIES** stamp. If a row was missed or read wrongly, it gets a red **DOES NOT TALLY**. I tested that a mistyped amount and a deleted row both turn the stamp red. This is the best everyday check you have.
- **A different layout.** I made up a statement in another bank's style, with account details above the columns, two-digit years and a totals block at the end. The tool's spending matched that file's own stated debit total, ₹10,702.25. I also tested a third style: one Amount column with Dr/Cr, semicolons instead of commas, newest first.
- **600 transactions, worked out separately.** I generated a 600-row statement and computed the totals with a separate Python program. Every month and every category matched to the paisa.
- **The real page, opened by double-click in a test browser.** 22 checks passed:
  - every number on screen
  - each category column and each month row adding up to the grand total
  - the downloaded spreadsheet matching the screen
  - a remembered category still working after reopening
  - the same file opened twice not being counted twice
  - zero internet requests
  - the page fitting a phone-width screen

  One failure along the way was a mistake in my own expected number, not in the tool. I proved that with arithmetic before correcting the test.
- **No rounding drift.** Amounts are added as whole paise, so 600 payments of ₹0.10 come to exactly ₹60.00.

**What I did not check:**
- **Your wife's real statement.** I haven't seen her bank's file, so the "other layout" tests used files I made up. When you open hers, look for the green TALLIES stamp. If you don't see it, click "Change how this file is read".
- **Files without a balance column.** These can't be cross-checked and show **NOT CHECKED**.
- **Categories.** These are a best guess from a keyword list. Look down the list the first time, because anything unknown lands in Other.
- **Refunds** are counted as money in. They don't reduce, for example, Shopping.
- **Other browsers and devices.** I didn't test on a real phone, in Safari or Firefox, or with Excel or PDF statement files. The tool asks for CSV.
- **The phone.** It doesn't share your rules with the laptop, and getting the files onto a phone browser may be awkward.

Files are in `<project folder>/`:
- `index.html`
- `README.md`, which has plain instructions
- `tests/`
- `.uca-workspace/`, with my test scripts

I didn't set up Git, because you asked me not to. Using it would let you undo changes later.
