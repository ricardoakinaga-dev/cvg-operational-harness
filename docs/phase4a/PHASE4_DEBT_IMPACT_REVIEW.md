# Phase 4 debt impact review — AAA-4A

The Phase 4A implementation consumes the frozen Phase 4 authority boundary.
It does not replace the Hybrid Orchestrator, Runtime V2, capability registry,
policy engine, approval engine, effect journal, durable execution spine,
Context Engine, audit or telemetry. The additive migration uses the existing
tenant setting and RLS pattern but keeps conversation-intelligence tables
separate from legacy product-shaped conversation records.

| Existing debt or boundary                              | Phase 4A treatment                            | Residual impact                                                        |
| ------------------------------------------------------ | --------------------------------------------- | ---------------------------------------------------------------------- |
| Multiple legacy product flows                          | Generic package does not import them          | Legacy paths remain outside this evidence                              |
| Model gateway contract differs from Harness completion | Typed adapter keeps contracts distinct        | Provider behavior is not benchmarked                                   |
| Delivery and execution have different outcomes         | Separate claim and delivery records           | Controlled PG lease proof captured; production HA remains out of scope |
| Context assembly is a shared authority                 | Adapter supplies structured observations only | Full composed runtime remains deployment work                          |
| Tenant/RLS discipline                                  | Reuses `cvg.tenant_id` and additive policies  | Controlled disposable PG RLS proof captured                            |

No Phase 4 debt is hidden by copying its authority into conversation code. Any
future integration that changes a frozen authority must open a separate gate.
