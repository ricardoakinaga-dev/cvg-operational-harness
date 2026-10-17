# Public API

This reference describes the current workspace exports and composition of the neutral Operational Harness. The Phase 0/1 single-pass API remains available; the public factory also selects a configured iterative runtime. This is an implementation reference, not approval of a production consumer or of the proposed UP91 contracts.

## Workspace entry points

Use package root imports rather than private source paths. These packages are private workspaces in this repository; this reference does not imply a published npm distribution.

| Package                     | Current public surface                                                                                                                                                                                                                                                                             | Role                                                                                                                             |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `@cvg/harness-contracts`    | Branded identities, runtime input/result, budgets, tool/capability descriptors, policy/approval/audit/telemetry ports, iterative decisions and execution contracts                                                                                                                                 | Neutral data and ports; `packages/contracts` is its source directory                                                             |
| `@cvg/harness-orchestrator` | `SinglePassOrchestrator`, `NoopOrchestrator`, `HybridOrchestrator`, `ScriptedOrchestrator`, `StaticOrchestrator`, `ScriptedModelGateway`                                                                                                                                                           | Decision sources and synthetic adapters; decisions do not directly execute tools                                                 |
| `@cvg/harness`              | `createOperationalHarness`, `OperationalHarnessOptions`, capability composition, effect journal, execution spine, context/completion, step store, trajectory, governed runtime classes, and the skills loader/registry (`loadSkillsFromDirectory`, `createSkillRegistry`, `assertSkillsAvailable`) | Canonical consumer composition and supporting implementations                                                                    |
| `@cvg/agent-runtime`        | `GovernedAgentRuntime`, its turn contracts, effect journal, proposal/composition utilities and `ApprovalAuthority` type                                                                                                                                                                            | A distinct turn-oriented kernel; its contracts and journal are not interchangeable with the neutral harness ports                |
| `@cvg/sandbox`              | `detectSandboxCapabilities`, `createLocalSandboxGate`, `runContained`, `createFsTools`, `createShellTool` and their option/result types                                                                                                                                                            | Containment mechanisms behind the `SandboxGate` port (PDSH-010..013); consumers compose a gate value, never fork the enforcement |
| `@cvg/channel-gateway`      | `ChannelGateway`, its channel/effect-journal contracts and the exam-file egress tools `createExamUploadTool` / `createExamDownloadTool` (SSRF-guarded, approval-required, journaled)                                                                                                               | Channel egress behind approved ports (PDSH-016); consumers compose a gateway value, never fork the SSRF/journal enforcement      |
| `@cvg/sdk`                  | `createSdk`/`createSdkMinimal`, JSON-RPC 2.0 v1 (`sdk.hello`, `session.open`, `turn.send`, `session.events`), typed client, in-process and stdio transports                                                                                                                                        | Integrator SDK over the supported exports (PDSH-023); versioned protocol; host supplies connection streams                       |

Authoritative exports: [harness](../../packages/harness/src/index.ts), [contracts](../../packages/contracts/src/index.ts), [orchestrator](../../packages/orchestrator/src/index.ts), [sandbox](../../packages/sandbox/src/index.ts), [channel gateway](../../packages/channel-gateway/src/index.ts), [agent runtime](../../packages/agent-runtime/src/index.ts) and the [integrator SDK](../../packages/sdk/src/index.ts). The extracted `runtime-effect-recovery`, `runtime-approval-request`, `runtime-effect-identity` and `runtime-execution-context` modules are internal, not new barrel exports.

## Superfície suportada para consumidores (HISO-009)

Esta seção publica, para o cartão [HISO-009](../03_build/0370_harness_product_isolation_backlog.md#hiso-009--validar-consumo-por-interfaces-públicas-suportadas) e os itens B2/B3 do [plano 0374](../03_build/0374_plano_producao_harness.md), quais exports um consumidor do harness pode usar. Foi derivada dos entrypoints atuais dos pacotes e do código lido nesta revisão. Não concede release, piloto, dado real nem aceite do isolamento.

As tabelas marcadas abaixo são a fonte única da lista. [`tests/consumers-public-surface.test.ts`](../../tests/consumers-public-surface.test.ts) lê esta seção e falha se um nome listado deixar de existir no entrypoint do pacote, se um pacote listado publicar subcaminhos em `exports` ou se o exemplo neutro importar algo fora da lista. Remover ou mudar de forma incompatível um export `estável` exige SPEC, o gate aplicável e a atualização desta seção e do teste no mesmo commit.

### Regras de importação

- Importe somente a raiz do pacote, por exemplo `@cvg/harness`. Cada pacote listado declara apenas `"."` em `exports`, com `dist/index.js` e `dist/index.d.ts` gerados a partir de `src/index.ts`.
- Não são suportados: imports profundos (`@cvg/harness/src/...`, `@cvg/harness/capability-boundary.js`, `@cvg/harness/dist/...`), que o Node recusa com `ERR_PACKAGE_PATH_NOT_EXPORTED`; caminhos relativos para `packages/*/src`; e aliases que apontem para fontes como contrato de consumo. Os `paths` de `tsconfig.base.json` e os aliases do Vitest servem ao desenvolvimento deste monorepo; um consumidor isolado compila contra os pacotes construídos com `paths: {}`, como faz `scripts/build-public-workspace.mjs`.
- Um nome exportado pelo entrypoint que não aparece nas tabelas não é suportado para consumidores, mesmo sendo importável.
- Há nomes iguais com contratos diferentes. `ModelGateway`, `ModelResult` e `ModelMessage` existem em `@cvg/harness-contracts` (porta `complete` do runtime) e em `@cvg/model-gateway` (gateway de provedores `generate`). `PolicyEngine` e `ApprovalEngine` existem também em `@cvg/policy-engine` e `@cvg/approval-engine` como implementações que não satisfazem diretamente as portas do harness. A autorização de capability tem uma única engine canônica: a classe `PolicyEngine` de `@cvg/policy-engine`. `@cvg/policy` não é uma segunda engine — é a camada legada de autonomia de turno e comandos de approval usada por `@cvg/agent-core` (`evaluatePolicy`, `ApprovalService`). Use alias na importação para distinguir a porta de `@cvg/harness-contracts` da implementação, como faz o exemplo da recepção.

### Estabilidade

| Rótulo            | Significado                                                                                                                                                                                     |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `estável`         | Contrato de consumo. Remoção ou mudança incompatível exige SPEC, revisão no gate aplicável e atualização desta seção e do teste.                                                                |
| `compatibilidade` | Mantido para consumidores existentes. Consumidor novo usa a alternativa indicada.                                                                                                               |
| `experimental`    | Utilizável em composição sintética; o contrato pode mudar pelas SPECs pendentes ([SPEC0166](../02_spec/0166_governed_context_response_budget.md), SPEC0167) sem compromisso de compatibilidade. |
| `sintético`       | Implementação em memória ou determinística para testes, exemplos e demos. Não é evidência de durabilidade, isolamento de tenant ou produção.                                                    |
| `host`            | Adaptador durável para composições de host com PostgreSQL, migrações, papéis e contexto de tenant. A prova de durabilidade vem das suítes PostgreSQL, não desta lista.                          |

### `@cvg/harness-contracts`

<!-- supported-exports:@cvg/harness-contracts -->

| Export                                                                                                                            | Tipo  | Finalidade                                                                                                 | Estabilidade      |
| --------------------------------------------------------------------------------------------------------------------------------- | ----- | ---------------------------------------------------------------------------------------------------------- | ----------------- |
| `RuntimeInput`                                                                                                                    | tipo  | Entrada de um turno: perfil, identidades, mensagem, contexto, estado, orçamento e `requestedTool` opcional | `estável`         |
| `RuntimeResult`                                                                                                                   | tipo  | Resultado: resposta, `stopReason`, contadores, uso e `approvalId`/`toolResult` opcionais                   | `estável`         |
| `StopReason`                                                                                                                      | tipo  | União fechada dos motivos de parada                                                                        | `estável`         |
| `STOP_REASONS`                                                                                                                    | valor | Lista dos motivos de parada em tempo de execução                                                           | `estável`         |
| `RuntimeProfile`                                                                                                                  | tipo  | `single_pass` ou `iterative`                                                                               | `estável`         |
| `RUNTIME_PROFILES`                                                                                                                | valor | Lista dos perfis em tempo de execução                                                                      | `estável`         |
| `AgentProfile`                                                                                                                    | tipo  | Objetivo, instruções, skills, capacidades expostas (`tools`, deny-by-default) e políticas                  | `estável`         |
| `ExecutionBudget`                                                                                                                 | tipo  | Orçamento obrigatório do turno: passos, chamadas de modelo e ferramenta, duração, custo e tokens           | `estável`         |
| `ContextSnapshot`, `StateSnapshot`                                                                                                | tipo  | Contexto com fontes e estado versionado do turno                                                           | `estável`         |
| `AgentId`, `AgentVersion`, `TenantId`, `ConversationId`, `SessionId`, `CorrelationId`, `TraceId`, `ApprovalId`                    | tipo  | Identidades com marca de compilação; não validam nem autenticam em execução                                | `estável`         |
| `CapabilityRegistration`, `CapabilityDescriptor`, `CapabilityImplementation`                                                      | tipo  | Registro de capacidade: descritor só de dados e implementação com validação de entrada e saída             | `estável`         |
| `CapabilityRegistry`                                                                                                              | tipo  | Porta do registro imutável aceito pela opção `capabilities`                                                | `estável`         |
| `CapabilityOrigin`, `RiskLevel`, `SideEffect`                                                                                     | tipo  | Metadados de governança do descritor                                                                       | `estável`         |
| `ToolInvocation`, `ToolResult`, `ToolExecutionContext`, `ToolDescriptor`                                                          | tipo  | Invocação, resultado, contexto de execução e descritor sem `execute`                                       | `estável`         |
| `ToolDefinition`, `ToolRegistry`                                                                                                  | tipo  | Registro executável da opção `tools`; preferir `CapabilityRegistry`                                        | `compatibilidade` |
| `Orchestrator`, `OrchestratorInput`, `OrchestratorDecision`, `OrchestratorAction`                                                 | tipo  | Porta de decisão do perfil single-pass; decide e não executa                                               | `estável`         |
| `ModelGateway`, `ModelRequest`, `ModelResult`, `ModelMessage`                                                                     | tipo  | Porta de modelo do runtime (`complete`), fronteira da ADR-004 no harness                                   | `estável`         |
| `PolicyEngine`, `PolicyRequest`, `PolicyDecision`, `PolicyOutcome`                                                                | tipo  | Porta de política: `ALLOW`, `DENY`, `REQUIRE_APPROVAL` ou `HANDOFF`, com `policyVersion`                   | `estável`         |
| `ApprovalEngine`, `ApprovalRequest`, `ApprovalDecision`, `ApprovalStatus`                                                         | tipo  | Porta de aprovação: `APPROVED`, `DENIED` ou `PENDING`                                                      | `estável`         |
| `ApprovalExecutionPort`, `ApprovalExecutionRequest`, `ApprovalExecutionHandle`                                                    | tipo  | Ciclo de uso único da aprovação, exigido para executar um efeito aprovado                                  | `estável`         |
| `AuditSink`, `AuditEvent`                                                                                                         | tipo  | Auditoria por turno, com falha fechada                                                                     | `estável`         |
| `TelemetrySink`, `TelemetryEvent`                                                                                                 | tipo  | Telemetria por turno; falha do sink não altera o resultado                                                 | `estável`         |
| `IterativeOrchestrator`, `ExecutionStepStore`                                                                                     | tipo  | Portas do perfil iterativo                                                                                 | `experimental`    |
| `SESSION_EVENT_CATALOG_V1`                                                                                                        | valor | Schemas v1 imutáveis dos nove tipos de evento, fonte dos fingerprints                                      | `experimental`    |
| `canonicalizeJson`, `CanonicalJsonError`, `CANONICAL_JSON_MAX_DEPTH`, `CANONICAL_JSON_MAX_NODES`                                  | valor | Implementação canônica pura única; shared conserva re-export compatível do mesmo objeto                    | `experimental`    |
| `SessionEventStore`, `SessionStream`, `SessionEventAppend`, `SessionEvent`, `SessionEventRead`, `SessionEventType`, `SessionJson` | tipo  | Porta neutra open/append/read, envelope versionado e JSON de sessão (SPEC0202)                             | `experimental`    |

<!-- /supported-exports -->

### `@cvg/harness`

<!-- supported-exports:@cvg/harness -->

| Export                                                                                                                               | Tipo  | Finalidade                                                                                                                 | Estabilidade      |
| ------------------------------------------------------------------------------------------------------------------------------------ | ----- | -------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `createOperationalHarness`                                                                                                           | valor | Raiz canônica de composição; valida registro e journal e resolve o perfil                                                  | `estável`         |
| `OperationalHarness`, `OperationalHarnessOptions`                                                                                    | tipo  | Objeto retornado (`run`, `execute`, `resolveProfile`, `capabilityFingerprint`) e opções da fábrica                         | `estável`         |
| `createCapabilityRegistry`                                                                                                           | valor | Cria o registro imutável; valida descritor, implementação e duplicidade                                                    | `estável`         |
| `composeCapabilities`                                                                                                                | valor | Cria o registro e devolve a impressão digital da composição                                                                | `estável`         |
| `CapabilityComposition`                                                                                                              | tipo  | Retorno de `composeCapabilities`                                                                                           | `estável`         |
| `CapabilityRegistryError`                                                                                                            | valor | Erro de registro inválido ou duplicado                                                                                     | `estável`         |
| `CapabilityRegistryErrorCode`                                                                                                        | tipo  | Códigos de `CapabilityRegistryError`                                                                                       | `estável`         |
| `EffectJournal`, `EffectJournalRecord`, `EffectJournalState`                                                                         | tipo  | Porta do journal de efeitos: reserva, início, confirmação, falha e incerteza                                               | `estável`         |
| `EffectJournalError`                                                                                                                 | valor | Erro de entrada inválida do journal                                                                                        | `estável`         |
| `ALL_AGENT_TOOLS`, `agentExposesTool`                                                                                                | valor | Curinga explícito e regra deny-by-default de exposição de capacidades ao perfil                                            | `estável`         |
| `InMemoryEffectJournal`                                                                                                              | valor | Journal no processo                                                                                                        | `sintético`       |
| `InMemoryExecutionStepStore`                                                                                                         | valor | Step store no processo para o perfil iterativo                                                                             | `sintético`       |
| `SinglePassGovernedRuntime`, `IterativeGovernedRuntime`                                                                              | valor | Runtimes para composição de baixo nível; usar `createOperationalHarness`                                                   | `compatibilidade` |
| `loadSkillsFromDirectory`                                                                                                            | valor | Carrega e valida manifestos `skill.json` de `skills/`; fail-closed (erros coletados)                                       | `experimental`    |
| `SkillManifestLoadError`, `SkillManifestLoadResult`                                                                                  | tipo  | Erro por manifesto e retorno do carregador (`ok` + `skills` ou `ok` + `errors`)                                            | `experimental`    |
| `createSkillRegistry`                                                                                                                | valor | Registro em memória com lookup por id; id duplicado → throw                                                                | `experimental`    |
| `SkillRegistry`                                                                                                                      | tipo  | Contrato do registro (`get`, `list`)                                                                                       | `experimental`    |
| `assertSkillsAvailable`                                                                                                              | valor | Valida `SkillRequirement[]` de um perfil contra o registro; faltantes → throw                                              | `experimental`    |
| `InMemorySessionEventStore`                                                                                                          | valor | Store append-only no processo para fixtures e replay; não durabilidade entre processos                                     | `sintético`       |
| `createSessionKernelLog`                                                                                                             | valor | Adapter do log do kernel para uma sessão/turno vinculados; composição repassa options.log                                  | `experimental`    |
| `SessionKernelLogOptions`                                                                                                            | tipo  | Store, tenant/session/correlation/trace e fábricas de ID/clock de composição                                               | `experimental`    |
| `SessionEventError`, `SESSION_EVENT_MAX_BYTES`                                                                                       | valor | Códigos estáveis de sessão e limite de evento de 1 MiB                                                                     | `experimental`    |
| `sessionEventFingerprint`, `sessionEventInputDigest`                                                                                 | valor | SHA-256 de schema/input pelo shared canonical; sem promessa de assinatura                                                  | `experimental`    |
| `validateSessionStream`, `validateSessionEventAppend`, `validateSessionEvent`, `validateSessionEventRead`, `materializeSessionEvent` | valor | Validação fail-closed/snapshot e materialização de envelope para adapters de store                                         | `experimental`    |
| `createSessionFormatRegistry`, `sessionFormatDefinitionV1`, `SessionFormatMigrationError`                                            | valor | Registry de migrações adjacentes vN→vN+1 (boot fail-closed) e definição v1; migração é visão derivada, nunca muta a origem | `experimental`    |
| `SessionFormatRegistry`, `SessionFormatDefinition`, `SessionFormatStep`, `SessionFormatEvent`                                        | tipo  | Contratos da evolução de formato de sessão: versões fechadas, passos adjacentes e erros estáveis                           | `experimental`    |

<!-- /supported-exports -->

O entrypoint também exporta, sem suporte para consumidores: o kernel de plugins da SPEC 0181 (`KernelRuntime`, `KernelHost`, `createKernelRuntime`, `standardKernelPlugins`, os `*Control`/`*Capability`, `InMemoryPauseSwitch`, `InMemoryKernelLog`, `InMemoryEffectLedger`); a spine de execução durável usada por API e worker (`OperationalExecutionWorker`, `InMemoryOperationalExecutionStore`, `parseExecutionSubmission`, `deriveExecutionResume`, `classifyRuntimeResult` e afins); checkpoints, trajetória, contexto e avaliação do perfil iterativo (`sealCheckpoint`, `validateCheckpointIntegrity`, `readExecutionTrajectory`, `createContextEngine`, `createCompletionEvaluator`, `createModelCompletionJudge` e afins); a classe `CapabilityRegistry` (usar `createCapabilityRegistry`); e utilitários como `createJournaledToolRegistry`, que a fábrica já aplica.

### `@cvg/sdk`

<!-- supported-exports:@cvg/sdk -->

| Export                                                                                                                                                                                                                                                               | Tipo  | Finalidade                                                                                         | Estabilidade   |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | -------------------------------------------------------------------------------------------------- | -------------- |
| `createSdk`, `createSdkMinimal`                                                                                                                                                                                                                                      | valor | Composições do SDK: sessão completa (abre sessão, envia turno, lê eventos) e mínima sem sessão     | `experimental` |
| `createSdkServer`                                                                                                                                                                                                                                                    | valor | Servidor JSON-RPC 2.0 v1 (`sdk.hello`, `session.open`, `turn.send`, `session.events`); nunca lança | `experimental` |
| `createSdkClient`, `createInProcessTransport`, `SdkClientError`                                                                                                                                                                                                      | valor | Cliente TS tipado (erro com `code`), transporte em processo e classe de erro do cliente            | `experimental` |
| `SDK_PROTOCOL_VERSION`, `SDK_METHODS`, `SDK_ERROR_CODES`                                                                                                                                                                                                             | valor | Versão do protocolo, vocabulário de métodos e códigos estáveis (JSON-RPC + 1001..1003)             | `experimental` |
| `SdkServer`, `SdkServerOptions`, `SdkClient`, `SdkTransport`, `SdkFacade`, `SdkMinimalFacade`, `SdkCompositionOptions`, `SdkMinimalOptions`, `SdkCapabilities`, `SdkReadEventsOptions`                                                                               | tipo  | Portas, opções e facades de composição                                                             | `experimental` |
| `SdkHelloParams`, `SdkHelloResult`, `SessionOpenParams`, `SessionOpenResult`, `TurnSendParams`, `TurnSendResult`, `SessionEventsParams`, `SessionEventsResult`, `JsonRpcRequest`, `JsonRpcResponse`, `JsonRpcSuccess`, `JsonRpcFailure`, `SdkMethod`, `SdkErrorCode` | tipo  | Envelope e payloads versionados do protocolo                                                       | `experimental` |

| `createStdioSdkTransport`, `serveStdioSdk` | valor | Transporte e servidor stdio JSON-RPC v1 com framing, limites, lifecycle e validação correlacionada (SPEC0211) | `experimental` |
| `SdkWireError`, `SDK_TRANSPORT_ERROR_CODES` | valor | Falha de transporte com outcome/retrySafe conservadores e códigos próprios, preservando erros v1 | `experimental` |
| `StdioTransportOptions`, `StdioSdkTransport`, `StdioServerOptions`, `StdioSdkServer`, `SdkWireErrorKind` | tipo | Streams do host, bounds, fechamento e categorias de erro do stdio | `experimental` |

<!-- /supported-exports -->

### `@cvg/harness-orchestrator`

<!-- supported-exports:@cvg/harness-orchestrator -->

| Export                                       | Tipo  | Finalidade                                                                                       | Estabilidade |
| -------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------ | ------------ |
| `SinglePassOrchestrator`                     | valor | Orquestrador padrão da fábrica: chama a capacidade de `requestedTool` ou pede resposta ao modelo | `estável`    |
| `NoopOrchestrator`                           | valor | Responde `Acknowledged.` sem modelo nem ferramenta                                               | `sintético`  |
| `ScriptedOrchestrator`, `StaticOrchestrator` | valor | Decisões roteirizadas para o perfil iterativo em testes                                          | `sintético`  |
| `ScriptedModelGateway`                       | valor | Implementação roteirizada da porta `ModelGateway.complete`                                       | `sintético`  |

<!-- /supported-exports -->

`HybridOrchestrator` e `OrchestratorDecisionError` pertencem ao orquestrador iterativo dirigido por modelo e não fazem parte desta lista.

### `@cvg/sandbox`

<!-- supported-exports:@cvg/sandbox -->

| Export                                           | Tipo  | Finalidade                                                                                                                     | Estabilidade   |
| ------------------------------------------------ | ----- | ------------------------------------------------------------------------------------------------------------------------------ | -------------- |
| `detectSandboxCapabilities`                      | valor | Resolve uma vez o que a plataforma contém (bwrap fecha namespace; Landlock heurístico)                                         | `experimental` |
| `createLocalSandboxGate`                         | valor | Implementação local da porta `SandboxGate` (SPEC 0195/0196): matriz de modos, fallback `partial` auditável                     | `experimental` |
| `runContained`                                   | valor | Executa argv dentro de um namespace bubblewrap com o handle concedido (timeout, `spawn_failed`)                                | `experimental` |
| `createFsTools`                                  | valor | Família `fs.read`/`fs.list`/`fs.write`/`fs.edit` confinada ao workspace do tenant, com gate de intenção e journal              | `experimental` |
| `createShellTool`                                | valor | Tool `shell.run` limitada: argv puro (sem interpolação), contenção `PROCESS`, timeout, cwd confinado, aprovação                | `experimental` |
| `confinePath`                                    | valor | Resolve caminhos relativos sob a raiz real do workspace, recusando escapes, symlinks externos e namespace temporário reservado | `experimental` |
| `SandboxCapabilities`, `SandboxProbe`            | tipo  | Resultado da detecção e sonda injetável (testes não dependem do host)                                                          | `experimental` |
| `LocalSandboxGateOptions`, `SandboxJournalEntry` | tipo  | Opções do gate local (capabilities injetáveis, base do workspace, deny, journal) e entrada do journal de decisões              | `experimental` |
| `ContainedRunRequest`, `ContainedRunResult`      | tipo  | Pedido e resultado da execução contida (argv array, limites de saída)                                                          | `experimental` |
| `FsToolsOptions`, `FsLimits`                     | tipo  | Raiz do workspace, journal de escrita, `requireWriteJournal` e limites da tool fs                                              | `experimental` |
| `FsWriteJournal`, `FsWriteJournalEntry`          | tipo  | Ledger dedicado de intenções de escrita pré-mutação, correlacionável por `operationKey`+`tenantId`                             | `experimental` |
| `ShellToolOptions`, `ShellLimits`                | tipo  | Raiz do workspace, runner injetável e limites da tool shell (args, timeout, saída, stdin, intent)                              | `experimental` |
| `ShellRunRequest`, `ShellRunResult`              | tipo  | Pedido/resultado do backend de execução injetável (argv puro, cwd absoluto confinado)                                          | `experimental` |

<!-- /supported-exports -->

O entrypoint também exporta o `hostProbe` (sonda do host para detecção); consumidores devem chamar `detectSandboxCapabilities()` em vez de inspecionar a plataforma diretamente.

### `@cvg/channel-gateway`

<!-- supported-exports:@cvg/channel-gateway -->

| Export                   | Tipo  | Finalidade                                                                                                                       | Estabilidade   |
| ------------------------ | ----- | -------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| `createExamUploadTool`   | valor | Tool `exam.upload`: leitura confinada do workspace + POST para endpoint HTTPS allow-listado, com SSRF guard, aprovação e journal | `experimental` |
| `createExamDownloadTool` | valor | Tool `exam.download`: GET de endpoint HTTPS allow-listado + escrita atômica confinada, com SSRF guard, aprovação e journal       | `experimental` |
| `ExamEgressOptions`      | tipo  | Raiz do workspace, journal de efeitos, allowlist de hosts (obrigatória), `requireApproval` e limites/timeout/runner injetáveis   | `experimental` |

<!-- /supported-exports -->

### `@cvg/model-gateway`

<!-- supported-exports:@cvg/model-gateway -->

| Export                                                                                            | Tipo  | Finalidade                                                                                                                                                                           | Estabilidade |
| ------------------------------------------------------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------ |
| `ModelGateway`                                                                                    | valor | Gateway de provedores (`generate`): schema, prompt aprovado, roteamento por perfil e classificação, orçamento de custo, timeout, retry, fallback, circuit breaker, saída estruturada | `estável`    |
| `ModelGatewayOptions`, `GenerateRequest`, `ModelProfile`, `ModelProfileName`, `ModelGatewayEvent` | tipo  | Opções, pedido, perfis e eventos (`onEvent`) do gateway                                                                                                                              | `estável`    |
| `ModelResult`                                                                                     | tipo  | Resultado de `generate`; difere de `ModelResult` da porta do harness                                                                                                                 | `estável`    |
| `PromptRegistry`                                                                                  | valor | Registro versionado de prompts aprovados, vigentes e com hash                                                                                                                        | `estável`    |
| `computePromptSha256`                                                                             | valor | Hash SHA-256 do conteúdo do prompt                                                                                                                                                   | `estável`    |
| `CostBudgetLimits`, `CostBudgetStore`                                                             | tipo  | Limites de custo por escopo e porta de armazenamento do orçamento                                                                                                                    | `estável`    |
| `InMemoryCostBudgetStore`                                                                         | valor | Orçamento de custo no processo                                                                                                                                                       | `sintético`  |
| `ModelProvider`, `ProviderRequest`, `ProviderResult`                                              | tipo  | Porta de transporte de provedor (`execute`)                                                                                                                                          | `estável`    |
| `OpenAICompatibleProvider`                                                                        | valor | Adaptador HTTP OpenAI-compatível com guarda SSRF, host e protocolo                                                                                                                   | `estável`    |
| `OllamaProvider`                                                                                  | valor | Adaptador HTTP para Ollama local com guarda SSRF                                                                                                                                     | `estável`    |
| `DeterministicModelProvider`                                                                      | valor | Provedor sem rede, com `externalCall: false`                                                                                                                                         | `sintético`  |
| `ModelGatewayError`, `ModelProviderError`                                                         | valor | Erros tipados do gateway e dos provedores                                                                                                                                            | `estável`    |

<!-- /supported-exports -->

Schemas zod, `ModelRouter`, `BudgetGuard`, `CircuitBreaker`, retry e utilitários de rede também são exportados, mas são detalhes do gateway e não fazem parte desta lista.

### `@cvg/persistence` (adaptadores duráveis das portas)

<!-- supported-exports:@cvg/persistence -->

| Export                             | Tipo  | Finalidade                                                                                                 | Estabilidade |
| ---------------------------------- | ----- | ---------------------------------------------------------------------------------------------------------- | ------------ |
| `PostgresOperationalEffectJournal` | valor | `EffectJournal` em PostgreSQL                                                                              | `host`       |
| `PostgresExecutionStepStore`       | valor | `ExecutionStepStore` em PostgreSQL                                                                         | `host`       |
| `DurableApprovalEngineAdapter`     | valor | `ApprovalEngine` com porta `execution` de uso único sobre `ApprovalAuthority`                              | `host`       |
| `PostgresApprovalAuthority`        | valor | `ApprovalAuthority` durável em PostgreSQL                                                                  | `host`       |
| `PostgresSessionEventStore`        | valor | Store append-only tenant/schema-bound, transação por append, replay e RLS                                  | `host`       |
| `runSessionEventMigrations`        | valor | Migração0028 opt-in em schema dedicado, runner/checksum existente; executar só como autoridade de migração | `host`       |

<!-- /supported-exports -->

O restante de `@cvg/persistence` (repositórios, schemas e infraestrutura de API/worker) não faz parte desta lista.

### Pacotes sem superfície de consumo nesta revisão

- `@cvg/adapters`: o manifesto aponta `main` e `types` para `src/index.ts`, sem `exports` nem build, e o pacote reúne fakes do Test Lab (`FakeWhatsAppAdapter`, `ControlledModelAdapter`, `ControlledDeliveryAdapter`). Nenhum deles implementa uma porta de `@cvg/harness-contracts`. Os adaptadores de modelo suportados são os provedores de `@cvg/model-gateway`.
- `@cvg/agent-runtime`, `@cvg/approval-engine` e `@cvg/observability`: servem ao kernel por turno (`GovernedAgentRuntime`) e aos hosts; suas classes não são as portas de `createOperationalHarness`. `@cvg/agent-runtime` continua descrito acima como superfície distinta, sem compromisso de estabilidade para consumidores novos.
- `@cvg/policy-engine`: é a engine canônica de autorização de capability (catálogo, grants, teto de papel e documentos versionados) usada pelo kernel por turno e pelos hosts. A classe `PolicyEngine` é uma implementação da autorização, não a porta `policy` de `createOperationalHarness` (ver contrato de composição abaixo); o adaptador que satisfaça a porta é do compositor. Consumidores novos de autorização importam daqui; a camada `@cvg/policy` é legada (autonomia/approval do `agent-core`).
- Os demais workspaces são infraestrutura interna ou legado.

### Contrato de composição

`createOperationalHarness(options)` não abre rede, banco, canal nem credencial. O consumidor fornece as portas:

| Opção                                                                                                  | Obrigatória                      | O que o consumidor fornece                                                                       | Implementações no repositório                                                                                  |
| ------------------------------------------------------------------------------------------------------ | -------------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `modelGateway`                                                                                         | sim                              | `complete(ModelRequest)` devolvendo texto, provedor, modelo, tokens e custo                      | `ScriptedModelGateway` (`sintético`); ponte para `@cvg/model-gateway` é do consumidor (ver abaixo)             |
| `policy`                                                                                               | sim                              | `evaluate(PolicyRequest)` com `ALLOW`, `DENY`, `REQUIRE_APPROVAL` ou `HANDOFF` e `policyVersion` | nenhuma nos pacotes neutros; a engine canônica de capability (`@cvg/policy-engine`) é adaptada pelo compositor |
| `approvals`                                                                                            | sim                              | `request(ApprovalRequest)`; `execution` é necessária para executar efeito aprovado               | `DurableApprovalEngineAdapter` (`host`)                                                                        |
| `capabilities` ou `tools`                                                                              | exatamente uma                   | `createCapabilityRegistry([...])` (recomendado) ou `ToolRegistry` (`compatibilidade`)            | —                                                                                                              |
| `effectJournal`                                                                                        | sim com `capabilities`           | `EffectJournal`                                                                                  | `InMemoryEffectJournal` (`sintético`), `PostgresOperationalEffectJournal` (`host`)                             |
| `audit`                                                                                                | sim                              | `append(AuditEvent)`                                                                             | —                                                                                                              |
| `telemetry`                                                                                            | sim                              | `record(TelemetryEvent)`                                                                         | —                                                                                                              |
| `log`                                                                                                  | não                              | `KernelLog`, por exemplo createSessionKernelLog para stream previamente aberto e turno vinculado | `InMemoryKernelLog`, `createSessionKernelLog`                                                                  |
| `orchestrator`                                                                                         | não                              | `Orchestrator`; padrão `SinglePassOrchestrator`                                                  | `SinglePassOrchestrator`, `NoopOrchestrator`                                                                   |
| `iterativeOrchestrator` e `stepStore`                                                                  | ambas, para o perfil `iterative` | `IterativeOrchestrator` e `ExecutionStepStore` (`experimental`)                                  | `InMemoryExecutionStepStore` (`sintético`), `PostgresExecutionStepStore` (`host`)                              |
| `contextEngine`, `knowledge`, `sufficiencyEvaluator`, `completionEvaluator`, `claimExtractor`, `clock` | não                              | Alimentam apenas o perfil iterativo configurado                                                  | —                                                                                                              |

`pause`, `log` e `effects` são aceitos por `OperationalHarnessOptions` e encaminhados pela fábrica aos perfis single_pass e iterative. Portas ausentes usam os padrões do kernel. A SPEC0212 também encaminha sandbox ao perfil iterativo; as evidências de aceite desta correção continuam em verificação nesta candidata.

O harness garante, no perfil single-pass atual:

1. Identidade e orçamento inválidos param em `UNSAFE_REQUEST`; `maxSteps` ou `maxDurationMs` menores que 1 param antes do primeiro passo.
2. O orquestrador recebe só descritores, sem `execute`, das capacidades expostas por `agent.tools` (deny-by-default; `*` expõe tudo explicitamente).
3. Toda chamada de capacidade passa pela política. `REQUIRE_APPROVAL` ou `requiresApproval: true` sempre pedem aprovação, mesmo com `ALLOW`. `PENDING` vira `APPROVAL_REQUIRED`, `DENIED` vira `POLICY_DENIED`, `HANDOFF` vira `HUMAN_TAKEOVER`; em todos esses casos nada é executado.
4. Um efeito aprovado só roda com `approvals.execution`; sem essa porta, ou sem `approvalId`, o turno falha fechado.
5. Com capacidades, a implementação valida entrada e saída, campos de autoridade (`tenantId`, `agentId`, `correlationId`, `traceId`) na entrada precisam coincidir com o contexto, e o journal reserva e confirma por `tenantId` e `operationKey`. Repetir uma operação confirmada com a mesma proposta devolve o resultado gravado sem reexecutar; a mesma `operationKey` com outra proposta é recusada.
6. Cada turno grava um evento de auditoria; falha ou atraso do sink vira `INSUFFICIENT_EVIDENCE`. Cada turno grava um evento de telemetria; falha do sink é ignorada.
7. O modelo só é chamado por `modelGateway.complete`, com `maxModelCalls` e prazo verificados antes e `maxTokens` (entrada + saída), `maxCostUsd` e prazo verificados depois da resposta.

O harness não garante durabilidade com implementações `sintético`, autenticação de tenant ou operador (responsabilidade do host) nem pisos obrigatórios de risco em toda composição; ver [Governance and current limits](#governance-and-current-limits).

### ADR-004: porta do harness, gateway de provedores e adaptador direto

A [ADR-004](adrs/ADR-004-model-gateway-mandatory.md) exige que o runtime neutro chame modelos só por `ModelGateway.complete`. Há três camadas com nomes parecidos:

| Caminho                                                            | Orçamento                                                                                         | Telemetria e auditoria                                                                | Prompt e classificação                                                                 | Timeout                                                          |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Porta `ModelGateway.complete` dentro de `createOperationalHarness` | `ExecutionBudget` do turno (chamadas, tokens, custo, duração)                                     | Evento de telemetria e de auditoria por turno                                         | Não verifica; depende da implementação da porta                                        | Prazo do turno; o sinal da requisição é abortado ao estourar     |
| `ModelGateway.generate` de `@cvg/model-gateway`                    | `budget.limits` por escopo (`request`, `session`, `tenant`, `agent`, `day`) com `CostBudgetStore` | Eventos `model.call.*`, `model.retry.*`, `model.budget.denied` e outros via `onEvent` | Prompt registrado, aprovado, vigente e com hash; roteamento por classificação de dados | `timeoutMs` do pedido ou do perfil, mais retry e circuit breaker |
| `ModelProvider.execute` chamado diretamente                        | nenhum                                                                                            | nenhuma                                                                               | nenhum                                                                                 | Sinal e `timeoutMs` passados pelo chamador                       |

Fatos relevantes desta revisão:

- Não há no repositório adaptador pronto da porta `complete` para `generate`. O consumidor que quer as duas camadas escreve a ponte; o [exemplo da recepção](../../examples/consumers/reception-agent/README.md) mostra uma. `ModelRequest` não carrega tenant, então a ponte é criada por tenant na composição.
- `maxCostUsd` do pedido e do perfil de `@cvg/model-gateway` é aceito pelo schema, mas `generate()` não o aplica nesta revisão; o teto efetivo é `budget.limits`. No harness, `maxCostUsd` é verificado depois da resposta, quando o custo já ocorreu.
- A classificação `CLINICAL`, `FINANCIAL` ou `CREDENTIAL` não pode ir a nenhum modelo pelo roteador do gateway; `CONFIDENTIAL` só vai a perfil local.
- Chamado diretamente, um provedor aplica apenas o próprio adaptador: guarda SSRF de host e protocolo, sinal combinado com `timeoutMs`, validação do contrato JSON da resposta e limite de bytes verificado depois de ler o corpo (correção pendente em [HISO-011](../03_build/0370_harness_product_isolation_backlog.md#hiso-011--limitar-recepção-do-transporte-de-modelo)).

### Decisão registrada: consumidor atual `products/shift-assistant`

Fatos lidos em `products/shift-assistant/src/compose.ts`, `src/organizer.ts` e `package.json` nesta revisão:

- O produto depende de `@cvg/model-gateway` e `zod`. Importa `OpenAICompatibleProvider` (valor) e `ModelProvider` (tipo). Não importa `@cvg/harness` nem `@cvg/harness-contracts` e não compõe `createOperationalHarness`, `ModelGateway.complete` nem `ModelGateway.generate`.
- `ModelOrganizer.organize` chama `OpenAICompatibleProvider.execute` com `tenantId: 'cvg'`, `temperature: 0`, `maxTokens: 1500`, `structuredSchemaName: 'shift_note'` e `AbortSignal.timeout` de 60 s por padrão. O produto remove cercas de código da resposta e valida o JSON com o próprio schema `OrganizedSchema`.

Decisão de contrato (T1), sem alteração do produto:

1. Esse uso é consumo suportado de adaptador público: `OpenAICompatibleProvider` e `ModelProvider` estão na tabela de `@cvg/model-gateway`.
2. Nesse caminho valem só as garantias do adaptador. Orçamento de custo, retry, circuit breaker, prompt registrado, roteamento por classificação, eventos do gateway e orçamento, auditoria e telemetria do harness não se aplicam. Esses controles ficam com o produto e sua barra 0368.
3. Migrar o organizador para `ModelGateway.generate` ou para `createOperationalHarness` com `ModelGateway.complete` muda comportamento observável: o timeout passa a ser o do pedido ou do perfil; há tentativas extras e fallback conforme o perfil; o orçamento pode negar com `budget_exceeded`; `tenantId: 'cvg'` não passa no schema `tenant_<uuid>` e o prompt precisa estar registrado e aprovado; conteúdo classificado como `CLINICAL` é recusado para qualquer modelo; a saída estruturada do gateway faz `JSON.parse` do texto bruto, sem remover cercas; e surgem eventos novos. Por isso a migração exige SPEC própria, gate T3/G3 conforme HISO-009, revisão do produto e preservação da forma `Organized` da saída estruturada. Ela não foi feita nesta entrega.

### Exemplo de consumidor neutro

[`examples/consumers/reception-agent`](../../examples/consumers/reception-agent/README.md) compõe um agente sintético de recepção de hospital veterinário só com nomes destas tabelas. Uma capacidade de leitura responde a partir de fonte institucional fixa; um pedido de horário termina em `APPROVAL_REQUIRED` sem executar efeito; uma pergunta clínica termina em `HUMAN_TAKEOVER`. Não usa canal de mensagens, paciente, rede ou dado real. [`tests/consumers-reception-agent.test.ts`](../../tests/consumers-reception-agent.test.ts) executa a jornada.

## Compose a consumer

[`createOperationalHarness`](../../packages/harness/src/createOperationalHarness.ts) accepts model, policy, approval, audit and telemetry ports plus exactly one explicit registry:

- `tools`: the compatibility `ToolRegistry` port. An effect journal is optional on this existing path.
- `capabilities`: the explicit `CapabilityRegistry` port. This path requires an explicit `effectJournal`.

Supplying both registries, neither registry, or capabilities without a journal throws during construction. `createCapabilityRegistry` and `composeCapabilities` build the immutable capability composition; its fingerprint is calculated by the registry, not supplied as an arbitrary factory option. The factory resolves the capability adapter and applies the journal wrapper when configured.

The returned `OperationalHarness` exposes:

| Member                   | Behavior                                                                          |
| ------------------------ | --------------------------------------------------------------------------------- |
| `run(input)`             | Delegates to the same execution path as `execute`                                 |
| `execute(input)`         | Resolves and invokes the configured governed profile, returning `RuntimeResult`   |
| `resolveProfile(input)`  | Resolves `input.runtimeProfile`, then `defaultRuntimeProfile`, then `single_pass` |
| `capabilityFingerprint?` | Present for capability composition; binds the descriptor composition              |

The factory constructs the single-pass runtime and constructs the iterative runtime only when **both** `iterativeOrchestrator` and `stepStore` are supplied. An iterative request without that configuration returns `STATE_CONFLICT` with zero steps, model calls and tool calls. Optional context, knowledge and completion ports feed the configured iterative runtime; supplying those ports alone does not select that runtime. The factory has no arbitrary runtime-class override.

The runtime classes remain exported for compatibility and lower-level composition. Consumer integrations should use the factory to preserve the registry/profile selection path. A factory call by itself is not evidence that every adapter satisfies durable approval, policy, tenant isolation or production requirements.

## Input, result and durable identity

[`RuntimeInput`](../../packages/contracts/src/contracts.ts:169) supplies an agent profile/version, tenant, conversation/session/correlation/trace identities, user message, context/state snapshots and an explicit execution budget. The optional `requestedTool` contains the registered tool identity/version, input and operation key.

The durable worker derives `executionId` and `resume` from its execution record. Public request bodies must not manufacture those fields. A capability-based durable execution must carry the composition fingerprint captured with the execution. A missing fingerprint on a durable capability execution, or a supplied fingerprint different from the current composition, returns `STATE_CONFLICT` before runtime dispatch with zero model/tool calls. Non-durable capability inputs receive the factory's fingerprint.

[`RuntimeResult`](../../packages/contracts/src/contracts.ts:199) contains response text, typed stop reason, step/model/tool counters, usage and optional approval/tool result. Inspect `stopReason`, not only the response string. `APPROVAL_REQUIRED`, `POLICY_DENIED`, `HUMAN_TAKEOVER`, `STATE_CONFLICT` and failures represent different outcomes. A successful return does not imply a real provider, channel, clinical or financial action was authorized.

Identifiers are branded at compile time. Type assertions used for synthetic identifiers in examples are not runtime validation or authentication. The serving boundary must establish trusted tenant/operator identity and the execution root must provide durable bindings.

## Synthetic smoke example

This complete example uses public imports, an empty tool registry and a deterministic `NoopOrchestrator`. It makes no model/provider/tool call, has no real channel or knowledge source, and keeps audit/telemetry in local arrays. The deny ports are fixtures, not production policy or approval implementations.

The assertions check the successful single-pass path, profile selection and denial of an unconfigured iterative profile. The example is compatible with the repository's Node 22 and TypeScript workspace configuration. Copy the block into a `.mts` file under this checkout and run it with `node_modules/.bin/tsx --tsconfig tsconfig.base.json <file.mts>` after installing the repository's dependencies. Typecheck it with a strict `noEmit` project extending `tsconfig.base.json` and listing that file; TSX execution alone does not check types.

```ts
import assert from 'node:assert/strict'
import { createOperationalHarness } from '@cvg/harness'
import { NoopOrchestrator } from '@cvg/harness-orchestrator'
import type {
  AuditEvent,
  RuntimeInput,
  TelemetryEvent
} from '@cvg/harness-contracts'

const observed = { model: 0, policy: 0, approval: 0 }
const auditEvents: AuditEvent[] = []
const telemetryEvents: TelemetryEvent[] = []
const harness = createOperationalHarness({
  orchestrator: new NoopOrchestrator(),
  tools: { list: () => [], resolve: () => undefined },
  modelGateway: {
    async complete() {
      observed.model += 1
      throw new Error('The synthetic example must not call a model')
    }
  },
  policy: {
    async evaluate() {
      observed.policy += 1
      return {
        outcome: 'DENY',
        reason: 'Synthetic smoke only',
        policyVersion: 'synthetic-v1'
      }
    }
  },
  approvals: {
    async request() {
      observed.approval += 1
      return { status: 'DENIED', reason: 'Synthetic smoke only' }
    }
  },
  audit: {
    async append(event) {
      auditEvents.push(event)
    }
  },
  telemetry: {
    record(event) {
      telemetryEvents.push(event)
    }
  }
})
const now = '2026-09-30T00:00:00.000Z'
const input: RuntimeInput = {
  agent: {
    id: 'agent.synthetic.public-api' as RuntimeInput['agent']['id'],
    version: 'synthetic-v1' as RuntimeInput['agent']['version'],
    objective: 'Exercise the public composition without effects',
    instructions: ['Synthetic smoke only'],
    skills: [],
    tools: [],
    policies: []
  },
  tenantId: 'tenant.synthetic.public-api' as RuntimeInput['tenantId'],
  conversationId: 'conversation.synthetic' as RuntimeInput['conversationId'],
  sessionId: 'session.synthetic' as RuntimeInput['sessionId'],
  correlationId: 'correlation.synthetic' as RuntimeInput['correlationId'],
  traceId: 'trace.synthetic' as RuntimeInput['traceId'],
  userMessage: 'Synthetic smoke',
  context: { values: {}, sourceIds: [], capturedAt: now },
  state: { version: 1, values: {}, updatedAt: now },
  budget: {
    maxSteps: 1,
    maxModelCalls: 0,
    maxToolCalls: 0,
    maxDurationMs: 5_000,
    maxCostUsd: 0,
    maxTokens: 0
  }
}
assert.equal(harness.resolveProfile(input), 'single_pass')
const result = await harness.run(input)
assert.equal(result.stopReason, 'COMPLETED')
assert.equal(result.response, 'Acknowledged.')
assert.equal(result.modelCalls, 0)
assert.equal(result.toolCalls, 0)
const iterativeInput: RuntimeInput = { ...input, runtimeProfile: 'iterative' }
assert.equal(harness.resolveProfile(iterativeInput), 'iterative')
const unconfigured = await harness.execute(iterativeInput)
assert.equal(unconfigured.stopReason, 'STATE_CONFLICT')
assert.equal(unconfigured.steps, 0)
assert.equal(unconfigured.modelCalls, 0)
assert.equal(unconfigured.toolCalls, 0)
assert.deepEqual(observed, { model: 0, policy: 0, approval: 0 })
assert.ok(auditEvents.length > 0)
assert.ok(telemetryEvents.length > 0)
console.log(
  JSON.stringify({
    singlePass: result.stopReason,
    iterative: unconfigured.stopReason,
    modelCalls: observed.model,
    toolCalls: result.toolCalls + unconfigured.toolCalls,
    auditEvents: auditEvents.length,
    telemetryEvents: telemetryEvents.length
  })
)
```

For an actual iterative composition, supply an `IterativeOrchestrator` and an `ExecutionStepStore`; `InMemoryExecutionStepStore` and `ScriptedOrchestrator` support synthetic exercises. They are not PostgreSQL durability evidence. [The existing runtime selection corpus](../../packages/harness/src/__tests__/runtime-selection.test.ts) exercises both configured profiles through the same factory. Integrations needing durable execution must use the appropriate persistence adapters and verify the complete API/worker path.

## Governance and current limits

Tool decisions resolve a registry entry, run policy and request approval when required by policy or the tool. The model gateway is the model boundary; an orchestrator decision cannot directly call a tool implementation. A configured journal records supported effect outcomes; indeterminate outcomes require reconciliation rather than an unsupported promise of exactly-once external delivery.

The current neutral `ApprovalEngine.execution` port remains optional, and current policy inputs can bypass mandatory risk floors. The factory and its exports do **not** prove mandatory sensitive lifecycle admission in every composition. Those material gaps remain open under [UP91-012/014](../03_build/0364_program_backlog_2026-09-30.md#up91-012), with [SPEC0167](../02_spec/0167_policy_prompt_approval_knowledge_audit.md) pending explicit T3 review. This example exercises no sensitive tool and does not demonstrate those pending fixes.

Context, response provenance, per-attempt budget accounting, approved prompt binding, knowledge revocation and audit/checkpoint V2 described in [SPEC0166](../02_spec/0166_governed_context_response_budget.md) and SPEC0167 are proposals, not additional current API guarantees. Do not implement against the proposed contracts as if they were exported and approved.

[The current architecture guide](CURRENT_IMPLEMENTATION_2026-09-29.md), [operational glossary](GLOSSARY.md), [roadmap](../03_build/0363_program_roadmap_2026-09-30.md) and [current execution report](../04_audit/evidence/UP91-EXEC-20260930/round3-report.md) describe the wider system and outstanding qualification. The original Phase 0/1 document is preserved byte-for-byte as a [historical source](../04_audit/evidence/UP91-EXEC-20260930/public-api-doc/PUBLIC_API.before.md.txt). This reference grants no real clinical, financial, scheduling or record action, external effects, release or production approval.

## SPEC0211/0212 — comportamento em implementação

BUILD autorizado pelo usuário em 14/10/2026; candidata e gate independente ainda em verificação, sem concessão de paridade ou release. A tabela registra os novos exports experimentais que os testes de superfície devem validar.

OperationalHarnessOptions.pause/effects/sandbox são encaminhados pelos perfis single_pass e iterative; IterativeGovernedRuntimeOptions.sandbox é opcional/aditivo. ToolExecutionContext.sandboxHandle é grant readonly validado/copiado pelo kernel após o gate. ShellRunRequest.handle carrega esse grant ao runner; shell.run chamado diretamente sem contexto governado rejeita e não fabrica permissões. Limites de root/deadline não são ampliados pelo input. Runner de teste demonstra repasse, não isolamento nativo.

Falha síncrona/assíncrona de effects.started impede o body. Falha de effects.finished depois do body termina com unknown_effect: effect_settlement_failed, sem anunciar sucesso ou repetir automaticamente o efeito incerto; checkpoint iterativo dessa falha conserva o bloqueio de replay. Não altera schema/eventos persistidos ou decisões de policy/approval.

Stdio mantém os quatro métodos v1; host é owner dos streams, identidade/tenant e child. SDK valida envelope/resultados, respeita limites de frames/queues/bytes e fecha no timeout. Erro depois de tentativa de escrita tem resultado conservador unknown e retrySafe=false. Sem reenvio automático; stdout contém somente frames. O processo neutro é sintético e não ativa provider/canal/efeito real.

## SPEC0218 — cliente Python experimental local

O pacote local `cvg_sdk`, em `packages/sdk/python`, usa somente stdlib e os quatro métodos CVG v1. Os exports canônicos estão em [**init**.py](../../packages/sdk/python/cvg_sdk/__init__.py); [README/API](../../packages/sdk/python/README.md) detalha `StdioOptions`, `attach_stdio`, `StdioTransport`, `SdkClient`, `create_sdk_client`, os tipos e erros. `SdkClient` oferece `hello`, `open_session`, `send_turn` e `read_events`. A distribuição atual é por cópia de fonte, sem instalação ou pacote npm adicional. O runtime efetivamente testado é CPython3.12.3 em Linux com selector asyncio.

O host fornece pipes POSIX exclusivos, não bloqueantes, e o tenant esperado dos eventos. O cliente mantém os descritores e processos sob propriedade do host. `close()` encerra o adaptador local; `Task.cancel()` de request admitida é traduzido em `SdkWireError(kind='closed')`, com resultado individual `not_dispatched` ou `unknown` conforme a tentativa de escrita. Não significa cancelamento remoto do kernel. Validação, limites, erros e restrições adicionais do parser/estimador Python estão na [SPEC0218](../02_spec/0218_pare100_python_sdk_stdio.md). Não há retry automático, método novo, resume, cancelamento remoto, push de eventos ou transporte de rede nessa fatia. A qualificação de implementação e os gates integrados permanecem registrados no programa PARE100.

## SPEC0217 — composição durável experimental

Implementação sintética em worktree próprio, ainda sem promoção ao checkout principal ou aceite final. A [SPEC0217](../02_spec/0217_pare100_durable_kernel_composition.md) aprovada adiciona o host confiável `ControlledKernelHostContext`, os tipos de identidade, fase, recibo, permit, snapshot e continuation, e os helpers `prepareControlledPublishedAdmission`, `controlledCanonicalJson`, `controlledDigest` e `validateControlledSnapshot` em `@cvg/platform`. O host é fornecido pela composição do processo; configuração publicada e payload HTTP não concedem essa autoridade.

`@cvg/persistence` exporta `PostgresControlledPublishedKernelStore` para admissão idempotente, claim exato, host, renovação pareada e espelho de auditoria, com a migration aditiva0029. Os novos tipos de claim externo fenced complementam os métodos anteriores do outbox. Helpers SQL internos de fencing/receipt não são exports da raiz pública.

O worker opta explicitamente por `CVG_WORKER_PUBLISHED_DURABILITY=postgres-v1`, somente com PostgreSQL e perfil controlado. Default desligado, recusa em production, concorrência1, leases10s/renew2s e deadline original60s no perfil de prova. A composição atesta uma única ferramenta pura sintética, conserva o plano em S1, retoma apenas seals seguros e exige handoff em segmentos ambíguos. Não há contenção de processo serving malicioso, retry de efeito real, novo provider ou aprovação de produção. As evidências de processo, compilação e crítica são requisitos de aceite; exports e hashes sozinhos não comprovam durabilidade ou paridade.
