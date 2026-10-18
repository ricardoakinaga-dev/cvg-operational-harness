# Claude100 — evidências da execução integral

Objetivo ativo: implementar0381/0382/0383 por inteiro,117resultados comparáveis+17controlesCVG,16famílias. Nenhuma obrigação foi removida ou marcadaPASS_CURRENT nesta rodada. [Continuidade](../../../08_runtime/handoffs/claude100_exec_20261017.md) e [ExecPlan](../../../../.agent/plans/claude100-exec-20261017.md).

## Entregas e limites

| Unidade            | Evidência                                                                                                                                                                                                               | Alcance                                                                                                |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| G01                | [Verificação](g01-verification.json), [fontes](source-review.json), [parecer](g01-publication-review.txt)                                                                                                               | Inventário/proveniência aceitos; não execução funcional                                                |
| G02                | [Contratos](oracle-contracts.json), [acessos](G02-oracles-and-access.md)                                                                                                                                                | Projeto de16protocolos/134vínculos; captures/oráculos executáveis pendentes por SPEC                   |
| G03                | [Inventário](reuse-inventory.json), [reconciliação](G03-reuse-reconciliation.md)                                                                                                                                        | 58PAR,53diretos; snapshot com estado canônico0380, desconto zero                                       |
| G02/G03 estrutural | [Verificação](g02-g03-structural-verification.json)                                                                                                                                                                     | Vínculos/contagens/preservação PASS, sete adulterações documentais rejeitadas; zero ensaios funcionais |
| G04                | [Discovery0020](../../../00_discovery/0020_claude100_source_and_execution.md), [PRD0029](../../../01_prd/0029_claude100_initial_qualification.md), [SPEC0229](../../../02_spec/0229_claude100_initial_qualification.md) | Contrato inicial de medida em revisão; novo gateT3 ainda não recebido                                  |
| PAR-Q03-KIT-001    | [SPEC0230](../../../02_spec/0230_private_governed_test_kit.md), [inputs](q03/candidate-inputs.json), [pins de revisão](q03/review-inputs.json)                                                                          | Kit privado em candidata própria;204focaisPASS; gates gerais e parecer ainda em curso                  |

## Identidades

ReferênciaClaude2.1.302/SHA60d7eb7f12fbb28a52533fe8be5884097403562aa02dc73991a021c7067e29a5. [Nova capturaREA](reference-version.json) apenas reconfirma versão; os oito helps anteriores foram reaproveitados por identidade igual. Documentos oficiais são conteúdo atual sem vínculo histórico com o binário; [manifesto](official-source-manifest.json). Esse limite acompanha cada obrigação afetada.

CandidataQ03 é6060563dfe62c9d09486511fa3b8c772dff97821, derivada7ecc5b53, com fontes privadas de teste; não é a candidata estável5a199668 nem aPARE100a72422be. Commit local seletivo, sem push. Logs de certificação e handles atuais estão no handoff; não confundir testes do mecanismo com qualificação deClaude100.

## Preservação

Primeira falha do parser de fontes preservada emsource-review-r1-parser-failure.json; a falha de resolução@types/node do verificador temporário do builder também será preservada com seu resultado reparado. Nenhuma delas foi declarada falha da aplicação. Código de produto, expected/goldens, denominadores, lock e recursos de outras sessões permanecem fora do write set. Ledgers compartilhados sujos recebem deltas no handoff conforme coordenação.
