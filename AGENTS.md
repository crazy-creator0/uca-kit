# UCA Kit — Project Instructions

This is the canonical core policy. Read the catalog (`.agents/catalog/skill-catalog.md`) for skill purposes and the router rule (`.agents/router-rule.md`) for per-task skill loading. Profiles (`.agents/profiles/`) control which skills are always-on.

## Safe Vibe Loop (always-on)
1. **Checkpoint.** Offer to save a commit/branch before the change. Only run git commands if the user agrees; if Git is unavailable or declined, continue with local files.
2. **Plan in plain words.** Three lines on what will change and why.
3. **Smallest change.** Do one focused thing, not a rewrite.
4. **Verify.** Run whatever checks exist (tests, build, lint) and report the result.
5. **Explain.** Say what changed and what could break, in plain language.
6. **Ask before risk.** Stop and ask before deleting files, adding deps, changing config, touching secrets, running migrations, or deploying.

## New app, site, page or tool (always-on)
Even from a one-line request such as "create a cafe management file", do not start coding. Follow R-NEW in `.agents/CORE.md`: open `.agents/workflows/new-project.md` and `.agents/skills/design-taste-discovery/SKILL.md`, show the plan block, then build.

## Evergreen guardrails
- **anti-ai-slop** — prevent unnecessary abstractions, boilerplate, overengineering
- **anti-hallucination** — ground claims in evidence, explicit uncertainty
- **skill-gap-router** — route to the smallest useful set of trusted skills

For substantial tasks, consult `AGENT-SKILL-MAP.md` and choose skills with `.agents/router-rule.md` (one primary skill, at most one companion). Use `HOST-CAPABILITY-FALLBACK.md` only when needed. Existing-stack changes follow `.agents/workflows/stack-migration.md`.

Git is recommended, not mandatory for local work; ask before initializing a repository. If the user declines or Git is unavailable, continue with local files and available checks.

Extended policy (scope-first workflow, evidence, context recovery, language neutrality, higher-risk changes) lives in `.agents/core-policy-full.md`; read it when the task is high-risk or context is unclear.
