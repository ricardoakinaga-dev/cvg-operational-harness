# Current versus target

| Concern          | Current brownfield state                        | Phase 0/1 target                                          | Deferred work                     |
| ---------------- | ----------------------------------------------- | --------------------------------------------------------- | --------------------------------- |
| Identity         | Secretary-rooted package and docs               | Harness identity plus origin record                       | Full internal rename              |
| Runtime          | Governed and legacy paths coexist               | V1 compatibility port with explicit single-pass seam      | Runtime V2 loop                   |
| Orchestration    | No single public neutral root                   | `Orchestrator.decideNextStep` plus deterministic adapters | LLM planning                      |
| Contracts        | Shared and package-local types are mixed        | Dependency-free contracts package                         | Broad type migration              |
| Tools            | Secretary/platform capabilities are mixed       | Generic `ToolDefinition` and `ToolRegistry` ports         | Capability extraction             |
| Models           | Provider/routing code exists in a mixed package | `ModelGateway` hard boundary                              | Provider adapter split            |
| Governance       | Strong but implementation-shaped                | Policy → approval → tool sequence in harness runtime      | Durable cross-process composition |
| Audit/telemetry  | Existing implementations are mixed in places    | Separate `AuditSink` and `TelemetrySink` ports            | Full evidence pipeline migration  |
| State/memory     | Persistence and memory implementations exist    | `StateSnapshot`, `MemoryStore`, and context contracts     | Long-term memory implementation   |
| Knowledge        | Institutional RAG fixture exists                | `KnowledgeProvider` port only                             | Approved source adapters          |
| Channels         | Channel gateway is product-aware                | Inbound/outbound message contracts                        | Adapter migration                 |
| Product boundary | Secretary code is reachable and mixed           | Explicit legacy/product documentation; no core dependency | Incremental adapter work          |

The target is additive. “Target” in this table means a verified boundary in the
new packages, not a claim that all brownfield packages have already migrated.
