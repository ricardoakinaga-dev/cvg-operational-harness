# GREEN — correções e testes locais em execução

Data: 04/10/2026. Task: `HARNESS_ISO_GREEN_20261004`. Estado: `IN_PROGRESS`. Veredito global **FAIL**; produção **NO_GO**. Nenhum runtime promovido ao checkout compartilhado nesta rodada; zero chamadas OpenAI, sem push, dados reais, piloto ou implantação. Os 24 critérios continuam exigidos, sem novo DONE. Harness e produto conservam artefatos, processos e barras próprios.

## Estado atual

CI R6 integrado só no candidato privado: 298 regressões, tipos/lint PASS, 7.811 inputs MATCH e 43 caminhos novos, 371 registros originais intactos. Crítica CI R6 válida REJECT: dois P1/dois P2 de build-info público, simetria Pg/casos e taxas eval; BUILD R7 isolado ativo. C1 R5 válido REJECT estático (1 P1/2 P2), supplied crítico em harness compatível, não Vitest nativo. C1 R6 privado corrige os casos e passa 485 regressões nativas (253 originais +232 estáticos), tipos/lint PASS; crítica nova ativa, sem integração Main. Último scanner R5 instalado INCOMPLETE/1.706, não reexecutado no R6. OPS R8 e gateway R10 conservam aceites limitados. Últimas completas continuam integrado 4.358 PASS/1 timeout e neutro 3.754 PASS/44 FAIL, sem cobertura final nessas falhas; nova composição completa ainda não executada. Global FAIL/produção NO_GO, 24 critérios intactos, zero novo DONE/provider/promoção/push.

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
