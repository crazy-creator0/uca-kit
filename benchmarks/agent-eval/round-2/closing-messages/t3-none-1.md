# Your Snake Game is ready

**How to play:** double-click `index.html` and it opens in your web browser. You don't need to install anything or be online.

## Files
- `index.html`: the page layout (title, score, board, buttons)
- `style.css`: the look (dark background, green snake, red food, rounded corners, animations)
- `script.js`: the game itself, with comments explaining each part

## What it does
- Use the arrow keys to steer. The snake grows each time it eats the red food, and food always appears on an empty square.
- The game ends if the snake hits a wall or its own body. A red "Game Over" message pops up with your score.
- There are Start Game, Pause/Resume and Restart buttons. You can also press Space to pause.
- The snake can't turn straight back on itself.
- The game speeds up a little with every food eaten, until it reaches a top speed.
- You'll hear a short beep when the snake eats and a falling tone when the game ends. The browser makes these sounds itself, so there are no sound files.
- It works on any screen size. On phones and tablets, arrow buttons appear under the board.

## Choices I made for you
- I added a **Best** score that your browser remembers between visits.
- The snake's head has little eyes so you can see which way it's facing.

## How I checked it
I ran the game in a hidden (headless) Chrome browser. These all worked, with no errors:
- starting a game
- trying to reverse straight back, which was blocked
- pausing and resuming
- eating food, which made the score go up
- hitting a wall, which showed Game Over
- the layout on a phone-sized screen

I couldn't hear the sounds in that test, so please check they play on your computer.

**Easy tweaks:** to change the starting speed or how fast it speeds up, edit the numbers at the top of `script.js`.
