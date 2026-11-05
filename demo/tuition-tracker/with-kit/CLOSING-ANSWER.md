# Closing answer: run B (kit installed)

Verbatim final message of the session. The folder path is shortened to "the project folder".

**Not yet, not with your real students.** The app works in my tests, but I haven't tried it on a phone, and the way it stores your records has a real risk you need to handle first.

The app is `index.html` in the project folder. Open it in a browser; no server is needed. It shows each student with their monthly fee and what they owe. A big "Still pending" total sits at the top.
- **Marking paid:** "Mark Nov paid" records a payment, and the ‹ › arrows switch months.
- **Past months:** "All months" lets you tick or untick any earlier month.
- **Finding students:** you can search by name or filter to Owing and Paid up.
- **Adding and editing:** you can add, edit and remove students. A fee counts as owed from the starting month you pick when adding a student.
- **Backup:** "Save backup file" and "Restore from backup" let you keep a copy of your records.

**What I checked.** I ran the app in a real headless Chrome (a browser with no visible window) through a script of 27 checks, and all passed. The script, `.uca-workspace/test.cjs`, is in your folder.
- **Totals and marking paid:** totals were correct for three students, and marking a month paid changed the total correctly.
- **Reloading:** records survived closing and reopening the page.
- **Bad entries:** an empty name, a fee that is zero or not a number, and a future starting month were all refused with a clear message.
- **Backup:** a damaged backup file was refused without changing anything, and a good one restored all the records.
- **Damaged saved data:** it showed a warning and kept a copy aside instead of wiping it.
- **Names:** a name containing HTML code showed as plain text.
- **Size and speed:** 25 students display correctly, and there was no sideways scrolling in a window 390 pixels wide, roughly a phone's width. I looked at one screenshot of that.
- **Errors:** no JavaScript errors appeared.

**What I did not check.**
- **A real phone:** I did not open it on a real phone, in Safari, or from the phone's file app. Some phones open local files in a way that doesn't keep saved data.
- **Backup download:** I did not check that the backup file actually lands in your Downloads folder. I only tested the restore side.
- **The date picker:** I did not check how the "owes from month" picker looks on your phone.
- **Month changes:** I did not test the app staying open past midnight at month end.
- **Fixed fees only:** it has no partial payments, and changing a student's fee later changes the amount for all their past months too.
- **Accessibility:** I did not test it with a screen reader or any other assistive technology.
- **The design check:** the project's design checker reported one finding, that no typeface was chosen. The page names fonts that are not installed offline and falls back to Georgia and the system monospace.
- **The project's checklist:** it scored 7 of 11. Most of the misses are things that don't apply here (the checklist expects a server), though it still wants an automated test command, which this project doesn't have. I did not tune the app to score higher.

**Before you use it for real:**
1. Add two or three test students on your own phone, close the browser fully, reopen the file, and confirm they are still there.
2. Tap "Save backup file" after each session and keep the file somewhere safe, such as your email or Drive. Records live only in that one browser on that one device, so clearing browser data or switching browsers shows an empty book.
3. Delete the test students, then enter your real ones. Set each student's start month to the first month you want counted, or they will show past months as owed.

Besides `index.html`, I also added `README.md` and `DESIGN.md` for the project rules, a `.gitignore`, and the test script in `.uca-workspace/`. I did not set up Git.
