# Knowledge / RAG runtime

## Veredito

O nome “RAG” excede a implementação observada. Existe um catálogo local versionado e tenant-aware com busca lexical; não há pipeline de ingestão, embeddings ou retrieval iterativo.

| Capacidade                         | Estado                  | Evidência                                                    |
| ---------------------------------- | ----------------------- | ------------------------------------------------------------ |
| cadastro/publicação/revogação      | IMPLEMENTED local       | `packages/rag/src/institutional-rag.ts:23-107`               |
| tenant isolation                   | IMPLEMENTED no catálogo | filtro por `tenantId`                                        |
| source/version provenance          | PARTIAL                 | trace e resposta interna carregam metadados                  |
| retrieval                          | PARTIAL                 | substring case-insensitive; publicação mais recente          |
| chunking/embeddings/vector store   | ABSENT                  | nenhuma implementação/dependência                            |
| ranking/reranking/filter semântico | ABSENT                  | apenas filtro de status/tenant                               |
| freshness/confidence/TTL           | ABSENT                  | versão não equivale a freshness                              |
| query rewriting/multi-query        | ABSENT                  | uma question, uma busca                                      |
| iterative retrieval/sufficiency    | ABSENT                  | ausência termina em handoff                                  |
| poisoning protection               | PARTIAL                 | aprovação/URI bounded; conteúdo não tem análise de instrução |

Fluxo real: `question -> resolve once -> exact binding source/version -> template answer ou handoff`. `packages/rag/src/noop-rag-source.ts` devolve `null`; não há conector institucional real autorizado.

Score sugerido: **2/10**. Extração inicial deve levar contratos de provenance/fail-closed, não vender o catálogo atual como RAG completo.
