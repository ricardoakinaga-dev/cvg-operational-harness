# Aceites T1 — recon de metadados

Fonte analisada `84d8d4b4`, contrato proposto0240 SHA `1c14d92852a6d33475a67b533aadfd22ce01e54b86252c404258d33ef0895161`. Estes aceites medem a preparação documental NR01–06, não MS01–12 nem conclusão da B6.

| ID   | Evidência atual                                                                                                                                                                                                                          | Resultado |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| NR01 | [Reconciliação](lead-reconciliation.json):590 arquivos/53.903.975bytes selados,20 fontes,Root7/índice/HEAD intactos                                                                                                                      | PASS      |
| NR02 | [Censo359](census.json) comparado por multiset ao report selado,358 hashes físicos,1586 candidatos/360 recusas; uma origem sem atribuição preservada                                                                                     | PASS      |
| NR03 | Node22 binário/três fontes vinculados; quatro oracles reais e28 casos privados contra60 saídas brutas,fixtures/hash/markers preservados,zero execução de targets                                                                         | PASS      |
| NR04 | [14 controles v2](body-separation.json) reconciliados com stdout/hash:2 PROVEN/10 UNKNOWN/2 VIOLATION, sem confundir seleção com corpo/closure/proveniência. Correções do operador registradas aditivamente                              | PASS      |
| NR05 | [SPEC0240](../../../02_spec/0240_b6_node_metadata_resolution_scope.md), [R2 final](review-r2/REPORT.md) APPROVE_SPEC/zero obrigatórios/12 casos documentais e [conferência independente do Lead](lead-review-r2-verification-final.json) | PASS      |
| NR06 | Ledgers99/20/30,0370,0391,0190,handoff/coordenação atualizados; [checks finais de formato/links/higiene](document-checks-final.json) vinculam os bytes exatos                                                                            | PASS      |

Toda execução futura0240 MS01–12 permanece NOT_RUN, inclusive novos positivos, negativo sob cap, revisão de código,16 gates,38 hashes, consumidor e nova medição integral. B6 INCOMPLETE1609/zero provas. A unidade T1 termina com um pacote concreto para decisão T3; o pai HISO005/B6 segue aberto.
