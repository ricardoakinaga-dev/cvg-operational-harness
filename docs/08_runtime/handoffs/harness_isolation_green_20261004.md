# GREEN — correções e testes locais em execução

Data: 04/10/2026. Task: `HARNESS_ISO_GREEN_20261004`. Estado: `IN_PROGRESS`. Veredito global **FAIL**; produção **NO_GO**. Nenhum runtime promovido ao checkout compartilhado nesta rodada; zero chamadas OpenAI, sem push, dados reais, piloto ou implantação. Os 24 critérios continuam exigidos, sem novo DONE. Harness e produto conservam artefatos, processos e barras próprios.

## Estado atual

Main privado CI10: suíte completa 4.623 PASS em 407 arquivos, PostgreSQL16/V8, zero skips/todo e MATCH 7811; coverage global e seis grupos críticos PASS (kernel97,15%, approval98,59%, policy99,07%, journal97,76%, channel95,12%, RLS96,76% em branches). Runner real de mutação10/10 KILLED, zero sobreviventes/timeouts/erros. Suíte PG dedicada288 PASS/35 arquivos; E2E12 Chromium e15 Chromium/Firefox/WebKit PASS, zero retries/skips, resultados sobrepostos não somados. Builds públicos harness/API/worker/produto, SBOM e licenças PASS/MATCH; npm audit atual: zero vulnerabilidades inclusive dev. Esses gates não eliminam cinco achados da revisão CI10 válida REJECT: admissão de zero/skipped, PG/chaos no importer, binding de mutação e comparação matemática95%; Builder CI11 corrige em cópia distinta. C1R11 recebeu revisão válida REJECT com quatro causas/41 divergências; Lead R12 corrigiu closure/contextos metadata/identidade local percent/sintaxeJS via Node--check que não executa fixture. Antes 479 PASS/57 FAIL; depois789 PASS (253 anteriores + 536 estáticos), tipos/lintPASS/MATCH 7805. Crítica nova C1R12 ativa. Instalado permanece INCOMPLETE/1610/zero violações, nenhuma exceção concedida. Variante sem produto: 3.991 PASS/4 FAIL em380 arquivos por falta de Git privado exigido por fixtures do finalizador; preparo local indexou exatamente 7990 inputs, sem mudar fontes/asserts/thresholds, focused 4 PASS e nova completa neutra em execução. Originais 371/newpaths 43/coverage 281 intactos. Fonte final, integração C1/CI11, neutral, segurança/imagem/certificação continuam pendentes. Aceites restritos OPS8/gateway10 preservados. Global FAIL/produção NO_GO, 24 critérios preservados, zero novo DONE/chamadasOpenAI/promoçãoRoot/push.

A falha atual e os REJECT/INVALID anteriores estão preservados com relatórios originais byte-exatos nos archives. Aceites de gateway e sessões/ingresso são limitados aos respectivos packets. Imagem neutra e E2E anteriores não certificam uma fonte futura; requalificação final segue obrigatória.

## Autoridade e próximos passos

SPECs 0179/0180 emendadas e builds de segurança, bootstrap, custo/modelo e ingresso foram aprovados individualmente. Aprovações e hashes constam nos recibos do diretório green. NO_MODEL para classes proibidas/entradas desconhecidas, dados exclusivamente sintéticos, promoção condicionada e T4 separado permanecem. `.env` privado ignorado/0600 não foi lido, copiado, logado ou incorporado às imagens.

1. Preservar os aceites limitados de gateway e sessões/ingresso; preservar o aceite OPS R8 e requalificar a composição final.
2. Fechar fronteira instalada, CI, operações e segurança com revisão independente válida; nenhum autoverdict do Builder é aceite independente.
3. Concluir suíte completa/cobertura crítica, variante física sem produto, PostgreSQL dedicado, E2E, tipos/lint/formato/links, builds, mutação, scanners, SBOM/licenças e certificação; requalificar imagens e programa local3500/3501 preservando journal.
4. Promover somente paths próprios após todos os gates e revisões exigidos, commit local sem push. Preparar pacote T4 congelado antes de chamada externa. Produção/piloto/release e decisão clínica D2 continuam separados.

Ledgers99/20/30 recebem apenas blocos próprios, com staging parcial e preservação byte a byte de todo dirty anterior. Evidências físicas persistem em `/home/ricardo/.cache/cvg-harness-green-20261004`, fora de /tmp; checkpoints e artefatos próprios são versionados por caminho. Serviços3400/3401 preservados.

`last_completed_action`: recibos R8 com aceite independente e regressões integradas atuais; falhas completas/neutral preservadas. `next_action`: concluir gates e críticas em andamento e fechar pendências. `status: IN_PROGRESS`.

[Checkpoint 38](../../04_audit/evidence/HARNESS-ISO-EXEC-20261003/green-20261004/checkpoint-38-complete-suite-and-native-admission-rejects.json) vincula as evidências atuais. Checkpoints anteriores são históricos, inclusive falhas preservadas, e não certificam a fonte futura.
