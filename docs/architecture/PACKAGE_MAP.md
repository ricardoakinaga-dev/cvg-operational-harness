# Package map

## Neutral Phase 0/1 packages

| Package                     | Owns                                                            | Must not own                                                  |
| --------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------- |
| `@cvg/harness-contracts`    | Stable IDs, input/result shapes, budgets, stop reasons, ports   | Fastify, React, PostgreSQL, provider SDKs, Secretary rules    |
| `@cvg/harness-orchestrator` | Next-step decision seam and deterministic compatibility choices | Tool execution, authorization, credentials, persistence       |
| `@cvg/harness`              | Single-pass runtime and canonical port wiring                   | Product/domain policy, channel mounting, database connections |

## Brownfield packages

The current package inventory is classified in
[`../refoundation/PACKAGE_CLASSIFICATION.md`](../refoundation/PACKAGE_CLASSIFICATION.md).
It is intentionally not presented as already clean architecture. In brief:

- `agent-core` and `workflows` remain product residue.
- `agent-runtime`, `platform`, `policy`, `policy-engine`, and `tools` are
  mixed implementation surfaces requiring future splits.
- `model-gateway`, `approval-engine`, `observability`, `persistence`, `memory`,
  `rag`, `adapters`, and `channel-gateway` are candidate implementation or
  adapter owners, not neutral contracts.
- `shared` remains a compatibility layer while neutral types migrate.

## Direction rule

The allowed public direction is:

```text
product -> harness contracts/runtime -> injected capability/adapter -> external system
```

The inverse import from any neutral package into Secretary, API, persistence,
provider, or channel implementation is forbidden and tested for the Phase 0/1
surface.
