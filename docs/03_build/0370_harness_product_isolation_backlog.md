# 0370 — Backlog de isolamento do Operational Harness

## Estado documental vigente — 17/10/2026

O [plano0388](0388_documentation_isolation_reconciliation.md) conclui HISO-002/HISO-008 como entregas documentais DONE, com navegação e B5 reconciliados. Os cartões HISO abaixo são a fonte de estado; os cartões PISO têm [backlog canônico no produto](../../products/shift-assistant/docs/backlog.md) e [correspondência AP–PISO–HISO](../../products/shift-assistant/docs/requisitos-ap.md), sem duplicação de fila. Os resultados do checkpoint61 abaixo pertencem à candidata privada e à data daquela rodada; não instruem retomar processos antigos ou promover seus patches.

A SPEC0228 foi concluída na candidataf11, com INCOMPLETE intencional e sem integração automática ao checkout principal. HISO-005/HISO-014 permanecem abertos. A autoridade B5 de16/10 está aprovada; execução remota/check obrigatório do produto continuam pendentes de comprovação em HISO-010. Nenhum fechamento documental aceita o isolamento, o piloto ou a produção.

## Atualização HISO-005 — BUILD0237 concluído localmente — 18/10/2026

A aprovação T3 foi executada: fonte `84d8d4b4`/sete arquivos integrados, revisão final zero obrigatórios,14 aceites,16 gates e38 hashes atuais.5.211 unit/302 PG/12 E2E/zero skips; consumidor207 imports/76 exports/oito pacotes/zero rede. [Resultado atual](../04_audit/evidence/HISO005-P2-BUILD-0237-20261018/REPORT.md). Root77 protegidos/índice/HEAD preservados,PG removido/portas livres. A fronteira atual1609=537+1072 permaneceINCOMPLETE/zero provas; o ledger conserva também todas 1721 ocorrências anteriores sem resolução presumida. HISO005/P2/P3/B6 continuam abertos; [próxima tarefa](../04_audit/evidence/HISO005-P2-BUILD-0237-20261018/NEXT.md).

## Atualização HISO-005 — SPEC0237 pronta para decisão T3 — 18/10/2026

Preparação documental `HISO005-P2-RESOLUTION-SPEC-20261018` concluída: [contrato0237](../02_spec/0237_b6_runtime_resolution_profile.md), SHA `81f091fa8edaf3ce89543773e24960b4dc9feff3de15f6552940192e9f1ef5f1`, R2finalAPPROVE_SPEC/zero obrigatórios, trêsP1R1 tratados e sugestãoP3 esclarecida no [pacote de decisão](../04_audit/evidence/HISO005-P2-RESOLUTION-SPEC-20261018/decision-packet.md). Futuro `HISO005-P2-BUILD-0237` WAITING_HUMAN_APPROVAL; todosRS01–14NOT_RUN. Próxima ação: revisão explícitaT3 deste novo delta positivo antes do código. Autoridade0236cf07 vigente e P1 resolvido, sem repetir essa pergunta. HISO005/P2/P3/B6 permaneceINCOMPLETE2258=537+1721/303MATCH/zeroverified/zeroresolvidos; nenhuma aprovação de produção, release ou transferência de certificado.

## Atualização HISO-005 — retomada explícita do P1 nativo — 18/10/2026

Task `HISO005-0236-BUILTIN-REPAIR-20261018` COMPLETED_LOCAL_P1: recusa nativa corrigida antes de lookup, reviewAPPROVE0/12cenários/40calls,173focais e16gatesPASS/5015unit/302PG/12E2E/zero skips,verificador corrente38hashes. Fonte d8e3f8f/dois paths promovidos com78protegidos/índice preservados;3preimagens de testespeer reancoradas ao seu commit qualificado, sem escritaHISO nesses paths. PG próprio removido/portas livres,3716selados anteriores intactos e119+55vazios próprios catalogados sem duplicar registros. [Resultado](../04_audit/evidence/HISO005-0236-BUILTIN-REPAIR-20261018/REPORT.md). Fronteira2258=537baseline+1721novos,303MATCH/zeroverified/zeroresolvidos; HISO005/P2/P3/B6 continua aberto. Próximo do pai: baseline/HOW0237 com guarda nativa herdada, revisão documental/humana antes de novo BUILD positivo. Não repetir aprovação0236 nem reabrir os ciclos históricos reprovados.

## Atualização HISO-005 — reparo de resolução — 18/10/2026

Task `HISO005-0236-RESOLVER-CONFORMANCE-20261018` BLOCKED/FAILED_QUALITY_BAR: revisãoR2final confirmou as correçõesR1, mas encontrou umP1 na precedência de builtins; Node seleciona nativo e kernel prova pacote homônimo. Fonte7ad6d2f/dois paths/159focaisPASS preservada, sem fullcert ou promoção. Duas revisões esgotadas, nenhuma terceira/reset automático. [Estado/próxima ação delimitada](../04_audit/evidence/HISO005-0236-RESOLVER-CONFORMANCE-20261018/state.json). Root75df/comaceitereaberto e certificados históricos intactos; PG próprio removido/portas livres. Autoridade0236 vigente; SPEC0237 somenteT1, sem BUILD ou perguntahumana enquanto v1 não qualificada. HISO005/P2/P3/B6 abertos.

## Histórico — checkpoint61 da candidata privada

R56 corrigiu mídia primária com payloadR53, preparação build/tipos/lint PASS e suíte completa atual PASS; cobertura e demais gates ainda RUNNING em PostgreSQL55599. Novo críticoR58 REJECT: backups retidos da migração divergem de migration.inventory e offline/backup/restore aceitavam. R63 reproduziu baseline e corrigiu três caminhos isolados: validação hash/tamanho/inventorycanônico antes de healthy, guardlive dos originais retidos; 127 testes/4arquivos, 10 casos adicionais sem novo arquivo, prefixoR38/R53exato; compiledbefore aceita/after rejeita, tipos/lint/formato/publicbuild PASS. Novo críticoDockerR61 REJECT: truncamento ativo para vazio detectado live, restart perde estado de incidente e permite replay/envio duplicado. R65 corrige isolated com fallback de retenção de lock jáexistente, sem schema ou liberação. R50 neutral full5100/385, PG288/35, E2E12 sem retries/skips, SBOM/licenças/audit/criticalcoveragePASS. R62 I1 confirmou números mas INCOMPLETE por proveniência/inputs faltantes e contador V8 negativo; supplement32exactfiles fornecido, nenhum contador sanitizado. R55checker finite entregue: literal/direct1→0, 1065testes/5arquivosPASS, originais intactos, unknownsretidos; R64novo críticoRUNNING, sem wholeclosureaceite. Evidência durável e commits próprios,2.083inputsR56 reconstruíveis dos archives; caches não trackeados no Gitprivado. Históricos R44qualificationDENIED e R49REJECT preservados. SomenteHISO001DONE; todos24critérios mantidos, globalFAIL/produçãoNO_GO. NO_MODEL, zero inferências externas, sem Rootpromoção/providerexecute/push/dadosreais/piloto/deploy; T4/egress/humano separados.

Próxima ação: concluir R56 gates, integrar R65 e R63 na R66, certificar e obter críticos novos; completar R62/R64. Promoção/T4 separados. [Evidência](../04_audit/evidence/HARNESS-ISO-EXEC-20261003/green-20261004/checkpoint-61-retained-inventory-and-restart-rejections.json).

## Harness — identidade, fronteira e independência

### HISO-001 — Congelar baseline e donos da fronteira

- Estado: `DONE`. Prioridade: P1. Dono: engenharia do harness. Risco/gate: T1 / G0. Dependências: nenhuma.
- WHAT/WHERE/HOW: inventariar fontes, manifestos, aliases, imports, env, portas, volumes, deploy, scripts e claims de `packages`, `apps` e do assistente. Partir dos 17 arquivos observados em `apps/worker/src/shift-assistant`; capturar hashes/HEAD/dirty state e identificar dependências transitivas antes de qualquer extração.
- Aceite: cada componente tem dono core/host/consumidor/legado; caminhos e recursos da primeira fatia estão livres ou coordenados. Registrar testes existentes, consumidores de APIs públicas e contratos persistidos sintéticos. Confirmar AP-001–AP-016 pendentes/concluídos a partir da evidência vigente, sem inferir conclusão pela presença de código.
- Evidência: manifesto de baseline e mapa de fronteiras/claims, com diferenças futuras comparáveis. O inventário documental desta rodada é entrada, não aceite completo deste cartão.

- Execução 03/10/2026: baseline/frontier AP-001–016, 20 moves/inventário de ownership e claims em `HARNESS-ISO-EXEC-20261003`; gate de grafo atual com 580 fontes/26 workspaces. Links/formato de planejamento já validados; APs incompletos preservados como tais.

### HISO-002 — Reconciliar a missão e os ponteiros vigentes

- Estado: `DONE`. Prioridade: P1. Dono: mantenedor da documentação do harness. Risco/gate: T1 / G0. Dependências: HISO-001.
- WHAT/WHERE/HOW: atualizar README raiz, `docs/README.md`, índice, AGENTS/direção e ledgers quando os claims permitirem. Usar ADR-010 para identificar este repositório com o Operational Harness e classificar o Assistente de Plantão como consumidor.
- Aceite: nenhuma instrução vigente aplica automaticamente a barra 0368 ao core ou confunde os dois produtos. Preservar D1–D4, SPEC 0177, barra 0368 e histórico da ADR-009 como contratos do assistente. Não reinstalar o antigo programa enterprise/UP91 por mudar a identidade.
- Evidência: diff documental e links verificados; entradas de runtime/log/backlog integradas pelo owner, sem sobrescrever alterações de outro agente. Encaminha F13.

- Fechamento documental17/10/2026 (`DOCS-ISOLATION-20261017`,T1): missão ADR-010, README/AGENTS/constituição, índices manuais, coordenação e entradas vigentes dos ledgers reconciliados. UP91/ADR-009 de missão e checkpoints privados mantêm contexto histórico;0368/D1–D4/SPEC0177 pertencem ao produto e0373/0374 ao núcleo. [Evidência e critérios](../04_audit/evidence/DOCS-ISOLATION-20261017/REPORT.md), revisão independente elegível sem achados e checks documentais. AP-001 ainda conserva seu requisito próprio de commit/aceite; fechar esta tarefa documental não encerra claims técnicos alheios, F13 integral ou produção.

### HISO-003 — Especificar a extração sem mudança de comportamento

- Estado: `IN_PROGRESS`. Prioridade: P1. Dono: engenharia do harness, com revisão do owner do consumidor. Risco/gate: T1 para escrever SPEC; implementação alvo T2 / G1. Dependências: HISO-001, HISO-002.
- WHAT/WHERE/HOW: SPEC curta em `docs/02_spec` para `products/shift-assistant/`, workspace privado, dependências/exportações, mapa antigo→novo, scripts, testes, deploy e docs. Registrar no pipeline DISCOVERY/PRD a direção e os requisitos já existentes, sem inventar novos requisitos clínicos.
- Aceite: tamanho da fatia, paths, contratos, comandos de verificação e recuperação definidos. Campos/eventos JSONL, confirmação, repetição, snooze e D1–D4 preservados na extração. Mudança pública/segurança/schema é separada como T3, com revisão antes de BUILD. Não presumir aprovação do layout proposto nesta rodada.
- Evidência: SPEC/task/gate registrado e matriz de regressões. Definir interfaces suportadas de modelo e a revisão em HISO-009; não impor runtime autônomo de tools ao organizador JSON.

### HISO-004 — Extrair o consumidor para um workspace privado

- Estado: `IN_PROGRESS`. Prioridade: P1. Dono: engenharia do consumidor. Risco/gate: T2 / G1, conforme HISO-003. Dependências: HISO-003.
- WHAT/WHERE/HOW: mover a fatia de fontes/testes/simuladores para `products/shift-assistant`, com `package.json`, entrypoint e scripts próprios. Ajustar workspace/lockfile na mesma fatia sob claim exclusivo. O nome do package é fixado na SPEC; não publicar pacote ou abrir outro repositório implicitamente.
- Aceite: comandos do consumidor partem do novo workspace; os 37 testes específicos e demos existentes continuam reconhecidos/passando. Kernel/API/worker não importam o produto; não deixar wrapper no worker que o reintroduza. Nenhuma alteração de conteúdo/efeito ou de dados persistidos acompanhando a movimentação.
- Evidência: diff de moves, manifesto de dependências, hashes de fixtures/eventos e checks Node 22 de G1 em snapshot próprio. Mudanças simultâneas de lockfile ficam sequenciadas.

### HISO-005 — Tornar a fronteira verificável

- Estado: `IN_PROGRESS`. Prioridade: P1. Dono: engenharia do harness. Risco/gate: T2 / G2. Dependências: HISO-004.
- WHAT/WHERE/HOW: gate de dependências para `packages` e hosts genéricos, incluindo imports relativos, aliases, exports, imports dinâmicos identificáveis e caminhos transitivos. Tratar resolução não verificável explicitamente na SPEC; simples busca de texto não comprova isolamento.
- Aceite: tentativa sintética de importar domínio/entrypoint do consumidor a partir do core falha no gate, também por intermediário. Consumo público permitido do harness pelo produto passa. `SHIFT_*`, prompts e regras de paciente não entram no core; exceptions têm alvo e justificativa restritos.
- Evidência: grafo resolvido e execução positiva/negativa do gate. Fixtures da sonda não entram no artefato de produção.
- Progresso 07/10/2026 (`PLAN0374-B-FABLE-20261007`, B1): gate `boundary:products` passa a terminar em 26 s com `PASS` (antes ~22 min `INCOMPLETE`); dependências instaladas verificadas contra o lockfile commitado; 50 testes negativos novos cobrem os contraexemplos T2 (`P1-R2-01`, `P1-R2-02`) e as 73 sondas do crítico posterior dão 0 falsos PASS. O PASS depende de uma tabela de 169 exceções de primeira parte vinculadas por arquivo/linha/digest que ainda exige revisão independente (`--strict` mostra `INCOMPLETE`). Estado permanece `IN_PROGRESS` até a reauditoria Codex (B6). [Evidência](../04_audit/evidence/PLAN0374-B-FABLE-20261007/summary.md).

#### Subtask HISO005-P2-WORKSPACE-MAP — TODO, aberta em 20/10/2026

- Estado `TODO`. Prioridade P2. Dono: engenharia do harness (resolvedor B6). Risco/gate: T3, porque muda a resolução que a B6 usa. Depende de nada; deve vir antes da primeira prova de aresta `@cvg/*`.
- Achado do [recon 20261020B](../04_audit/evidence/HISO005-P2-NEXT-RECON-20261020B/REPORT.txt), item 4: o glob de workspaces `legacy/packages/*` também casa com `legacy/packages/README.md`. O resolvedor (`boundary-semantic-resolution.mjs`) recusa o mapa inteiro com `UNKNOWN_WORKSPACE_CONFIG`, e as 746 arestas `@cvg/*` de 458 importadores viram contidas. O npm só trata como workspace um diretório com `package.json`.
- Medido na variante diagnóstica `ws_skip_patch.py`, que pula entrada que não é diretório nem link: contidas 1.535 → 790, diagnósticos 12.283 → 12.195, contextos 229 → 241/256 (folga cai para 15), provas iguais (0).
- WHAT/HOW, duas saídas a decidir na SPEC: (a) alinhar o resolvedor ao npm, pulando só arquivo comum, com controle negativo para link, nome inválido e diretório sem `package.json`; (b) mover o README para fora de `legacy/packages/`, o que muda a raiz avaliada e exige nova base. Medir a folga de contextos antes; se cair abaixo de 16, decidir o teto junto.
- Aceite: mapa de workspaces resolvido na raiz real (a variante achou 28 workspaces), nenhum falso PROVEN nos controles, normal = strict.

#### Subtask HISO005-P2-BUILD-0240 — IN_PROGRESS/BUILD local autorizado

Usuário aprovou explicitamente SPEC0240/SHA1c14d92852a6d33475a67b533aadfd22ce01e54b86252c404258d33ef0895161; [autoridade](../04_audit/evidence/HISO005-P2-BUILD-0240-20261018/authority-build0240.json), [MS01–12](../04_audit/evidence/HISO005-P2-BUILD-0240-20261018/task-contract.json). Candidata84d8 própria preparada/pins/20fontes/137+590selados preservados. Próxima ação V2_BASELINE_FIRST_RED antes de deltahelper/engine; críticas/gates/consumidor/medição atuais obrigatórios antes de promoção. MS01–12NOT_RUN; B6INCOMPLETE1609/zero provas, sem repetição de aprovação/release/push/deploy. Recon/T1abaixo permanece concluído/selado.

#### Subtask HISO005-P2-METADATA-RECON-20261018 — concluída; BUILD0240 aguarda gate

- Estado `COMPLETED` local/T1; [resultado](../04_audit/evidence/HISO005-P2-METADATA-RECON-20261018/REPORT.md), [aceitesNR01–06](../04_audit/evidence/HISO005-P2-METADATA-RECON-20261018/ACCEPTANCE.md).359 origens retidas/358 arquivos,Node4+28,14 controles de corpo v2; uma origem indisponível não atribuída. Lead11checks/590selados/20fontes/Root7/índice/HEAD preservados.
- [SPEC0240](../02_spec/0240_b6_node_metadata_resolution_scope.md) `1c14d92852a6d33475a67b533aadfd22ce01e54b86252c404258d33ef0895161`, R2finalAPPROVE_SPEC/zero obrigatórios/12 casos;45+35artefatos/34+29snapshots verificados, crítico fechado,2/2 documentais. [Decisão concreta](../04_audit/evidence/HISO005-P2-METADATA-RECON-20261018/decision-packet.md).
- Próximo `HISO005-P2-BUILD-0240` em `WAITING_HUMAN_APPROVAL`: DECIDE_SPEC0240 antes do novo código positivo. MS01–12 NOT_RUN, B6 INCOMPLETE1609/zero provas; metadados não fecham corpo/proveniência. Aprovações0236/0237 resolvidas; sem reiniciar reviews/candidatas/gates ou transferir certificado. Plano condicionalM0–M5 em0391, sem produção/push/deploy.

#### Subtask HISO005-P2-RESOLUTION-SPEC-20261018 — perfil de resolução

- Estado `COMPLETED_LOCAL_DOCUMENTAL`, T1. [SPEC0237](../02_spec/0237_b6_runtime_resolution_profile.md), SHA-256 `81f091fa8edaf3ce89543773e24960b4dc9feff3de15f6552940192e9f1ef5f1`, revisão final APPROVE_SPEC/zero obrigatórios e pacote documental selado de88 arquivos. [Resultado documental](../04_audit/evidence/HISO005-P2-RESOLUTION-SPEC-20261018/REPORT.md).
- A aprovação explícita posterior do usuário resolveu a espera T3 antes do código. [Autoridade do BUILD](../04_audit/evidence/HISO005-P2-BUILD-0237-20261018/authority-build0237.json). O estado “BUILD não autorizado” dentro do pacote selado descreve o momento histórico da preparação e não exige repetir a aprovação. Os aceites executáveis pertencem à subtask de BUILD abaixo; HISO005/B6 permanece aberto.

#### Subtask HISO005-P2-BUILD-0237 — construção do perfil de resolução

- Estado `COMPLETED_LOCAL`, T3 aprovado. [Resultado](../04_audit/evidence/HISO005-P2-BUILD-0237-20261018/REPORT.md), [14 aceites](../04_audit/evidence/HISO005-P2-BUILD-0237-20261018/ACCEPTANCE.md). Fonte `84d8d4b4`/sete deltas próprios integrados, revisão R2 final APPROVE/zero obrigatórios,398 focais e5.211 unit/439 arquivos/302 PG/12 E2E PASS, sem skips/flaky.16 gates e38 hashes correntes; consumidor fresco207 imports/76 exports/oito pacotes/zero rede. A fonte não mudou após R2.
- Revalidações e paridade física dos emits confirmadas;537 origens e303 registros instalados preservados. Ledger guarda1721 tuplas da fronteira anterior e1072 atuais com multiplicidade, sem dar crédito à mudança de causas ou contagens. Medição atualINCOMPLETE1609/zero provas. Tentativas ambientais e capturas intermediárias permanecem históricas, sem reclassificação.
- Promoção preservou77caminhos/HEAD/índice. Root foi observado sem transferência de certificado; PG próprio removido por identidade/clientes0/portas livres/processos0. Evidências e fontes anteriores intactas. PaiHISO005/P2/P3/B6 continua `IN_PROGRESS`; [seguir pela maior causa restante](../04_audit/evidence/HISO005-P2-BUILD-0237-20261018/NEXT.md), sem repetir aprovações ou reiniciar jobs antigos.

#### Subtask HISO005-P2-SPEC-20261018 — contrato semântico

- Estado `COMPLETED` para preparaçãoT1 e para o BUILD local `HISO005-P2-BUILD-0236`, aprovado explicitamente pelo usuário para SPEC SHA-256 cf07fd5dd87220cd3c41704a64d2bd294a8b972bfbf230e38fb6c3453fbffa49 antes do código. Pedido atual “resolva essas outras pendencias”. [SPEC0236](../02_spec/0236_b6_semantic_boundary_proof.md), [plano0391](0391_hiso005_semantic_proof_execution.md), [censo histórico](../04_audit/evidence/HISO005-P2-SPEC-20261018/recon.json). O fechamento é do mecanismo, sem encerrar H5-P2 integral/B6.
- Censo completo de471diagnósticos:168ocorrências vinculadas a AST/42arquivos,303instalados302MATCH/1MISMATCH;8.036arquivos JS/92.445.611bytes examinados como sintaxe, sem concessão de confiança. Contrato proposto inclui18aceites, resolução física, binding/implementação, limites/UNKNOWN e contabilidade sem perder duplicatas. Bootstrap ambiental, processos abertos e nativos não recebem dispensa.
- Implementação75df/17paths qualificada:18aceites do mecanismo, revisão final APPROVE/zero obrigatórios/16cenários;16gates/4.978unit/302PG/12E2E/zero skips e38hashes oficiais atuais. Consumidor fresco207imports/76exports/zeroRede e compatibilidade byteexata confirmados após gates.17paths promovidos por pré-imagens/63protegidos e índice intactos; PG próprio removido, portas livres. [Relatório final](../04_audit/evidence/HISO005-P2-SPEC-20261018/build0236/REPORT.md). Medição pós-gates2399=537baseline+1862novos,303MATCH/zeroverified/zeroresolvidos; origens e multiset conferidos independentemente. P2/P3/novaB6 continuam abertos, sem exceções ou aceite por UNKNOWN. Catálogo central segue claimClaude100; delta34 próprio pronto e52problemas de links da outra frente encaminhados ao owner. Próxima ação: contrato0237 concreto/revisão/decisãoT3; não repetir aprovação0236.

#### Subtask HISO005-P1-INTEGRATION-20261018 — composição dos mecanismos aprovados

- Estado `COMPLETED_LOCAL`, T2; [task pré-BUILD](../04_audit/evidence/HISO005-P2-SPEC-20261018/integration-build/task-short-spec.json). Port inicial9b494a4d, base26d/55fontesClaude preservadas,10paths próprios compostos depois na75df junto da0236. Checker preserva mudanças posteriores/PARE e mantém exceções inativas. A integração não concede isolamento integral.
- Histórico do port inicial: crítica independente APPROVE_SCOPED_DIFF/zero obrigatórios,160testes e12grupos de sondas; formato/tipo/lint/buildPASS; certificação88d6d11e encerrada por identidade após4750unitPASS/92ENOENT, logs preservados. Preparo de emits corrigido e93casos legados mantidos/passando; nova certificação será emitida após freeze0236, com PG56236/API3386/web4386 próprios. Consumidor fresco207imports/76exports/jornadaPASS. Referência nova8de30020,304presentes/50optionalausentes,298SRI/zeroIP/umaexecNode revisados antes do consumo.
- Composição75df dos10pathsP1 e sete adicionais qualificada/promovida:16gates/38hashes atuais,17pós-imagens/63fontesprotegidas/índice preservados e cleanup próprio concluído. Referência instalada89fd40e9 e compilada115f72ef revistas como proveniência da variante, sem autoridade semântica; os eventos antigos acima permanecem históricos. [Promoção](../04_audit/evidence/HISO005-P2-SPEC-20261018/build0236/promotion-receipt.json). O rootobservado continuaINCOMPLETE, não certificado pela candidata; receipt compilado de outra variante recusado. Nenhum push/deploy/produção.

#### Subtask HISO005-CONTENT-ID-BUILD-0234 — H5-P1

- Estado `COMPLETED / BUILD_T3_APPROVED_USER` (escopo local H5-P1), autoridade17/10 registrada para hash exato0234 em [authority.json](../04_audit/evidence/HISO005-0234-BUILD-20261017/authority.json). Implementação e14aceites em candidata própria derivada de f11; fontes do principal readonly. [Execução0390](0390_hiso005_installed_identity_build.md).
- Aceites ID01–14 concluídos, crítica independente APPROVE_SCOPED_DIFF/zero obrigatórios e16gates locaisPASS na candidatab7032f82:3607unit/302PG/12E2E sem falhas/skips/todo/flaky,38hashes oficiais verificados. Closure303=302MATCH/1esbuildMISMATCH, todosverifiedfalse/471diagnósticos/INCOMPLETE; consumidor fresco198imports/72exportsPASS. [Fechamento](../04_audit/evidence/HISO005-0234-BUILD-20261017/REPORT.md). P1 não fecha HISO005/P2/P3/B6; sem integração no principal, push/deploy/produção. Recursos próprios encerrados; candidata/ref revisada preservadas. Proposta/estado de preparação abaixo são históricos, não bloqueio humano atual.

#### HISO005-PROOF-PLAN-20261017 — única frente de prova positiva

- Estado: `COMPLETED` para preparaçãoT1; aprovação humana subsequente registrada na subtask BUILD0234 acima. O estado WAITING_HUMAN_APPROVAL do pacote congelado é histórico. Pedido do usuário: uma frente por vez. A sessão segue somenteHISO-005/B6, preservando as frentes de outros responsáveis. [Plano integral0389](0389_hiso005_positive_proof_execution.md).
- Primeiro contrato concreto: [SPEC0234](../02_spec/0234_b6_installed_content_identity.md), T3 proposto, identidade de bytes contra referência offline sem restaurar verified:true ou PASS. O recon encontrou303payloads SHA-512 correspondentes ao lock; não extraiu ou instalou conteúdo. [Prova readonly](../04_audit/evidence/HISO005-PROOF-PLAN-20261017/recon.json).
- A frente inteira ainda exige semântica da implementação/loaders, identidade dos receptores/espelhos e novaB6; nenhum desconhecido foi dispensado ou convertido em aceite. A0228 aprovou contenção e não autorizou este mecanismo futuro. Revisão independente ACCEPT_SPEC/zero achados obrigatórios. SPEC0234 SHA b33aff4d1d1e36d64dd97298bc73d1c058220776c349e6704478303ef8a9c76d aprovada posteriormente para BUILD local; a execução segue na subtask0234, sem alterar o pacote de preparação. [Pacote concreto](../04_audit/evidence/HISO005-PROOF-PLAN-20261017/decision-packet.md).

#### B6-REMEDIATION-BUILD-0228 — primeira contenção dos falsos PASS (17/10/2026)

- Estado: `COMPLETED`. Dono: engenharia do harness/B1. Gate: T3 para esta unidade, sem reclassificar a extração histórica T2 do cartão pai.
- WHAT/WHERE/HOW: [SPEC0228](../02_spec/0228_b6_boundary_fail_closed_remediation.md), após [B6/0619](../04_audit/0619_b6_stable_isolation_reaudit_2026-10-17.md); recusar confiança terminal de metadados e manter inativas as exceções atuais, nos scripts de fronteira/testes e bloco correspondente do runbook, em candidata própria derivada de5a199668.
- Dependência satisfeita em17/10: usuário aprovou implementar a SPEC; [autoridade T3](../04_audit/evidence/B6-0228-BUILD-20261017/authority.json). [Pacote T3 com SHA](../04_audit/evidence/B6-REMEDIATION-SPEC-20261017/decision-packet.md); revisão técnica independente ACCEPT_SPEC; implementação em candidata própria e14/14aceites concluídos,156focais PASS e16gates locais PASS.
- Aceite: B6R-01–14 preservam FAIL, expansão/drift e controles negativos. O gate normal da baseline será INCOMPLETE; contenção não encerra os achados/B6/HISO-014 nem fornece prova positiva. Revisão independente APPROVE_SCOPED_DIFF;3479unit/302PG/12E2E,zero skips; fronteira final INCOMPLETE/471diagnósticos/303instalados,semexceções. Próxima ação do cartão pai: prova positiva futura de isolamento e nova B6; checkpoint localf11f762f em candidate/b6-0228-20261017. Sem alteração de runtime, schema, produto, lock, workflow ou release nesta unidade.

- Fechamento: [relatório e14aceites](../04_audit/evidence/B6-0228-BUILD-20261017/REPORT.md), [certificado local](../04_audit/evidence/B6-0228-BUILD-20261017/full-certification-summary.json), fontes intactas e recursos próprios encerrados. HISO-005 geral permanece IN_PROGRESS; sem integração/push/deploy.

### HISO-006 — Separar descoberta, build, testes e coverage

- Estado: `IN_PROGRESS`. Prioridade: P1. Dono: engenharia de tooling do harness. Risco/gate: T2 / G1–G2; alteração de barra vira T3. Dependências: HISO-004.
- WHAT/WHERE/HOW: revisar `package.json`, lockfile, tsconfigs, Vitest, política de workspace e scripts de build para descobrir `products/*`. Expor comandos core e consumidor sem perder a regressão agregada existente.
- Aceite: suites e denominadores são listados por dono e comparados ao baseline; nenhum teste vira omitido/skip apenas para passar. Build do harness não exige fonte/configuração do consumidor. Definir variante sem consumidor com manifesto e lockfile coerentes, utilizável em snapshot limpo; `npm ci` com lock incompatível não é prova válida.
- Evidência: inventários antes/depois, typecheck/lint/suites e coverage por escopo. PostgreSQL/E2E conforme G1, com SKIP distinguido de integração efetivamente executada.
- Progresso 07/10/2026 (`PLAN0374-B-FABLE-20261007`, B5): denominadores por dono medidos antes/depois (core 358/2.916 → 360/2.940; produto 2/37 inalterado; agregado = core + produto). `CVG_TEST_SCOPE=core` em `vitest.config.mts` separa testes e cobertura sem perder o agregado local. B4 (runbook de gates, F-03..F-05) está com a sessão `PLAN0374-A`. [Evidência](../04_audit/evidence/PLAN0374-B-FABLE-20261007/summary.md).

### HISO-007 — Separar artefatos e deploy do consumidor

- Estado: `IN_PROGRESS`. Prioridade: P1. Dono: operação do consumidor. Risco/gate: T2 / G1–G2; hardening fica em PISO-007. Dependências: HISO-004, HISO-006.
- WHAT/WHERE/HOW: mover `deploy/shift-assistant` para `products/shift-assistant/deploy` e ajustar Dockerfile/compose/env/scripts. Definir contexto de build, processo e paths relativos sem depender do diretório de trabalho incidental.
- Aceite: imagens e comandos distintos, env/volumes/portas identificados e sem compartilhamento automático. O artefato do harness exclui fontes, configs, credenciais e dados do consumidor. Não mover/apagar volumes existentes; primeiro deploy separado utiliza dados sintéticos.
- Evidência: build e smoke da imagem real com serviços sintéticos e recursos próprios. Bundle em Node prova compilação, não prova usuário/capabilities/rede da imagem.

- Continuação03/10/2026: imagem root target runtime construída sem alterações do Dockerfile;11.008arquivos/28symlinks em `/app`, sem consumidor/fontes/env/dados/link. Jornada pública e API live/ready200 passaram com networknone, readonly, UID 10001. [Prova de separação dos dois artefatos](../04_audit/evidence/HARNESS-ISO-EXEC-20261003/artifact-separation-r3.json): imagens/comandos/portas/env/volumes distintos. Subcritério executável comprovado pelo Lead/I0; integração e aceites das dependências continuam pendentes, sem terceira crítica ou aceite global.

### HISO-008 — Transferir docs e backlog do produto

- Estado: `DONE`. Prioridade: P1. Dono: mantenedor documental de cada projeto. Risco/gate: T1 / G0; mudança do checker é T2. Dependências: HISO-004, HISO-007.
- WHAT/WHERE/HOW: estabelecer docs e backlog em `products/shift-assistant/docs`; transferir os cartões PISO com IDs, requisitos AP e histórico. Manter no harness links de integração, contratos e estado de isolamento. Atualizar mapa restrito de paths históricos quando necessário para links.
- Aceite: cada cartão tem um status canônico; AP/PISO têm matriz de correspondência, não duas filas independentes. Evidências e relatórios históricos continuam íntegros. Barra 0368 e decisões D1–D4 são produto; fontes antigas com caminhos movidos são resolvidas por mapeamento explícito, sem allowlist genérica de links quebrados.
- Evidência: mapa de transferência e checks de links/IDs/hashes históricos. Encaminha F13; não alterar textos de auditoria para aparentar achados fechados.

- Fechamento documental17/10/2026 (`DOCS-ISOLATION-20261017`,T1): docs próprias e [mapa de autoridade/AP–PISO–HISO](../../products/shift-assistant/docs/requisitos-ap.md) conferidos; dez cartões PISO funcionais byteidênticos no único backlog do produto e16AP preservados,20moves exatos resolvidos sem alterar política. Contratos, decisões e evidências históricas protegidos por hash. [Evidência e critérios](../04_audit/evidence/DOCS-ISOLATION-20261017/REPORT.md). Os paths estruturais de HISO-004/HISO-007 estão disponíveis para esta entrega documental; seus aceites operacionais continuam abertos e não são encerrados por ela. Sem alterar status funcional PISO, D2/NO_MODEL ou piloto.

### HISO-009 — Validar consumo por interfaces públicas suportadas

- Estado: `IN_PROGRESS`. Prioridade: P1. Dono: mantenedor de contratos/adapters do harness. Risco/gate: T1 para decisão; T2 para regressão existente; T3 / G3 se mudar execução pública. Dependências: HISO-003, HISO-005, HISO-006.
- WHAT/WHERE/HOW: revisar consumo atual de `OpenAICompatibleProvider.execute` pelo `ModelOrganizer`. O assistente hoje não compõe `createOperationalHarness` nem `ModelGateway.complete`; registrar quais exports são suportados e como budgets/telemetria da ADR-004 se aplicam.
- Aceite: consumidor compila e roda contra exports de pacotes construídos, sem atravessar fontes privadas por aliases. Decisão explícita sobre adapter/gateway; qualquer migração que altere timeout/budget/telemetria/comportamento precisa de SPEC/revisão apropriada. Um exemplo de consumidor neutro prova reutilização sem WhatsApp ou domínio de paciente.
- Evidência: decisão de contrato e smoke dos exports efetivos em ambiente isolado. Preservar forma da saída estruturada do organizador.
- Progresso 07/10/2026 (`PLAN0374-B-FABLE-20261007`, B2/B3): lista de exports suportados publicada em `docs/architecture/PUBLIC_API.md` com teste de regressão (`tests/consumers-public-surface.test.ts`); decisão T1 registrada: o consumidor atual usa `OpenAICompatibleProvider.execute` diretamente (suportado) e migrar para `generate`/`complete` exige SPEC + T3; consumidor neutro `examples/consumers/reception-agent` compõe `createOperationalHarness` só por exports públicos e roda jornada sintética (7 testes). Aceite pendente da reauditoria Codex. [Evidência](../04_audit/evidence/PLAN0374-B-FABLE-20261007/summary.md).

### HISO-010 — Definir CI e barras por artefato

- Estado: `IN_PROGRESS`. Prioridade: P1. Dono: engenharia de CI do harness, com revisão humana. Risco/gate: T3 / G3. Dependências: HISO-005, HISO-006, HISO-007, HISO-009.
- WHAT/WHERE/HOW: SPEC e implementação de jobs distintos para core e consumidor, contratos entre ambos e regressão agregada de transição. Vincular artefato, commit/dirty inputs, suite e dono ao resultado.
- Aceite: CI constrói a imagem específica do consumidor e a variante independente do harness; mantém gates aplicáveis de segurança, PG, E2E e coverage. Falha de tarefa do produto não falsifica certificação do core nem desaparece do relatório. Não reintroduzir automaticamente os antigos 16 gates ou declarar GO com artefatos genéricos.
- Evidência: SPEC aprovada, matriz gate→artefato e execução real de CI no candidato. Encaminha F13. Alterar o contrato de evidência requer revisão antes do BUILD, não aprovação retroativa.

## Harness — correções compartilhadas

- Histórico de07/10/2026 (`PLAN0374-B-FABLE-20261007`, B5): workflow próprio do produto e barra do harness com `CVG_TEST_SCOPE=core`, selo `hiso-010-v1-core-sealed`. A revisão humana então pendente foi posteriormente aprovada; a [evidência de preparação](../04_audit/evidence/PLAN0374-B-FABLE-20261007/summary.md) mantém seus bytes e a data original.
- Estado vigente B5/HISO-010, reconciliado em17/10: **revisão humana T3 APPROVED** conforme `decisions.B5_HISO010` do [recibo de16/10](../04_audit/evidence/USER-DECISIONS-20261016/production-0374.json), também registrado no [plano0374](0374_plano_producao_harness.md#7-decisões-do-usuário--16102026). Escopo decidido: barra do harness sem testes do produto, workflow próprio do consumidor e cobertura do produto vinculada à barra0368. **Execução real no GitHub Actions e check obrigatório do produto permanecem não comprovados nesta trilha**; HISO-010 continua IN_PROGRESS. O alcance de format/lint/typecheck e as outras obrigações do cartão exigem suas próprias evidências; esta reconciliação não altera workflows ou concede aceite por aprovação documental.

### HISO-011 — Limitar recepção do transporte de modelo

- Estado: `TODO`. Prioridade: P1. Dono: mantenedor de `packages/model-gateway`. Risco/gate: T3 / G3. Dependências: HISO-005, HISO-006.
- WHAT/WHERE/HOW: SPEC e correção em `ssrf-transport`/adapter responsável para limitar bytes durante a leitura, interromper stream/conexão e liberar recursos. Definir semântica para descompressão, Content-Length ausente/falso, timeout e error compatibility.
- Aceite: P12 não recebe/buffereia corpo inteiro acima do teto antes de rejeitar. Respostas chunked, oversized e interrompidas são limitadas; resposta válida continua correta. Consumo e tempo medidos contra limite documentado, com orçamento de request preservado.
- Evidência: servidor sintético e regressão positiva/negativa reproduzível. Fecha F14 no compartilhado; transportes WhatsApp têm tarefa própria, sem expandir escopo automaticamente.

### HISO-012 — Tratar advisories conforme exposição

- Estado: `TODO`. Prioridade: P1. Dono: mantenedor de dependências do harness. Risco/gate: T3 / G3 para manutenção de segurança, com claim exclusivo do lockfile. Dependências: HISO-001, HISO-006.
- WHAT/WHERE/HOW: revalidar os advisories observados de `brace-expansion`, `fast-uri`, `undici` e `fastify`, mapear cada consumidor/runtime/dev e corrigir versões compatíveis. Não tratar ausência no bundle do assistente como ausência no repositório.
- Aceite: fixes disponíveis aplicados sem regressão nos consumidores afetados; zero HIGH aplicável ou exceção residual explícita, revisada, com exposição/prazo/dono. Uma exceção não transforma vulnerabilidade pendente em corrigida. Lock/workspaces coerentes após extração.
- Evidência: audit antes/depois, diff do lock, testes por consumidor e inventário do artefato. SBOM/licenses somente com claim específico. Encaminha F12.

### HISO-013 — Regressão governada do núcleo independente

- Estado: `TODO`. Prioridade: P1. Dono: engenharia do harness. Risco/gate: T2 / G1–G2; novo comportamento precisa de T3. Dependências: HISO-009, HISO-010, HISO-011, HISO-012.
- WHAT/WHERE/HOW: verificar no artefato neutro contracts, policy, approval, isolamento de identidade/tenant, budget, effect journal e recovery. Executar suites existentes e integração PostgreSQL pertinente com dados sintéticos.
- Aceite: ALLOW não dispensa approval de risco alto; approval é vinculada à ação/identidade e de uso único; recovery não duplica efeitos governados. Nenhum consumidor requer import privado. Classificar skips e lacunas, sem retomar automaticamente o antigo programa UP91.
- Evidência: resumo de regressão por escopo e negativos dos contratos governados, vinculados ao candidato. Falhas bloqueiam o aceite do núcleo correspondente.

- Baseline independente03/10/2026: [990 testes/92arquivos, PG efetivo, zero skips](../04_audit/evidence/HARNESS-ISO-EXEC-20261003/neutral-governance-summary-r1.json) PASS em variante sem produto.319TS canônicos de pacotes/hosts iguais ao root; sentinelMATCH. É verificação I0 da baseline existente, sem terceiro crítico, alteração de contrato ou aceite antecipado das dependências T3/CI.

### HISO-014 — Aceitar a independência do harness

- Estado: `TODO`. Prioridade: P1. Dono: responsável pelo Operational Harness. Risco/gate: T2 / G2, com aceite documental; release separado. Dependências: HISO-005, HISO-007, HISO-008, HISO-010, HISO-013.
- WHAT/WHERE/HOW: executar variante limpa sem fontes/env/volumes do consumidor e uma jornada neutra por exports públicos. Consolidar docs, gates, imagens/processos e resultados de fronteira.
- Aceite: build, teste e inicialização/parada do harness independem do programa; gate reprova imports diretos/transitivos proibidos; processo e dados são separados. Consumidor permanece compilável/testável por seu próprio comando. Relatório do core tem escopo/denominador próprio, sem reutilizar a nota combinada 61/100.
- Evidência: manifesto da variante, logs de smoke/gates e aceite de isolamento. **Não depende do piloto PISO-010** e não concede release de produção.

## Consumidor isolado — integração com o backlog próprio

Os dez cartões foram transferidos atomicamente, preservando seu conteúdo, para o [backlog canônico do consumidor](../../products/shift-assistant/docs/backlog.md). Status e aceite do produto são atualizados somente lá. Os ponteiros abaixo mantêm rastreabilidade; o harness não aplica automaticamente a barra do produto ao core.

### PISO-001 — Ativar tarefas somente após confirmação humana

[Cartão canônico no consumidor](../../products/shift-assistant/docs/backlog.md#piso-001--ativar-tarefas-somente-após-confirmação-humana) — status e critérios somente no backlog do produto.

### PISO-002 — Preservar fidelidade e identidade do paciente

[Cartão canônico no consumidor](../../products/shift-assistant/docs/backlog.md#piso-002--preservar-fidelidade-e-identidade-do-paciente) — status e critérios somente no backlog do produto.

### PISO-003 — Recuperar processamento e envio com estado durável

[Cartão canônico no consumidor](../../products/shift-assistant/docs/backlog.md#piso-003--recuperar-processamento-e-envio-com-estado-durável) — status e critérios somente no backlog do produto.

### PISO-004 — Recuperar journal truncado sem perder histórico válido

[Cartão canônico no consumidor](../../products/shift-assistant/docs/backlog.md#piso-004--recuperar-journal-truncado-sem-perder-histórico-válido) — status e critérios somente no backlog do produto.

### PISO-005 — Serializar disparos de lembretes

[Cartão canônico no consumidor](../../products/shift-assistant/docs/backlog.md#piso-005--serializar-disparos-de-lembretes) — status e critérios somente no backlog do produto.

### PISO-006 — Fazer pausa e saúde responderem a falhas de transporte

[Cartão canônico no consumidor](../../products/shift-assistant/docs/backlog.md#piso-006--fazer-pausa-e-saúde-responderem-a-falhas-de-transporte) — status e critérios somente no backlog do produto.

### PISO-007 — Comprovar hardening do artefato do consumidor

[Cartão canônico no consumidor](../../products/shift-assistant/docs/backlog.md#piso-007--comprovar-hardening-do-artefato-do-consumidor) — status e critérios somente no backlog do produto.

### PISO-008 — Comprovar backup, restore e recebimento de alerta

[Cartão canônico no consumidor](../../products/shift-assistant/docs/backlog.md#piso-008--comprovar-backup-restore-e-recebimento-de-alerta) — status e critérios somente no backlog do produto.

### PISO-009 — Preparar guia e homologação do produto

[Cartão canônico no consumidor](../../products/shift-assistant/docs/backlog.md#piso-009--preparar-guia-e-homologação-do-produto) — status e critérios somente no backlog do produto.

### PISO-010 — Decidir e acompanhar o piloto específico do consumidor

[Cartão canônico no consumidor](../../products/shift-assistant/docs/backlog.md#piso-010--decidir-e-acompanhar-o-piloto-específico-do-consumidor) — status e critérios somente no backlog do produto.

## Rastreabilidade da auditoria

| Achado | Responsabilidade e cartões                                     | Prova de encerramento                                   |
| ------ | -------------------------------------------------------------- | ------------------------------------------------------- |
| F01    | Consumidor: PISO-001                                           | P01 e confirmação antes de efeitos.                     |
| F02    | Consumidor: PISO-003                                           | P02/P03, recuperação sem perda/duplicação local.        |
| F03    | Consumidor: PISO-004, PISO-008                                 | P04, prefixo íntegro e restore executado.               |
| F04    | Consumidor: PISO-005                                           | P05 e concorrência/replay.                              |
| F05    | Consumidor: PISO-006, PISO-008                                 | P06, pausa/saúde responsivas e alerta recebido.         |
| F06    | Consumidor: PISO-002                                           | P07/P08, associação fiel e memória confirmada.          |
| F07    | Consumidor: PISO-002                                           | P09, homônimos sem escolha silenciosa.                  |
| F08    | Consumidor: PISO-003                                           | P11, append falho não inutiliza a fila.                 |
| F09    | Consumidor: PISO-006                                           | P10, pausa revalidada antes do efeito.                  |
| F10    | Consumidor: PISO-007                                           | Imagem/rede efetivas, não apenas config.                |
| F11    | Consumidor: PISO-008, PISO-009, PISO-010                       | Restore/alerta, áudios e decisão administrativa/piloto. |
| F12    | Compartilhado: HISO-012                                        | Advisories e exposição revalidados por artefato.        |
| F13    | Harness: HISO-002, HISO-008, HISO-010; consumidor: PISO-009    | Missão/docs/CI por dono e guia do produto.              |
| F14    | Compartilhado: HISO-011; consumidor adapta limites em PISO-006 | P12 limitado durante leitura.                           |

## Regra de encerramento e próximo trabalho

Cada cartão só passa a DONE com claim/task, SPEC/gate proporcional, diff próprio e evidência de seus aceites. Regressão/skip/pendência humana material mantém o cartão aberto. No fechamento de cada rodada, atualizar runtime/log/backlog e evidências; se ledgers estiverem modificados por outro agente, preparar handoff como nesta rodada, conforme regra 5 de coordenação.

Continuidade vigente: HISO-002/HISO-008 são encerrados somente pelas provas documentais do [plano0388](0388_documentation_isolation_reconciliation.md). Os aceites técnicos HISO-004/007 e a independência HISO-014 continuam nos cartões próprios; HISO-005 exige prova positiva futura e nova B6. A liberação do assistente permanece separada em PISO-010. O [handoff de planejamento de03/10](../08_runtime/handoffs/harness_isolation_plan_20261003.md) é histórico; a [reconciliação atual](../08_runtime/handoffs/docs_isolation_20261017.md) registra os documentos e o estado desta rodada.

## NEXT-D1/NEXT-D2 — ciclo local autorizado de 04/10/2026

O usuário concedeu um ciclo em cópia isolada e uma revisão nova por frente, preservando NO_MODEL e a promoção condicional R2-D3. A fonte C1 ficou congelada após 151 testes e 116 controles conhecidos passarem. A revisão nova declarou INVALID por desvios do procedimento e REJECT técnico: dez cargas sintéticas do produto e dois casos de resolução desconhecida receberam falso PASS. O Lead reproduziu os doze casos com o mesmo checker congelado. HISO-005 permanece aberto; nenhum código C1 foi promovido ao checkout compartilhado. Não há orçamento concedido para corrigir os novos contraexemplos neste ciclo.

A frente PV10 do consumidor ficou congelada após 290 testes em nove arquivos passarem; a revisão única terminou INVALID por escrita de cache fora da área autorizada, embora os 14 comportamentos PV01–PV14 tenham sido observados PASS. Resultado consolidado no [handoff NEXT](../08_runtime/handoffs/harness_isolation_next_execution_20261004.md). O veredito global continua FAIL e os 24 cartões preservam seus aceites: somente HISO-001 está DONE. Gates de integração não substituem a aprovação da fronteira nem o aceite do produto. A preservação da baseline continua pendente para quatro arquivos de outros agentes, com 23 testes, e impede promoção enquanto não houver coordenação de autoria.

Atualização GREEN/R9 (04/10/2026): a suíte completa com PostgreSQL passou com 3.505 testes em 372 arquivos, zero failures/skips, cobertura S91,81/B87,20/F94,88/L92,86 e gate crítico PASS. Essa execução antecede a integração OPS-R4 e não certifica o novo candidato. Seis arquivos de identidade histórica de recibos foram integrados por SHA; Builder registrou 600 testes distintos PASS e controles de bundle rejeitando callbacks de outra conta/provider sem evento novo. Crítica nova I1 em execução, CI-R3 corrige seis validators; inventário mantém 371 arquivos originais, nove novos e 276 paths canônicos. Gauntlet formal tem duas rodadas, FIX_RETEST, evidência global não qualificada; vinte e quatro critérios e NO_GO preservados. Segurança e bootstrap de produção aguardam revisão explícita das emendas concretas; zero chamadas de modelo. Evidência própria: checkpoint-16-full-suite-pass-and-receipt-integration.json. Ledgers 99/20/30 alheios permanecem preservados, integração pendente.

Atualização GREEN/R10 (04/10/2026): crítica OPS-R4 I1 readonly rejeitou dois HIGH: receipt antecipado expirado ganha autoridade sem callback novo; receipt de tentativa incerta confirma outra outbox/sourceTransitionId dentro do TTL. São 1.003 testes únicos (999 PASS, quatro FAIL, zero skips), com freeze completo de 953 fontes, 17.444 dependências e 48 links MATCH. Builder OPS-R6 corrige causalidade/expiração em cópia própria. Compatibilidade de receipt tardio após timeout (R5) passou em 609 testes/37 arquivos e typecheck/lint, mas continua sem integração ou review aceita; não resolve sozinha os HIGH. C1-R5 tem 204 testes PASS, conserva 191 originais, elimina seis falsos diagnósticos nativos usando Node isBuiltin; 442 diagnósticos restantes continuam INCOMPLETE e passed:false. SBOM/licenças do lock próprio PASS. CI-R3 continua corrigindo seis findings. Global NO_GO, vinte e quatro critérios e zero chamadas reais de modelo preservados; segurança/bootstrap dependem das emendas humanas pendentes. Evidência: checkpoint-17-pending-receipt-authority-and-native-modules.json. Ledgers compartilhados permanecem dirty alheios e sem integração declarada.

### Continuidade GREEN — checkpoint 18 — 04/10/2026

As duas emendas T3 receberam aprovação humana para BUILD local: segurança0159 (SHA9cc15c17d4c86dd165f4a2ba876046343f16146a557192f07558edead9470477) e bootstrap de sessões (SHA2559fec7558358dc03d28fd8eabf8d5c3416f31c217088641988375a5cee6b45). Recibos individuais e `checkpoint-18.json` permanecem na evidência própria green. Estados pending nos documentos imutáveis descrevem sua preparação, não a autoridade atual. Bootstrap Builder ativo em cópia completa; API server/hooks/SQL alheios readonly.

OPS-R6 incorporado ao Main privado por hashes, incluindo as regressões R5/R6, sem promoção Root: Builder 1.029 casos/probes únicos PASS; tipos/lint gerais do Main PASS. CI-R3 integrado teve 211 testes PASS, mas a nova crítica foi INVALID por falta de módulo no packet do Lead e encontrou defeito real de classificação. Gateway-R7 corrige o piso da classificação aprovada; 42 novos negativos PASS. A fixture positiva original que exigia CLINICAL foi alinhada a PUBLIC→INTERNAL, conservando título/asserção de sucesso e original por hash; nova crítica readonly ativa deve examinar esse delta. O foco integrado produziu 650 PASS e uma falha original de sockets observados após 2ms em execução paralela, ainda aberta.

C1 tem 221 casos PASS (191 anteriores +30), nativos Node oficiais, inventário core vazio recusado e separação de AST puramente de tipos sem isentar imports. Installed permanece INCOMPLETE com 302 diagnósticos; não há aceite HISO-005. Segurança local já tem 284 testes PASS e typecheck PASS; testes mais amplos revelaram fixtures próprias de URL acima do limite SSRF existente, um timeout e um skip de preparação: falhas preservadas, fixtures/setup corrigidos e novos gates em andamento. Scan estrito com regras padrão sem allowlists encontrou 6.574 generic-api-key, diferente dos 100 da configuração existente; nenhuma exceção foi aceita e nenhuma regra foi desligada.

Status IN_PROGRESS; produção NO_GO; zero chamadas OpenAI, sem promoção/push/deploy. Próxima ação: concluir BUILD bootstrap/segurança, provar orçamento autenticado PostgreSQL, concluir reviews novas e reexecutar gates finais sobre os bytes integrados. Ledgers99/20/30 dirty de outro owner continuam preservados; entradas desta continuidade ficam no handoff para integração pela regra5 de coordenação. Evidência executável dura em `/home/ricardo/.cache/cvg-harness-green-20261004`, sem dependência de `/tmp`.

Continuidade checkpoint 19: bootstrap revisão Node22 REJECT por dependência indevida de webhook à saúde auth, R3 ativo; gateway R8 integrado e crítico novo ativo; segurança guard27 PASS e scanner6574 disposições I0, revisão pendente. HISO-005 installed INCOMPLETE302; gates completos/neutral/E2E/imagens finais pendentes. IN_PROGRESS/globalFAIL/produçãoNO_GO, sem promoção Root ou provider real. Evidência e detalhes no handoff GREEN.

Continuidade checkpoint 20: segurança27paths e bootstrapR3 trêspaths integrados somente no Main privado; types/lint/format PASS. Foco gateway1208 PASS0skip, mas nova crítica REJECT dois P1 (política mutável e chave de prompt ambígua), R9 ativo. Bootstrap182 testes +10 verificações compiladas PASS e novo crítico ativo. Gitleaks integrado6574 disposições individuais I0, revisão pendente; CodeQL ativo só dois avisos API mantidos, com prova real de orçamento PG em dois processos/sessão durável. Inventário371originais23novos/279coverage (275 originais+4 adicionados). Suíte completa PG+cobertura em curso. Status IN_PROGRESS, global FAIL/produção NO_GO; nenhum runtimeRoot promovido/chamadaOpenAI/push/deploy. Ledgers alheios preservados, integração pelo owner pendente.

Checkpoint 51: variante sem produto R24 passou no build público e nos 5.030 testes em 383 arquivos, sem skips, com PostgreSQL e inputs intactos. Evidência finita, sem fechar a fronteira instalada nem autorizar produção. [Prova e hashes](../04_audit/evidence/HARNESS-ISO-EXEC-20261003/green-20261004/final-neutral-r24-local-pass.json).

Checkpoint 52: sandbox sintético R19 em [http://127.0.0.1:3501](http://127.0.0.1:3501), PID próprio 1030372. Fonte R19, journal anterior preservado, replay e nove grupos browser PASS; [revisão independente ACCEPT](../04_audit/evidence/HARNESS-ISO-EXEC-20261003/green-20261004/local-sandbox-r19-fresh-review.json). Isso não autoriza inferência externa, canal real ou produção.

Checkpoint 53: [reparo R21 recusado com prova independente](../04_audit/evidence/HARNESS-ISO-EXEC-20261003/green-20261004/c1-binding-stack-fresh-review-r21-rejected.json); [BUILD R22 e regressão de 1.255 testes](../04_audit/evidence/HARNESS-ISO-EXEC-20261003/green-20261004/c1-nonbinding-label-r22-builder.json). A revisão do novo reparo e a closure instalada continuam abertas.
