## Stack decision (new project or no existing stack)
Pick the smallest stack that fits, and say why, what it costs, and what would make you switch. Never add a build step or framework the request does not need.
- **One file, a single page, or "a file":** one HTML file, plain CSS with variables, vanilla JS, data in `localStorage`; no build step and nothing loaded from a network address that breaks offline.
- **Small interactive tool, a few screens, no server:** Vite with vanilla JS (or Preact when there is real component reuse).
- **Several views sharing state, or a team will grow it:** Vite with React and a typed router; add state tools only when props and context stop being enough.
- **Mostly content, SEO, or many static pages:** Astro, or Next when it also needs server logic.
- **Needs accounts, shared data or other users:** add a backend and database; use the `backend-api` and `database-engineering` skills.
Also choose, each with a reason: styling (CSS variables first, a utility framework only if the project already uses one), icons (inline SVG), fonts (named files or a named provider), charts (hand-drawn SVG until real data volume needs a library), and how it is checked. Put the result in the plan block. If a project already exists, keep its stack.
