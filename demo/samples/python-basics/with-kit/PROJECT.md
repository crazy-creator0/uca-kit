# PROJECT.md

> Project card for coding agents. Blocks between uca:generated markers are rewritten by `node scripts/uca-project-discover.cjs --write`. Text outside them is yours and is never changed.

<!-- uca:generated:header -->
Verified at: 2026-11-21
Checked by: uca-project-discover.cjs read the files; no command was run
<!-- /uca:generated -->

<!-- uca:generated:stack -->
## Stack
- No runtime or framework was detected from manifests or version files.
<!-- /uca:generated -->

<!-- uca:generated:entry-points -->
## Entry points
- file present: app.js (source: app.js)
- file present: index.html (source: index.html)
<!-- /uca:generated -->

<!-- uca:generated:map -->
## Import map (from the entry files)
- app.js (entry) imports nothing local (source: app.js)
- 10 source file(s) outside examples and tests are not reached from an entry, e.g. .uca-workspace/shot_top.cjs, check_examples.py, logic.js (scripts, config, or code loaded by name)
<!-- /uca:generated -->

<!-- uca:generated:commands -->
## Commands
Run and seen to work:
- None yet. Nothing was run.
Declared in files, not run (do not treat as working):
- None found.
<!-- /uca:generated -->

<!-- uca:generated:routes -->
## Routes
- Page in scripts/uca-project-discover.cjs: /${dir}src/main.rs (source: scripts/uca-project-discover.cjs:387)
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
- 8 TODO/FIXME/HACK comment(s); first: scripts/uca-project-discover.cjs:943, scripts/uca-project-discover.cjs:943, scripts/uca-project-discover.cjs:943, scripts/uca-project-discover.cjs:945, scripts/uca-project-discover.cjs:945 (source: scripts/uca-project-discover.cjs)
<!-- /uca:generated -->

<!-- uca:generated:unknowns -->
## Assumed or unknown (not verified)
- Deployment and hosting: not discovered.
- Known issues and limits: only TODO/FIXME comments are listed above; check the issue tracker.
- Run, test, lint and build commands: none were found in a manifest or Makefile.
<!-- /uca:generated -->

## Notes (written by hand, not generated)
- What it is: a static study page. Entry file `index.html`, loads `style.css`, `logic.js` (pure helpers), `app.js` (widgets). No build, no dependencies, no network. (source: index.html)
- Checks, all run and passing on 2026-11-21 with Python 3.13.18, Node 22, Chrome 153 headless:
  - `python3 check_examples.py`: runs every code example and table row in index.html and compares the output.
  - `python3 tests/test_logic.py`: logic.js against real Python.
  - `node tests/browser_check.cjs`: widgets, keyboard, widths 320 to 1280px in headless Chrome.
- `scripts/` holds the UCA Kit tools, not part of the page.
