# Today's sky — a weather mood card for a blog sidebar

A small card showing the sky you choose each morning (sunny, cloudy, rainy or stormy), a temperature you type, and a one-line mood. When you change the sky, the drawing morphs into the new shape. Plain files: no server, no internet, nothing to install.

## Files

- `index.html` — the card. **What readers see is set by the `data-…` values on the `<article id="weather-card" …>` line.**
- `card.css` — the look.
- `card.js` — the drawing, the morph and the owner controls.
- `tests/card.test.cjs` — automatic checks (optional, needs Node).

## Try it

Double-click `index.html`. To get the owner controls, add `#edit` to the end of the address in the browser bar (for example `file:///…/index.html#edit`) and press Enter.

## Each morning

1. Open `index.html#edit` and pick the sky. Type the temperature (empty = no temperature shown).
   Your browser remembers this choice, but **only your browser**.
2. To update what **readers** see: press **Copy**, open `index.html` in a text editor, replace the `data-weather="…" data-temp="…" data-unit="…" data-date="…"` part of the `<article id="weather-card" …>` line with what you copied, save, and upload `index.html` again.
3. When the published file matches your choice, the dashed "Only this browser shows…" note goes away.

## Putting it on the blog

Upload `index.html`, `card.css` and `card.js` to the same folder on your blog host, then add an HTML widget to the sidebar with:

```html
<iframe src="https://YOUR-SITE/PATH/index.html" title="Today's sky" style="width:100%;max-width:340px;height:420px;border:0"></iframe>
```

Adjust `height` if the card is cut off or leaves a gap (the mood line wraps onto more lines in narrow sidebars). This embed has not been tried on a real blog platform; some platforms block iframes or uploading .js files.

## Good to know

- **The `#edit` controls are hidden, not locked.** Anyone who adds `#edit` can click the buttons, but it only changes their own screen; it cannot change what other readers see.
- **No server means no shared saving.** The buttons save in the browser you click them in. Readers only ever see the values written in `index.html`.
- The date label says "Today's sky" when the published date is today in the reader's time zone, otherwise "Last set".
- People who turned on "reduce motion" in their system settings get an instant change instead of the morph.
- Mood lines are in `card.js` (`MOODS`); edit the wording there if you like.

## Checks

```
node --test tests/card.test.cjs
```
