# UCA Kit Task-to-Skill Map

Use only when routing is ambiguous or work crosses domains. For an obvious small task, skip the map and open the relevant skill directly. Core rules live in root `AGENTS.md`.

**Fast path:** follow `.agents/router-rule.md` (the single source of truth): one primary skill, plus at most one companion for work that crosses two areas. Always-on subsets live in `.agents/profiles/`. Skill purposes and "when not to use" are in `.agents/catalog/skill-catalog.md`.

| Task | Read first | Add only when relevant |
|---|---|---|
| Greeting/simple question | None | Ask what help is needed; no project scan or edits |
| Language-specific implementation | `language-engineering` when no genuinely additive specialist applies | Inspect actual language(s), framework(s), build/test setup and repository conventions; lack of a dedicated skill is not a blocker |
| New project / local-first setup | `.agents/workflows/new-project.md` | Recommend Git and explain benefits; ask before `git init`; if declined or unavailable, continue locally |
| Backend/API | `backend-api` | Relevant language, database and security guidance based on the actual stack and boundaries |
| Frontend/UI | `frontend-engineering` | `design-taste-discovery` for visual decisions; `frontend-visuals-and-3d` only for real advanced 3D/canvas/GPU work |
| Make something faster or lighter | `performance-engineering` | `debugging` first if the behavior is wrong; the skill that owns a known fix (for example `database-engineering` for an index) |
| Data files, pipelines, metrics, analysis | `data-engineering-analytics` | `database-engineering` for application schemas; `testing-and-code-review` for checks |
| Bug | `debugging` | Skill for the affected domain, if useful |
| Import error / circular import | `import-hygiene` | `debugging` if the cause is still unclear |
| Database/schema | `database-engineering` | Relevant implementation/security guidance for API, access or privacy boundaries |
| Auth/security/privacy | `application-security` | Relevant implementation skill + `testing-and-code-review` |
| Review/testing | `testing-and-code-review` | Affected domain skill; independent reviewer only if risk justifies it |
| Release/deployment | `testing-and-code-review` | `application-security`; `cloudflare-operations` only for Cloudflare |
| Existing-stack migration | `.agents/workflows/stack-migration.md` | `anti-hallucination`, `anti-ai-slop`, `testing-and-code-review`, plus affected domain skills |
| Ambiguous task or missing capability | `skill-gap-router` | Only relevant domain skills or reliable project documentation |
| Design + business/service offer | `design-taste-discovery` | Task-specific strategy brief; there is no dedicated canonical business-strategy skill |
| Documentation/codebase explanation | `anti-hallucination` | Domain skill only when source behavior needs analysis |

Actually open each selected `.agents/skills/<name>/SKILL.md` before relying on it. A path or mention does not prove a skill was loaded. The skill catalogue is optional guidance, not a list of supported languages or a capability boundary.

## Agent and context budget
- Delegate only when the active host supports it and the benefit outweighs the coordination cost; otherwise work sequentially.
- Give specialists a short brief: goal, constraints, relevant paths, deliverable and checks. Reuse conclusions; do not send all skills or the entire chat history.

## Conditional guidance
- Context loss: recover current files and durable project records; never invent missing decisions or create files merely to fill memory gaps.
- Host feature uncertain: consult `HOST-CAPABILITY-FALLBACK.md` only then.
- Usage/privacy: exact values require host/provider metadata; otherwise mark unknown/estimated. Consult `USAGE-PRIVACY.md` when needed.
- Existing stack change: inspect current state, compare keeping/changing/incremental alternatives, plan compatibility/data/operations/rollback, and obtain approval for high-impact scope unless explicitly authorized. Use the migration workflow.
- Optional tools/third-party skills are not assumed installed. Inspect and ask before persistent installs.

Canonical skills: `anti-ai-slop`, `anti-hallucination`, `application-security`, `backend-api`, `cloudflare-operations`, `data-engineering-analytics`, `database-engineering`, `debugging`, `design-taste-discovery`, `frontend-engineering`, `frontend-visuals-and-3d`, `import-hygiene`, `language-engineering`, `performance-engineering`, `skill-gap-router`, `testing-and-code-review`.
