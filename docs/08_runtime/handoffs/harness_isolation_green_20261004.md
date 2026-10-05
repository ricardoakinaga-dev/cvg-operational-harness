# GREEN — correções e testes locais em execução

Data: 04/10/2026. Task: `HARNESS_ISO_GREEN_20261004`. Estado: `IN_PROGRESS`. Veredito global **FAIL**; produção **NO_GO**. Nenhum runtime promovido ao checkout compartilhado nesta rodada; zero chamadas OpenAI, sem push, dados reais, piloto ou implantação. Os 24 critérios continuam exigidos, sem novo DONE. Harness e produto conservam artefatos, processos e barras próprios.

## Estado atual

C1 R10 teve revisão válida REJECT com cinco causas nativas; R11 corrige metadados de atores/workspaces, referências locais recursivas, identidade lexical e aliases npm em cópia isolada. Antes 450 PASS/26 FAIL; depois 729 PASS (253 originais + 476 estáticos), zero skips, tipos/lint PASS e inputs MATCH7805. Nova revisão C1 R11 ativa; instalado permanece INCOMPLETE/1.610 diagnósticos (27 runtime core, 128 testes core, 1.455 vendor), zero violações e nenhuma exceção concedida. A crítica CI9 foi INVALID por leitura de narrativa histórica; três achados técnicos nativos foram reproduzidos e corrigidos por CI10. Builder 413 PASS; integração privada com positivo adicional para dimensões não-branch zero: 414 PASS, tipos/lint PASS, MATCH7811. Governança de mutação 3 PASS e runner real 10/10 KILLED, zero sobreviventes/timeouts/erros. Revisão CI10 nova ativa. Última suíte completa CI9: 4.586 PASS/1 FAIL em 407 arquivos, zero skips/todo, PostgreSQL e V8; falha exclusiva de três hashes de mutação antigos. O caso saturado de 1.000 pendências passou em 10.661,723 ms com timeout original de 15 s; isso não é SLO de produção. A suíte completa CI10 está executando no PostgreSQL próprio55599, ainda sem C1 promovido. Neutro completo anterior: 3.754 PASS/44 FAIL; neutro focado anterior: 315 PASS. 371 arquivos originais, 43 caminhos novos e 281 fontes de cobertura preservados. História estrita no HEAD ccd8450: mesmos 6.693 registros integrais, com multiplicidades idênticas, zero novos/mudados; nenhum aceite novo. Aceites restritos OPS8/gateway10 preservados. Gates, segurança, imagem e certificação finais continuam pendentes. Global FAIL/produção NO_GO; 24 critérios intactos, zero novo DONE, chamadas OpenAI, promoção Root ou push.

A falha atual e os REJECT/INVALID anteriores estão preservados com relatórios originais byte-exatos nos archives. Aceites de gateway e sessões/ingresso são limitados aos respectivos packets. Imagem neutra e E2E anteriores não certificam uma fonte futura; requalificação final segue obrigatória.

## Autoridade e próximos passos

SPECs 0179/0180 emendadas e builds de segurança, bootstrap, custo/modelo e ingresso foram aprovados individualmente. Aprovações e hashes constam nos recibos do diretório green. NO_MODEL para classes proibidas/entradas desconhecidas, dados exclusivamente sintéticos, promoção condicionada e T4 separado permanecem. `.env` privado ignorado/0600 não foi lido, copiado, logado ou incorporado às imagens.

1. Preservar os aceites limitados de gateway e sessões/ingresso; preservar o aceite OPS R8 e requalificar a composição final.
2. Fechar fronteira instalada, CI, operações e segurança com revisão independente válida; nenhum autoverdict do Builder é aceite independente.
3. Concluir suíte completa/cobertura crítica, variante física sem produto, PostgreSQL dedicado, E2E, tipos/lint/formato/links, builds, mutação, scanners, SBOM/licenças e certificação; requalificar imagens e programa local3500/3501 preservando journal.
4. Promover somente paths próprios após todos os gates e revisões exigidos, commit local sem push. Preparar pacote T4 congelado antes de chamada externa. Produção/piloto/release e decisão clínica D2 continuam separados.

Ledgers99/20/30 recebem apenas blocos próprios, com staging parcial e preservação byte a byte de todo dirty anterior. Evidências físicas persistem em `/home/ricardo/.cache/cvg-harness-green-20261004`, fora de /tmp; checkpoints e artefatos próprios são versionados por caminho. Serviços3400/3401 preservados.

`last_completed_action`: recibos R8 com aceite independente e regressões integradas atuais; falhas completas/neutral preservadas. `next_action`: concluir gates e críticas em andamento e fechar pendências. `status: IN_PROGRESS`.

[Checkpoint 37](../../04_audit/evidence/HARNESS-ISO-EXEC-20261003/green-20261004/checkpoint-37-native-contracts-and-mutation-kills.json) vincula as evidências atuais. Checkpoints anteriores são históricos, inclusive falhas preservadas, e não certificam a fonte futura.
