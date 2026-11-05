---
name: debugging
description: Find the cause of a bug with a reproduction and evidence before changing code.
---

# Debugging (Lite)

Symptom → Investigate → Hypothesis → Evidence → Root cause → Fix → Prevention.

- Write expected vs actual behavior and the exact steps that reproduce it.
- Do not change code until a failing reproduction exists (test, command, or trace you ran). If you cannot reproduce it, say so and ask for evidence.
- Read the relevant code and real error output. Trace only layers this project has.
- List likely causes in order; say what would confirm or reject each.
- Change one thing at a time; a cause rejected twice is not retried.
- If the cause is not confirmed, say "root cause not yet confirmed" and name the next experiment.
- Add a regression test that fails before the fix and passes after, then re-run the original reproduction.
- No random config changes, cache purges, or broad rewrites without evidence.
