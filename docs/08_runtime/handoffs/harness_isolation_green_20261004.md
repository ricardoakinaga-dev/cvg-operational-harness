# GREEN — correções e testes locais em execução

Data: 04/10/2026. Task: `HARNESS_ISO_GREEN_20261004`. Estado: `IN_PROGRESS`. Veredito global **FAIL**; produção **NO_GO**. Nenhum runtime promovido ao checkout compartilhado nesta rodada; zero chamadas OpenAI, sem push, dados reais, piloto ou implantação. Os 24 critérios continuam exigidos, sem novo DONE. Harness e produto conservam artefatos, processos e barras próprios.

## Estado atual

R23 completou os 16 gates nativos com PASS, 5.662 testes/411 arquivos e zero skips; certificado local AAA_CONTROLLED/CONDITIONAL_GO, gates externos pendentes. Rawcapture exit3 deve-se apenas ao JUnit gerado, processo nativo exit0; divergência e arquivo preservados sem falso MATCH. Revisão separada recusou o delta por R23-SEC-001: regexOSC quadrático, 131KB/4s no caller. R24 substitui por varredura linear; antes dois novos casos FAIL/24 fora por seleção; depois261PASS/zeroSKIP, tipos/lintPASS. Crítico novo ACCEPT nos cinco deltas CI: 6.451 checks funcionais,16 do caller,128 parses de recurso até4Mi caracteres, máximo observado63,52ms, scanner estrito0leaks e inputs intactos. FonteR248477 reconstruível sobre arquivoR19 com5deltas, nenhum código app/API/gateway/produto alterado. Variante física neutraR24 preparada8066/411removidos/8transforms/deps próprias, build e fullPG55598 em qualificação. C1 diagnósticoAST próprio2809/13causas não substituiCLI; novo BUILD fechou fila de JavaScript alcançado só por manifesto com38novosPASS/antes7PASS31FAIL. Regressão doBuilder1159PASS/26SKIP por filtro explícito de testemunhas Node, portanto não é suitecompleta. CLI instalado antes confirmouINCOMPLETE2809; depois abortou exit2/Maximum call stack size exceeded, stackprobe e correção posteriorpendentes, sem aceite de isolamento. Segurança originalR19 atual6578disposiçõesACCEPT e história6688registrosclassificados noHEAD849455b preservados. Relatório0595/notas24itens e roadmap/backlog atualizados. Sem promoçãoRoot/provider/push/dadosreais; globalFAIL/produçãoNO_GO, nenhum novoDONE.

A falha atual e os REJECT/INVALID anteriores estão preservados com relatórios originais byte-exatos nos archives. Aceites de gateway e sessões/ingresso são limitados aos respectivos packets. Imagem neutra e E2E anteriores não certificam uma fonte futura; requalificação final segue obrigatória.

## Autoridade e próximos passos

SPECs 0179/0180 emendadas e builds de segurança, bootstrap, custo/modelo e ingresso foram aprovados individualmente. Aprovações e hashes constam nos recibos do diretório green. NO_MODEL para classes proibidas/entradas desconhecidas, dados exclusivamente sintéticos, promoção condicionada e T4 separado permanecem. `.env` privado ignorado/0600 não foi lido, copiado, logado ou incorporado às imagens.

1. Preservar os aceites limitados de gateway e sessões/ingresso; preservar o aceite OPS R8 e requalificar a composição final.
2. Fechar fronteira instalada, CI, operações e segurança com revisão independente válida; nenhum autoverdict do Builder é aceite independente.
3. Concluir suíte completa/cobertura crítica, variante física sem produto, PostgreSQL dedicado, E2E, tipos/lint/formato/links, builds, mutação, scanners, SBOM/licenças e certificação; requalificar imagens e programa local3500/3501 preservando journal.
4. Promover somente paths próprios após todos os gates e revisões exigidos, commit local sem push. Preparar pacote T4 congelado antes de chamada externa. Produção/piloto/release e decisão clínica D2 continuam separados.

Ledgers99/20/30 recebem apenas blocos próprios, com staging parcial e preservação byte a byte de todo dirty anterior. Evidências físicas persistem em `/home/ricardo/.cache/cvg-harness-green-20261004`, fora de /tmp; checkpoints e artefatos próprios são versionados por caminho. Serviços3400/3401 preservados.

`last_completed_action`: recibos R8 com aceite independente e regressões integradas atuais; falhas completas/neutral preservadas. `next_action`: concluir gates e críticas em andamento e fechar pendências. `status: IN_PROGRESS`.

[Checkpoint41](../../04_audit/evidence/HARNESS-ISO-EXEC-20261003/green-20261004/checkpoint-50-local-cert-and-linear-parser.json) vincula as evidências atuais. Checkpoints anteriores são históricos, inclusive falhas preservadas, e não certificam a fonte futura.
