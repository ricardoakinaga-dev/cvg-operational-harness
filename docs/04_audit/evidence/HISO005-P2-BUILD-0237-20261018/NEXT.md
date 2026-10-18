# Próxima tarefa — fronteira B6 ainda aberta

Fonte qualificada `84d8d4b4ed053493533d7e9ad55e574a9e6f9047`. A medição integral registra 1609 diagnósticos: 537 origens anteriores não resolvidas e 1072 novas ocorrências da fronteira. Das 537 origens anteriores, 0 foram resolvidas. Há 303 identidades MATCH, 0 pacotes semanticamente verificados e 0 provas consumíveis.

[Reconciliação](real-postcert-reconciliation.json), [inventário com IDs e exemplos físicos](qualified-frontier-triage.json) e [relatório bruto integral](real-postcert-normal-report.json.gz). Cada ocorrência permanece registrada, incluindo origens indisponíveis com hash nulo.

| Motivo da nova fronteira         | Ocorrências | Arquivos físicos distintos |
| -------------------------------- | ----------: | -------------------------: |
| `UNKNOWN_AMBIGUOUS_RESOLUTION`   |         359 |                        358 |
| `UNKNOWN_FORMAT`                 |         239 |                        231 |
| `UNKNOWN_NATIVE_BUILTIN`         |         195 |                        195 |
| `UNKNOWN_UNSUPPORTED_EXPORTS`    |         156 |                        156 |
| `UNKNOWN_ACQUISITION_ENOENT`     |          60 |                          0 |
| `UNKNOWN_PARSE`                  |          29 |                         29 |
| `UNKNOWN_MODULE_INTEROP`         |          28 |                         28 |
| `UNKNOWN_RESOLUTION_CONFIG`      |           2 |                          2 |
| `UNKNOWN_WORKSPACE_LINK`         |           2 |                          0 |
| `UNKNOWN_PACKAGE_SELF_REFERENCE` |           1 |                          1 |
| `UNKNOWN_WORKSPACE_CONFIG`       |           1 |                          1 |

A próxima ação do pai HISO005 é estudar uma causa por vez, começando pelo maior grupo, com testemunhos físicos positivos e negativos. O levantamento precisa separar resolução, execução do corpo e proveniência de emissão. Preparar um HOW delimitado antes de qualquer código novo; uma ampliação positiva de contrato exige a revisão T3 própria prevista pelo processo. As aprovações 0236/0237 continuam válidas e não devem ser repetidas.

Uma diminuição na contagem de diagnósticos não concede prova nem encerra B6. A integração local do BUILD0237, a certificação da candidata e o aceite integral de isolamento são decisões distintas. Preservar os pacotes selados, o trabalho dos outros agentes e o checkout compartilhado; não reiniciar recursos históricos.

O [ledger entre os perfis](profile-frontier-multiset-reconciliation.json) preserva todas as 1.721 ocorrências históricas e as 1.072 atuais. Diferenças de contagem em capturas físicas distintas não são resolução: a comparação final dá zero crédito de resolução à fronteira anterior. Usar a medição1609 após paridadeSDK; a captura1599 anterior permanece apenas como diagnóstico preservado.
