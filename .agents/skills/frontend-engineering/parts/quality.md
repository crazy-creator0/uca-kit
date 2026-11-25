## Performance and design quality
Measure before optimizing. Inspect bundle size, large assets, unnecessary renders, waterfall requests, caching, and rendering strategy. Avoid premature memoization. For UI changes, use the existing design system and run `node scripts/uca-design-check.cjs <ui folder>` when it exists. It catches common template tells only, so also review the result by eye. Do not claim a check was run unless its output was actually observed.

When the task specifically calls for canvas effects, 3D, or WebGPU, read `.agents/skills/frontend-visuals-and-3d/SKILL.md` and `UI-EFFECTS-GUIDE.md`. Choose the simplest technique that meets the brief. Never install a third-party package or persistent skill automatically.

## Review checklist
Correct states, accessibility, responsive behavior, type safety, API failure handling, secret exposure, tests, and maintainability.
