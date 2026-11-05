# Evaluating UCA Kit

Status: **designed, not run.** The snapshot, task checks and scoring script are built and tested, but no model has been run against them. No results exist yet, so this kit makes no claim about token savings, accuracy, or support for any model. Add a claim to the README only after a run is recorded in `benchmarks/results/` with its limits stated.

## Question

Does installing UCA Kit change what a coding agent does on the same task, the same repository snapshot, and the same wording? Each task runs twice per model: **baseline** (no kit files) and **kit** (one tier installed). Start with the weakest local model, then move up. Publish failures with the successes.

## Fixed conditions

- Repository snapshot: one commit, recorded in `benchmarks/SNAPSHOT.md` before any run. Reset to it before every run (`git checkout -- . && git clean -fd`).
- Task wording: copied verbatim from `benchmarks/tasks/`. No extra hints, no retries with rewording.
- Same model build, sampling settings, host, and context limit for the baseline and kit runs. Record all of them.
- One run is an anecdote. Run each task at least three times per condition and report every run, not the best one.
- The person scoring does not choose which runs to keep.

## Tasks

Thirteen tasks in `benchmarks/tasks/`: six from the improvement review (broken API, frontend state bug, slow SQL, auth issue, modify existing feature, new feature), five from the tier plan (bug fix, small feature, add a test, refactor, run tests and report) and two for the performance and data skills (make a function fast, and monthly revenue from a CSV export). Each file holds the exact prompt, the setup it needs, and a pass check that does not depend on the agent's own report.

The tasks run against `benchmarks/sample-app`, a small project built to hold one fault per task. `benchmarks/make-snapshot.cjs` turns it into a git repository with a fixed commit hash, recorded in `benchmarks/SNAPSHOT.md`. Every task check was shown to fail on the snapshot and pass with a reference fix. A synthetic project is not a real codebase: results say how a model behaves on small, clear faults, not on large or messy ones.

## Metrics

Record per run. Mechanical metrics come from tools, not from the agent's summary.

| Metric | How it is measured |
| --- | --- |
| Success | The task's pass check exits 0 |
| Tests | Test command output before and after, saved verbatim |
| Regressions | Drop in passing-test count against the snapshot (conservative: a deleted passing test counts) |
| Wall time | Start to last tool call, seconds |
| Tokens | Input and output counts from the model's own tokenizer or the host's reported usage. Never estimated as characters divided by four |
| Files changed | `git diff --stat` against the snapshot |
| Routing accuracy | Kit runs only: did the agent open the skill listed as expected in the task file (yes / no / not needed) |
| Unsupported claims | Statements in the final report about files, APIs, commands or results that the transcript contradicts or never shows. Counted by a reviewer with the transcript, listed individually |
| New import cycles | Cycle check on the snapshot and on the result, difference reported |
| Banned wording | Count of the phrases in the list below in the final report |

The banned wording list is `benchmarks/banned-wording.json`, kept short on purpose. Extend it before a run, not after. `benchmarks/score-run.cjs` records the mechanical metrics (pass check, test counts, files changed, import cycles, banned wording); a person fills in routing, unsupported claims and notes from the transcript.

## Handoff test

`benchmarks/handoff-test.md`. Model 1 attempts a task it cannot finish and makes at least one false claim. Model 2 receives only the tool evidence and `HANDOFF.md`, then continues. The measure is whether Model 2 repeats the false claim before checking repository state.

## Reading results

- Report per task and per model, not one average.
- A kit run that passes more often but changes more files is a trade-off, not a win. Show both.
- If the baseline already passes a task every time, that task cannot show a benefit; say so.
- Token counts differ by tokenizer. Compare only within one model.
- Do not generalise from a small local model to larger ones, or the reverse.
- Any change to the kit after a run starts a new run set.

## Results

Record runs in `benchmarks/results/<date>-<model>.csv` using `benchmarks/results-template.csv`, and add a short written summary with the limits. Nothing is recorded yet.

## Routing and context measurements (no model involved)

`node scripts/uca-route.cjs` is a plain-keyword reference of `.agents/router-rule.md`. It is not a model, so these numbers say how clear the written rule is, not how well any model follows it. `node scripts/uca-context-report.cjs` estimates instruction size (characters / 4).

- Tuned set (`tests/fixtures/routing-cases.json`, 31 cases): the router was fixed until every case passed, so 100% here proves nothing.
- Unseen set (`tests/fixtures/routing-holdout.json`, 16 cases, written before the router was tuned on it): **first run 6 of 16 primary skills correct (38%)**. The misses were fixed in the router and rule, so this set is now seen too. One case is still a recorded miss (a Go service that calls a weather API also loads `backend-api`).
- Second unseen set (`tests/fixtures/routing-holdout-2.json`, 12 cases, written for the performance and data skills before their routing rules were run): **first run 9 of 12 primary correct (75%) and 8 of 12 companions correct**. Causes: a performance task got an unneeded companion, "faster" outweighed a named index fix, "wrong totals" was not read as a bug, and "worker" was read as Cloudflare. All were fixed at the cause, so this set is now seen too, and each fix has a test that fails without it.
- Context (estimated tokens): lite 697 always on, 1468 worst task; standard 1537 / 8365; full 1722 / 8550 (the Read first blocks on four skills added about 400 to the worst case; the saving only appears if a model stops reading early, which is not measured). Duplicate instruction lines: 0 in every tier.
- Design skill reach: before this change a default (standard) install routed UI tasks to `design-taste-discovery` but did not contain it. It is now installed in standard (worst case rose about 1,200 estimated tokens), with `scripts/uca-design-check.cjs`, a text check for common template tells. Whether designs improve is not measured; the checker only catches tells, and a clean result proves nothing. Also recorded: 24 of the 38 tuned routing cases name a skill the standard install does not contain (workflows and the guardrail skill included).
- Task success per token: **not measured**. It needs the benchmark runs.
- Benchmark tasks T12 (make a function fast, checked by counting reads of its inputs instead of timing) and T13 (monthly revenue from a CSV export) cover the performance and data skills. The snapshot hash changed to the value in `benchmarks/SNAPSHOT.md`, so no earlier result applies.
- The reference router sent the benchmark prompts to the task's expected skill in 5 of 13 cases. Part of the gap is definitional (several tasks expect guardrails such as `anti-ai-slop`, which the router treats as always on). T12 shows a real ambiguity: "far too slow, make it fast" goes to `debugging`, not `performance-engineering`. The router was not tuned to these prompts, so the benchmark stays a fair test of models.

## Routing of "create a new app or page" prompts (added after a reported template result)

A user typed "create cafe management file" and got a generic template. The reference router sent that prompt, and "make a school management system", "build me a todo app" and "create a dashboard for my shop", to the generic fallback, so the design skill never loaded. A default install also did not contain the design skill, `skill-gap-router`, or most other skills the router can name.

- Unseen set 3 (16 prompts, written before the fix): first run 10 of 16; all six misses were new-product prompts.
- Unseen set 4 (10 prompts, written after the first rule): first run 3 of 10 with a fixed list of product nouns; the rule was widened to "create a new thing, minus code-shaped things" and set 4 then reached 9 of 10 in primary skill (the tenth gets the right primary and an arguable database companion). Both sets were used to fix the rule, so they now guard against regressions and prove nothing about accuracy.
- One tuned expectation changed on purpose: "Create a landing page for the new product" now goes to the design skill, not front-end engineering.
- The standard tier now installs every skill (the router still loads one primary and at most one companion). Estimated tokens, always on / worst case: standard 1537 / 8365. The old 8,000 ceiling for standard was raised to 9,000 because standard targets about 32K-token models.
- Not measured: whether a model that follows the new domain-first step produces better screens. That needs real runs and a person looking at the output.

### Planning and wiring of whole new products

The user's real prompt was "create cafe management file" (no article). Findings and changes:
- The planning workflow existed but the router only started it on "from scratch" or "scaffold"; it also had no hand-off to the design or front-end skills and no stack decision. Now a whole new product (app, site, dashboard, portal, tracker, tool, game, "management file/system", "something to track ...") starts `new-project` with `design-taste-discovery` as its companion; a single page stays with the design skill; inside a project that already has code it is not a new project.
- My first version of this rule required "a" before the thing, so it missed the user's own prompt. Caught while writing the test for it; the article is now optional, and "the/this/existing/current ..." keeps existing things out.
- The expectations of unseen sets 3 and 4 were changed on purpose to the new behaviour (15 prompts: new-project plus design). Tuned set unchanged at 38 of 38. These sets were used to fix the rules, so they are regression guards, not accuracy evidence.
- `new-project` now sizes the plan (a short plan block for a small request, full steps for a large one), and `frontend-engineering` has a "Stack decision" section (single file, small tool, multi-view app, content site, app with accounts).
- Not measured: whether models follow the plan block and produce better screens.

### Taste engine: direction library and a validated brief

- `design-taste-discovery` now has a library of ten original, domain-matched directions (`directions.md`: type, hex colors, shape, layout, a signature idea, motion, what to avoid). The skill requires the model to shortlist two by domain, pick one, change at least two attributes using real objects or words from the domain, add a signature element and a deliberate departure, and never use a direction unchanged. Motion detail moved to `motion.md` so the skill file stays under its size limit (about 8.4 KB).
- The accepted brief is saved as `DESIGN.md`, and `node scripts/uca-design-check.cjs --brief DESIGN.md` rejects vague fields (adjectives only, fewer than four hex values, no named typeface, no number for spacing, no named stack, a too-short job, signature or departure).
- Risk, stated plainly: a fixed library can become the next template. The mitigations (adapt, derive from the domain, depart on purpose) are instructions; nothing has measured whether models follow them or whether different users get visibly different results.
- Not measured: screen quality. That needs the scoring rounds on real models.

### Design scoring kit (status: not run)

`benchmarks/design/` holds a rubric (eight criteria plus an Overall from 1 to 10, scored by a person who does not know which variant made an output), the eight prompts, a runbook, and `design-eval.cjs` with three commands: `blind` (hide variant names behind random ids and write a key), `auto` (count design-check tells and check the DESIGN.md brief per output) and `summary` (medians per variant). The target is a median Overall of 9 or higher on at least 6 of the 8 prompts, on two different models. The tools are tested, including that the target is not reported as met with fewer than eight prompts. No scored run exists: the current status for design quality is "not run", and no number here may be read as a score.

### Always-on trigger for new products (found by auditing what an agent actually reads)

The planning and design wiring was in `router-rule.md` and the reference router script. A real agent does not run the script, and `AGENTS.md` told it to consult the router "for substantial tasks", so a one-line request such as "create a cafe management file" could skip everything; the lite core had no trigger at all. Now `AGENTS.md` (standard and full) has an always-on section that names the new-project workflow and the design skill, and every tier's core has the shared rule R-NEW. A test starts at each platform's entry file (eleven platforms, three tiers), follows references up to two hops, and checks the trigger is reached; it fails when the section, the lite rule, or an adapter's pointer to `AGENTS.md` is removed. Cost: about 60 estimated tokens in each core (the lite core test budget moved from 600 to 670), plus about 50 in `AGENTS.md`. Still unmeasured: whether models obey the trigger.

### Handoff guard wiring (found by asking whether an agent would ever use it)

`scripts/uca-guard.cjs` existed but nothing told an agent to run checks through it, so it would have gone unused. R-HANDOFF now says so in every tier's core (one sentence: use the guard when `.uca/config.json` lists models, obey its Switch or STOP message, never edit the model list or run reset). Cost: about 40 estimated tokens in each core, and the lite core test budget moved from 670 to 710. A test checks all three cores carry it. Still unmeasured: whether any model actually runs checks through the guard, and whether a handoff helps the second model. The guard's own tests use scripted checks only.
