# Your Snake Game is ready

**To play:** double-click `index.html`. It opens in any web browser. Nothing needs to be installed.

## What it has
- The title "SNAKE GAME", the current score, and a best score that is remembered between visits.
- Start Game, Pause/Resume and Restart buttons. The Space bar also pauses.
- Arrow keys to steer. The snake can't turn straight back on itself.
- Red food appears at random spots. Each piece you eat makes the snake longer and a little faster, up to a speed limit.
- The game ends when the snake hits a wall or its own body. A "Game Over" message shows your score.
- Short sound effects when you eat and when the game ends. They are generated in the browser, so there are no sound files.
- A dark theme with a green snake, glowing red food, rounded corners and fade/pop animations.
- It resizes to fit phones and desktops. On touch screens, on-screen arrow buttons appear.

## Checked
I ran it in an automated headless browser. Start, eating food (score went up and the snake grew), blocking a reverse turn, pause, and Game Over on hitting a wall all worked, with no errors.

## Choices I made
- Everything is in one file (`index.html`) so it's easy to share.
- I added the best score and touch buttons as small extras.
- Speed: it starts at 150 ms per move, gets 5 ms faster per food, and stops getting faster at 60 ms. You can change these numbers at the top of the script.
