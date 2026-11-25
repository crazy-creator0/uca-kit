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
