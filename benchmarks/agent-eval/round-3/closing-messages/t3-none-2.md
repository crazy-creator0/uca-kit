# Your Snake Game is ready

To play, double-click `index.html` and it opens in your web browser. You don't need to install anything or be online.

## Files
- `index.html` sets up the page: the title, score boxes, game board and buttons.
- `style.css` holds the look: dark theme, colours, rounded corners and animations.
- `script.js` runs the game. It is split into labelled sections (settings, game logic, drawing, sound, controls), and each part has a plain-English comment.

## What it does
- **Controls:** use the arrow keys to steer. Space or P pauses and resumes. Enter starts a new game.
- **Rules:** the snake grows each time it eats the red food. The game ends if it hits a wall or its own body. Food appears on a random empty square.
- **Buttons:** Start Game, Pause/Resume and Restart. A "Game Over" message appears when you lose.
- **Speed:** the snake gets a little faster with every food, up to a set top speed. The "Speed" box shows how fast it is going (1.0x at the start).
- **No instant U-turns:** pressing the opposite direction is ignored. Quick key presses are saved in order, so fast turns still work.
- **Sounds:** a short "blip" plays when the snake eats and a falling tone plays at game over. The game makes these sounds itself, so there are no sound files.
- **Look:** dark background, a green snake with eyes, and glowing red food. The snake slides smoothly between squares, and sparkles appear when it eats.
- **Screen sizes:** the board resizes to fit the screen. On phones and tablets, on-screen arrow buttons appear under the board.

## Extras I added
- A **Best** score that your browser remembers between visits.
- The game pauses by itself if you switch to another browser tab.
- If you fill the whole board, you get a "You Win!" message.

## Choices I made
- The board is 20 × 20 squares and each food is worth 1 point.
- To change the speed, edit the numbers at the top of `script.js`: `START_DELAY` sets the starting speed, `MIN_DELAY` the top speed and `SPEED_STEP` how quickly it speeds up. A lower number means faster.

## How I checked it
I ran the game in a hidden Chrome browser with an automatic script that tested:
- starting and moving
- ignoring an instant reverse
- eating food, growing, scoring and speeding up
- pausing (the snake stops) and resuming
- game over from hitting a wall and from hitting its own body
- the phone layout, which fits a phone screen with no sideways scrolling

There were no errors. Sound can't be heard in a hidden browser, so please check it yourself. Browsers only allow sound after you click something, which is why it starts once you press Start Game.
