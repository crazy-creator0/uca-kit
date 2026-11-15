I've built it, and it's ready for her to try. I'd call it ready for class once you've done a 5-minute run-through on the actual laptop. I tested it carefully in an automated browser on this computer, but I couldn't test it on your devices.

**What she gets:** a single file, `index.html`. Double-click it and it opens in the browser. No internet or install needed, and it's easy to copy to a USB stick. The Sun and eight planets go around in 3D. She can turn the model by dragging with a finger or the mouse. Tapping a planet, or its button at the bottom, opens a card with its name, its place from the Sun, and one simple fact. There are also Pause, zoom, Names on/off, Reset view and Full screen buttons. A yellow "Not to scale!" sticker sits at the top, and on laptops and wide screens a sentence under it gives the real numbers (portrait screens show only the sticker). I drew the 3D myself without any add-ons, so nothing needs downloading.

**What I checked (all actually run, in headless Chrome, which is Chrome with no visible window):**
- **Opening from disk:** the page opened straight from the file, with no errors and no internet requests.
- **Laptop (1366×768, mouse):** all 9 bodies are on screen and moving. Clicking Saturn opens the right card. Dragging turns the model, and a drag doesn't count as a click. Mouse wheel zoom, Reset view, Pause, the × button, the Esc key and clicking empty space all work. All 9 buttons open the correct card.
- **Tablet size, both ways round, simulated touch:** tapping Mars works, and so does tapping tiny Mercury right next to the Sun. One-finger drag turns the model and two-finger pinch zooms. The page doesn't scroll by accident, and all 9 planet buttons fit across the landscape screen.
- **Other cases:** with the "reduce motion" setting on, it starts paused. On a phone-width screen it still works. If JavaScript is off or the browser can't draw, a plain message shows. My JavaScript-off check reported a fail at first, but the screenshot showed the message, so the fault was in my check.
- **Screenshots I looked at:** they showed two problems, which I fixed. Planet names piled on top of each other when the model was turned edge-on, and on an upright tablet the model was small with lots of empty sky above it.
- **The kit's checks:**
  - **Design check:** it flagged only "no downloaded font". That's on purpose, because there's no internet.
  - **Senior checklist (6 of 9):** it marks down "everything in one file", which is on purpose so it's easy to carry. It also marks down "no test command": my browser check exists but depends on tools on this computer.

**What I did not check:**
- **Real devices:** not on a real iPad or Android tablet, not with a real finger, and not in Safari or Firefox. Only Chrome, which is the same engine Edge uses.
- **Your setup:** not on your school laptop, its speed, or a projector.
- **Full screen:** I didn't press the button, because the test browser can't go full screen.
- **The facts:** I wrote them from my own knowledge, with no internet to double-check. I believe they're right (for example Mercury 88 days, Jupiter more than 1,000 Earths, Neptune winds about 2,000 km/h), but please read the 9 short facts once before class.

**Good to know:**
- On a wide screen the fact card sits on the right and can hide a planet behind it. Close it with × or tap empty space.
- When the model is turned fully side-on, some names sit over the Sun's glow.

**Run-through on the class laptop:** open the file, drag, click 2–3 planets, try Full screen. Do the same on the tablet if she'll use it.

I didn't set up Git (a tool that saves versions so changes can be undone). Tell me if you'd like it.
