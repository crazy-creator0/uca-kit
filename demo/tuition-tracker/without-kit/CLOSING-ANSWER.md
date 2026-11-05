# Closing answer: run A (empty folder)

Verbatim final message of the session. The folder path is shortened to "the project folder".

**Not quite yet.** I checked the logic and the main actions on my side, but I never opened it on a phone. Do a short trial first (steps below), then use it for real.

The app is one file, `index.html` in the project folder. Double-click it to open it in a browser. No server or internet is needed. It shows each student with what they owe, lets you mark months paid, and shows the total still pending.

**How it works**
- **Adding students:** "Add many students" lets you paste all 25 as lines like `Asha, 1200`. You can also add one at a time with "+ Add student". Each student has their own monthly fee and a "fees start from" month.
- **What counts as owed:** every month from the start month up to the current month, including this month, that isn't marked paid. Each unpaid month costs that student's fee.
- **Marking paid:** tap a student to open them. Each month is a red (unpaid) or green (paid) button, and a tap flips it. There is also a "Mark [month] paid" button for the oldest unpaid month.
- **Paid months and fee changes:** when you mark a month paid, the amount is recorded then. If you later change a student's fee, old paid months keep their amount, but unpaid months use the new fee.
- **Finding students:** you can search by name and filter to those who owe or are fully paid.
- **Backup:** "Save backup file" downloads your records, and "Restore backup" loads one back.
- **Currency:** the "Currency label" button adds a label such as Rs or $ before amounts.

**What I checked (actually run)**
- **Calculation logic:** I ran tests in Node. They covered months owed, total pending, a start month in the future (owes nothing), a student 13 months behind, and reading the pasted student list. A fee typed as "1,200" is rejected instead of being misread.
- **In a real browser engine:** I ran headless Chrome on the page.
  - Three students with fees 1200, 800 and 2000, starting in September, showed a pending total of 12,000, which is correct.
  - Marking one month paid dropped it to 10,800, which is correct.
  - The data was saved in the browser.
  - A name containing HTML code was shown as plain text and did not run.

**What I did not check**
- **Phone:** I did not test on a real phone or any phone browser. The layout is built to fit small screens, but I haven't seen it.
- **Opening the file on a phone:** I don't know whether your phone's browser will save data when the file is opened from your files app. Some phone browsers handle this badly. Try this first: add a test student, close the browser completely, reopen the file, and see if the student is still there. If it is gone, don't use it on that phone.
- **Backup and restore:** I did not test the backup download or the restore. The download on a phone is the part I'm least sure of.
- **Real use:** I did not test with your real data or over several months. I also did not test very large or odd entries, such as a fee outside 500–2000 (the app allows any number, so a typo won't be caught).
- **Buttons and pop-ups:** I called the app's functions directly in the test. I did not click through the add/edit pop-up forms, the confirmation pop-ups, or the delete button by hand.

**Two things to know**
- **Browser-only storage:** your records live only in that browser on that device. Clearing browsing data, using private mode, or switching phones can wipe them, and the phone and laptop will not share records. Save a backup file regularly, for example at the end of each month, and keep it somewhere safe.
- **Deleting a student:** it permanently removes their payment history.

**Before using it for real:** add 2–3 fake students, mark a month paid, close and reopen the file, and save a backup. If all of that works on your phone, enter your real students.
