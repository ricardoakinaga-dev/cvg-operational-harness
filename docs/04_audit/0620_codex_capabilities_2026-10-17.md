# 0620 — Melhorias do Codex aplicáveis ao Operational Harness

- Task: `REA-CODEX-20261017`; 17/10/2026; `COMPLETED` para auditoria comparativa e extração documental, T1. BUILD não iniciado.
- Harness: checkout `7ecc5b53944dcbc50fc26a95cfaec05bb1c62eb5` com alterações concorrentes preservadas. Referência: [openai/codex no commit 8d9f6466ff02](https://github.com/openai/codex/tree/8d9f6466ff0294785d56f55b1fe363d132fe4133).
- Artefato examinado pelo MCP REA: `codex-cli 0.163.0`, Linux x64; SHA-256 `399ff69c431c066e40de318fba45c2b07f45a76b19939d247ee4828fc70c4215`; 296,865,480 bytes.
- Entregas: [16 oportunidades com critérios de aceite](evidence/REA-CODEX-20261017/opportunities.json), [fontes e trechos com hashes](evidence/REA-CODEX-20261017/source-inspection.json), [capturas REA](evidence/REA-CODEX-20261017/captures-index.json) e [handoff de continuidade](../08_runtime/handoffs/rea_codex_20261017.md).

## Conclusão

Faz sentido incorporar padrões de **continuidade de sessões, protocolo interativo, controle de contexto, supervisão de processos e configuração com origem**, preservando os controles que o harness já possui. O maior ganho vem de completar e qualificar essas fronteiras, não de substituir o runtime ou adicionar funções de um assistente de programação ao núcleo.

As 16 linhas abaixo são uma seleção de mecanismos e oportunidades, **não um inventário completo do Codex, percentual de paridade, auditoria de segurança integral ou GO de produção**. Nenhum defeito novo foi confirmado por exploração nesta rodada. Inspeção estática e comandos informativos não demonstram execução funcional de todas as capacidades. Propostas não mudam prioridades oficiais nem aprovam SPECs.

## Como o harness funciona hoje

O repositório é um monorepo TypeScript: `packages/contracts` define portas; `packages/harness` compõe execução; `packages/agent-runtime` integra execução durável; `model-gateway`, `policy-engine`, `approval-engine`, `persistence`, `observability` e `sandbox` implementam fronteiras. API, worker e SDK são superfícies consumidoras. `products/shift-assistant` mantém domínio e operação próprios, conforme [ADR-010](../architecture/adrs/ADR-010-harness-product-isolation.md).

O fluxo observado por leitura é: composição e seleção de perfil → construção do turno/contexto → modelo e decisão → pipeline compartilhado de ferramentas → policy/approval/guards/contenção → journal e executor → resultado, auditoria, telemetria e estado. O detalhe da ordem varia entre controles/adapters; a referência executável é [kernel/pipeline.ts](../../packages/harness/src/kernel/pipeline.ts), e o caminho durável usa [runtime-kernel-bridge.ts](../../packages/agent-runtime/src/runtime-kernel-bridge.ts).

A [fábrica pública](../../packages/harness/src/createOperationalHarness.ts) já seleciona `single_pass` e `iterative`, exige journal na composição por capabilities e verifica fingerprint de execução durável. Há [eventos de sessão PostgreSQL](../../packages/persistence/src/session-events.ts), [checkpoints com integridade](../../packages/harness/src/step-store.ts), [compactação determinística](../../packages/harness/src/compaction.ts), [SDK JSON-RPC](../../packages/sdk/src/protocol.ts), confinamento de arquivos e shell com limites. Esses componentes são base existente, sem presumir que todos os aceites públicos estejam fechados.

O README arquitetural de fase 0/1 ainda descreve somente single-pass; preferiu-se o código atual e a [análise0617](0617_harness_operational_state_2026-10-17.md). Resultados de testes/certificação de outras rodadas não foram reemitidos aqui. Os programas [0379/0380](../03_build/0380_backlog_paridade_100_deepseek.md), [Claude100/0383](../03_build/0383_backlog_paridade_claude_code.md), isolamento e produção0374 conservam seus estados.

## Referência Codex e método

O código oficial separa `core`, interfaces CLI/TUI/exec/app-server, protocolo, armazenamento de threads, ferramentas, sandbox e extensões. A [documentação oficial da OpenAI](https://developers.openai.com/blog/codex-as-a-platform) corrobora a reutilização do loop por diferentes interfaces e as opções de integração `exec`, SDK e app-server. Isso apoia a ADR-010; não exige que o harness passe a depender do serviço Codex.

Foi clonado o upstream em diretório temporário próprio, fixado o commit e lidas fontes selecionadas. O artefato instalado e o `main` upstream **não foram demonstrados como equivalentes**; afirmações de fonte usam permalink do commit e afirmações de CLI usam Evidence IDs próprios. O executável é maior que o limite de 256MiB do `inspect_rust_binary`; não se tentou essa operação incompatível, nem se fez descompilação. Fontes Rust foram analisadas diretamente; o MCP REA fez observação controlada do artefato.

As 14 capturas usaram `/usr/bin/env -i`, diretório de trabalho e configuração vazios próprios, sem ler a configuração pessoal. O digest de executável no manifesto REA corresponde ao launcher `env`; a identidade do Codex foi aferida separadamente antes e depois. A captura não prova vínculo atômico entre hash e imagem executada. Não houve chamada a modelo, login, integração real, instalação, alteração de código, commit, push ou deploy.

## O que foi realmente executado com o REA

| Procedimento                                                                       | Resultado observado                                                                     | Limite da conclusão                                                                                                 |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Versão, help geral e helps de exec, app-server, resume, fork, sandbox e execpolicy | Oito capturas, exit0, sem truncamento                                                   | Comandos e opções anunciados; não ensaio funcional de todas as capacidades.                                         |
| `features list`                                                                    | Flags e estágio declarados pelo executável, exit0                                       | `stable`, `experimental` e `under development` são metadados upstream, não certificação CVG.                        |
| Helps de geração de schema e avaliação de policy                                   | Duas capturas, exit0                                                                    | Identifica parâmetros usados nas provas seguintes.                                                                  |
| `app-server generate-json-schema --out ...`                                        | 318 JSONs; 105 métodos em ClientRequest, dez em ServerRequest, 85 em ServerNotification | Geração executada, sem abrir servidor nem exercitar esses métodos. Três schemas completos preservados.              |
| Duas avaliações de regras sintéticas                                               | `cvg-synthetic read`→`allow`; `cvg-synthetic write`→`forbidden`; ambos exit0            | O conteúdo da decisão é o oráculo; exit0 sozinho não significa permissão. Os comandos avaliados não são executados. |

O [bundle original REA](evidence/REA-CODEX-20261017/rea-evidence-bundle.json) contém 14 capturas e quatro registros de unknown gerados pelo REA, conservados sem reclassificação. Permanecem limites de amostragem de processos, observação de rede ausente e snapshots de filesystem restritos aos caminhos declarados. As versões/helps não provam ausência de efeitos em todo o host.

Os schemas gerados contêm `thread/start`, `thread/resume`, `thread/fork`, `turn/steer`, `turn/interrupt` e pedidos de aprovação/input. Isso confirma o vocabulário compilado do artefato, sem declarar que cada fluxo foi ensaiado. [Índice e hashes](evidence/REA-CODEX-20261017/generated-schema-index.json); [protocolo documentado](https://learn.chatgpt.com/docs/app-server).

## Extração priorizada

P1/P2/P3 abaixo indicam recomendação desta auditoria, sem substituir a prioridade do cartão canônico. Todas as construções que alterem contrato, schema, policy, identidade, aprovação ou superfície de execução passam por T3; integração sensível e release continuam T4. Primeiro encaminhamento é DISCOVERY/PRD/SPEC quando a definição vigente não cobrir a extensão.

| ID      | Mecanismo e diagnóstico                                                                              | Encaminhamento existente                             | Prioridade sugerida           |
| ------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ----------------------------- |
| CX20-01 | Núcleo reutilizável e hosts finos — padrão já presente; qualificar integração                        | PAR-K01, PAR-K02, PAR-Q06                            | P1                            |
| CX20-02 | Sessões duráveis, retomada e fork — evolução proposta sobre a base examinada                         | PAR-S01, PAR-S04, PAR-S07, PAR-K03                   | P1                            |
| CX20-03 | Contexto sob pressão com proveniência preservada — evolução proposta sobre a base examinada          | PAR-C01, PAR-C02, PAR-C05, PAR-K03                   | P1                            |
| CX20-04 | Saídas grandes como artefatos com limites — evolução proposta sobre a base examinada                 | PAR-C03, PAR-T04                                     | P1                            |
| CX20-05 | Protocolo interativo e schemas gerados — evolução proposta sobre a base examinada                    | PAR-A01, PAR-A02, PAR-A03, PAR-A05, PAR-A07, PAR-A09 | P1                            |
| CX20-06 | Supervisor único de subprocessos — evolução proposta sobre a base examinada                          | PAR-X01, PAR-T10, PAR-T14, PAR-Q03                   | P1                            |
| CX20-07 | Aprovação, política e contenção como decisões distintas — evolução proposta sobre a base examinada   | PAR-X02, PAR-X03, PAR-X04, PAR-K03                   | P1                            |
| CX20-08 | Configuração efetiva com origem e restrições — evolução proposta sobre a base examinada              | PAR-H02, PAR-H03, PAR-K05                            | P1                            |
| CX20-09 | Instruções de workspace por escopo — evolução proposta sobre a base examinada                        | PAR-C06, PAR-T07                                     | P2                            |
| CX20-10 | Skills progressivas e descoberta governada de ferramentas — evolução proposta sobre a base examinada | PAR-T07, PAR-P01, PAR-K04                            | P2                            |
| CX20-11 | Hooks declarativos com trust e limites — evolução proposta sobre a base examinada                    | PAR-K09, PAR-K10                                     | P2                            |
| CX20-12 | Subagentes com árvore e autoridade limitada — evolução proposta sobre a base examinada               | PAR-O01, PAR-O02, PAR-O13                            | P2                            |
| CX20-13 | Paralelismo declarado com exclusão de efeitos — evolução proposta sobre a base examinada             | PAR-K07, PAR-K03                                     | P2                            |
| CX20-14 | Steering e objetivos duráveis com cancelamento explícito — evolução proposta sobre a base examinada  | PAR-K06, PAR-T11, PAR-O08, PAR-A02                   | P2                            |
| CX20-15 | Workspace isolado e mudanças revisáveis — evolução proposta sobre a base examinada                   | PAR-T01, PAR-T05, PAR-T09                            | P3 / consumidor de engenharia |
| CX20-16 | Evals de contrato e falhas com modelo sintético — evolução proposta sobre a base examinada           | PAR-Q02, PAR-Q03, PAR-Q04, PAR-Q06, PAR-Q07          | P1                            |

## Critérios, fontes e adaptação por oportunidade

Cada critério abaixo é **proposto para implementação futura**, sem PASS funcional nesta rodada. O JSON associado também registra o diagnóstico atual, fontes dos dois lados, gate e sobreposição com Claude100.

### CX20-01 — Núcleo reutilizável e hosts finos

A fábrica seleciona single_pass/iterative; agent-runtime usa runtime-kernel-bridge e o pipeline comum. A seleção do worker e o aceite integral de hosts continuam no PAR-K01. Não há justificativa para reescrever o núcleo em Rust.

Preservar a separação entre núcleo e interfaces; qualificar API, worker e SDK contra a mesma execução governada e o mesmo conjunto de controles.

**Aceite proposto:** Uma jornada sintética de leitura, escrita retida, aprovação, cancelamento e falha de log produz os mesmos resultados normativos pelos três hosts, sem importar products/shift-assistant.

**Fontes Codex:** [codex-rs/core/README.md:3](https://github.com/openai/codex/blob/8d9f6466ff0294785d56f55b1fe363d132fe4133/codex-rs/core/README.md#L3), [codex-rs/core/src/session/turn.rs:166](https://github.com/openai/codex/blob/8d9f6466ff0294785d56f55b1fe363d132fe4133/codex-rs/core/src/session/turn.rs#L166). **Harness:** [packages/harness/src/createOperationalHarness.ts:73](../../packages/harness/src/createOperationalHarness.ts:73), [packages/agent-runtime/src/runtime-kernel-bridge.ts:34](../../packages/agent-runtime/src/runtime-kernel-bridge.ts:34), [apps/worker/src/kernel-composition.ts:83](../../apps/worker/src/kernel-composition.ts:83). **Gate:** T3.

### CX20-02 — Sessões duráveis, retomada e fork

Há SessionEventStore em memória e PostgreSQL, eventos versionados e checkpoints. O SDK expõe open/send/events; essa base não demonstra a experiência pública completa de retomada e fork entre processos.

Evoluir a porta pública de sessão com paginação, ownership, resume e fork; manter PostgreSQL e isolamento por tenant como autoridade.

**Aceite proposto:** Retomar em outro processo conserva versão, cursor e pendências; fork referencia o pai sem repetir efeito; acesso cruzado de tenant e cursor inválido são recusados.

**Fontes Codex:** [codex-rs/thread-store/src/lib.rs:1](https://github.com/openai/codex/blob/8d9f6466ff0294785d56f55b1fe363d132fe4133/codex-rs/thread-store/src/lib.rs#L1), [codex-rs/thread-store/src/store.rs:274](https://github.com/openai/codex/blob/8d9f6466ff0294785d56f55b1fe363d132fe4133/codex-rs/thread-store/src/store.rs#L274), [codex-rs/core/src/thread_manager.rs:253](https://github.com/openai/codex/blob/8d9f6466ff0294785d56f55b1fe363d132fe4133/codex-rs/core/src/thread_manager.rs#L253). **Harness:** [packages/persistence/src/session-events.ts:50](../../packages/persistence/src/session-events.ts:50), [packages/harness/src/step-store.ts:61](../../packages/harness/src/step-store.ts:61), [packages/sdk/src/protocol.ts:11](../../packages/sdk/src/protocol.ts:11). **Gate:** T3.

### CX20-03 — Contexto sob pressão com proveniência preservada

DefaultContextEngine preserva prioridades obrigatórias; compaction.ts usa estimativa chars/4, trechos determinísticos e digest. Isso já existe, mas não equivale a compactação semântica com recontagem da requisição e histórico de autorização independente da janela do modelo.

Medir a requisição efetiva antes do dispatch; compactar com orçamento explícito e reter intenção, fontes e autoridade fora do resumo. Resumo não deve adquirir confiança superior aos seus insumos.

**Aceite proposto:** Contexto grande dispara compactação antes da chamada; orçamento inclui schemas e saídas; fontes/pendências sobrevivem; texto adversarial resumido não altera policy ou aprovação; falha de compactação encerra de forma explícita.

**Fontes Codex:** [codex-rs/core/src/compact.rs:155](https://github.com/openai/codex/blob/8d9f6466ff0294785d56f55b1fe363d132fe4133/codex-rs/core/src/compact.rs#L155), [codex-rs/core/src/context_manager/history.rs:100](https://github.com/openai/codex/blob/8d9f6466ff0294785d56f55b1fe363d132fe4133/codex-rs/core/src/context_manager/history.rs#L100), [codex-rs/core/src/session/turn.rs:194](https://github.com/openai/codex/blob/8d9f6466ff0294785d56f55b1fe363d132fe4133/codex-rs/core/src/session/turn.rs#L194). **Harness:** [packages/harness/src/context-engine.ts:32](../../packages/harness/src/context-engine.ts:32), [packages/harness/src/compaction.ts:57](../../packages/harness/src/compaction.ts:57). **Gate:** T3.

### CX20-04 — Saídas grandes como artefatos com limites

runContained já limita stdout/stderr e fs-tools limita leituras/escritas. Não foi qualificado um spill comum de resultados grandes com referências recuperáveis pelo modelo e retenção por tenant.

Separar saída integral armazenada e visão limitada do modelo; devolver tamanho, truncamento, digest e identificador autorizado de artefato.

**Aceite proposto:** Uma saída acima do teto não esgota memória/contexto, informa truncamento e permite leitura por faixa autorizada; outro tenant e artefato expirado são negados; falha de storage é explícita.

**Fontes Codex:** [codex-rs/core/src/unified_exec/mod.rs:75](https://github.com/openai/codex/blob/8d9f6466ff0294785d56f55b1fe363d132fe4133/codex-rs/core/src/unified_exec/mod.rs#L75), [codex-rs/hooks/src/engine/command_runner.rs:46](https://github.com/openai/codex/blob/8d9f6466ff0294785d56f55b1fe363d132fe4133/codex-rs/hooks/src/engine/command_runner.rs#L46), [codex-rs/core/src/context_manager/history.rs:71](https://github.com/openai/codex/blob/8d9f6466ff0294785d56f55b1fe363d132fe4133/codex-rs/core/src/context_manager/history.rs#L71). **Harness:** [packages/sandbox/src/run.ts:29](../../packages/sandbox/src/run.ts:29), [packages/sandbox/src/fs-tools.ts:51](../../packages/sandbox/src/fs-tools.ts:51). **Gate:** T3.

### CX20-05 — Protocolo interativo e schemas gerados

O SDK já usa JSON-RPC v1 e stdio validado; seu vocabulário público contém sdk.hello, session.open, turn.send e session.events. Eventos consultáveis não equivalem a notificações push, steering e pedidos servidor→cliente.

Gerar contrato e clientes de uma fonte canônica; negociar versão/capabilities; adicionar notificações, pedidos de aprovação e controle de turno sem criar outro executor.

**Aceite proposto:** Clientes TS/Python recebem eventos ordenados, um terminal por turno e erros tipados; reconnect recupera por cursor; versão incompatível e resposta de aprovação alheia são recusadas; contratos gerados não divergem no CI.

**Fontes Codex:** [codex-rs/app-server-protocol/src/protocol/common.rs:1069](https://github.com/openai/codex/blob/8d9f6466ff0294785d56f55b1fe363d132fe4133/codex-rs/app-server-protocol/src/protocol/common.rs#L1069), [sdk/typescript/src/thread.ts:19](https://github.com/openai/codex/blob/8d9f6466ff0294785d56f55b1fe363d132fe4133/sdk/typescript/src/thread.ts#L19). **Harness:** [packages/sdk/src/protocol.ts:11](../../packages/sdk/src/protocol.ts:11), [packages/sdk/src/client.ts:51](../../packages/sdk/src/client.ts:51), [packages/sdk/src/stdio.ts:1](../../packages/sdk/src/stdio.ts:1). **Gate:** T3.

### CX20-06 — Supervisor único de subprocessos

runContained é uma execução limitada com timeout e captura de saída; não é um supervisor público completo de jobs/PTY persistentes. O código de spawn lido não fornece env explícito, portanto não demonstra filtragem do ambiente herdado.

Unificar criação, polling, stdin, cancelamento, encerramento e ownership de filhos, com ambiente mínimo e observação do fechamento de stdio.

**Aceite proposto:** Cancelamento/timeout encerra a árvore própria e drena saídas; falha dupla conserva causa inicial e erro de limpeza; token sintético não autorizado não aparece no filho; outro tenant não controla o job.

**Fontes Codex:** [codex-rs/core/src/unified_exec/mod.rs:1](https://github.com/openai/codex/blob/8d9f6466ff0294785d56f55b1fe363d132fe4133/codex-rs/core/src/unified_exec/mod.rs#L1), [codex-rs/core/src/unified_exec/process_manager.rs:506](https://github.com/openai/codex/blob/8d9f6466ff0294785d56f55b1fe363d132fe4133/codex-rs/core/src/unified_exec/process_manager.rs#L506), [codex-rs/config/src/shell_environment_policy.rs:15](https://github.com/openai/codex/blob/8d9f6466ff0294785d56f55b1fe363d132fe4133/codex-rs/config/src/shell_environment_policy.rs#L15). **Harness:** [packages/sandbox/src/run.ts:114](../../packages/sandbox/src/run.ts:114), [packages/sandbox/src/shell-tool.ts:1](../../packages/sandbox/src/shell-tool.ts:1). **Gate:** T3.

### CX20-07 — Aprovação, política e contenção como decisões distintas

O kernel já possui policy/approval, SandboxGate e journal. Manter a distinção: aprovação permite uma ação, enquanto contenção limita como ela executa. Os testes desta rodada avaliaram regras, sem executar comando nem comprovar sandbox nativo.

Tornar observáveis decisão de policy, aprovação vinculada ao conteúdo e resultado da contenção; reavaliar qualquer retry que amplie autoridade. Provar contenção no host real antes de anunciá-la.

**Aceite proposto:** Negação não chama executor; falta de contenção exigida falha fechada; alteração de argv/cwd/tenant/permissão invalida aprovação; retry sem sandbox não usa aceite da tentativa restrita; provas nativas têm controles negativos.

**Fontes Codex:** [codex-rs/core/src/tools/orchestrator.rs:2](https://github.com/openai/codex/blob/8d9f6466ff0294785d56f55b1fe363d132fe4133/codex-rs/core/src/tools/orchestrator.rs#L2), [codex-rs/execpolicy/src/policy.rs:28](https://github.com/openai/codex/blob/8d9f6466ff0294785d56f55b1fe363d132fe4133/codex-rs/execpolicy/src/policy.rs#L28), [codex-rs/exec-server/src/sandbox_integrity/mod.rs:9](https://github.com/openai/codex/blob/8d9f6466ff0294785d56f55b1fe363d132fe4133/codex-rs/exec-server/src/sandbox_integrity/mod.rs#L9). **Harness:** [packages/harness/src/kernel/pipeline.ts:265](../../packages/harness/src/kernel/pipeline.ts:265), [packages/harness/src/kernel/controls.ts:1](../../packages/harness/src/kernel/controls.ts:1), [packages/sandbox/src/gate.ts:1](../../packages/sandbox/src/gate.ts:1). **Gate:** T3.

### CX20-08 — Configuração efetiva com origem e restrições

Há perfis e configuração de hosts; não foi qualificado um modelo único de precedência, origem, diagnóstico e fronteira de confiança para configurações do workspace.

Definir camadas sistema/organização/tenant/sessão/workspace; registrar valor efetivo, origem e hash, com dump redigido; configuração menos confiável não pode trocar endpoint de credenciais nem enfraquecer controles.

**Aceite proposto:** Precedência é determinística, campo desconhecido gera erro no modo estrito, segredo é redigido, configuração de projeto não aumenta grants e a mesma configuração reproduz o fingerprint.

**Fontes Codex:** [codex-rs/config/src/loader/mod.rs:89](https://github.com/openai/codex/blob/8d9f6466ff0294785d56f55b1fe363d132fe4133/codex-rs/config/src/loader/mod.rs#L89), [codex-rs/config/src/strict_config.rs:3](https://github.com/openai/codex/blob/8d9f6466ff0294785d56f55b1fe363d132fe4133/codex-rs/config/src/strict_config.rs#L3), [codex-rs/config/src/shell_environment_policy.rs:15](https://github.com/openai/codex/blob/8d9f6466ff0294785d56f55b1fe363d132fe4133/codex-rs/config/src/shell_environment_policy.rs#L15). **Harness:** [packages/harness/src/kernel/profile.ts:1](../../packages/harness/src/kernel/profile.ts:1), [apps/worker/src/kernel-composition.ts:56](../../apps/worker/src/kernel-composition.ts:56), [packages/platform/src/prompt-profile.ts:1](../../packages/platform/src/prompt-profile.ts:1). **Gate:** T3.

### CX20-09 — Instruções de workspace por escopo

Perfis e instruções de agente entram no context-engine; o AGENTS.md deste repositório governa desenvolvimento. Isso não demonstra um loader de instruções de workspace para sessões consumidoras do harness.

Introduzir loader opcional por raiz autorizada, com precedência, teto de bytes e snapshot hash-bound; instruções locais subordinadas às regras institucionais e à policy.

**Aceite proposto:** Arquivos fora da raiz, projeto não confiável e escapes por symlink são recusados; ordem e truncamento são declarados; alteração de arquivo altera o snapshot e não reautoriza efeito pendente.

**Fontes Codex:** [codex-rs/core/src/agents_md.rs:1](https://github.com/openai/codex/blob/8d9f6466ff0294785d56f55b1fe363d132fe4133/codex-rs/core/src/agents_md.rs#L1), [codex-rs/core/src/agents_md.rs:45](https://github.com/openai/codex/blob/8d9f6466ff0294785d56f55b1fe363d132fe4133/codex-rs/core/src/agents_md.rs#L45). **Harness:** [packages/harness/src/context-engine.ts:153](../../packages/harness/src/context-engine.ts:153), [packages/harness/src/skills/loader.ts:99](../../packages/harness/src/skills/loader.ts:99). **Gate:** T3.

### CX20-10 — Skills progressivas e descoberta governada de ferramentas

Há manifests estritos de skills, registry e capabilities com fingerprint. Esses mecanismos são base para catálogo progressivo; não constituem compatibilidade completa com SKILL.md e MCP.

Anunciar primeiro metadados e carregar conteúdo/schema apenas quando necessário; cada catálogo é filtrado por grants e origem, com hash de conteúdo e geração.

**Aceite proposto:** Com catálogo grande, contexto e latência são medidos; ferramenta não concedida não é anunciada; expansão não aumenta autoridade; troca de conteúdo invalida trust; indisponibilidade de MCP não vira autorização implícita.

**Fontes Codex:** [codex-rs/ext/skills/src/catalog_prompt.rs:81](https://github.com/openai/codex/blob/8d9f6466ff0294785d56f55b1fe363d132fe4133/codex-rs/ext/skills/src/catalog_prompt.rs#L81), [codex-rs/ext/skills/src/dynamic_skill_selector.rs:11](https://github.com/openai/codex/blob/8d9f6466ff0294785d56f55b1fe363d132fe4133/codex-rs/ext/skills/src/dynamic_skill_selector.rs#L11), [codex-rs/core/src/tools/router.rs:38](https://github.com/openai/codex/blob/8d9f6466ff0294785d56f55b1fe363d132fe4133/codex-rs/core/src/tools/router.rs#L38). **Harness:** [packages/harness/src/skills/loader.ts:16](../../packages/harness/src/skills/loader.ts:16), [packages/harness/src/capability-boundary.ts:1](../../packages/harness/src/capability-boundary.ts:1). **Gate:** T3.

### CX20-11 — Hooks declarativos com trust e limites

KernelHost já registra hooks em código, controla quem fornece serviços e sela o host. Hooks externos configuráveis têm outro ciclo de confiança e não estão comprovados por esses listeners.

Aceitar hooks com eventos/schema definidos, hash aprovado, timeout, saída limitada e cancelamento. Hooks podem anexar contexto ou restringir; não podem substituir policy/approval.

**Aceite proposto:** Mutação de bundle exige nova revisão; timeout e saída inválida têm resultado normativo; hook que tenta liberar ação negada falha; fechamento do host cancela e aguarda os hooks próprios.

**Fontes Codex:** [codex-rs/hooks/src/engine/plugin_trust.rs:3](https://github.com/openai/codex/blob/8d9f6466ff0294785d56f55b1fe363d132fe4133/codex-rs/hooks/src/engine/plugin_trust.rs#L3), [codex-rs/hooks/src/engine/command_runner.rs:53](https://github.com/openai/codex/blob/8d9f6466ff0294785d56f55b1fe363d132fe4133/codex-rs/hooks/src/engine/command_runner.rs#L53). **Harness:** [packages/harness/src/kernel/host.ts:50](../../packages/harness/src/kernel/host.ts:50), [packages/harness/src/kernel/pipeline.ts:79](../../packages/harness/src/kernel/pipeline.ts:79). **Gate:** T3.

### CX20-12 — Subagentes com árvore e autoridade limitada

Não foi identificado controlador equivalente de árvore/mailbox nas superfícies neutras examinadas. Registro de capabilities e decisões de delegação existentes não demonstram filhos continuáveis e supervisionados.

Criar porta de delegação com IDs pai/filho, grants por interseção, budget agregado, máximo de profundidade/filhos, cancelamento e mailbox auditável.

**Aceite proposto:** Filho não adquire permissão ausente no pai; encerramento do pai aguarda ou cancela filhos; orçamento agregado inclui concorrência; mensagens de terceiros permanecem dados não confiáveis; tenant alheio não lê mailbox.

**Fontes Codex:** [codex-rs/core/src/agent/control.rs:93](https://github.com/openai/codex/blob/8d9f6466ff0294785d56f55b1fe363d132fe4133/codex-rs/core/src/agent/control.rs#L93), [codex-rs/core/src/agent/child_config.rs:179](https://github.com/openai/codex/blob/8d9f6466ff0294785d56f55b1fe363d132fe4133/codex-rs/core/src/agent/child_config.rs#L179), [codex-rs/core/src/session/input_queue.rs:98](https://github.com/openai/codex/blob/8d9f6466ff0294785d56f55b1fe363d132fe4133/codex-rs/core/src/session/input_queue.rs#L98). **Harness:** [packages/harness/src/kernel/host.ts:50](../../packages/harness/src/kernel/host.ts:50), [packages/platform/src/controlled-execution-plan.ts:5](../../packages/platform/src/controlled-execution-plan.ts:5). **Gate:** T3.

### CX20-13 — Paralelismo declarado com exclusão de efeitos

O pipeline governa chamadas individuais. Não foi qualificado scheduler de lote público com execução paralela declarada e exclusão de ferramentas mutantes.

Inspirar-se no lock de leitura/escrita por metadados de ferramenta; adicionar limite explícito e reserva atômica de budget no harness. Não tratar o RwLock upstream como prova de um limite de concorrência numérico.

**Aceite proposto:** Duas leituras independentes sobrepõem execução dentro do teto; escrita exclusiva não sobrepõe chamadas conflitantes; chamadas negadas não iniciam; ordem causal, orçamento e journal permanecem íntegros sob cancelamento.

**Fontes Codex:** [codex-rs/core/src/tools/parallel.rs:213](https://github.com/openai/codex/blob/8d9f6466ff0294785d56f55b1fe363d132fe4133/codex-rs/core/src/tools/parallel.rs#L213), [codex-rs/core/src/tools/router.rs:246](https://github.com/openai/codex/blob/8d9f6466ff0294785d56f55b1fe363d132fe4133/codex-rs/core/src/tools/router.rs#L246). **Harness:** [packages/harness/src/kernel/pipeline.ts:265](../../packages/harness/src/kernel/pipeline.ts:265), [packages/harness/src/iterative-runtime.ts:1](../../packages/harness/src/iterative-runtime.ts:1). **Gate:** T3.

### CX20-14 — Steering e objetivos duráveis com cancelamento explícito

Já existem sinal de cancelamento, pause e NEEDS_USER_INPUT. Não equivalem a uma fila pública de novas instruções durante o turno, goals duráveis e política de espera/retomada.

Distinguir steering de cancelamento e de troca de objetivo; admitir nova entrada na fronteira do próximo passo. Goals exigem criação explícita, orçamento e estado durável.

**Aceite proposto:** Interrupção durante chamada impede novo dispatch; steering preserva causa e ordem; restart conserva objetivo e pendência; sinal após efeito consumado não promete rollback; objetivo nunca amplia grants.

**Fontes Codex:** [codex-rs/core/src/session/input_queue.rs:36](https://github.com/openai/codex/blob/8d9f6466ff0294785d56f55b1fe363d132fe4133/codex-rs/core/src/session/input_queue.rs#L36), [codex-rs/ext/goal/src/lib.rs:15](https://github.com/openai/codex/blob/8d9f6466ff0294785d56f55b1fe363d132fe4133/codex-rs/ext/goal/src/lib.rs#L15), [codex-rs/app-server-protocol/src/protocol/common.rs:1075](https://github.com/openai/codex/blob/8d9f6466ff0294785d56f55b1fe363d132fe4133/codex-rs/app-server-protocol/src/protocol/common.rs#L1075). **Harness:** [packages/harness/src/kernel/pipeline.ts:139](../../packages/harness/src/kernel/pipeline.ts:139), [packages/platform/src/controlled-execution-plan.ts:10](../../packages/platform/src/controlled-execution-plan.ts:10). **Gate:** T3.

### CX20-15 — Workspace isolado e mudanças revisáveis

Há confinamento de caminhos e journal pré-mutação. Worktree Git e patch multi-arquivo são úteis a um consumidor de engenharia, mas não precisam virar requisito de todo produto operacional.

Oferecer preview/digest de alterações e workspace por tarefa em adapter opcional. Manter confinePath e grants; não herdar o default standalone de apply-patch que segue symlinks.

**Aceite proposto:** Preview e aplicação usam o mesmo conteúdo-base; conflito ou symlink externo aborta sem sobrescrever trabalho alheio; só caminhos do claim mudam; limpeza não toca workspace de outra tarefa.

**Fontes Codex:** [codex-rs/apply-patch/src/lib.rs:61](https://github.com/openai/codex/blob/8d9f6466ff0294785d56f55b1fe363d132fe4133/codex-rs/apply-patch/src/lib.rs#L61), [codex-rs/apply-patch/src/lib.rs:69](https://github.com/openai/codex/blob/8d9f6466ff0294785d56f55b1fe363d132fe4133/codex-rs/apply-patch/src/lib.rs#L69). **Harness:** [packages/sandbox/src/confine.ts:14](../../packages/sandbox/src/confine.ts:14), [packages/sandbox/src/fs-tools.ts:17](../../packages/sandbox/src/fs-tools.ts:17). **Gate:** T3.

### CX20-16 — Evals de contrato e falhas com modelo sintético

Há agent-evals, conformance e comparador diferencial DeepSeek com pin próprio. A auditoria não executou esse comparador nem transferiu sua referência para Codex.

Reutilizar casos sintéticos e contratos; criar driver Codex separado, quando houver SPEC, sem trocar silenciosamente o driver DeepSeek. Medir resultados governados e falhas, não igualdade de texto ou quantidade de funções.

**Aceite proposto:** Fixtures detectam terminal duplicado, perda de tool result, falha antes/depois do checkpoint, cancelamento, negação e fechamento; um controle sabidamente errado falha; versão/artefato/driver/oráculo ficam fixados.

**Fontes Codex:** [codex-rs/core/tests/common/responses.rs:40](https://github.com/openai/codex/blob/8d9f6466ff0294785d56f55b1fe363d132fe4133/codex-rs/core/tests/common/responses.rs#L40), [codex-rs/core/tests/common/streaming_sse.rs:1](https://github.com/openai/codex/blob/8d9f6466ff0294785d56f55b1fe363d132fe4133/codex-rs/core/tests/common/streaming_sse.rs#L1), [codex-rs/core/src/tools/parallel_observation_tests.rs:2](https://github.com/openai/codex/blob/8d9f6466ff0294785d56f55b1fe363d132fe4133/codex-rs/core/src/tools/parallel_observation_tests.rs#L2). **Harness:** [packages/agent-evals/src/runner.ts:25](../../packages/agent-evals/src/runner.ts:25), [tests/differential/reference-agent-driver.mjs:17](../../tests/differential/reference-agent-driver.mjs:17), [tests/conformance/harness-runtimes.conformance.test.ts:1](../../tests/conformance/harness-runtimes.conformance.test.ts:1). **Gate:** T2 para fixtures privadas; T3 se alterar contrato/qualificação.

## Ordem de aproveitamento recomendada

1. **Fundamentos verificáveis:** consolidar PAR-K01/K03 e a persistência PAR-S01 já planejados; fechar contenção e lifecycle PAR-X01–04. CX20-01/02/06/07/16 fornecem referências e critérios; não reabrem gates aprovados nem substituem as condições das SPECs0221/0222/0225.
2. **Interação e eficiência:** evoluir protocolo/SDK, contexto e saídas limitadas (CX20-03/04/05/08). Demonstrar uma jornada sintética completa de envio → eventos → aprovação → retomada → encerramento, com reinício e falhas controladas.
3. **Extensibilidade controlada:** instruções por escopo, catálogo progressivo e hooks (CX20-09/10/11), após confiança/configuração e lifecycle de capabilities definidos.
4. **Concorrência e autonomia:** subagentes, paralelismo e objetivos (CX20-12/13/14), depois de budget agregado, checkpoint e cancelamento comprovados. Workspace Git/patch (CX20-15) permanece opcional no consumidor de engenharia.

O uso real de cada mecanismo depende da jornada do consumidor. O código do Codex não substitui uma SPEC CVG. A proposta de fixture Codex deve ter referência e driver próprios; o comparador DeepSeek existente não é renomeado nem tem seu pin trocado.

## O que não importar diretamente

- Bypass geral de sandbox/aprovação ou trust de hooks anunciado pela CLI; incompatível com as regras do repositório. Revisor automático pode informar uma decisão, sem substituir approval/handoff obrigatório para ação sensível.
- Credenciais/identidade pessoais do Codex, modelos específicos e acesso a serviços gerenciados como dependência do núcleo neutro.
- SQLite/rollouts locais como substitutos automáticos de PostgreSQL/RLS e journal de efeitos. Persistência conversacional não prova exatamente-uma-vez de efeito externo.
- Memória aprendida, texto de workspace, resumo ou resposta de subagente como fonte institucional aprovada. Preservar proveniência, autoridade e distinção entre dado e instrução.
- Defaults de patch standalone que seguem symlinks, políticas de retry com ampliação de autoridade ou comandos arbitrários de hooks sem adaptação ao confinamento CVG.
- TUI, IDE, browser/computer-use e funções de programação como requisitos universais do harness; avaliar em adapters/consumidores separados.

O upstream está sob Apache-2.0; [LICENSE](evidence/REA-CODEX-20261017/UPSTREAM-LICENSE.txt) e [NOTICE](evidence/REA-CODEX-20261017/UPSTREAM-NOTICE.txt) foram preservados para os trechos de evidência. Nenhum código upstream foi integrado. Eventual incorporação de código/dependências requer a revisão correspondente, não só esta referência de licença.

## Verificação, continuidade e limites

As checagens da entrega estão em [verification.json](evidence/REA-CODEX-20261017/verification.json): capturas, decisões sintéticas, schemas, cobertura das 16 oportunidades, referências canônicas, hashes/identidade e documentação. Testes de runtime do harness, compilação/testes Rust, ensaio de segurança nativo, modelo real e certificação global **não foram executados** nesta rodada. Nenhuma equivalência funcional integral ou revisão independente nova foi concedida.

Estado/log/backlog compartilhados estavam modificados por outro trabalho na entrada. Pela regra5 de coordenação, o [handoff](../08_runtime/handoffs/rea_codex_20261017.md) contém os três deltas prontos para integração; os ledgers não foram sobrescritos. Claims e documentos de outros programas foram preservados.

**Próxima ação:** o integrador reconcilia CX20 com PAR/Claude100 no escopo existente e integra os deltas dos ledgers; para a primeira extensão escolhida, registra a task e prepara a SPEC curta ou o pacote T3 aplicável. A auditoria solicitada está concluída documentalmente; produção, paridade e cartões de implementação mantêm seus gates próprios.
