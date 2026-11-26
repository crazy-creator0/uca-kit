# Workflow: New Project

## Read first
Use when: a new app, site, page or tool, even from a one-line request.
Not when: a feature in a project that already has code (`feature-development`).
Must do: for a small request (one file or one screen, one person using it) read "Small build" now and follow it; otherwise read "Size the plan first" now; show the plan block before any code; build slice by slice with real data from the domain; check the main task like the user; never drop a feature the user named.
Done when: the finish for the build's size is done, every plan item is marked Done or Left with a reason, and the closing message is truthful.
Stop here if: the user only wants the plan; then "Small build" or "Size the plan first" is enough.
Read on only for (not for a small build, which "Small build" covers): "Intake" before asking questions or when documents or images are attached; "Steps" before building; "Senior finish" before saying it is done, and "Check it like the user" in `testing-and-code-review` (`node scripts/uca-read.cjs testing-and-code-review --section "Check it like the user"`) before saying the main task works.

## Parts
- Small build: `.agents/workflows/new-project/small.md`
- Size the plan first: `.agents/workflows/new-project/plan.md`
- Intake: only the questions that change the build: `.agents/workflows/new-project/intake.md`
- Steps: `.agents/workflows/new-project/steps.md`
- Senior finish: the scorecard; Deliverables (medium or large build): `.agents/workflows/new-project/finish.md`

## Goal
Turn an idea into a small, verifiable, maintainable application without overengineering.
