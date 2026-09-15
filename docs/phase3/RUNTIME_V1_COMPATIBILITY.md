# Runtime V1 Compatibility Report

## Requirement

Runtime V1 (single-pass governed execution) must remain available and
functional; Phase 3 may not remove it before Runtime V2 is proven.

## Design

`createOperationalHarness` resolves the runtime per execution:

```
input.runtimeProfile ?? options.defaultRuntimeProfile ?? 'single_pass'
  single_pass → SinglePassGovernedRuntime (unchanged)
  iterative   → IterativeGovernedRuntime (requires iterativeOrchestrator + stepStore)
```

- V1 executions carry no `runtimeProfile` and are unaffected.
- If `iterative` is requested without configuration, the harness fails closed
  with `STATE_CONFLICT` and audits `runtime.stopped` — it never silently
  falls back to V1 (which would change semantics).
- The worker selects nothing: it passes options through and invokes the
  harness; the profile decision is inside the composition root.

## Proofs

| Proof | Test | Result |
| --- | --- | --- |
| V1 still runs through the same public factory | `runtime-selection.test.ts` P3-COMPAT-001 | PASS |
| V1 executes with a requested tool and completes | same test, `single_pass` branch | PASS |
| Iterative unconfigured fails closed (no fallback) | P3-COMPAT-002 | PASS |
| Worker default profile is `single_pass` | `operational-harness-iterative.test.ts` P3-WORKER-005 | PASS |
| Phase 2 focused gate unchanged | 5 files / 31 tests | PASS |
| Full regression (V1 suites included) | 256 files / 1,785 passed / 111 skipped | PASS |
| Phase 2 PostgreSQL catalog unchanged | 24 files / 190 tests / 0 skips | PASS |

## Data compatibility

- V1 ignores `operational_execution_steps`,
  `operational_execution_checkpoints` and the `resume` column.
- V1 PostgreSQL adapters map `resume` as `null` and continue to persist and
  read Phase 2 records without change.

## Rollback

Setting the default profile to `single_pass` and stopping iterative
submissions removes V2 from the active path with no destructive migration and
no Phase 2 data change.
