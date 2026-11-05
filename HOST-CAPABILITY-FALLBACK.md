# Host Capability Detection and Fallback Policy

UCA Kit is IDE-agnostic, but IDEs do not have identical instruction discovery, skills, subagents, plugins, hooks, or usage APIs. This policy explains how the lead agent should behave when a host is missing a feature, uses a different native format, or has not visibly loaded the expected instructions.

## Non-negotiable rule

**Inspect the active host; never assume every host supports the same features.** Do not rely on an `@agent` mention being understood, a skill being installed because a file exists, or usage being measured because a local ledger exists. Host support differs by product, version, configuration, model, and session.

## Capability-first workflow

Before substantial work:

1. **Identify the active host** from trustworthy environment/session evidence. If unknown, use the user’s stated IDE. Do not guess a product/version from the repo alone.
2. **Inspect instructions**: check root `AGENTS.md`, the host-specific adapter (for example `.cursor/rules/`, `CLAUDE.md`, `GEMINI.md`, or `.github/copilot-instructions.md`), and whether the active host exposes these files in its actual context/rule list. A file existing on disk does not prove it loaded.
3. **Check skill support**: determine whether the host has a native skill loader/listing and whether the relevant skill is visible. If not, open the minimum relevant `.agents/skills/<name>/SKILL.md` directly or use the host’s documented native skill path. Do not load the full skill catalogue.
4. **Check specialist support**: use the host’s documented subagent mechanism only if it is actually available. Inspect native agent definitions and the current session’s task/delegation tools. Do not assume OpenCode `@agent` syntax works in Cursor, Copilot, or another tool.
5. **Check usage/budget support**: determine whether the host exposes real usage metadata and a pre-call hook/tool interception point. If it does, use the matching adapter. If it does not, show unknown or a clearly-labelled estimate; the local ledger is not a universal interceptor.
6. **Choose the best supported path**, report relevant limitations briefly, and continue with the user’s task. Do not make users answer a long capability questionnaire when the environment itself can be inspected.

## Capability levels and fallback

| Capability | Preferred path | Fallback when unsupported or unverified |
|---|---|---|
| Project instructions | Host-native project instructions plus root `AGENTS.md` where supported | Give the lead a concise instruction summary and the exact paths to read; use a host-native custom-instruction file only when its official format is verified |
| Reusable skills | Native on-demand skill discovery | Read only the selected `SKILL.md` directly or place a reviewed copy in the host’s documented skill directory |
| Specialist roles | Host-native subagents with focused descriptions | One lead agent performs specialist workstreams sequentially and returns separate short handoffs |
| Parallel agents | Only for independent work with measurable benefit | Sequential work; avoid context duplication and shared-file conflicts |
| Context/token reporting | Host/provider-reported usage metadata | Mark exact usage unknown; use explicitly-labeled estimates or manually entered aggregate counters |
| Budget enforcement | A pre-call host hook consults the local guard and honors a block | Show a warning and conservative plan; never claim hard enforcement when nothing intercepts the call |
| Tool/UI verification | Host-supported tools and real test output | State what is unverified; provide the smallest manual verification step |

## Native configuration rule

When adding or updating host-specific instructions:

- Check the current official documentation for the exact host, version, file path, frontmatter/schema, tool names, and supported features.
- Keep the cross-platform behavior in `AGENT-SKILL-MAP.md` and `.agents/AGENTS.md`; keep each adapter short and link to the common source of truth.
- Add a native subagent only if that host supports one. Use focused, task-matched descriptions so the lead agent knows when to delegate.
- Never paste an incompatible agent definition from another IDE and assume it works.
- Do not overwrite the user’s existing instruction/agent files automatically. Preview differences and seek approval when a persistent user-owned file would be modified.
- After installation, ask the host to report which instruction paths, skills and subagents it can actually see. Cross-check with visible context, native listings or logs where available; a model’s claim alone is not proof.

## If the host has no perfect/native UCA Kit adapter

Use this fallback in order:

1. Preserve its existing project instructions and add only a short link/reference to `AGENT-SKILL-MAP.md`, `HOST-CAPABILITY-FALLBACK.md`, and the skill files relevant to the project.
2. Before substantial work, give a concise user-visible plan: selected skills and reasons, specialists/tools that are genuinely available, and what will be sequential instead of delegated.
3. Read the selected skill files directly. Pass the lead only the relevant requirements/decisions/paths to each workstream; do not inject every skill or the full conversation.
4. If specialist dispatch is unavailable, have one lead perform the role-specific work sequentially using short handoffs (for example, “Designer findings” then “Service strategy findings”), and synthesize the result.
5. For unsupported usage tracking, expose the manual local meter commands and mark automatic usage capture/universal enforcement as unsupported. Do not silently install a third-party plugin or remote service.
6. Verify that the result works under the active host. If no reliable test exists, tell the user exactly what remains unverified.

## Context and budget guardrails

- One accountable lead by default. Use at most two specialist agents by default for a cross-functional task; add an independent reviewer/verifier only when risk justifies the cost.
- Never recursively spawn agents by default.
- Read each relevant skill once per task/session when possible. Reuse its conclusions; reload only if the file/scope changes.
- Delegate with a compact brief: user goal, decisions, constraints, relevant paths, expected deliverable, and verification criteria.
- If the active host supports `scripts/uca-usage.cjs`, consult the local guard before optional agent calls and record only aggregate data actually exposed by the host.
- A budget warning is advisory unless the host’s real call path honors the guard. If usage metadata is missing, report it as unavailable/estimated, never fabricate exact token or dollar usage.
- Saving tokens must not skip essential security, data-integrity, or release checks.

## Startup capability check prompt

For a new project or after installation, the user/lead can run this short check:

> Before making changes, identify the project instruction files and relevant skills you can actually access in this session. Tell me whether your host supports native skill loading, named subagents/automatic delegation, and real usage metadata or pre-call budget hooks. Read only the skills relevant to my task. Do not claim a feature is available unless you can verify it; otherwise use UCA Kit’s documented fallback and continue.

## Platform references

Consult `PLATFORM-SETUP.md` for current platform-specific paths and references. Verify changing behavior against the host’s official documentation, not only this static guide.
