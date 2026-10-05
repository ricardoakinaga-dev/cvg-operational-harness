# GREEN — correções e testes locais em execução

Data: 04/10/2026. Task: `HARNESS_ISO_GREEN_20261004`. Estado: `IN_PROGRESS`. Veredito global **FAIL**; produção **NO_GO**. Nenhum runtime promovido ao checkout compartilhado nesta rodada; zero chamadas OpenAI, sem push, dados reais, piloto ou implantação. Os 24 critérios continuam exigidos, sem novo DONE. Harness e produto conservam artefatos, processos e barras próprios.

## Estado atual

A suíte completa atual com PostgreSQL e cobertura passou: **4.348 testes em 402 arquivos, zero falhas/skips, source MATCH**. A cobertura global passou as barras originais: statements 91,91%, branches 87,42%, functions 94,76% e lines 92,94%. O gate crítico continua FAIL apenas no grupo channel: functions 94,59% e branches 94,85%, abaixo de 95%. O recorte isolado de 129 testes passou, com functions 95,94% e branches 95,12%, denominadores inalterados. Integração do teste próprio e repetição completa ainda pendentes; nenhum limiar foi reduzido. Failures anteriores permanecem nas evidências históricas.

E2E Chromium: 12 PASS. Recorte em Chromium, Firefox e WebKit: 15 PASS, zero falhas/skips/retries e MATCH. Os conjuntos se sobrepõem e não são somados. Typecheck, lint, formato e npm audit atual passaram; audit registrou zero vulnerabilidades. PostgreSQL dedicado, variante neutra completa, scanners finais, mutação, SBOM/licenças e certificação final ainda devem fechar no candidato definitivo.

Gateway: cinco fontes de identity/pricing integradas privadamente; 1.532 testes focados PASS em 69 arquivos, zero falhas/skips. O reporter emitido em stdout foi extraído como uma única linha JSON completa, com o erro de argumento documentado. Revisão R8 INVALID por leitura fora do packet e snapshot de dist anterior; suas 113 provas recompiladas não substituem aceite. Nova R9 válida sobre dist atual retornou REJECT por colisão entre pares provider/model no circuito. Correção T2 isolada em andamento, preservando keys comuns e sem editar assertivas originais.

Sessões/ingresso: revisão independente ACCEPT no escopo das emendas aprovadas. Foram executados 220 testes existentes e 68 casos próprios com 238 requisições e 15 processos oficiais main sobre PostgreSQL; fonte/deps/dist preservados. Cobre HMAC independente de cookie, tenant antes da fila, papéis separados, falha/recuperação, cookie durável, replay e restart. Não é aceite global do programa.

Imagem neutra atual compilada em 18 projetos, 766 inputs, 210 source maps e 706 arquivos de contexto; exclui produto e 446 executáveis históricos. Build, shape e processo oficial em NODE_ENV=production com PostgreSQL/auth separados PASS; recuperação, sessão durável, webhook com cookie desconhecido durante falha e replay verificados. Somente rede privada e dados sintéticos; zero provider e sem implantação externa.

Segurança: 6.575 achados brutos com disposições individuais por posição/hash, zero desconhecidos/ausentes. A nova ocorrência é HMAC sintético de fixture. CodeQL analisou 831 JS/TS e três Actions: dois avisos de rate limiting na API e um em fixture negativa de execução dinâmica; disposições ainda aguardam revisão independente. Guard histórico conserva 446 fontes e 59 inputs, com dois bindings Fastify aprovados atualizados.

HISO-005 instalado está **INCOMPLETE com 11.700 diagnósticos**; 253 controles PASS e zero violações não aceitam a fronteira desconhecida. A primeira crítica foi rejeitada automaticamente pela ferramenta. A revisão estática R2 é formalmente INVALID por ler controles fora do packet; seus quatro achados técnicos reproduzidos são informativos. Builder isolado corrige identidade lexical, metadata de tipos, propriedades escalares e reexports neutros, sem excluir vendor/test/types nem desconhecidos. Nova revisão válida continua obrigatória.

## Autoridade e próximos passos

SPECs 0179/0180 emendadas e builds de segurança, bootstrap, custo/modelo e ingresso foram aprovados individualmente. Aprovações e hashes constam nos recibos do diretório green. NO_MODEL para classes proibidas/entradas desconhecidas, dados exclusivamente sintéticos, promoção condicionada e T4 separado permanecem. `.env` privado ignorado/0600 não foi lido, copiado, logado ou incorporado às imagens.

1. Concluir revisão nova de gateway e preservar o aceite limitado de sessões/ingresso.
2. Fechar fronteira instalada, CI, operações e segurança com revisão independente válida; nenhum autoverdict do Builder é aceite independente.
3. Concluir suíte completa/cobertura crítica, variante física sem produto, PostgreSQL dedicado, E2E, tipos/lint/formato/links, builds, mutação, scanners, SBOM/licenças e certificação; requalificar imagens e programa local3500/3501 preservando journal.
4. Promover somente paths próprios após todos os gates e revisões exigidos, commit local sem push. Preparar pacote T4 congelado antes de chamada externa. Produção/piloto/release e decisão clínica D2 continuam separados.

Ledgers99/20/30 recebem apenas blocos próprios, com staging parcial e preservação byte a byte de todo dirty anterior. Evidências físicas persistem em `/home/ricardo/.cache/cvg-harness-green-20261004`, fora de /tmp; checkpoints e artefatos próprios são versionados por caminho. Serviços3400/3401 preservados.

`last_completed_action`: suíte completa de 4.348 PASS, E2E nas três engines, aceite de sessões/ingresso e imagem neutra com processo production/PG. `next_action`: concluir gates e críticas em andamento e fechar pendências. `status: IN_PROGRESS`.

[Checkpoint 27](../../04_audit/evidence/HARNESS-ISO-EXEC-20261003/green-20261004/checkpoint-27-critical-focused-green-and-gateway-tuple-finding.json) vincula as evidências atuais. Checkpoints anteriores são históricos, inclusive falhas preservadas, e não certificam a fonte futura.
