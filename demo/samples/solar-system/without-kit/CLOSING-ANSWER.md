**Mostly yes, but she should do a 2-minute try-out on the laptop she'll use in class first.** It worked in every test I ran, but I only tested in Chrome on my own machine, not on your laptop or tablet.

**What I built:** one file, `<project folder>/index.html`. Double-click it and it opens in the browser. It needs no internet, no server and no other files, so it can go on a USB stick.

- **The model:** the Sun and the eight planets go around it on their orbits. The inner planets move faster. Saturn has rings and Jupiter has its red spot.
- **Turning and zooming:** drag with a finger or the mouse to turn it. Pinch or use the mouse wheel to zoom.
- **Facts:** tap any planet or the Sun to see a card with its name, its position from the Sun, and one simple fact. There's also a row of planet buttons at the bottom, which is handy if a small planet is hard to hit.
- **Buttons:** Pause/Play, Names on/off, and Reset view.
- **Not to scale:** a box at the top of the page says the sizes and distances are not to scale.

**What I checked** (in Chrome running hidden on my side, loading the file directly with no server):
- **Screen sizes:** a laptop (1366×768), a large monitor (1920×1080), a tablet held sideways and upright, and a phone. All nine bodies started on screen every time.
- **Mouse:** dragging turns the model, and the mouse wheel zooms.
- **Tapping:** clicking or tapping each of the nine bodies opened the right card, 9 out of 9 at every screen size. Tapping slightly next to tiny Mercury still picks it.
- **Touch:** I used Chrome's touch simulation. A one-finger drag turns the model, a two-finger pinch zooms, and neither one opens a card by accident. The page itself didn't scroll or zoom.
- **Buttons:** all the buttons and the close (×) on the card work.
- **No errors:** there were no error messages, and the page made no requests to the internet.
- **Screenshots:** I looked at them myself. I fixed three problems they showed: the card covered planets on a laptop (it now sits in the empty top-right corner), names overlapped the Sun, and there were stray black marks next to some names.

**What I did not check:**
- **Other browsers:** I didn't try Safari, Firefox or Edge, or an iPad or Android tablet. Touch was only simulated, never tried with a real finger.
- **Your class setup:** I didn't try your laptop, the classroom projector, or very slow computers.
- **The facts:** I wrote them from my own knowledge and couldn't look them up against a source (no internet). I believe they're right, but it's worth a quick look at them together.
- **Card on an upright tablet:** when the fact card is open, it can partly cover Neptune. Closing the card with × fixes it.
