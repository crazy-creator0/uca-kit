If the request changes or replaces the existing language/framework/database/runtime/deployment stack, stop the normal feature flow and use `.agents/workflows/stack-migration.md` to assess the migration and approval boundary first.

# Workflow: Feature Development

1. Restate the user-visible behavior and acceptance criteria.
2. Inspect relevant files, architecture, API contracts, and tests.
3. Identify the smallest vertical slice and likely failure modes.
4. State a short plan and any important assumptions.
5. Implement a focused change using existing conventions.
6. Add/update tests for success, invalid input, authorization, and relevant edge cases.
7. Run the most targeted checks first; broaden checks if useful.
8. Review security, data integrity, accessibility, and performance as relevant.
9. Summarize files changed, behavior, checks actually run, and remaining risks.
10. Suggest one next step, not an unrelated feature list.

Avoid unrelated refactors. Never report checks as passing unless their actual results are known.
