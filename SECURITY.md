# Security Policy

## Supported versions

Security fixes are prioritized for the latest maintained version of UCA Kit. This project is early-stage; no broader support window is promised unless a release policy is published.

## Reporting a vulnerability

Please do not publish credentials, private project data, or a weaponizable exploit in a public issue.

Use GitHub's private vulnerability reporting feature for this repository if it is enabled. If private reporting is unavailable, contact the repository maintainer privately through a verified GitHub contact method and share only the minimum details needed to establish the issue. Do not assume a public issue is private.

Include:
- Affected version/commit and environment
- Impact and realistic attack scenario
- Minimal reproduction steps or a proof of concept that avoids exposing real secrets
- Any suggested mitigation

Please allow time for triage before public disclosure. No response-time guarantee is made at this stage.

## Safe use

UCA Kit installs agent instructions and skills into a project. Review changes before accepting them. Treat third-party skills, scripts, and retrieved instructions as untrusted. External skills must be previewed and explicitly approved before installation; never execute bundled commands/scripts without separate review and approval. Never place credentials or private customer data in reports.
