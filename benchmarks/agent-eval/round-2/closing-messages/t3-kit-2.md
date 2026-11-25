# Your Snake Game is ready

**How to play:** open `snake-game/index.html` in any browser (just double-click it). Press **Start Game**, steer with the arrow keys, eat the red food.

## What I built
- `snake-game/index.html`: the page (title, score, board, buttons)
- `snake-game/style.css`: dark, rounded, colorful look with small animations
- `snake-game/game.js`: game rules, drawing, controls and sounds, with comments
- `snake-game/README.md`: how to play
- `PROJECT.md`: the short plan I followed

Everything you listed is in: the snake moves on its own, arrow keys steer, it grows when it eats, walls and its own body end the game, and food appears in a random empty spot. There's a title, a score, Start, Restart, Pause/Resume (also Space or P), and a Game Over message. The game speeds up with each food, the snake can't turn straight back into itself, the layout fits phones, and beeps play when you eat and when you lose. It has a dark board, a green snake with eyes, glowing red food that pulses, and a score that pops when it goes up.

**Things I added (my choices):** a best score that the browser remembers, a sound on/off button, and swipe or on-screen arrow buttons for phones. Hitting a wall always ends the game; the snake doesn't come out the other side.

## Checks
- **Automated run in headless Chrome:** I started the game, it ate food (score went to 1, the snake got longer, speed went up), pressing the opposite arrow was ignored, pause and resume worked, hitting a wall showed "Game Over", Restart set the score back to 0, and there were no script errors.
- **Screenshots:** I looked at desktop and phone-width (375px) screenshots. Nothing overflows, and the arrow buttons show on the phone layout.
- **Kit checks:** the readiness check passed 19 of 21 (Bronze). The two that fail are "no test files or test command". I kept my test script in `.uca-workspace/` as scratch, so the target wasn't met. The design check flagged that colors aren't stored as variables and that the font is the system default. I picked the system font on purpose so it works offline.

## Not checked
- I couldn't hear the sounds in the headless browser. They use the browser's built-in audio and play after your first click.
- I didn't test on a real phone.

**Next step:** play a few rounds. If it feels too fast or too slow, change `START_DELAY` or `SPEED_STEP` at the top of `game.js`.
