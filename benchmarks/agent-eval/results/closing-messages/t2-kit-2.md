Your Trip Split app is ready in `<project folder>`. Open `index.html`, or run `python3 -m http.server 8000` in that folder and go to http://localhost:8000.

## What you get
- **People:** add the four of you. You can add someone who joins later. Tap "Has left" when someone leaves: they stay in the totals but aren't ticked for new expenses.
- **Expenses:** tap "+ Add expense", type the amount (like `450.50`), pick who paid and who it was for. Everyone still on the trip is ticked to start with. Before you save, it shows something like "₹1,200.00 split between 4 people: ₹300.00 each." Tap any expense to change or delete it.
- **Settle up:** a list like "Neha pays Asha ₹1,199.75", using the fewest payments possible. You can share it to your group chat, and "Mark as paid" records a payment once it's done.
- **Backup:** "Save backup file" puts a copy of the whole list in Downloads. "Restore from a backup file" brings it back on any phone.

**Choices I made for you:**
- Each expense is split equally among the people you pick. Custom amounts per person aren't built yet.
- One trip at a time.
- The list lives only on the phone of the person who keeps it. There is no syncing between phones; the others get the settle-up list as a message.
- The look is a plain "money ledger": paper-coloured background, figures in neat columns, big buttons for thumbs.

**Protecting what you enter:**
- Every change is saved the moment you tap Save, and the app reads it back to confirm.
- The app keeps the save before the latest one. If the latest is ever damaged, it opens the earlier one and keeps the damaged copy aside.
- Deleted expenses go to "Recently deleted", where you can restore them.
- A red warning appears if the phone refuses to save.

## Can we trust the settle-up amounts?

Largely yes, based on the tests below, which I actually ran. They all pass now. Three tests failed at first, but each time the mistake was in my test, not in the app's maths.

**What I checked:**
- **A worked example by hand.** Asha paid ₹4,000 for all 4, Rahul ₹1,500 for 3, and Neha ₹600.50 for 2. By hand: Neha pays Asha ₹1,199.75 and Vikram pays Asha ₹1,800.25. The app gave exactly that, both in the maths code and on screen.
- **Fewest payments.** I compared the app's payment list against a separate brute-force method on 3,000 random groups of 2 to 8 people. Every time, the number of payments was the smallest possible and everyone ended at exactly ₹0.
- **Paise rounding.** Over 5,000 random splits, the shares always added up to the exact amount, and no two shares differed by more than 1 paisa (₹100 for 3 people becomes 33.33 + 33.33 + 33.34).
- **Using the app like you would.** In a phone-sized browser, a script entered over 200 expenses with people joining and leaving. The balances shown stayed within about 7 paise of exact maths, and the suggested payments cleared everyone's balance exactly.
- **Everything else on screen.**
  - Entries survive closing and reopening the page.
  - The app works with the internet switched off.
  - Bad amounts are refused: `12.345`, `abc`, `0` and an empty box.
  - Undo and restore work after deleting.
  - A backup file restores an identical list in a fresh browser, and a damaged backup file is refused without changing anything.
  - Nothing runs off the side of a 360px-wide screen.
- **Screenshots.** I looked at the screens myself. That caught a cramped per-person table, which I redesigned and retested. I also re-added some numbers on a sample screen by hand and they matched.

**What I did not check:**
- **No real phone.** I only used desktop Chrome pretending to be a phone, not an actual iPhone or Android, and not Safari.
- **"Add to Home screen" and real offline use on a phone are untested.** The offline test ran in the same browser setup.
- **It isn't online yet.** To use it on your phone, the files have to be put on a website, for example a free host like GitHub Pages or Netlify. I didn't do that, and nothing on a real server was tested.
- **I didn't test the phone itself clearing data.** Clearing browser data, or Safari removing it after 7 days unused (this can happen if you don't add the app to the Home screen), will erase the list. Only backup files protect against that. Please save one each evening and send it to a friend.
- **Two-person mix-ups aren't covered.** If two people both keep lists, the app can't merge them. Only one list counts.
- **Very large groups.** With more than 16 people who owe or are owed money, the payment list is still correct but may not be the very shortest. Your group is nowhere near that.

**Readiness:** the kit's readiness checklist scores 26 of 26 (Gold). That is a static checklist, not proof the app is perfect.

**Next step:** put the files on a free host, open it on the list-keeper's phone, add it to the Home screen, and try one test expense with the internet off.

Files are in `<project folder>`:
- `index.html`
- `app.js`
- `money.js`
- `style.css`
- `sw.js`
- `README.md`
- `DESIGN.md`
- `PROJECT.md`
- `tests/money.test.js`
- `tests/e2e.test.js`
