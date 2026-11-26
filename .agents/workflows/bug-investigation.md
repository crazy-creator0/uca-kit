# Workflow: Bug Investigation

## Read first
Use when: a bug needs a full investigation across client, network, backend and database.
Not when: no single symptom: run the audit first (below), then bring each finding here.
Must do: a failing reproduction before changing code; a root cause only with evidence; a regression test; never ask for secrets, and redact credentials, cookies, tokens, private keys and personal data.
Done when: the reproduction passes as the user hit it; findings, evidence, root-cause confidence, fix, checks and unknowns reported.
Read on only for: "Steps" before investigating.

## Steps
Follow: Symptom → Investigate → Hypothesis → Evidence → Root cause → Fix → Prevention.

No single symptom? When the user asks to find what is missing or broken in general, run the audit first (`.agents/workflows/audit.md`, read-only: the checks, the request list and the fix plan), then take its findings one at a time through the steps below, most severe first. Report the findings you did not fix.

1. Capture expected/actual behavior and exact reproduction steps.
2. Collect relevant code, sanitized logs, status codes, environment/version details, and recent changes.
3. Trace the actual request path across client, network, backend, and database as applicable.
4. Rank plausible hypotheses and state what evidence would distinguish them.
5. Run a minimal reproduction, targeted test, or controlled experiment. Do not change code until a failing reproduction exists.
6. Confirm root cause only when evidence supports it; otherwise identify the next useful investigation.
7. Apply the smallest durable fix.
8. Add a regression test that fails before the fix and passes after, or other appropriate prevention.
9. Repeat the original reproduction the way the user hit it (see "Check it like the user" in `testing-and-code-review`) and run relevant tests.
10. Report findings, evidence, root-cause confidence, fix, verification, and remaining unknowns.
