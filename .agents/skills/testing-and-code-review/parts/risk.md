## Risk coverage when relevant

Choose only the checks justified by the change. Consider requirements/scope, invalid inputs, error/timeouts, authentication/authorization, privacy/secrets, data integrity/migrations, retries/concurrency/partial writes, API/dependency contracts, UI states/accessibility, performance/cost, regressions, and operational rollback/monitoring. For a small isolated change, do not turn this into a full-system audit.

## Change impact
Before testing or reviewing a change, work out what it can reach, then test that and not only the edited lines:
1. List what changed: files, functions, and any public contract (API shape, schema, config key, exported name, file format).
2. Find the callers and dependents with a search, not from memory: imports, call sites, routes, jobs, templates, docs and tests that mention the changed names.
3. Mark each one as affected, possibly affected, or unaffected, with the file that shows it.
4. Run or add tests for the affected parts, and say which possibly affected parts you could not check.
5. For a changed contract, name who must change with it (clients, migrations, deploy order) and how to roll back.

## Severity
- Critical: exploitable security issue, severe data-loss risk, or major outage risk.
- High: broken core behavior or significant security/reliability defect.
- Medium: meaningful correctness, maintainability, or performance issue.
- Low: minor cleanup or optional improvement.

For each finding, provide location, evidence, impact, fix, and verification. Do not invent findings.
