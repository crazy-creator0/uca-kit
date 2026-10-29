---
name: design-taste-discovery
description: Discover the user's visual preferences before planning UI work and selecting components, animation, canvas, 3D, or WebGPU tools.
---

# Design Taste Discovery — Ask Before Choosing

## When to use this skill
Use for new websites, landing pages, UI redesigns, component styling, interactive visuals, animation, canvas effects, 3D scenes, or other tasks where visual taste materially affects the result. Do not use it for backend-only or non-visual tasks.

## Principle
**The user's taste comes before the tool list.** Never pick Aceternity UI, Canvas UI, Spline, VGPU, or another design library simply because it is listed in the kit. First understand the look and feel the user wants, then shape a plan and suggest only the skills/tools that fit.

## Step 1 — inspect what the user has already told us
Before asking a question:
- Read the user's brief and inspect any images, screenshots, URLs, brand references, moodboards, or existing UI they shared.
- Inspect the existing project, design system, framework, components, styles, and dependencies if available.
- Capture stated preferences, target audience, required content, device constraints, accessibility needs, and performance limits.
- Do not ask the user to repeat information they already gave. A reference image is meaningful evidence of taste; describe the visual cues you infer and flag ambiguity instead of pretending to know everything.

## Step 2 — ask one concise taste question when needed
If the direction is still unclear, ask one conversational question before designing or coding. Invite a reference and offer a few easy-to-understand examples, not a long questionnaire.

Example:
> Before I plan the UI, what visual vibe do you like? For example: clean/minimal, editorial and typography-led, premium dark with subtle glow, colorful/playful, or immersive 3D. A screenshot or website you like is also enough. Do you prefer subtle motion or a more animated experience?

Adapt this to the project. Do not force the user to choose from a fixed list. Ask about budget, licensing, strict performance, or browser support only when those constraints materially affect the recommendation.

## Step 3 — translate taste into a plan
Briefly reflect back:
- **Visual direction:** style, density, typography, color, contrast, depth, and motion.
- **User experience:** audience, primary action, page structure, responsive behavior, and accessibility.
- **Implementation approach:** keep the existing framework/design system when suitable; choose the smallest set of components/tools that match the goal.
- **Relevant skills/tools:** only the skills and optional libraries justified by the direction and actual project stack.
- **Trade-offs:** explain meaningful impacts such as dependency size, loading time, browser/GPU support, editing effort, licensing, or maintenance.

For a substantial new UI or a new third-party dependency, show the plan and ask for approval before implementing it. For a small focused change in an established design system, a brief confirmation of inferred direction may be enough. If the user explicitly asks you to decide, state the chosen assumption and proceed proportionately.

## Step 4 — select tools by taste + need, not trend
Read `UI-AND-CODEBASE-TOOLS.md` only when a related capability is relevant. Examples:
- Minimal/editorial, fast, content-led interface → first try the existing stack, semantic HTML/CSS, and design tokens; no new library may be needed.
- React/Next.js component-heavy UI with matching polished motion cards or interactive elements → consider Aceternity UI only if its style/prerequisites fit.
- Liquid, ripple, particle, shader or procedural canvas effect → consider Canvas UI; otherwise use simpler CSS/SVG.
- A true authored 3D scene that serves the product → consider Spline.
- A real custom GPU/WebGPU/WGSL or compute requirement → consider VGPU. Never use low-level GPU rendering just to add a fashionable glow.
- Large/unfamiliar codebase mapping → optionally evaluate Understand Anything based on codebase complexity, not on visual taste.

Never present all tools as an automatic bundle. Suggest at most the few choices that add clear value, explain why, and name a simpler alternative where reasonable.

## Step 5 — avoid generic AI-generated UI patterns
Treat these as warning signs to evaluate, not a rigid ban. Use them only when they serve the product and match the user's references:
- Oversized inspirational hero headlines or marketing copy in a utility app.
- Decorative gradients, glows, sparkles, blobs, or floating shapes without a product purpose.
- Repeated rounded cards nested inside other rounded cards, pill controls everywhere, and shadows on every surface.
- Generic slogans and motivational empty-state copy that could belong to any product.
- The same pastel palette, oversized typography, generous hero spacing, and card-grid layout regardless of the app's job.

Before styling, identify the product's primary job and the information users need most. Give that content and its main action visual priority. For a task manager, for example, the task input and task list should lead; a large brand statement and decorative side panel usually should not.

Prefer a specific visual system over a fashionable template:
- Choose type scale, density, spacing, contrast, borders, and corner radius intentionally for the content and audience.
- Use flat surfaces, restrained color, and compact controls when they improve scanning and task completion; do not flatten everything by default.
- Use meaningful product language. Empty states should explain the next useful action in the app's own terms, not add generic encouragement.
- Do not add a date, score, stats panel, quote, icon, or other decoration unless it helps the user make a decision or complete a task.
- Use realistic content to evaluate the layout: empty, populated, completed, long-text, and error states, plus narrow/mobile widths.

## Step 6 — review like a product designer
Before declaring the UI done:
1. Compare the implementation with the user's references, stated taste, and product purpose.
2. Identify at least three specific choices that make the interface appropriate to this product, rather than merely saying it looks modern or polished.
3. Look for template-like patterns from Step 5 and remove or justify each one.
4. Check hierarchy, alignment, content density, responsive behavior, keyboard use, contrast, reduced motion, and empty/error states.
5. If screenshots or browser tools are available, inspect them. Do not claim visual inspection when only source code was checked.
6. Make targeted revisions based on visible problems; do not replace one generic template with another or equate “less AI-looking” with “unstyled.”

## Step 7 — approval and implementation
- Ask before adding dependencies, external services, persistent skills, plugins, or installing third-party code.
- Do not install all reference tools as a preset.
- Make a small vertical slice first, then check whether the result matches the accepted direction.
- Preserve accessibility, responsiveness, reduced-motion preferences, usable semantic text/actions, loading states, graceful fallbacks, and the project's design system.
- Validate against the user's references and acceptance criteria. If the implementation drifts from the agreed taste, revise it rather than defending the tool choice.

## Non-negotiable rules
- Never code a substantial new visual direction before asking about taste when the user has not supplied a clear preference/reference.
- Never recommend a tool before understanding the relevant design goal and inspecting stack constraints.
- Never mistake aesthetic assumptions for user-approved decisions.
- Never claim a design/reference/website was inspected if it was not actually accessible.
- Do not treat any style checklist as a substitute for product-specific judgment.
- Be direct and lightweight: discovery should help the user decide, not become a lengthy intake interview.
