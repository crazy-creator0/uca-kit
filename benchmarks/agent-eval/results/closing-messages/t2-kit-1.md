The Trip Split app is built in `<project folder>`. To open it, run `python3 -m http.server 8000` in that folder, then go to http://localhost:8000.

**What it does**
- **People:** add the four of you first. Anyone can be added later, or marked **Left trip**. New expenses then leave them out by default, but their old expenses still count.
- **Add expense:** type the amount (₹1,250.50, 1250.5 and similar all work), tap who paid, and tick who it was for. Everyone still on the trip is ticked to start with. Before you save, a line spells out the split, for example "Asha paid ₹2,400.00 for 3 people: ₹800.00 each".
- **Settle up:** shows "Priya pays Asha ₹4,433.34" and so on, plus each person's balance. **Mark as paid** records a payment, and **Share this list** sends the list to WhatsApp or SMS.
- **No internet:** once it has been opened with internet, it opens and saves without it.
- **Not losing data:** every change is saved on the phone straight away, along with a copy from one change earlier. Deleting asks first, offers Undo, and deleted expenses can be restored. You can save or load a backup file, and the app reminds you every 10 expenses.

**Choices I made for you:** the look is a plain paper-ledger style. Each expense is split equally among the people ticked, and there's no "Asha pays 70%" option. One phone keeps the list, and phones don't sync with each other.

**Can we trust the settle-up amounts? What I checked:**
- **Exact to the paisa:** all money is stored as whole paise, so there are no rounding errors. If ₹100 is split 3 ways, one person pays 1 paisa more, the form says who, and the parts always add up exactly. I checked this with 5,000 random splits.
- **A trip worked out by hand:** I calculated a 4-person trip on paper, including someone joining late and someone leaving, and the app showed exactly the same payments.
- **Fewest payments:** I compared the app's answer with a slow search that tries every possibility, on 3,000 random groups of 2 to 8 people. The app always matched the true minimum.
- **200 expenses:** I typed 200 expenses through the form in real Chrome on a phone-sized screen. Then I added up the balances with separate code, applied the payments shown on screen, and everyone came to exactly ₹0.00. The balance figures on screen matched too.
- **In the browser** (37 checks, all passing): it opens and saves with the internet off; an edit, a delete with Undo, and a restore all work; a backup file brings everything back after the phone's storage is wiped; a broken backup file is refused; a damaged saved list is recovered from the earlier copy; and two open tabs don't wipe each other's entries.
- **Bugs found and fixed while testing:**
  - The start screen stopped letting you add people after two names.
  - A damaged saved list could have overwritten its own recovery copy.
  - The balance table was too wide for a narrow phone.

**What I did not check:**
- I never ran it on a real phone, iPhone Safari, or a real WhatsApp share. All testing was in Chrome on a computer, pretending to be a 360px-wide phone.
- To work offline on a phone, the folder has to be put on an https website once, then added to the home screen. I haven't tried that step; the README explains it.
- If the phone is lost or the browser's data is cleared, the list is gone unless you saved a backup file. Please save one every day or two.
- With more than 16 people who owe or are owed money, it may suggest a few more payments than strictly needed. Your group of four is far below that.

The files you'd touch are `index.html`, `app.js` (screens and saving), `splitcore.js` (money rules), `sw.js` (offline) and `README.md`. The tests are `tests/core.test.js` (`node tests/core.test.js`) and `tests/browser.test.cjs` (`node tests/browser.test.cjs`). I didn't use Git, as instructed.
