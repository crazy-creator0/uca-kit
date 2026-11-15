# PROJECT.md

> Project card for coding agents. Blocks between uca:generated markers are rewritten by `node scripts/uca-project-discover.cjs --write`. Text outside them is yours and is never changed.

<!-- uca:generated:header -->
Verified at: 2026-11-15
Checked by: uca-project-discover.cjs read the files; no command was run
<!-- /uca:generated -->

<!-- uca:generated:stack -->
## Stack
- No runtime or framework was detected from manifests or version files.
<!-- /uca:generated -->

<!-- uca:generated:entry-points -->
## Entry points
- file present: index.html (source: index.html)
<!-- /uca:generated -->

<!-- uca:generated:commands -->
## Commands
Run and seen to work:
- None yet. Nothing was run.
Declared in files, not run (do not treat as working):
- `npm test` runs `node --test tests/card.test.cjs` (source: package.json)
<!-- /uca:generated -->

<!-- uca:generated:routes -->
## Routes
- No routes were detected.
<!-- /uca:generated -->

<!-- uca:generated:data -->
## Data layer
- Uses the built-in node:sqlite module (source: scripts/uca-project-discover.cjs)
<!-- /uca:generated -->

<!-- uca:generated:auth -->
## Authentication
- No authentication dependency or file name was detected.
<!-- /uca:generated -->

<!-- uca:generated:structure -->
## Structure and boundaries
- Top-level folders: scripts, tests (source: .)
<!-- /uca:generated -->

<!-- uca:generated:conventions -->
## Conventions and constraints
- 8 TODO/FIXME/HACK comment(s); first: scripts/uca-project-discover.cjs:389, scripts/uca-project-discover.cjs:389, scripts/uca-project-discover.cjs:389, scripts/uca-project-discover.cjs:391, scripts/uca-project-discover.cjs:391 (source: scripts/uca-project-discover.cjs)
<!-- /uca:generated -->

<!-- uca:generated:unknowns -->
## Assumed or unknown (not verified)
- Deployment and hosting: not discovered.
- Known issues and limits: only TODO/FIXME comments are listed above; check the issue tracker.
- Whether each declared command works: not run, see Commands.
<!-- /uca:generated -->

## Notes (written by hand)
- The generated "Data layer" line above comes from the kit's own script, not this project. This card stores data only in the browser (`localStorage`, key `weather-mood-card:v1`) and in the `data-…` attributes in `index.html` (source: card.js).
