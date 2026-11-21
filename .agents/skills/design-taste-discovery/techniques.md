# Techniques: the cheapest one that fits

Read from Step 4 of `.agents/skills/design-taste-discovery/SKILL.md`.

Read `UI-EFFECTS-GUIDE.md` only when an effect beyond plain HTML/CSS is relevant.
- Minimal, editorial or content-led: semantic HTML/CSS and design tokens; no library may be needed.
- Polished motion on components: CSS transitions, or the motion library the project already has.
- Liquid, particle, shader or procedural canvas effects: CSS/SVG first, then Canvas 2D, then WebGL.
- A real authored 3D scene that serves the product: needs a real asset and a size budget; use the 3D approach already in the project.
- A real custom GPU/WebGPU/WGSL or compute need: WebGPU. Never use it for a fashionable glow.

Suggest only techniques with clear value, and name a simpler alternative. Install nothing without asking.
