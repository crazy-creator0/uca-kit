# Task 3 (Snake): blind scores

Scripts: `run.cjs` (all checks, same for every build; `JUMPS=1 node run.cjs` runs the pause/resume jump re-check), `reduced-motion.cjs`, `summarize.py`.
Raw results: `raw/<build>.json`, `raw/pause-jumps.json`, `raw/reduced-motion-732.txt`, `summary.txt`. Screenshots: `shots/`, `montage-2-running.png`, `montage-7-mobile-playing.png`.

How the checks ran: headless Chrome 153 through Playwright 1.63. Each build was served from its own folder with `python3 -m http.server` on 127.0.0.1 (ports 8301 to 8306) and also opened as a `file://` page. Every input was a real Playwright key press, click or tap. Game state was read only through each build's own top-level variables (`snake`, `food`, `state`/`status`, `score`, `direction`, delay), so the script could steer and confirm results. An init script wrapped `OscillatorNode.start` to log each sound and the AudioContext state at that moment.

## 1. Table

| Build | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | Total |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| T3-203 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 1 | 2 | 29 |
| T3-513 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 30 |
| T3-658 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 1 | 2 | 29 |
| T3-678 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 1 | 2 | 29 |
| T3-732 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 1 | 2 | 29 |
| T3-878 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 30 |

## 2. Points where all six got the same result

- **1. Movement and arrows:** after Start, with no input, the head moved 5 cells right in 700 ms in every build. ArrowUp, ArrowLeft, ArrowDown and ArrowRight each turned the snake within two ticks (`up->up, left->left, down->down, right->right` for all six).
- **2. Growth and food:** across 20 foods in the session plus about 5 more after Restart, the script checked state on every poll. It found 0 violations in every build: food never on the snake or off the board, length +1 for each food, score up each time, food moved after each meal, and the `#score` text matched the score.
- **3. Wall and self:** driving straight into a wall gave state `over` with the head still inside the grid and a visible Game Over overlay. With length 7, three same-way turns on consecutive ticks ran the head into its own neck and gave `over` on the first attempt, with the overlay visible.
- **4. Title and score:** the `h1` innerText is "SNAKE GAME" in all six, and `#score` is visible and matched the game score after every meal.
- **5. Start, Restart, Game Over:** Start set the state to running and hid the overlay. Game Over showed a title ("GAME OVER" or "Game Over") with the score. Restart after Game Over, and Restart mid-game after 2 foods, both gave running, score 0, length 3, delay 150 and `#score` "0".
- **6. Pause and resume:** the Pause button, Space and P (658: Space only) all paused. The overlay showed Paused, the button read "Resume", and the head did not move for about 1 s. Resume continued play. Arrow keys while paused changed nothing. Mouse-click Pause then Space resumed correctly in all six (`afterSpace: running`).
- **7. Speed:** the median tick in the session was 150 ms at the first two scores. At the last two scores before 20 foods it was 82 ms (203), 100 ms (513, which steps up every 5 foods), 83 ms (658), 83 ms (678), 82 ms (732) and 72 ms (878). The internal delay was 70 ms after 20 foods (90 ms for 513).
- **8. No reverse:** a single Left while moving right was ignored. Four "Up+Left" and "Down+Right" presses within one tick each turned twice with no death. "Up+Down" within one tick went Up and did not reverse. The snake stayed alive in all six.
- **9. 390 px:** the phone check used a 390×844 viewport with touch (pointer: coarse and hover: none both matched). `scrollWidth` was 390, so nothing ran off the side. The board was 352 to 367 px wide. The d-pad was visible, with its bottom at 706 to 782 px, so the board, buttons and pad fit without scrolling. Tapping Start started the game, and tapping each d-pad arrow turned the snake in all six.
- **10. Sounds:** 1 oscillator start (or 2 for builds with two-tone blips) per food was logged, plus 1 to 3 at Game Over. The AudioContext state was `running` each time. Where a Sound button exists (203, 513, 732), turning it off gave 0 oscillators over one meal and one crash. The sounds were not listened to, because the test browser has no speakers.
- **11. Look:** every build has a dark page and board, a green snake and red food, with 12 to 14 px radius on the board and buttons (see `montage-2-running.png`). Smoothness: sampling the drawn head over consecutive frames inside one tick gave 8 increasing fractional positions in every build, for example 15.89, 16.02, 16.14 and so on. That is sliding, not jumping.
- **12. No libraries, opens directly:** no `http` or `@import` references are in any file, and no requests left 127.0.0.1. As `file://`, each build started, ate 2 foods, loaded its CSS and showed no page errors or non-file requests. The only console error was one 404 per load with no failing page request. It is most likely Chrome's automatic `/favicon.ico` request, and I ignored it.
- **13. Extras:** every build has at least 3 working extras, so all score 2 (details in section 3).
- **15. Closing message:** every functional claim I could test held up. For the exceptions, see section 4.

## 3. Points where builds differ

**13. Extras: same score, different extras (all tested):**
- 203: best score kept after reload (40 → 40), Sound On/Off (0 oscillators while off), WASD (`w` → up), Space or P to pause, Enter to start, auto-pause when the tab is hidden.
- 513: best kept after reload (50 → 50), Sound On/Off, WASD, Space or P, Enter, auto-pause, Speed display.
- 658: best kept after reload (4 → 4), Space to pause, Enter to start, auto-pause. There is no P key or WASD.
- 678: best kept after reload (4 → 4), Space or P, Enter, auto-pause, Speed display ("1.0x").
- 732: best kept after reload (40 → 40), Sound On/Off (button and M), Space or P, Enter, auto-pause, Speed display.
- 878: best kept after reload (4 → 4), Space or P, auto-pause. Enter does not start the game (state stayed `ready`), and there is no WASD or sound switch.

**14. Two-minute scripted session.** The session was the same for every build: click Start, then a bot steers to food with about 15% random safe turns. It pauses and resumes mid-tick at foods 4 and 12 (Space) and 8 and 16 (Pause button). After 20 foods it steers into a wall, clicks Restart, plays about 15 s more, and pauses with Space at the 2nd food. All six ate 20 foods with no deaths, no state violations and no page errors in 50 to 60 s, and all showed Game Over and restarted cleanly.
- **T3-203: 1.** After Restart was clicked with the mouse, pressing Space restarted the game instead of pausing it. In the session, the snake was sent back to length 3 mid-play: `pausedState: running`, focus on `restart-btn`, bot log "length jumped 5->3". A separate check (click Restart, wait 400 ms, press Space) also restarted: the head went back from x=12 to x=10 and the state stayed `running`. The other five paused correctly in the same check.
- **T3-513: 2.** No bug found. The drawn head stayed still at pause (0.00 cell in all 10 trials) and moved slightly forward at resume (+0.08 to +0.21).
- **T3-658: 1.** The snake visibly jumps at pause and at resume. Over 10 straight-line trials (Space at points spread across a tick), the drawn head jumped forward 0.17 to 0.83 cell at the moment of pause, then jumped back 0.88 to 1.00 cell at resume. The session showed the same (−0.79 to −1.00 at every resume).
- **T3-678: 1.** The same snap, smaller. At pause it jumped forward 0.32 to 0.89 cell, and at resume back 0.12 to 0.77 cell (10 trials, 9 valid). The session showed resume jumps of −0.08 to −0.36.
- **T3-732: 1.** The same snap. At pause it jumped forward 0.25 to 0.80 cell, and at resume back 0.13 to 0.68 cell (10 trials). The session showed resume jumps of −0.04 to −0.42.
- **T3-878: 2.** No bug found. Pause gave 0.00 in all 10 trials, and resume gave +0.08 to +0.25. One session resume read −0.25, but the 10 clean trials did not repeat it, so I treated it as measurement noise.

## 4. Judgement calls

- **Point 14, the pause/resume snap (658, 678, 732):** I counted a visible jump of the snake on pause and resume as a bug found in the session, because the session is meant to test pausing mid-move. It is a drawing glitch only, and the game logic is correct. Scored as Partly (1). If a drawing-only glitch is not counted, each of these three gets 2 (total 30).
- **Point 14, Space after clicking Restart (203):** the bug only appears when the Restart button still has focus after a mouse click. It still wiped a game in the scripted session, so I scored it Partly (1). A strict reading (a progress-losing bug) would give 0 (total 28). A lenient one (a focus edge case) would give 2 (total 30).
- **Point 15, 203:** the closing says "Space pauses and resumes", but after a mouse click on Restart, Space restarts instead. I kept 2 because the claim holds in normal use, and I already took the point off under 14. A strict reading gives 1.
- **Point 15, 732:** the closing says the game "skips the animations" when the computer is set to reduce motion. With `reducedMotion: 'reduce'`, the CSS animations and food pulse stopped, but the snake still slid between cells (head at 10.93, 11.14, 11.27, 11.48 cells…). I kept 2 because most animations are skipped. A strict reading gives 1.
- **Point 13, 878:** auto-pause could not be triggered by a real tab switch in headless Chrome, so for every build I faked it by forcing `document.hidden`, then sending `blur` and `visibilitychange`. All six paused. Without that check, 878 has only 2 verified extras (best score and pause key), which drops it to 1 (total 29). The other five keep at least 3 extras either way.
- **Point 9:** the phone was emulated with touch (pointer: coarse). Builds 513, 678, 732 and 878 show the d-pad only on touch screens, so a desktop window narrowed to 390 px with a mouse has no on-screen arrows there. 203 and 658 also show it at 600 px or narrower. I scored this as a phone and gave all six 2.
- **Point 10:** sound is judged by the oscillators the page started, with the AudioContext `running`. I did not listen to it.
- **Point 7:** 513 speeds up every 5 foods instead of every food. It still speeds up as the score rises, so it got 2.
- **Point 5:** 732 has no Start Game button outside the board, only the one on the board's overlay. Since a Start Game button exists and works, it got 2.
