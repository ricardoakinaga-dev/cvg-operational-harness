# GREEN — correções e testes locais em execução

Data: 04/10/2026. Task: `HARNESS_ISO_GREEN_20261004`. Estado: `IN_PROGRESS`. Veredito global **FAIL**; produção **NO_GO**. Nenhum runtime promovido ao checkout compartilhado nesta rodada; zero chamadas OpenAI, sem push, dados reais, piloto ou implantação. Os 24 critérios continuam exigidos, sem novo DONE. Harness e produto conservam artefatos, processos e barras próprios.

## Estado atual

O candidato integrado R25 passou em formatação, tipos, lint, build e 5.735 testes unitários em 413 arquivos, sem skips; cobertura e demais gates nativos continuam em execução. A variante física R25 sem produto também está em testes com PostgreSQL e cobertura; ainda não tem veredito final. O baseline anterior R24 sem produto passou em 5.030 testes/383 arquivos, sem skips; as suítes se sobrepõem e não são somadas. A correção lexical R22 recebeu ACCEPT independente R23: os mesmos 32 controles passaram após seis falhas antes da correção, além de 45 probes próprios e três controles de integração. A regressão do produtor passou em 1.255 testes/cinco arquivos, tipos e lint. A CLI instalada R22 preservou os 48 links internos e terminou sem abortar: INCOMPLETE, 8.882 diagnósticos, zero violações e zero indisponibilidades lexicais; 7.818 inputs intactos. O aceite da correção não adjudica esses diagnósticos. O candidato R25 integra nove deltas CI/checker sobre a fonte R19; os 371 arquivos de testes originais e pisos de cobertura foram preservados. Scan Gitleaks estrito dos nove deltas: zero achados; revisão independente desta fatia e disposição I0 de 222 observações first-party estão em andamento. O sandbox R19 permanece em http://127.0.0.1:3501, com restart/browser e revisão independente aceitos no escopo sintético local; WhatsApp/áudio simulados, delivery NOT_QUALIFIED e NO_MODEL. Relatório 0595 mantém notas para os 24 itens, roadmap e backlog separados. Trabalho IN_PROGRESS; global FAIL e produção NO_GO, sem novo DONE, promoção Root, chamada OpenAI, push ou dados reais.

A falha atual e os REJECT/INVALID anteriores estão preservados com relatórios originais byte-exatos nos archives. Aceites de gateway e sessões/ingresso são limitados aos respectivos packets. Imagem neutra e E2E anteriores não certificam uma fonte futura; requalificação final segue obrigatória.

## Autoridade e próximos passos

SPECs 0179/0180 emendadas e builds de segurança, bootstrap, custo/modelo e ingresso foram aprovados individualmente. Aprovações e hashes constam nos recibos do diretório green. NO_MODEL para classes proibidas/entradas desconhecidas, dados exclusivamente sintéticos, promoção condicionada e T4 separado permanecem. A chave permanece no `.env` privado ignorado/0600. O processo local carrega esse arquivo; o valor da chave não foi exibido, copiado, logado ou incorporado às imagens.

1. Preservar os aceites limitados de gateway e sessões/ingresso; preservar o aceite OPS R8 e requalificar a composição final.
2. Fechar fronteira instalada, CI, operações e segurança com revisão independente válida; nenhum autoverdict do Builder é aceite independente.
3. Concluir suíte completa/cobertura crítica, variante física sem produto, PostgreSQL dedicado, E2E, tipos/lint/formato/links, builds, mutação, scanners, SBOM/licenças e certificação; requalificar imagens e programa local3500/3501 preservando journal.
4. Promover somente paths próprios após todos os gates e revisões exigidos, commit local sem push. Preparar pacote T4 congelado antes de chamada externa. Produção/piloto/release e decisão clínica D2 continuam separados.

Ledgers99/20/30 recebem apenas blocos próprios, com staging parcial e preservação byte a byte de todo dirty anterior. Evidências físicas persistem em `/home/ricardo/.cache/cvg-harness-green-20261004`, fora de /tmp; checkpoints e artefatos próprios são versionados por caminho. Serviços3400/3401 preservados.

`last_completed_action`: recibos R8 com aceite independente e regressões integradas atuais; falhas completas/neutral preservadas. `next_action`: concluir gates e críticas em andamento e fechar pendências. `status: IN_PROGRESS`.

[Checkpoint41](../../04_audit/evidence/HARNESS-ISO-EXEC-20261003/green-20261004/checkpoint-50-local-cert-and-linear-parser.json) vincula as evidências atuais. Checkpoints anteriores são históricos, inclusive falhas preservadas, e não certificam a fonte futura.

Checkpoint 51: variante sem produto R24 passou no build público e nos 5.030 testes em 383 arquivos, sem skips, com PostgreSQL e inputs intactos. Evidência finita, sem fechar a fronteira instalada nem autorizar produção. [Prova e hashes](../../04_audit/evidence/HARNESS-ISO-EXEC-20261003/green-20261004/final-neutral-r24-local-pass.json).

Checkpoint 52: sandbox sintético R19 em [http://127.0.0.1:3501](http://127.0.0.1:3501), PID próprio 1030372. Fonte R19, journal anterior preservado, replay e nove grupos browser PASS; [revisão independente ACCEPT](../../04_audit/evidence/HARNESS-ISO-EXEC-20261003/green-20261004/local-sandbox-r19-fresh-review.json). Isso não autoriza inferência externa, canal real ou produção.

## Operação do sandbox atual

A console está em http://127.0.0.1:3501 e o health em http://127.0.0.1:3500/health. Processo próprio: PID 1030372. A fonte é `/home/ricardo/.cache/cvg-harness-green-20261004/candidate-final-r19`; dados continuam em `/home/ricardo/.cache/cvg-harness-green-20261004/local/data`. Launcher atual: `/home/ricardo/.cache/cvg-harness-green-20261004/local-r19/start.sh`. Ele usa Node 22 e a chave privada no `.env`, sem imprimir seu valor; o programa usa apenas serviços simulados nesta composição.

Para parar esta instância, conferir o PID no `local-r19/runtime.json` e executar SIGTERM somente no processo próprio. Para iniciar após a parada, executar o launcher atual. O launcher antigo de `local/start.sh` aponta para a versão anterior e não é o recomendado. Não apagar o journal, não iniciar dois writers, nem interferir nas portas 3400/3401 de outro agente. O histórico da conversa visível é mantido em memória; notas e eventos permanecem no journal.

Checkpoint 53: [reparo R21 recusado com prova independente](../../04_audit/evidence/HARNESS-ISO-EXEC-20261003/green-20261004/c1-binding-stack-fresh-review-r21-rejected.json); [BUILD R22 e regressão de 1.255 testes](../../04_audit/evidence/HARNESS-ISO-EXEC-20261003/green-20261004/c1-nonbinding-label-r22-builder.json). A revisão do novo reparo e a closure instalada continuam abertas.
