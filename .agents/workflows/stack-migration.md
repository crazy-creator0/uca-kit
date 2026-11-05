# Workflow: Existing Project Tech-Stack Migration

Use this workflow when a user asks to replace or substantially change an existing project's language, framework, database, runtime, hosting, build system, or major infrastructure. It is intentionally more cautious than choosing a stack for a brand-new project.

## 1. Establish the current state before proposing a replacement

Inspect, where available and relevant:
- Package/dependency manifests and lockfiles, runtime/tool versions, build configuration, and generated-code conventions.
- Application entry points, modules, routes, component boundaries, data models, migrations, auth/session flows, and external integrations.
- Environment variable names and config conventions without printing secret values.
- Tests, CI workflows, container/deployment files, monitoring, backups, and rollback path.
- Existing architecture decisions, constraints, recent changes, and user-owned working-tree edits.

Report the current stack from inspected evidence. If files disagree or key areas are inaccessible, say so; do not infer a stack from a folder name alone.

## 2. Confirm what “change the stack” means

Identify the target technology and migration scope:
- Full replacement vs one bounded component.
- Required behavior and compatibility constraints.
- Data retention/migration needs, downtime tolerance, hosting/runtime limits, team familiarity, budget, and timing.
- Whether the user wants a recommendation/plan or has approved implementation.

If the target or a high-impact constraint is unknown, ask one focused question. Do not start a large migration while guessing.

## 3. Evaluate before committing to a direction

Compare the current stack, proposed target, and a smaller alternative (such as upgrading a component, adding an adapter, or migrating incrementally) where useful. Explain:
- The concrete problem the new stack solves and evidence of that problem.
- Benefits, costs, operational burden, ecosystem/dependency risk, and learning/maintenance impact.
- Compatibility and migration risks, including data, auth, APIs, builds, tests, and deployment.
- Assumptions and unknowns that could change the recommendation.

Do not recommend a rewrite merely because the target is fashionable or familiar. A stack change is a product/architecture decision, not a bulk find-and-replace.

## 4. Create a migration plan and decision gate

Before broad or destructive edits, present a compact plan with:
- Current → target stack and exact in-scope components.
- NOW / NEXT / LATER phases or equivalent small milestones.
- Behavior/contract parity requirements and measurable acceptance checks.
- Data/config/secrets handling, dependency changes, deployment strategy, backup and rollback.
- Test commands and required integration/smoke tests.
- Files or systems expected to change, and explicitly excluded areas.

For a broad rewrite, destructive migration, irreversible data change, or production-impacting step, obtain explicit user approval for that scope before acting. A request to “plan a migration” is not permission to implement it. If the user has already explicitly authorized implementation, stay within that scope and stop for approval if material risk/scope changes emerge.

## 5. Migrate incrementally

- Prefer small vertical slices and adapters/strangler-style transitions where practical.
- Preserve behavior before optimizing or redesigning unrelated parts.
- Keep old and new implementations coexisting only when the plan calls for it; define the exit/removal conditions.
- Update source, manifests, lockfiles, configuration, documentation, CI and deployment together when required.
- Do not delete the old implementation or remove dependencies until references are traced and the replacement passes acceptance checks.
- Avoid mass replacements and generated bulk files without inspecting the resulting diff.
- Never expose secret values while inspecting configuration.

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
