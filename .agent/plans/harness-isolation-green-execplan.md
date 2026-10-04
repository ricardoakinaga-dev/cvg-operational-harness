# GREEN — correção contínua local — 04/10/2026

## Purpose / Big Picture

Entregar harness e consumidor separados com todos os gates locais obrigatórios verdes e revisão independente válida. Pedido atual revoga o orçamento de um ciclo NEXT. Preservar os failures anteriores, a baseline completa e as SPECs aprovadas. OpenAI/GPT‑6 Luna e chave privada no `.env`; emenda sintética aprovada para BUILD local, execução externa sujeita ao pacote T4 final. NO_MODEL clínico padrão permanece. Sem dados reais, push, piloto ou deploy de produção.

## Progress

- [x] Recuperar instruções, claims e failures; registrar claim antes de qualquer fonte.
- [x] Copiar baseline completa com quatro arquivos/23 testes ausentes e seus inputs, todos hash-bound, sem tocar originais.
- [ ] Corrigir C1 por reprodução discriminante, preservar positivos e recusar desconhecidos; validar fechamento físico.
- [ ] Corrigir preparação E2E/neutra e isolamento físico dos críticos, mantendo asserções.
- [ ] Configurar .env funcional/provider no escopo efetivamente decidido e subir programa local.
- [ ] Gates completos Node22, PostgreSQL, E2E, produto, neutro, segurança/higiene e revisões válidas do artefato final.
- [ ] Integrar somente fontes próprias após aceites, manter evidências/logs/backlog e estado atuais.

## Decision Log

O usuário pediu correção até todos os testes e aprovações, substituindo a interrupção por limite de ciclos do NEXT. Não reduzir barra, skips ou asserções. Nova crítica é autorizada quando há correção técnica/procedimental discriminante. Provider real pode ser configurado a pedido, sem inferir liberação de dados reais, CLINICAL ou produção. Donos de Root sujos permanecem preservados.

## Plan of Work

Lead mantém caminho crítico C1 e integração; Builder independente corrige o setup E2E em cópia disjunta. Revisores sempre novos e fonte congelada, com dependências próprias e cache/TMPDIR inteiramente dentro de seu output. Criar baseline com Git privado desde o início, flags PG=1 e anchor histórico. Reprodutores positivos/negativos existentes, mais os12 contraexemplos do último ciclo, são controles obrigatórios. Fonte do produto PV10 congelada anterior é input, não aceite.

## Validation and Acceptance

Typecheck/lint/build/smoke/full suíte com PG/PG dedicado/E2E zero retries/variante neutra sem products devem passar. Baseline histórica preservada por identidade, incluindo os23 testes antes ausentes. Critic exige fonte/inputs/dependências sem drift, original37/foundation40 e PV01–PV14 íntegros, zero clínica por modelo enquanto NO_MODEL. Installed scan INCOMPLETE não equivale a aceite de independência. Critérios humanos/ambiente real continuam separados da aprovação técnica local; não fabricar aprovação.

## Idempotence and Recovery

Copies novas, fontes antigas readonly, logs brutos no cache próprio, Root somente evidência compacta. Não limpar/restaurar/stash/reset alheio. Claims de banco/portas exclusivas. Não reexecutar suíte verde sem mudança/novo finding. Failure de setup deve ter mecanismo identificado e permanecer registrado.

## Outcomes / Remaining Work

IN_PROGRESS. A baseline anterior passou em 3.015 testes / 342 arquivos; PostgreSQL dedicado 288 / 35; E2E 12 sem retries; neutro 2.725 / 333 com products fisicamente ausente. Esses conjuntos se sobrepõem e não certificam o código novo. Audit npm na cópia corrigida: zero vulnerabilidades observadas. Tipos/lint da baseline passaram. Os 23 testes alheios antes ausentes continuam byte-preservados.

C1 R1–R3 tiveram críticas válidas REJECT preservadas. R4 corrige declarations TypeScript e raízes físicas, com 191 testes PASS e revisão independente restrita APPROVE. Installed scan R2 continua INCOMPLETE com 441 diagnósticos: não há aceite global de independência por esse resultado.

D011 R1: 396 testes verdes, crítica I1 REJECT por probe HALF_OPEN preso após cancelamento e DNS posterior a redirect cancelado. Lead corrigiu ambos, incluiu cancelamento de DNS em voo e controles de contagem neutra; R2 local passou em 403 testes / 38 arquivos, sem skips, typecheck e lint PASS. Novo crítico fresh-context em packet de 447 fontes próprias, sem caches de fonte, ainda em andamento. Nenhuma mudança de NO_MODEL, budget ou corpus.

PISO-005–006: Builder operacional continua na cópia própria; último conjunto selado indica 376 testes PASS e matriz com limites explícitos. Integração aguarda entrega/hash final. Lead implementou backup/restore por writer lock, inventário de todos os documentos e identidade/seq/chain do journal, originais preservados. Teste inicial: 19 PASS, um FAIL na guarda de hold pré-integração. Workflow real por webhook em preparação; falhas próprias de fixture e pausa pré-integração preservadas. Monitor separado: 12 PASS; alerta recebido e persistido 19,9 segundos após parada real de processo, usando poll10s/deadline2s. Host remoto e gestor real não qualificados.

Imagem scratch prévia passou em Node22/UID10001/sem shell/root readonly/data volume; precisa rebuild no source final e não qualifica egress da infraestrutura. Adaptador sintético ganhou comparação de referência proposta contra omissões, 56 testes / 2 arquivos PASS; expectativa humana continua NOT_RUN. Chave privada presente e modelo gpt-6-luna; console3501 baseline vivo NO_MODEL. Runner exige packet/receipt e reserva persistente contra replay; zero chamadas externas.

Próximos passos: integrar operações somente paths próprios, fechar workflow de restore e revisão nova produto/backup/monitor; aguardar crítica D011 R2; congelar fonte final e repetir gates exigidos. Preparar packet T4 concreto após certificação. Promoção condicionada, ledgers e aceites humanos pendentes são registrados sem inventar aprovação. Ledgers Root dirty preservados pela coordenação; entradas propostas serão anexadas no handoff próprio.

## Continuidade técnica — gateway R4 e operações R2

D011 R2 e R3 foram REJECT por gerações de probe e publicação tardia após cancelamento. Os dois mecanismos foram corrigidos sem reduzir asserções; R4 local conta 409 testes/40 arquivos na compatibilidade de quatro pacotes, mais tipos e lint PASS; crítico novo em andamento. A primeira execução R4 de três pacotes é subconjunto295/28, não substitui409/40. Quatro regressões reais HTTP cobrem controle positivo, cancelamento em microtask após fulfillment, validação e clock antes do commit; cancelados não publicam completed/sucesso/custo adicional.

Operações integradas422/19 PASS; permissões privadas0700 sob umask002/022/077, restore workflow21/2, monitor12/1 com receipt19,9s, capacidade1000/24h via journal/HTTP e supervisor3/1 realchild com bloqueio síncrono injetado contido10,0s. Não qualificam falha física/alerta remoto/receipts de provider real. Guia antigo supersedido e recursos compose declarados. Mainfull PG R2 está em execução, sem mutações paralelas da fonte. InfraBuilder prepara packet default-deny sem aplicar firewall host. D009 ainda pendente: lane de migração pública e budget persistente registrada; positivos estritamente não clínicos, defaultNO_MODEL e nenhuma aprovação de preços/prompt de produção inventada. Zero chamadas externas; T4 final ainda não congelado.

## Continuidade — suíte completa, D009 e scanners reais

Full PG R2 terminou em 3.248 testes / 363 arquivos: 3.247 PASS, um FAIL, zero skips, fonte MATCH. Falha no hash do manifesto de mutação para ssrf; atualizado somente hash, seletores e asserções preservados. Testes de manifesto3 PASS e dez mutantes reais mortos, zero sobreviventes. Suíte completa ainda precisa repetir no candidato final; o resultado anterior não foi convertido em PASS.

R4 independente REJECT por callbacks de observers, corrigidos no R5: 412/41 compatibilidade PASS e erros observáveis sem dupla conclusão. D009 entregue com81 novos testes/672 regressões PASS, tipos/lint/build/consumer dist PASS; integrado14paths com hashes e callbacks/circuit preservados. Integração focada493/490/3FAIL encontrou somente fixture própria de observers com estimatezero menor que custo.016; estimate corrigido para.016 mantendo todas as asserções bytepreservadas. Reteste e crítico fresco D009+D011 em andamento; D010 CI físico separado ainda ativo.

Scanners reais em fonte congelada física: Gitleaks8.28.0 redacted100 registrou100achados; CodeQL2.27.0 executou89queries e registrou21alertas (10ativos/11históricos). Ambos são FAIL_REMEDIATION_REQUIRED, não confundidos com npm audit zero. Base SPEC0159 mantém BUILD_NOT_AUTHORIZED; emenda concreta GREEN SHA9cc15c17d4c86dd165f4a2ba876046343f16146a557192f07558edead9470477 preparada e revisão T3 solicitada conforme D12. Nenhuma alteração de segurança dependente dessa emenda enquanto resposta PENDING. Código API alheio/histórico/env privado preservados. Execução externa continua zero, certificação final/produção não aprovada.

## Continuidade — cobertura composta e callback de opções

[Checkpoint 10](../../docs/04_audit/evidence/HARNESS-ISO-EXEC-20261003/green-20261004/checkpoint-10-d009-composed-coverage.json): 3.332 testes completos com PostgreSQL PASS em 367 arquivos, zero skips, source MATCH e cobertura global/critical PASS. Todas as 3.248 asserções anteriores permanecem no inventário; 84 adicionadas, 81 de D009 e três de observers. Tipos/lint verdes nesse composto. Não é certificação final após mudanças posteriores.

Crítico reproduziu P1: wrapper de opções do circuito perdia retorno PromiseLike, levando a unhandled rejection depois do sucesso. Lead reproduziu em subprocesso Node estrito (três controles PASS e um FAIL), corrigiu somente o return e os mesmos quatro testes passaram. Compatibilidade passou em 497 testes/45 arquivos, sem skips; tipos/lint globais PASS. A cópia do primeiro crítico omitiu dist das dependências por erro de ignore recursivo do Lead; identidade do subset não comprovou completude. Revisão completa INVALID por procedimento, finding real preservado. Nova cópia prova igualdade Main antes/cópia/depois com 7.718 fontes, 17.345 arquivos de dependências e 48 symlinks internos, dist presente e zero hardlinks externos. Novo crítico fresco em andamento, conforme [checkpoint 11](../../docs/04_audit/evidence/HARNESS-ISO-EXEC-20261003/green-20261004/checkpoint-11-observer-options-and-review-copy.json). Segurança T3 permanece pendente sem BUILD; D010 continua ativo.

## Continuidade — revisão válida, CI e fluxo na imagem

[Checkpoint 12](../../docs/04_audit/evidence/HARNESS-ISO-EXEC-20261003/green-20261004/checkpoint-12-fresh-review-ci-console-image.json): D009/D011 recebeu APPROVE local válido do crítico novo em pacote sem histórico: 497 testes e 33 probes, inputs completos MATCH antes/depois. A revisão R2 anterior foi INVALID por leitura de coordenação/histórico; seus controles verdes permanecem evidência, sem aceite I1. Console real passou nove controles e foi reiniciado preservando o volume, com confirmação explícita/gestor/NO_MODEL e zero chamadas OpenAI.

[Checkpoint 13](../../docs/04_audit/evidence/HARNESS-ISO-EXEC-20261003/green-20261004/checkpoint-13-full-suite-and-new-critic-findings.json): integração CI por 25 paths próprios e inventário explícito manteve as asserções anteriores. Suíte completa com PostgreSQL/cobertura: 3.470 PASS/371 arquivos, zero skips, MATCH; crítico/cobertura/tipos/lint PASS. PostgreSQL dedicado288/35 PASS. Formatação falhou somente nos dois JSONs próprios de CI. Imagem scratch atual passou hardening e ajuda/nota bruta/confirmação com NODE_ENV production, zero modelo; failures de setup por gestor omitido e seletor de help preservados. Captura do fluxo contou seu output declarado como drift: processo0, três inputs MATCH; recibo original exit3 não foi reescrito.

Crítica D010 nova REJECT por cinco bypasses/lacunas concretos, crítica operações nova REJECT por hold de orçamento não aplicado ao efeito, arquivos existentes0664 aceitos e callback associado recusado na saturação unmatched. Builders CI-R2 e OPS-R3 trabalham em cópias físicas disjuntas para corrigir mecanismos e preservar contraexemplos/asserções. E2E inicial encontrou dist público ausente na nova cópia; runner próprio parado SIGINT para preparar build antes de repetir. Variante neutra física executando full PG/coverage. Nenhum resultado verde anterior substitui retestes/revisões após estes fixes. Segurança T3 continua pendente sem BUILD; pacote T4 final/produção permanecem não aprovados.

## Continuidade — produção sintética e candidato CI-R2/OPS-R3

[Checkpoint 14](../../docs/04_audit/evidence/HARNESS-ISO-EXEC-20261003/green-20261004/checkpoint-14-production-images-ci-ops-and-bootstrap.json) registra E2E anterior12 Chromium e15 em Chromium/Firefox/WebKit PASS, zero retries/skips. Neutro anterior2970PASS/3FAIL em349files:20 destinos do produto retirado eram exigidos pela política global. CI-R2 projetou somente essas entradas na variante, conservando checker/policy de origem e todos os testes;244 contratos e164 neutros focais PASS.28paths próprios verificados/24 copiados; inventário371originais+8arquivos novos,276fontes de coverage e34seals antigos intactos.

OPS-R3 integrou seis paths por hashes, com257 testes distintos PASS e os mesmos18probes antes15PASS/3FAIL, depois18PASS. O Builder alterou um cache descartável do Vitest e declarou a exceção; cache/dist/dependências não foram promovidos. Duas revisões novas com pacotes completos sem história estão em andamento. FullPG/coverage sobre CI-R2+OPS-R3 já executando; variante neutra nova em preparação com banco exclusivo55599.

Imagem limpa do harness7624sources sem produto/node_modules/dist foi construída e passou exports públicos compilados/live/ready em desenvolvimento. Produto reconstruído após OPS-R3 passou NODE_ENVproduction, ajuda/nota bruta/confirmação explícita, readonly/networknone/UID10001, zero modelo. Probe do entrypoint oficial do harness em produção, PG27migrations/roles separadas/RLS/inbounddurável/identidadeHMAC, revelou readiness200 e rotas503 por operatorSessionStore não composto. Falha bruta MATCH permanece; emenda de bootstrap SHA2559fec7558358dc03d28fd8eabf8d5c3416f31c217088641988375a5cee6b45 enviada para revisão T3 antes de qualquer BUILD. Segurança0159 continua pendente separadamente.

Gauntlet registra round1 FIX_RETEST; evidências limitadas não foram confundidas com aceite do fingerprint integral. Global FAIL/produção NO_GO, nenhum novo cartãoDONE, nenhuma promoção runtimeRoot/chamadaOpenAI/push/piloto/firewall. Ledgers99/20/30 continuam dirty de terceiros, com entradas propostas somente. Próximas ações: completar gates/revisões, aplicar apenas emendas explicitamente revistas, refazer imagens e freeze final antes de packetsT4.

## Continuidade — revisão de recibos e validação de evidências

[Checkpoint 15](../../docs/04_audit/evidence/HARNESS-ISO-EXEC-20261003/green-20261004/checkpoint-15-cross-context-receipts-and-ci-validation.json): a suíte completa com PostgreSQL terminou em **3.504 PASS e um FAIL**, 3.505 testes em 372 arquivos, sem skips e com fonte MATCH. A variante física sem produto teve **2.993 PASS e um FAIL**, 2.994 testes em 349 arquivos, sem skips e com MATCH. Os três defeitos documentais anteriores foram resolvidos. A falha restante era um teste novo de CI que esperava sete adições após integrar o oitavo arquivo de testes de OPS-R3. Corrigida a contagem estrita para oito, mantendo as 371 referências originais e os 276 caminhos de cobertura: os 164 testes focados passaram tanto no Main quanto no neutro. Os relatórios completos com falha permanecem; cobertura do código atual não foi inferida de arquivos anteriores. Nova execução completa com cobertura está em andamento.

A revisão nova de operações aprovou limitadamente os mecanismos de hold efetivo, permissões e capacidade, mas terminou **REJECT**: após trocar conta ou provider e reabrir o mesmo journal, um callback da configuração nova confirmou um envio histórico. A falha foi reproduzida em HTTP e em dois processos do bundle compilado. Foram 554 testes originais PASS e 17 probes PASS/dois FAIL, com input físico completo MATCH. OPS-R4 está corrigindo a identidade histórica do efeito, conservando os registros e contraexemplos.

A revisão nova de CI terminou **REJECT** com seis lacunas funcionais de schema, validação antes de I/O, counters de snapshots, denominadores globais e fonte executável em .gauntlet; o sétimo achado era a contagem de adições já corrigida pelo Lead. Foram 539 testes focados PASS, um FAIL e dois casos não executados por autoridade, sem rede real. O pacote não permitia interpretar duas fixtures históricas e não tinha a política/runbook autênticos; a próxima cópia inclui esses inputs finitos com autoridade explícita. CI-R3 corrige os seis mecanismos em cópia própria.

As duas emendas T3 — segurança e bootstrap de sessões — continuam pendentes, sem BUILD dependente. O modelo permanece gpt-6-luna, com zero chamadas do programa à OpenAI. A consulta pública de preços é preparação, sem autorização de execução ou certificação T4. Não houve promoção de runtime no Root, push, piloto, produção ou aplicação de firewall. Veredito global **FAIL**, produção **NO_GO**; os 24 cartões e os ledgers alheios continuam preservados.


Atualização GREEN/R9 (04/10/2026): a suíte completa com PostgreSQL passou com 3.505 testes em 372 arquivos, zero failures/skips, cobertura S91,81/B87,20/F94,88/L92,86 e gate crítico PASS. Essa execução antecede a integração OPS-R4 e não certifica o novo candidato. Seis arquivos de identidade histórica de recibos foram integrados por SHA; Builder registrou 600 testes distintos PASS e controles de bundle rejeitando callbacks de outra conta/provider sem evento novo. Crítica nova I1 em execução, CI-R3 corrige seis validators; inventário mantém 371 arquivos originais, nove novos e 276 paths canônicos. Gauntlet formal tem duas rodadas, FIX_RETEST, evidência global não qualificada; vinte e quatro critérios e NO_GO preservados. Segurança e bootstrap de produção aguardam revisão explícita das emendas concretas; zero chamadas de modelo. Evidência própria: checkpoint-16-full-suite-pass-and-receipt-integration.json. Ledgers 99/20/30 alheios permanecem preservados, integração pendente.
