---
name: testing-and-code-review
description: Design meaningful tests and review code for correctness, security, performance, readability, and maintainability.
metadata:
  domain: quality
  triggers: write tests, review a diff, check quality, prepare a release
  prerequisites: the code under test or the diff
  outputs: meaningful tests or a prioritized review
  priority: task
---

# Testing and Code Review

## Read first
Use when: writing tests, reviewing a diff, or checking quality before a release.
Not when: a bug needs a cause first (debugging); a one-line fix in a repo with no tests.
Must do: choose tests by risk; find what a change affects with a search, not from memory; report only tests you ran; list security findings first.
Done when: tests ran with their output shown, or the review lists findings by severity with affected and unaffected parts named.
Stop here if: a small diff adds no new logic; use the review checklist alone.
Read on only for: "Change impact" when shared code changes, "Risk coverage" for auth or data, "Honest reporting" before the final answer.

## Testing strategy
Choose tests according to risk:
- Unit tests for isolated business rules.
- API tests for contracts, validation, auth, and error responses.
- Integration tests for database and external boundaries.
- Component tests for UI behavior.
- End-to-end tests for critical user journeys.

Test meaningful edge cases: empty input/results, malformed data, duplicate requests, unauthorized access, missing resources, timeouts, failed dependencies, and concurrent updates where relevant.

## Review checklist
1. Correctness and acceptance criteria.
2. Simplicity, naming, and readability.
3. Security, authorization, and data privacy.
4. Error handling and edge cases.
5. Database correctness and query behavior.
6. Performance based on evidence.
7. Test quality and regression coverage.
8. Accessibility and UX where relevant.
9. Observability and operational impact.
10. Maintainability and documentation.

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

## Honest reporting
Separate tests that were run from tests that are recommended but not run. Never say "all tests pass" without actual results. Explain the scope and limitations of the test suite.
