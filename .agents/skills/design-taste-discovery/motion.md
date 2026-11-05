# Motion — read when the user asks for animation or transitions

For advanced animation, page-switching transitions, or a unique animated experience, treat motion as part of the brief: turn a clear description into a concrete concept and implement it, not a list of libraries.
- **Purpose:** what it communicates (continuity, hierarchy, feedback, spatial relationship).
- **Language:** one coherent system, such as shared-element transitions, directional reveals, masked reveals, staggered sequences, scroll-linked scenes or springs, used only where it serves the brief.
- **Signature moment:** one or two memorable interactions, not every element animated.
- **Fit:** use the simplest technique that works with the existing framework and router.
- **Behavior:** enter and exit, timing, interruption, loading and failure, rapid repeated input, and browser back/forward.

A transition must not delay navigation, hide content, or break deep links. If the user wants a unique design but gives no reference, propose a specific concept and state the assumption; do not default to the same fade-up-on-scroll effect. Respect `prefers-reduced-motion` with an alternative that keeps meaning, and keep keyboard, touch and readability working. Never claim an animation was visually tested unless it was run and inspected.

