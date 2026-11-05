# Running the design scoring round

Nothing here has been run. Results go in `benchmarks/design/results/` on your machine.

1. Install the kit in a fresh folder for each variant (`npx ... init <folder> --auto-tier --context <tokens>` or `--tier`). Use two different models.
2. For each of the eight prompts in `PROMPTS.md`, start a fresh session and give the prompt unchanged. Let the agent finish. Save the project in `outputs/<number>-<variant>/`.
3. Run the automatic checks (they only count; they do not score):
   `node benchmarks/design/design-eval.cjs auto outputs > auto.json`
4. Hide who made what:
   `node benchmarks/design/design-eval.cjs blind outputs blind-out` (writes `blind-out/A1`, `A2`, ... and `blind-out/key.json`; do not open the key until you finish scoring).
5. Open each `blind-out/*` in a browser, score it with `RUBRIC.md`, and write one row per output into `scores.csv` with this header:
   `id,d1,d2,d3,d4,d5,d6,d7,d8,overall`
6. Summarize (this reads the key and reports per variant):
   `node benchmarks/design/design-eval.cjs summary scores.csv blind-out/key.json`
7. Record the table in `EVALUATION.md` with the date, the kit version (`git rev-parse --short HEAD`), the models and the number of outputs, including runs that went badly.
