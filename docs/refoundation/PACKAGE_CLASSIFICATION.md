# Package classification — brownfield candidate

This matrix classifies the current packages without pretending that mixed packages are already cleanly extracted. `split` is a future boundary, not permission to move code in this task.

| Package           | Current role                                | Future role                                                     | Desired owner            | Dependency direction                          | Remains | Split | Product-specific |
| ----------------- | ------------------------------------------- | --------------------------------------------------------------- | ------------------------ | --------------------------------------------- | ------- | ----- | ---------------- |
| `adapters`        | channel/model and resilience adapters       | adapter layer                                                   | Harness adapter owners   | adapters → contracts/ports                    | yes     | maybe | no               |
| `agent-core`      | Secretary application/domain core           | product host plus thin profile integration                      | Secretary product        | product → harness                             | yes     | yes   | yes              |
| `agent-evals`     | eval runner/contracts                       | test/eval infrastructure                                        | quality                  | evals → contracts                             | yes     | no    | no               |
| `agent-runtime`   | governed runtime and legacy runtime         | runtime implementation behind harness ports                     | runtime                  | runtime → contracts/governance                | yes     | yes   | mixed            |
| `approval-engine` | approval lifecycle/CAS                      | governance approval core                                        | governance               | governance → contracts/state                  | yes     | no    | no               |
| `channel-gateway` | normalized channels/effects                 | channel adapter boundary                                        | adapters                 | adapters → contracts                          | yes     | maybe | no               |
| `chaos`           | resilience test fixtures                    | test infrastructure                                             | quality                  | tests → public ports                          | yes     | no    | no               |
| `memory`          | memory facts                                | state/memory port implementation                                | state                    | state → contracts                             | yes     | maybe | mixed            |
| `model-gateway`   | model routing/providers                     | model gateway core + provider adapters                          | model                    | providers → model port                        | yes     | yes   | no               |
| `observability`   | audit, tracing and telemetry                | separate audit/observability sinks                              | observability            | sinks → contracts                             | yes     | yes   | no               |
| `persistence`     | DB schema/repositories/outbox               | persistence adapters                                            | persistence              | adapters → contracts/state                    | yes     | yes   | mixed            |
| `platform`        | control plane, capabilities, preset, safety | governance/control-plane adapters                               | platform/governance      | platform → contracts                          | yes     | yes   | mixed            |
| `policy`          | policy contracts/evaluator                  | policy core                                                     | governance               | policy → contracts                            | yes     | maybe | mixed            |
| `policy-engine`   | grants/capabilities and policy              | policy implementation                                           | governance/product split | policy → contracts; product grants → product  | yes     | yes   | yes              |
| `rag`             | institutional RAG fixture/source            | knowledge port and approved source adapter                      | knowledge                | knowledge → contracts                         | yes     | yes   | mixed            |
| `shared`          | IDs, schemas, envelopes, auth and misc      | compatibility shared layer; migrate neutral contracts gradually | core                     | shared → contracts                            | yes     | yes   | mixed            |
| `tools`           | registry plus Secretary journeys/tools      | capability/tool registry                                        | capability               | tools → contracts; implementations → adapters | yes     | yes   | yes              |
| `workflows`       | Secretary workflows                         | product residue / skill consumers                               | Secretary product        | product → harness                             | yes     | no    | yes              |

New Phase 0/1 packages:

| Package | Role | Rule |
| `contracts` | CORE | dependency-free neutral contracts only |
| `orchestrator` | RUNTIME seam | decides next step; never executes a tool |
| `harness` | CORE/RUNTIME composition root | wires ports and governed single-pass runtime; no domain rules |
