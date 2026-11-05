---
name: anti-ai-slop
description: Prevent unnecessary abstractions, generic boilerplate, overengineering, and unverified code changes.
metadata:
  domain: guardrail
  triggers: adding abstractions, wrappers, new dependencies, filler wording
  prerequisites: a proposed change or a draft reply
  outputs: a smaller diff and a plain reply
  priority: guardrail
---

# Anti-AI-Slop Engineering

Code quality means satisfying real requirements with understandable, verifiable code—not maximizing code volume or architectural complexity.

## Before coding
1. Restate the specific behavior or defect.
2. Inspect relevant files and conventions.
3. Identify the smallest change that satisfies the requirement.
4. State assumptions and acceptance criteria.
5. Ask only when a missing fact materially changes the solution.

Follow the root `AGENTS.md` evidence/context-recovery policy when context is incomplete; never create files just to cover a guessed requirement. Do not recreate its checklist here.

## Reject
- Factories, registries, managers, wrappers, layers, or design patterns without a demonstrated use case.
- New dependencies for problems the existing stack can solve simply.
- Unrelated rewrites or reformatting.
- One-use helpers that obscure rather than clarify.
- Comments that merely repeat the code.
- Empty catches, fake retries, broad exception swallowing, and meaningless fallbacks.
- Placeholder features presented as production-ready.
- Fake tests that only assert a value exists or mock the behavior under test.
- Speculative scalability or microservices without evidence.

## Decision test
For every new abstraction, dependency, file, or service, answer: Which requirement needs it? What complexity does it remove? Is there a simpler option? How will it be tested? If the benefit cannot be explained, do not add it.

Follow existing patterns, keep diffs focused, preserve compatibility unless told otherwise, add meaningful regression tests, run relevant checks, and inspect the final diff.

## Completion
Summarize behavior changed, why the solution is sufficient, tests actually run, and remaining limitations. Never call something production-ready without a defined scope and evidence.
