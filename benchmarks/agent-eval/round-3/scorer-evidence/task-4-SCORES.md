# Task 4 (bakery) blind scores

Evidence comes from one Playwright script (`run.cjs`) run in the same way on all six builds. The script uses per-build selectors from `adapters.cjs`. It ran in headless Chrome at a 390x844 mobile viewport with touch. Each build was served on its own 127.0.0.1 port, and each was also opened as a file:// page. Raw output is in `out-<build>.log` and `out/<build>/results.json`, and screenshots are in `out/<build>/*.png`. Test date: 2026-11-25 (IST).

## 1. Table

| Build | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | Total |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| T4-448 | 2 | 2 | 2 | 2 | 2 | 2 | 1 | 1 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 28 |
| T4-615 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 1 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 29 |
| T4-722 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 1 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 29 |
| T4-829 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 1 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 29 |
| T4-837 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 1 | 2 | 2 | 2 | 2 | 2 | 2 | 1 | 28 |
| T4-917 | 2 | 2 | 2 | 2 | 1 | 2 | 2 | 1 | 1 | 2 | 2 | 2 | 2 | 2 | 2 | 27 |

## 2. Points where all six got the same result

- **1 (purpose):** Every build shows a bakery title (Bakery Orders, Cake Order Book, Cake Orders, My Bakery Orders, or a document title of Bakery Orders). Each empty screen tells the user to tap "+ New order" when a WhatsApp order comes in.
- **2 (add):** The script added 5 orders (customer, item, date, time, price, paid). All 5 saved and showed on the list with name, item and price or balance.
- **3 (edit/delete):** The script edited Dev Patel's price from 600 to 650; the list then showed 550 to collect. It deleted Esha Nair after a confirm dialog, and she was still gone after a reload.
- **4 (due today/week, sorted):** The orders were entered in date order +3, +1, 0, +6, +20 days. All builds listed them as Chen (today), Bilal (tomorrow), Asha, Dev, Esha, with Today and Tomorrow headings. With 50 orders, every build's list was in date order.
- **6 (persistence/offline):** All 5 orders were still there after a reload. With the browser set offline after loading, a new order could still be added and shown. On file://, an order survived a reload and an offline reload. No build has a service worker, so this point rests on there being no network calls (see judgement calls).
- **8 (bad input):** Every build blocks a missing name with a message. No build warns about a date in the past: "Past Pat" with a date 3 days ago saved silently and showed as late or overdue. Builds differ on negative prices (see section 3). All six score Partly.
- **10 (export/share):** Every build has per-order WhatsApp buttons (wa.me links) with a ready-written message: item, writing on the cake, date and balance. No build has CSV or print.
- **11 (backup):** Every build's "Save backup file" produced a JSON download holding 4 orders. Restoring it into a fresh browser profile brought back the orders (3 still open). Every build has written text saying the orders live only on this phone. Every build refused a bad file with a message (alert or text on the page).
- **12 (outside requests):** The page request log, over both http and file://, had no request to any host except 127.0.0.1 or file, data and blob URLs. The only 404 was the browser's automatic request for /favicon.ico on the local server.
- **13 (extras):** Every build tracks an advance or "paid so far" with a balance, has a WhatsApp link with the customer's number (wa.me/919876543210), stores and shows the cake writing and notes, and has a Tomorrow grouping. That is 3 or more extras each, so 2 points. No build has a tel: link.
- **14 (50 orders):** Each build had 50 orders added through its form, with 0 failures (about 40 to 60 s for all 50). All 50 showed, in sorted order. A reload with rendering took 0.3 to 0.55 s. Where a search box exists on the main list, searching "Cust17" returned 1 card. Where an overall unpaid total exists, it was 21,270, which matches the expected 21,270. No JS errors.

## 3. Points where builds differ

**Point 5 (paid/delivered, unpaid total).** The script marked Bilal (800 owed) as paid and Chen (fully paid) as delivered, then read the unpaid total. Expected: 4,000 before, 3,200 after.
- T4-448: The Money tab showed "Waiting for payment · 4,000", then "· 3,200". Chen left the To make list. Score 2.
- T4-615: The summary showed "Still to collect: 4,000", then "3,200". Delivery used the Start baking, Mark ready and Mark picked up buttons. Score 2.
- T4-722: The week line showed "₹4,000 still to collect", then "₹3,200". Chen moved to Finished. Score 2.
- T4-829: The Money tab showed "Who still owes me (4) · 4,000", then "(3) · 3,200". Score 2.
- T4-837: The summary showed "Still to collect: 4,000", then "3,200". Delivery used Start baking, Mark ready and Mark handed over. Score 2.
- T4-917: Marking paid and collected works. The Money screen shows only this week's and this month's "Still to collect" (1,500, then 700) and a per-customer list of who owes. There is no overall total. The real outstanding amount was 3,200 (21,270 in the 50-order run, against 3,840 for the week and 4,790 for the month). Score 1.

**Point 7 (phone, 390 px).** No build scrolls sideways (scrollWidth 390 on every screen tested). The script measured visible controls under 40 px tall.
- T4-448: 9 of 17 controls on the order detail screen are under 40 px: "‹ Back to orders" is 32 px, and the four status steps and the Edit, Copy, Cancel and Delete buttons are 37 px. The list filter chips are 39 px. The inline "More" link is 17 px. Score 1.
- T4-615, T4-722, T4-829: No controls under 40 px on the list, form or detail screens. Score 2.
- T4-837: Only the "Paid in full" button on each card is under 40 px (36 px). Score 2.
- T4-917: Only "← Back" (34 px) and the banner link "Save a backup copy" (19 px). Score 2.

**Point 8 (bad input), negative price -500.** All six score 1.
- T4-448: Blocked by the browser's own check: "Value must be greater than or equal to 0."
- T4-615: Blocked with "Write the price as a number, like 1200."
- T4-722: Blocked with "Write the price as a number, like 1200."
- T4-829: The header "Save" button saved the order with price -500, and the card shows it as "Paid". The bottom "Save order" button blocks it with the browser's own check.
- T4-837: Saved silently as a price of 500, because the minus sign is stripped. No message.
- T4-917: Saved silently with price -500. The money line is hidden.

**Point 9 (search by customer).**
- T4-448, 615, 722, 829, 837: Searching "asha" returned only Asha's order, and "Khan" returned only Bilal's. Score 2.
- T4-917: The main Orders screen has no search box. Only the Done screen has one: searching "chen" found the collected order. Score 1.

**Point 15 (closing message).**
- T4-448, 615, 722, 829, 917: The features they describe matched what I saw: the groupings, the money screens, the backup reminder, the required fields, and, for 917, search on the Done screen only and money for week and month. Score 2.
- T4-837: The message says its tests covered "wrong amounts … each giving a plain message". A price of -500 gave no message and was silently saved as 500. The rest matched what I saw. Score 1.

## 4. Judgement calls

- **Point 6:** No build has a service worker, so reloading offline from a web address would fail. I scored 2 because the app makes no network calls after loading and works offline from file://. If a service worker is required, all six drop to 1 (each total −1).
- **Point 8:** No build warns about a date in the past, so none can be Right. A build that handles at least one bad input gets Partly. A stricter reading that also needs a clear negative-price message would put T4-829, T4-837 and T4-917 at 0 (each −1).
- **Point 7:** The cut-off is 40 px. Under a 44 px rule, other builds would also lose points. Under a "nothing under 36 px except text links" rule, T4-448 would get 2 (+1).
- **Point 5, T4-917:** I treated totals for this week and month only as Partly, because they understate what is owed. If period totals count, it gets 2 (+1).
- **Point 15, T4-837:** If "wrong amounts" means only text that is not a number, which the build does catch, it gets 2 (+1).
- **Point 10:** WhatsApp text counts as share, as the rubric lists it. All builds get 2 on that alone.
