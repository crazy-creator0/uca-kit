# Your Snake Game is ready

**To play:** double-click `index.html`. It opens in your web browser. You don't need to install anything or be online.

## What I built
Three files in your folder:
- `index.html`: the page (title, score bar, board and buttons)
- `style.css`: the look (colors are listed at the top so you can change them)
- `game.js`: the game itself, split into labeled sections (settings, logic, drawing, sound, controls)

You weren't available to answer questions, so I made these choices:
- **Look:** a dark green-black background, a green snake, red apples, rounded corners and bold "poster" style buttons with hard shadows. The "READY?", "PAUSED" and "GAME OVER" messages show up as tilted stickers that pop onto the board.
- **Board:** 20 x 20 squares. The snake slides smoothly between squares instead of jumping.
- **Speed:** each apple adds 10 points and makes the snake a little faster. It starts at 150 ms per move and never gets faster than 60 ms. The "Speed" box shows how much faster it is (1.0x, 1.1x and so on).
- **Font:** your computer's built-in font, so the game works offline with no downloads.

## Everything you asked for
Done: snake moves continuously; arrow-key controls; grows when it eats; ends on hitting a wall or itself; food appears at random (never on the snake); "SNAKE GAME" title; score; Start Game button; Restart button; Game Over message; Pause/Resume; gradual speed-up; no instant reversing (even if you press two keys very quickly); works on different screen sizes; eating and game-over sounds; dark background with green snake and red food; smooth animations; rounded corners; plain HTML, CSS and JavaScript with no libraries.

Small extras I added:
- **Best score:** saved in your browser, so it's still there next time.
- **Sound on/off:** the button, or press **M**.
- **Keyboard shortcuts:** **Space** or **P** pauses, and Space or Enter starts a new game.
- **Auto-pause:** the game pauses when you switch to another browser tab.
- **On-screen arrow buttons:** on phones and tablets, since they have no arrow keys.
- **Reduced motion:** if your computer is set to reduce motion, the game skips the animations.

## How I checked it
I ran the game automatically in a hidden Chrome browser. These all passed with no errors:
- Start
- Pressing the opposite direction is ignored
- Eating makes the snake grow, adds 10 points and speeds it up
- Pause really freezes the snake, and Resume continues
- Hitting the top wall ends the game, shows "GAME OVER" and saves the best score
- Restart resets the game
- Running into its own body ends the game
- Two quick turns in a row work correctly
- The sound toggle works
- On a phone-sized screen, the arrow buttons work and nothing runs off the side

I also looked at screenshots of the start screen, the game in play, the game over screen and the phone layout. Fixed along the way: "Sound: On" was wrapping onto two lines on phones.

The kit's design checker flagged two things, and I kept both on purpose:
- The built-in system font, so the game works offline with nothing to load
- The three equal boxes for Score, Best and Speed, since they really are three equal stats

## What I could not check
- **Sound:** I tested that the code runs, but the test browser has no speakers, so I couldn't hear it. Most browsers only allow sound after you click or press a key, so it starts after you press Start Game.
- **Other browsers:** I only tested in Chrome, not in Firefox, Safari or on a real phone.

Test scripts and screenshots are in the `.uca-workspace/` folder. You can delete that folder whenever you like; the game doesn't need it.

**Next step:** play a few rounds. If it feels too fast or too slow, change `START_STEP_MS` or `SPEED_UP_MS` near the top of `game.js`.
