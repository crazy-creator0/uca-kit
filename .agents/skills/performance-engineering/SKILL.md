---
name: performance-engineering
description: Make code faster or lighter by measuring first, changing one thing at a time, and proving the gain with the same measurement.
metadata:
  domain: performance
  triggers: optimize, reduce latency, profile, benchmark, bundle size, memory usage
  prerequisites: a way to run the slow path and a number to compare
  outputs: before and after measurements, the change, and its trade-offs
  priority: task
---

# Performance Engineering

## Read first
Use when: the goal is measurably faster or lighter (latency, throughput, bundle size, memory, cost).
Not when: something is broken or unexplained (debugging); a known fix owned by another skill, such as an index (that skill).
Must do: write the metric and workload first; measure before and after with the same command; change one thing at a time; report trade-offs.
Done when: before and after numbers from the same measurement are shown, or you say the gain was not proven.
Stop here if: the user only wants a target and a measurement plan.
Read on only for: "Common causes" when the bottleneck is unknown, "Boundaries" before touching shared code.

Performance work is measurement work. A change that was not measured is a guess, not an optimization.

## Workflow
1. **Set the target.** Write the metric, the current value, the wanted value, and the workload (for example p95 latency at 50 requests per second, or bundle size in KB). If the user gave none, propose one and mark it as an assumption.
2. **Measure the baseline.** Use one repeatable command on the real path. Run it several times and record the command, the environment, the runs, and the spread, not a single number.
3. **Find the cost.** Use a profiler, query plan, trace, or network waterfall. Work on the largest measured cost first and ignore code that is not on the path.
4. **Change one thing.** Make the smallest change that addresses that cost.
5. **Measure again** with the identical command. Keep the change only if the gain is larger than the run-to-run spread; otherwise revert it.
6. **Check behavior.** Run the existing tests and confirm the output is unchanged.

## Common causes (confirm each with evidence before acting)
- Repeated work: N+1 queries, work inside loops, recomputing, needless re-renders.
- Unbounded work: no pagination, whole files or tables loaded into memory.
- Data access: missing index, full scans, many small network calls that could be batched.
- Front end: large bundles, blocking scripts, oversized images, forced layout.
- Memory: caches that only grow, retained references, large copies.
- Caching: name what invalidates it and how stale the data may be.

## Boundaries
- Do not optimize without a baseline, and do not claim a speedup from reasoning alone.
- Do not give up correctness, security, or readability for a gain inside the noise.
- A micro-benchmark that does not match the real workload can mislead; say so when it is all you have.
- Do not add a dependency or cache layer without stating its cost.

## Report
Target, baseline, change, result, method and its limits, trade-offs, and what was not measured.
