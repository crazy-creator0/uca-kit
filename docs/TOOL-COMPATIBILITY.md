# Tool compatibility and verification matrix

**Status: not yet validated by a recorded, versioned test matrix.** Documentation paths below are intended setup guidance, not proof that a particular version loaded the files or supports web search. Do not mark a row tested until the checks below are performed.

## Matrix

| Tool / host | Intended instruction entry point | Skill path to check | Version tested | Instruction loading | Skills discovered | Web search capability | Test date |
|---|---|---|---|---|---|---|---|
| OpenAI Codex / Codex CLI | `AGENTS.md` | `.agents/skills/` | Untested | Untested | Untested | Untested | — |
| Cursor | `AGENTS.md`, `.cursor/rules/` | Native discovery; verify active version | Untested | Untested | Untested | Untested | — |
| Claude Code | `CLAUDE.md` | `.claude/skills/` | Untested | Untested | Untested | Untested | — |
| Gemini CLI | `GEMINI.md` | `.agents/skills/` or `.gemini/skills/` | Untested | Untested | Untested | Untested | — |
| GitHub Copilot | `.github/copilot-instructions.md` and applicable agent instructions | `.agents/skills/` or supported native location | Untested | Untested | Untested | Untested | — |
| OpenCode | `AGENTS.md` | `.agents/skills/` or `.opencode/skills/` | Untested | Untested | Untested | Untested | — |
| Windsurf / Cascade | Verify the current product's supported rule entry point | Verify current native skill path | Untested | Untested | Untested | Untested | — |
| Devin | Verify current product's supported rule entry point | Verify current native skill path | Untested | Untested | Untested | Untested | — |
| JetBrains Junie | `AGENTS.md` and/or `.junie/rules/` as supported | Verify current agent/version | Untested | Untested | Untested | Untested | — |
| JetBrains AI Assistant | `.aiassistant/rules/` where applicable | Depends on selected agent | Untested | Untested | Untested | Untested | — |

## How to validate a row

For every exact product/version and relevant plan/surface:

1. Record product name, version/build, OS, date, project setup, and enabled features.
2. Install the kit in a disposable test project with a unique harmless marker in each intended instruction source.
3. Ask the host to identify the marker and show evidence from its active rules/context UI where available. A verbal claim alone is insufficient.
4. Verify that a sample skill is actually discoverable or explicitly readable via the documented fallback.
5. Test web search separately with a harmless current-documentation lookup. Record whether the capability is built in, connector/MCP-dependent, disabled, or unavailable.
6. Repeat after meaningful product updates; do not generalize one version's result to all versions.
7. Mark unsupported or inconclusive checks **untested** or **unknown**, not supported.

## Reporting rule

A path listed in this table means “candidate entry point to test,” not “guaranteed automatic loading.” Web search may depend on product, version, account/plan, extensions, connectors, or workspace policy. The agent must inspect actual host capabilities and use a documented fallback rather than inventing support.
