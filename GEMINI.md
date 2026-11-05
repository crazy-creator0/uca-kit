# UCA Kit

@./AGENTS.md

Skills are in `.agents/skills/<name>/SKILL.md`. Gemini CLI supports that workspace alias; run `/skills list` to check discovery. If your version does not find them, use `.gemini/skills/` or `python scripts/sync_skills.py --target gemini --project-root .`. Open only the skill the task needs.

If a Gemini feature is missing, read the needed `SKILL.md` directly and do specialist work one step at a time; `HOST-CAPABILITY-FALLBACK.md` has details when it is installed. OpenCode subagents and commands do not apply here. Report unknown usage data as unknown.
