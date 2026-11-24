I built the app and checked the settle-up amounts several ways, all with real test runs. One limit matters most: I never tried it on a real phone.

**What you get**

- A phone web page called "Trip Split", in your working folder. The page is `index.html`.
- **Expenses:** add what it was for, the amount (for example `2,450.50`), tap who paid, and tick who it was for. All four people are ticked by default. Before you save, it shows each person's share to the paisa.
- **People:** add someone anytime. If someone leaves midway, tap "Left the trip". New expenses then leave them out unless you tick them, but they still settle up.
- **Settle up:** shows lines like "Divya pays Chetan ₹31,563.33" using the fewest possible payments. You can tap "Mark as paid" when money changes hands, and share the list to WhatsApp.
- **Not losing data:**
  - It saves after every change and reads the save back to confirm it.
  - It keeps a spare copy of the last save, in case the main one gets damaged.
  - Deleting an expense can be undone.
  - If saving ever fails, a loud "NOT SAVED" warning appears with a backup button.
  - There is "Download backup" and "Restore from backup" on the People tab.
- **Choices I made for you:**
  - Shares are always equal among the people ticked. Unequal splits ("Ben had two beers") are not built; add separate expenses instead.
  - There is no live sync between phones. The list keeper shares the summary text or the backup file.

**One thing you must do:** to use it on a phone, the files have to be put on a website with an `https://` address (any free static-site host works). Open it there once while online and choose "Add to Home screen". After that it works with no internet. I did not put it online; that is your call.

## Can we trust the settle-up amounts?

**What I checked, and the result:**

1. **No rounding errors.** Money is stored as whole paise, never decimals. Tests confirm that a split never loses or adds a paisa, across 2,000 random amounts split between 1 and 8 people. Example: ₹2,450.50 between three people comes out as 816.84 + 816.83 + 816.83.
2. **Fewest payments.** I compared the app's answer with a separate brute-force count on 3,000 random trips of 2 to 7 people. Every one matched, and every set of payments brought everyone to exactly zero. The brute force counts using a known maths rule, not by trying every possible payment plan, but that rule is a proven fact.
3. **On the real page, like you would use it.** I drove the actual app in a headless Chrome at phone size: adding people, adding expenses (including an amount typed as "₹ 640.75"), someone joining, someone leaving, editing, deleting and undoing.
   - After each step I compared the screen's "X pays Y" lines with balances worked out separately in the test. They settled everyone to the paisa, with the minimum number of payments.
4. **200 expenses**, your largest size, with odd paise amounts: settled exactly in 4 payments, and the page opened in about 0.2 seconds.
5. **No internet:** with the network turned off, the app opened, took a new expense, and still had it after a reload.
6. **Safety:**
   - A backup brought everything back after the phone's storage was wiped.
   - A wrong file was refused without changing anything.
   - A damaged save was recovered from the spare copy.
   - A failed save showed the "NOT SAVED" warning.
   - Typing mistakes were refused with a message: 3 digits after the dot, negative amounts, no payer ticked.

**Final run:** the 12 money tests and all 33 page checks pass. The project's own readiness check rates it "Silver", 25 of 26 checks.

**I was wrong once, and it was caught.** Looking at screenshots, I found two display bugs that my scripted checks had missed:
- The red "ALL SQUARE" stamp showed even while money was still owed.
- An empty "Undo" bar never went away.

I fixed both and added checks for them. The amounts themselves were never wrong. I also fixed a weak spot where a damaged save could have opened as an empty list.

**What I did not check:**
- **Phones:** I did not test on a real phone, an iPhone, Safari, or after "Add to Home screen". The no-internet test ran on a local test address, not a real https site.
- **Sharing and buttons:** I did not test the WhatsApp share button, the Rename button, or the app open in two tabs at once.
- **Long-term storage:** I did not test how long the phone's browser keeps the data. iPhones in particular can clear website data that has not been used for some days. **Download a backup every day or two**; that file is your real protection.
- **Bigger groups:** the "fewest payments" answer is exact for up to 16 people who owe or are owed. Above that it uses a simpler method I did not test for minimum count. That doesn't apply to four of you.
- All test data was made up by me, not taken from your real trip.

**Before the trip, a 2-minute check on the keeper's phone:**
1. Add 4 people and one expense.
2. Close the browser completely and reopen: the expense should still be there.
3. Turn on airplane mode, open the app from the home screen, and add another expense.
4. Download a backup and check the file appears in your downloads.

Files are in `<project folder>`:
- `index.html`
- `style.css`
- `split.js` (the money maths)
- `app.js`
- `sw.js` (makes it open offline)
- `README.md`
- `tests/split.test.js`
- `tests/e2e.cjs`
- `DESIGN.md`
- `PROJECT.md` (project notes)
