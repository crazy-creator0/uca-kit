# Design brief — cafe counter

- **Job:** The cashier takes and closes table orders at the rush hour; the main action is "add to order".
- **Direction:** Chalkboard, changed: the board is the order screen, not a menu.
- **Type:** Fraunces for item names, Work Sans for body, tabular figures for prices.
- **Color:** slate #22282A, chalk #EDE9DD, accent #E8B04B, paid #2DA44E, late #D1242F.
- **Space:** 8px step, 4px radius, dashed chalk rules instead of shadows.
- **Layout:** Open tables in a left rail, the current order in the middle, running total pinned bottom right.
- **Stack:** One HTML file, vanilla JS, CSS variables, orders kept in localStorage; no build step.
- **Signature:** A sold-out item is scratched through with a chalk line and stays visible.
- **Departure:** Prices are written to the left of item names, the way a shout-out order is called.
