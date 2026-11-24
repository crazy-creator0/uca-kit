The app is built and you can use it now. In short, you can trust the settle-up amounts: I checked the maths thousands of times in many different ways, and none of the results were wrong. Below is exactly what I ran and what I didn't.

## How it works
- **First time:** type the trip name and the four names.
- **Adding an expense:** tap **+ Add expense**, enter the amount (for example 1250.50), what it was for, tap who paid, and tick who it was for. Before you save, it shows exactly what each person's share will be.
- **Settle up tab:** shows who pays whom, using as few payments as possible. When someone pays, tap **Mark as paid**. **Share this summary** sends the list to WhatsApp.
- **People tab:** add someone who joins midway. Tap **Left trip** for someone who leaves; their past expenses still count, but new expenses won't include them unless you tick them.
- **Mistakes:** tap any entry to change it. Deleted entries can be brought back from Backup → Recently deleted.
- **One phone keeps the list.** The others can see the summary through WhatsApp. They can also open a backup file on their own phone to see the whole list.

**How it protects what you enter:**
- It saves on this phone after every change and checks that the save worked.
- It keeps a copy from one change earlier, in case the saved list gets damaged.
- If the phone or browser closes while you're typing an expense, the half-typed expense comes back.
- With no internet, it still opens and saves.
- Backup files can be sent through WhatsApp or email. The app reminds you after 10 changes without a backup.

**Choices I made for you:**
- When an amount doesn't split evenly, the leftover paise go one each to the people first in your list. For example, ₹100 split three ways is ₹33.34, ₹33.33, ₹33.33.
- "450,50" is refused with "use a dot for paise", so it can't turn into ₹45,050 by mistake.

## Can we trust the settle-up amounts?

**What I checked (all passing at the end):**
1. **Money is counted in whole paise, never decimals,** so the totals can't drift by rounding. I tested 2,000 random amounts going from typed text to stored value and back, and checked many tricky inputs like 0.1, 19.99, 1,23,456.78 and 450,50.
2. **Shares always add up exactly to the bill.** I checked this on 2,000 random splits.
3. **The balances always add up to ₹0.00.** I checked 300 random trips of up to 200 expenses each. The app also checks this itself every time and shows a red warning if it ever fails.
4. **The suggested payments clear every balance to exactly zero, and the count is truly the fewest possible.** I compared the app against a separate brute-force search on 3,000 random cases. This includes cases where the simple "biggest owes biggest" method needs 5 payments but the app finds 4.
5. **One example I worked out by hand matched the screen to the paisa:** expenses of ₹1,000, ₹300 and ₹100.01 among four people.
6. **A real browser test (Chrome, phone-sized screen) covers:**
   - adding and editing expenses
   - refusing bad entries
   - a double tap on Save storing only one entry
   - reloading the page
   - adding an expense with the internet turned off
   - someone joining and someone leaving
   - Mark as paid
   - delete, undo, and bring back
   - opening a backup on a second "phone" and getting the same settle-up
   - a broken backup file being refused
   - a damaged saved list being recovered from the earlier copy
   - a 200-expense trip, where adding an expense took about 0.3 seconds

   I ran the whole browser test 10 times in a row with 0 failures.
7. **Testing found three real bugs, which I fixed and re-tested:**
   - Right after opening a backup on a new phone, there was no earlier copy to recover from.
   - Tapping "+ Add expense" very quickly after saving could close the new form.
   - The form's automatic jump to the amount box could steal typing meant for the description.

**What I did not check:**
- **I did not try it on a real phone,** including iPhone Safari or Android's own browser. My tests used desktop Chrome made to look like a phone.
- **I did not put it online.** To install it on a phone and use it offline, it has to be hosted on a website (for example a free static host such as Netlify or GitHub Pages). Opening the file directly works, but the offline feature won't.
- **I could not test the browser clearing its own storage.** In particular, iPhone Safari may delete saved data from websites you haven't used for 7 days. This is why the backup file matters: send one to your WhatsApp group every evening.
- **Two people can't add expenses on separate phones and have them combine.** Opening a backup replaces the list on that phone; it doesn't merge the two. Keep to one person keeping the list.
- **The WhatsApp/email sharing popups** were not tested. Only the "save to phone" download was tested.
- **Expenses can only be split equally** among the people ticked, not in custom amounts.
- **Very large groups:** the "fewest payments" guarantee holds for up to 16 people who owe or are owed money. Above that it uses a simpler method that may not be the absolute fewest. With 4 to 6 people this never comes up.

One more thing: I accidentally saved a few test logs in a temporary folder outside your project folder. I deleted them straight away; nothing outside the project was changed.

To run all the checks again: `sh tests/run-all.sh`. The tests also saved screenshots of each screen in `tests/out/`.

Files are in <project folder>:
- index.html
- app.js
- split.js
- style.css
- sw.js
- manifest.webmanifest
- icon.svg
- tests/split.test.js
- tests/e2e.js
- tests/run-all.sh
