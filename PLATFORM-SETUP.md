# Multi-Platform Setup Guide

UCA Kit is designed around shared Markdown instructions and reusable Agent Skills (`SKILL.md`), not a single IDE. Most of the engineering rules stay in one source of truth; small adapters and a skill-sync script handle platforms that expect native file locations.

**No single configuration guarantees automatic loading in every IDE, agent, or version.** Follow the platform setup below and verify that files really appear in the host's active context. If a native feature is missing or uncertain, use [HOST-CAPABILITY-FALLBACK.md](HOST-CAPABILITY-FALLBACK.md) instead of assuming instructions, agents, skills, or usage hooks work.

## Quick compatibility overview

| Platform / host | Instructions | Skills |
|---|---|---|
| OpenAI Codex / Codex CLI | Root `AGENTS.md` | `.agents/skills/` where supported |
| Cursor | Root `AGENTS.md`; `.cursor/rules/` adapter; native subagents in `.cursor/agents/` | Check skill discovery; read the relevant `SKILL.md` directly if needed |
| OpenCode | Root `AGENTS.md` | `.agents/skills/` or `.opencode/skills/` |
| GitHub Copilot | `.github/copilot-instructions.md`; supported agent contexts also read `AGENTS.md` | `.agents/skills/` or `.github/skills/` |
| Claude Code | `CLAUDE.md` | `.claude/skills/` |
| Gemini CLI | `GEMINI.md` | `.agents/skills/` or `.gemini/skills/` |
| Devin | Root `AGENTS.md` and optional `.devin/rules/` adapter | Use relevant shared skills as host support allows |
| Windsurf / Cascade | Root `AGENTS.md` and optional `.windsurf/rules/` adapter | `.agents/skills/` or `.windsurf/skills/` |
| JetBrains Junie | Root `AGENTS.md` plus optional `.junie/rules/` | Skills are agent-dependent; check your Junie version |
| JetBrains AI Assistant | Optional `.aiassistant/rules/` | Depends on the selected agent (for example, Codex and Claude Agent support skills) |
| Other IDEs / agents | Use `AGENTS.md` if recognized; otherwise copy the common rules into the host's project instructions | If the Agent Skills standard is unsupported, open the relevant `SKILL.md` or use the host's documented custom-skill format |

Paths and supported features can vary by version and product tier. Use the links at the end of this document to confirm current behavior.

## One-command installer (npx)

A dependency-free Node.js CLI is included in the repository.

**Available now via GitHub** (requires Node.js/npm and Git):

```bash
npx --yes github:crazy-creator0/uca-kit init .
```

In an interactive terminal, the installer offers a platform picker. For scripted or unlisted IDE setups:

```bash
npx --yes github:crazy-creator0/uca-kit init . --platform generic
npx --yes github:crazy-creator0/uca-kit init . --platform cursor --dry-run
```

Add `--profile minimal|fullstack|frontend|security-focused` to install only that profile's skills (default installs all; see `.agents/profiles/profiles.json`).

The installer preserves existing files by default. Use `--force` only when you explicitly want to overwrite them. npm documents that `npx` supports package specifiers from Git repositories; see its [Git package specifiers](https://docs.npmjs.com/cli/v11/commands/npm-install/#installing-a-package-from-a-git-repository) documentation.

The shorter package-name command will be available after the package owner confirms that the name is available and publishes the verified, MIT-licensed package to the registry:

```bash
npx create-universal-coding-agent-kit init .
```

See [PUBLISHING.md](https://github.com/crazy-creator0/uca-kit/blob/main/PUBLISHING.md).

## Recommended setup

1. Download the ZIP or clone this repository.
2. Copy the files that apply to your own project. You can also keep this repository as a reference, but the target coding agent must be able to read its files.
3. Preserve your project's existing instructions. If `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, or editor rules already exist, merge the guidance instead of replacing the file.
4. Keep the canonical skills under `.agents/skills/` whenever your host supports that standard location.
5. If the host expects a different skills folder, use the sync script below.
6. Open the actual IDE/agent and verify that the instruction file is active and skills are discoverable before assigning substantial work.
7. Ask the agent to inspect the real project structure and test scripts. Do not assume the project uses every stack or service described in these skills.

## Skill synchronization utility

The canonical skill source is `.agents/skills/`. The standard-library Python utility copies those skills to native project locations. Run it from the cloned kit repository:

```bash
python scripts/sync_skills.py --target claude --project-root /path/to/your/project
python scripts/sync_skills.py --target copilot --project-root /path/to/your/project
python scripts/sync_skills.py --target gemini --project-root /path/to/your/project
python scripts/sync_skills.py --target opencode --project-root /path/to/your/project
python scripts/sync_skills.py --target windsurf --project-root /path/to/your/project
```

Available targets are `agents`, `opencode`, `claude`, `copilot`, `gemini`, `windsurf`, and `custom`. For a host with a different skill folder, specify a relative path:

```bash
python scripts/sync_skills.py --target custom --custom-dir .my-agent/skills --project-root /path/to/your/project
```

To copy only a subset, pass a profile defined in `.agents/profiles/profiles.json` (`minimal`, `fullstack`, `frontend`, `security-focused`, or `all`). It uses the same lists as the installer's `--profile` option:

```bash
python scripts/sync_skills.py --target claude --profile minimal --project-root /path/to/your/project
```

To copy the skills of a tier (`lite` uses the condensed skill files, `standard` and `full` every skill), pass `--tier`. Combined with `--profile`, only skills in both lists are copied:

```bash
python scripts/sync_skills.py --target claude --tier lite --project-root /path/to/your/project
python scripts/sync_skills.py --target claude --tier standard --profile minimal --project-root /path/to/your/project
```

This copies skill folders only. The installer's `--tier` option also installs the tier's core file and `.uca/config.json`.

Safety behavior:
- Existing skill directories are skipped by default.
- Review the target first; pass `--force` only when you intend to update existing copies.
- Use `--dry-run` to preview actions.
- The script copies skill folders only; it does not overwrite instruction files or configure the IDE.
- If the project already uses the canonical `.agents/skills/` directory, no copying is required.
- After copying, restart/reload the host if its documentation says that is necessary, then inspect the skill listing.

## Platform-specific details

### Codex / AGENTS.md-compatible hosts

Use the root `AGENTS.md` as the common instruction file. Codex and several other agent hosts recognize it. Use the skills under `.agents/skills/` when supported; the shared skill files follow the Agent Skills format.

### Cursor

Cursor supports root `AGENTS.md`, project rules in `.cursor/rules/*.mdc`, and project subagents in `.cursor/agents/*.md`. The Cursor profile installs focused `designer` and `service-strategist` agents. Cursor can automatically delegate based on task complexity and custom descriptions, but this depends on the host/model/session; it is not a guarantee that every role runs for every task. When the user asks for both UI design and a business/service offering, the intended roles are the designer and service-strategist; unrelated agents must not be launched. If no specialist is actually invoked, one lead should run the workstreams sequentially. For skills, check the current host's discovery. If `.agents/skills/` is not loaded, directly read only the relevant `SKILL.md`. See `HOST-CAPABILITY-FALLBACK.md`.

### OpenCode

OpenCode supports `AGENTS.md`, project skills and native subagents. The OpenCode profile includes role-focused `@designer` and `@service-strategist` agents plus `.opencode/plugins/uca-usage.mjs` for local usage accounting and optional-call budget checks when the host exposes the documented events. Read `OPENCODE-SETUP.md` for setup, configuration and limitations. Other IDE profiles do not yet have equivalent automatic usage capture.

### GitHub Copilot

Use `.github/copilot-instructions.md` for repository-wide custom instructions. Current Copilot documentation also lists `.agents/skills/` and `.github/skills/` for project skills in supported surfaces. Skill behavior differs by Copilot client, so check its skill listing or open the selected skill directly.

### Claude Code

Use `CLAUDE.md`; the included file imports the shared instructions using Claude Code's `@path` syntax. Claude Code's native project skills live in `.claude/skills/`. To create/update that copy from the canonical shared skills, run:

```bash
python scripts/sync_skills.py --target claude --project-root .
```

If running from the kit repository itself and the target is another project, pass that project's path after `--project-root`.

### Gemini CLI

Use `GEMINI.md`; it imports the shared project instructions. Gemini CLI supports `.agents/skills/` as a workspace skill alias and also supports `.gemini/skills/`. Use `/skills list` or the equivalent documented by your installed version to check discovery. If you want native copies, run the sync script with `--target gemini`.

### Windsurf / Cascade / Devin Desktop

The included `.devin/rules/universal-coding-agent-kit.md` uses the current rule format; `.windsurf/rules/` is provided for compatible legacy workflows. The shared `.agents/skills/` location is supported by current Cascade documentation; native copies can be placed under `.windsurf/skills/` with `--target windsurf`. Confirm paths against the documentation for the exact app/version you use.

### JetBrains Junie and AI Assistant

Junie supports root `AGENTS.md` and can combine it with `.junie/rules/*.md`; this kit includes a small Junie rule adapter. JetBrains AI Assistant also supports project rules in `.aiassistant/rules/`, provided here as optional extra context. AI Assistant's selected coding agent determines which instruction and skill mechanisms apply—do not assume all agents inside the same IDE share capabilities.

### Unknown / unlisted IDEs

**Don't see your IDE listed? It can still use this kit.** Follow the generic fallback in [GENERIC-IDE-SETUP.md](GENERIC-IDE-SETUP.md). It gives you copy-paste instructions for any coding assistant that can read Markdown, project files, or reusable prompts. If the host supports custom skill folders, use the `custom` target in the sync script; otherwise, attach the relevant `SKILL.md` file manually.

The workflow files in `.agents/workflows/` are plain Markdown and can be used as prompts or adapted to host-native commands. This fallback does not force an IDE to support automatic discovery or subagents; it gives you a manual route when it does not.

## Universal fallback for an unlisted tool

Open [GENERIC-IDE-SETUP.md](GENERIC-IDE-SETUP.md) and follow its copy-paste prompt. Also follow [HOST-CAPABILITY-FALLBACK.md](HOST-CAPABILITY-FALLBACK.md) to decide what the host actually supports and how to fall back when native skills, subagents, hooks or usage metadata are absent. This manual integration path works for IDEs/agents that can accept project instructions or read attached Markdown files, even when the product has no native skill system.

## Verify installation

Ask the active agent:

> Before coding, identify the host features available in this session. Tell me which project instruction files and relevant skills you actually accessed, whether native subagents/delegation are available, and whether exact usage metadata or pre-call budget hooks are supported. Use the documented fallback for anything missing. Do not modify files yet.

Verify its response using the host's visible context, active-rule list, skill listing, or equivalent feature. If the host cannot show discovery, ask it to read a specific file path and confirm its key rules. A response claiming that instructions were loaded is not proof by itself.

## Official references

- [Codex prompting guide — AGENTS.md](https://developers.openai.com/cookbook/examples/gpt-5/codex_prompting_guide)
- [Cursor rules and AGENTS.md](https://docs.cursor.com/context/rules-for-ai)
- [Cursor subagents and automatic delegation](https://cursor.com/docs/subagents)
- [OpenCode rules](https://docs.opencode.ai/docs/rules/)
- [OpenCode Agent Skills](https://docs.opencode.ai/docs/skills/)
- [GitHub Copilot custom instructions](https://docs.github.com/en/copilot/concepts/prompting-and-context/custom-instructions)
- [GitHub Copilot project skills](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-skills)
- [Claude Code skills](https://code.claude.com/docs/en/skills)
- [Gemini CLI Agent Skills](https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/using-agent-skills.md)
- [Windsurf / Cascade skills](https://docs.devin.ai/desktop/cascade/skills)
- [Windsurf / Cascade rules](https://docs.devin.ai/desktop/cascade/memories)
- [JetBrains AI Assistant project rules](https://www.jetbrains.com/help/ai-assistant/configure-project-rules.html)
- [Junie guidelines](https://junie.jetbrains.com/docs/guidelines-and-memory.html)
