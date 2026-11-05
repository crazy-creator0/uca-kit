---
name: import-hygiene
description: Prevent and fix circular imports and import errors by checking the dependency graph and moving shared code, not adding imports.
metadata:
  domain: code-structure
  triggers: import error, circular import, moving code between modules
  prerequisites: a way to run the build or a cycle check
  outputs: a cycle-free change with the check result
  priority: task
---

# Import Hygiene

Use when an import fails, a circular dependency appears, or a change adds or moves imports between modules.

## Before adding an import
1. Check whether the target module already imports this one, directly or through another module.
2. Prefer the import direction the project already uses (for example UI → services → data). Do not reverse it.
3. If the code you need is small and unrelated to the rest of its module, say so before copying it.

## Cycle check
Run a relevant check after import edits, in this order:
1. The project's configured checks (test, lint, build, or typecheck scripts).
2. A tool that is already installed: import-linter, pydeps, madge, or an eslint `import/no-cycle` rule.
3. The existing build or typecheck command.

Never install a tool to do this. If no check exists, ask the user for a command and say the cycle check was not run.

## Fixing an import error
- Never fix an import error by adding another import.
- If two modules need each other, move the shared code to a third module that imports neither. Make one move at a time, then re-run checks.
- Prefer passing a value or callback as an argument over importing the other module.
- Lazy or function-level imports hide a cycle; use them only as a documented last resort.

## Stop conditions
- The same import error appears twice: stop, revert the last edit, and report what was tried.
- One step changes 3 or more files: stop and split it.

## Report
State which cycle check ran and its result, or that none was available.
