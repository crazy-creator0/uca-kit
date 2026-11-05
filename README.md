# UCA Kit

<p align="center">
  <strong>Written by Crazy Creators</strong><br>
  <em>UCA Kit — One reusable AI coding-agent toolkit. Multiple IDEs. Clearer engineering workflows.</em>
</p>

<p align="center">
  <a href="https://github.com/crazy-creator0/uca-kit/actions/workflows/npm-cli.yml"><img alt="CI" src="https://github.com/crazy-creator0/uca-kit/actions/workflows/npm-cli.yml/badge.svg"></a>
  <a href="https://github.com/crazy-creator0/uca-kit/stargazers"><img alt="GitHub stars" src="https://img.shields.io/github/stars/crazy-creator0/uca-kit?style=social"></a>
</p>

**UCA Kit (Universal Coding Agent Kit)** is an IDE-agnostic toolkit for AI coding assistants. It provides reusable agent instructions, portable skills, engineering workflows, platform adapters, and a lightweight installer so you can use consistent development guidance across supported coding tools.

It is designed to help developers plan before coding, understand unfamiliar code, make focused changes, test carefully, protect existing behavior, and learn the reasoning behind engineering decisions.

[Quick start](#quick-start) · [Workflow](#scope-first-workflow) · [Features](#what-is-included) · [Roadmap](docs/ROADMAP.md) · [Demo plan](docs/DEMO.md) · [Tool compatibility](docs/TOOL-COMPATIBILITY.md) · [Security](SECURITY.md) · [Contributing](CONTRIBUTING.md) · [Platform guide](PLATFORM-SETUP.md)

## Read this first

**What this is.** A set of instructions and small read-only scripts that you install into a project folder. Your AI coding assistant reads them and is asked to plan first, check its work, and say what it did not check.

**What it is not.**
- **Not a guarantee.** A model follows instructions, and a model can ignore them. The scripts are checks you can run yourself.
- **Not benchmarked.** No scored runs against real models have been published. The procedure for running your own is in `benchmarks/senior/README.md`.
- **Not tested on every tool.** `docs/TOOL-COMPATIBILITY.md` marks every host as untested until someone records a versioned test.
- **Not an audit.** The Senior Bar check and the design check read text. They cannot tell whether code is correct or secure.
- **Not affiliated with, endorsed by, or sponsored by** the products it names, such as Claude Code, Cursor, GitHub Copilot, Gemini CLI, OpenAI Codex, OpenCode, Windsurf, Devin and JetBrains. The names say which tools the installed files are meant for. Product names belong to their owners.

**Before you install**
1. Preview first. `--dry-run` lists every file the installer would write and writes nothing:
   ```bash
   npx --yes github:crazy-creator0/uca-kit init . --dry-run
   ```
2. Pin a release if you want a fixed version. Without a tag you get the current `main`. Releases are listed in [CHANGELOG.md](CHANGELOG.md):
   ```bash
   npx --yes github:crazy-creator0/uca-kit#v0.1.0 init . --platform generic
   ```
3. Know what it does. The installer copies files into the folder you give it, prints each one, and records a hash of each in `.uca/manifest.json`. It makes no network requests and starts no other programs. `npx` downloads the package from GitHub before the installer runs. `uninstall` removes only the files it installed and never one you edited.
4. Know what the scripts do. Two helper scripts call `git` to list files. The handoff guard runs only the check command you configure. Nothing is sent anywhere. The package has no dependencies and no install-time scripts.
5. Review the copied files before you commit them. They are plain text.

Found a wrong or overclaimed statement in these docs? Please [open an issue](https://github.com/crazy-creator0/uca-kit/issues/new/choose). Security problems go through [SECURITY.md](SECURITY.md).

## Quick start

**Requirements:** Node.js 18 or newer and npm. Git is recommended for project history, reviewing diffs, recovering from mistakes, and collaboration—but it is not required to keep working locally. The GitHub-based `npx` installer may require Git to fetch this repository.

If the project is not already a Git repository, UCA Kit should explain the benefits and ask before running `git init`. If you prefer not to use Git, continue with local files; Git initialization and commits are never assumed.

Run the installer from GitHub in the root of your project:

```bash
npx --yes github:crazy-creator0/uca-kit init . --platform generic
```

For an interactive platform selection, omit `--platform`:

```bash
npx --yes github:crazy-creator0/uca-kit init .
```

Preview the files before writing:

```bash
npx --yes github:crazy-creator0/uca-kit init . --platform cursor --dry-run
```

Choose a specific profile when you already know your coding assistant:

```bash
npx --yes github:crazy-creator0/uca-kit init . --platform claude
npx --yes github:crazy-creator0/uca-kit init . --platform copilot
npx --yes github:crazy-creator0/uca-kit init . --platform windsurf
npx --yes github:crazy-creator0/uca-kit init . --platform devin
```

Choose a tier to match your model's context size. The tier controls how much guidance is installed:

```bash
npx --yes github:crazy-creator0/uca-kit init . --platform generic --tier lite
npx --yes github:crazy-creator0/uca-kit init . --platform claude --tier standard
npx --yes github:crazy-creator0/uca-kit init . --platform claude --tier full
npx --yes github:crazy-creator0/uca-kit init . --context 8000   # prints a suggestion only
npx --yes github:crazy-creator0/uca-kit init . --auto-tier --context 8000   # applies the suggestion, shows why
```

| Tier | For | Installs |
|---|---|---|
| `lite` | Small local models (about 8k tokens of context) | A short core and four condensed skills: anti-hallucination, debugging, anti-ai-slop, import-hygiene |
| `standard` (default) | Most models | The standard core, every skill, loaded one at a time by the router, the router, and workflows |
| `full` | Large-context models | Everything: all skills, workflows, and subagent dispatch notes |

You choose the tier; the agent never changes it. Without `--tier`, a terminal run asks one question, and a non-interactive run uses `standard`. `--context <tokens>` only prints a suggestion (8,000 or fewer: lite; up to 32,000: standard; above: full) and never selects a tier. The choice is saved to `.uca/config.json`. The token sizes quoted here are estimates (characters divided by 4), not tokenizer measurements, and have not yet been benchmarked against real models. `--auto-tier` applies the suggestion from `--context` (unknown context means `standard`), prints the machine it saw (read-only, nothing stored or sent) and the reason, never overrides an explicit `--tier`, and keeps the tier of an existing install. Memory and CPU are shown for information only; they cannot tell the model's context size. After every real install the installer checks its own work: planned files present, manifest valid, tier consistent, and your own files that were in the way untouched. It prints `Verification: PASS` or `FAIL` with the exact files, exits 1 on failure, and deletes nothing.

Pick a skill profile to narrow which skills the tier installs (default installs all of the tier's skills). Using `--profile` without `--tier` keeps the earlier behavior and installs the full tier files:

```bash
npx --yes github:crazy-creator0/uca-kit init . --profile minimal
npx --yes github:crazy-creator0/uca-kit init . --platform cursor --profile frontend
```

Profiles: `minimal` (guardrails only), `fullstack`, `frontend`, `security-focused`, `all` (default). The skill router (`.agents/router-rule.md`) then loads one task-matching skill (plus at most one companion for cross-domain work), so the always-on context stays small even with the full skill set installed.

The installer preserves existing files by default. When run in an interactive terminal, detected conflicts offer three choices: keep existing files and add only non-conflicting UCA Kit files, override conflicting paths, or cancel without changing the project. Cancellation is checked before copying anything, so there is nothing to roll back. Non-interactive runs keep existing files by default; `--force` explicitly overrides matching paths. Use `--dry-run` to preview changes. After installation, verify that your coding assistant actually loads the relevant instructions and skills; support differs by product and version.

### Checking this repository

`npm run verify` runs every check in one go and prints PASS, FAIL or SKIPPED for each: the test suite, the benchmark harness (needs Node 22.13 or newer, otherwise it is reported as skipped), the Python tests, the npm package contents, the reference router, instruction size per tier, and a real install, edit, update and uninstall through the CLI. It exits 1 if anything fails, and it prints what it does not verify: benchmark runs with real models, compatibility with real IDEs, and the quality of the design skill's output.

### Keeping an install healthy

`init` records a hash of every file it writes in `.uca/manifest.json`. A file you already had is not recorded unless its content is identical to the kit's. These commands only ever touch recorded files:

```bash
npx --yes github:crazy-creator0/uca-kit doctor     # is the install intact?
npx --yes github:crazy-creator0/uca-kit diff       # what would a newer kit change?
npx --yes github:crazy-creator0/uca-kit update     # refresh files you have not edited
npx --yes github:crazy-creator0/uca-kit uninstall --yes
```

Files you edited are kept. `update --force` overwrites them after saving your version under `.uca/backup/`; `update --prune` deletes files the kit no longer ships (only if you have not edited them); `uninstall` needs `--yes` and never removes an edited file. Use `--dry-run` to preview. A project installed before the manifest existed has none yet: run `init` again, which keeps your files and creates it. Commit `.uca/manifest.json` with the rest of the kit so teammates share it.

> **npm registry note:** The source and MIT license are in this repository, but a public npm release is not yet confirmed. Verify the package name is available and the packed files are correct before publishing. Until then, use the GitHub-based commands above. After the public release is verified, the intended short command will be `npx create-universal-coding-agent-kit@latest init .`.

### Handoff guard (several models, one task)

When one model keeps failing, a script decides when to pass the task to the next model. The model never decides this and never edits your model list. Add your models, in the order you want them tried, to `.uca/config.json` (the installer only writes `tier`; the rest is yours):

```json
{
  "tier": "standard",
  "models": [{ "name": "small-local", "tier": "lite" }, { "name": "bigger-model", "tier": "full" }],
  "checks": ["npm test"]
}
```

Run your check through the guard instead of running it directly:

```bash
node scripts/uca-guard.cjs run --goal "make the login test pass" -- npm test
```

The guard hands off when it sees the same error twice, a check that is worse than the previous run, 3 or more files changed since the last passing check, empty or garbled output, or a timeout. It then, in this order: saves the files you changed under `.uca/backup/<time>/`, puts the project back to the last passing state, writes `HANDOFF.md`, and prints `Switch to model N: <name> (tier: <tier>)`. It does not switch models: you or your host do that, and the next model must re-run the checks before trusting `HANDOFF.md`. When the last model on the list fails, it prints `STOP` and exits 4; it never returns to an earlier model, and later runs refuse until a person runs `reset`.

Exit codes: 0 passed, 1 failed with no trigger yet, 2 usage or config error, 3 handoff written, 4 STOP. `status` shows the current model; `reset` clears the guard's state (not your config or backups).

What to know before relying on it:
- `HANDOFF.md` is built only from tool output (commands, exit codes, redacted output) and the goal in your words. No model writes any conclusion in it. Redaction is best effort: it masks common key shapes, `Authorization` headers, `password=`-style assignments and `.env`-style `NAME=value` lines, but read the file before you share it.
- The guard keeps its own copy of the project at the last passing check under `.uca/passing/`, so it works without Git and never runs Git. It skips `node_modules`, `.git`, build folders and files over 1 MB, and refuses to track a project over 5,000 files (it says so and does not restore).
- A pass followed by any failure counts as "worse", so the first regression after a pass triggers a handoff. This follows the tier plan; it is strict.
- If a `.gitignore` already exists, the guard appends `HANDOFF.md`, `.uca/state.json`, `.uca/guard.lock`, `.uca/backup/` and `.uca/passing/`. It never creates one, and `.uca/manifest.json` and `.uca/config.json` stay committable.
- Files that usually hold secrets (`.env*`, `*.pem`, `*.key`, `id_rsa*`, `.npmrc`, `credentials*`, `secrets*` and similar) are never tracked, copied into `.uca/passing/` or backups, or restored.
- If `checks` is listed in the config, `run -- <command>` accepts only a listed check, so a trivial command cannot be recorded as a pass. Run without a command to run all listed checks.
- A check that exits 0 but prints a failure count above zero is treated as failed.
- Changing `models` or `checks` after the guard started is refused until you run `reset`, so a model cannot quietly reorder your list. A lock file stops two runs from overwriting each other's state. Restores never write through a symlinked folder, and output over 200,000 characters is cut before it is redacted or stored.
- `allowGit` is accepted for compatibility with the tier plan but is not used: the guard never runs Git.
- **This is a safeguard against honest mistakes, not a security boundary.** A model that deletes `.uca/`, edits `.uca/state.json` or runs `reset` can get around it, and a check that lies (for example `npm test || true`) can fake a pass. The core rules tell models not to, but you should still read `HANDOFF.md` and the diff yourself.
- Windows paths and quoting are handled in code but the guard's own tests run only on Linux CI. A timed-out check is killed, but programs it started through a shell may keep running.
- Tested with scripted checks only. Not yet run with real models; see `EVALUATION.md` and `benchmarks/handoff-test.md`.

## Senior Bar check

```
node scripts/uca-senior-check.cjs [project folder] [--json] [--list] [--min 70]
```

A read-only checklist of what a carefully built project usually has: a README that says how to run it, tests and a test command, `.env` kept out of Git with an `.env.example`, no secret written into the source, a lockfile, a declared runtime, and basic accessibility on HTML pages. Risky patterns (`eval`, `innerHTML`, TLS checks turned off) are listed as hints with file and line, not scored. It never runs your code, never writes, never reads `.env` or key files, and never prints a secret value. A high score does not prove senior-grade quality; a low one is a to-do list. Standard and full tiers install it.

## Scope-first workflow

1. **Reconnaissance:** inspect only top-level structure, manifests, entry points, test commands, and Git status.
2. **Clarify only if needed:** continue when the goal is clear; ask one scope question when it is broad or ambiguous.
3. **Discover the flow:** search relevant files and symbols, trace callers/data flow, and read incrementally. Reuse `PROJECT.md` rather than rescanning every task. `node scripts/uca-project-discover.cjs --write PROJECT.md` drafts it from the repository (every line cites a file, nothing is run unless you pass `--verify`, `.env` files are never read, and text you wrote outside its marked blocks is left alone); `node scripts/uca-project-check.cjs` reports when it may be stale.
4. **Test like a strict QA engineer:** define expected behavior, probe relevant edge cases, reproduce suspected bugs, and separate evidence-backed bugs from risks.
5. **Fix and verify:** make the smallest coherent change, add/update regression tests, run focused checks, and report what was and was not verified.

Effort scales with task size. A small fix gets a light pass; a module change gets targeted discovery; a broad audit starts with scope options. Never claim a full-repository audit after inspecting only part of the repository.

### Search and safety policy

- Built-in skills are the default; load only relevant skills.
- Search for external skills **only when the user explicitly asks**. Preview the skill contents, source, pinned version, license, and risks before installation. Never auto-install.
- Use technical web research when current documentation or external evidence is needed for an audit, logic/security review, or version-specific question. Prefer authoritative sources and record dates/versions. Do not search for every task.
- Git checkpoints can provide rollback when available. If the project is not a Git repository, explain that rollback is unavailable and ask before running `git init` or making an initial commit.
- Ask before destructive/high-impact changes such as deleting files, adding dependencies, changing configuration, touching secrets, migrations, or deployment.

## What is included

- **Shared agent instructions** — consistent engineering principles, mentoring, safe editing, and verification guidance.
- **16 portable skills** — universal language engineering, frontend engineering and visual design discovery, backend APIs, databases, security, debugging, import hygiene, testing and review, performance, data work, and more.
- **Skill router and profiles** — `.agents/router-rule.md` loads one primary skill per task, chosen by what the task is about, so no special prompt format is needed, and `.agents/profiles/` provides `minimal`, `fullstack`, `frontend`, and `security-focused` always-on subsets so the context stays small without deleting skills.
- **Reusable workflows** — new project setup, feature development, bug investigation, production deployment, and a guarded existing-stack migration process with comparison, approval, staged execution, and rollback checks.
- **Cross-IDE adapters** — configuration guidance for Cursor, Claude Code, Gemini CLI, GitHub Copilot, OpenCode, Windsurf, Devin, JetBrains tools, and unlisted IDEs using the generic setup.
- **Lightweight CLI** — dependency-free Node.js installer with platform selection, dry-run support, safe path checks, and preserve-existing-files behavior.
- **Skill sync utility** — optional Python script to copy canonical skills into supported native locations.
- **Role-to-skill routing** — a shared map for selecting the relevant specialist roles, canonical skills, optional tools, and verification steps without loading everything.
- **Host capability fallback** — platform-agnostic rules to detect supported features and fall back to direct skill reading or sequential specialist work when an IDE lacks native agents/hooks.
- **Local usage meter and budget guard** — an opt-in local ledger for aggregate usage counters, warning thresholds, and pre-call budget checks; see `USAGE-PRIVACY.md` for accuracy and privacy limits.
- **Quality checks** — Node.js tests and GitHub Actions checks, including a check that maintainer-only files and test source do not leak into the npm package.

## Supported coding tools

The kit aims for broad compatibility, not identical behavior in every tool. The file paths below are setup guidance, **not proof that a specific tool/version loads them**. See the [tool compatibility matrix](docs/TOOL-COMPATIBILITY.md); combinations without recorded tests are marked untested. Follow the [platform setup guide](PLATFORM-SETUP.md), and use the [generic IDE guide](GENERIC-IDE-SETUP.md) when your assistant is not listed.

| Tool | Getting started |
|---|---|
| OpenAI Codex / Codex CLI | Root `AGENTS.md`; use skills where supported |
| Cursor | Root `AGENTS.md`, `.cursor/rules/`, and native `.cursor/agents/` specialists |
| Claude Code | `CLAUDE.md` and supported skill locations |
| Gemini CLI | `GEMINI.md` and supported skill locations |
| GitHub Copilot | `.github/copilot-instructions.md` and supported skills |
| OpenCode | `AGENTS.md`, skills, specialist subagents, and local usage plugin |
| Windsurf / Cascade | Root instructions and optional `.windsurf/rules/` adapter |
| Devin | Root instructions and optional `.devin/rules/` adapter |
| JetBrains Junie / AI Assistant | Optional platform-specific rule files |
| Other IDEs and coding assistants | Start with `GENERIC-IDE-SETUP.md` |

## Local usage meter and budget guard

After installation, you can track usage counters that your host exposes, or numbers you enter yourself:

```bash
# Configure local caps (example values)
node scripts/uca-usage.cjs budget --max-total-tokens 20000 --max-agent-calls 4 --max-cost-usd 0.50 --planned-agent-tokens 1500 --planned-agent-cost-usd 0.03

# Record aggregate usage; use exact only for host/provider-reported or explicitly measured values
node scripts/uca-usage.cjs record --source exact --input-tokens 1200 --output-tokens 350 --agent-calls 1 --skill-reads 2 --tool-calls 3 --cost-source estimated --cost-usd 0.015

# View summary, guard an optional call, or reset counters
node scripts/uca-usage.cjs show
node scripts/uca-usage.cjs guard --planned-tokens 900 --planned-agent-calls 1
node scripts/uca-usage.cjs reset
```

The ledger is local by default at `~/.uca-kit/usage.json`; set `UCA_USAGE_FILE` to use another path. The utility has no telemetry/network client and stores aggregate counters only—not prompts, source code, credentials, or chat transcripts. The OpenCode profile includes a host plugin for supported completed-message usage metadata and pre-checks for optional task/subagent calls; other IDEs still require a separate integration or manual recording. Budget checks use explicit per-call reservations when token/cost limits are enabled. Without host support, the ledger may undercount usage. Provider-reported cost is not necessarily an invoice amount. See [USAGE-PRIVACY.md](USAGE-PRIVACY.md).

## How it works

1. Install or copy the common rules without overwriting your existing project guidance blindly.
2. Let the agent inspect your real project, stack, test commands, and conventions.
3. Ask it to load only the relevant skills for the task.
4. Work in small, verifiable steps and review the actual diff before accepting changes.
5. Verify behavior in your own IDE and environment; host capabilities vary.
6. For substantial tasks, consult [the agent/skill routing map](AGENT-SKILL-MAP.md), suggest relevant skills up front, read only those skill files, and activate specialists only where the host supports them and the task benefits.
7. Follow the compact risk-based policy in `AGENTS.md`; open only the specific workflow and skills required by the task.
8. When the local usage script is installed, use its budget guard before optional specialist calls when the host integration supports it; never skip essential safety checks to save tokens.

## Roadmap

See the [measurable phased roadmap](docs/ROADMAP.md), [demo plan](docs/DEMO.md), and [tool compatibility matrix](docs/TOOL-COMPATIBILITY.md). The following are **planned capabilities, not claims about features already implemented**:

- A colleague-like project planner that maintains NOW / NEXT / LATER priorities and explains trade-offs.
- A visual planning workspace using source-backed SVG diagrams, user journeys, architecture maps, and UI previews.
- Repository-aware beginner documentation with embedded diagrams and evidence-based improvement suggestions.
- An independent pre-push change-impact review to surface possible changes to existing logic and regression risks.
- Stronger integrated DevOps guidance for CI, deployment, monitoring, and rollback.

## Security and safe use

- Never commit API keys, access tokens, passwords, private datasets, or customer data.
- Review `git status` and staged changes before committing. `.gitignore` does not remove files that are already tracked.
- Inspect third-party skills and packages before installing them.
- Treat suggested commands as project-specific; verify them against your actual configuration.
- The kit does not guarantee that every AI assistant automatically discovers every instruction or skill.

## License

This project is licensed under the [MIT License](LICENSE). The license applies to this repository's original project materials; check any third-party skills, assets, or dependencies for their own license terms before reuse.


## Contributing and support

See [CONTRIBUTING.md](CONTRIBUTING.md) for the contribution checklist and [SECURITY.md](SECURITY.md) for private vulnerability reporting guidance. Bug reports and focused improvements are welcome through [GitHub Issues](https://github.com/crazy-creator0/uca-kit/issues). Please include reproducible steps, relevant environment details, and the checks you ran; do not post secrets or private project data.

Before contributing, run:

```bash
npm run check
npm pack --dry-run
```

**Written by Crazy Creators.**
