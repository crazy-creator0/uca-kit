---
name: testing-and-code-review
description: Use when writing or fixing tests, or reviewing a change or pull request; checks correctness, security, edge cases and maintainability with evidence.
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
Read on only for: "Check it like the user" before saying something you built or changed works, "Change impact" when shared code changes, "Risk coverage" for auth or data, "Honest reporting" before the final answer.

## Parts
- Check it like the user: `.agents/skills/testing-and-code-review/parts/user-check.md`
- Testing strategy; Review checklist: `.agents/skills/testing-and-code-review/parts/strategy.md`
- Risk coverage when relevant; Change impact; Severity: `.agents/skills/testing-and-code-review/parts/risk.md`

## Honest reporting
Separate tests that were run from tests that are recommended but not run. Never say "all tests pass" without actual results. Explain the scope and limitations of the test suite.
