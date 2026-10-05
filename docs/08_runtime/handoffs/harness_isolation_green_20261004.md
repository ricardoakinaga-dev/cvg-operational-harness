# GREEN — correções e testes locais em execução

Data: 04/10/2026. Task: `HARNESS_ISO_GREEN_20261004`. Estado: `IN_PROGRESS`. Veredito global **FAIL**; produção **NO_GO**. Nenhum runtime promovido ao checkout compartilhado nesta rodada; zero chamadas OpenAI, sem push, dados reais, piloto ou implantação. Os 24 critérios continuam exigidos, sem novo DONE. Harness e produto conservam artefatos, processos e barras próprios.

## Estado atual

A candidata isolada R19 passou nos 5.639 testes em 410 arquivos, com PostgreSQL/V8 e zero skips; a variante física sem produto passou nos 5.004 testes em 382 arquivos. Seis gates críticos e dez mutantes passaram. E2E: 12 testes Chromium e 15 nos três browsers, sem skips/retries; contagens sobrepostas não somadas. A correção TTL recebeu ACCEPT independente. A imagem atual passou 22 grupos em configuração de produção local; prova TCP com dois processos e PostgreSQL confirmou orçamento compartilhado e falha fechada. Fonte completa e imagem/capturas estão preservadas com hashes. A certificação nativa R19/r3 passou todos os 16 comandos, mas o escritor falhou: parser não reconhecia ANSI e preparação Git própria estava incorreta. Esses failures foram preservados. R21 corrigiu ANSI/Git, passou 250 testes focados, tipos/lint e a suíte nativa principal; cobertura e demais gates seguem ativos. Crítico R21 reproduziu OSC com espaços escondendo o primeiro resumo com falha, portanto REJECT. R22 trata OSC completo e recusa sequência incompleta: regressão antes 16 PASS/7 FAIL, depois 258 PASS, tipos/lint PASS; revisão independente nova ativa. Os 371 testes originais e cobertura 281 foram preservados. Segurança atual R20 recebeu ACCEPT para 6.578 observações individuais, sem pendências nesse escopo. História congelada no HEAD 849455b tem 6.688 observações: 6.685 classificadas no exame anterior e as três restantes aceitas por novo crítico com blobs/AST/crypto offline; não abrange commits posteriores. C1 R18 tem ACCEPT apenas de soundness; execução instalada continua INCOMPLETE com 2.958 diagnósticos. Sem promoção de código Root, provider, push ou dados reais. Global FAIL e produção NO_GO; 24 critérios preservados, nenhum novo DONE.

A falha atual e os REJECT/INVALID anteriores estão preservados com relatórios originais byte-exatos nos archives. Aceites de gateway e sessões/ingresso são limitados aos respectivos packets. Imagem neutra e E2E anteriores não certificam uma fonte futura; requalificação final segue obrigatória.

## Autoridade e próximos passos

SPECs 0179/0180 emendadas e builds de segurança, bootstrap, custo/modelo e ingresso foram aprovados individualmente. Aprovações e hashes constam nos recibos do diretório green. NO_MODEL para classes proibidas/entradas desconhecidas, dados exclusivamente sintéticos, promoção condicionada e T4 separado permanecem. `.env` privado ignorado/0600 não foi lido, copiado, logado ou incorporado às imagens.

1. Preservar os aceites limitados de gateway e sessões/ingresso; preservar o aceite OPS R8 e requalificar a composição final.
2. Fechar fronteira instalada, CI, operações e segurança com revisão independente válida; nenhum autoverdict do Builder é aceite independente.
3. Concluir suíte completa/cobertura crítica, variante física sem produto, PostgreSQL dedicado, E2E, tipos/lint/formato/links, builds, mutação, scanners, SBOM/licenças e certificação; requalificar imagens e programa local3500/3501 preservando journal.
4. Promover somente paths próprios após todos os gates e revisões exigidos, commit local sem push. Preparar pacote T4 congelado antes de chamada externa. Produção/piloto/release e decisão clínica D2 continuam separados.

Ledgers99/20/30 recebem apenas blocos próprios, com staging parcial e preservação byte a byte de todo dirty anterior. Evidências físicas persistem em `/home/ricardo/.cache/cvg-harness-green-20261004`, fora de /tmp; checkpoints e artefatos próprios são versionados por caminho. Serviços3400/3401 preservados.

`last_completed_action`: recibos R8 com aceite independente e regressões integradas atuais; falhas completas/neutral preservadas. `next_action`: concluir gates e críticas em andamento e fechar pendências. `status: IN_PROGRESS`.

[Checkpoint41](../../04_audit/evidence/HARNESS-ISO-EXEC-20261003/green-20261004/checkpoint-48-security-history-and-ci-parser.json) vincula as evidências atuais. Checkpoints anteriores são históricos, inclusive falhas preservadas, e não certificam a fonte futura.
