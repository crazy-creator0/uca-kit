---
name: import-hygiene
description: Use when an import fails or code moves: avoid cycles; move shared code, don't add imports.
---

# Import hygiene (Lite)

- Before adding an import, check that the target does not already import this file, directly or indirectly.
- After import edits, run the project's cycle check: configured checks first, then an already-installed tool (import-linter, pydeps, madge, eslint import/no-cycle), then the build or typecheck. Never install a tool. If none exists, ask for a check command.
- If two modules need each other, move the shared code to a third module that imports neither. Do one move at a time and re-run checks after each.
- If the same import error appears twice, stop, revert the last edit, and report it.
