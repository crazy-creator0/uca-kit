# UCA Kit (Universal Coding Agent Kit) — Agent Layout

This folder contains on-demand reusable Agent Skills and task-specific engineering workflows used by UCA Kit. This explanatory README is repository documentation, not a prompt to load the whole folder.

## Shared source of truth
- Root `AGENTS.md` — canonical concise policy. `.agents/AGENTS.md` is a compatibility fallback only.
- `.agents/core-policy-full.md` — extended policy (evidence, context recovery, language neutrality, higher-risk changes) read only when needed.
- `.agents/catalog/skill-catalog.md` — every skill's purpose plus when to use and when not to use it.
- `.agents/router-rule.md` — the single source of truth for skill loading: one primary skill per task plus at most one companion; tags are optional.
- `.agents/profiles/` — always-on skill subsets (`minimal`, `fullstack`, `frontend`, `security-focused`); `profiles.json` is the machine-readable source the installer uses.
- `.agents/skills/<skill-name>/SKILL.md` — focused reusable skills using the Agent Skills format; open only the relevant ones.
- `.agents/workflows/` — workflows that can be opened manually or adapted into native prompts, commands, or subagents.
- `AGENT-SKILL-MAP.md` — role-to-skill/tool routing, specialist activation and context-budget guidance.
- `HOST-CAPABILITY-FALLBACK.md` — detect supported host features and fall back when native instructions, skills, agents, hooks or usage APIs are missing.
- `USAGE-PRIVACY.md` and `scripts/uca-usage.cjs` — local aggregate usage ledger and budget guard, with explicit host-integration limitations.

## Skill areas
- Universal language engineering across programming languages and stacks
- Frontend engineering and design-taste discovery
- Backend/API engineering
- Database engineering
- Application security
- Cloudflare operations
- Debugging
- Testing and code review
- Anti-slop engineering and anti-hallucination
- Progressive skill-gap routing

## Portability
Multiple coding agents support the `.agents/skills/` convention, but discovery and invocation vary by product and version. If a host does not discover a skill automatically, read its `SKILL.md` directly or follow `PLATFORM-SETUP.md` to use the host's native location. Avoid keeping conflicting copies without a clear sync process.

## Rules of use
Inspect the real project first, choose only relevant guidance, verify claims with actual output, protect existing behavior, and ask before adding third-party dependencies or overwriting persistent files.
