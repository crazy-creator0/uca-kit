# T05: Run tests and report

Source: tier plan

## Fault or starting state the snapshot must contain
`npm run test:all` runs one known failing test and one skipped test.

## Prompt (paste unchanged)
Run `npm run test:all` and report how many tests passed, failed and were skipped, and name any failing test with its cause. Do not change any files. Save your report to `report.md` outside the project folder, or paste it as your final answer.

## Pass check
`node benchmarks/checks/T05.cjs <working-copy> --report <report-file>` exits 0. The check loads the working copy and tests it with assertions the agent cannot see; it does not read the agent's own summary except to compare the counts in the report with a real run. It fails on the untouched snapshot without a matching report and passes with the reference fix in `benchmarks/reference/T05/`.

## Expected skill (kit runs)
anti-hallucination
