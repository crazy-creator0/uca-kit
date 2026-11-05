# Router rule — the single source of truth for loading skills

Other files (`AGENTS.md`, `AGENT-SKILL-MAP.md`, platform adapters) point here. If they seem to disagree, this file wins.

## Steps
1. **Greeting or plain question?** Load no skill. Just answer.
2. **Check the real stack first.** Look at the project's manifests and file types. Skip a stack-specific skill when its stack or layer is not there.
3. **Pick ONE primary skill** from the table below by what the task is trying to achieve, not by a word it contains. "Fix the typo in the database docs" is a docs edit, not database work; "the login test fails" is debugging. A task tag (a bold first word such as **bug** or **ui**) is an optional shortcut, never a requirement. Each skill's `metadata` (domain, triggers, prerequisites, outputs, priority) helps confirm a match; it does not replace judgment.
4. **Add at most ONE companion skill**, and only when the task clearly crosses two areas (for example, login code inside an API: `backend-api` + `application-security`).
5. **Say why in one line.** Tell the user which skills you chose and why. If the user names a skill or asks you to skip one, follow that instead, unless it would break a safety rule.
6. **Open the file.** Read `.agents/skills/<name>/SKILL.md` before relying on it. Naming a skill is not loading it. If it starts with a `## Read first` block, read that block first; keep reading only when the task needs more than its "Must do" and "Done when" lines, or a "Read on only for" condition applies.
7. **Guardrails are always on** (`anti-ai-slop`, `anti-hallucination`, `skill-gap-router`) and do not count toward the limit.

## Intent table
| The task is about… | Tag | Primary skill |
|---|---|---|
| A bug, error, crash, or "it stopped working" | **bug** | `debugging` |
| An import error, circular import, or moving code between modules | **import** | `import-hygiene` |
| Writing tests, reviewing a diff, checking quality, preparing a release | **test** | `testing-and-code-review` |
| Secrets, login, permissions, user input, privacy | **security** | `application-security` |
| An API, server routes, business logic | **api** | `backend-api` |
| Tables, schemas, migrations, queries | **db** | `database-engineering` |
| Screens, components, accessibility, state, front-end speed | **frontend** | `frontend-engineering` |
| Look and feel, style choices, "make it beautiful" | **ui** | `design-taste-discovery` |
| 3D, canvas, WebGL/WebGPU, heavy visual effects | **visuals** | `frontend-visuals-and-3d` |
| Making something faster or lighter: latency, memory, bundle size, profiling | **perf** | `performance-engineering` |
| Files, ETL pipelines, data cleaning, metrics, analysis numbers | **data** | `data-engineering-analytics` |
| Cloudflare DNS, TLS, Workers, caching | **cloudflare** | `cloudflare-operations` |
| A language or stack with no dedicated skill | **lang** | `language-engineering` |
| Planning, or deploying with no special platform | **plan** / **deploy** | none — use the guardrails |
| Unclear, or spans many areas | — | `skill-gap-router` |

## Workflows
A whole new product ("create a cafe management file", "make me a todo app") starts `new-project`, with `design-taste-discovery` as its companion when the product has a screen; in a project that already has code it is a feature, not a project. Open a workflow instead of guessing the steps when the task matches one: `new-project`, `feature-development`, `bug-investigation`, `production-deployment`, `stack-migration` (all in `.agents/workflows/`). A workflow counts as the primary item; add a skill only if the workflow says so.

## Edge cases
- **Skill not installed** (the active profile left it out): continue with the guardrails and do not guess the skill's contents.
- **No skill fits:** that is fine. Reason from the project's real files and say what you could not verify.
- **Unsure which row applies:** use `skill-gap-router`, or ask the user one short question.

To check a choice, run `node scripts/uca-route.cjs "<task>"`. It is a plain-keyword reference of this table, not a model; a real model's routing is only known from benchmark runs.
