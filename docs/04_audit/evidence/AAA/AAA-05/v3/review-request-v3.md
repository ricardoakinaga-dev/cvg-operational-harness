# AAA-05 v3 — pedido de revisão independente

- Task: `AAA-05`. Autor da v3: agent-2. Data: 2026-09-12.
- **Artefato para revisão**: `docs/02_spec/aaa_data_api_contract.md`, sha256 `cebeddab53061997718fd59475019ead3a71a061942946b25018fd9580087cd1` (prettier aplicado antes do hash).
- Status: `PROPOSED_NOT_FROZEN`; nenhum gate concedido; nenhum código alterado.
- Origem: parecer `docs/04_audit/evidence/AAA/AAA-05/review-coordinator-v2/REVIEW.md` (`REWORK`) e `next-task-agent-2.md`.

## Entregáveis desta rodada

| Entregável                      | Path                                                                  | SHA-256                                                            |
| ------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Contrato v3                     | `docs/02_spec/aaa_data_api_contract.md`                               | `cebeddab53061997718fd59475019ead3a71a061942946b25018fd9580087cd1` |
| v2 preservada                   | `docs/04_audit/evidence/AAA/AAA-05/v2/aaa_data_api_contract.v2.md`    | `2e8738e62926e67ea455f6930003bb836ce224ab95f0f878d6b4424c4a323568` |
| Diff v2 → v3                    | `docs/04_audit/evidence/AAA/AAA-05/v3/diff-v2-v3.patch`               | `0a9009a55ba20bb5afdcd58447b219bd09a32364b00a8ebeaeb6dcd1e939eb31` |
| Mapa C2-F01..F03                | `docs/04_audit/evidence/AAA/AAA-05/v3/finding-map-c2.md`              | —                                                                  |
| Reprodução do contraexemplo     | `docs/04_audit/evidence/AAA/AAA-05/v3/canonical-probe-repro.log`      | `5fd67af96b5ed05f25369724978b32f92ae5873a979eb1554502d863a3da26b9` |
| Handoff SQL v3 (substitui A5)   | `docs/04_audit/evidence/AAA/AAA-05/addendum-agent2-v3-sql-handoff.md` | `9917ceb8ed7e2b3412d26472f401823150ff19409a7cdd80f0e9ff86cb367ccd` |
| Gap de canonicalização (AAA-12) | `docs/04_audit/evidence/AAA/AAA-12/canonicalization-gap.md`           | `e6867a36af4aa7a9ef2e70c128bece46eac7c7eb5b3e53fb948122c5c30c4f6c` |

## Foco pedido ao revisor

1. C2-F01: o alvo normativo e suas regras exatas estão completos e não afirmam comportamento já implementado? A política de hashes persistidos é segura (sem apagar journal, sem reenvio paliativo, fail-closed por versão)?
2. C2-F02: `release` está completo (precondições, retorno, fencing) e a imutabilidade terminal ficou sem exceção? A tabela de diferenças proposta × real está correta?
3. C2-F03: `0012`/`0013`, ownership e handoff estão consistentes com `coordinatorDecisions`, sem terceira fonte de decisão?

## O que fica obsoleto com esta revisão

- O pin da v2 (`2e8738e6…`) e as referências documentais a ele; a v2 é preservada.
- A proposta de migration única e o adapter runtime pelo Agente 1 do A5 anterior (`addendum-agent2-bindings-namespaces-sql.md`); permanece apenas como histórico.
- Código, migrations e candidatos `33aa2807…`/`a122ae51…` **não** mudam; os 12 hashes conferem.

## Confirmações

- Nenhuma escrita em runtime/log/backlog/ledger/0327, contratos de outros agentes, `package.json`, código ou migrations.
- Nenhum autoaprovação de DONE ou congelamento de SPEC; decisão aguarda revisor independente e integração do coordenador.
