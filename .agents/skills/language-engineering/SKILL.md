---
name: language-engineering
description: Apply maintainable engineering practices across programming languages and stacks; use for coding tasks when no more specific, genuinely additive skill is needed.
metadata:
  domain: general
  triggers: a language or stack with no dedicated skill
  prerequisites: the detected language and tooling
  outputs: a change that follows the project conventions
  priority: situational
---

# Universal Language Engineering

This skill is language-agnostic. Apply it to the language(s) actually present in the task and repository; do not treat placeholders or examples as literal language names. It is the shared baseline for all supported languages, not a claim that the project uses one language or that every language needs a separate skill.

## Order of work
1. Inspect the repository's languages, conventions, and commands.
2. Make the smallest change that solves the task.
3. Run the repository's own checks.
4. Report only the checks you ran.

## Inspect first
- Inspect nearby source, public APIs, project configuration, dependency manifests, build scripts, tests, and established conventions before choosing an implementation.
- Identify all relevant languages, frameworks, runtimes and version constraints, package managers, and available verification commands. Polyglot repositories may require more than one toolchain.
- Follow the repository's conventions; do not assume a tool, dependency, or skill exists just because it is familiar.
- Check existing imports and dependency relationships before moving code. Preserve clear dependency direction and avoid introducing cycles.

## Implementation
- Prefer the smallest clear change that solves the requested problem. Avoid speculative abstractions, unnecessary dependencies, and unrelated refactors.
- Use idioms and standard-library capabilities appropriate to the detected language and version.
- Keep names clear, responsibilities cohesive, and control flow straightforward.
- Use types, schemas, or explicit contracts where they improve correctness and maintainability; do not add noisy annotations that conceal uncertainty.
- Handle expected failures specifically. Do not swallow errors, silently hide failures, or fabricate successful defaults.
- Manage resources and lifetimes explicitly using the language's established mechanisms (for example, scoped cleanup, disposal, or context management).
- Avoid hidden global state, unsafe shared mutable state, surprising default values, and premature abstraction. Make state ownership and side effects clear.
- Respect API compatibility, security boundaries, secrets, privacy, and user-owned changes.
- Follow the project's established formatting, linting, typing, build, testing, and packaging conventions where relevant.

## Testing and verification
- Derive checks from the repository's actual toolchain: focused tests first, then relevant broader tests, lint, type checks, builds, or static analysis when available.
- Test behavior, important edge cases, and regression risks. Use mocks at external boundaries when appropriate, not as a substitute for testing the behavior itself.
- If a command or toolchain is unavailable, investigate a reliable alternative when useful and state the limitation honestly.
- Report only checks actually run and their observed outcomes.

## Specialist guidance
Use a language-, framework-, or domain-specific skill only when it adds concrete, relevant guidance beyond this baseline. Do not load a specialist that merely repeats this guidance. A missing specialist skill never means a language is unsupported; use repository evidence and reliable project documentation to proceed.
