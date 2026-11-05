# OpenCode Setup Notes

> Written for the full kit. In the lite and standard tiers some skills, `AGENT-SKILL-MAP.md` and usage files named here are not installed; skip any path that does not exist and use only the skills in `.agents/`.

## Discovery
- Root AGENTS.md provides repository instructions.
- .agents/skills/<name>/SKILL.md is a supported project-local skill location. Skills load on demand; they are not all executed for every message.
- `.opencode/agents/<name>.md` defines custom subagents. Available focused roles include `@planner`, `@designer`, `@service-strategist`, `@reviewer`, and `@verifier`. The primary agent should route to a specialist when its domain is explicitly part of the user request; do not invoke all specialists for every task. Actual activation depends on the active OpenCode host/model and its available task tools.

## UCA Kit role and skill routing

Read `AGENT-SKILL-MAP.md` only when routing is ambiguous or cross-functional; read `HOST-CAPABILITY-FALLBACK.md` only when a native skill, agent, hook or usage API is absent or uncertain. For a combined visual design + business/service-offering plan, the primary agent should use `@designer` and `@service-strategist`, then synthesize one plan. If the request is about a backend/API service instead, choose `backend-api` and the relevant Python/database skills; involve the designer only when UI work is also requested. Always tell the user which skills are selected, read those actual skill files, and avoid loading every skill by default.

## Local usage meter and subagent budget guard

The OpenCode profile installs `.opencode/plugins/uca-usage.mjs` and `scripts/uca-usage.cjs`. The plugin is designed to record finalized message token metadata locally, count calls made through supported task/subagent hooks, consult the configured local budget before those optional calls, and show local threshold/budget-block toast warnings. It stores aggregate counters only; it does not store prompts, outputs, message IDs, code, or credentials and has no UCA Kit telemetry endpoint.

Configure caps and a conservative per-call reservation (these are examples; choose values for your model/plan):

```bash
node scripts/uca-usage.cjs budget --max-total-tokens 20000 --max-agent-calls 4 --max-cost-usd 0.50 --planned-agent-tokens 1500 --planned-agent-cost-usd 0.03
node scripts/uca-usage.cjs show
```

OpenCode may report token usage and a cost value; the plugin keeps token counters as host-reported and cost as estimated rather than treating it as an invoice. The plugin's CI test simulates the event payload and budget block; it does not replace a real test in your installed OpenCode version. After installation, reload OpenCode, run a short test task, then confirm that `node scripts/uca-usage.cjs show` changes as expected. If the host's event/hook shapes differ, disable the plugin and report the mismatch rather than trusting incomplete numbers.

**Limitations:** this is an OpenCode-specific adapter, not a universal interceptor. Other IDEs remain manual/unmetered until their own supported usage/hook adapters are implemented. The ledger is local by default; hosted model providers still receive the request needed to generate answers. Full privacy from the model provider requires a suitably configured local/self-hosted model. See `USAGE-PRIVACY.md`.

## Free models
This pack intentionally does not hard-code a model ID. Run opencode models or use /models to see available models through configured providers. Choose one with reliable tool calling and enough context for the repository. Free-tier availability and limits can change.

## Temperature
Planner/reviewer/verifier use temperature 0.1 for focused output. This is not a truth guarantee. Model/provider support varies. If the provider rejects the setting, remove it or use its documented option. Lower temperature does not eliminate hallucinations.

## Suggested loop
1. Ask the primary agent to inspect and plan.
2. Implement one small vertical slice.
3. Ask @reviewer to inspect the actual diff.
4. Ask @verifier to assess tests and unverified claims.
5. Run relevant checks and inspect their outputs.
6. Fix confirmed issues and verify again.

Agent roles and skills improve consistency; they do not guarantee correctness. Repository inspection, tests, independent review, and deployment checks remain necessary.

## UI design checks
For frontend/UI projects, the kit has its own check for generic-template patterns (standard and full tiers). Run it on the UI source folder:

    node scripts/uca-design-check.cjs src/

It catches common template tells; a clean result does not prove the design is good, and it cannot tell whether code was written by AI. Run it only if the project has the relevant UI source directory, and do not report success unless the command was actually run.
