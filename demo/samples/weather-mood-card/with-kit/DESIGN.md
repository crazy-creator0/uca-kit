# Weather mood card — design brief

- **Job:** Readers glance at the sidebar to see the writer's sky and mood for the day. The owner's one action: pick one of four skies each morning (and type a temperature).
- **Direction:** Field notebook (shortlist: Field notebook, Garden almanac; picked Field notebook because a daily blog is a journal). Changed attributes: the page tint follows the sky (four paper colours instead of one), and the drawing is an ink-outlined illustration instead of a ticked list.
- **Type:** Weather word and mood line in a book serif ("Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif): word 2rem regular, temperature 1.75rem with tabular figures, mood line 0.95rem italic. Small labels in a monospace stack (ui-monospace, "SF Mono", Menlo, Consolas, monospace) 0.7rem uppercase, letter-spaced.
- **Color:** ink #26241F, margin line #D9544D, error #B3261E. Pages and fills: sunny #FBF1D6 / #F4BE3E; cloudy #EEEEE8 / #FFFFFF; rainy #E2E9EC / #B7C4CC (drops #4F7FA3); stormy #D8D6DE / #6B7280 (bolt #F4C430). One accent at a time: the sky's own colour.
- **Space:** 4px step (4, 8, 12, 16, 24). Square corners (0 radius), 1.5px ink borders on controls, no shadows.
- **Layout:** the drawing leads at full card width; under it the weather word and temperature on one line (stacked when the card is narrower than about 235px); the mood line under that; the date label sits at the top like a diary heading. Owner controls sit below a dashed rule and appear only in edit mode.
- **Stack:** plain HTML, CSS and vanilla JS; SVG path morphing done by hand (same number of points per shape, interpolated with requestAnimationFrame). No build, no libraries, no network.
- **Signature:** the ink sketch redraws itself: the sun puffs out into a cloud, rays slide in and drop out again as rain.
- **Departure:** no ruled lines across the page, only the red margin line, so the drawing stays clean at 200px wide.
