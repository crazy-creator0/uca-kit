# Snake Game: done

**To play:** double-click `index.html`. It opens in your web browser and needs no install and no internet.

## What I built
- `index.html`: the page (title, score, board, buttons)
- `style.css`: the look (dark theme, green snake, red food, rounded corners, phone layout)
- `script.js`: the game, split into labelled sections (settings, game logic, drawing, sound, controls). The speed numbers sit at the top of the file if you want to tune them.

## Plan I followed (you weren't available, so these choices are mine)
- **Who / main task:** one player opens the file, presses Start, steers with the arrow keys, eats food, sees Game Over, and plays again.
- **Stack:** plain HTML, CSS and JavaScript in 3 files, with nothing to install. I drew the board on a `<canvas>` so the snake can slide smoothly between squares instead of jumping.
- **Rules:** 20×20 board. Each food is worth 10 points. Every 5 foods the speed level goes up by 1 (from 150 ms per step down to a 60 ms minimum).
- **Look:** near-black background (#0b0f14), green snake (#3fd46b) with eyes that face the way it moves, a red apple (#ff4d5e) that pops in and gently pulses, a 14px corner radius everywhere, and a soft checkerboard so you can judge distance. Fonts are ones already on your computer, so it works offline.
- **Extras I added:** a Best score that is saved in your browser, a Sound On/Off button, a Speed display, Space/P to pause, Enter to start, W/A/S/D as well as the arrows, on-screen arrow buttons and swipe control on phones, auto-pause when you switch browser tabs, a "You Win!" screen if you ever fill the whole board, and a board shake on Game Over.

All your requirements are covered: moving snake, arrow keys, growing, wall and self collision, random food, title, score, Start, Restart, Game Over message, Pause/Resume, increasing speed, no instant reverse, responsive layout, eat and game-over sounds, and no libraries.

## Checks (headless Chrome, real clicks and key presses)
- Page loads with the title, score 0 and the "Ready?" screen: **pass**
- Pressing ← while moving right is ignored: **pass**
- Eating food adds 10 points, and after 5 foods Speed shows 2: **pass**
- Hitting the right wall, the top wall, or its own body shows Game Over: **pass**
- Best score is kept, and Restart resets the score: **pass**
- Space pauses, the snake stays still for 3 seconds, and Resume continues: **pass**
- A fast ↑ then ← within one step doesn't kill the snake: **pass**
- Phone size (360px wide): no sideways scrolling, and the arrow buttons show and work: **pass**
- No errors in the browser console: **pass**
- I looked at screenshots of the desktop and phone layouts, and both look as intended.

**Two bugs found and fixed during testing:**
1. The game froze on its very first frame. The apple's pop-in size could go slightly negative, which the browser rejects. I clamped it, and that fixed the freeze.
2. After you clicked Restart with the mouse, pressing Space restarted the game again instead of pausing it. Buttons now give up focus after a mouse click, so Space always pauses. Keyboard-only users can still Tab to a button and press it.

## What I could not check
- **Sound:** the tests run without speakers, so I only confirmed the sound code runs without errors. I couldn't hear it. Please listen for a short "blip-blip" when the snake eats and a falling "buzz" when the game ends. Browsers only allow sound after your first click or key press, so the game turns sound on when you press Start.
- **Real phones and browsers:** I tested in Chrome only, at desktop and phone sizes. I didn't try a real phone, Safari or Firefox.

## Try it in one minute
1. Open `index.html` and click **Start Game**. The snake should slide right.
2. Eat a few apples. The score should go up by 10 each time and you should hear a blip.
3. Press **Space**. "Paused" should appear. Press it again to continue.
4. Steer into a wall. "Game Over" should show your score, and **Play Again** starts a new game.

## Notes
- I didn't use Git, as instructed. My two test scripts are in `.uca-workspace/` (re-run with `node .uca-workspace/play-test.cjs`). You can delete that folder; the game doesn't need it.
