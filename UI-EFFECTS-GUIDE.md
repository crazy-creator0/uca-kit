# UI Effects Guide: motion, canvas, shaders, 3D, WebGPU

This is the kit's own guide. It depends on no third-party UI tool, library or service, and the kit never installs one for you. Use what the project already has. Anything new that has to be added is a dependency, and adding a dependency needs the user's approval first.

## The effects ladder

Start at step 1. Move up one step only when the step below cannot meet the brief, and say why in one line.

| Step | Technique | Use it for | Watch for |
|---|---|---|---|
| 1 | Semantic HTML and CSS tokens | Most screens: layout, type, color, spacing | Nothing extra to ship |
| 2 | CSS transitions and animations (`transform`, `opacity`) | Hover, focus, entrances, small state changes | Honor `prefers-reduced-motion`; avoid animating layout properties |
| 3 | Inline SVG | Icons, diagrams, line drawing, simple illustrations | Give meaningful graphics a text alternative |
| 4 | The motion or component library the project already uses | Sequenced or gesture-driven motion | Match the existing design system; add nothing new |
| 5 | Canvas 2D | Particles, charts, custom drawing, generative patterns | Not readable by screen readers: keep the real content in HTML |
| 6 | WebGL | Per-pixel shader effects (ripple, fluid, distortion) or a small 3D scene | Needs a fallback when the GPU or browser fails |
| 7 | WebGPU and WGSL | Compute work or a custom render pipeline | Not available everywhere; needs a tested fallback |

A fashionable look is not a reason to climb. A gradient or glow is step 2, not step 7.

## Motion rules

- Animate `transform` and `opacity`. Animating width, height or position makes the browser re-layout every frame.
- Motion should explain a change (this moved, that appeared). Decoration that does not explain anything goes.
- Respect `prefers-reduced-motion`: replace movement with a fade or nothing.
- Pause or stop animation that is off screen or in a background tab.

## Authored 3D scenes

Use a 3D scene only when the product needs one and a real asset exists. Before building:

1. Write down a budget as numbers (asset size, frame time on a mid-range phone) and measure against it afterwards.
2. Use the 3D approach already in the project. If there is none, a small scene can use plain WebGL; anything larger is a new dependency, so ask.
3. Check the license of every model, texture and font.
4. Load it lazily, show a static poster image first, and keep the page usable if the scene never loads.
5. Keep keyboard and touch use working. Do not put the only way to do something inside a canvas.

## Fallbacks and testing

- Test with WebGL or WebGPU unavailable, with reduced motion on, on a narrow screen and on a slow connection.
- Keep real text and controls in HTML so they are readable, focusable and translatable.
- A successful build does not prove an effect works on real devices. Say what you actually tested.

## Checking the result

- Run `node scripts/uca-design-check.cjs <ui folder>` when it exists. It catches common generic-template tells. A clean result proves nothing about quality, so also review the result by eye.
- If a browser or screenshots are available, look at the page. Do not claim a visual check when you only read the code.

## Understanding a large or unfamiliar codebase

Use the kit's project card: `node scripts/uca-project-discover.cjs --write PROJECT.md`, then `node scripts/uca-project-check.cjs` to see whether it has gone stale. Every line cites the file it came from. Treat it as a map, not proof: read the real source and run the real checks before you rely on it.

## Order of work

1. **Inspect:** the framework, dependencies, design system, accessibility needs and browser targets.
2. **Match:** pick the lowest ladder step that meets the brief.
3. **Ask before adding:** name the package and the files it would change. Never install third-party code, plugins or persistent skills without approval.
4. **Build one slice:** one effect or scene, with its loading and fallback states.
5. **Measure and review:** bundle size, runtime cost, reduced motion, accessibility, supported browsers.
6. **Report honestly:** what was added, the checks you actually ran, and the remaining risks.

## Protect the product design

An effect serves the content and the user's design system. Do not copy another site's look or replace the product's identity with a template.
