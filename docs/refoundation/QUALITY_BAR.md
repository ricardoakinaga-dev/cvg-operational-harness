# Quality Bar v1 — REF-20260913-PHASE-0-1

This bar is frozen before BUILD. `REQUIRED` means a failure blocks a Phase 0/1 PASS.

| ID         | Source    | Target                                                                                                            | Evidence                                                  | Required |
| ---------- | --------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | -------- |
| REF-BAR-01 | USER/REPO | Baseline freeze is complete and bound to the dirty candidate                                                      | `BASELINE_FREEZE.md` + `BASELINE.json` + command evidence | yes      |
| REF-BAR-02 | USER      | Root identity and README describe CVG Operational Harness                                                         | package manifest, README and identity inspection          | yes      |
| REF-BAR-03 | USER      | Contracts expose all named foundational types and have no forbidden runtime/product dependencies                  | package export test, manifest/import scan, typecheck      | yes      |
| REF-BAR-04 | USER      | One public factory wires runtime, orchestrator, model, policy, approval, tools, audit and telemetry through ports | factory test and demo execution                           | yes      |
| REF-BAR-05 | USER      | Runtime V1 is explicit single-pass and returns stop reasons without introducing a full loop                       | runtime tests and architecture docs                       | yes      |
| REF-BAR-06 | USER      | Tool execution cannot bypass policy/approval and registry resolves generic definitions                            | negative boundary tests                                   | yes      |
| REF-BAR-07 | USER      | Orchestrator and Skill contracts exist without LLM planning or a Skill Runtime                                    | contract/orchestrator tests and static inspection         | yes      |
| REF-BAR-08 | USER      | Model Gateway, audit, observability, state/memory, knowledge and channel boundaries are explicit                  | contracts/docs + import scan                              | yes      |
| REF-BAR-09 | USER      | Existing product sources are preserved and new neutral core does not import Secretary/product code                | sentinel, dependency-direction test, diff inspection      | yes      |
| REF-BAR-10 | USER/REPO | Synthetic basic agent proves boot, response, governed echo tool and evidence emission                             | `tests/basic-agent.test.ts`                               | yes      |
| REF-BAR-11 | REPO      | Existing applicable checks do not regress relative to the frozen baseline                                         | typecheck/lint/build/evals plus full-test comparison      | yes      |
| REF-BAR-12 | USER      | Required architecture docs, ADRs, classification and final report exist and match observed behavior               | document inventory and manual/automated link checks       | yes      |

Known baseline failures are not erased. The final verdict must distinguish `pre-existing`, `new regression`, `not run` and `environment-blocked` evidence.
