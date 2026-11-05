---
name: debugging
description: Investigate bugs using a reproduction, ranked hypotheses, evidence, root-cause analysis, and a regression test.
metadata:
  domain: diagnosis
  triggers: bug, error, crash, stack trace, it stopped working
  prerequisites: a symptom or error output
  outputs: reproduction, evidence log, root cause status, regression test
  priority: task
---

# Debugging Playbook

## Read first
Use when: a bug, error, crash, or "it stopped working" needs a cause.
Not when: a new feature with no failure; slowness with no fault (performance-engineering).
Must do: no code change before a failing reproduction you have actually seen; keep facts apart from guesses; never ask for secrets or switch off security checks to "fix" it; after two failed fixes, stop and report.
Done when: the original reproduction passes, and a regression test fails without the fix and passes with it, both run.
Stop here if: the root cause is already confirmed and you only need the fix and its check.
Read on only for: the output format (before reporting) and the Cloudflare note (edge or DNS symptoms).

Always follow:

**Symptom → Investigate → Hypothesis → Evidence → Root cause → Fix → Prevention**

Do not change code until a failing reproduction exists. A reproduction is a failing test, a command with its output, or a logged trace you have actually seen. If you cannot reproduce the bug, say so and ask for the missing evidence instead of guessing a fix.

## 1. Symptom
Write expected versus actual behavior, the exact reproduction steps, how often it happens, who or what is affected, and the impact.

## 2. Investigate
Collect the smallest useful evidence: the relevant code, a sanitized log or traceback, console or network details, HTTP status, environment and versions, and recent changes. Never ask for secrets. List the layers this project really has (read the code first), for example client → router → middleware → controller → service → database → response, and trace only those, from the failing point outward.

## 3. Hypothesis
List plausible causes in priority order. For each, write what evidence would confirm it and what would reject it. Test the cheapest, most likely one first.

## 4. Evidence
Use a minimal reproduction, a targeted log line, or a focused test. Change one thing at a time and read the actual output after each change. Record each result as confirmed, rejected, or inconclusive. If a hypothesis is rejected twice, form a new one rather than retrying it.

## 5. Root cause
Separate observed facts from inference. If the cause is not confirmed, write "root cause not yet confirmed" and name the next experiment.

## 6. Fix
Make the smallest durable change that addresses the confirmed cause, in one area at a time. Explain why it fixes the cause and what it could affect. After two failed fix attempts, stop and report what was tried.

## 7. Prevention
Add a regression test that fails before the fix and passes after; run it both ways when you can. Re-run the original reproduction and the relevant existing tests. Add validation, monitoring, or documentation where it fits.

## Output format
- Symptom (expected vs actual)
- Reproduction (command or test, and its result)
- Hypotheses (ranked, with confirming and rejecting evidence)
- Evidence log (each check and its result)
- Root cause status (confirmed or not yet confirmed)
- Fix
- Verification (original reproduction and tests actually run)
- Prevention

Do not recommend random configuration changes, blanket cache purges, disabling TLS or security checks, or broad rewrites without evidence. For Cloudflare-related failures, check DNS and proxy, edge rules and cache, origin connectivity and TLS, application logs, and database health separately.
