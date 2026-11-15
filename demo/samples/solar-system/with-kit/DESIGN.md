# Design brief: Solar System 3D

- **Job:** a 10-year-old shows the solar system in class. The main action is to turn the 3D scene by dragging and tap a planet to read its name and one fact.
- **Direction:** Poster (made for kids and school events). Swiss grid was the other option, but it felt too much like a timetable for a 10-year-old. Changes: the flat yellow field becomes deep night space (#0A0E1F) because the scene *is* the sky, and the poster's huge type gives way to the 3D scene, which leads.
- **Type:** no web fonts, because it must work offline. System stack: "Trebuchet MS", "Avenir Next", "Segoe UI", system-ui, sans-serif. Sizes 14 / 17 / 22 / 34 px (title scales up to 40 px), weights 400 / 700 / 800.
- **Color:** background #0A0E1F, text #F5F1E6, muted text #A9B0C7, accent (sticker, focus, selection) #FFD23F, ink on light surfaces #111111, card #F5F1E6. Each planet keeps its own color, used only for that planet.
- **Space:** 8 px step, 12 px corner radius, 3 px ink outlines with a hard 4–6 px offset shadow on the fact card and sticker only. Buttons are at least 44 px tall for small fingers.
- **Layout:** the 3D scene fills the screen. The title sits top-left, the "Not to scale" sticker top-right, and the planet buttons plus view controls in a bottom bar. The fact card appears on the right in landscape and above the bottom bar in portrait.
- **Stack:** a single index.html with inline CSS and JS, drawn on a Canvas 2D with a small hand-written 3D projection. No library, no server, no WebGL.
- **Signature:** the fact card looks like a planet trading card, with its number ("3rd planet from the Sun"), a mini planet in its colors, and a thick outline.
- **Departure:** the Poster direction crops big type off the edge, but here the type stays small and calm so the planets are the poster.
