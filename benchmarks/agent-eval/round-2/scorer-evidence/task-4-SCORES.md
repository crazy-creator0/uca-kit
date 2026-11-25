# Task 4 (bakery) scores

All six builds were run in headless Chrome with Playwright at 390x844 (mobile, touch, timezone Asia/Kolkata, "today" = 2026-11-25). Each was served with python3 http.server on 127.0.0.1:8701-8706. Script: _scorer/run.js; logs: _scorer/out-<id>.json.
All 50 extra orders were added by tapping through the form, not seeded.

| Build | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | Total |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| T4-137 | 2 | 2 | 2 | 2 | 2 | 1 | 2 | 1 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | **28** |
| T4-285 | 2 | 2 | 1 | 2 | 2 | 1 | 1 | 1 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | **26** |
| T4-506 | 2 | 2 | 1 | 2 | 2 | 1 | 1 | 1 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | **26** |
| T4-591 | 2 | 2 | 2 | 2 | 2 | 1 | 1 | 1 | 0 | 2 | 2 | 2 | 2 | 2 | 2 | **25** |
| T4-633 | 2 | 2 | 1 | 2 | 2 | 1 | 2 | 1 | 0 | 2 | 2 | 2 | 2 | 2 | 2 | **25** |
| T4-784 | 2 | 2 | 1 | 2 | 2 | 1 | 1 | 1 | 0 | 2 | 2 | 2 | 2 | 2 | 2 | **24** |

## Notes that apply to every build
- P1: every app is titled as a bakery order book (title or h1 "Bakery Order Book" / "Bakery Orders" / "My Bakery Orders"), and every closing message explains in plain words that it tracks WhatsApp cake orders. 2.
- P2: in every app I added all 5 orders through the form, and each was stored and shown. 2.
- P4: every app sorts orders by date and shows Today/Tomorrow labels, plus a 7-day count or a This week view. 2.
- P6: in every app the data was still there after a normal reload. None has a service worker, so a reload while offline failed with net::ERR_INTERNET_DISCONNECTED in all six. 1.
- P8: in every app, an order with no name and an order with a negative price were blocked with a message. A past due date (3 days ago) was accepted silently in all six. 1.
- P10: every app has a per-order WhatsApp link that fills in a message (it was never requested, only an href), and a JSON backup download that worked. 2.
- P11: in every app, Save backup downloaded a file. I then added a test order and restored the file; after a confirm step, the orders went back to the backup's 5. Every app also warns that data is kept on this phone only. 2.
- P12: every app made requests only to 127.0.0.1 (7 or 19 requests). No requests went anywhere else. 2.
- P14: in every app, 50 orders added through the UI were all stored. One more add took about 200-230 ms from tapping Save to the list redrawing, and a reload with 56 orders took under 100 ms. The "still to collect" totals matched my own hand calculation. 2.

## Evidence per build
**T4-137**
- P3: editing (price 600 to 650) saved. Delete asked to confirm, then removed the order. 2.
- P5: the "Collected" step worked, and the total to collect dropped from 3,950 to 2,750. 2.
- P7: no tap target under 40 px and no sideways scroll. 2.
- P8: shows its own messages, "Please fill in: customer name." and "Price and advance must be numbers, 0 or more."
- P9: searching "meera" left 1 card. 2.
- P15: everything it says it checked held up in my runs (blank-field warning, add, Baking step, totals, WhatsApp link, reload). Its tests/app.test.cjs ran in a copy with no errors. 2.

**T4-285**
- P3: BUG. The Edit form opens with the cake field empty, because the code uses form.elements['item'], which returns the collection's item() method instead of the input. Save is then blocked by the browser's required-field bubble until the cake is typed again. Delete (on the card, with a confirm) worked. 1.
- P5: Mark Baking, Ready and Delivered worked, and the total went from 3,950 to 2,750. 2.
- P7: tabs are 39 px and card buttons 36-37 px. Backup buttons are 33 px. 1.
- P8: only the browser's own bubbles ("Please fill out this field.", "Value must be greater than or equal to 0.").
- P9: search works (1 result for "meera"). 2.
- P15: the claims (add, status change, totals, reload) are true. 2.

**T4-506**
- P3: same cake-field bug as T4-285. The first save shows "Please fill in: what cake." and saving works after retyping. Delete with a confirm worked. 1.
- P5: "Mark paid" and the status buttons worked. The total went from ₹3,950 to ₹2,750, and there is an Owed tab. 2.
- P7: card buttons are 36 px. 1.
- P9: search works, and it searches every tab. 2.
- P15: the claims are true. In a copy, npm test passed with all 11 checks "ok". 2.

**T4-591**
- P3: editing worked: it uses namedItem, so the cake field kept its value. Delete with a confirm worked. 2.
- P5: Delivered via the Mark buttons, a "Fully paid" checkbox, and a total to collect. Delivered orders that are still unpaid stay in the total, which is correct. 2.
- P7: Backup button 34 px, tabs 39 px, card buttons 36-40 px. 1.
- P9: no search box. The only filters are status tabs. 0.
- P15: its claims (add, Baking, edit, reopen) are true. 2.

**T4-633**
- P3: same cake-field bug, with the message "Please fill in: what they ordered." Delete worked. 1.
- P5: the Mark buttons go up to Delivered, which sets it to paid. The total went from 3,950 to 2,750. 2.
- P7: everything is at least 40 px except the native file input, whose visible label is the button. 2.
- P9: no search or customer filter. 0.
- P15: the claims are true, and npm test printed "All checks passed" in a copy. 2.

**T4-784**
- P3: same cake-field bug (browser bubble). Delete with a confirm worked. 1.
- P5: Mark buttons up to Delivered, and the total went from 3,950 to 2,750. To mark something paid you have to edit the advance. The total only counts the tab you are looking at. 2.
- P7: card buttons 35-37 px. 1.
- P9: no search box. 0.
- P15: the claims (add, Baking, reload, no errors) are true. 2.

## Extras seen working (P13)
- T4-137: advance/balance, WhatsApp link with a filled-in confirm or "ready" message, its own cake-message field (shown highlighted), notes, order stages, Overdue/Today/Tomorrow grouping. 2.
- T4-285: advance/balance, WhatsApp link with the balance in the message, stages, a "⚠ Late" mark (seen), details/notes. 2.
- T4-506: advance/balance, Mark paid and the Owed tab, WhatsApp link, a cake-message field, stages, pickup or delivery, Today/Tomorrow groups. 2.
- T4-591: advance, Fully paid checkbox, WhatsApp link (the message always says "ready"), stages, a "(late!)" mark (seen), red Today/Tomorrow. 2.
- T4-633: advance, WhatsApp link with the balance, a cake-message field, 5 stages, pickup or delivery, Today/Tomorrow/Overdue groups. 2.
- T4-784: advance/balance, WhatsApp link, stages, red Today/Tomorrow, cake message stored in a combined details field. 2.

## What I could not test
- A real phone, whether the WhatsApp app actually opens, and file pickers on a phone (restore was done with Playwright's setInputFiles after opening the app's backup screen).
- Offline use after installing the app to the home screen. None of the builds has a service worker, so that case cannot be rescued.
- Quality-checklist scores quoted in the closing messages ("25 of 25" and similar) could not be checked.
- I ran the builders' own tests only in copies under _scorer (since deleted). T4-137's test prints its output rather than asserting.
