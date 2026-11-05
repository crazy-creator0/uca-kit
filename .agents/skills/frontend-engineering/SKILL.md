---
name: frontend-engineering
description: Build accessible, responsive frontends with robust API integration, clear states, and measured performance.
metadata:
  domain: frontend
  triggers: screen, component, accessibility, state, front-end speed
  prerequisites: a UI layer in the project
  outputs: a working UI with states and accessibility checks
  priority: task
---

# Frontend Engineering

## Inspect first
Identify the actual framework, routing, component and styling conventions, design system, package scripts, test setup, and API contracts. Keep the current stack unless a change is justified.

## Stack decision (new project or no existing stack)
Pick the smallest stack that fits, and say why, what it costs, and what would make you switch. Never add a build step or framework the request does not need.
- **One file, a single page, or "a file":** one HTML file, plain CSS with variables, vanilla JS, data in `localStorage`; no build step and nothing loaded from a network address that breaks offline.
- **Small interactive tool, a few screens, no server:** Vite with vanilla JS (or Preact when there is real component reuse).
- **Several views sharing state, or a team will grow it:** Vite with React and a typed router; add state tools only when props and context stop being enough.
- **Mostly content, SEO, or many static pages:** Astro, or Next when it also needs server logic.
- **Needs accounts, shared data or other users:** add a backend and database; use the `backend-api` and `database-engineering` skills.
Also choose, each with a reason: styling (CSS variables first, a utility framework only if the project already uses one), icons (inline SVG), fonts (named files or a named provider), charts (hand-drawn SVG until real data volume needs a library), and how it is checked. Put the result in the plan block. If a project already exists, keep its stack.

## Implementation
1. Confirm user-visible behavior and acceptance criteria.
2. Inspect existing components, styles, routing, package scripts, and test setup.
3. Build one vertical slice with loading, success, empty, and error states as relevant.
4. Keep UI components focused; move shared behavior into hooks/utilities only when useful.
5. Validate inputs on the client for usability, but never treat client validation as server-side security.
6. Handle asynchronous operations, cancellation/races, and duplicate submissions where relevant.
7. Use semantic HTML, keyboard access, visible focus, labels, and appropriate contrast.
8. Avoid unnecessary dependencies and global state.
9. Test important behavior and verify responsive layouts.

## API integration
- Use explicit API base configuration per environment.
- Handle non-2xx responses, network failures, and malformed responses.
- Do not put server secrets in browser-exposed variables or bundles.
- Align request/response types with the backend contract.
- Treat CORS as a server/browser policy, not authentication.

## Performance and design quality
Measure before optimizing. Inspect bundle size, large assets, unnecessary renders, waterfall requests, caching, and rendering strategy. Avoid premature memoization. For UI changes, use the existing design system and run `node scripts/uca-design-check.cjs <ui folder>` when it exists. It catches common template tells only, so also review the result by eye. Do not claim a check was run unless its output was actually observed.

When the task specifically calls for canvas effects, 3D, or WebGPU, read `.agents/skills/frontend-visuals-and-3d/SKILL.md` and `UI-EFFECTS-GUIDE.md`. Choose the simplest technique that meets the brief. Never install a third-party package or persistent skill automatically.

## Review checklist
Correct states, accessibility, responsive behavior, type safety, API failure handling, secret exposure, tests, and maintainability.
