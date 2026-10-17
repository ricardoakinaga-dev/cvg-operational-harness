# G1 — Núcleo, modelo, sessão e contexto: análise de lacunas

Análise somente leitura. Referência: `/home/ricardo/deepseek-harness-session-fixes` @ `768fb1f3d3`. CVG: `/home/ricardo/Área de trabalho/cvg-operational-harness`. Nada foi editado, compilado ou executado.

Caminhos DeepSeek são relativos ao repo DeepSeek. Caminhos CVG são relativos ao repo CVG.

| Família | Cartão P100 | Capacidades | Presente | Parcial | Ausente | Esforço estimado |
|---|---|---|---|---|---|---|
| core | P100-012 | 5 | 0 | 3 | 2 | M |
| bundle | P100-012 | 3 | 0 | 2 | 1 | P |
| hooks | P100-012 | 3 | 0 | 0 | 3 | M |
| guard | P100-012 | 3 | 0 | 2 | 1 | P |
| preset | P100-012 | 3 | 0 | 1 | 2 | M |
| identity | P100-040 | 2 | 0 | 0 | 2 | P (com decisão de produto) |
| llm | P100-014 | 5 | 1 | 2 | 2 | M |
| session | P100-020 | 6 | 1 | 2 | 3 | G |
| session-query | P100-020 | 3 | 0 | 1 | 2 | M |
| context | P100-021 | 3 | 0 | 0 | 3 | P |
| compaction | P100-021 | 4 | 0 | 2 | 2 | M |
| spill | P100-021 | 2 | 0 | 0 | 2 | M |
| storage | P100-015 | 3 | 0 | 1 | 2 | M |
| typert | P100-025 | 2 | 0 | 0 | 2 | GG (sem uso hospitalar previsto) |
| util | P100-052 | 3 | 1 | 1 | 1 | P |

---

## core (cartão P100-012)

- Referência: `packages/core/agent`, `packages/core/agent-loop`, `packages/core/agent-default-model`.
- Arquivos-chave: `packages/core/agent/src/index.ts`, `packages/core/agent/src/dispatch.ts`, `packages/core/agent-loop/src/agent.ts`, `packages/core/agent-loop/src/tool-calls.ts`, `packages/core/agent-default-model/src/`.
- Capacidades da referência:
  - CORE-01 — criar, retomar, enviar follow-up/steering, cancelar e aguardar ociosidade de agente vivo — `packages/core/agent/README.md`
  - CORE-02 — registro de agentes vivos e atribuição de iniciador por processo — `packages/core/agent/src/index.ts`
  - CORE-03 — loop padrão: modelo, stream, execução de tools e histórico durável por turno — `packages/core/agent-loop/src/agent.ts`
  - CORE-04 — limite de chamadas de tool paralelas; chamadas exclusivas mantêm ordem — `packages/core/agent-loop/src/tool-calls.ts`
  - CORE-05 — modelo padrão de deployment, alterável em config viva — `packages/core/agent-default-model/README.md`
- CVG hoje:
  - CORE-01: PARCIAL — `packages/harness/src/iterative-runtime.ts`, `packages/harness/src/createOperationalHarness.ts` — inicia e retoma execução com checkpoint; não há API de agente vivo com steering e espera de ociosidade.
  - CORE-02: AUSENTE — sem registro de agentes vivos equivalente. Escopo por tenant/execução existe em outros pontos.
  - CORE-03: PARCIAL — `packages/harness/src/iterative-runtime.ts`, `packages/harness/src/iterative-dispatch.ts` — loop de passos com dispatch e checkpoint; é mais formal e menos flexível que o loop da referência.
  - CORE-04: AUSENTE — busca por `parallel` em `packages/harness/src` não retornou controle de concorrência de tools.
  - CORE-05: PARCIAL — modelo vem do perfil/composição do harness; não há config viva de modelo padrão.
- Lacunas numeradas:
  1. Registro de agentes vivos com cancelamento e espera de ociosidade — M — depende de core/session — risco de efeito duplicado se cancelamento não respeitar aprovações pendentes — relevância média: útil para acompanhar um turno em andamento, mas o plantão precisa de execução determinística, não de agentes soltos.
  2. Concorrência limitada de tools paralelas com ordem para tools exclusivas — M — depende de policy/approval — risco de efeito duplicado e de ordem de escrita em registros clínicos — relevância baixa: ganha desempenho, mas traz risco de ordem. Só vale se houver ganho medido.
  3. Modelo padrão em config viva — P — depende de identity não — risco baixo, desde que a troca não afete execuções já iniciadas — relevância baixa.
- Critério de aceite sugerido: duas tools marcadas como seguras rodam em paralelo com limite N; uma tool exclusiva roda sozinha e na ordem de chegada; cancelamento não executa efeito já aprovado e não aprovado.
- Fora de escopo razoável: API de agente vivo para UI de chat genérica. Dúvida: o harness de plantão precisa de steering humano durante um turno, ou basta handoff e aprovação?

## bundle (cartão P100-012)

- Referência: `packages/bundle/base`, `packages/bundle/headless`, `packages/bundle/acp-app`.
- Arquivos-chave: `packages/bundle/base/src/index.ts`, `packages/bundle/headless/README.md`, `packages/bundle/acp-app/README.md`.
- Capacidades da referência:
  - BUNDLE-01 — perfil base compartilhado: conexão com modelo, tools, sessão durável e defaults de segurança — `packages/bundle/base/README.md`
  - BUNDLE-02 — modo headless: uma tarefa por linha de comando, resposta final impressa e saída — `packages/bundle/headless/README.md`
  - BUNDLE-03 — perfil ACP stdio para automação, herdando o base com persona de código — `packages/bundle/acp-app/README.md`
- CVG hoje:
  - BUNDLE-01: PARCIAL — `packages/harness/src/kernel/profile.ts` (`standardKernelPlugins`), `packages/sdk/src/composition.ts` (`createSdk`, `createSdkMinimal`) — composição padrão existe; sem bundle nomeado de perfil.
  - BUNDLE-02: PARCIAL — `packages/sdk/src/`; não encontrei modo de tarefa única de linha de comando. Não verifiquei a CLI em `apps/`.
  - BUNDLE-03: AUSENTE — protocolo ACP stdio é de P100-025, não deste grupo.
- Lacunas numeradas:
  1. Perfis nomeados e herança entre perfis — M — depende de core, preset, hooks — risco: perfil herdado pode relaxar controles; deve ser DIVERGENTE_INTENCIONAL onde afrouxar controle obrigatório (ADR-011) — relevância média: deploy por unidade ou por tipo de plantão.
  2. Modo headless de tarefa única — P — depende de P100-040 (launch) — risco: execução sem humano exige approval/handoff explícitos, nunca auto-aprovação — relevância baixa para plantão; útil para testes e automação interna.
  3. Perfil ACP stdio — G — depende de P100-025 — fora deste grupo.
- Critério de aceite sugerido: perfil nomeado herdando base não remove nenhum controle obrigatório (teste negativo por controle); headless com ação sensível devolve handoff, não executa.
- Fora de escopo razoável: distribuição de bundles como pacotes públicos. Dúvida: haverá um perfil por unidade hospitalar?

## hooks (cartão P100-012)

- Referência: `packages/hooks/hook-protocol`, `packages/hooks/hooks-claude-code`, `packages/hooks/hooks-codex`.
- Arquivos-chave: `packages/hooks/hook-protocol/src/runner.ts`, `packages/hooks/hook-protocol/src/matcher.ts`, `packages/hooks/hooks-claude-code/README.md`, `packages/hooks/hooks-codex/README.md`.
- Capacidades da referência:
  - HOOKS-01 — protocolo comum de hooks: eventos, matcher, merge e runner — `packages/hooks/hook-protocol/src/runner.ts`
  - HOOKS-02 — bridge que executa `hooks.json`/settings do Claude Code: bloqueia prompt/tool, anexa contexto, força continuação — `packages/hooks/hooks-claude-code/README.md`
  - HOOKS-03 — bridge equivalente para hooks do Codex, com cinco pontos — `packages/hooks/hooks-codex/README.md`
- CVG hoje:
  - HOOKS-01: AUSENTE como protocolo de hooks configuráveis. Há serviços e controles obrigatórios em `packages/harness/src/kernel/types.ts` (waterfall ao redor da tool) e `packages/harness/src/kernel/controls.ts`, que não são configuráveis por arquivo.
  - HOOKS-02: AUSENTE — busca por `hooks.json`/`PreToolUse` sem resultado em `packages/*/src`.
  - HOOKS-03: AUSENTE.
- Lacunas numeradas:
  1. Protocolo de hooks configurável por arquivo — M — depende de core e approval — risco alto: hook que executa comando externo é superfície de execução; precisa de allowlist, approval e trilha de auditoria — relevância média: gates de pré-tool úteis, mas os controles obrigatórios já cobrem o caso principal.
  2. Bridge Claude Code — M — depende de 1 — risco alto: reaproveitar config de outra ferramenta traz comandos não revisados ao plantão — relevância baixa.
  3. Bridge Codex — M — depende de 1 — mesmo risco; relevância baixa.
- Critério de aceite sugerido: hook externo nunca altera decisão de controle obrigatório; hook que nega tool produz negação com motivo registrado no log; hook com erro falha fechado.
- Fora de escopo razoável: compatibilidade com config de Claude Code ou Codex. Recomendação: DIVERGENTE_INTENCIONAL até haver caso de uso aprovado. Dúvida: algum hook precisa rodar fora do processo?

## guard (cartão P100-012)

- Referência: `packages/guard/repeat-tool-reminder`, `packages/guard/timeout-policy`.
- Arquivos-chave: `packages/guard/repeat-tool-reminder/src/index.ts`, `packages/guard/timeout-policy/src/index.ts`.
- Capacidades da referência:
  - GUARD-01 — lembrete consultivo ao repetir a mesma tool com mesmos argumentos, nos limiares 3, 5 e 8; nunca bloqueia — `packages/guard/repeat-tool-reminder/src/index.ts`
  - GUARD-02 — timeout cooperativo por chamada de tool, com erro claro ao modelo após cancelamento — `packages/guard/timeout-policy/src/index.ts`
  - GUARD-03 — contagem de repetição isolada por agente e limpa por nova mensagem do usuário — `packages/guard/repeat-tool-reminder/README.md`
- CVG hoje:
  - GUARD-01: PARCIAL — `packages/harness/src/loop-detection.ts` (`detectDecisionCycle`) detecta ciclo de decisões, não repetição de tool com mesmos argumentos.
  - GUARD-02: PARCIAL — `packages/harness/src/kernel/types.ts:186` cita timeout no waterfall da tool; timeouts em `packages/adapters`, `packages/agent-runtime`. Sem política uniforme por tool.
  - GUARD-03: AUSENTE.
- Lacunas numeradas:
  1. Detector de repetição de tool com mesmos argumentos — P — depende de core — risco baixo; é consultivo — relevância média: evita gasto e loop em consulta de agenda ou exames.
  2. Política uniforme de timeout por tool, com cancelamento cooperativo — M — depende de core e approval — risco: timeout depois de efeito externo pode deixar efeito parcial; exige registro de incerteza — relevância alta: ações externas precisam de limite de tempo claro.
- Critério de aceite sugerido: a quarta chamada idêntica gera lembrete no log sem bloquear; tool que excede o limite recebe erro de timeout e o efeito aparece como pendente, não como concluído.
- Fora de escopo razoável: nenhum. Dúvida: qual é o limite de tempo aceitável por tipo de tool (agenda, exame, mensagem)?

## preset (cartão P100-012)

- Referência: `packages/preset/agent-preset`, `packages/preset/agent-preset-registry`, `packages/preset/persona`.
- Arquivos-chave: `packages/preset/agent-preset-registry/src/index.ts`, `packages/preset/agent-preset-registry/src/session.ts`, `packages/preset/persona/README.md`.
- Capacidades da referência:
  - PRESET-01 — definir plugins filhos por YAML declarativo, com vários presets e seleção por sessão — `packages/preset/agent-preset/README.md`
  - PRESET-02 — escolher ferramentas, seções de prompt e skills por preset; falhas de definição ficam visíveis; agentes existentes mantêm a composição — `packages/preset/agent-preset-registry/src/index.ts`
  - PRESET-03 — persona como linha composável que sobrescreve prefixo e sufixo do prompt por sessão — `packages/preset/persona/README.md`
- CVG hoje:
  - PRESET-01: AUSENTE — sem definição declarativa de composição por arquivo.
  - PRESET-02: PARCIAL — composição feita em código (`packages/harness/src/createOperationalHarness.ts`, `packages/harness/src/kernel/profile.ts`); sem seleção por sessão nem visibilidade de falhas.
  - PRESET-03: PARCIAL — `persona` aparece em `packages/agent-evals/src/agent.ts` e `packages/channel-gateway`, sem persona composável por sessão.
- Lacunas numeradas:
  1. Registro de presets declarativos com validação e seleção por sessão — M — depende de bundle e hooks — risco: preset pode remover controle obrigatório; a validação deve recusar preset sem controles (ADR-011) — relevância média: permite perfil por unidade sem código novo.
  2. Persona por sessão — P — depende de 1 — risco: persona não pode sobrepor regras de segurança clínica — relevância média: tom de comunicação com tutores, nunca conteúdo clínico.
  3. Visibilidade de definições com falha — P — depende de 1 — relevância baixa.
- Critério de aceite sugerido: preset sem controle obrigatório é recusado com erro explícito; mudança de preset não altera sessão já criada; persona não remove itens da lista de bloqueios.
- Fora de escopo razoável: YAML público do Cordis. Dúvida: quem edita presets no plantão, equipe técnica ou gestão?

## identity (cartão P100-040)

- Referência: `packages/identity/anonymous-user-id`.
- Arquivos-chave: `packages/identity/anonymous-user-id/src/index.ts`, `packages/identity/README.md`.
- Capacidades da referência:
  - IDENT-01 — um UUID anônimo por diretório de instalação, persistido em arquivo local, correlaciona telemetria e feedback — `packages/identity/anonymous-user-id/README.md`
  - IDENT-02 — homes diferentes geram identificadores diferentes; o valor não tem dados de máquina nem de conta — `packages/identity/anonymous-user-id/README.md`
- CVG hoje:
  - IDENT-01: AUSENTE — busca por `anonymous` sem resultado em `packages/*/src`.
  - IDENT-02: AUSENTE. Identificadores de execução existem, mas são de tenant e processo.
- Lacunas numeradas:
  1. Identificador de instalação anônimo — P — depende de P100-040 — risco de privacidade: em hospital, qualquer identificador estável pode virar dado pessoal de equipe ou tutor (LGPD). Recomendo DIVERGENTE_INTENCIONAL para plantão — relevância baixa.
- Critério de aceite sugerido: se implementado, o identificador não é derivado de dados de paciente, equipe ou tutor e não sai do ambiente sem autorização.
- Fora de escopo razoável: telemetria anônima de produto. Dúvida: a instalação hospitalar pode ter identificador estável sem consentimento explícito?

## llm (cartão P100-014)

- Referência: `packages/llm/llm`, `packages/llm/llm-deepseek`, `packages/llm/llm-deepseek-api-key`, `packages/llm/llm-deepseek-account`, `packages/llm/llm-retry`, `packages/llm/deepseek-llm-api-extensions`.
- Arquivos-chave: `packages/llm/llm/src/index.ts`, `packages/llm/llm/src/assembler.ts`, `packages/llm/llm-retry/src/index.ts`, `packages/llm/llm-deepseek/src/`, `packages/llm/deepseek-llm-api-extensions/src/`.
- Capacidades da referência:
  - LLM-01 — chamada de modelo em stream com adaptadores por provedor; cada stream termina sempre em resultado terminal — `packages/llm/llm/README.md`
  - LLM-02 — requisições montadas pelo loop chegam congeladas; adaptadores não as reescrevem — `packages/llm/llm/README.md`
  - LLM-03 — retry em fronteiras de passo durável, com política por provedor e agendamento gravado antes do backoff — `packages/llm/llm-retry/README.md`
  - LLM-04 — transporte de mensagens do provedor DeepSeek com autenticação por chave ou conta e modelos descobertos — `packages/llm/llm-deepseek/README.md`
  - LLM-05 — registro de campos de nível superior adicionais na API do provedor — `packages/llm/deepseek-llm-api-extensions/README.md`
- CVG hoje:
  - LLM-01: AUSENTE — `packages/model-gateway/src/providers/openai-compatible.ts:145` e `packages/model-gateway/src/providers/ollama.ts:120` fixam `stream: false`. Não há stream no gateway.
  - LLM-02: PARCIAL — `packages/model-gateway/src/gateway.ts` valida contratos; não há congelamento da requisição.
  - LLM-03: PRESENTE — `packages/model-gateway/src/retry.ts` (`computeRetryDelayMs`, `isRetryable`) e `packages/model-gateway/src/circuit-breaker.ts`. Falta gravar tentativa agendada no log antes do backoff.
  - LLM-04: AUSENTE — sem provedor DeepSeek em `packages/model-gateway/src/providers/` (há `deterministic.ts`, `openai-compatible.ts`, `ollama.ts`).
  - LLM-05: AUSENTE.
  - Complemento (fora da lista): budgets em `packages/model-gateway/src/budget.ts` e medidor de usage em `packages/model-gateway/src/token-meter.ts`. Ambos existem; a referência não tem o mesmo desenho de escopo.
- Lacunas numeradas:
  1. Streaming com resultado terminal, cancelamento e usage parcial — M — depende de core — risco: stream interrompido pode gravar resposta parcial como final; exige estado terminal explícito — relevância média: melhora latência percebida; não é requisito de segurança.
  2. Requisição congelada antes do adaptador — P — depende de 1 — relevância baixa.
  3. Gravação de tentativa de retry no log antes do backoff — M — depende de session (checkpoint) — risco: retry sem registro pode repetir efeito externo — relevância alta: evita duplicidade em ação que já foi enviada.
  4. Adaptador DeepSeek Messages com autenticação por chave — M — depende de 1 e de P100-040 — risco: credencial; provedor real só com gate T4 (regra do cartão) — relevância média: escolha de provedor, não funcionalidade clínica.
  5. Campos de extensão por provedor — P — depende de 4 — relevância nenhuma para plantão.
- Critério de aceite sugerido: stream encerra com exatamente um resultado terminal (sucesso, falha ou cancelamento); retry grava a tentativa antes do backoff; provedor DeepSeek falha fechado sem chave.
- Fora de escopo razoável: login por conta DeepSeek. Dúvida: o hospital quer provedor DeepSeek ou só o atual?

## session (cartão P100-020)

- Referência: `packages/session/*` (grupo com ~25 pacotes): `session-persistence`, `session-persistence-jsonl`, `session-checkpoint-policy`, `session-format-catalog`, `session-format-v0-to-v1` a `v3-to-v4`, `session-projection`, `session-projection-cache`, `session-stats`, `session-turn-outline`, `session-title`, `session-telemetry`, `session-telemetry-otel`, `session-log-deepseek`.
- Arquivos-chave: `packages/session/session-persistence/src/index.ts`, `packages/session/session-persistence-jsonl/src/storage.ts`, `packages/session/session-checkpoint-policy/README.md`, `packages/session/session-format-catalog/src/index.ts`, `packages/session/session-projection/src/index.ts`, `packages/session/session-stats/src/projection.ts`, `packages/session/session-turn-outline/src/projection.ts`, `packages/session/session-title/src/index.ts`.
- Capacidades da referência:
  - SESSION-01 — API de persistência com criar, abrir, listar, anexar, ler, flush e fechar; histórico append-only contíguo — `packages/session/session-persistence/README.md`
  - SESSION-02 — checkpoint antes de requisição de modelo, antes de efeito externo de tool e antes do próximo passo; retomada após crash — `packages/session/session-checkpoint-policy/README.md`
  - SESSION-03 — formatos de sessão com migrações adjacentes de v0 a v4 e formatos históricos preservados — `packages/session/session-format-catalog/src/index.ts`
  - SESSION-04 — projeções por sessão (estado atual) com cache de checkpoint: todos, metas, estatísticas — `packages/session/session-projection/README.md`
  - SESSION-05 — estatísticas da sessão inteira (turnos, passos, tempos de LLM e tool) e esboço de turnos — `packages/session/session-stats/src/projection.ts`, `packages/session/session-turn-outline/src/projection.ts`
  - SESSION-06 — título de sessão a partir da primeira mensagem humana ou de gerador opcional — `packages/session/session-title/README.md`
- CVG hoje:
  - SESSION-01: PRESENTE — `packages/contracts/src/session-events.ts` (catálogo v1 com fingerprints), `packages/harness/src/session/memory.ts`, `packages/persistence/src/session-events.ts` (`PostgresSessionEventStore`).
  - SESSION-02: PARCIAL — `packages/harness/src/session/kernel-log.ts`, `packages/harness/src/effect-journal.ts`, `packages/harness/src/step-store.ts`. Há registro e journal de efeitos, mas não há a política de checkpoint antes de requisição e antes de efeito como contrato explícito. Verificar antes de afirmar.
  - SESSION-03: PARCIAL — `packages/harness/src/session/format-migration.ts` tem mecanismo de registro de migração, mas só a definição v1 (`sessionFormatDefinitionV1`). Não há cadeia v0→v4.
  - SESSION-04: AUSENTE — nenhuma projeção de sessão em `packages/harness` ou `packages/persistence`.
  - SESSION-05: AUSENTE — sem estatísticas de sessão nem esboço de turnos (busca `outline` com 1 arquivo, sem relação).
  - SESSION-06: AUSENTE.
- Lacunas numeradas:
  1. Checkpoint explícito antes de modelo e antes de efeito externo, com retomada após crash — G — depende de persistence (P100-015) e de llm (LLM-03) — risco alto: sem isso, efeito externo pode repetir após crash; é o ponto mais crítico do grupo — relevância alta: passagem de plantão e continuidade de turno dependem disso.
  2. Cadeia de migração de formato além da v1 — M — depende de 1 — risco: migração que reescreve histórico clínico é inaceitável; deve ser adjacente e preservar o original — relevância média: só se houver mudança de formato planejada.
  3. Projeções de estado atual (pendências, metas, passagem) com cache — M — depende de 1 — risco: projeção desatualizada pode orientar decisão errada; deve citar o evento de origem — relevância alta: resumo de passagem de plantão é projeção.
  4. Estatísticas e esboço de turnos — P cada — depende de 3 — relevância média: revisão de turno e auditoria.
  5. Título de sessão — P — depende de 3 — relevância baixa.
  6. Formato de exportação/importação versionado — M — depende de 2 — relevância média.
- Critério de aceite sugerido: após crash entre modelo e tool, a retomada não repete efeito externo já registrado e reexecuta apenas o que não tem registro de conclusão; projeção de passagem cita o evento de origem de cada item.
- Fora de escopo razoável: telemetria de sessão via OTel e envio de cópia a serviço externo. Recomendo DIVERGENTE_INTENCIONAL no plantão: enviar sessão clínica para fora do ambiente conflita com sigilo. Dúvida: qual política de retenção de sessão o hospital aprova?

## session-query (cartão P100-020)

- Referência: `packages/session-query/session-query`, com busca por texto completo via backend SQLite opcional.
- Arquivos-chave: `packages/session-query/session-query/src/index.ts`, `src/filters.ts`, `src/cursor.ts`, `src/tracing.ts`.
- Capacidades da referência:
  - QUERY-01 — listar, filtrar, ler e buscar histórico de sessões; leituras preferem sessão viva e devolvem cópias — `packages/session-query/session-query/README.md`
  - QUERY-02 — rastrear relações entre sessão e eventos, com contexto limitado por evento — `packages/session-query/session-query/src/tracing.ts`
  - QUERY-03 — busca ranqueada por texto completo com backend opcional — `packages/session-query/session-query/README.md`
- CVG hoje:
  - QUERY-01: PARCIAL — `packages/persistence/src/session-events.ts` lê eventos por stream (`SessionEventRead` em `packages/contracts/src/session-events.ts`); sem filtro, cursor e listagem.
  - QUERY-02: AUSENTE — sem rastreio de relação entre eventos.
  - QUERY-03: AUSENTE.
- Lacunas numeradas:
  1. Consulta com filtro, cursor e leitura consistente — M — depende de SESSION-01 — risco de isolamento: consulta deve respeitar tenant e RLS (ADR-011) — relevância alta: a equipe consulta o histórico do turno.
  2. Rastreio de relações (aprovação → efeito → evento) — M — depende de 1 — relevância alta para auditoria de ação sensível.
  3. Busca textual ranqueada — G — depende de 1 — risco: indexar dado clínico exige política de retenção e acesso — relevância média.
- Critério de aceite sugerido: consulta de sessão de outro tenant retorna vazio ou negação; rastreio de uma aprovação mostra o efeito e o evento de origem.
- Fora de escopo razoável: busca de texto completo sem política de acesso. Dúvida: a equipe precisa de busca livre ou basta consulta por identificador?

## context (cartão P100-021)

- Referência: `packages/context/agent-instructions`, `packages/context/file-reference`, `packages/context/file-reference-local`.
- Arquivos-chave: `packages/context/agent-instructions/src/files.ts`, `packages/context/agent-instructions/src/render.ts`, `packages/context/file-reference-local/README.md`.
- Capacidades da referência:
  - CTX-01 — carrega instruções de workspace de `AGENTS.md`/`CLAUDE.md` globais e de projeto, na primeira requisição — `packages/context/agent-instructions/README.md`
  - CTX-02 — completa menções `@arquivo` em UI com caminhos ranqueados do workspace local — `packages/context/file-reference-local/README.md`
  - CTX-03 — gramática de menção e descoberta para UIs hospedadas — `packages/context/file-reference/README.md`
- CVG hoje:
  - CTX-01: AUSENTE — busca por `AGENTS.md` em `packages/*/src` sem resultado. O `AGENTS.md` do repo serve aos agentes de desenvolvimento, não ao runtime.
  - CTX-02: AUSENTE — busca por `fileReference` sem resultado.
  - CTX-03: AUSENTE.
- Lacunas numeradas:
  1. Carga de instruções de workspace no runtime — P — depende de core — risco: instrução de arquivo do workspace pode injetar comando no prompt; precisa de origem fixa e aprovada — relevância baixa para plantão.
  2. Completion de arquivos — P — depende de UI — relevância nenhuma para o motor; útil só em painel humano.
- Critério de aceite sugerido: instrução carregada vem de caminho aprovado e aparece no prompt como fonte; arquivo fora da raiz do workspace não é listado.
- Fora de escopo razoável: UI de completion. Dúvida: haverá UI própria de plantão que use referência a arquivos?

## compaction (cartão P100-021)

- Referência: `packages/compaction/compaction`, `compaction-basic`, `command-compact`, `compaction-image-offload`, `compaction-tool-result-pruner`, `compaction-resilience-policy`.
- Arquivos-chave: `packages/compaction/compaction-basic/src/summarizer.ts`, `packages/compaction/compaction-basic/src/region.ts`, `packages/compaction/compaction-tool-result-pruner/src/index.ts`, `packages/compaction/compaction-image-offload/src/image-offload.ts`.
- Capacidades da referência:
  - COMP-01 — condensação automática do histórico antigo sob pressão de tokens, preservando mensagens recentes; condensa e tenta de novo após erro de overflow — `packages/compaction/compaction-basic/README.md`
  - COMP-02 — `/compact` manual, com opção de podar saída de tool antes — `packages/compaction/command-compact/README.md`
  - COMP-03 — poda de saída de tool acima do orçamento, com cabeça, marcador e cauda — `packages/compaction/compaction-tool-result-pruner/README.md`
  - COMP-04 — descarregamento de imagens antigas por texto com caminho de leitura, sem gastar retry do provedor — `packages/compaction/compaction-image-offload/src/image-offload.ts`
- CVG hoje:
  - COMP-01: PARCIAL — `packages/harness/src/compaction.ts` (`compactConversation`, `createCompactionControl`) mantém 4 mensagens recentes e resumo de até 512 caracteres por heurística. Não há condensação com requisição extra de modelo nem retry após overflow. `packages/harness/src/context-engine.ts` estima tokens em 4 caracteres.
  - COMP-02: PARCIAL — existe controle de compactação; não encontrei comando manual de usuário.
  - COMP-03: AUSENTE — busca por `prune` sem resultado de poda de tool.
  - COMP-04: AUSENTE.
- Lacunas numeradas:
  1. Compactação sob pressão com resumo por modelo, preservando fatos, obrigações e aprovações — M — depende de llm (LLM-01/03) e de session (SESSION-02) — risco: resumo que perde aprovação ou obrigação é falha clínica — relevância alta para passagem de plantão longa.
  2. Pressão de tokens calculada antes do dispatch, com usage por tentativa — P — depende de llm — relevância média.
  3. Poda de saída de tool com limite — P — depende de spill (item 1) — relevância média: exame e laudo grande.
  4. Descarregamento de imagem antiga — M — depende de storage — relevância média: imagens de exame.
  5. `/compact` manual — P — depende de 1 — relevância baixa.
- Critério de aceite sugerido: histórico com aprovação pendente e obrigação aberta mantém ambos após compactação (teste por fato); overflow não chama o provedor sem antes compactar; compactação cancelada não grava resumo.
- Fora de escopo razoável: compactação pela referência sem ajuste ao texto clínico. Dúvida: o resumo de passagem é o mesmo que o resumo de contexto, ou são produtos diferentes?

## spill (cartão P100-021)

- Referência: `packages/spill/spill`, `spill-local`, `spill-policy`.
- Arquivos-chave: `packages/spill/spill/README.md`, `packages/spill/spill-policy/src/index.ts`, `packages/spill/spill-policy/src/retention.ts`.
- Capacidades da referência:
  - SPILL-01 — salvar texto grande por API pública e receber localizador opaco, contagem exata de bytes e orientação de leitura — `packages/spill/spill/README.md`
  - SPILL-02 — política que mantém resultado de tool e imagem dentro do orçamento, com prévia de cabeça e cauda e caminho para o arquivo completo — `packages/spill/spill-policy/src/index.ts`
- CVG hoje:
  - SPILL-01: AUSENTE — busca por `spill` sem resultado. Há proposta pendente na SPEC0224 (`docs/02_spec/0224_pare100_complete_tool_result_context.md`), sem código.
  - SPILL-02: AUSENTE.
- Lacunas numeradas:
  1. Armazenamento de texto grande com localizador — M — depende de storage (STORAGE-01) — risco: arquivo local de sessão pode vazar dado clínico; precisa de permissão restrita e retenção definida — relevância média: exame e laudo grandes.
  2. Política de prévia com cabeça e cauda — P — depende de 1 — risco: prévia omite informação relevante; deve indicar que há conteúdo omitido — relevância média.
- Critério de aceite sugerido: texto acima do limite é gravado, o modelo recebe localizador e prévia com aviso de corte; falha de gravação deixa o conteúdo inline ou falha a ação, nunca descarta em silêncio.
- Fora de escopo razoável: retenção automática sem política aprovada. Dúvida: qual é o prazo de retenção de resultado de tool com dado clínico?

## storage (cartão P100-015)

- Referência: `packages/storage/storage`, `storage-domain`, `storage-json`, `storage-sqlite`.
- Arquivos-chave: `packages/storage/storage-domain/src/domain.ts`, `packages/storage/storage-json/README.md`, `packages/storage/storage-sqlite/README.md`.
- Capacidades da referência:
  - STOR-01 — domínios de chave-valor tipados com validação de esquema; leitura síncrona em memória e escrita durável antes de resolver — `packages/storage/storage-domain/README.md`
  - STOR-02 — backend JSON legível, com layout de unidade única ou por registro — `packages/storage/storage-json/README.md`
  - STOR-03 — backend SQLite com uma linha por registro, atualização de um registro por vez — `packages/storage/storage-sqlite/README.md`
- CVG hoje:
  - STOR-01: AUSENTE — sem API de domínio de chave-valor tipada. `packages/platform/src/test-lab.ts` menciona KV apenas em teste.
  - STOR-02: AUSENTE.
  - STOR-03: PARCIAL — `packages/persistence/src/postgres.ts` e repositórios com PostgreSQL e RLS são a autoridade institucional (ADR-011). Não há backend SQLite nem JSON; o cartão P100-015 exige esses backends por perfil.
- Lacunas numeradas:
  1. API de domínio tipada sobre o backend PostgreSQL — M — depende de persistence — risco de isolamento: domínio deve herdar RLS e tenant — relevância média: dados de sidecar de sessão e de agenda.
  2. Backends JSON e SQLite para perfis sem PostgreSQL — G — depende de 1 — risco: dois backends podem divergir; exige teste de conformidade único e recusa de dual-write silencioso — relevância baixa para hospital, que usa PostgreSQL.
  3. Decisão de produto: manter só PostgreSQL. Recomendo DIVERGENTE_INTENCIONAL para plantão.
- Critério de aceite sugerido: a mesma suíte de conformidade passa em todo backend declarado; uma tenant não lê domínio de outra (teste negativo).
- Fora de escopo razoável: backends que o hospital não usa. Dúvida: o produto precisa de modo local sem PostgreSQL (por exemplo, para demonstração)?

## typert (cartão P100-025)

- Referência: `packages/typert/protocol`, `generator`, `loader`.
- Arquivos-chave: `packages/typert/protocol/src/index.ts`, `packages/typert/generator/README.md`, `packages/typert/loader/README.md`.
- Capacidades da referência:
  - TYP-01 — expor métodos do host a clientes remotos por decorador, com namespace e codificadores — `packages/typert/protocol/README.md`
  - TYP-02 — gerar artefatos de tipos e carregá-los no registro de tempo de execução — `packages/typert/generator/README.md`
- CVG hoje:
  - TYP-01: AUSENTE — busca por `Remote(` sem resultado. O CVG usa esquemas em `packages/contracts` e `packages/sdk`.
  - TYP-02: AUSENTE.
- Lacunas numeradas:
  1. Protocolo remoto por decorador — GG — depende de SDK (P100-025) — risco de superfície: exposição de método do host a cliente remoto precisa de autorização por método — relevância nenhuma para o plantão, que expõe API por contrato.
  2. Gerador de artefatos de tipos — G — depende de 1 — relevância nenhuma.
- Critério de aceite sugerido: se implementado, método sem autorização explícita não é exposto.
- Fora de escopo razoável: tudo deste grupo. Recomendo DIVERGENTE_INTENCIONAL: o CVG expõe contratos versionados. Dúvida: há cliente remoto que exija este protocolo?

## util (cartão P100-052)

- Referência: `packages/util/atomic-write`, `packages/util/brand`, `packages/util/chunked-list`.
- Arquivos-chave: `packages/util/atomic-write/src/index.ts`, `packages/util/brand/src/index.ts`, `packages/util/chunked-list/README.md`.
- Capacidades da referência:
  - UTIL-01 — substituição atômica de arquivo com trava de escrita entre processos e proteção contra link simbólico — `packages/util/atomic-write/README.md`
  - UTIL-02 — tipos nominais para strings e números (por exemplo, `SessionId` não substitui `ToolCallId`) — `packages/util/brand/README.md`
  - UTIL-03 — listas imutáveis com anexo limitado e validação de checkpoint — `packages/util/chunked-list/README.md`
- CVG hoje:
  - UTIL-01: PARCIAL — escrita e idempotência em `packages/agent-core/src/commands/receive-inbound-message.ts`, `packages/channel-gateway/src/idempotency.ts`, `packages/agent-runtime/src/effect-journal.ts`. Não há utilitário único de escrita atômica.
  - UTIL-02: PRESENTE — tipos de marca em `packages/contracts/src/contracts.ts`, `packages/conversation/src/contracts.ts`, `packages/agent-runtime/src/runtime.ts`.
  - UTIL-03: AUSENTE — sem lista imutável com anexo limitado (busca por `chunked` sem resultado).
- Lacunas numeradas:
  1. Utilitário de escrita atômica para arquivos locais — P — depende de nada — relevância baixa; o CVG grava principalmente em PostgreSQL.
  2. Tipos nominais uniformes para identificadores de sessão, tool e efeito — P — relevância média: reduz troca de identificador entre entidades clínicas.
  3. Lista imutável para projeções — P — depende de SESSION-04 — relevância baixa.
- Critério de aceite sugerido: tentativa de passar `SessionId` onde se espera `ToolCallId` falha na compilação.
- Fora de escopo razoável: nenhum. Dúvida: é preciso escrita local de arquivo além do PostgreSQL?

---

## Riscos transversais

- Efeito duplicado: retry (LLM-03), retomada após crash (SESSION-02) e timeout (GUARD-02) podem repetir ação externa. Exigir registro antes e depois de cada efeito.
- Telemetria e exportação: `session-telemetry`, `session-telemetry-otel` e `identity` enviam dados de sessão ou identificadores para fora. Desligar no plantão até haver base legal e aprovação.
- Controles obrigatórios: hooks, presets e perfis podem remover controle. Validar na carga que nenhum controle obrigatório (ADR-011) foi removido.
- Isolamento: domínios de storage, consulta e busca precisam de tenant e RLS. Teste negativo por tenant em cada família.
- Dado clínico em arquivo local: spill, storage JSON e atomic-write podem gravar prontuário em disco. Restringir permissão e definir retenção antes de implementar.

## Ordem sugerida

1. Checkpoint e retomada sem efeito duplicado (SESSION-02, LLM-03), com persistence de P100-015.
2. Streaming e estado terminal do gateway (LLM-01), depois compactação sob pressão (COMP-01).
3. Projeções de passagem de plantão e consulta com rastreio (SESSION-04, QUERY-01/02).
4. Spill e poda de tool output (SPILL-01, COMP-03), depois storage de domínio (STOR-01).
5. Itens de baixa relevância (hooks, typert, identity, bundles headless) ficam em backlog ou DIVERGENTE_INTENCIONAL até decisão do produto.

## Modelo

Haiku 5.5 (`claude-haiku-5-5`).
