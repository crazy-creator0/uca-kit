# UCA Kit roadmap (v2.0 plan)

This roadmap is a hypothesis to test, not a claim that planned behavior already works. Revise it after Phase 0 evidence.

## Product principle

**Understand the goal → discover the relevant flow → test with evidence → make the smallest safe fix → verify and report honestly.**

Use lightweight discovery for small tasks and expand investigation only when evidence or risk justifies it. Keep external skill discovery user-requested; use technical web research when current or external evidence is needed for an audit, logic review, security review, or version-specific question.

## Phase 0 — Baseline measurement

**Work**
- Choose 5–10 realistic tasks on a small representative repository.
- Run each with and without UCA Kit using the same host/model and comparable conditions.
- Record task success, regression/test status, time, token usage when available, files touched, correct skill selection, and whether limitations were reported.
- Publish the task set, method, results, and failures. Label unavailable metrics as unavailable; do not invent token counts.

**Finish line:** A reproducible baseline report exists, including unsuccessful runs and known measurement limitations.

## Phase 0b — Packaging and front-door readiness

**Work**
- Confirm the repository description and topics.
- Keep the existing MIT license only if ownership and third-party license compatibility are confirmed.
- Reconcile repository URLs, package name, README commands, and publishing instructions.
- Prepare tagged-release and npm publishing steps; verify package name availability, packed contents, and clean-install behavior before publishing.
- Add `SECURITY.md` and `CONTRIBUTING.md`.
- Rewrite the README front door around the problem, short workflow, quick start, support limitations, and demo.
- Do not promote widely yet. A private/limited preview or a clearly labeled early package can be used for testing, but broad promotion waits until Phase 2 benchmark evidence.

**Finish line:** Metadata and links agree; license and security/contribution guidance are present; package dry-run and clean-install checks are documented. Publishing itself is a maintainer decision and must not be implied complete unless verified.

## Phase 1 — Audit and shrink skills

**Work**
- Review every current skill against real tasks.
- Keep a skill only when it changes agent behavior or adds distinct, useful procedures.
- Merge overlapping skills; remove redundant ones.
- Give each retained skill clear triggers, boundaries, steps, expected output, and verification criteria.

**Finish line:** At most 10 high-value skills remain, and every retained skill has a one-line reason to exist plus a test/example showing its value. If evidence supports a different count, document why rather than preserving a vanity target.

## Phase 2 — Core workflow and Project Card

**Work**
- Add scope-first discovery and effort scaling to the concise core instructions.
- Add a `PROJECT.md` card with stack, entry points, run/test commands, key conventions, and paths to avoid. Create it on first meaningful task only if absent; update when the project changes noticeably.
- Add strict tester guidance: expected behavior, real execution flow, edge cases, reproducible evidence, regression tests, and honest reporting.
- Add safe-change checkpoints and explicit approval gates for destructive or high-impact actions.
- Add validation and CI checks, including a core-instruction size budget of about 100 lines.
- Test representative flows on at least two coding tools; record exact product/version, files loaded, skill discovery, and web-search capability. Mark untested combinations as **untested**.

**Finish line:** The same benchmark task set passes the agreed acceptance checks on at least two recorded tool/version combinations; results are compared with Phase 0, including regressions and token/time trade-offs. Do not claim improvement unless measurements support it.

## Phase 3 — Safe, optional discovery

**Work**
- External skill search runs only when the user explicitly requests it.
- Search and compare candidates; inspect the actual skill contents before recommending installation.
- Show source, pinned commit/version, license, maintenance signals, compatibility, and security concerns.
- Never auto-install or execute third-party scripts. Get explicit approval before installation or any execution.
- Keep technical web research separate from external skill search. Use authoritative sources for current/version-specific claims; cite sources and dates where supported.

**Finish line:** An automated test proves external search cannot install a skill without approval; another test verifies source/version provenance and content preview are shown before install. If these tests do not exist, the feature is not considered done.

## Phase 4 — Evaluate, document, and improve

**Work**
- Re-run the baseline tasks on the same hosts and models.
- Publish a short before/after demo using the same task with and without the kit.
- Track task success, test status, time, token usage when measurable, scope drift, routing accuracy, and honest limitation reporting.
- Update the README and compatibility matrix with tested product versions and dates.
- Review issues and failures; make one evidence-backed change at a time.

**Finish line:** A reproducible comparison and short demo are published; README claims match the evidence; every supported-tool row is either tested with product/version/date or explicitly marked **untested**.

## Release policy

- Do not describe planned capabilities as shipped.
- Do not claim universal compatibility, lower token usage, or better outcomes without reproducible evidence.
- Publishing a package version and promoting the product broadly are separate decisions.
- Revisit this plan after Phase 0; update the version label and roadmap based on measurements.
