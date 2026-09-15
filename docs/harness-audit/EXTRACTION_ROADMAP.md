# Roadmap de extração

Decisão de entrada: **GO_WITH_PREREQUISITES**. Este roadmap descreve uma transformação futura; a auditoria não autoriza implementação, movimentação de packages ou produção. Cada fase é aditiva, tem gate próprio e deve manter o Secretary operável pelo artefato anterior pinado.

## Blockers de entrada

Antes de mover código devem ser resolvidos: candidato sujo não reproduzível; runtime dual sem composição pública canônica; manifests/imports divergentes; ontologia de capability/profile fechada; sistemas de tool fragmentados; audit/trace não duráveis; ausência de testes de cutover/rollback/mixed-version; ausência de segundo consumer. Evidência: `HARNESS_SCORECARD.md :: Decisão, blockers e próxima fase` e `EXTRACTION_TEST_READINESS.md`.

## Phase 0 — Discovery / Evidence Freeze

- **Goal:** criar uma referência reproduzível do comportamento e dos bytes que serão transformados.
- **Scope:** pin de commit + patch/worktree, exports, manifests, schemas, decisões e golden traces; caracterização dos paths default e kernel; prova sintética HTTP→SQL→worker→kernel.
- **Non-goals:** mover packages, mudar defaults, corrigir comportamento ou promover kernel.
- **Dependencies:** acesso ao candidato observado; quality bar congelada; fixtures sem dados reais.
- **Deliverables:** manifest com hashes, dependency graph, public API/schema snapshots, catálogo de divergências e trace canônico dos dois paths.
- **Tests/evals:** reprodução limpa do manifest; smoke dos paths; trace/output snapshots; sentinel de bytes fora do escopo.
- **Exit criteria:** candidato reproduzível; ambos os paths descritos por entrada/estado/efeito/saída; composição canônica proposta e testável; `NOT_RUN` explicitado.
- **Risk:** congelar evidência histórica/stale como atual.
- **Rollback:** descartar somente artefatos de freeze e voltar ao candidato pinado; zero byte de produto alterado.

## Phase 1 — Behavioral Freeze

- **Goal:** congelar semânticas que não podem mudar durante a extração.
- **Scope:** runtime, policy, approval, tool invocation, request do modelo, tenant/session/takeover, outbox, audit, idempotência e failure recovery.
- **Non-goals:** melhorar conversa, adicionar loop, trocar providers ou redesenhar APIs.
- **Dependencies:** Phase 0; matriz `EXTRACTION_TEST_READINESS.md` adjudicada.
- **Deliverables:** golden suites, crash/replay matrix, negative security matrix e lista explícita de comportamentos não congelados.
- **Tests/evals:** parity dos dois paths; fault injection antes/depois do efeito; two-tenant; approval lifecycle; prompt request snapshot; handoff/takeover.
- **Exit criteria:** todos os itens `BLOCKING_EXTRACTION` relacionados ao freeze em PASS sem skip; counterexamples falham antes e passam após o harness de teste.
- **Risk:** golden tests cristalizarem defeitos sem classificá-los.
- **Rollback:** remover apenas testes novos; manter baseline e defeitos conhecidos registrados.

## Phase 2 — Harness Contracts

- **Goal:** estabelecer contracts neutros e direção `PRODUCT → HARNESS → PORTS`.
- **Scope:** IDs, turn, decision, capability, policy, approval, effect, audit, model, clock e error contracts; regras de versionamento.
- **Non-goals:** mover implementations, criar framework/MCP ou alterar semântica.
- **Dependencies:** Phases 0–1; ownership decisions aprovadas.
- **Deliverables:** package de contracts, import rules, compatibility adapters e ADR de versionamento.
- **Tests/evals:** API snapshot, type tests, isolated package builds, cycle detector e dois consumers de compilação.
- **Exit criteria:** grafo acíclico; manifests completos; Secretary e consumer sintético compilam apenas contra exports públicos.
- **Risk:** abstrações prematuras ou contracts que vazam Secretary.
- **Rollback:** remover package/adapters e restaurar imports anteriores pinados.

## Phase 3 — Runtime Extraction

- **Goal:** extrair o single-turn governed runtime sem mudar comportamento.
- **Scope:** kernel, limits, proposal/effect contracts, checkpoint mínimo, adapters duráveis de journal/outbox/audit e compatibility adapter no product host.
- **Non-goals:** agent loop V2, Orchestrator, Skills ou mudança de decisão conversacional.
- **Dependencies:** Phases 1–2; idempotency e crash matrix verdes.
- **Deliverables:** runtime library, adapters do path legado, `AuditSink` durável, migrations aditivas, feature flag e runbook de cutover/restore.
- **Tests/evals:** golden parity, approval resume, crash/replay, duplicate-effect counter, trace após restart, two-tenant e mixed old/new adapter/schema.
- **Exit criteria:** uma composição pública canônica; efeitos ≤1 em todas as falhas; resposta/estado compatíveis; trace durável, restore e mixed-version PASS.
- **Risk:** duplicação de efeito ou divergência entre paths.
- **Rollback:** flag volta ao runtime anterior; journal/schema permanecem backward-compatible.

## Phase 4 — Governance Extraction

- **Goal:** separar mecanismo genérico de policy/approval/RBAC dos catálogos de produto.
- **Scope:** evaluator, approval lifecycle, authorization port, immutable binding e catalog/profile injection.
- **Non-goals:** simplificar policies, transferir grants Secretary ao core ou autorizar ação real.
- **Dependencies:** contracts e runtime canônicos; owner dos três approval domains decidido.
- **Deliverables:** policy-core, approval-core, adapters legados e catálogo Secretary no product host.
- **Tests/evals:** deny/allow/approval semantic parity, self-approval denial, CAS/TTL/fencing/restart e direct-call negative matrix.
- **Exit criteria:** 100% da tabela congelada preservada; capability nova é registrável sem editar core; nenhum bypass direto.
- **Risk:** privilege escalation ou quebra de approval resume.
- **Rollback:** adapters restauram evaluator/store antigos; nenhuma migration destrutiva.

## Phase 5 — Model Gateway Extraction

- **Goal:** tornar o gateway a única fronteira de model invocation do Harness.
- **Scope:** provider port, routing, retries, fallback, circuit, budgets, prompt application e request provenance.
- **Non-goals:** trocar modelo, alterar prompts, otimizar qualidade ou habilitar produção.
- **Dependencies:** contracts neutros; golden request construction da Phase 1.
- **Deliverables:** gateway library, provider adapters, canonical request builder e telemetry contract.
- **Tests/evals:** exact request snapshots, provider conformance, timeout/rate-limit/fallback/circuit e cost limits.
- **Exit criteria:** sem bypass no runtime canônico; prompt efetivo/version/hash reconstruíveis; parity aprovada.
- **Risk:** prompt drift ou fallback alterar comportamento.
- **Rollback:** pin da versão anterior e adapter do provider legado.

## Phase 6 — Tool Runtime

- **Goal:** unificar Native e Plugin sob um capability manifest governado.
- **Scope:** schema de input/output, risk/effect class, authorization, timeout, retry, idempotency, audit e registry.
- **Non-goals:** MCP, mover tools Secretary ou registrar integrações reais.
- **Dependencies:** Phases 2–5; governance e effect journal canônicos.
- **Deliverables:** capability registry, executor, Native/Plugin adapters e conformance kit.
- **Tests/evals:** schema rejection, auth deny, timeout/retry, idempotency, audit, injection e Native/Plugin parity.
- **Exit criteria:** dois adapters passam a mesma suíte; runtime depende só do port; vocabulário único.
- **Risk:** bypass de policy ou semânticas distintas por adapter.
- **Rollback:** manter gateways antigos atrás de adapters/flag; zero remoção inicial.

## Phase 7 — Secretary Recomposition

- **Goal:** fazer do Secretary o primeiro cliente explícito do Harness.
- **Scope:** product host fornece profile, policies, prompts, workflows, tools, knowledge e adapters; API/web/worker permanecem no produto.
- **Non-goals:** redesenhar UX, converter workflows em Skills ou adicionar Corp.
- **Dependencies:** Phases 3–6; composition root e manifests estabilizados.
- **Deliverables:** Secretary composition module, compatibility wiring e mapa de ownership.
- **Tests/evals:** full golden/E2E, handoff/takeover, tenant/session, journey tools e equivalência de rollout.
- **Exit criteria:** Secretary usa somente APIs públicas do Harness; sem import inverso; comportamento congelado preservado.
- **Risk:** hidden coupling aparecer apenas em runtime.
- **Rollback:** feature flag para composição monolítica pinada e adapters preservados.

## Phase 8 — Agent Loop V2

- **Goal:** adicionar iteração cognitiva bounded com estado explícito.
- **Scope:** `Decision`, `Observation`, `EvidenceSet`, `Checkpoint`, budgets e stop reasons.
- **Non-goals:** autonomia irrestrita, tool execution fora de governance ou self-approval.
- **Dependencies:** runtime/tool/model/audit canônicos e evals comportamentais ligados ao runtime real.
- **Deliverables:** loop engine opt-in, checkpoint store port e failure/stop taxonomy.
- **Tests/evals:** multi-step, insufficient evidence, loop detection, max steps/cost/duration, cancellation e no-duplicate effects.
- **Exit criteria:** todo loop termina com stop reason; budgets são determinísticos; efeitos seguem policy/approval exatamente uma vez.
- **Risk:** latência/custo multiplicados ou loops sem término.
- **Rollback:** desabilitar V2 e retornar ao single-turn runtime, preservando checkpoints para auditoria.

## Phase 9 — Orchestrator

- **Goal:** decidir o próximo passo explicitamente sem absorver authority.
- **Scope:** coordinator híbrido para respond/retrieve/tool/clarify/approval/handoff/verify/replan/stop.
- **Non-goals:** permitir que LLM autorize efeitos ou substituir state machines transacionais.
- **Dependencies:** Phase 8 e contracts de capability/evidence.
- **Deliverables:** orchestrator implementation, decision schema, policy interlock e replayable decision log.
- **Tests/evals:** plan-step conformance, ambiguous input, tool-result evaluation, denial/handoff e adversarial action proposals.
- **Exit criteria:** todas as decisões tipadas/auditadas; authority permanece determinística; replay explica cada transição.
- **Risk:** confundir recomendação probabilística com autorização.
- **Rollback:** selector retorna coordinator nulo/single-turn; logs permanecem legíveis.

## Phase 10 — Skill Runtime

- **Goal:** carregar conhecimento operacional versionado sem embutir domínio no core.
- **Scope:** manifest, loader, compatibility, provenance e eval binding; Secretary Skills como primeiro dataset.
- **Non-goals:** marketplace, código arbitrário ou transformar tool em skill.
- **Dependencies:** Orchestrator, context builder, capability registry e version model.
- **Deliverables:** skill contract/loader, registry e adapters de workflows Secretary.
- **Tests/evals:** load/version/hash, incompatible skill denial, prompt/context provenance e scenario regression.
- **Exit criteria:** duas skills versionadas carregam sem core edit; replay identifica versão; falha é fail-closed.
- **Risk:** prompt/code injection ou drift silencioso.
- **Rollback:** workflows estáticos continuam disponíveis; loader desabilitável.

## Phase 11 — MCP Compatibility

- **Goal:** provar compatibilidade MCP atrás do mesmo capability contract.
- **Scope:** contract mapping, trust/auth model, discovery cache, timeout/cancellation e audit; adapter inicialmente off.
- **Non-goals:** tornar MCP obrigatório, expor tools sensíveis ou conectar produção.
- **Dependencies:** Tool Runtime estável, security review e conformance kit.
- **Deliverables:** adapter MCP experimental, threat model e conformance profile.
- **Tests/evals:** malicious server/payload, schema drift, auth scope, timeout, cancellation, idempotency e Native/Plugin/MCP parity.
- **Exit criteria:** nenhum bypass de policy/approval/tenant/audit; remote failure isolada; adapter default-off.
- **Risk:** tool injection, credential leakage ou trust expansion.
- **Rollback:** remover/desabilitar adapter sem mudar registry ou consumers.

## Phase 12 — Multi-product Validation

- **Goal:** demonstrar generalidade com cliente Corp-like não clínico.
- **Scope:** profile, policy, capability, skill e adapters sintéticos; dois tenants; contract suite compartilhada.
- **Non-goals:** construir CVG Corp real ou inserir requisitos Corp no core.
- **Dependencies:** Phases 2–11 aplicáveis; gate em `MULTI_PRODUCT_REUSE_ANALYSIS.md`.
- **Deliverables:** consumer sintético removível, conformance report e lista de leaks de domínio.
- **Tests/evals:** non-Secretary registration, denial, approval resume, Native/Plugin, tenant isolation, audit restart e no-core-edit check.
- **Exit criteria:** sete checks do consumer gate PASS sem skip; Secretary permanece verde; zero core edit específico de Corp.
- **Risk:** demo artificial mascarar coupling real.
- **Rollback:** remover consumer e fixtures sem alterar Harness/Secretary.

## Phase 13 — Production Certification

- **Goal:** determinar, com autoridade humana, se o Harness pode receber rollout controlado.
- **Scope:** load/soak, restore, RPO/RTO, security, supply chain, observability, operations, canary e rollback.
- **Non-goals:** produção irrestrita, dados reais não autorizados ou autoaprovação.
- **Dependencies:** todas as fases anteriores; candidato selado; ambientes e owners autorizados.
- **Deliverables:** dossier de certificação, SLO/RPO/RTO, runbooks, residual-risk register e signoffs.
- **Tests/evals:** representative p50/p95/p99/cost, chaos, backup/restore, security review, mixed-version deploy e rollback rehearsal.
- **Exit criteria:** gates externos/humanos aprovados; riscos CRITICAL fechados; residual HIGH aceito pelo owner; canary e rollback exercitados.
- **Risk:** evidência de outro snapshot ou rollout além do autorizado.
- **Rollback:** no rollout on failure; abort canary, pin versão anterior e executar runbook verificado.

## Sequência e próxima fase

As dependências são gates, não calendário. Fases podem preparar artefatos em paralelo apenas quando não alterarem contratos ainda não aprovados; nenhuma fase pode saltar um exit criterion anterior. A próxima fase recomendada é **Phase 0 — Discovery / Evidence Freeze**, seguida de **Phase 1 — Behavioral Freeze**. Não começar movendo packages.
