# GREEN — correções e testes locais em execução

Data: 04/10/2026. Task: `HARNESS_ISO_GREEN_20261004`. Estado: `IN_PROGRESS`. Veredito global **FAIL**; produção **NO_GO**. Nenhum runtime promovido ao checkout compartilhado nesta rodada; zero chamadas OpenAI, sem push, dados reais, piloto ou implantação. Os 24 critérios continuam exigidos, sem novo DONE. Harness e produto conservam artefatos, processos e barras próprios.

## Estado atual

R19 preserva 5.639 testes/410 arquivos e variante física sem produto 5.004/382, ambos com PostgreSQL/V8 e zero skips, seis gates críticos e dez mutantes. E2E e imagem/API local permanecem qualificados no escopo documentado. Segurança atual tem ACCEPT para 6.578 disposições; os três pendentes históricos foram aceitos separadamente sobre blobs exatos, completando classificação dos 6.688 registros no HEAD 849455b sem cobrir commits posteriores. R21 passou os 16 comandos nativos e 5.654 testes/411 arquivos, mas certificado NO_GO por quatro hashes stale no catálogo; raw failure e JUnit gerado preservados. Parser OSC R22 recebeu ACCEPT independente com 214 casos próprios e 26 testes; builder258PASS/tipos/lint. R23 altera somente cinco caminhos CI versus R19: parser/teste/inventário/integer e quatro hashes do catálogo. Catálogo mantém 35 registros/todos demais campos; revisão ACCEPT com 29 controles, 118 inputs intactos; consulta bootstrap Node24 apenas versão foi declarada, verificações efetivas Node22. R23 focado231PASS, tipos/formato/lint/build nativos PASS; suíte completa ativa em candidato 2a9c987a1f24e6ef95d6e3fb910226e40a9c458cf23266656f6057578e6e8a0f. Variante neutra R23 preparada com 8.066 inputs/411 removidos/8 transformações/deps físicas internas; build e full finais ainda pendentes. Delta de cinco fontes reconstruível sobre arquivo completo R19. Relatório 0595 contém notas 0–100 dos 24 cartões, separado por harness/produto e com roadmap/backlog. C1 instalado continua INCOMPLETE; novo diagnóstico readonly e revisão de segurança do delta ativos. Nenhuma promoção de código Root, chamada de provider, push ou dado real. Global FAIL/produção NO_GO; nenhum novo cartão DONE.

A falha atual e os REJECT/INVALID anteriores estão preservados com relatórios originais byte-exatos nos archives. Aceites de gateway e sessões/ingresso são limitados aos respectivos packets. Imagem neutra e E2E anteriores não certificam uma fonte futura; requalificação final segue obrigatória.

## Autoridade e próximos passos

SPECs 0179/0180 emendadas e builds de segurança, bootstrap, custo/modelo e ingresso foram aprovados individualmente. Aprovações e hashes constam nos recibos do diretório green. NO_MODEL para classes proibidas/entradas desconhecidas, dados exclusivamente sintéticos, promoção condicionada e T4 separado permanecem. `.env` privado ignorado/0600 não foi lido, copiado, logado ou incorporado às imagens.

1. Preservar os aceites limitados de gateway e sessões/ingresso; preservar o aceite OPS R8 e requalificar a composição final.
2. Fechar fronteira instalada, CI, operações e segurança com revisão independente válida; nenhum autoverdict do Builder é aceite independente.
3. Concluir suíte completa/cobertura crítica, variante física sem produto, PostgreSQL dedicado, E2E, tipos/lint/formato/links, builds, mutação, scanners, SBOM/licenças e certificação; requalificar imagens e programa local3500/3501 preservando journal.
4. Promover somente paths próprios após todos os gates e revisões exigidos, commit local sem push. Preparar pacote T4 congelado antes de chamada externa. Produção/piloto/release e decisão clínica D2 continuam separados.

Ledgers99/20/30 recebem apenas blocos próprios, com staging parcial e preservação byte a byte de todo dirty anterior. Evidências físicas persistem em `/home/ricardo/.cache/cvg-harness-green-20261004`, fora de /tmp; checkpoints e artefatos próprios são versionados por caminho. Serviços3400/3401 preservados.

`last_completed_action`: recibos R8 com aceite independente e regressões integradas atuais; falhas completas/neutral preservadas. `next_action`: concluir gates e críticas em andamento e fechar pendências. `status: IN_PROGRESS`.

[Checkpoint41](../../04_audit/evidence/HARNESS-ISO-EXEC-20261003/green-20261004/checkpoint-49-native-catalog-and-scores.json) vincula as evidências atuais. Checkpoints anteriores são históricos, inclusive falhas preservadas, e não certificam a fonte futura.
