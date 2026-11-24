Your spending tool is ready. Double-click `index.html` in the folder `<project folder>/` and it opens in your browser.

**What it does**
- **Open bank statements:** you can open one or more CSV files at once. The first time it sees a bank's layout, a box shows the first rows as the tool read them (date, description, money out, money in). You click **Looks right — add these**, or pick the right columns from the lists. It remembers each bank's layout after that.
- **Spending by month:** a table of months against the six categories (Food, Groceries, Travel, Bills, Shopping, Other), with totals for each. Click any figure to see the transactions behind it. Below it, a bar for each category shows where the money went.
- **Fixing categories:** if you change a category, similar transactions (same shop or person) change too, and the tool remembers it for future statements. You can choose **Only change this one** or **Undo**.
- **Sharing:** you can download the summary as a file that opens in Excel, copy it as text to paste into WhatsApp, or print it or save it as a PDF.
- **Privacy:** the page has a built-in lock that stops it from contacting the internet. I tested this: a network request and an outside image were both blocked.

**Choices I made for you:**
- Money coming in (salary, interest) is not counted as spending.
- Rent goes under Bills and ATM cash under Other.
- There is an extra option, "Not spending (own transfer)", for moving money between your own accounts so it isn't counted twice.
- If you put a refund into a category, it is taken off that category.
- Only your category changes and the bank layouts are remembered. The statements themselves are not saved, so you open them again each time.

## Can I trust the totals? What I checked

**What I ran, and the results:**
- **Your `sample-statement.csv`:** total spending is ₹29,505.90 and money in is ₹85,112.35. I worked both out by hand and they match. Every category total matches too. The balance column in your file matches the amounts on all 7 rows, so each amount was read correctly.
- **Six other bank layouts I made up.** I modelled them on how HDFC, ICICI and SBI statements usually look, plus three other common formats. They include extra lines at the top, total lines at the bottom, dates written in different ways, descriptions that wrap onto a second line, and one file with deliberately broken rows. Every total matched the figure I worked out by hand. In total, 72 automatic checks passed.
- **Broken rows:** a row with an impossible date or a word where the amount should be is left out of the totals. It is listed with its line number, and the stamp next to the totals changes from **TALLIED** to **CHECK THESE**.
- **Misread amounts:** I deliberately changed one amount by ₹1, and the balance check caught it.
- **A 600-row statement:** the tool's total, ₹14,74,576.64, matched a separate calculation done by a different program, month by month. It loaded in under a second.
- **Real browser walk-through:** I used the tool in Chrome the way you would, both by double-clicking the file and through a local server. 27 of 27 steps passed: opening your file and a second bank's file together, fixing a category, undo, refusing the same file twice, downloading the summary, the tool remembering things after a reload, and the phone-width layout.
- **Self-checks inside the tool:** every time it shows totals, it checks that month totals, category totals and the list of transactions all add to the same figure. The stamp only says TALLIED when that holds and no row was skipped. Money is counted in whole paise, so no rounding errors build up.

**What I did not check:**
- **Your wife's bank.** I don't know its layout. I tested layouts that are typical, not her real file. When you first open her statement, check the preview rows. If her file has a balance column, the stamp will tell you whether the amounts were read correctly.
- **Real statements from any bank other than your sample.** All the other test files were written by me.
- **Firefox, Safari or a real phone.** I only tested in Chrome, including a phone-sized window. I also didn't test actually printing or the WhatsApp copy on a real device.
- **How good the automatic category guesses are on your real spending.** They are based on shop names. Unknown shops go to Other, so expect to fix some at first. Fixing categories never changes the overall total.
- **Excel (.xls) or PDF statements.** These are not supported. Download the statement as CSV instead.

**Try this yourself in a minute:** open `sample-statement.csv`. The stamp should say TALLIED and the total should be ₹29,505.90. Then change "ATM WDL" to Bills: the total stays the same and the October Bills figure goes up by ₹3,000.

Instructions for you are in `README.md`. The automatic checks run with `node tests/run-tests.js`.
