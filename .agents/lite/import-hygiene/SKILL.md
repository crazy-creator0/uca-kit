---
name: import-hygiene
description: Avoid circular imports and stop import-error spirals; fix shared code by moving it, not by adding imports.
---

# Import hygiene (Lite)

- Before adding an import, check that the target does not already import this file, directly or indirectly.
- After import edits, run the project's cycle check: configured checks first, then an already-installed tool (import-linter, pydeps, madge, eslint import/no-cycle), then the build or typecheck. Never install a tool. If none exists, ask for a check command.
- Never fix an import error by adding another import.
- If two modules need each other, move the shared code to a third module that imports neither. Do one move at a time and re-run checks after each.
- If the same import error appears twice, stop, revert the last edit, and report it.
