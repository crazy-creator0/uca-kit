# UCA Kit compatibility shim

Canonical project policy: root `AGENTS.md`. Read that file when available; do not duplicate its rules here.

If the host exposes only this file:
- Inspect relevant project files and preserve existing user changes.
- Recover missing context from source and durable records; separate known facts from assumptions.
- Read only task-relevant skills; don't load the full catalogue.
- Open workflows only when the task matches them. Existing-stack migration uses `.agents/workflows/stack-migration.md`.
- Protect secrets, make focused changes, verify proportionately, and report only checks actually run.

Routing help: `AGENT-SKILL-MAP.md`. Host capability fallback: `HOST-CAPABILITY-FALLBACK.md` only when needed.
