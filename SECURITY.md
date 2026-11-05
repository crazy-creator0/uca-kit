# Security Policy

## Supported versions

Security fixes are prioritized for the latest maintained version of UCA Kit. This project is early-stage; no broader support window is promised unless a release policy is published.

## Reporting a vulnerability

Please do not publish credentials, private project data, or a weaponizable exploit in a public issue.

Use GitHub's private vulnerability reporting: open the repository's Security tab and choose Report a vulnerability. If that option is missing, open a public issue that says only that you need a security contact, with no details, and the maintainer will reply with a private way to send them. Do not assume a public issue is private.

Include:
- Affected version/commit and environment
- Impact and realistic attack scenario
- Minimal reproduction steps or a proof of concept that avoids exposing real secrets
- Any suggested mitigation

Please allow time for triage before public disclosure. No response-time guarantee is made at this stage.

## What the package does and does not do

- It has no runtime dependencies and no install-time scripts, so installing it runs no code of ours beyond the installer you start yourself.
- The installer makes no network requests and starts no other programs. It copies files into the folder you choose and records them in `.uca/manifest.json`.
- Two helper scripts call `git` to list files. The handoff guard runs only the check command you configure.
- Redaction of secrets in `HANDOFF.md` is best effort, and the guard is a safeguard against honest mistakes, not a security boundary.

A report that any of these statements is wrong is a valid security report.

## Safe use

UCA Kit installs agent instructions and skills into a project. Review changes before accepting them. Treat third-party skills, scripts, and retrieved instructions as untrusted. External skills must be previewed and explicitly approved before installation; never execute bundled commands/scripts without separate review and approval. Never place credentials or private customer data in reports.
