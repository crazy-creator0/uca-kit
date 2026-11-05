# Skill Catalog — UCA Kit

> **Purpose:** This catalog maps every skill to its exact purpose, when to use it, and when NOT to use it.  
> **Goal:** By reading this, a maintainer can instantly see which skills are evergreen (always applicable) vs. stack-specific vs. optional. The router rule (section 6) uses this catalog to decide what to load.

| # | Skill | When TO use (1 sentence) | When NOT to use (1 sentence) | Lines |
|---|------|---|---|---|
| 1 | **anti-ai-slop** | Use when the agent is about to add a factory, registry, manager, wrapper, or any design pattern without a demonstrated use case. | If the change clearly satisfies a real requirement with the simplest possible option, this skill can be skipped. | 22 |
| 2 | **anti-hallucination** | Use when the agent is proposing a change based on faulty assumptions, incorrect recall of APIs, or unsupported claims. | If the agent has just verified the change against the actual project files and tests pass, this skill is unnecessary. | 22 |
| 3 | **application-security** | Use when the task touches secrets, auth boundaries, input validation, or anything that could be a vulnerability. | If the task is purely cosmetic (UI text, layout) and never reaches data-access or network code, skip it. | 22 |
| 4 | **backend-api** | Use when designing or implementing a Python API, adding business logic, or defining authentication boundaries. | If the project is not Python-based or does not have an API layer, this skill adds nothing. | 22 |
| 5 | **cloudflare-operations** | Use when the project uses Cloudflare DNS, TLS, Workers, or caching and the task involves those features. | If the project has no Cloudflare involvement, this skill is dead weight. | 22 |
| 6 | **database-engineering** | Use when designing schemas, migrations, transactions, constraints, or reliable data access patterns. | If the project has no database or uses a SaaS back-end with no migration needs, skip it. | 22 |
| 7 | **debugging** | Use when investigating a bug, forming hypotheses, and looking for root-cause evidence. | If the task is a new feature with no reported failure, start from the "plan" skill instead. | 22 |
| 8 | **design-taste-discovery** | Use when the task involves UI/UX work, discovering user preferences, choosing components, canvas, 3D, or WebGPU effects. | If the task is pure backend, API, or infrastructure work, this skill is irrelevant. | 813 |
| 9 | **frontend-engineering** | Use when building accessible, responsive front-ends, integrating APIs, managing states, and ensuring measured performance. | If the project has no front-end (e.g., pure CLI, API, or data-science repo), this skill does not apply. | 310 |
| 10 | **frontend-visuals-and-3d** | Use when selecting or integrating UI components, canvas effects, 3D scenes, or WebGPU rendering based on the project's actual needs. | If the task does not involve visual effects, 3D, or canvas, this skill can be omitted. | 443 |
| 11 | **language-engineering** | Use when applying maintainable engineering practices across programming languages and stacks; only when the skill is genuinely additive. | If the practice is already the team's default or the project has a single dominant language, this skill adds no value. | 447 |
| 12 | **skill-gap-router** | Use when a task is ambiguous or crosses functional boundaries; route to the smallest useful set of trusted skills. | If the task is well-scoped and single-discipline, load only the relevant skill directly instead. | 248 |
| 13 | **testing-and-code-review** | Use when designing meaningful tests, reviewing code for correctness, security, performance, readability, and maintainability. | If the project has no test suite and the change is trivial (one-line fix), this skill can be skipped. | 280 |
| 14 | **import-hygiene** | Use when an import fails, a circular dependency appears, or code is moved between modules. | If the change touches no imports or module boundaries, skip it. | 140 |
| 15 | **performance-engineering** | Use when the goal is lower latency, less memory, a smaller bundle, or shorter run time, and it can be measured. | If something is broken or unexplained, start with debugging; if a known fix belongs to another skill (an index, say), use that skill. | 42 |
| 16 | **data-engineering-analytics** | Use when processing files or tables, building pipelines, cleaning data, defining metrics, or producing analysis numbers. | If the task is an application schema or migration, use database-engineering; if it is only how a chart looks, use the front-end skills. | 32 |

> **Note on "lines" column:** Approximate SKILL.md word-count ÷ 4, rounded. The real cost is the always-on context the host imposes when the skill is loaded.

---

## Evergreen vs. Stack-Specific vs. Optional

| Category | Skills (always potentially relevant) | Skills (stack-dependent) | Skills (optional/one-off) |
|---|---|---|---|
| **Evergreen** | anti-ai-slop, anti-hallucination, debugging, skill-gap-router, testing-and-code-review | — | — |
| **Stack-specific** | backend-api (Python), database-engineering (most stacks), application-security (web-relevant), performance-engineering (measurable goals), data-engineering-analytics (data work) | frontend-engineering, frontend-visuals-and-3d, design-taste-discovery, cloudflare-operations, language-engineering (multi-lang) | — |
| **Optional** | — | — | Any skill can be omitted on –profile minimal |

---

## Profile Definition (where skills get grouped)

| Profile | Skills Included | Intended User |
|---|---|---|
| **minimal** | anti-ai-slop, anti-hallucination, skill-gap-router | Vibe coders who want the absolute guardrails without any stack knowledge |
| **fullstack** | minimal + backend-api + database-engineering + testing-and-code-review | General-purpose agents working on typical web/apps repos |
| **frontend** | fullstack + frontend-engineering | Projects with a UI layer (React, Vue, plain HTML/JS) |
| **security-focused** | minimal + application-security | Projects where secrets, auth, or data protection are the primary concern |
| **all** | every skill in the catalog | Maintainers who want the full set and are willing to accept the context cost |

The installer (section 7) asks **one question** — "Which profile?" — and then loads only the skills listed for that profile. The router rule (section 6) checks the task tag and may further thin the load.
