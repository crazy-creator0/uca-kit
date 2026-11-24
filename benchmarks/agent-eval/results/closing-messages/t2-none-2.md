I've built the app. In my tests the settle-up amounts were correct to the paisa every time. That's strong evidence, but it doesn't guarantee there are no bugs, and I only tested in Chrome on a computer, never on a real phone.

**Main limitation:** there's no syncing between phones. The list lives only on the phone of the person who keeps it. Everyone else gets the result through the **📤 Share this with the group** button on the Settle up screen, or through a backup file.

**What the app does**
- **Adding an expense:** type the amount (like 1250.50), tap who paid, and tick who it was for. Everyone still on the trip is ticked to start with. It shows each person's share before you save.
- **Settle up:** shows who pays whom, using the fewest payments possible, and each person's balance. When a payment is made, tap **Paid** and it's recorded.
- **People:** if someone joins midway, add them. If someone leaves, tap **Has left the trip**. They stay in their old expenses but aren't ticked for new ones.
- **Keeping data safe:**
  - Every change is saved on the phone straight away, and no internet is needed.
  - There's an Undo for the last 30 changes.
  - If the phone closes the browser while you're typing an expense, the half-typed expense comes back.
  - A damaged saved list is never thrown away; the app opens the previous version instead.
  - The **Backup** tab saves a copy you can send to yourself on WhatsApp or email, and restores it on another phone.

**Can you trust the settle-up amounts? What I checked:**
- **No rounding errors:** all money is stored as whole paise, so nothing like ₹0.29 turning into ₹0.2899 can happen.
- **Splits always add up exactly:** I tested every amount from 1 paisa to ₹30 split between 1 to 7 people. When an amount doesn't divide evenly (₹100 between 3), one person pays 1 paisa more.
- **Random trips:** I ran 5,000 random trips of 2 to 8 people through the calculation. Every time, all balances added up to zero, and making the suggested payments left everyone at exactly ₹0.00.
- **Fewest payments:** I compared the number of payments against a slow method that tries every possible way of grouping people. They always matched, including a case where the obvious approach (biggest debtor pays biggest creditor) needs 4 payments and the app finds 3.
- **One example worked out by hand:**
  - Expenses: hotel ₹4,000 for all four, dinner ₹900 without Asha, juice ₹100 without Divya.
  - Expected balances: Asha gets back ₹2,966.66, Ben owes ₹433.33, Chetan owes ₹1,233.33, Divya owes ₹1,300.00.
  - The app showed exactly those amounts.
- **The real app in a browser:** 18 checks in headless Chrome on a phone-sized screen, all passing. These covered:
  - adding and editing expenses (including amounts typed with commas)
  - rejecting "12.345"
  - data surviving a page reload
  - opening and adding an expense with the internet switched off
  - Undo after a delete
  - someone leaving and someone joining
  - marking every payment Paid until everyone shows "settled"
  - restoring a backup on a second browser and getting identical data
  - rejecting a cut-off backup
  - two windows of the app open at once without one overwriting the other
  - 200 expenses for 6 people (still fast, using about 56 KB of the browser's storage)
  - no errors in the browser's error log

**What I did not check**
- **No real phones.** I never tried it on an iPhone or Android phone, the "Add to Home screen" step, the Share and Copy buttons, or the rename pop-ups.
- **Storage being cleared.** I can't test iPhone Safari clearing data for sites unused for about a week (unless the app is on the Home Screen), or someone clearing their browsing data. That's why the Backup tab is there: save a copy every day or two.
- **Large groups.** For more than 16 people who still owe or are owed money, it uses a simpler method that may suggest a payment or two more than the minimum. My brute-force cross-check only covered up to 8 people.
- **Only equal splits.** "Ben had 2 beers" has to be entered as a separate expense.

**Putting it on your phones**
I couldn't publish it (no internet here), and the "works with no internet" part only works once the app is on a website. Have someone upload the folder to a free static host such as Netlify Drop or GitHub Pages. Then the keeper opens the link once while online and uses **Add to Home screen** in the browser menu. To try it on a computer instead, run `python3 -m http.server` in the folder and open the address it prints.

To re-run the checks: `node tests/math.test.js` for the maths, and `tests/e2e.test.js` for the browser test (it needs the local server running and its address in `APP_URL`).

Files are in <project folder>:
- index.html
- app.js
- split.js
- style.css
- sw.js
- manifest.webmanifest
- icon.svg
- icon-192.png
- icon-512.png
- tests/math.test.js
- tests/e2e.test.js
- tests/make-icons.js
- tests/screenshots/
