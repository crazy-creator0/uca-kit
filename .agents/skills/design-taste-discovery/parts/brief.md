## Step 3 — commit to a design brief
Before any code, write these down in a few lines. Every line must be a concrete choice, not an adjective ("modern" and "clean" are not choices):
- **Job:** what the user does here, and the one main action.
- **Default:** the page you would build with no brief, in one line; the lines below change three parts of it with things from the domain.
- **Direction:** list the directions in `.agents/skills/design-taste-discovery/directions.md` with what each fits (`node scripts/uca-read.cjs design-taste-discovery/directions --list`), shortlist two by one concrete fact about this business (invent one if fictional), not the two nearest your default, read only those two (`--section "<name>"`), pick one and say why (or follow the user's reference). Then make it yours: change at least two of its attributes using real objects or words from the domain, add one **signature** element taken from the domain, and one deliberate **departure** from the direction. Never use a direction unchanged.
- **Type:** the actual typefaces (not the framework default), a size scale, and the weights used.
- **Color:** hex values for background, text, one accent, and status colors.
- **Space and shape:** a spacing step, one corner radius, border or shadow rule.
- **Layout:** what leads the screen, what sits beside it, and why that order suits the job.
- **Stack:** the existing one first; for a new project, the `frontend-engineering` "Stack decision". A new dependency needs its trade-off stated.

Show the brief and ask for approval for a substantial new UI or a new dependency; if the user says to decide, state your assumptions and proceed.
