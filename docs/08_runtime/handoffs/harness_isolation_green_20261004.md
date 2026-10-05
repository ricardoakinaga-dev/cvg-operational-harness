# GREEN — correções e testes locais em execução

Data: 04/10/2026. Task: `HARNESS_ISO_GREEN_20261004`. Estado: `IN_PROGRESS`. Veredito global **FAIL**; produção **NO_GO**. Nenhum runtime promovido ao checkout compartilhado nesta rodada; zero chamadas OpenAI, sem push, dados reais, piloto ou implantação. Os 24 critérios continuam exigidos, sem novo DONE. Harness e produto conservam artefatos, processos e barras próprios.

## Estado atual

CI12 no candidato privado: 4.678 testes PASS em 407 arquivos, PostgreSQL 16 e V8, sem skips/TODO; cobertura global e seis grupos críticos PASS. Variante física sem produto: 4.050 testes PASS em 380 arquivos, sem skips/TODO e builds públicos PASS. As suítes se sobrepõem e não são somadas. Revisão da admissão de CI aceita somente seu escopo, com desvios de output divulgados; 371 testes originais e suas asserções preservados. C1 R16: 911 testes PASS (253 originais + 658 estáticos), tipos/lint PASS. Entretanto, a crítica nova é REJECT: P1 por atalhos de workspace que omitem sucessores instalados fisicamente, P2 por workspace ausente sem testemunho de produto físico e P2 por diretório instalado sem manifesto raiz cujo metadata aninhado não é governado. São 20 falsos PASS confirmados; 154 probes independentes, 118 correspondentes e 36 divergentes, dos quais 32 sustentam os achados e quatro são expectativas exploratórias não confirmadas. Fonte/dependências/metadata invariantes; nenhuma chamada externa ou leitura narrativa proibida. Relatórios e 1.708 inputs finitos preservados. R17 em execução incorpora os três achados e a continuação diagnóstica do ESLint publicado com referência local ausente. Installed continua bloqueado; os 1.610 diagnósticos históricos não foram aceitos ou resolvidos. C1 ainda não integrado à Main/Root. Archives integrais de caches próprios encerrados R2/R3 foram verificados byte a byte antes da remoção apenas das árvores exatas: bytes de replay persistem fora de /tmp e do alcance de git clean, com manifestos versionáveis. Fronteira instalada, fonte final, segurança, imagem compilada, certificação e promoção condicionada permanecem pendentes. Veredito global FAIL; produção NO_GO; 24 critérios mantidos, nenhum novo DONE, zero chamadas OpenAI, promoção de runtime Root ou push.

A falha atual e os REJECT/INVALID anteriores estão preservados com relatórios originais byte-exatos nos archives. Aceites de gateway e sessões/ingresso são limitados aos respectivos packets. Imagem neutra e E2E anteriores não certificam uma fonte futura; requalificação final segue obrigatória.

## Autoridade e próximos passos

SPECs 0179/0180 emendadas e builds de segurança, bootstrap, custo/modelo e ingresso foram aprovados individualmente. Aprovações e hashes constam nos recibos do diretório green. NO_MODEL para classes proibidas/entradas desconhecidas, dados exclusivamente sintéticos, promoção condicionada e T4 separado permanecem. `.env` privado ignorado/0600 não foi lido, copiado, logado ou incorporado às imagens.

1. Preservar os aceites limitados de gateway e sessões/ingresso; preservar o aceite OPS R8 e requalificar a composição final.
2. Fechar fronteira instalada, CI, operações e segurança com revisão independente válida; nenhum autoverdict do Builder é aceite independente.
3. Concluir suíte completa/cobertura crítica, variante física sem produto, PostgreSQL dedicado, E2E, tipos/lint/formato/links, builds, mutação, scanners, SBOM/licenças e certificação; requalificar imagens e programa local3500/3501 preservando journal.
4. Promover somente paths próprios após todos os gates e revisões exigidos, commit local sem push. Preparar pacote T4 congelado antes de chamada externa. Produção/piloto/release e decisão clínica D2 continuam separados.

Ledgers99/20/30 recebem apenas blocos próprios, com staging parcial e preservação byte a byte de todo dirty anterior. Evidências físicas persistem em `/home/ricardo/.cache/cvg-harness-green-20261004`, fora de /tmp; checkpoints e artefatos próprios são versionados por caminho. Serviços3400/3401 preservados.

`last_completed_action`: recibos R8 com aceite independente e regressões integradas atuais; falhas completas/neutral preservadas. `next_action`: concluir gates e críticas em andamento e fechar pendências. `status: IN_PROGRESS`.

[Checkpoint41](../../04_audit/evidence/HARNESS-ISO-EXEC-20261003/green-20261004/checkpoint-42-physical-installed-successors-and-review.json) vincula as evidências atuais. Checkpoints anteriores são históricos, inclusive falhas preservadas, e não certificam a fonte futura.
