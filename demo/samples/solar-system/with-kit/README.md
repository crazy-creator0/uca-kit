# Our Solar System in 3D

A 3D model of the Sun and the eight planets for a school project. Drag to turn it, and tap or click a planet (or its button at the bottom) to see its name and one fact.

## How to open it

Double-click `index.html`. It opens in your web browser. No internet, server or install is needed.

To take it to school, copy `index.html` to a USB stick or the laptop. That one file is the whole model.

## Controls

- **Drag** (finger or mouse): turn the model
- **Tap or click a planet**, or a planet button: show its fact card. Tap empty space, the × button, or press Esc to close it
- **Pinch** (tablet), mouse wheel, or the − / + buttons: zoom
- **Pause / Play**, **Names: on/off**, **Reset view**, **Full screen**: the buttons at the bottom
- Keyboard: click the model first, then use the arrow keys to turn it and + / − to zoom

Sizes, distances and speeds are not to scale, and the page says so.

## Files

- `index.html`: the whole model (page, style and code in one file)
- `DESIGN.md`: the design choices
- `.uca-workspace/check.cjs`: an automatic check that opens the page in headless Chrome. Run it with `node .uca-workspace/check.cjs` (needs Playwright and Chrome, which were already on the build machine)
