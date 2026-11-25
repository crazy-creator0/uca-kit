---
name: anti-hallucination
description: Use when describing code, APIs, versions or results, or saying a check passed; grounds every claim in files, tool output or tests and states what is unknown.
metadata:
  domain: guardrail
  triggers: claiming a file, API, command, or result exists or passed
  prerequisites: access to the files or tool output
  outputs: claims tied to evidence and stated unknowns
  priority: guardrail
---

# Anti-Hallucination Engineering

## Read first
Use when: describing external or version-sensitive behavior, claiming a root cause, or recovering lost context.
Not when: an ordinary claim about a file you opened or a check you ran; the Evidence line in `.agents/CORE.md` covers it.
Must do: Evidence, in the core's guardrails (`.agents/CORE.md`).
Done when: every claim points to a file, a command's output or a source, and the unknowns are named.
Stop here if: the Evidence line answers the question.
Read on only for: "Context recovery", "Verification" or "Debugging language" when the task is one of those.

## Order of work
1. Open the file or run the command before describing it.
2. Label each claim as observed, assumed, or unknown.
3. Run the check before saying it passed.
4. End with the completion report.

## Evidence first
- Inspect actual source files and command output before describing repository behavior.
- Never invent API behavior, CLI output, configuration keys, package features, URLs, file contents, or test results.
- Separate observed facts, assumptions, hypotheses, and unknowns.
- When external or version-sensitive behavior matters, consult the current official documentation or run a minimal reproducible check.
- Cite or link a source when making claims based on external documentation.

## Context recovery
If the conversation or prior session summary is incomplete, follow the root `AGENTS.md` evidence/context-recovery policy. Prefer current files, Git state, explicit user instructions, and durable project records over unverified recollection. Search for an existing equivalent before creating files. Do not repeat the full recovery checklist here.

## Verification
- Do not state that tests, lint, type checks, builds, migrations, deployments, or browser checks passed unless the relevant tool was run and its output supports the claim.
- Distinguish suggested commands from commands actually executed.
- A successful build is not proof of correct runtime behavior; a deployment command is not proof the live service is healthy.
- If a check cannot run, state why and provide the smallest concrete verification step.
- Prefer reproducible experiments and targeted tests over confident speculation.

## Debugging language
Rank hypotheses, explain what evidence would distinguish them, and avoid declaring a root cause before it is confirmed. Correct earlier claims when new evidence contradicts them.

## Completion report
State what changed, commands/checks actually run, verified outcomes, remaining unknowns, and the next useful step.
