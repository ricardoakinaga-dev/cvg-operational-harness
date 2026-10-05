# GREEN — correções e testes locais em execução

Data: 04/10/2026. Task: `HARNESS_ISO_GREEN_20261004`. Estado: `IN_PROGRESS`. Veredito global **FAIL**; produção **NO_GO**. Nenhum runtime promovido ao checkout compartilhado nesta rodada; zero chamadas OpenAI, sem push, dados reais, piloto ou implantação. Os 24 critérios continuam exigidos, sem novo DONE. Harness e produto conservam artefatos, processos e barras próprios.

## Estado atual

C1 R9 recebeu revisão válida REJECT com quatro causas e 19 divergências independentes. R10 corrige descoberta física/global, globs e aliases em cópia: antes 420 PASS/22 FAIL, depois 695 PASS (253 originais + 442 estáticos), zero skips, tipos/lint e inputs MATCH. Uma incompatibilidade de prioridade do erro de containment foi corrigida no código, preservando a asserção original; falha intermediária 694 PASS/1 FAIL retida. Revisão C1 R10 nova ativa. Instalado permanece INCOMPLETE/1.610 (27 runtime core, 128 testes core, 1.455 vendor), todos com fonte/hash individual, nenhuma exceção concedida. CI R9 compara a proporção bruta de 95% e exige todos os casos coletados da suíte unitária antes snapshot: Main privado, 378 focados/tipos/lint PASS/MATCH7811, 371 arquivos originais e 43 novos caminhos de teste preservados; revisão nova ativa. Suíte Main CI9 completa com V8/PostgreSQL na porta 55599 em execução, ainda sem C1 promovido. História estrita no HEAD ccd8450 reobservou os mesmos 6.693 registros integrais, com multiplicidades idênticas e zero novos/mudados; não é aceite novo. Últimas completas concluídas continuam 4.358 PASS/1 timeout e neutro 3.754 PASS/44 FAIL; neutro focado, 315 casos, anterior. OPS8/gateway10 aceites restritos preservados. Global FAIL/produção NO_GO, 24 critérios intactos, zero novo DONE, chamadas OpenAI, promoção Root ou push.

A falha atual e os REJECT/INVALID anteriores estão preservados com relatórios originais byte-exatos nos archives. Aceites de gateway e sessões/ingresso são limitados aos respectivos packets. Imagem neutra e E2E anteriores não certificam uma fonte futura; requalificação final segue obrigatória.

## Autoridade e próximos passos

SPECs 0179/0180 emendadas e builds de segurança, bootstrap, custo/modelo e ingresso foram aprovados individualmente. Aprovações e hashes constam nos recibos do diretório green. NO_MODEL para classes proibidas/entradas desconhecidas, dados exclusivamente sintéticos, promoção condicionada e T4 separado permanecem. `.env` privado ignorado/0600 não foi lido, copiado, logado ou incorporado às imagens.

1. Preservar os aceites limitados de gateway e sessões/ingresso; preservar o aceite OPS R8 e requalificar a composição final.
2. Fechar fronteira instalada, CI, operações e segurança com revisão independente válida; nenhum autoverdict do Builder é aceite independente.
3. Concluir suíte completa/cobertura crítica, variante física sem produto, PostgreSQL dedicado, E2E, tipos/lint/formato/links, builds, mutação, scanners, SBOM/licenças e certificação; requalificar imagens e programa local3500/3501 preservando journal.
4. Promover somente paths próprios após todos os gates e revisões exigidos, commit local sem push. Preparar pacote T4 congelado antes de chamada externa. Produção/piloto/release e decisão clínica D2 continuam separados.

Ledgers99/20/30 recebem apenas blocos próprios, com staging parcial e preservação byte a byte de todo dirty anterior. Evidências físicas persistem em `/home/ricardo/.cache/cvg-harness-green-20261004`, fora de /tmp; checkpoints e artefatos próprios são versionados por caminho. Serviços3400/3401 preservados.

`last_completed_action`: recibos R8 com aceite independente e regressões integradas atuais; falhas completas/neutral preservadas. `next_action`: concluir gates e críticas em andamento e fechar pendências. `status: IN_PROGRESS`.

[Checkpoint 31](../../04_audit/evidence/HARNESS-ISO-EXEC-20261003/green-20261004/checkpoint-31-ci-producer-parity-and-static-wrappers.json) vincula as evidências atuais. Checkpoints anteriores são históricos, inclusive falhas preservadas, e não certificam a fonte futura.
