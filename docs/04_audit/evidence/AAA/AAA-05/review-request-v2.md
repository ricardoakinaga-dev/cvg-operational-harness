# AAA-05 — Revisão 2: pedido de revisão independente por hash

- Task: `AAA-05`. Autor da correção: agent-2. Data: 2026-09-12.
- Artefato anterior revisado: `docs/02_spec/aaa_data_api_contract.md` v1, sha256 `8db1541f3f0428b64b47d5235c406cc4450b19ecc85eee75290837229dbf17e5` (preservado em `v1/aaa_data_api_contract.v1.md`).
- Parecer independente: `docs/04_audit/evidence/AAA/AAA-05/review-agent-3/REVIEW.md` — `REJECT` para congelar a v1, com `AAA05-R3-F01`/`F02` (P1) e `F03`/`F04` (P2/P3).
- **Revisão 2 para revisão:** `docs/02_spec/aaa_data_api_contract.md`, sha256 `2e8738e62926e67ea455f6930003bb836ce224ab95f0f878d6b4424c4a323568`.
- Status: `PROPOSED_NOT_FROZEN`; nenhum gate concedido; nenhum código alterado por esta revisão.

## Mapa finding → correção

| Finding                            | Correção na revisão 2                                                                                                                                                                                                                         |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AAA05-R3-F01` (P1, binding)       | §3.1: linha dos hashes trocada por "coberturas diferentes; nunca comparados"; bullets normativos de binding; vínculo verificável `payloadHash = H(proj(proposal.payload))`; proibição explícita de comparar `proposalHash` com `payloadHash`. |
| `AAA05-R3-F02` (P1, state machine) | §2 e §5: `FAILED` é terminal (sem transição de saída); falha retryável comprovadamente sem efeito usa `release → PENDING`; remoção de qualquer retry de `FAILED`; removida a promessa de backoff/dead-letter não implementada.                |
| `AAA05-R3-F03` (P2, freshness)     | §0 e §3.1 apontam AAA-03 rev2 `9df1a05f…`; rev1 `db75899f…` declarada histórica.                                                                                                                                                              |
| `AAA05-R3-F04` (P3, fencing)       | §4: `complete`, `fail`, `markUncertain` e `release` exigem `lease_owner = $token` + CAS de revisão; takeover é a única troca de token.                                                                                                        |
| Observação §0 (nota histórica)     | Nota "ausente no momento da redação" substituída pela referência atual de AAA-03.                                                                                                                                                             |

## Contexto de rodada 2 também incorporado

- Namespaces (AAA-03 rev2 R-ID-5/T-20): `<capability>.executed` para outbox do runtime; `channel.outbound.*` para observabilidade; `channel:<kind>:<channel>:<operationKey>` declarado reserva não implementada.
- Exemplos canônicos separam "retry após falha retryável sem efeito" (`release → PENDING`) de "replay após falha não-retryável" (`FAILED` terminal).

## Fora do artefato (planos em evidência)

- Plano da migration `0012` e paths/atribuição dos adapters SQL: `docs/04_audit/evidence/AAA/AAA-05/addendum-agent2-bindings-namespaces-sql.md` §A5 (planejamento; `RESERVED_PLANNING_ONLY`).
- Plano de cobertura crítica e casos adversariais: mesmo adendo, §A6 (AAA-12 segunda rodada; processos distintos, restart real, canonicalizador, `FAILED`).

## O que fica obsoleto com esta revisão

- O pin de revisão do parecer anterior (`8db1541f…`) e as referências textuais a esse hash em handoffs/manifestos de AAA-05/12/16 (documentos, não código). Candidatos de código `33aa2807…` (canal) e `a122ae51…` (chaos) permanecem inalterados.
- A v1 é preservada; nenhum log ou manifesto histórico foi sobrescrito.

## Pedido

- Revisão independente por agente que não redigiu a v2, pelo hash `2e8738e6…`, com foco em F01/F02 e nos bullets de binding/namespace/fencing; decisão `APPROVE`/`REJECT`/`BLOCKED` com digest e critérios.
