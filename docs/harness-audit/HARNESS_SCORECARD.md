# Harness scorecard

Escala conservadora sobre os bytes observados (`512bc11e...` + worktree). `Score` mede maturidade demonstrada, não volume de código. Confiança significa qualidade da evidência da nota (`HIGH`: caminho e testes/contratos diretamente inspecionados; `MEDIUM`: evidência direta, mas composição ou runtime incompleto). Uma média nunca substitui um gate.

## Notas por área

| Área                 | Score | Confiança | Evidência reproduzível                                                                                                                                                 | Principal força                        | Principal gap                                              | Ação necessária                                 |
| -------------------- | ----: | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------- |
| Runtime              |     5 | HIGH      | `CURRENT_AGENT_RUNTIME.md`; `packages/agent-runtime/src/runtime.ts :: GovernedAgentRuntime.runTurn()`; `packages/platform/src/test-lab.ts :: executeConfiguredAgent()` | kernel governado, limits e journal     | default legado e ambos os paths single-pass                | provar composição pública canônica              |
| Orchestrator         |     2 | HIGH      | `ORCHESTRATION_ANALYSIS.md`; `packages/agent-runtime/src/composition.ts :: WorkflowCoordinatorPort`, `resolveWorkflowCoordinator()`                                    | port e selector existem                | `planStep()` sem implementação/chamada executável          | coordinator tipado + checkpoint                 |
| Agent Loop           |     2 | HIGH      | `AGENT_LOOP_GAP_ANALYSIS.md`; `runtime.ts :: runTurn()`; `test-lab.ts :: modelProvider.complete()`                                                                     | budgets antecipam controle             | sem observe/evaluate/replan                                | loop bounded após freeze comportamental         |
| Context Engineering  |     3 | HIGH      | `CONTEXT_ENGINEERING_ANALYSIS.md`; `packages/platform/src/prompt-composer.ts`; `test-lab.ts:321-335`                                                                   | tenant/session/version/history bounded | mensagem, knowledge e prompt não compõem contexto coerente | `ContextBuilder` + provenance/budget            |
| Conversation State   |     4 | MEDIUM    | `MEMORY_STATE_ARCHITECTURE.md`; `packages/platform/src/handoff.ts`; `apps/worker/src/postgres-controlled.ts:294-408`                                                   | session, takeover e version pin        | sem dialogue slots/ambiguity state                         | `DialogueState` durável                         |
| Natural Conversation |     2 | HIGH      | `CONVERSATIONAL_ARCHITECTURE.md`; `test-lab.ts:584-711`; `packages/platform/src/output-policy.ts:147-199`                                                              | output safety e handoff                | regex/templates/provider fake                              | composer probabilístico governado               |
| Tool Architecture    |     6 | HIGH      | `TOOL_CAPABILITY_ARCHITECTURE.md`; `packages/platform/src/plugin-gateway.ts :: PluginRegistry`; `packages/tools/src/registry.ts :: ToolRegistry`                       | plugin gateway validado e runtime port | registries/vocabulários fragmentados                       | capability manifest único                       |
| Skill Readiness      |     1 | HIGH      | `SKILL_RUNTIME_READINESS.md`; `packages/workflows/src/**`; ausência de loader/manifest no runtime auditado                                                             | workflows são embriões                 | nenhum skill runtime                                       | manifest/loader somente após dois clientes      |
| MCP Readiness        |     3 | MEDIUM    | `MCP_READINESS.md`; seam em `packages/platform/src/plugin-gateway.ts`; ausência de transporte MCP no grafo observado                                                   | plugin seam aproveitável               | protocolo, transport e security ausentes                   | conformance primeiro; adapter depois            |
| Model Gateway        |     7 | HIGH      | `MODEL_GATEWAY_ANALYSIS.md`; `packages/model-gateway/src/gateway.ts`; `contracts.ts :: ModelProvider`                                                                  | routing/retry/fallback/circuit/budget  | bypass default e prompt não aplicado ao input              | integrar e corrigir contrato                    |
| Memory               |     1 | HIGH      | `MEMORY_STATE_ARCHITECTURE.md`; `packages/memory/src/memory-facts.ts :: createApprovedMemoryFact()`                                                                    | tipos mínimos distinguíveis            | package stub e sem consumers                               | ports separados de memory/checkpoint            |
| RAG/Knowledge        |     2 | HIGH      | `KNOWLEDGE_RUNTIME_ANALYSIS.md`; `packages/rag/src/institutional-rag.ts`; `noop-rag-source.ts`                                                                         | fail-closed para fonte aprovada        | catálogo lexical, sem retrieval real                       | knowledge/evidence runtime                      |
| Policy               |     8 | HIGH      | `GOVERNANCE_EXTRACTION_ANALYSIS.md`; `packages/policy-engine/src/engine.ts:39-340`; `capabilities.ts`                                                                  | deny/approval determinísticos          | catálogo de produto no core                                | separar mecanismo de catálogo                   |
| Approval             |     8 | HIGH      | `GOVERNANCE_EXTRACTION_ANALYSIS.md`; `packages/approval-engine/src/engine.ts`; `packages/persistence/src/runtime-approval-store.ts:359-390`                            | binding, fencing, CAS e recovery       | três domínios e auth externa à engine                      | ownership e contrato canônico                   |
| RBAC                 |     6 | HIGH      | `GOVERNANCE_EXTRACTION_ANALYSIS.md`; `packages/shared/src/auth.ts`; `apps/api/src/operator-identity.ts`                                                                | permission checks em endpoints         | callers diretos e IdP externo não provados                 | authorization port + negative matrix            |
| Tenant Isolation     |     8 | HIGH      | `HARNESS_SECURITY_BOUNDARY.md`; `packages/persistence/src/tenant-scoped-postgres.ts:69-120`; migrations `0013`/`0015`                                                  | scoped connection, RLS e preflight     | cutover/infra real não provados                            | testes cross-version e two-tenant               |
| Audit                |     6 | HIGH      | `OBSERVABILITY_ANALYSIS.md`; `packages/observability/src/audit-ledger.ts`; `apps/worker/src/kernel-composition.ts:306-322`                                             | chain, redaction e eventos             | ledger do kernel volátil e audit opcional                  | `AuditSink` obrigatório e durável               |
| Observability        |     5 | HIGH      | `OBSERVABILITY_ANALYSIS.md`; `packages/agent-runtime/src/runtime.ts:371-470`; `packages/model-gateway/src/gateway.ts:301-414`                                          | spans, metrics e adapter OTel          | sem export/join E2E na composição                          | trace cross-process                             |
| Persistence          |     7 | HIGH      | `DURABILITY_ANALYSIS.md`; `packages/persistence/src/postgres.ts:903-1512`; `tenant-scoped-postgres.ts`                                                                 | repos PostgreSQL, outbox e CAS         | mega-package e dependências invertidas                     | split de ports/adapters/ownership               |
| Durability           |     6 | HIGH      | `DURABILITY_ANALYSIS.md`; `apps/worker/src/continuous-worker.ts:107-657`; `runtime.ts:970-1005`                                                                        | leases, retry, DLQ e journal           | repair wiring e RPO/RTO `NOT_RUN`                          | recovery + restore evidence                     |
| Evals                |     4 | HIGH      | `AGENT_EVALS_ANALYSIS.md`; `scripts/phase10-eval-report.ts`; `packages/agent-evals/src/agent.ts`                                                                       | runner, cenários e thresholds          | surrogate determinístico e proxy fraca de hallucination    | executar runtime real/golden claims             |
| Security             |     7 | MEDIUM    | `HARNESS_SECURITY_BOUNDARY.md`; `apps/api/src/http-security.ts:97-203`; `packages/platform/src/tool-invocation-boundary.ts:128-206`                                    | default-deny, RLS, bounds e approval   | identity externa, plugin e RAG gaps                        | preservar trust contracts + gates especialistas |
| Extensibility        |     5 | HIGH      | `DEPENDENCY_DIRECTION_ANALYSIS.md`; `packages/policy-engine/src/capabilities.ts`; `packages/platform/src/plugin-gateway.ts`                                            | ports, registries e versionamento      | capability ontology fechada                                | catálogos e contracts injetáveis                |
| Product Decoupling   |     4 | HIGH      | `COMPOSITION_ROOT_ANALYSIS.md`; `apps/api/src/server.ts`; `apps/worker/src/kernel-composition.ts`; `DEPENDENCY_DIRECTION_ANALYSIS.md`                                  | alguns packages coesos                 | roots, platform e persistence mistos                       | contracts + seams antes de mover                |
| Multi-product Reuse  |     4 | HIGH      | `MULTI_PRODUCT_REUSE_ANALYSIS.md`; enum/grants em `packages/policy-engine/src/capabilities.ts`, `grants.ts`; nenhum segundo consumer                                   | primitives plausivelmente genéricos    | segundo cliente exige editar core                          | consumer contract Corp-like                     |
| Extraction Readiness |     4 | HIGH      | `EXTRACTION_TEST_READINESS.md`; `EXTRACTION_BOUNDARY.md`; imports vs `package.json`; runtime dual-path                                                                 | approval/model/runtime primitives      | snapshot sujo, dual paths e manifest drift                 | evidence freeze + canonical path                |

Soma verificável: `120`; média simples: `120 / 26 = 4,6153...`, exibida apenas como **4,6/10**. Scores inteiros evitam precisão promocional; a média não reduz blockers.

## Derivação dos percentuais conceituais

Unidade: 15 capacidades macro do diagrama-alvo, cada uma avaliada nos mesmos bytes. `P` (presença material) usa `1 = implementação material`, `0,5 = fragmento executável/parcial`, `0 = ausente/conceitual`. `E` (extraível quase as-is) usa `1 = contrato genérico coeso`, `0,75 = limpeza pequena`, `0,5 = split/adaptação limitada`, `0,25 = reconstrução substancial`, `0 = reimplementar/ausente`. Esses pesos são classificação arquitetural explícita, não LOC.

| Capacidade macro                  |       P |        E | Anchor/razão                                                                                      |
| --------------------------------- | ------: | -------: | ------------------------------------------------------------------------------------------------- |
| Runtime                           |       1 |      0,5 | `CURRENT_AGENT_RUNTIME.md`: kernel executável, mas path dual e types ainda acoplados              |
| Orchestrator/loop                 |       0 |        0 | `ORCHESTRATION_ANALYSIS.md`: port sem implementação; loop ausente                                 |
| Context                           |     0,5 |        0 | `CONTEXT_ENGINEERING_ANALYSIS.md`: fragmentos sem builder coerente                                |
| Conversation/state                |     0,5 |        0 | `CONVERSATIONAL_ARCHITECTURE.md`: takeover existe; diálogo governado não                          |
| Tools/capabilities                |       1 |      0,5 | `TOOL_CAPABILITY_ARCHITECTURE.md`: três sistemas executáveis exigem unificação                    |
| Skills                            |       0 |        0 | `SKILL_RUNTIME_READINESS.md`: nenhum runtime/loader                                               |
| MCP                               |       0 |        0 | `MCP_READINESS.md`: somente seam conceitual                                                       |
| Model gateway                     |       1 |     0,75 | `MODEL_GATEWAY_ANALYSIS.md`: gateway genérico; prompt/bypass impedem 1                            |
| Memory                            |       0 |        0 | `MEMORY_STATE_ARCHITECTURE.md`: stub sem consumer                                                 |
| Knowledge/evidence                |     0,5 |        0 | `KNOWLEDGE_RUNTIME_ANALYSIS.md`: catálogo aprovado, sem RAG genérico                              |
| Governance (policy/approval/RBAC) |       1 |        1 | `GOVERNANCE_EXTRACTION_ANALYSIS.md`: mecanismo material; catálogo deve ficar no produto           |
| Audit/observability               |     0,5 |      0,5 | `OBSERVABILITY_ANALYSIS.md`: primitives reais, composição volátil                                 |
| Persistence/durability            |       1 |      0,5 | `DURABILITY_ANALYSIS.md`: adapters fortes, ownership/deps precisam split                          |
| Control plane/versioning          |       1 |        0 | `CONTROL_PLANE_ANALYSIS.md`, `VERSIONING_REPRODUCIBILITY.md`: material, porém no `platform` misto |
| Multi-product composition         |       0 |        0 | `MULTI_PRODUCT_REUSE_ANALYSIS.md`: nenhum segundo consumer sem core edit                          |
| **Total**                         | **8,0** | **3,75** | soma das linhas                                                                                   |

Cálculo reproduzível: presença `8,0 / 15 = 53,33%`, reportada como **≈53%**. Extração quase as-is `3,75 / 15 = 25,00%`, reportada como **≈25%**. Ambos são índices coarse desta rubrica; não medem LOC, qualidade, cobertura ou progresso do roadmap. Confiança: **MEDIUM**, porque os anchors são diretos, mas os pesos são adjudicação arquitetural.

## Notas globais independentes

- Produto Secretary: **6/10** (`HIGH`) — controles locais e testes materiais, sem prova atual de produção/integrações reais; evidence: `EXECUTIVE_REPORT.md :: Current State` e `RUNTIME_PERFORMANCE_BASELINE.md` (`NOT_RUN` para baselines não medidos).
- Engine/Harness embutida: **5/10** (`HIGH`) — primitives fortes coexistem com ausências cognitivas e composição dual; evidence: `CURRENT_AGENT_RUNTIME.md`, `ORCHESTRATION_ANALYSIS.md` e matriz acima.
- Prontidão para extração: **4/10** (`HIGH`) — fronteira requer freeze, contract inversion e segundo consumer; evidence: `EXTRACTION_TEST_READINESS.md` e `EXTRACTION_BOUNDARY.md`.

As notas diferem porque maturidade do produto não prova generalidade da engine, e generalidade parcial não prova cutover seguro.

## Decisão, blockers e próxima fase

Decisão coerente com `AUDIT_RESULT.json` e `EXECUTIVE_REPORT.md`: **GO_WITH_PREREQUISITES**. Isto permite preparar, não mover packages.

Blockers impeditivos de extração:

1. snapshot sujo não reproduzível apenas pelo commit;
2. paths de runtime duplos e composição pública canônica não provada;
3. imports TypeScript divergentes dos manifests;
4. ontologia fechada de capabilities/profiles/grants;
5. vocabulários Native/Plugin/Policy fragmentados;
6. audit/trace end-to-end não duráveis;
7. testes cross-package, cutover, rollback e mixed-version ausentes;
8. nenhum segundo cliente não-Secretary demonstrado.

Próxima fase: **PHASE 0 — Evidence Freeze e prova de composição canônica**, conforme `EXTRACTION_ROADMAP.md`; gate de saída inclui candidato pinado e caracterização reproduzível dos dois paths. Até esse gate, não iniciar movimentação de código.
