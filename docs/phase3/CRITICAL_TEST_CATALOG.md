# Phase 3 Critical Test Catalog

All entries are executable gates in this repository. `PASS` means the test
executed in the Phase 3 candidate verification. Environment-conditional
PostgreSQL entries report their observed result.

Candidate binding: functional digest
`ba6a6274fa9f06b47b7d48357bfceb33e299760f29b45f8ad874b22c05088853` (799
files) — see `CANDIDATE_IDENTITY.json`; the value is re-frozen after each
repair round and the final value is in `evidence/PHASE3_FINAL_SENTINEL.json`.

## Runtime loop

| ID                 | Test                                                                                           | Invariant                                          | Result |
| ------------------ | ---------------------------------------------------------------------------------------------- | -------------------------------------------------- | ------ |
| P3-LOOP-001        | `iterative-runtime.test.ts` › executes a multi-step tool chain and completes                   | ≥3 steps, two tools, grounded final response       | PASS   |
| P3-LOOP-002        | `iterative-runtime.test.ts` › keeps a simple query in a single step                            | fast path: RESPOND in 1 step, 0 tools              | PASS   |
| P3-LOOP-003        | `iterative-runtime.test.ts` › replans after an observation changes the strategy                | REPLAN is a distinct decision after an observation | PASS   |
| P3-REPLAN-001      | `agent-loop-evals.test.ts` P3-EVAL-005 + `iterative-runtime.test.ts` knowledge tests           | replan changes the next action, not a retry        | PASS   |
| P3-GOV-001         | `iterative-runtime.test.ts` › rejects an invalid tool selection with zero effect               | unknown tool never executes                        | PASS   |
| P3-POLICY-001      | `iterative-runtime.test.ts` › denies a mid-loop tool without unauthorized effect               | mid-loop DENY stops with zero unauthorized effect  | PASS   |
| P3-GOV-002         | `iterative-runtime.test.ts` approved-tool and profile-catalog checks                           | tool only from the exposed catalog                 | PASS   |
| P3-GOV-003         | `iterative-runtime.test.ts` › fails closed on an unsupported policy outcome                    | zero effect on malformed policy                    | PASS   |
| P3-BUDGET-001      | `iterative-runtime.test.ts` › stops a hostile loop at maxSteps                                 | deterministic MAX_STEPS                            | PASS   |
| P3-BUDGET-002      | `iterative-runtime.test.ts` › stops on model-call and cost exhaustion                          | MAX_MODEL_CALLS / MAX_COST                         | PASS   |
| P3-BUDGET-003      | `iterative-runtime.test.ts` › stops when the duration budget expires                           | MAX_DURATION despite audit pressure                | PASS   |
| P3-LOOP-DETECT-001 | `iterative-runtime.test.ts` › detects repeated identical decisions at the configured threshold | LOOP_DETECTED at the threshold                     | PASS   |
| P3-LOOP-DETECT-002 | `iterative-runtime.test.ts` › stops a repeated non-idempotent tool before a second effect      | 1 effect, then LOOP_DETECTED                       | PASS   |
| P3-LOOP-DETECT-003 | `iterative-runtime.test.ts` › stops an alternating decision cycle before repeating it          | A/B cycle stops on closure                         | PASS   |
| P3-LOOP-DETECT-004 | `iterative-runtime.test.ts` › stricter default threshold for repeated idempotent reads         | default threshold 2                                | PASS   |
| P3-LOOP-DETECT-005 | `iterative-runtime.test.ts` › cycle detector unit semantics                                    | periods 2–3 detected, repeats excluded             | PASS   |
| P3-INVALID-001     | `hybrid-orchestrator.test.ts` P3-ORCH-004                                                      | invalid decision is rejected                       | PASS   |
| P3-ORCH-005        | `hybrid-orchestrator.test.ts`                                                                  | injected authority fields stripped                 | PASS   |
| P3-COMPAT-003      | `runtime-selection.test.ts`                                                                    | authority fields never reach the checkpoint        | PASS   |

## Knowledge and grounding

| ID               | Test                                                                                 | Invariant                                    | Result |
| ---------------- | ------------------------------------------------------------------------------------ | -------------------------------------------- | ------ |
| P3-KNOWLEDGE-001 | `iterative-runtime.test.ts` › refines a search after an insufficient result          | two searches, second accepted                | PASS   |
| P3-KNOWLEDGE-002 | `iterative-runtime.test.ts` › does not complete when evidence stays insufficient     | INSUFFICIENT_EVIDENCE, certainty refused     | PASS   |
| P3-KNOWLEDGE-003 | `iterative-runtime.test.ts` › flags conflicting sources                              | CONFLICTING not silently resolved            | PASS   |
| P3-GROUNDING-001 | `iterative-runtime.test.ts` › blocks a response with unsupported claims              | revision within budget, grounded final       | PASS   |
| P3-GROUNDING-002 | `iterative-runtime.test.ts` › refuses a false success claim without effect           | VERIFICATION_FAILED, zero effect             | PASS   |
| P3-GROUNDING-003 | `iterative-runtime.test.ts` › refuses a false success claim that names a tool        | tool id cannot bypass the effect requirement | PASS   |
| P3-GROUNDING-004 | `iterative-runtime.test.ts` › refuses an action claim grounded only in a prior read  | a read never satisfies an action claim       | PASS   |
| P3-GROUNDING-005 | `iterative-runtime.test.ts` › refuses an action claim naming a tool that never ran   | exact claimed tool required                  | PASS   |
| P3-GROUNDING-006 | `iterative-runtime.test.ts` › accepts an action claim grounded in the claimed effect | legitimate confirmation still completes      | PASS   |
| P3-GROUNDING-007 | `iterative-runtime.test.ts` › refuses an action claim naming a read-only tool        | named tools must be side-effecting           | PASS   |
| P3-EVAL-GOLDEN   | `agent-loop-evals.test.ts`                                                           | 10 golden trajectory/invariant scenarios     | PASS   |

## Durability and restart

| ID                | Test                                                                                                | Invariant                                                     | Result                       |
| ----------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ---------------------------- |
| P3-CHECKPOINT-001 | `iterative-runtime.test.ts` › resumes between steps without replaying completed work                | restart continues at next step                                | PASS                         |
| P3-CHECKPOINT-002 | `iterative-runtime.test.ts` › reuses the persisted decision after a failed effect                   | decision replay, orchestrator not re-consulted                | PASS                         |
| P3-CHECKPOINT-003 | `iterative-runtime.test.ts` › fails closed on an incompatible checkpoint version                    | STATE_CONFLICT                                                | PASS                         |
| P3-CHECKPOINT-004 | `iterative-runtime.test.ts` › does not execute new steps after completion                           | terminal finality                                             | PASS                         |
| P3-CHECKPOINT-005 | `iterative-runtime.test.ts` › rejects a tampered checkpoint                                         | digest/version/binding fail closed                            | PASS                         |
| P3-CHECKPOINT-006 | `iterative-runtime.test.ts` › keeps step ordering sequential                                        | step N+1 after N settles                                      | PASS                         |
| P3-CHECKPOINT-007 | `iterative-runtime.test.ts` › degrades a terminal claim when the final checkpoint cannot be written | fail-closed terminal degradation                              | PASS                         |
| P3-CRASH-001      | `iterative-runtime.test.ts` P3-CHECKPOINT-001/002                                                   | crash between steps and after a decision                      | PASS                         |
| P3-CRASH-002      | `operational-harness-iterative-postgres.integration.test.ts`                                        | fresh-pool restart resumes WAITING_USER; one journaled effect | PASS (disposable PostgreSQL) |
| P3-EFFECT-001     | `iterative-runtime.test.ts` › composes the response after an effect without repeating it            | post-effect MODEL_FAILURE does not repeat the effect          | PASS                         |

## Pause and resume

| ID            | Test                                                                                               | Invariant                                  | Result |
| ------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------ | ------ |
| P3-PAUSE-001  | `iterative-runtime.test.ts` › pauses for user input and resumes durably                            | NEEDS_USER_INPUT then completion           | PASS   |
| P3-PAUSE-002  | `iterative-runtime.test.ts` › pauses for approval and resumes without duplicate effect             | one effect across pause/resume             | PASS   |
| P3-PAUSE-003  | `iterative-runtime.test.ts` › re-asks without resume input                                         | no acting on stale input                   | PASS   |
| P3-PAUSE-004  | `iterative-runtime.test.ts` › keeps a paused execution resumable after a rejected approval binding | rejected resume preserves the pause        | PASS   |
| P3-PAUSE-005  | `iterative-runtime.test.ts` › rejects an approval resume while a question is pending               | wrong-kind resume cannot open the loop     | PASS   |
| P3-WORKER-003 | `operational-harness-iterative.test.ts`                                                            | HTTP input route + durable resume          | PASS   |
| P3-WORKER-004 | `operational-harness-iterative.test.ts`                                                            | HTTP approval route + resume, no duplicate | PASS   |

## Compatibility and boundaries

| ID                    | Test                                                                   | Invariant                                    | Result                       |
| --------------------- | ---------------------------------------------------------------------- | -------------------------------------------- | ---------------------------- |
| P3-COMPAT-001         | `runtime-selection.test.ts`                                            | same factory runs single_pass and iterative  | PASS                         |
| P3-COMPAT-002         | `runtime-selection.test.ts`                                            | iterative without configuration fails closed | PASS                         |
| P3-COMPAT-004         | `runtime-selection.test.ts`                                            | trajectory export has no payloads            | PASS                         |
| P3-TENANT-001         | `operational-harness-iterative-postgres.integration.test.ts`           | cross-tenant steps/checkpoints invisible     | PASS (disposable PostgreSQL) |
| Runtime V1 regression | `execution-spine.test.ts`, `operational-harness-*.test.ts`, full suite | V1 unchanged                                 | PASS                         |

## Gates

| Gate                                        | Result                                                  |
| ------------------------------------------- | ------------------------------------------------------- |
| `npm run typecheck`                         | PASS                                                    |
| `npm run lint`                              | PASS                                                    |
| `npm run build` / `build:harness`           | PASS                                                    |
| `npm test`                                  | 256 files / 1,785 passed / 111 skipped                  |
| `npm run test:e2e`                          | 6/6                                                     |
| `npm run test:evals`                        | 2 files / 10 tests                                      |
| `npm run test:postgres`                     | 26 files / 196 tests / 0 skips                          |
| `npm run demo:phase3`                       | PASS (controlled, no external effects)                  |
| `TEST_DATABASE_URL=… npm run verify:phase3` | PASS                                                    |
| `npm run format:check`                      | BASELINE_FAIL (brownfield; Phase 3 selection formatted) |
