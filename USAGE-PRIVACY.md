# UCA Kit Local Usage Meter and Privacy Contract

**Status:** the local ledger utility can record and display usage that a user or host integration explicitly supplies. UCA Kit now includes an **OpenCode-specific plugin adapter** that records finalized message token metadata, shows local threshold/budget-block toast warnings, and checks local budgets before supported task/subagent calls. Its event payload and toast behavior are simulated in CI but still need verification in the installed OpenCode version. Other IDEs do **not** yet have automatic capture. Hard enforcement exists only where the integration actually calls the ledger and the host exposes the relevant events/metadata.

## Privacy defaults

- Store usage locally at `~/.uca-kit/usage.json` by default. Set `UCA_USAGE_FILE` to choose another local path. Prefer a location outside the project/repository; if you choose a project-local path, add that exact path to the project's `.gitignore` before recording usage.
- The ledger stores aggregate token/cost counters, configured limits, timestamps, and counts for agent calls, skill reads and tool calls. It must never store prompts, source code, file contents, credentials, private logs, or raw conversation transcripts.
- The ledger utility uses local filesystem operations only; it has no telemetry endpoint, network client, account, login, or cloud sync.
- The file is created with restrictive permissions where the operating system supports them. The utility refuses a symbolic link at its data-file path rather than following it.
- Users control the local file and can remove it themselves. Do not silently upload or export it.
- This utility's privacy behavior does not control the IDE or AI provider. A hosted model normally receives the request sent to it; UCA Kit cannot claim that the provider never sees user prompts/code. For that stronger requirement, evaluate a genuinely local/self-hosted inference path.

## Actual vs estimated values

- `exact` on token counters means the host exposed those token counts. The utility does not independently verify host data.
- Cost is stored separately via `--cost-source exact|estimated`. OpenCode's reported `info.cost` is kept as **estimated**, not treated as an invoice or verified charge.
- `estimated` means approximate values entered by a user/integration. Never present an estimate as provider billing data.
- Cost remains unknown unless supplied; the utility does not assume a model, plan, cache policy, exchange rate, or current provider price.
- Context-window occupancy and subscription-plan credits are separate metrics. Do not infer them from cumulative token totals.

## Commands

From a project where the UCA Kit usage script is installed:

```bash
# Set local warning/enforcement limits (example values; tune for your model/plan)
node scripts/uca-usage.cjs budget --max-total-tokens 20000 --max-agent-calls 4 --max-cost-usd 0.50 --planned-agent-tokens 1500 --planned-agent-cost-usd 0.03

# Record host-reported usage (numbers only; no prompts/code)
node scripts/uca-usage.cjs record --source exact --input-tokens 1200 --output-tokens 350 --agent-calls 1 --skill-reads 2 --tool-calls 3 --cost-source estimated --cost-usd 0.015

# Record an estimate, kept separate from exact totals
node scripts/uca-usage.cjs record --source estimated --input-tokens 1500 --output-tokens 400 --agent-calls 1

# Display the local summary
node scripts/uca-usage.cjs show

# Before an optional specialist call, check whether a planned call fits the budget
node scripts/uca-usage.cjs guard --planned-tokens 900 --planned-agent-calls 1
```

`guard` returns a non-zero exit code when a configured limit would be exceeded by the supplied recorded and planned metrics. If a token or cost limit is enabled, configure `--planned-agent-tokens` and `--planned-agent-cost-usd` so an optional call has an explicit reservation assumption; otherwise the guard blocks calls whose future consumption cannot be assessed. These values are estimates, not guarantees. An agent host must call the guard and respect its result for it to enforce anything. It does not atomically reserve budget across parallel requests, so concurrent optional calls may still race. If no hard limit is configured, it reports that the guard is inactive.

## Suggested warning thresholds

The utility uses local configurable budgets and emits warnings at the default 60%, 80% and 95% of a configured limit. These are starting defaults, not provider rules. Warnings are based only on recorded data. Missing events mean the display undercounts actual usage.

## Integration contract for host adapters

A host adapter may record a usage event only when it can obtain the relevant numbers from a supported callback/API or an explicit user input. It must:

1. Call the budget guard before optional agent/tool calls when supported.
2. Record only numeric usage/counters and bounded role/skill identifiers.
3. Mark values `exact` or `estimated`, keeping cost values tied to their disclosed source.
4. Avoid prompts, completion text, source snippets, environment variables, API keys, account identifiers, and raw paths.
5. Degrade honestly when metadata or hook support is unavailable: show `unknown/not supported`, not fabricated precision.
6. Never send usage records to UCA Kit maintainers or a telemetry service.
7. Report what the host exposes and what cannot be observed.

## Limitations

A generic Markdown skill or CLI cannot silently intercept token use inside every IDE or hosted model. This ledger is local accounting, not a provider billing dashboard or universal background monitor. Cross-IDE automatic integration must be implemented and tested per host. A budget guard only enforces a limit when the agent/tool caller consults it before continuing.
