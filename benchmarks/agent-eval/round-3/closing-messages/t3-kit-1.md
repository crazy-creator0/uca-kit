# Your Snake Game is ready

**To play:** double-click `index.html`. It opens in your browser. You don't need to install anything or be online.

## What I built
- `index.html`: the page (title, scores, board, buttons)
- `style.css`: the look (colors, rounded corners, animations, phone layout)
- `game.js`: the game itself, split into labelled sections. The speed settings are at the top if you want to change them.

**How it plays:** use the arrow keys (or W A S D) to steer. Each red food is worth 10 points and makes the snake grow a little faster, from one move every 150 ms down to a limit of 60 ms. Hitting a wall or your own body ends the game. **Space** pauses and resumes. **Enter** starts a new game.

**Everything you asked for is included:** the "SNAKE GAME" title, the score, Start Game, Restart, Pause/Resume, a Game Over message, food that appears randomly, gradual speed-up, protection against instantly reversing, a layout that adapts to screen size, sounds for eating and game over, a dark background with a green snake and red food, smooth movement, and rounded corners. It uses no libraries.

**Extras I chose (you weren't available to ask):**
- A best score that is saved in your browser.
- A Sound On/Off button.
- On-screen arrow buttons and swipe controls on phones.
- The game pauses automatically when you switch tabs.
- If you press two turns very quickly, both of them count.
- If you ever fill the whole board, you see a "YOU WIN!" message.

**Design choices:** I used a bold "poster" style on a dark board. It has thick dark outlines, solid drop shadows and 12px rounded corners. The game's status appears on a tilted sticker: yellow for READY and PAUSED, red for GAME OVER. The snake slides smoothly from square to square, has eyes that face the way it's going, and the food gently pulses. The text uses fonts already on your computer, so the game works offline.

## Checks
- **Gameplay:** I ran an automated browser test in headless Chrome that clicks and presses keys the way a player would. All 22 checks passed. They covered the start, movement, blocked reversing, quick double turns, eating and growing, the speed-up and its 60 ms limit, food appearing only on empty squares, pause and resume, wall and self crashes, Restart, the saved best score, phone layout (no sideways scrolling, arrows visible, tapping Up turns the snake) and no errors on the page.
- **Visual check:** I looked at screenshots at desktop size and phone size (360 px wide). The layout, colors and Game Over screen looked right. I made the Game Over screen a little see-through so you can still see where you crashed.
- **Design check script from the kit:** it found no template-style warning signs.

## Still unknown
- **Sound:** the test confirmed the sound system starts without errors, but the test browser has no speakers. Please listen for a short "blip" when you eat and a falling tone at Game Over.
- **Browsers:** I tested only in Chrome, not in Safari, Firefox or on a real phone.

**Quick try (1 minute):**
1. Open `index.html` and click **Start Game**.
2. Eat one food. The score should become 10 and you should hear a blip.
3. Press **Space**. The game should show PAUSED.
4. Steer into a wall. You should see a red GAME OVER sticker, and your best score should update.

**Note:** my test script is in `.uca-workspace/test.cjs`. It's a scratch folder, and you can delete it safely. I didn't use Git, as you asked.
