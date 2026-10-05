# GREEN — correções e testes locais em execução

Data: 04/10/2026. Task: `HARNESS_ISO_GREEN_20261004`. Estado: `IN_PROGRESS`. Veredito global **FAIL**; produção **NO_GO**. Nenhum runtime promovido ao checkout compartilhado nesta rodada; zero chamadas OpenAI, sem push, dados reais, piloto ou implantação. Os 24 critérios continuam exigidos, sem novo DONE. Harness e produto conservam artefatos, processos e barras próprios.

## Estado atual

A candidata isolada R19 passou nos 5.639 testes em 410 arquivos, com PostgreSQL/V8 e zero skips; a variante física sem produto passou nos 5.004 testes em 382 arquivos. Seis gates críticos e dez mutantes passaram. E2E:12 testes Chromium e15 nos três browsers, sem skips/retries; contagens sobrepostas não somadas. A correção TTL recebeu ACCEPT independente:121 testes fornecidos,25 adversariais e5 journal PASS;27 journal fora por filtro de escopo. Nenhuma asserção ou limite original reduzido. A imagem atual passou22 grupos em configuração de produção local, com813 entradas intactas,135 imports públicos compilados e limpeza dos recursos. Nova prova TCP/2processos/PostgreSQL confirmou limites compartilhados nas rotas publish/rollback e falha fechada por permissão revogada; publicação repetida400 é defesa contra duplicação, não300 publicações bem-sucedidas. Fonte completa8476 e imagem/capturas foram preservadas em partes reconstruíveis com hashes. Certificação nativa r2 teve5638PASS/1SKIP por flags de PG omitidas pelo runner; foi interrompida e preservada. A r3 corrigida passouformato/tipos/lint/build e5639unitPASS/zeroSKIP; cobertura/demaisgates ativos. Revisão de segurança r19 REJECT:6575Gitleaks+fixtureCodeQL são disposições técnicas de falso positivo, doisCodeQL pediamHTTP e houve leitura indevida de julgamentosRoot; novo crítico r20 ativo com prova atual e bootstrap explícito semRoot. HistóriaGitHEAD849455b tem6688observações; investigação individual78pendentes/semcredencial realconfirmada continua. C1R18 ACCEPT apenas soundness; installed INCOMPLETE2958, nenhumunknown dispensado. Sem promoção Root/Main, provider/push/dadosreais0. GlobalFAIL, produçãoNO_GO;24 critérios preservados, nenhum novoDONE.

A falha atual e os REJECT/INVALID anteriores estão preservados com relatórios originais byte-exatos nos archives. Aceites de gateway e sessões/ingresso são limitados aos respectivos packets. Imagem neutra e E2E anteriores não certificam uma fonte futura; requalificação final segue obrigatória.

## Autoridade e próximos passos

SPECs 0179/0180 emendadas e builds de segurança, bootstrap, custo/modelo e ingresso foram aprovados individualmente. Aprovações e hashes constam nos recibos do diretório green. NO_MODEL para classes proibidas/entradas desconhecidas, dados exclusivamente sintéticos, promoção condicionada e T4 separado permanecem. `.env` privado ignorado/0600 não foi lido, copiado, logado ou incorporado às imagens.

1. Preservar os aceites limitados de gateway e sessões/ingresso; preservar o aceite OPS R8 e requalificar a composição final.
2. Fechar fronteira instalada, CI, operações e segurança com revisão independente válida; nenhum autoverdict do Builder é aceite independente.
3. Concluir suíte completa/cobertura crítica, variante física sem produto, PostgreSQL dedicado, E2E, tipos/lint/formato/links, builds, mutação, scanners, SBOM/licenças e certificação; requalificar imagens e programa local3500/3501 preservando journal.
4. Promover somente paths próprios após todos os gates e revisões exigidos, commit local sem push. Preparar pacote T4 congelado antes de chamada externa. Produção/piloto/release e decisão clínica D2 continuam separados.

Ledgers99/20/30 recebem apenas blocos próprios, com staging parcial e preservação byte a byte de todo dirty anterior. Evidências físicas persistem em `/home/ricardo/.cache/cvg-harness-green-20261004`, fora de /tmp; checkpoints e artefatos próprios são versionados por caminho. Serviços3400/3401 preservados.

`last_completed_action`: recibos R8 com aceite independente e regressões integradas atuais; falhas completas/neutral preservadas. `next_action`: concluir gates e críticas em andamento e fechar pendências. `status: IN_PROGRESS`.

[Checkpoint41](../../04_audit/evidence/HARNESS-ISO-EXEC-20261003/green-20261004/checkpoint-47-current-compiled-and-ttl-review.json) vincula as evidências atuais. Checkpoints anteriores são históricos, inclusive falhas preservadas, e não certificam a fonte futura.
