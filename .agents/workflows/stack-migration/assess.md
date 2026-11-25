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
