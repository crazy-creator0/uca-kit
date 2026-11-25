## 6. Verify parity, failure cases, and reversibility

Use relevant existing project checks first, then add targeted checks for changed boundaries. Verify, as relevant:
- Build, lint/type checks, unit/integration/e2e tests and production build.
- API and event contracts, routes, status/error behavior, validation, auth/authorization and sessions.
- Data migration correctness, row/count reconciliation, indexes/constraints, rollback or restore rehearsal.
- Environment/config parity, CI workflow, container image, deployment, health checks, observability and smoke tests.
- Accessibility and user-visible behavior when UI frameworks change.
- Dependency audit or security checks when the trust/runtime/dependency surface changes.

A test passing is evidence only for what that test covers. Do not claim parity, successful deployment, or safe rollback unless actually verified.

## 7. Report honestly

Conclude with:
- Target stack and rationale, including why keeping/changing the current stack was chosen.
- Files/components migrated and intentionally not migrated.
- Checks actually run and their observed results.
- Data/deployment/rollback status.
- Known gaps, assumptions, risks, and next migration slice.
- Any removed dependency/component and evidence it is no longer needed.

Use “partially migrated” when only part of the system moved. Never describe a planned or generated change as a completed/verified migration.
