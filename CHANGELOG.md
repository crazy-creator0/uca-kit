# Changelog

All notable changes are listed here. The project is early-stage, and nothing below has been benchmarked against real models.

## 0.1.0 (2026-11-06)

First public release.

Added
- Installer with three tiers (lite, standard, full), a manifest, and `init`, `doctor`, `diff`, `update` and `uninstall` commands.
- A short core rulebook per tier, sixteen skills, workflows (new project, feature, bug, deployment, stack migration), and a keyword reference router.
- Handoff guard (`scripts/uca-guard.cjs`): runs a check, detects triggers in code, snapshots, restores the last passing copy, writes a redacted `HANDOFF.md`, and names the next model.
- Senior Bar check (`scripts/uca-senior-check.cjs`): a read-only static checklist of sixteen basics, plus unscored hints.
- Design check, project card generator and checker, and a local usage meter.
- New-project workflow with a short intake (at most three questions with defaults) and a finishing scorecard.
- A scratch folder rule: throwaway work goes in a gitignored `.uca-workspace/` folder.
- Benchmark kit and a with/without-kit demo. The demo is one run per side and is not a result.
- A documentation page at `demo/docs/`.

Known limits
- No scored runs against real models have been published.
- Host compatibility is untested for every listed tool.
- Instructions are followed by a model and are not enforced by code.
- The static checks read text and cannot judge correctness or security.
- Windows is covered lightly in CI.
