# UCA Kit — Project Instructions

This is the canonical core policy. Read `.agents/CORE.md` before every task and obey it: its shared rules apply to every task, and its Route table picks the skill. Open `.agents/router-rule.md` only when that table says to. Profiles (`.agents/profiles/`) control which skills are always-on.

**Safe Vibe Loop (always-on):** offer a checkpoint (a commit or branch). Only run git commands if the user agrees. Plan in three plain lines, make the smallest change, run the checks that exist and report them, explain what changed and what could break. Stop and ask before deleting files, adding dependencies, changing config, touching secrets, running migrations or deploying.

## New app, site, page or tool (always-on)
Even from one line, do not start coding. Follow R-NEW in `.agents/CORE.md`: open `.agents/workflows/new-project.md` and `.agents/skills/design-taste-discovery/SKILL.md` (their Read first blocks: `node scripts/uca-read.cjs <name>`), show the plan block, then build.

Git is recommended, not mandatory for local work; ask before initializing a repository. If the user declines or Git is unavailable, continue with local files. Changing the stack follows `.agents/workflows/stack-migration.md`. High-risk work or unclear context: `.agents/core-policy-full.md`. Missing host features: `HOST-CAPABILITY-FALLBACK.md`.

UCA Kit by Crazy Creators, Apache-2.0 (`.agents/NOTICE`).
