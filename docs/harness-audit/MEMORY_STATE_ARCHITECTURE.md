# Memory e state

## Veredito

`packages/memory` não é um memory subsystem: contém apenas `MemoryFact` e `createApprovedMemoryFact()` (`memory-facts.ts:1-12`) e não possui consumidores externos observados. Score de Memory: **1/10**.

O restante do estado é corretamente distinguível, porém distribuído:

| Tipo                          | Ownership atual                        | Lifecycle/persistência                         |
| ----------------------------- | -------------------------------------- | ---------------------------------------------- |
| conversation history          | persistence conversation repository    | tenant/session, PostgreSQL ou memória          |
| session/takeover/version pin  | conversation/session schema            | persistido, transições explícitas              |
| working memory                | inexistente                            | ABSENT                                         |
| long-term memory              | inexistente                            | ABSENT                                         |
| business state                | journeys/attendance/tasks/approvals    | repos product-specific                         |
| runtime approval/effect state | approval engine + persistence adapters | CAS/generation/recovery                        |
| audit history                 | vários audit repos/ledger              | parcialmente durável; kernel ledger em memória |
| knowledge                     | platform/rag catalogs                  | versionado local; sem retrieval memory         |
| cache                         | rate/replay/budget stores              | majoritariamente process-local                 |

Pontos fortes: session pinning e takeover tenant-scoped, approval/journal separados de conversation state. Gaps: sem ownership unificado, expiry/decay, summaries, provenance de memória, consistency model, concurrent writes ou recovery para working/long-term memory.

Alvo: contracts separados de `ConversationStore`, `CheckpointStore`, `MemoryStore` e `BusinessState` product-owned. Não transformar histórico, knowledge e cache em “memory” indistinta.
