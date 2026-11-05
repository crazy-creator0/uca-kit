# Security-focused profile

Installer name: `--profile security-focused`

**Always-on skills** (installed by the installer):
- `anti-ai-slop` — prevent unnecessary abstractions, boilerplate, overengineering
- `anti-hallucination` — ground claims in evidence, explicit uncertainty
- `skill-gap-router` — route to the smallest useful set of trusted skills
- `testing-and-code-review` — meaningful tests and code review
- `application-security` — secrets handling, auth, trust boundaries
- `debugging` — reproducible bug investigation

**Not installed:** frontend, design, and Cloudflare skills. Use `all` if those are needed alongside security.

**Goal:** projects where secrets, auth, or data protection dominate.

Machine-readable source of truth: `profiles.json`.
