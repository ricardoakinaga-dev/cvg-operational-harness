# GREEN — correções e testes locais em execução

Data: 04/10/2026. Task: `HARNESS_ISO_GREEN_20261004`. Estado: `IN_PROGRESS`. Veredito global **FAIL**; produção **NO_GO**. Nenhum runtime promovido ao checkout compartilhado nesta rodada; zero chamadas OpenAI, sem push, dados reais, piloto ou implantação. Os 24 critérios continuam exigidos, sem novo DONE. Harness e produto conservam artefatos, processos e barras próprios.

## Estado atual

Gateway R10 ACCEPT no escopo (1.335 regressões e 292 probes); correção de tupla integrada apenas na cópia. Channel integrado com 945 testes focados PASS; PostgreSQL dedicado 288 PASS, build-runtime/SBOM/licenças PASS, fonte MATCH de 7.806 inputs. Última suíte completa encerrada: 4.348 PASS em fonte anterior; repetição atual em execução. OPS R7 REJECT P1: raw contraditório vira entrega verificada; correção R8 isolada ativa. C1 privado 377 PASS e installed INCOMPLETE/1.706; revisão estática nova ativa, sem integração Main. Histórico Git strict: 6.693 alertas, propostas individuais com zero desconhecidos, sem aceite I0. Global FAIL, produção NO_GO; 24 critérios preservados, zero chamadas OpenAI, nenhum runtime promovido.

Revisões e reproduções anteriores são históricas e permanecem preservadas. O aceite de gateway e sessões/ingresso é limitado ao escopo de cada packet. Imagem neutra/E2E já passaram na fonte anterior; devem ser requalificados no candidato definitivo. Nenhum recorte substitui a suíte completa ou fecha a fronteira instalada.

## Autoridade e próximos passos

SPECs 0179/0180 emendadas e builds de segurança, bootstrap, custo/modelo e ingresso foram aprovados individualmente. Aprovações e hashes constam nos recibos do diretório green. NO_MODEL para classes proibidas/entradas desconhecidas, dados exclusivamente sintéticos, promoção condicionada e T4 separado permanecem. `.env` privado ignorado/0600 não foi lido, copiado, logado ou incorporado às imagens.

1. Preservar os aceites limitados de gateway e sessões/ingresso; corrigir OPS_R7_F01 e obter nova crítica.
2. Fechar fronteira instalada, CI, operações e segurança com revisão independente válida; nenhum autoverdict do Builder é aceite independente.
3. Concluir suíte completa/cobertura crítica, variante física sem produto, PostgreSQL dedicado, E2E, tipos/lint/formato/links, builds, mutação, scanners, SBOM/licenças e certificação; requalificar imagens e programa local3500/3501 preservando journal.
4. Promover somente paths próprios após todos os gates e revisões exigidos, commit local sem push. Preparar pacote T4 congelado antes de chamada externa. Produção/piloto/release e decisão clínica D2 continuam separados.

Ledgers99/20/30 recebem apenas blocos próprios, com staging parcial e preservação byte a byte de todo dirty anterior. Evidências físicas persistem em `/home/ricardo/.cache/cvg-harness-green-20261004`, fora de /tmp; checkpoints e artefatos próprios são versionados por caminho. Serviços3400/3401 preservados.

`last_completed_action`: suíte completa de 4.348 PASS, E2E nas três engines, aceite de sessões/ingresso e imagem neutra com processo production/PG. `next_action`: concluir gates e críticas em andamento e fechar pendências. `status: IN_PROGRESS`.

[Checkpoint 28](../../04_audit/evidence/HARNESS-ISO-EXEC-20261003/green-20261004/checkpoint-28-gateway-accepted-and-raw-receipt-finding.json) vincula as evidências atuais. Checkpoints anteriores são históricos, inclusive falhas preservadas, e não certificam a fonte futura.
