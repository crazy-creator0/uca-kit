# Workflow: Existing Project Tech-Stack Migration

## Read first
Use when: replacing or substantially changing the language, framework, database, runtime, hosting or build system of existing code.
Not when: a new project choosing its first stack (`new-project`); a routine dependency bump with no breaking change.
Must do: report the current stack from files you inspected; confirm what "change the stack" means; compare with a smaller alternative; get the plan approved before migrating; move in small reversible steps.
Done when: parity and failure cases are checked on the new stack, the way back is known, and the report says what was not verified.
Stop here if: the user only asks whether to migrate; sections 1 to 3 are enough.
Read on only for: each numbered section as you reach its step.

Use this workflow when a user asks to replace or substantially change an existing project's language, framework, database, runtime, hosting, build system, or major infrastructure. It is intentionally more cautious than choosing a stack for a brand-new project.

## Parts
- 1. Establish the current state before proposing a replacement; 2. Confirm what “change the stack” means; 3. Evaluate before committing to a direction: `.agents/workflows/stack-migration/assess.md`
- 4. Create a migration plan and decision gate; 5. Migrate incrementally: `.agents/workflows/stack-migration/migrate.md`
- 6. Verify parity, failure cases, and reversibility; 7. Report honestly: `.agents/workflows/stack-migration/verify.md`
