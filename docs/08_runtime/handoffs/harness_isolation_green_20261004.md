# GREEN — correções e testes locais em execução

Data: 04/10/2026. Task: `HARNESS_ISO_GREEN_20261004`. Estado: `IN_PROGRESS`. Veredito global **FAIL**; produção **NO_GO**. Nenhum runtime promovido ao checkout compartilhado nesta rodada; zero chamadas OpenAI, sem push, dados reais, piloto ou implantação. Os 24 critérios continuam exigidos, sem novo DONE. Harness e produto conservam artefatos, processos e barras próprios.

## Estado atual

CI12 foi integrado somente na cópia principal: 469 testes de CI e três de governança de mutação passaram; tipos e lint PASS, MATCH 7811. Controle sem mutações: 94 PASS em sete arquivos, serviço HTTP local permitido. Runner real: dez mutantes selecionados e dez KILLED, zero sobreviventes, timeout ou erro; o recibo real passou na admissão pelo catálogo atual. Os 55 controles novos, as asserções/nomes/cardinalidades e os 371 arquivos originais foram preservados; somente inputs de fixtures próprias incompletas foram corrigidos. A suíte completa CI12 com PostgreSQL16/V8 está em execução, e McClintock2 faz a revisão independente no packet cf3ba130. Última completa aceita apenas como execução CI10: 4.623 PASS/407 arquivos; neutro físico CI10: 3.995 PASS/380, zero skips/todo. PG dedicado288, E2E12 Chromium e15 em três browsers, builds, SBOM/licenças/audit0 e coverage crítica CI10 continuam evidência daquela fonte, com sobreposição não somada. C1R13 recebeu REJECT válido: dois HIGH e vinte falsos PASS porque o censo de metadata não conservava suas arestas. Lead R14 conecta manifestos aninhados e closures locais canônicas; 56 novos controles, antes582 PASS/32 FAIL em614, depois867 PASS (253 originais +614 estáticos), tipos/lint PASS e MATCH7805. Prefixo558 byte-exato. Russell2 revisa o packet3bdea9d6. Instalado permanece INCOMPLETE com1.610 diagnósticos e zero violações; nenhuma exceção foi concedida. C1 não foi integrado à Main nem ao Root. Fonte final, fronteira instalada, segurança/imagens/certificação e promoção condicionada seguem pendentes. Falhas e críticas anteriores preservadas com bytes/hashes em arquivos versionáveis próprios. Global FAIL, produção NO_GO, 24 critérios preservados, nenhum novo DONE, zero chamadas OpenAI, promoção Root e push.

A falha atual e os REJECT/INVALID anteriores estão preservados com relatórios originais byte-exatos nos archives. Aceites de gateway e sessões/ingresso são limitados aos respectivos packets. Imagem neutra e E2E anteriores não certificam uma fonte futura; requalificação final segue obrigatória.

## Autoridade e próximos passos

SPECs 0179/0180 emendadas e builds de segurança, bootstrap, custo/modelo e ingresso foram aprovados individualmente. Aprovações e hashes constam nos recibos do diretório green. NO_MODEL para classes proibidas/entradas desconhecidas, dados exclusivamente sintéticos, promoção condicionada e T4 separado permanecem. `.env` privado ignorado/0600 não foi lido, copiado, logado ou incorporado às imagens.

1. Preservar os aceites limitados de gateway e sessões/ingresso; preservar o aceite OPS R8 e requalificar a composição final.
2. Fechar fronteira instalada, CI, operações e segurança com revisão independente válida; nenhum autoverdict do Builder é aceite independente.
3. Concluir suíte completa/cobertura crítica, variante física sem produto, PostgreSQL dedicado, E2E, tipos/lint/formato/links, builds, mutação, scanners, SBOM/licenças e certificação; requalificar imagens e programa local3500/3501 preservando journal.
4. Promover somente paths próprios após todos os gates e revisões exigidos, commit local sem push. Preparar pacote T4 congelado antes de chamada externa. Produção/piloto/release e decisão clínica D2 continuam separados.

Ledgers99/20/30 recebem apenas blocos próprios, com staging parcial e preservação byte a byte de todo dirty anterior. Evidências físicas persistem em `/home/ricardo/.cache/cvg-harness-green-20261004`, fora de /tmp; checkpoints e artefatos próprios são versionados por caminho. Serviços3400/3401 preservados.

`last_completed_action`: recibos R8 com aceite independente e regressões integradas atuais; falhas completas/neutral preservadas. `next_action`: concluir gates e críticas em andamento e fechar pendências. `status: IN_PROGRESS`.

[Checkpoint 40](../../04_audit/evidence/HARNESS-ISO-EXEC-20261003/green-20261004/checkpoint-40-ci12-integrated-and-metadata-graph.json) vincula as evidências atuais. Checkpoints anteriores são históricos, inclusive falhas preservadas, e não certificam a fonte futura.
