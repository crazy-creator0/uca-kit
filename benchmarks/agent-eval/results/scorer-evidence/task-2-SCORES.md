# Task 2 scores (trip splitter) — blind builds

Method: each build was served on its own port (python3 -m http.server, 127.0.0.1:8241/8576/8720/8808/8915/8998) and driven with Playwright + /usr/bin/google-chrome at 390x844 (mobile, touch). Everything was entered through the real screens, including all 200 expenses (no import or seeding). Expected balances and settlements came from my own code (`_scorer/run.cjs`: paise model, floor share plus 0..1 leftover paisa per uneven split, brute-force minimum payment count). All requests in the browser context were recorded, including service-worker requests. Logs: `_scorer/full-<build>.log`, `_scorer/result-<build>.json`.

Scenario (the same for every build): Asha, Ben, Chetan, Divya. Hotel 1200.00 (Asha paid, for all), Taxi 100.00 (Ben paid, for Asha/Ben/Chetan), Snacks 450.50 (Chetan paid, for Ben/Divya), Dinner 999.99 (Divya paid, for all). Then: edit Dinner to 800.00, delete Snacks, add Esha, Boat 500.00 (Esha paid, for Asha/Esha), try to remove Ben (who has a balance), mark Ben as left and then back, reload, go offline and reload, add Chai 60.00 while offline, reload while offline, try 4 bad inputs, add more expenses until there are 200 (random paise amounts and subsets, 5 people), time a 201st expense, reload.

| Build | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | Total |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| T2-241 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | **30** |
| T2-576 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | **30** |
| T2-720 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 1 | 2 | 2 | 2 | 2 | 2 | **29** |
| T2-808 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | **30** |
| T2-915 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | **30** |
| T2-998 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | **30** |

## Evidence by point (the same for all builds unless a build is named)

1. **Balances sum to zero.** After the 4 expenses, the Settle-up balances summed to exactly 0 at every one of about 12 checkpoints. They matched my bounds to the paisa: 241, 576, 720, 915 and 998 showed Asha 616.66, Ben −708.58, Chetan −132.83, Divya 224.75. 808 showed 616.68 / −708.59 / −132.83 / 224.74, because it gives the leftover paisa to a different person. That is still exact and still sums to 0.
2. **Split among some people only.** After Hotel and Taxi (Taxi for Asha, Ben and Chetan only), Divya was exactly −300.00 in every build, so the Taxi did not touch her. Snacks (for Ben and Divya) also matched my model.
3. **₹100.00 three ways.** From the balances, the derived shares were 33.34 / 33.33 / 33.33, adding to 100.00. 241, 576, 720, 915 and 998 gave the extra paisa to Asha; 808 gave it to Ben. The form previews showed the parts too. 808's preview only said "₹33.33 or ₹33.34 each".
4. **Settle-up.** At every checkpoint, I applied the on-screen "X pays Y ₹" lines to the balances and everyone reached exactly 0. The number of payments always equalled my brute-force minimum: 3 for 4 people, 4 for 5 people, including at 200 and 201 expenses.
5. **Edit.** Changing Dinner from 999.99 to 800.00 gave the expected balances (241: Asha 666.66, Ben −658.58, Chetan −82.83, Divya 74.75; 808 differs by its paisa rule). The sum stayed 0.
6. **Delete.** Deleting Snacks (after the confirm dialog) dropped the item count from 4 to 3. Balances became Asha 666.66, Ben −433.33, Chetan −533.33, Divya 300.00 (808: 666.67 / −433.34), as expected.
7. **Person added midway.** After adding Esha, the four earlier balances were byte-identical and Esha was 0.00. A later Boat expense for Asha and Esha only was correct.
8. **Removing someone with a balance.** No build shows a Remove button for Ben once he is in an expense. Remove appears only for unused people (verified on the People/Trip screen). "Left trip" kept Ben's −433.33 in balances and in settle-up, and the sum stayed 0. 241, 915, 998, 720 and 808 also showed a toast explaining what leaving means; 576 shows only a "left" tag.
9. **Reload and offline.** After a reload, the item count and balances were identical. With Playwright offline, a reload still opened the app. Chai 60.00 was added offline (balances correct) and was still there after a second offline reload (5 items).
10. **Phone width.** On every screen (setup, expenses with 1 and 200 items, edit form, settle-up, people), scrollWidth was 390 and no control sat outside the viewport. **T2-720 only:** after each save, the "Added … Undo" toast covers the "+ Add expense" button for about 4–7 s. Playwright reported that `<div id="toast">` intercepts pointer events, and every add-button click waited 4.0–7.1 s. That is why 720 scored Partly.
11. **Bad input.** Empty, "-50", "abc" and "nobody ticked" each showed a plain message. Examples: 241 "The amount cannot be negative." and 998 "Tick at least one person it was for." Each time the item count stayed 5 and the balances did not change. 808 rejects "-50" with "The amount must be more than zero". 576, 720, 915 and 998 reject it with their "use only numbers" message.
12. **200 expenses.** All 200 were entered through the UI. The list showed 200 items, the balances summed to 0 within my bounds, and settle-up cleared everyone in 4 payments, the minimum. Time from Save on the 201st expense until it showed on screen: 241 56 ms, 576 72 ms, 720 94 ms, 808 135 ms, 915 56 ms, 998 82 ms. After a reload there were 201 items with identical balances.
13. **No outside requests.** In every run, every request was to 127.0.0.1. None went to an external host. The code has no external URLs, no fetch/XHR, and no web fonts.
14. **Run instructions.**
    - 241, 808 and 915 have a README. Its `python3 -m http.server` worked, opening index.html directly via file:// worked, and the documented test commands passed when run in scratch copies: 241 12 unit tests and "All checks passed"; 808 money tests 9 passed and e2e 14 steps passed; 915 12 core tests and 37 browser checks passed.
    - 576, 720 and 998 have no README file. Their closing messages give instructions, and those worked: 576 opening index.html directly and its `node tests/settle.test.js` / `ui.test.js` (19/19; one run failed while 6 test suites ran in parallel, then 2 of 2 passed when run alone); 720 http.server plus `APP_URL` e2e (18/18) and the math test; 998 file:// open and `sh tests/run-all.sh` (44 passed).
15. **Closing messages.** I compared each "checked" claim with the files and my runs: test counts (241 33 checks, 576 19, 720 18, 808 14 steps, 915 37, 998 44); refusing 12.345, 0, abc, "450,50" and an empty amount (spot-checked in all builds, all refused with messages, no item added); offline use, persistence, editing, deleting, and someone joining or leaving; 200 expenses; and 100/3 → 33.34 + 33.33 + 33.33. I found no false checked-claim.

## Could not test / limits

- No real phones, Safari, or "Add to Home screen".
- No WhatsApp/share sheets.
- I did not exercise the backup/restore and damaged-storage recovery claims in point 15 myself. They are covered only by the builders' own e2e tests, which I re-ran and which passed.
- Offline was tested as a Playwright context set offline and then reloaded, not with a cold start in a new tab.
- Point 8: no build lets you remove a person with a balance, so the "silently disappears" path could not be triggered. The score is based on the button being absent, plus "Left trip" keeping the amounts.
- The builders' multi-tab and "two windows" claims were not independently tested.
