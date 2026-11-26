# Workflow: audit ("uca-audit")

## Read first
Use when: "uca-audit", or what is broken or risky in existing code with no single symptom.
Not when: one known bug (`debugging`); a new build; a file or app you did not build (APK, EXE, installer): say you cannot tell if it is safe; name a malware scanner.
Must do: read "Limits" every time (read-only, the user's own project only, no exploits, no secret values); every finding cites a file and line you read or a step you ran.
Done when: findings by severity, each with how it was checked; what each lens looked at; a fix plan for the user to approve.
Stop here if: the user only asked what an audit covers.
Read on only for: the whole file for a full audit; "Limits", "Steps", "Severity" for one file or concern.
Next: after approval, each finding through `debugging`.

A read-only review of the user's own project for what users would hit: security holes, data leaks, slow or costly code, gaps before production. This file is the only place in the kit where the attacker mindset below applies. Outside an audit, build normally.

## Parts
- Steps; Severity: `.agents/workflows/audit/steps.md`

## Limits (always, before anything else)
- **Read-only.** Do not edit, delete or create project files during the audit, apart from the report if the user asks for one. Fixes come afterwards, one at a time, through the normal Safe Vibe Loop and only with the user's approval.
- **Only the user's own project, on their machine.** Never probe, scan or send requests to a live site, server, API or account, theirs or anyone else's. If asked to, decline and offer a code review instead.
- **Never write working exploits.** Describe how a problem could be abused in one plain sentence; no attack code, payload lists or step-by-step instructions.
- **Never print secret values.** Name the file, line and setting only. Never open `.env` or key files.

## Mindset (audit only)
Think like an attacker and like an unhappy operations engineer at 3 a.m.: what would someone who wants this app to fail try first, and what will break or cost money when traffic grows? Assume nothing is safe because it looks safe; trust only what the code shows.

Then put on three more hats, one at a time:
- **The people who use it.** First the ordinary user: do the main task (from the request, README, PROJECT.md or the plan) with "Check it like the user" in `testing-and-code-review`, on copies, changing no project file. Then the edge users: a first-time visitor, an old phone on a slow connection, only a keyboard or a screen reader, another language or right to left, every mistake a form allows, the person running it on a server at night. Then the person who asked: the request and, for "like X", X's core features and how each behaves there; every claim in the README, help text and screens is true or marked unchecked. Where does anyone get stuck, lose data or give up?
- **The careful spender.** For each request, page and job: what does it cost to run (database work, paid APIs and models, bandwidth, storage, servers left running), what grows with users, and what is the cheapest change that keeps the same result? Give the saving and its trade-off, never a saving that weakens security or correctness.
- **The breaker.** Assume the project is already rated 10/10 and look for what the first nine reviewers missed: the second step of a flow, the empty and the full state, the rename that broke a link, the default nobody changed, the error message nobody reads, the thing that only fails on the 1,000th user or the 31st of the month.

Look harder, never invent. Every finding must point to a file and line you read, or to a step you ran. When a lens finds nothing, say what you looked at, so "nothing found" means something.
