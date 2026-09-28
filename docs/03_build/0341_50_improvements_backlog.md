# Backlog detalhado — 50 melhorias — 23/09/2026

> Reauditoria atual: [0569](../04_audit/0569_m07_delivery_and_repository_reaudit_2026-09-23.md). As doze correções `A24-01`–`A24-12` estão no [backlog delta 0344](0344_reaudit_m07_backlog.md) e seguem o [roadmap 0343](0343_reaudit_m07_roadmap.md); não aumentam nem renumeram os 50 IDs desta carteira.

> Estado M07 AUD52 em 24/09/2026: o gate C1L parou no candidate freeze por drift de baseline em `docs/02_spec/0190_spec_validation.md`; não há candidate nem resultados de testes C1L. M07-S1 continua `FAIL / OPEN`; S2/S3/S4 e M05 bloqueadas; produção `NO_GO`. Consulte o [resultado C1L](../04_audit/evidence/AUD-20260924/M07-S1-C1L/final-gate-result.md).

## Contrato de uso

Esta é a decomposição executável da [lista de 50 melhorias](../04_audit/0568_50_melhorias_priorizadas_2026-09-23.md), ordenada no [roadmap](0340_50_improvements_roadmap.md) e governada pelo [plano executivo](0339_50_improvements_executive_plan.md). Cada ID é uma task proposta com WHAT, WHERE, HOW, dependência e critério de pronto. A lista não concede gate de BUILD, validação externa, dado real, piloto, produção ou ação sensível.

Status corrente: M01 = COMPLETED_DOCUMENTAL via AUD22-DOC-001; L02 = COMPLETED_DOCUMENTAL via AUD37-DOC-001; L03 = PARTIAL / SPEC_DRAFT_V0.4_REVIEW_PENDING via AUD49-DOC-001; H01 = BLOCKED_PENDING_ACCEPTED_I1; H03 = WAITING_HUMAN_APPROVAL; H05–H10, H12, H14–H19 e M19 = BLOCKED_BY_G21-5; H20 = BLOCKED_BY_G21-6; demais IDs = PROPOSED / READY_FOR_DISCOVERY. Ao iniciar um ID, criar ou referenciar seus documentos Discovery, PRD e SPEC e registrar gate específico antes de código. Onde a task é decisão humana, o agente prepara o pacote e espera a decisão; não a substitui. O certificado REM21-019 é histórico para os bytes alterados por M01; H02 prevê novo freeze.

Para cada task de código, a evidência mínima inclui testes pertinentes, typecheck, lint, coverage quando configurada, diff, hashes de artefatos e AUDIT proporcional. O CI bar completo é exigido antes de novo freeze/release. Para task documental, verificar coerência com fontes canônicas, links, histórico preservado e revisão do diff. Uma task externa exige também ambiente, owner, autorização, logs e rollback aprovados.

## Alta prioridade

### H01 — Fechar a revisão I1 do candidato

- Revisão independente de 28/09/2026 para `AUD20-008`: [REJECT](../04_audit/evidence/AUD-20260920/AUD20-008/I1-20260928.md) do candidato histórico por 33 hashes compartilhados divergentes e sentinel ausente. `A21-F20` permanece aberto; H01 exige pacote de candidato/run verificável após H02, novo parecer e sentinel.
- Sprint: P4-S8.
- O que/onde: docs/04_audit/evidence/AUD-20260921/REM21-019/, certification/manifest.json e novo dossiê I1.
- Como: Congelar o candidato de H02, entregar artefatos a crítico independente em leitura, registrar parecer sem editar o candidato durante a janela.
- Dependências/gate: H02; P1–P3 auditadas; autoridade de revisão independente.
- Pronto/evidência: Parecer I1 aceito para o mesmo run/candidate, sentinel final coerente e A21-F20 atualizado; se condicional, manter OPEN_INTERNAL.

### H02 — Produzir snapshot de release reproduzível

- Sprint: P4-S8.
- O que/onde: certification/candidate-manifest.json, scripts/ci-bar.mjs, documentação de freeze e artefatos de CI.
- Como: Fixar commit/composição, enumerar arquivos e hashes, reproduzir em ambiente limpo e vincular build, testes e imagem ao mesmo run.
- Dependências/gate: P1–P3 aceitas; nenhuma mudança candidate-scoped durante o freeze.
- Pronto/evidência: Reprodução independente sem drift, 35 gates pertinentes executados e hashes publicados; qualquer byte novo exige novo run.

### H03 — Decidir explicitamente G21-5

- Sprint: P5-S9.
- O que/onde: pacote REM21-009, docs/03_build/0335_comprehensive_remediation_executive_plan.md e decision record.
- Como: Consolidar owners, escopo, ambiente, privacidade, rollback e limites; submeter à autoridade e registrar aprovação ou recusa literal.
- Dependências/gate: H04, H11, H13 e pacote offline REM21-009; decisão humana.
- Pronto/evidência: Documento de decisão assinado com escopo, validade e condições; sem resposta, status WAITING_HUMAN_APPROVAL e P6 bloqueada.

### H04 — Nomear owners e approvers externos

- Sprint: P5-S9.
- O que/onde: REM21-009/authority-matrix.json e contrato de qualificação externa.
- Como: Preencher os sete slots com responsáveis reais, separando owner, approver e operador, e anexar evidência de aceite.
- Dependências/gate: Pacote REM21-009; indicação humana das pessoas e organizações.
- Pronto/evidência: Nenhum slot PENDING; autoridade, contatos e substitutos confirmados; sem inventar identidade ou credencial.

### H05 — Qualificar IdP real

- Sprint: P6-S10.
- O que/onde: apps/api/src/operator-identity.ts, operator-session.ts, apps/web/src/auth/session.ts e configuração do IdP.
- Como: Validar issuer, audience, assinatura, claims, papéis, tenant, expiração, revogação e troca de usuário em ambiente isolado.
- Dependências/gate: G21-5 aberto; H04, H13, H14 e contrato do IdP.
- Pronto/evidência: Matriz positiva/negativa em duas réplicas, negação de tenant/role indevido e receipt do owner de identidade.

### H06 — Qualificar sessão de operador distribuída

- Sprint: P6-S10.
- O que/onde: apps/api/src/operator-session.ts, store de sessão, cookies e frontend trusted.
- Como: Compor store durável e testar CSRF, expiração, logout, rotação e revogação entre réplicas/reinícios.
- Dependências/gate: G21-5; H05; política de sessão aprovada.
- Pronto/evidência: Nenhuma sessão revogada volta a autenticar; cookies e CSRF conformes; evidência de fail-closed e de recovery.

### H07 — Qualificar worker produtivo separado

- Sprint: P6-S12.
- O que/onde: apps/worker/src/worker.ts, homolog-worker.ts, readiness.ts e runbooks.
- Como: Desenhar perfil produtivo distinto, executar preflight, health, readiness, drain, leases e recovery sem liberar ferramentas sensíveis.
- Dependências/gate: G21-5; H05, H09, H14, H16; SPEC e autoridade específicas.
- Pronto/evidência: Worker inicia e para com estados corretos, recupera trabalho sem duplicar efeitos e só opera dentro do escopo aprovado.

### H08 — Qualificar provider de modelo real

- Sprint: P6-S11.
- O que/onde: packages/model-gateway/src/gateway.ts, providers e política de dados.
- Como: Ligar provider aprovado com classificação, residência, timeout, rate/custo, fallback e circuit breaker; inspecionar request/response redigidos.
- Dependências/gate: G21-5; H13, H14, H16; contrato e owner do provider.
- Pronto/evidência: Conformance, orçamento e falhas demonstrados; nenhum dado além da classe permitida sai do ambiente; recibo do owner.

### H09 — Qualificar canal real

- Sprint: P6-S11.
- O que/onde: packages/channel-gateway, apps/api webhook, outbox e runbook de dispatch.
- Como: Configurar canal aprovado, autenticar webhook, deduplicar, reconciliar receipts, parar dispatch e fazer handoff.
- Dependências/gate: G21-5; H04, H14, H16; destino e owner aprovados.
- Pronto/evidência: Replay não duplica entrega, falhas são auditáveis, kill switch interrompe saída e nenhum destinatário não aprovado é alcançado.

### H10 — Aprovar fontes institucionais

- Sprint: P6-S11.
- O que/onde: packages/rag/src/institutional-rag.ts, catálogo de knowledge e registros de fonte.
- Como: Anexar owner, versão, validade, escopo, revisão e revogação por fonte; vincular resposta à proveniência.
- Dependências/gate: G21-5; H04, H13, M10; decisão institucional.
- Pronto/evidência: Fonte ausente/expirada/revogada faz handoff; resposta autorizada mostra referência e versão; owner assina a fonte.

### H11 — Formalizar autoridade de agenda e autonomia

- Sprint: P5-S9.
- O que/onde: docs/01_prd/0012_regras_de_negocio.md, policy/approval e matriz de papéis.
- Como: Registrar níveis de autonomia, cargos, ações permitidas e exigência de aprovação para confirmação, cancelamento e reagendamento.
- Dependências/gate: Decisão de negócio e clínica humana; H04 quando aplicável.
- Pronto/evidência: Matriz assinada e versionada; ações reais continuam desabilitadas até gate separado e testes de negação.

### H12 — Provar bloqueio de ações sensíveis no alvo

- Sprint: P6-S11.
- O que/onde: packages/policy/src/safety/, approval-engine, gateway de tools e logs de auditoria.
- Como: Executar matriz negativa de atos clínicos, financeiros, prontuário e agenda real, inclusive indisponibilidade de policy/approval.
- Dependências/gate: G21-5; H05, H07–H11; ambiente autorizado.
- Pronto/evidência: Zero efeito sensível automático; toda proposta negada ou escalada com actor, motivo, policy e correlation id.

### H13 — Aprovar privacidade e retenção

- Sprint: P5-S9.
- O que/onde: docs/01_prd/0014_requisitos_nao_funcionais_produto.md, classificação, storage e pacote REM21-009.
- Como: Documentar finalidade, minimização, base, residência, acesso, retenção, exclusão e incident response com responsáveis.
- Dependências/gate: H04; decisão humana de privacy/security.
- Pronto/evidência: Política assinada, controles mapeados e dados reais proibidos até a autorização de G21-5.

### H14 — Gerir secrets e rotação fora do repositório

- Sprint: P6-S10.
- O que/onde: configuração de API/worker/providers, secretRef e runbooks.
- Como: Integrar secret manager aprovado, separar papéis, ensaiar rotação/revogação e inspecionar logs/artefatos por vazamento.
- Dependências/gate: G21-5; H04, H13; secret manager e credenciais aprovados.
- Pronto/evidência: Sem segredo em repositório/log, rotação sem perda de autoridade e falha de secret manager bloqueia o efeito.

### H15 — Medir RPO/RTO no ambiente aprovado

- Sprint: P6-S12.
- O que/onde: packages/persistence/migrations, scripts de backup/restore e runbooks.
- Como: Ensaiar falha, dump/restore, rollback por backup e leitura tenant-scoped da aplicação com relógio e checkpoints.
- Dependências/gate: G21-5; H07, H14; metas de negócio aprovadas.
- Pronto/evidência: RPO/RTO medidos contra metas assinadas; RLS, grants, outbox e journals preservados; resultado de rollback documentado.

### H16 — Qualificar egress externo

- Sprint: P6-S10.
- O que/onde: packages/shared/src/ssrf.ts, transports de adapters/providers e política de rede.
- Como: Aprovar proxy/allowlist, DNS, TLS, SNI, redirects, certificados e resposta a destino alterado.
- Dependências/gate: G21-5; H04, H13; política de rede aprovada.
- Pronto/evidência: Provas positivas/negativas em ambiente isolado, sem alcance privado indevido e com logs redigidos.

### H17 — Operar alertas e SLOs fora do processo local

- Sprint: P6-S12.
- O que/onde: packages/observability/src/operational.ts, API/worker telemetry e operação.
- Como: Compor exporter, retenção, dashboards e paging; injetar falha e confirmar recebimento por operador.
- Dependências/gate: G21-5; H07, H14; owner de operação e SLOs aprovados.
- Pronto/evidência: Alertas de latência, erro, fila e safety chegam ao responsável; falha de exporter não abre policy nem readiness.

### H18 — Provar auditoria durável ponta a ponta

- Sprint: P6-S12.
- O que/onde: audit repositories, traces de API/worker/approval e painel.
- Como: Correlacionar request, decisão, policy, ferramenta, resposta e handoff após restart/restore, com redaction e acesso tenant-scoped.
- Dependências/gate: G21-5; M16, H05, H07, H15.
- Pronto/evidência: Um caso pode ser reconstruído sem lacunas ou vazamento; retenção e acesso seguem H13; evidência hashada.

### H19 — Preparar piloto assistido com parada imediata

- Sprint: P7-S13.
- O que/onde: runbooks, configurações de canal/worker e pacote de decisão REM21-020.
- Como: Definir coorte, horário, operador, métricas, limite, kill switch, abort/rollback e ensaio de handoff antes de iniciar.
- Dependências/gate: G21-5; H05–H18 e M19 aceitos; decisão humana do piloto.
- Pronto/evidência: Plano e ensaio aprovados; dispatch só ocorre no escopo autorizado; nenhuma ação clínica, financeira ou consulta real automática.

### H20 — Submeter decisão G21-6 separadamente

- Sprint: P7-S13.
- O que/onde: dossiê de release, certification, I1, sentinel e signoffs.
- Como: Reunir resultados locais e externos, riscos residuais, hashes e pareceres; submeter a técnico independente e autoridade humana.
- Dependências/gate: H01, H02, H03, H19 e evidências externas aceitas.
- Pronto/evidência: Decisão G21-6 explícita e auditável; ausência ou recusa preserva NO_GO de produção.

## Média prioridade

### M01 — Reconciliar índices operacionais

- Estado: COMPLETED_DOCUMENTAL; evidência em docs/04_audit/evidence/AUD-20260923/M01-index-reconciliation.md.
- Sprint: P0-S0.
- O que/onde: docs/03_build/0300_build_engineer_master.md, 0301_roadmap.md, 0302_backlog_master.md, 0337_comprehensive_remediation_backlog.md e docs/99_operational_index.md.
- Como: Conferir topo dos ledgers e evidências REM21-019/009; atualizar apenas resumos correntes e links, preservando histórico.
- Dependências/gate: AUD22-DOC-001 já registrada; escopo documental.
- Pronto/evidência: Todos os cinco índices apontam status real, I1 condicional, G21-5/6 fechados e próximo passo; links e diff coerentes.

### M02 — Dividir o composition root da API

- Sprint: P1-S2.
- O que/onde: apps/api/src/server.ts e módulos de rotas por bounded context.
- Como: Caracterizar endpoints e authz, extrair grupos de rotas/wiring em fatias sem mudar envelopes, hooks ou ordem de middleware.
- Dependências/gate: M07 e M05; SPEC de refactor aprovada.
- Pronto/evidência: Contratos HTTP, tenant/authz e erros preservados; testes API pertinentes, typecheck, lint e regressão passam.

### M03 — Dividir o adapter PostgreSQL

- Sprint: P1-S2.
- O que/onde: packages/persistence/src/postgres.ts, repositories e migrations existentes.
- Como: Separar conexão, transação, repositórios e preflight por ownership; manter queries, isolamento e compatibilidade de schema.
- Dependências/gate: M07; contratos de repositório congelados.
- Pronto/evidência: RLS, grants, outbox, journals, restore e teste PostgreSQL de caracterização mantêm resultado e hashes de schema esperados.

### M04 — Modularizar o runtime iterativo

- Sprint: P1-S2.
- O que/onde: packages/harness/src/iterative-runtime.ts, context-engine.ts, completion.ts e effect-journal.ts.
- Como: Extrair máquina de decisão, budgets, execução e conclusão com interfaces internas; preservar stop reasons e ordem de efeitos.
- Dependências/gate: M05 e M07; comportamento atual caracterizado.
- Pronto/evidência: Trajetórias, no-duplicate-effect, timeout, cancelamento e approval resume preservados em regressão/evals.

### M05 — Demonstrar composição pública canônica

- Sprint: P1-S1.
- O que/onde: packages/harness/src/createOperationalHarness.ts, apps/api, apps/worker e composição de persistence.
- Como: Registrar o caminho HTTP → PostgreSQL → worker → runtime público e seus ports; provar fixture sintética ponta a ponta sem imports internos.
- Dependências/gate: Discoveries M07 e M05 aprovados para PRD por decisão humana de 23/09/2026; a rota A e o par legado `published-agent`/`kernel` foram selecionados. M05 segue M07 em P1-S1; exige PRD/SPEC e gate local próprio antes de qualquer prova executada.
- Pronto/evidência: Um trace liga entrada, policy, tool, journal e saída; ambos os paths legados têm compatibilidade documentada.
- Estado em 23/09/2026: Discovery estática em [0018](../00_discovery/0018_m05_public_harness_composition.md); revisão I1 passou M05-D1–D5 e o run Gauntlet ficou `CONDITIONAL_PASS` porque runtime/end-to-end está `NOT_RUN` ([evidência](../04_audit/evidence/AUD-20260923/M05/)). A resposta humana “Approve both; choose A (recommended)” aprovou M05 Discovery para PRD e selecionou `/v1/executions` → outbox operacional → worker `operational-harness` → `createOperationalHarness()`, com par legado `published-agent`/`kernel`. M05 PRD segue M07 e formalizará a comparação em tenant, session, policy, approval, tool, journal e resposta, conforme 0342; nenhuma prova runtime está autorizada ainda.

### M06 — Demonstrar segundo consumidor não clínico

- Sprint: P1-S3.
- O que/onde: examples/ e exports públicos de packages/harness, contracts, policy e tools.
- Como: Criar cliente sintético neutro que registra capability sem editar core e execute fluxo governado.
- Dependências/gate: M05, M08 e M09.
- Pronto/evidência: Segundo consumidor compila e roda pelos exports públicos; nenhuma dependência de Secretary ou dado clínico no core.

### M07 — Verificar dependências de packages

- Sprint: P1-S1.
- Estado em 23/09/2026: Discovery [0017](../00_discovery/0017_m07_package_dependencies.md), PRD [0028](../01_prd/0028_m07_package_dependencies.md) e SPEC foram aprovados nas etapas correspondentes. O usuário aprovou exatamente o gate local M07-S1; implementação e seis comandos foram executados no candidato `a00127c13b165b81bd95d2671891e737f50bfb60c482816d0ef9c1b26fa4a797`. O audit não fechou: inventory completo expõe 22 achados em manifests preexistentes, coverage falha statements/branches, e I1 está `UNAVAILABLE`. O relatório e a revisão estão em [M07-S1 BUILD/AUDIT](../04_audit/evidence/AUD-20260923/M07-BUILD-S1/final-gate-result.md). Limitação D4 da Discovery permanece.
- O que/onde: package.json de apps/packages, exports e grafo de imports.
- Como: Inventariar dependências declaradas/reais, ciclos e imports privados; corrigir manifests em slices e construir packages isolados.
- Task ativa M07-S1: implementação vertical existe nos três paths autorizados; não ampliar o código nem corrigir manifests sem gate corretivo. A inventory classifica owners/fontes/arestas e gera relatório determinístico candidate-bound.
- Dependências/gate: gate M07-S1 aprovado e executado; quality bar não satisfeita. G21-1 histórico não cobre M07. Um novo gate é necessário para qualquer correção ou slice posterior.
- Aceite de M07-S1: cobertura completa e roles visíveis passaram; focused regression, suite total, typecheck e lint passaram no mesmo candidato; coverage ficou abaixo dos limites de statements/branches e inventory encontrou 22 achados preexistentes. M07-S1 permanece aberta. S2–S4 continuam dependentes de correção, evidência e gates próprios.
- Reauditoria 0569: os 976 inputs atuais batem com os hashes do candidato, mas o fingerprint não é diretamente reproduzível do JSON persistido e os comandos registrados usaram Node 24 fora do perfil Node 22. A24-01–A24-05 tratam o S1 em novo gate; A24-06–A24-10 tratam S2–S4, CI e I1. Isto não altera o FAIL histórico.
- Retomada R1 em 24/09: candidato `1038f996b0577e56ecd795f1f08b6e13bb3a752d454c80f3fc0601f51c045b5f`; B3 completo com 11 findings e zero unresolved; B6 falhou no teste `reports in-flight, expired, raced, approval-waiting and conflicting claims`; typecheck, lint e pós-check passaram, coverage sem resultado aprovável; I1 `UNAVAILABLE`. Evidência em [R1 final](../04_audit/evidence/AUD-20260923/M07-S1-R1/final-gate-result.md); novo [gate C1](../04_audit/evidence/AUD-20260923/M07-S1-R1/correction-gate-proposal.md) aguarda decisão humana.
- Histórico AUD45: C1, C1E, C1F, C1G, C1H e C1I são tentativas registradas; C1F foi então o último candidate real. C1I terminou `FINISHED / STOP / FAIL`; seu candidate freeze parou por referência residual `C1H_NPM_VERSION_FILE`. O packet C1J foi preparado e depois aprovado/executado em rodadas posteriores. Para o estado corrente, consultar AUD52 no topo e os ledgers mestres.

### M08 — Unificar contrato de capabilities

- Sprint: P1-S3.
- O que/onde: packages/tools, approval-engine, policy-engine, platform plugin gateway e contratos compartilhados.
- Como: Definir manifest de input/output, risco, efeito, idempotência, timeout, auth e audit; adaptar nativo/plugin sem ampliar permissões.
- Dependências/gate: M05, M07; M09 para autoridade.
- Pronto/evidência: Mesma conformance passa para dois adapters; bypass de policy/approval falha fechado.

### M09 — Consolidar domínios de approval

- Sprint: P1-S3.
- O que/onde: packages/approval-engine, packages/policy, packages/platform e apps/api.
- Como: Mapear autoridade de cada domínio, normalizar decisão/consumo e reconciliar recovery sem modificar semântica de self-approval.
- Dependências/gate: M05, M07; matriz de comportamento congelada.
- Pronto/evidência: Approval single-use, CAS, TTL, papel, tenant e audit permanecem coerentes após falha/restart.

### M10 — Acrescentar proveniência por afirmação ao RAG

- Sprint: P2-S4.
- O que/onde: packages/rag, catálogo de fontes e response envelope.
- Como: Anexar ID/versão/trecho/validade da fonte a cada claim; negar ou escalar quando a evidência não sustentar a frase.
- Dependências/gate: Catálogo local existente; SPEC de claims.
- Pronto/evidência: Respostas sintéticas auditam cada claim; fonte ausente, revogada ou vencida gera handoff sem resposta livre.

### M11 — Modelar ambiguidade e estado de diálogo

- Sprint: P2-S4.
- O que/onde: packages/conversation, memory, persistence e workflows de jornada.
- Como: Persistir slots confirmados, pendências, correções e clarificação com tenant/session/version; separar inferência de dado confirmado.
- Dependências/gate: M05; contratos de sessão e retenção local.
- Pronto/evidência: Correção do tutor substitui slot anterior sem ação duplicada; retomada após restart mantém contexto e limites.

### M12 — Avaliar runtime integrado

- Sprint: P2-S4.
- O que/onde: packages/agent-evals, harness, tests/phase4a e relatórios de eval.
- Como: Criar corpus sintético rotulado que atravessa modelo, contexto, policy, tool e handoff; medir qualidade, latência e custo.
- Dependências/gate: M10 e M11; runtime canônico M05.
- Pronto/evidência: Thresholds e holdout explícitos; relatório distingue fixture determinística de provider real e bloqueia regressão de safety.

### M13 — Provar modo degradado de integrações

- Sprint: P3-S6.
- O que/onde: packages/adapters, channel-gateway, workflows e worker.
- Como: Injetar timeout, indisponibilidade e recuperação em fakes de HIS/Desk/CIP; manter sessão e fila auditáveis.
- Dependências/gate: M05, M09; sem sistema externo.
- Pronto/evidência: Nenhuma mensagem aceita se perde; retry bounded, handoff e retorno de serviço não geram tarefa/efeito duplicado.

### M14 — Exercitar carga com múltiplas réplicas

- Sprint: P3-S6.
- O que/onde: apps/api, apps/worker, PostgreSQL descartável e scripts de load.
- Como: Rodar duas ou mais instâncias sintéticas, medir leases, replay, throughput, latência e recuperação pós-crash.
- Dependências/gate: M13, M20; ambiente local descartável.
- Pronto/evidência: Zero perda/efeito duplicado dentro do contrato; métricas e limites publicados por run/candidate.

### M15 — Definir limites de fila e justiça entre tenants

- Sprint: P3-S6.
- O que/onde: outbox, worker scheduler, rate-limit e métricas de fila.
- Como: Definir quotas e política de prioridade/retry/dead letter, com teste de starvation sob carga sintética.
- Dependências/gate: M14; decisões de produto sobre prioridade.
- Pronto/evidência: Tenants mantêm budget isolado, fila bounded e jobs não elegíveis terminam em DLQ/handoff auditável.

### M16 — Tornar a trilha operacional pesquisável

- Sprint: P2-S5.
- O que/onde: apps/api trace routes, apps/web TraceViewer, audit repositories.
- Como: Unir IDs de request, execução, approval e handoff em busca tenant-scoped; projetar payload redigido e paginação bounded.
- Dependências/gate: M05; contratos de trace existentes.
- Pronto/evidência: Operador autorizado encontra uma execução ponta a ponta; outro tenant não vê eventos; dados sensíveis não vazam.

### M17 — Melhorar decisão humana no painel

- Sprint: P2-S5.
- O que/onde: apps/web/src/features/approvals, apps/api approval routes e policy summary.
- Como: Mostrar contexto, ação proposta, motivo de policy, expiração e efeito esperado antes de aprovar/rejeitar.
- Dependências/gate: M09 e M16; validação com produto antes de alterar regra.
- Pronto/evidência: Decisão inválida/expirada não produz efeito; UI comunica estado real e auditoria registra actor e versão.

### M18 — Otimizar consultas e paginação por evidência

- Sprint: P2-S5.
- O que/onde: conversations/tasks/audit repositories, índices PostgreSQL e APIs.
- Como: Medir planos e p95 com volumes sintéticos; aplicar índices ou queries bounded sem mudar contratos de paginação.
- Dependências/gate: M03; dataset sintético e metas PRD.
- Pronto/evidência: Listagens atendem metas acordadas, sem OFFSET inseguro, vazamento de tenant ou scan não previsto.

### M19 — Validar UX com operadores em ambiente aprovado

- Sprint: P6-S12.
- O que/onde: apps/web, runbook de observação e roteiros de tarefa.
- Como: Observar operadores designados em tarefas de handoff, approval, busca e troca de tenant; registrar problemas sem dado real até autorização específica.
- Dependências/gate: G21-5; H05/H06; M17/M18; owner de operação.
- Pronto/evidência: Relatório de usabilidade com achados, severidade e decisão de correção; nenhuma ação real sensível executada.

### M20 — Provar compatibilidade de versões e rollback

- Sprint: P1-S3.
- O que/onde: apps/api, apps/worker, migrations, harness contracts e runbook de cutover.
- Como: Executar matriz old/new API-worker-schema, approvals pendentes, replay e rollback de configuração/schema aditivo.
- Dependências/gate: M02–M04, M05, M09; SPEC de versionamento.
- Pronto/evidência: Versões compatíveis sem perda/duplicação; incompatibilidade falha fechado; rollback reproduzível em PostgreSQL descartável.

## Baixa prioridade

### L01 — Criar guia curto de início

- Sprint: P3-S6.
- O que/onde: docs/README.md, exemplos locais e runbooks.
- Como: Escrever caminho local e homolog, variáveis por perfil, comandos e limites, sempre apontando para contratos canônicos.
- Dependências/gate: M05, M13; sem gate externo.
- Pronto/evidência: Novo agente chega ao primeiro smoke sintético seguindo o guia; links e comandos declarados correspondem ao repo.

### L02 — Padronizar glossário

- Estado: `COMPLETED_DOCUMENTAL`; evidência em [AUD37-DOC-001](../04_audit/evidence/AUD-20260924/L02-glossary/completion-record.md).
- Sprint: P3-S6.
- O que/onde: docs/README.md, docs/architecture e docs/07_agents.
- Como: Definir approval, handoff, gate, candidate, tenant, release e estados em português/inglês; referenciar termo canônico.
- Dependências/gate: M01; não mudar contratos por mera renomeação.
- Pronto/evidência: Termos ambíguos mapeados, nenhuma regra contraditória e links para fonte de verdade.

### L03 — Gerar navegação documental derivada

- Estado: `PARTIAL / SPEC_DRAFT_V0.4_REVIEW_PENDING`; reconciliação manual entregue; [SPEC-DOC-001 v0.4](../02_spec/0129_l03_operational_index_generator.md), SHA-256 `7a144a686d7a5ce7333efa50c7f476b662b9da4a6b97936f85a0bb07504bc0a9`, segue draft. A crítica lead-only [AUD49-DOC-001](../04_audit/evidence/AUD-20260924/L03-generator-spec/critique-and-revision-03.md) refinou corte histórico, contexto Markdown, gramática de links e erros fail-closed; I1 não foi criado por `agent thread limit reached`, e revisão humana/BUILD não ocorreram. A v0.2/AUD40 permanece histórica; ver também [AUD38](../04_audit/evidence/AUD-20260924/L03-index-reconciliation/partial-record.md) e [AUD39-DOC-002 — v0.1](../04_audit/evidence/AUD-20260924/L03-generator-spec/spec-preparation.md).
- Sprint: P3-S7.
- O que/onde: docs/99_operational_index.md e script de índice se necessário.
- Como: Após M01, derivar navegação de ledgers sem transformar índice em autoridade; impedir apontamento a task histórica como atual.
- Dependências/gate: M01 e L02; automação de código exige revisão da SPEC e gate humano próprio antes de BUILD.
- Pronto/evidência: Índice atualiza de modo reproduzível, links resolvem e gate humano não é inferido.

### L04 — Reduzir repetição dos ledgers extensos

- Sprint: P3-S7.
- O que/onde: docs/99_runtime_state.md, docs/20_master_execution_log.md e visões derivadas.
- Como: Preservar histórico append-only, definir resumo atual e referências cruzadas sem duplicar decisões mutáveis.
- Dependências/gate: M01, L03; revisão de governança documental.
- Pronto/evidência: Leitor localiza status/next_action em um passo; histórico não é apagado e fontes de verdade não divergem.

### L05 — Ampliar exemplos sintéticos

- Sprint: P2-S4.
- O que/onde: examples/, docs/README.md e fixtures de atendimento.
- Como: Adicionar roteiros de approval, fonte ausente, falha de canal, restore e handoff usando dados artificiais.
- Dependências/gate: M10–M12 para os exemplos iniciais; exemplo de falha de adapter entra após M13.
- Pronto/evidência: Exemplos executam somente em perfil local e demonstram recusa/handoff com evidência e limites.

### L06 — Refinar textos de estados vazios e erros

- Sprint: P2-S5.
- O que/onde: apps/web/src/features e copy de autenticação/handoff.
- Como: Revisar mensagens de sessão expirada, sem permissão, fila vazia, conflito e decisão pendente com linguagem clara.
- Dependências/gate: M17 e identidade trusted atual.
- Pronto/evidência: Mensagens refletem estado da API, acessibilidade básica e próximo passo humano sem expor detalhe sensível.

### L07 — Desenhar mapas curtos dos fluxos críticos

- Sprint: P2-S5.
- O que/onde: docs/architecture e docs/platform.
- Como: Criar diagramas de approval, outbox, recovery e release apontando para SPEC/ADR existentes.
- Dependências/gate: M05, M09, M16.
- Pronto/evidência: Cada diagrama corresponde ao código/contrato atual e indica fronteiras de autoridade e falha.

### L08 — Uniformizar nomes de métricas e eventos

- Sprint: P2-S5.
- O que/onde: packages/observability, catálogos de métricas e runbook.
- Como: Catalogar unidade, label permitido, cardinalidade, owner e interpretação de evento; migrar aliases sem quebrar consumidores.
- Dependências/gate: M16 e H17 apenas para qualificação externa futura.
- Pronto/evidência: Dashboards/alertas locais usam nomes documentados; label não aprovado é rejeitado e compatibilidade é registrada.

### L09 — Documentar APIs públicas por consumidor

- Sprint: P1-S1.
- O que/onde: docs/architecture/PUBLIC_API.md, packages/harness exports e examples.
- Como: Descrever composição pública e exemplos de ports sem import interno ou ontologia Secretary no core.
- Dependências/gate: M05, M07; M06 valida o exemplo.
- Pronto/evidência: Dois consumidores compilam seguindo só a documentação e as interfaces públicas.

### L10 — Revisar links e evidências históricas periodicamente

- Sprint: P3-S7.
- O que/onde: scripts/check-doc-links.mjs, docs/doc-link-policy.json e catálogo de evidências vazias.
- Como: Manter varredura periódica e política de referência histórica, registrando evidência stale sem editar artefato antigo.
- Dependências/gate: M01, L03; preservar hashes históricos.
- Pronto/evidência: Links correntes resolvem, exceções têm motivo e owner, JSON histórico vazio continua explicitamente catalogado.

## Próxima task executável

Próxima ação: decidir o pedido C1K pelo SHA-256 `d334e883540d83aa4a77217fc66203befe8a930020ee5e5c4f8443cc8f5aa97c`; nenhum review começa antes da decisão hash-bound. C1J não pode ser repetida. M07-S1 permanece `FAIL / OPEN`; S2–S4 e M05 não autorizadas; H01 exige I1 próprio; G21-5/G21-6 fechados, produção `NO_GO`.
