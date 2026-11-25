---
name: anti-ai-slop
description: Use when about to add an abstraction, dependency, wrapper or pattern, or when finishing a change; keeps code free of overengineering and placeholder work.
metadata:
  domain: guardrail
  triggers: adding abstractions, wrappers, new dependencies, filler wording
  prerequisites: a proposed change or a draft reply
  outputs: a smaller diff and a plain reply
  priority: guardrail
---

# Anti-AI-Slop Engineering

## Read first
Use when: about to add a dependency, an abstraction, a new file or a service.
Not when: a focused edit that follows the project's patterns; the No slop line in `.agents/CORE.md` covers it.
Must do: No slop, in the core's guardrails (`.agents/CORE.md`); it sits there so every task reads it.
Done when: each new dependency, abstraction, file or service passes the "Decision test" below.
Stop here if: the change adds none of those.
Read on only for: "Reject" and "Decision test" before adding one.

Code quality means satisfying real requirements with understandable, verifiable code—not maximizing code volume or architectural complexity.

These rules cut needless code, not features. The small extras a user of this kind of product expects (a best score and a sound switch in a game, undo in an editor, a clear empty state) are requirements once the plan lists them; build them simply, and never drop one to make the diff smaller.

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
Report with R-FINISH in `.agents/CORE.md`, adding in one line why the change is enough. Never call something production-ready without a defined scope and evidence.
