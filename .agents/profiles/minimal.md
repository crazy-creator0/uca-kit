# Minimal profile

Installer name: `--profile minimal`

**Always-on skills** (installed by the installer):
- `anti-ai-slop` — prevent unnecessary abstractions, boilerplate, overengineering
- `anti-hallucination` — ground claims in evidence, explicit uncertainty
- `skill-gap-router` — route to the smallest useful set of trusted skills

**Not installed.** Every other skill is omitted; the router rule still tells the agent to load at most one task-matching skill, and if that skill is absent the agent proceeds with the evergreen guardrails only.

**Goal:** smallest install (~1 KB of skills). Suitable for vibe coders who want guardrails without stack knowledge.

Machine-readable source of truth: `profiles.json`.
