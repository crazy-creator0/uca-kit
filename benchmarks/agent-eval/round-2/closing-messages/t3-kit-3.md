# Your Snake Game is ready

To play, open `index.html` in any web browser. Nothing needs to be installed.

## Plan (I chose these myself because you weren't available)
- **Who it's for:** anyone playing in a browser on a computer, phone or tablet.
- **How you play:** press Start Game (or Space), steer with the arrow keys, eat the red food to grow and score, and avoid the walls and your own body. When you lose, you see Game Over, then you can press Restart.
- **Extras:**
  - **Added:** best score (saved in your browser), a sound on/off button, Space to pause or resume, and on-screen arrow buttons on touch screens.
  - **Left out:** levels and themes.
- **Stack:** one HTML file, one CSS file and one JS file, as you asked. There are no libraries, and the sounds are made in code, so there are no audio files.

## Files
- `index.html` sets up the page: title, score, board, and the Start/Pause/Restart buttons.
- `style.css` holds the look: dark background, green snake, red food, rounded corners and smooth fades.
- `game.js` holds the game logic. It is split into labelled sections (Settings, Sound, Setup, Game loop, Drawing, Controls). To change the board size or speed, edit the numbers at the top.
- `screenshot.png` is a picture of the game from my test.

## Features
- The snake moves on its own, and you steer it with ↑ ↓ ← →. Pressing the opposite direction does nothing, so you can't turn straight back into yourself.
- The snake grows when it eats, and new food never appears on top of the snake.
- The game gets 5 ms faster with every food eaten, until it reaches a top speed.
- Sounds play when you eat and when the game ends. The game shows Pause/Resume and Game Over screens, and the score pops when it goes up.
- The layout adjusts to the screen size, and I checked that it fits a 375-pixel phone screen.

## How I checked it
I ran an automated test in headless Chrome:
- **Start:** works.
- **Pressing the reverse key:** ignored.
- **Eating:** the score went to 1 and the snake grew from 3 to 4.
- **Pause/Resume:** works.
- **Hitting the wall:** showed Game Over.
- **Restart:** works.
- **Phone layout:** fits.
- **Errors:** none in the browser's error log.

I did not listen to the sound, because the test browser has no speakers.

## What could go wrong
- Some browsers keep sound muted until you click something. Pressing Start counts as that click, so the sounds should work.
- If you play in a very old browser, rounded snake segments may not draw.

Note: I didn't use Git, as instructed. My test script was in a temporary file, and I have deleted it.
