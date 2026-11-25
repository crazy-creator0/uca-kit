## Steps
Where a step names one section of a skill, read that section only: `node scripts/uca-read.cjs <skill> --section "<heading>"`.

1. Clarify users, problem, constraints, data sensitivity and hosting; the main task in the plan block is the acceptance criteria. If the product has a screen, do `design-taste-discovery` Step 1 here (real objects and states, daily jobs in their own words, believable sample data).
2. Inspect repository and existing conventions before choosing a stack.
3. Separate confirmed requirements from assumptions.
4. Choose the simplest suitable stack for the confirmed requirements and existing conventions; do not assume a language or framework in advance. For a screen, follow "Stack decision" in `frontend-engineering`, and write the look as a brief with `design-taste-discovery` Step 3 before building.
5. Sketch the request/data flow and a minimal schema.
6. Identify security boundaries and test strategy.
7. Create a prioritized backlog; define a small MVP.
8. Implement the first vertical slice end-to-end, with realistic data from the domain. For a screen, review it with `design-taste-discovery` Step 7 and run `node scripts/uca-design-check.cjs` on the UI files when it exists.
9. Add tests and verify the slice. For a medium or large build, when `scripts/uca-readiness.cjs` is installed, run `node scripts/uca-readiness.cjs .` (it includes the Senior Bar, `scripts/uca-senior-check.cjs`, plus the audit and link checks), fix the failing basics that are in scope (README, .gitignore, .env.example, test command), and report the result honestly; it is a static checklist, not proof of quality.
10. Medium or large build: document setup, decisions, and next milestone.
11. Check whether the project is already under Git. If not, explain the benefits of Git and ask whether the user wants to initialize it; if they decline, continue locally without blocking project work.
