# Your Snake Game is ready

**To play:** double-click `index.html`. It opens in your web browser. You don't need to install anything or be online.

## The files
- `index.html` sets up the page: the title, score, board and buttons.
- `style.css` handles the look: the dark theme, colors, rounded corners and animations.
- `script.js` runs the game itself. It's split into labeled sections such as Settings, Game actions, Drawing, Sound effects and Controls.

## What's in it
Everything you asked for is in:
- **Gameplay:** the snake moves on its own and you steer with the arrow keys. It grows each time it eats the red food, and food appears on a random empty square. Hitting a wall or the snake's own body ends the game.
- **Screen:** the "SNAKE GAME" title, the score, and Start Game, Pause/Resume and Restart buttons. A "Game Over" message shows your final score.
- **Features:**
  - The snake speeds up a little with each food until it reaches a top speed.
  - It can't turn straight back on itself.
  - The layout fits phones, tablets and desktops.
  - There's a short beep when it eats and a falling tone when the game ends.
- **Design:** a dark background with a green snake and a glowing red food. The snake slides smoothly between squares, and the corners are rounded.

## Extras I added
- **Best score:** your best score is saved in the browser and shown next to your current score.
- **Keyboard shortcuts:** Space pauses and resumes, and Enter starts a new game.
- **Phones:** on phones you get on-screen arrow buttons, and you can also swipe on the board to steer.
- **Auto-pause:** the game pauses if you switch to another browser tab.
- **Win screen:** if you somehow fill the whole board, you get a "You Win!" message.

## Testing
I tested the game in a headless Chrome browser and everything worked: starting, the score going up when the snake eats, the speed-up, pausing and resuming, game over from both a wall and the snake's own body, restarting, and the blocked U-turn. I also checked the layout on a desktop size, a short laptop screen and a phone. There were no errors.

I couldn't test the sounds because the test browser has no speakers. Please listen for them the first time you play. Some browsers only allow sound after you've clicked something on the page, and pressing Start Game counts as that click.

## Easy changes you can make
At the top of `script.js`:
- `START_SPEED`: lower numbers make the snake faster from the start.
- `SPEED_STEP`: how much faster it gets per food.
- `GRID_SIZE`: the number of squares across the board (the default is 20).
