I built the app and tested it. All the tests I wrote pass. The settle-up amounts can be trusted for the cases I checked, which are listed below. I have not tried it on a real phone.

## What you have
The app is in `<project folder>/`. Open `index.html`.

- **Add expense:** type the amount, tap who paid, and tick who it was for. "Everyone" is ticked by default, and you can untick anyone. Before you save, it shows what each person's share will be.
- **Settle up:** shows who pays whom, using the fewest payments possible, plus each person's total paid, their share, and their balance. "Mark as paid" records a payback. "Share with the group" sends the summary to WhatsApp, since only one phone keeps the list.
- **People:** you can add someone partway through the trip. A new person only shares in expenses they're ticked on. If you tap "Has left the trip", that person is no longer ticked on new expenses, but their balance stays and they still appear in Settle up.
- **Saving:**
  - Every change is saved on the phone straight away, and the app checks that the save worked. If it ever fails, a red warning appears.
  - Delete has an Undo button.
  - A half-typed expense survives the app being closed.
  - Without internet, the app still opens and saves once it has been opened online one time.
  - "Save backup file" or "Send backup" creates a file. If the phone is lost, that file can be loaded on any phone.
  - Starting a new trip or loading a backup keeps the old trip under "Earlier copies".

**Choices I made:**
- Costs are split equally among the people ticked. There are no custom or unequal shares.
- If a bill doesn't divide evenly, the leftover paise go to the first names in the list, at most 1 paisa each per bill.
- The app asks for confirmation if you type ₹1,00,000 or more.

## Can we trust the settle-up amounts?

**What I checked, by running it:**
1. **The maths on its own:** about 117,000 automated checks, covering:
   - Amount entry: "19.99", "1,234.50" and "₹ 99.99" are read correctly, while "12.345", "0", "-5" and "abc" are refused. Money is stored in whole paise, so there are no rounding errors.
   - A trip worked out by hand.
   - 3,000 random trips with 2 to 9 people and up to 40 expenses. In every trip, each bill's shares added up to the exact bill, paid and owed balanced to the paisa, and the suggested payments brought everyone to exactly zero.
   - The number of payments always matched the true minimum, which a separate slower method found by trying every possibility.
2. **The real app in headless Chrome at phone size,** used the way a person would. All 19 checks passed:
   - The hand example showed exactly "Kiran pays Asha ₹1,300.00, Priya pays Asha ₹1,233.33, Ravi pays Asha ₹433.33".
   - After someone joined, someone left, an expense was edited, and the trip reached more than 200 expenses, the payments on screen still settled everyone exactly. I confirmed this with maths written separately from the app's own.
   - The app worked with internet switched off, kept data after reloads, brought back a half-typed expense, and restored identical data from a backup file. It refused a wrong file, kept both entries when two windows added at once, and said "All square" after everything was marked paid.
   - There were no browser errors.

**What I did not check:**
- **Real phones:** I didn't test on an actual Android or iPhone, Safari, or with "Add to Home screen".
- **Sending and sharing:** I didn't test the WhatsApp share or "Send backup" buttons, because headless Chrome can't do that.
- **Browser clearing data:** I didn't test whether a phone's browser deletes saved data over time. iPhones in particular can clear it for sites that aren't added to the home screen and haven't been used for a while. That's why the backup file matters: save one each evening.
- **Groups over 16:** if more than 16 people have a balance, the app switches to a quicker method that still settles everyone exactly but might use one or two more payments than strictly needed. Only the "settles exactly" part was tested there.

**One thing you'll need to do:** to use this on phones, someone has to put the folder on a free web host once (for example GitHub Pages or Netlify). Opening it from a phone's files won't give you the no-internet mode. I couldn't do that step from here.

To re-run the tests: `node tests/settle.test.js` and `node tests/ui.test.js`.
