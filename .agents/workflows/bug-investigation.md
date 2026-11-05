# Workflow: Bug Investigation

Follow: Symptom → Investigate → Hypothesis → Evidence → Root cause → Fix → Prevention.

1. Capture expected/actual behavior and exact reproduction steps.
2. Collect relevant code, sanitized logs, status codes, environment/version details, and recent changes.
3. Trace the actual request path across client, network, backend, and database as applicable.
4. Rank plausible hypotheses and state what evidence would distinguish them.
5. Run a minimal reproduction, targeted test, or controlled experiment. Do not change code until a failing reproduction exists.
6. Confirm root cause only when evidence supports it; otherwise identify the next useful investigation.
7. Apply the smallest durable fix.
8. Add a regression test that fails before the fix and passes after, or other appropriate prevention.
9. Repeat the original reproduction and run relevant tests.
10. Report findings, evidence, root-cause confidence, fix, verification, and remaining unknowns.

Never ask for secrets. Redact credentials, cookies, tokens, private keys, and personal data.
