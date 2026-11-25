# Task 3 (snake) scores: blind scorer

The same Playwright script (`test.js`) and probes (`probe3.js` tail-follow, `probe4.js` file:// open) were run on all six builds in headless Chrome. Each build was served on its own 127.0.0.1 port and also opened as a file. Raw results are in `T3-*.json`, and the 390 px screenshots are in `T3-*-390.png`. Scores: Right 2, Partly 1, Missing 0.

| Build | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | Total |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| T3-109 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | **30** |
| T3-350 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 1 | 2 | 2 | **29** |
| T3-422 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | **30** |
| T3-563 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 1 | 1 | 2 | **28** |
| T3-674 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | **30** |
| T3-964 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | **30** |

## Evidence that applies to all six builds (points where every build got the same result)
1. The snake stays still before Start. After Start the head moved every tick, and an arrow key turned it (the test pressed ArrowDown while it moved right, and it turned down).
2. After 5 food, length went from 3 to 8 and the score from 0 to 5. In the long session, a check on every tick never found food on the snake.
3. Driving into the wall showed Game Over with the head at x=0 or x=19. A tight 3-turn box at length 6 ran into the body and also showed Game Over.
4. The h1 reads "SNAKE GAME", and `#score` is visible.
5. Start begins the game. Game Over shows the score. Restart set the score to 0, hid the overlay, and the snake moved again. In T3-422, Start stays disabled after a game over, but Restart works.
6. The Pause button froze the snake for 800 ms, showed a "Paused" overlay and changed its label to "Resume". Resume moved the snake again.
7. The median tick was 150–156 ms at score 0 and 119–129 ms at score 5, for every build.
8. Six trials per build: while moving horizontally, a perpendicular key and then the reverse key were pressed 10 ms apart, at different points in the tick. The snake turned perpendicular in all 36 trials, and none ended the game.
9. At 390×844 with touch emulation, scrollWidth equalled clientWidth (390). Four on-screen arrow buttons were visible. Tapping Start started the game, and tapping an arrow turned the snake. At 390 px without touch emulation, only T3-109 and T3-674 show the arrows; the other four show them only on touch devices.
10. An AudioContext spy injected by the test script (`createOscillator().start`) recorded oscillator starts on the first eat (1 or 2) and on game over (1–3) in every build. I could not hear any sound.
11. All six have a dark radial-gradient page and a dark canvas with a 16–18 px radius, green rounded segments and red glowing food (checked in screenshots). None of them animates between cells; every build moves one cell per tick, so I treated all six the same here.
12. Each opened from file:// with no page errors and no requests outside the build's own files. There are no library or CDN references. The only console errors were favicon.ico 404s from the http server.

## Evidence that differs by build
- **13 (extras seen working):**
  - T3-109: 5 extras, so 2 points.
    - best score kept after reload (5 before, 5 after)
    - sound toggle (0 oscillators while muted, 1 when unmuted)
    - Space pause
    - swipe (a CDP touch swipe turned the snake)
    - Space starts the game
  - T3-350: 2 extras, so 1 point.
    - best score kept after reload
    - Space pause
  - T3-422: 4 extras, so 2 points.
    - best score kept after reload
    - sound toggle (0 muted, 1 unmuted)
    - Space pause
    - Space starts the game
  - T3-563: 2 extras, so 1 point.
    - best score kept after reload
    - Space pause
  - T3-674: 3 extras, so 2 points.
    - best score kept after reload
    - Space pause
    - Space starts the game
  - T3-964: 4 extras, so 2 points.
    - best score kept after reload
    - sound toggle (0 muted, 2 unmuted)
    - Space/P pause
    - swipe
  - No build has WASD (the test tried it).
- **14 (2-minute session):** It was 120 s of bot play with 15% random turns, a Pause/Resume click every 5th food, a forced wall death after 20 food, and Restart after every game over. The score was checked against length on every tick.

  | Build | Food eaten | Best game | Pauses | Restarts | Issues |
  |---|---|---|---|---|---|
  | T3-109 | 57 | 30 | 12 | 3 | none |
  | T3-350 | 67 | 26 | 14 | 4 | none |
  | T3-422 | 57 | 19 | 12 | 4 | none on the final run |
  | T3-563 | 62 | 26 | 13 | 5 | see below |
  | T3-674 | 52 | 24 | 11 | 3 | none |
  | T3-964 | 57 | 16 | 11 | 4 | none |

  - T3-422: one earlier run logged "resume click failed" twice. I could not reproduce it in 120 targeted pause/resume trials or in a full rerun, so I count it as a race in my harness (the game ended between my check and my click), not a bug in the build.
  - **T3-563 gets Partly.** The tail-follow step of the same fixed script (length-4 snake looping a 2×2 square) ended in "Game Over! Score: 1". The game treats the cell the tail is leaving as body: `script.js` checks `snake.some(...)` against the whole snake. The other five builds did not die on the same test.
- **15 (closing message):** every "checked/tested" claim matched my runs.
  - T3-109 and T3-964: their `.work/test.cjs` and screenshots exist and match what they claim.
  - T3-422: `screenshot.png` exists.
  - T3-350, T3-563 and T3-674: they claim start, eat, reverse-block, pause and wall Game Over, and all of these held in my runs.
  - I found no false claim. The redacted check count in T3-109 cannot be verified, so I did not count it.

## Not tested or limits
- I did not hear any sound. Point 10 rests on the oscillator spy.
- Swipe was tested with CDP touch events, not on a real phone.
- "Smooth movement" is a judgement; no build animates between cells.
- The "P to pause" check in my script gave false positives on builds without a P key, so I ignored it and counted any pause key once.
- The bot reads `snake`, `food` and `direction` (or `dir`) as globals through `page.evaluate`, and it played the same way on all builds.
- I did not check "You Win" or full-board behaviour.
