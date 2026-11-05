# UCA Kit

@AGENTS.md

Skills are in `.agents/skills/<name>/SKILL.md`, and Claude Code also reads `.claude/skills/` (the installer fills it; otherwise run `python scripts/sync_skills.py --target claude --project-root .`). Open only the skill the task needs.

If a Claude Code feature is missing, read the needed `SKILL.md` directly and do specialist work one step at a time; `HOST-CAPABILITY-FALLBACK.md` has details when it is installed. OpenCode agents under `.opencode/agents/` do not apply here. Do not claim usage metering without a tested integration.
