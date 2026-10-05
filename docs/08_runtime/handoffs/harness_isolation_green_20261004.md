# GREEN — correções e testes locais em execução

Data: 04/10/2026. Task: `HARNESS_ISO_GREEN_20261004`. Estado: `IN_PROGRESS`. Veredito global **FAIL**; produção **NO_GO**. Nenhum runtime promovido ao checkout compartilhado nesta rodada; zero chamadas OpenAI, sem push, dados reais, piloto ou implantação. Os 24 critérios continuam exigidos, sem novo DONE. Harness e produto conservam artefatos, processos e barras próprios.

## Estado atual

C1 R8 teve revisão válida REJECT por metadata global inválida; R9 corrige em cópia isolada: antes 372 PASS/24 FAIL, depois 649 PASS (253 originais + 396 estáticos), zero skips, tipos/lint PASS e inputs MATCH. Revisão nova R9 ativa; instalado ainda INCOMPLETE com 1.610 diagnósticos e zero violações, não PASS. CI R8 teve revisão válida REJECT: cobertura crítica 94,999% arredondada para 95% e admissão unit incompleta antes da emissão; Builder R9 ativo em outra cópia, mantendo limite 95%, contratos e originais. Main privado anterior: 345 focados PASS; neutro focado anterior: 315 PASS. Últimas completas continuam 4.358 PASS/1 timeout e neutro 3.754 PASS/44 FAIL; fonte final, coverage, PostgreSQL, E2E, segurança, imagem e certificação ainda pendentes. Aceites restritos OPS8/gateway10 preservados. Global FAIL/produção NO_GO; 24 critérios mantidos, zero novo DONE, chamadas OpenAI, promoção Root ou push.

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
