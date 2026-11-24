I've built the tool, and the totals came out right in every test I ran. To use it, double-click `<project folder>/index.html`. It opens in your browser and needs no internet or installation.

## How it works for you
- **Opening statements:** click **Open statement files** and pick one or more CSV files, yours and your wife's together if you like. The first time it sees a new bank's layout, it shows how it read the file: the first few rows, the money in and out, and a check against the bank's balance column. If that looks right, click **Looks right, add it**. After that, files from the same bank are added without asking. If a layout isn't read correctly, you can tell it which column is which.
- **Summary:** one table with each month down the side and Food, Groceries, Travel, Bills, Shopping, Other and Total across the top. Click any amount to see the transactions behind it.
- **Fixing a category:** on the Transactions tab, pick the right category for a transaction. The tool applies it to similar transactions and to future statements, with an **Undo** button and a **Only change this one** button. The **Remembered categories** tab lists and lets you edit everything it has remembered.
- **Sharing with your wife:** you can print or save a PDF, download the summary for Excel, or copy it as text for WhatsApp.
- **Privacy:** the page is locked so it cannot contact any server. Your transactions and choices are saved only in this browser on this computer, so they're still there next time. **Remove everything from this browser** deletes them.

Choices I made for you:
- Salary and other money coming in is not counted as spending.
- ATM cash counts as **Other**.
- There is an extra category, **Not spending**, for things like money you send each other. Otherwise the same money could be counted twice.
- A refund that you put into a category is subtracted from that category's total.
- Opening the same file twice, or two statements that overlap, does not count anything twice.

## Can I trust the totals?

**What I checked, by running it:**
1. **Your sample statement, by hand:** I added it up myself and got ₹29,505.90 spent in October 2026: Food ₹452, Groceries ₹1,236.50, Travel ₹318.40, Bills ₹22,000, Shopping ₹2,499, Other ₹3,000. Money in was ₹85,112.35. The tool's figures match exactly, and the bank's own balance column agrees for 7 of the 8 rows. The first row can't be checked because the statement doesn't show the balance before it.
2. **Five other layouts:** I made up statements in five different bank layouts: HDFC-like, SBI-like (tab-separated, "1 Nov 2026" dates, newest first), ICICI-like with a Dr/Cr column, a credit card with month/day/year dates, and one with 600 rows. A separate script recorded the correct totals as it wrote them, so they don't depend on the tool. For all five, every month, every category, the money in and out and the number of transactions matched to the paisa. The balance check also passed on all of them.
3. **The real page in a browser:** an automated test in Chrome opened files, refused the same file twice, changed a category, used Undo, reloaded the page, downloaded the summary and switched to a phone-sized screen. The total on screen, the downloaded summary and the independent figures all matched (788 transactions, ₹1,38,29,110.54). The page made no outside network requests and showed no errors, both when opened from disk and through a local server.
4. **Exact sums:** amounts are added as whole paise, so there are no rounding errors. I tested this with 1,000 amounts of ₹0.10.

Testing caught two real mistakes, which I fixed. Some UPI descriptions were being stripped down to almost nothing, which sent Swiggy and Zomato to the wrong category. And one header, "Transaction Amount(INR)", was being read as the description column.

**What I did not check:**
- **Your wife's actual statement.** I don't have it, and I only tested layouts I made up to look like Indian banks. When you open hers, look at the check screen: the balance check should be green and the rows should look right.
- Excel files, PDFs, and statements that write amounts European-style ("1.234,56"). The tool asks for CSV.
- Real phones, Safari and Firefox. I only tested Chrome, including at phone size.
- The printed or PDF output, and pasting the copied text into WhatsApp.
- Descriptions that run onto a second line, and overdrawn (negative) balances. The tool has code for both, but I didn't test either.

**Where the totals depend on you:**
- The categories are best guesses from a list of shop names. Anything it doesn't recognise goes to **Other**, so look through Other once.
- If your statement has no balance column, the extra cross-check isn't possible and the check screen says so.
- Statements that overlap are matched by date, description, amount and balance. If a statement has no balance column, two genuinely identical payments that appear in two different files could be counted once instead of twice.

To re-run the checks yourself: run `python3 tests/make_fixtures.py`, then `node tests/core.test.js` and `node tests/browser.test.js`. The made-up test statements and screenshots are in the `tests` folder.
