# G4 — API, SDK, hosts, configuração e operação

Referência: DeepSeek Harness `768fb1f3` (0.2.0-rc.1). CVG: worktree atual. Análise por leitura de READMEs, índices e grep; sem execução.

| Família | Cartão P100 | Capacidades | Presente | Parcial | Ausente | Esforço estimado |
|---|---|---|---|---|---|---|
| api (gateway Remote tipado) | P100-040 | 7 | 0 | 3 | 4 | G |
| sdk (TS + Python + runtime) | P100-025 / P100-052 | 8 | 1 | 4 | 3 | G |
| host/boot/settings/credentials + apps/cli | P100-040 | 10 | 0 | 4 | 6 | GG |
| feedback/telemetry/runtime-diagnostics | P100-046 | 7 | 1 | 3 | 3 | M |
| test-support + snapshots/replay | P100-004 | 7 | 0 | 4 | 3 | G |
| vendor | P100-052 | 2 | 0 | 0 | 0 (2 N/A) | P |
| distribuição/build | P100-052 | 6 | 0 | 3 | 3 | G |
| **Total** | | **47** | **2** | **21** | **22** (+2 N/A) | ~GG |

Observação central: a referência é uma árvore Cordis (plugins, `cordis.yml`, perfis, HMR). O CVG é um monorepo de pacotes TS com Fastify e PostgreSQL. A paridade aqui é funcional (o que o operador/integrador consegue fazer), não estrutural. ADR-011 já fixa diferenças deliberadas.

---

## api (cartão P100-040)
- Referência: `packages/api/{gateway,remotes,session-controller,settings-controller,workspace-controller,job-controller,terminal-controller,account-controller,workspace-files}`; `docs/api-gateway.md`; `packages/api/gateway/README.md`.
- Capacidades da referência:
  - API-01 — Chamadas unárias tipadas Client→Host com descritor gerado e validação exata de argumentos — `packages/api/gateway/README.md`, `docs/api-gateway.md`
  - API-02 — Streams multiplexados com uplink do cliente, meio-fechamento, cancelamento e limite de caixa de entrada — `packages/api/gateway/README.md`
  - API-03 — Reconexão e eventos do Host encaminhados ao cliente — `packages/api/gateway/README.md`
  - API-04 — Controlador de sessão: comandos, streams de histórico, estado de controle ao vivo, política de identidade Agent/Session — `packages/api/session-controller`
  - API-05 — Controlador de configurações e credenciais (leitura/escrita da superfície de config) — `packages/api/settings-controller`
  - API-06 — Controlador de workspace e de arquivos do workspace (projeção completa, mutações) — `packages/api/workspace-controller`, `workspace-files`
  - API-07 — Controladores de job (observação de job em segundo plano) e de terminal (shell interativo de sessão) — `packages/api/job-controller`, `terminal-controller`
- CVG hoje:
  - API-01: PARCIAL — `apps/api/src/server.ts`, `routes/*` — REST Fastify com validação de fronteira por rota; sem descritor gerado nem cliente tipado gerado a partir das rotas.
  - API-02: AUSENTE — só há request/response e `session.events` paginado no SDK; sem stream, uplink nem cancelamento por stream (cancel de execução existe: `POST /v1/executions/:id/cancel`).
  - API-03: AUSENTE — sem WebSocket/SSE de eventos do Host; reconexão depende de reler por `afterSequence`.
  - API-04: PARCIAL — `/v1/executions`, `/v1/executions/:id/input`, `/trajectory`, `/v1/sessions/:id/takeover`, `/v1/conversations`, `/v1/audit/sessions/:id` — comandos de execução, entrada, handoff e histórico existem; falta controle ao vivo (pausa/retomada de turno, modo, modelo) como superfície.
  - API-05: PARCIAL — `/v1/admin/agents`, `/versions`, `/rollback`, `/plugins/catalog`, `/release-candidates`, `/capability-approvals` — gestão versionada de agente e plugin; não há edição de configuração de runtime por formulário.
  - API-06: AUSENTE — não há conceito de workspace/arquivos de projeto (CVG não é agente de código). Provável DIVERGENTE_INTENCIONAL para o recorte de código.
  - API-07: AUSENTE — sem controlador de job observável nem terminal (sandbox shell é ferramenta, não superfície de cliente). Jobs de worker existem em `apps/worker/src/jobs`.
- CVG além da referência: identidade de operador com sessão PostgreSQL e OIDC (`operator-session*.ts`, `oidc-*.ts`), RLS por tenant (`tenant-preflight.ts`), rate limit, webhooks de canal assinados (`webhook-security.ts`, `/v1/webhooks/channels/*`), aprovações (`/v1/approvals`), trilha de auditoria com cadeia (`/v1/observability/audit-evidence`), alerta de parada (`stop-alert-monitor.ts`), takeover humano.
- Lacunas:
  1. Camada de contrato de API gerado (descritores + cliente tipado a partir das rotas) — M; depende de P100-025; risco baixo; relevância média.
  2. Canal de streaming de eventos de execução (SSE ou WebSocket) com cursor de retomada, cancelamento e backpressure — G; depende de SDK-05 e da fonte de eventos (família sessão/eventos); risco: efeito duplicado em reconexão, isolamento de tenant no canal; relevância alta (acompanhar turno da equipe em tempo real).
  3. Superfície de controle ao vivo de turno/sessão (pausar, retomar, trocar modo) sem baixar controles — M; depende de P100-012; risco de autorização; relevância alta.
  4. Controlador de job observável (progresso de job de worker, exames/agenda longos) — M; depende de família jobs; relevância média.
  5. Workspace/arquivos e terminal — fora de escopo razoável (ver abaixo).
- Critério de aceite: cliente externo executa, acompanha por stream, cancela e retoma uma execução via API com tenant e operador reais sintéticos; reconexão não duplica efeito nem evento; teste negativo cruzando tenant.
- Fora de escopo: terminal e arquivos de workspace (hospital não precisa); `remotes` como seleção de plugins de UI. Dúvida: o console Web (P100-041) vai exigir stream; decidir transporte antes.

## sdk (cartões P100-025, P100-052)
- Referência: `packages/sdk/{protocol,client,server}`, `python/sdk` (`deepseek_harness/{api,client,errors,models}.py`), `python/sdk-runtime` (wheel com executável embutido), `snapshots/sdk`.
- Capacidades da referência:
  - SDK-01 — Protocolo JSON-RPC 2.0 por linhas (initialize, session/prompt, notificações session.event, session.status, subagent.started/finished) — `packages/sdk/protocol/src/types.ts`
  - SDK-02 — Cliente TS de alto nível (`DeepSeekHarness`: abre sessão, prompts texto/imagem, coleta eventos, última resposta) e de baixo nível (`HarnessClient`) — `packages/sdk/client`
  - SDK-03 — Servidor stdio como plugin com uma sessão por `sessionId`, fila de prompts, `shutdown`, EOF/sinais — `packages/sdk/server`
  - SDK-04 — Cliente Python equivalente (contexto, sessões, inscrição de notificações por sessão/árvore de subagentes, respostas a requests do servidor) — `python/sdk/src/deepseek_harness/`
  - SDK-05 — Requests iniciados pelo servidor (aprovação/entrada) respondidos pelo cliente — `python/sdk/.../client.py` (`next_request`, `respond`)
  - SDK-06 — Lançamento por perfil nomeado e patches ordenados; perfis `sdk` e `sdk-minimal` — `packages/bundle/sdk-app`, `sdk-minimal`
  - SDK-07 — Runtime embarcado por plataforma (wheel Python com executável, sidecars) — `python/sdk-runtime`
  - SDK-08 — Cenários de snapshot do SDK (multi-turn, bash, ptc, imagem inline, tools dinâmicas, max-tokens) — `snapshots/sdk/*`
- CVG hoje:
  - SDK-01: PARCIAL — `packages/sdk/src/protocol.ts` — JSON-RPC v1 com `sdk.hello`, `session.open`, `turn.send`, `session.events` e códigos de erro próprios. Faltam notificações push, status e eventos de subagente.
  - SDK-02: PARCIAL — `packages/sdk/src/client.ts`, `composition.ts` — cliente tipado, in-process e stdio; sem prompt multimodal, sem coleta por stream.
  - SDK-03: PRESENTE — `packages/sdk/src/server.ts`, `stdio.ts` — servidor com limites, validadores (`validators.ts`), perfis `createSdk`/`createSdkMinimal`.
  - SDK-04: PARCIAL — `packages/sdk/python/cvg_sdk/{client,stdio,protocol,validation}.py` — cliente stdlib com FD attach, hello/open/send/read_events, schemas v1 (`contract_v1.json`). Testado só em CPython 3.12.3/Linux; sem notificações, sem sessão de alto nível.
  - SDK-05: AUSENTE — não há request iniciado pelo servidor; aprovação vai por `/v1/approvals` no API. Decidir se o SDK precisa dele.
  - SDK-06: PARCIAL — `composition.ts` — composição mínima vs. completa; sem lançamento de processo por perfil nomeado (o host decide, por desenho).
  - SDK-07: AUSENTE — sem distribuição pip, wheel ou runtime embarcado (README: "No wheel/pip distribution").
  - SDK-08: PARCIAL — `tests/consumers-sdk-session.test.ts`, `tests/pare100-sdk-boundary-qualification.test.js`, `packages/sdk/python/tests` — interop TS↔Python existe; não há suíte de cenários equivalentes.
- CVG além da referência: `expected_tenant_id` no Python, contrato v1 versionado com schemas JSON de eventos, `SESSION_EVENT_CATALOG_V1` imutável, cursor `afterSequence` com limite, erros tipados (`session_not_found`, `capability_not_available`, `unsupported_protocol_version`).
- Lacunas:
  1. Notificações push (`session.event`, `session.status`, término de subagente) com assinatura por sessão e backpressure — M; depende de API-02; risco: perda/duplicação de evento; relevância alta.
  2. Cliente de alto nível "run" (envia, espera ocioso, devolve última resposta e `stopReason`) em TS e Python — P; relevância média.
  3. Requests do servidor ao cliente (aprovação/entrada) como alternativa ao REST — M; depende de P100-012; risco de autorização: a decisão tem que seguir operador autenticado e uso único; relevância média.
  4. Prompt multimodal (imagem) — M; depende de família modelos/mídia; relevância média (foto de exame/ferida via tutor, sem diagnóstico).
  5. Distribuição Python (wheel/sdist verificável, matriz de versões) — M; depende de P100-052; relevância baixa para o hospital interno.
  6. Suíte de cenários SDK equivalentes (multi-turn, tool com aprovação, cancelamento, EOF/shutdown) — M; depende de TEST-02.
- Critério de aceite: processo TS e processo Python executam, retomam e cancelam sessão com transcript idêntico; EOF e `shutdown` testados; erro de versão e backpressure cobertos (já exigido por P100-025).
- Fora de escopo: runtime embarcado por plataforma e wheels macOS/Windows; branding. Dúvida: o CVG deve manter protocolo próprio (v1) ou espelhar nomes do DeepSeek? Recomendo manter nomes e mapear.

## host, boot, settings, credentials e apps/cli (cartão P100-040)
- Referência: `packages/host/*` (webserver, frontend-static, directory-picker*, open-in-app, plugin-inventory, product-telemetry-otel), `packages/boot/{app-boot,cmdline,hmr,config-editor,plugin-manager}`, `packages/settings/settings`, `packages/credentials/{credentials,credentials-local,authorization,deepseek-account*}`, `apps/cli` (`args.ts`, `profile-boot.ts`, `dump-config*.ts`), `apps/desktop-host`, `packages/bundle/*`.
- Capacidades da referência:
  - HOST-01 — Launcher `dsh` com perfil nomeado, patches ordenados, argumentos internos repassados — `apps/cli/src/args.ts`
  - HOST-02 — Perfis/bundles (base, headless, sdk, sdk-minimal, web-app, acp-app) como camadas de configuração — `packages/bundle/*`
  - HOST-03 — Boot com carga de ambiente, falha ruidosa e diagnóstico de inicialização — `packages/boot/app-boot`, `apps/cli/src/startup-diagnostics.ts`
  - HOST-04 — Dump de configuração composta e de schemas de plugins — `apps/cli/src/dump-config*.ts`
  - HOST-05 — Modo headless (execução sem UI) — `packages/bundle/headless`
  - HOST-06 — Settings: formulário derivado do schema, edição com revisão, persistência no perfil ativo — `packages/settings`, `boot/config-editor`
  - HOST-07 — Reload de configuração e módulos sem reinício (HMR/reconciliação) com quiescência — `packages/boot/hmr`
  - HOST-08 — Gestão de plugins do perfil (instalar/remover bundles) com aprovação — `packages/boot/plugin-manager`, `host/plugin-inventory`
  - HOST-09 — Credenciais por referência (config só guarda o nome), cofre local, sobrescrita por ambiente, rotação aplicada à próxima chamada — `packages/credentials/*`
  - HOST-10 — Fluxos de autorização que pedem credencial a um humano; conta de provedor — `packages/credentials/authorization`, `deepseek-account*`
- CVG hoje:
  - HOST-01: AUSENTE — não há CLI. Entradas são `apps/api/src/main.ts` e `apps/worker/src/main.ts`, só por variável de ambiente.
  - HOST-02: PARCIAL — `packages/sdk/src/composition.ts`, `apps/worker/src/{homolog,continuous,controlled}-worker.ts`, `legacy-composition.ts` — existem composições nomeadas (mínima, homolog, controlada, contínua), mas em código, não como perfis declarativos.
  - HOST-03: PRESENTE-parcial → PARCIAL — `apps/api/src/startup-failure.ts`, `production-bootstrap.ts`, `*-preflight.ts`, `apps/worker/src/startup-error.ts`, `postgres-role-preflight.ts` — falha de partida clara e preflights fortes (papéis PG, tenant, sessão). Falta diagnóstico unificado e comando de verificação offline.
  - HOST-04: AUSENTE — sem dump de configuração efetiva nem schema da configuração por variável (`deploy/harness/.env.example` documenta, não valida por schema exportável).
  - HOST-05: PARCIAL — worker contínuo e `phase4a-demo.ts`/`phase3-synthetic-agent.ts` rodam sem UI, mas não há entrada headless "uma execução e saída" para operador.
  - HOST-06: PARCIAL — `/v1/admin/agents` (+versões, rollback), `/v1/admin/plugins/catalog`, `/v1/admin/release-candidates`, `/v1/admin/capability-approvals` — configuração por versão publicada, com candidato a release e aprovação. Não há formulário por schema de config de runtime (e isso pode ser decisão).
  - HOST-07: AUSENTE — reload exige reinício; sem quiescência/reconciliação. P100-040 pede "reload de capabilities com quiescência".
  - HOST-08: PARCIAL — catálogo de plugins com `capability-approvals` (aprovação humana antes de ativar); sem gestão de pacote instalado nem inventário de entradas carregadas.
  - HOST-09: PARCIAL — `deploy/harness/secrets/README.md`, `deploy/harness/secrets` (segredos por arquivo, formato, rotação), `packages/observability/src/redaction.ts` — segredo por arquivo e redação; sem serviço de credenciais por referência com rotação aplicada a quente.
  - HOST-10: AUSENTE — sem fluxo de autorização interativa de credencial (OAuth de conta de provedor ou segredo pedido a humano). Login OIDC do operador existe (`oidc-identity.ts`), mas é outra coisa.
- CVG além da referência: OIDC de operador com transação de login e sessão em PostgreSQL, preflights de papel PG e de tenant, trusted proxy por IP literal, rate limit, imagem somente leitura sem capacidades (compose de produção), job único de migração, backup com restore drill e âncoras de cadeia, smoke de alvo remoto (`production-target-smoke.ts`).
- Lacunas:
  1. CLI operacional `cvg` (subcomandos: api, worker, migrate, doctor/preflight, config dump, run headless) com argumentos repassados — M; depende de HOST-02; risco baixo; relevância média (operação do hospital).
  2. Modelo de configuração tipado e validado por schema, com dump da configuração efetiva sem segredos e catálogo gerado (equivalente ao `config-catalog`) — M; risco: vazar segredo no dump; relevância alta (auditoria de configuração).
  3. Perfis declarativos (mínimo, homolog, controlado, produção, headless) em vez de composição em código — G; depende de 2; relevância média.
  4. Reload de configuração/capabilities com quiescência (drenar turnos, pausar worker, reconciliar) — G; depende de pausa do worker (já existe) e de P100-012; risco: efeito duplicado e turno cortado no meio; relevância alta.
  5. Serviço de credenciais por referência (nome na config, valor no cofre/arquivo), rotação aplicada à próxima chamada, UI-safe info — M; risco de vazamento e de segredo em log; relevância alta.
  6. Fluxo de autorização humana para credencial de provedor/canal (ex.: token WhatsApp) com aprovação — M; depende de 5; relevância média.
  7. Inventário somente leitura de plugins carregados e gestão revisada com aprovação — M; depende de P100-012; relevância média.
- Critério de aceite: `cvg doctor` e `cvg config dump` rodam sem rede e sem segredos na saída; partida inválida falha com mensagem única; rotação de credencial vale na chamada seguinte sem reinício; reload com turno em curso não perde nem duplica efeito.
- Fora de escopo: directory-picker, open-in-app, frontend-static, desktop-host, HMR de código-fonte, contas DeepSeek. Dúvida: o que o hospital chama de "perfil" (por tenant, por ambiente ou por agente)? Hoje o CVG tem perfil de agente versionado e perfil de runtime (`single_pass`/`iterative`), nenhum de host.

## feedback, telemetry e runtime-diagnostics (cartão P100-046)
- Referência: `packages/feedback/{command-feedback,message-feedback}`, `packages/telemetry/otel`, `packages/host/product-telemetry-otel`, `packages/runtime-diagnostics/invariants`, `docs/subsystems/{feedback,otel,invariants}.md`.
- Capacidades da referência:
  - OBS-01 — Feedback de sessão (comando `/feedback`, taxonomia fixa de categorias, sem turno de modelo) — `packages/feedback/command-feedback`
  - OBS-02 — Feedback por mensagem do assistente (nota, categoria, observação com limite de bytes, persistido com a sessão, fora do histórico do modelo e da telemetria) — `packages/feedback/message-feedback`
  - OBS-03 — Canais OTEL independentes: eventos comuns e log de sessão com limite de bytes, fila, retry, shutdown com deadline — `packages/telemetry/otel`
  - OBS-04 — Telemetria de produto explícita, com política de compartilhamento condicionada a feedback — `packages/host/product-telemetry-otel`
  - OBS-05 — Invariantes de runtime por pacote, ligáveis por chave global e filtro por nome, com falha atribuída ao pacote dono — `packages/runtime-diagnostics/invariants`
  - OBS-06 — Identidade anônima por instalação — `packages/identity`
  - OBS-07 — Diagnóstico de queda do runtime (stderr capturado, motivo de fechamento) — `python/sdk/.../client.py` (`_runtime_diagnostics`)
- CVG hoje:
  - OBS-01: AUSENTE — sem feedback de sessão. Há `docs`/HISO, mas nada de produto para equipe/tutor sinalizar uma conversa.
  - OBS-02: AUSENTE — sem avaliação por mensagem. Útil para o assistente de plantão avaliar respostas.
  - OBS-03: PARCIAL — `packages/observability/src/otel.ts`, `telemetry.ts`, `redaction.ts`, `trace-context.ts` — adaptador OTEL real (spans e métricas) com buffer local limitado e redação; sem canal de log de sessão com limite de bytes nem política de exportação por consumidor.
  - OBS-04: AUSENTE como produto; DIVERGENTE_INTENCIONAL provável — telemetria de produto anônima não cabe no hospital; rede de telemetria exige T4.
  - OBS-05: PARCIAL — `kernel-audit-chain.ts`, `critical-safety-preflight.ts`, `engine-prod-lifecycle`, `restore-audit-chain-proof.ts`, `execution-spine` — verificações de cadeia de auditoria e preflights; não há registro genérico de invariantes por pacote com filtro.
  - OBS-06: AUSENTE — sem identidade anônima; DIVERGENTE_INTENCIONAL (CVG tem operador identificado).
  - OBS-07: PRESENTE — `apps/*/startup-failure.ts`, `/health`, `/ready`, `/health/metrics`, `stop-alert.ts`, `homolog-alerts.ts`, `worker-observability.ts`, `/v1/executions/:id/trajectory`, `/v1/admin/execution-traces` — diagnóstico de queda, prontidão, métricas, alerta de parada e trajetória reconstruível.
- CVG além da referência: ledger de auditoria encadeado e verificável (`audit-ledger.ts`, `/v1/observability/audit-evidence`), alerta de parada com monitor, métricas com exposição controlada, correlação por `CorrelationId`/`TraceId`, rastros de execução administrativos.
- Lacunas:
  1. Feedback de mensagem e de sessão (nota/categoria/observação, persistido por tenant, fora do contexto do modelo, exposto em API e SDK) — M; depende de API-04 e persistência de sessão; risco: dado pessoal na observação, isolamento de tenant; relevância alta (loop de melhoria do assistente).
  2. Registro de invariantes de runtime por pacote com chave global e filtro, falha atribuída ao dono — M; depende de P100-012; relevância média.
  3. Canal de exportação de log de sessão e eventos com fila limitada, retry e shutdown com deadline, exporter indisponível não derruba o turno — M; depende de P100-020; risco: vazar payload sensível (redação obrigatória); relevância média.
  4. Inspetor (leitura de trajetória por correlação) com autenticação — P; já existe base em `/v1/executions/:id/trajectory`; falta o aceite "inspector sem auth é seguro" provado.
- Critério de aceite: reconstruir uma falha por `correlationId` sem payload sensível; exporter OTEL fora do ar não altera resultado do turno; feedback gravado por tenant e ausente do contexto do modelo.
- Fora de escopo: telemetria de produto anônima e identidade anônima. Dúvida: o feedback do hospital identifica a pessoa (operador) ou é anônimo? Recomendo identificado, com RLS.

## test-support e snapshots/replay (cartão P100-004)
- Referência: `packages/test-support/{session-snapshot,agent-loop-testkit,client-runtime,remote-mock,loader-smoke,llm-mock-server,llm-replay}`, `vitest.snapshot.config.ts`, `snapshots/{sdk,session,acp,web}`, scripts `test:snapshot`, `test:snapshot:record`, `test:snapshot:refresh`, `docs/testing.md`.
- Capacidades da referência:
  - TST-01 — Replay de LLM a partir de streams gravados, sem chave, com modo `record`/`refresh` por variável — `packages/test-support/llm-replay`
  - TST-02 — Servidor LLM de falhas compatível com OpenAI, roteirizável (timeout, 429, corte de stream) — `llm-mock-server`
  - TST-03 — Harness de snapshot de log de sessão com normalização de ids/tempo, workspace e launcher — `session-snapshot/src/{harness,normalize,manifest,suite}.ts`
  - TST-04 — Kit prático do AgentLoop concreto para testes — `agent-loop-testkit`
  - TST-05 — Smoke de carga por Loader e turnos de fixture — `loader-smoke`
  - TST-06 — Mock de Remote e carrier de Connection para testes de cliente inteiro — `remote-mock`, `client-runtime`
  - TST-07 — Cenários de snapshot por superfície (SDK, sessão, ACP, web) com gate de CI dedicado — `snapshots/*`, `check:ci:snapshot`
- CVG hoje:
  - TST-01: PARCIAL — `scripts/snapshot-replay.mjs`, `tests/replay/fixture-schema.mjs`, `snapshots/core` — replay de fixtures por caso com `--record`; só o núcleo, sem stream de provedor gravado.
  - TST-02: PARCIAL — `packages/chaos`, `packages/model-gateway` (testes de falha) e `ScriptedModelGateway` em `packages/orchestrator` — falhas roteirizadas existem; não há servidor HTTP compatível com OpenAI.
  - TST-03: PARCIAL — `tests/differential/*`, `tests/conformance/*`, `SESSION_EVENT_CATALOG_V1` — comparação com a referência por resposta e catálogo de eventos; sem normalizador/manifesto genérico de log de sessão.
  - TST-04: AUSENTE como pacote; coberto de fato por `ScriptedOrchestrator`/`StaticOrchestrator` e `tests/basic-agent.test.ts`, mas sem kit reutilizável publicado.
  - TST-05: AUSENTE — smokes isolados (`worker-startup-smoke.mjs`, `runtime-image-smoke.mjs`, `production-stack-smoke.ts`), sem harness geral.
  - TST-06: AUSENTE — não há cliente de UI a testar com mock (console web é P100-041).
  - TST-07: PARCIAL — `tests/e2e`, `tests/phase4a`, `tests/replay` e CI (`verify.yml`) — gates fortes (E2E, mutation guard, cobertura por arquivo), mas sem gate de snapshot por superfície.
- CVG além da referência: gate de cobertura por arquivo no núcleo, `mutation-guard.mjs`, catálogo de skips, prova de restore PG, provas de contrato de ci-bar com proveniência.
- Lacunas:
  1. Pacote `test-support` neutro (kit de runtime governado, normalizador de log de sessão, manifesto de suíte) extraído dos testes — M; relevância média (acelera todas as outras famílias).
  2. Servidor HTTP de falha de modelo compatível com o formato do gateway (429, timeout, corte, JSON inválido) — M; depende de família modelos; relevância média.
  3. Gravação/replay de stream de provedor com `record`/`refresh` — M; depende de 2; risco: gravar dado real (proibido; só sintético).
  4. Cenários de snapshot do SDK equivalentes (ver SDK-08) e gate CI `snapshot` — M; depende de P100-050.
- Critério de aceite: caso conhecido-bom passa e três adulterações (efeito extra, evento perdido, resultado indevido) falham; nada lê `~/.dsh` ou dado real (já exigido em P100-004).
- Fora de escopo: `client-runtime` (jsdom) e `remote-mock` até existir console web equivalente.

## vendor (cartão P100-052)
- Referência: `vendor/{cordis,cosmokit,group,hmr,loader,…}` — cópias de fonte do framework Cordis e bibliotecas base, com manifesto e log de modificações locais (`vendor/AGENTS.md`, `scripts/check-vendor-manifest.sh`).
- Capacidades:
  - VEN-01 — Framework de injeção/ciclo de vida Cordis embarcado como fonte
  - VEN-02 — Manifesto e verificação de divergência local
- CVG hoje:
  - VEN-01: N/A — DIVERGENTE_INTENCIONAL: o CVG não usa Cordis; o kernel de plugins é próprio (ADR-011). Não precisa paridade.
  - VEN-02: N/A — se o CVG vendorizar algo no futuro, usar o padrão de manifesto; hoje `check-licenses.mjs` e `generate-sbom.mjs` cobrem dependências.
- Lacunas: nenhuma. Critério de aceite: nenhum. Dúvida: se a paridade de lifecycle de plugin (reload/unload) exigir semântica Cordis, isso pertence à família kernel, não aqui.

## distribuição e build (cartão P100-052)
- Referência: `scripts/build.ts`, `scripts/build-exe-for-python-sdk*.ts`, `scripts/build-python-release.py`, `check-vendor-manifest.sh`, `dist-exe/*` (runtime linux-x64 com sidecars office e rg), perfis de cliente (`official`), `packages/tsdown.worker.ts`.
- Capacidades:
  - DST-01 — Build completo por perfil (cliente web e pacotes), com seleção por variável — `scripts/build.ts`
  - DST-02 — Executável autônomo por plataforma com sidecars (office, ripgrep, pty) — `scripts/build-exe-for-python-sdk*.ts`, `dist-exe`
  - DST-03 — Release Python (wheel por alvo, tag e payload conferidos) — `scripts/build-python-release.py`, `python/sdk-runtime`
  - DST-04 — Verificações de integridade (expected filenames, deployment target macOS, constraints de workspace) — `scripts/check-*`
  - DST-05 — Gates de CI por mudança (change-scope, selfhosted, workflow spec) — `scripts/change-scope.ts`, `ci-workflow.spec.ts`
  - DST-06 — Distribuição reproduzível com SBOM/licenças/hash
- CVG hoje:
  - DST-01: PARCIAL — `scripts/build-runtime.mjs`, `build-public-workspace.mjs`, `runtime-image-*` — build de workspace público e imagem de runtime com contrato e smoke; sem perfis de build.
  - DST-02: AUSENTE — a entrega é imagem de contêiner, não executável. DIVERGENTE_INTENCIONAL provável (servidor, não ferramenta local).
  - DST-03: AUSENTE — sem wheel; SDK Python é cópia de diretório.
  - DST-04: PARCIAL — `check-doc-links`, `workspace-dependency-audit`, `boundary-*`, `check-product-boundary`, `ci-bar-*` — verificações fortes de fronteira, mais exigentes que a referência em vários pontos.
  - DST-05: PRESENTE-parcial → PARCIAL — `.github/workflows/{verify,security,product-shift-assistant}.yml`, `ci-diff-check.mjs` — CI com barras e proveniência.
  - DST-06: PARCIAL — `generate-sbom.mjs`, `check-licenses.mjs`, `runtime-image-record.mjs`, `deploy/harness/compose.production.yaml` — SBOM, licenças e registro de imagem; falta assinatura e instalação limpa sem fonte comprovada (P100-052 exige).
  - (DST-03 e DST-06 sobrepõem SDK-07.)
- CVG além da referência: compose de produção endurecido (somente leitura, `cap-drop ALL`, TLS no proxy), job único de migração, backup/restore drill com âncoras de cadeia, smoke de alvo remoto, runbooks (0802, 0805).
- Lacunas:
  1. Instalação limpa de pacote/imagem sem fonte nem legado, com prova de exports/types/assets — M; depende de P100-011 e de isolamento de produto; relevância média.
  2. Assinatura e hash da candidata a release ligados ao SBOM — M; sem publicação automática; relevância média.
  3. Wheel do SDK Python verificável — M (ver SDK lacuna 5).
- Critério de aceite: instalar pacote/imagem sintética num diretório limpo e rodar smoke sem fonte; scan e licenças da candidata atuais.
- Fora de escopo: executável autônomo por plataforma, wheels macOS/Windows, sidecars office/pty/rg.

---

## Riscos transversais
- Streaming e reconexão (API-02/03, SDK-01) são o maior risco de efeito duplicado e de vazamento entre tenants; exigem cursor, idempotência e RLS no canal desde o desenho.
- Configuração e reload (HOST-04/07) mexem em segurança: dump sem segredo e quiescência sem perda de turno precisam de prova, não de teste unitário.
- Feedback e logs de sessão carregam dado pessoal de tutores e equipe; redação e retenção são obrigatórias antes de qualquer exportação de rede (T4).
- Escopo "estilo Cordis" (perfis, HMR, plugin manager) pode inflar; separar o que é necessidade operacional (doctor, config dump, reload seguro) do que é herança de arquitetura.
- Testes de paridade dependem do comparador diferencial (P100-004) e de keyless; sem ele, SDK e API não fecham.

## Ordem sugerida
1. TST-01..03 e extração do `test-support` (destrava prova das demais).
2. SDK-01/02/04 (notificações push, cliente "run", Python de alto nível) + API-02/03 (stream com cursor).
3. HOST-02/04 (config tipada, dump, perfis) e CLI `cvg doctor`.
4. HOST-09/07 (credenciais por referência, reload com quiescência).
5. OBS-01/02/05 (feedback, invariantes) e depois distribuição (DST/SDK-07).
