# Performance Baseline

Measured by `scripts/phase3-benchmark.ts` (60 runs each, in-memory controlled,
no external effects). Raw data:
`docs/phase3/evidence/PERFORMANCE_BASELINE.json`.

| Profile                                          | avg latency | p50     | p95     | steps | model calls | tool calls | step writes | checkpoint writes |
| ------------------------------------------------ | ----------- | ------- | ------- | ----- | ----------- | ---------- | ----------- | ----------------- |
| Runtime V1 single-pass (1 tool)                  | 0.059 ms    | 0.02 ms | 0.13 ms | 1.0   | 0.0         | 1.0        | 0           | 0                 |
| Runtime V2 simple (RESPOND only)                 | 0.254 ms    | 0.16 ms | 0.56 ms | 1.0   | 0.0         | 0.0        | 1.0         | 2.0               |
| Runtime V2 multi-step (5 steps, 2 tools, verify) | 1.213 ms    | 1.10 ms | 1.97 ms | 5.0   | 0.0         | 2.0        | 7.0         | 8.0               |

## Reading

- The iterative runtime adds ~0.2 ms of orchestration overhead for a simple
  query in memory: context assembly, decision validation, one step row and two
  checkpoint writes.
- A 5-step governed loop costs ~1.2 ms in memory, dominated by checkpoint
  serialization and step-store writes (7 step writes + 8 checkpoint writes).
- No model call occurs in these scenarios (scripted decisions); real model
  latency dominates any production agent loop by orders of magnitude.

## Implications

- Loop latency is a function of steps × (model latency + tool latency), not of
  the runtime bookkeeping. Budgets (`maxSteps`, `maxModelCalls`,
  `maxDurationMs`) are the practical latency control.
- The checkpoint cost is proportional to the bounded observation window; the
  bounded state keeps it flat as the execution grows.
- A fast path exists: a simple query terminates in one step with two
  checkpoint writes, so "iterative" does not mean "always iterates".

## Loop cost by scenario (synthetic)

| Scenario                        | steps | model calls | tool calls | knowledge calls | replans |
| ------------------------------- | ----- | ----------- | ---------- | --------------- | ------- |
| Simple query                    | 1     | 0           | 0          | 0               | 0       |
| Operational tool chain + verify | 5     | 0           | 2          | 0               | 1       |
| Knowledge refinement            | 3     | 0           | 0          | 2               | 0       |
| Hostile static loop             | ≤3    | 0           | 3          | 0               | 0       |

Cost fixtures are zero by construction (deterministic providers). Cost budget
enforcement is proven separately with fake usage (`MAX_COST`, `MAX_TOKENS`).

## Measurement limits

- In-memory timing is not a production load test; PostgreSQL step/checkpoint
  writes add round trips per step (bounded: ~2 writes per step plus 1 read per
  attempt).
- No soak, no concurrent multi-tenant load, no Docker image measurement in
  this phase. These remain recorded debt.
