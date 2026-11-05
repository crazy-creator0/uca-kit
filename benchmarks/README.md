# Benchmarks

Protocol and metrics: see `../EVALUATION.md`. The runs themselves have not been done yet.

## What is here

- `sample-app/` the project every task runs against.
- `make-snapshot.cjs` builds it as a one-commit git repository with a fixed hash (see `SNAPSHOT.md`).
- `tasks/` the 13 prompts, each with the fault, the pass check and the skill the router should pick.
- `checks/` one pass check per task. They use assertions the agent cannot see.
- `reference/` one known-good fix per task, used only to prove the checks can pass.
- `score-run.cjs` records pass/fail, test counts, files changed, new import cycles and banned wording for one run.
- `banned-wording.json`, `results-template.csv`, `handoff-test.md`.

## Running one task

1. `node benchmarks/make-snapshot.cjs <new-dir>` and confirm the printed hash equals `SNAPSHOT.md`.
2. Baseline: leave the folder as it is. Kit: install one tier into it (`node bin/cli.cjs --tier lite`, `standard` or `full`) and do not commit.
3. Open the folder in the host and model under test. Paste the task prompt from `tasks/` unchanged. Save the full transcript.
4. When the agent stops, score it from the kit repository:

   ```
   node benchmarks/score-run.cjs <new-dir> --task T01 --snapshot <hash> --report report.md \
     --out benchmarks/results/<date>-<model>.csv --model <name> --model-build <build> --host <host> \
     --condition kit --tier lite --run 1 --seconds 90 \
     --input-tokens <n> --output-tokens <n> --tokens-source "<where the counts came from>"
   ```

   `--report` is the agent's final message saved to a file (required for T05). Routing, unsupported claims and notes are filled in by hand from the transcript.
5. Delete the folder and start the next run from step 1.

Exit codes: 0 scored, 2 refused (bad input; nothing recorded), 3 scored but incomplete. An incomplete run is recorded as `incomplete` with the reasons in `notes`, never as `yes`. A run is incomplete when the task check could not reach a verdict, the tests could not be measured, or token counts are partial or have no source. Regressions are counted by test name, so deleting a test and adding another does not cancel out.

The sample app and these scripts need Node 22.13 or newer (`node:sqlite`). The kit package itself supports Node 18 and newer; `npm run check` covers it, and `npm run check:bench` covers the benchmark. CI runs the benchmark job on Linux and Windows.

Tokens must come from the host's or model's own counter. If the host reports none, leave the fields empty and say so in the notes.
