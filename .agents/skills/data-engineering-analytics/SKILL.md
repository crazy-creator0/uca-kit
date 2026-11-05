---
name: data-engineering-analytics
description: Build and check data pipelines, cleaning steps, and analyses so the numbers can be trusted and reproduced.
metadata:
  domain: data
  triggers: CSV or file processing, ETL pipeline, data cleaning, metric definition, analysis numbers
  prerequisites: the source data or a sample of it, and the question or output wanted
  outputs: a rerunnable script or query, data-quality checks, and results with stated limits
  priority: task
---

# Data Engineering and Analytics

## Read first
Use when: processing files or tables, building pipelines, cleaning data, defining metrics, or producing analysis numbers.
Not when: an application schema or migration (database-engineering); only how a chart looks (front-end skills).
Must do: define each metric in words first; profile a real sample, never assume the schema; write the transform as code and leave raw input unchanged; state limits.
Done when: a rerunnable script, data-quality checks that ran, and results with stated limits.
Stop here if: the user only wants the metric definitions confirmed.
Read on only for: "Rules" before writing any transform.

The value of this work is numbers someone can trust. Correct and reproducible comes before fast and pretty.

## Workflow
1. **Define the output.** Write each metric in words: what is counted, the unit of one row, the time window, the filters, and the time zone. Ask if the definition is ambiguous.
2. **Profile the source.** Open a real sample. Record row count, columns and types, nulls, duplicates, value ranges, the key, and the encoding. Do not assume the schema.
3. **Write the transformation as code in the repository** (script or query), never as hand edits. Leave the raw input unchanged and write results to a new file or table.
4. **Make it rerunnable.** The same input gives the same output: deterministic ordering, a fixed random seed, no hidden dependence on today's date, and loads that replace or upsert rather than append twice.
5. **Check the result.** Compare row counts in and out and explain every difference. Confirm the key is unique, check null rates, reconcile totals to the source, and trace a few records by hand. After each join, check the row count did not multiply.
6. **Report** the numbers with their definitions, row counts, excluded rows and why, and known limits.

## Rules
- Never fill missing values or drop rows silently; state what was done and how many rows it touched.
- Keep units, currency, and time zones explicit.
- A sample is not the population, and a correlation is not a cause.
- Keep personal data out of logs and outputs unless the task needs it.
- For large inputs, read in chunks or stream; do not print whole datasets.
