# G3 — Orquestração e extensões: lacunas CVG × DeepSeek Harness

Referência: `/home/ricardo/deepseek-harness-session-fixes` (768fb1f3, 0.2.0-rc.1). CVG: `cvg-operational-harness`.
Método: README e índices dos pacotes de referência; grep e leitura dirigida no CVG. Nada foi executado.
Achado central: o CVG não tem nenhum mecanismo de subagente, PTC, workflow, Ralph, goal/plan/todo, jobs de agente, schedule, Agent Teams, extensões Cordis, guest Web Worker, auto-review ou inspector. Os termos `subagent`, `ralph`, `cron`, `agent-team`, `ptc`, `cordis` (como recurso) e `inspector` não aparecem no código-fonte fora de testes (grep em `packages`, `apps`, `products`). Há apenas peças vizinhas: loop iterativo com orçamentos, outbox durável, sweeps periódicos, webhooks de canal, aprovação/handoff e OTEL.

| Família | Cartão P100 | Capacidades | Presente | Parcial | Ausente | Esforço estimado |
|---|---|---|---|---|---|---|
| subagent | P100-033 | 8 | 0 | 1 | 7 | G |
| ptc-runtime (+python) | P100-034 | 6 | 0 | 1 | 5 | G |
| workflow (+ralph) | P100-035 | 6 | 0 | 1 | 5 | M a G |
| goal / plan / todo | P100-036 | 7 | 0 | 2 | 5 | M |
| jobs / schedule / webhook | P100-037 | 9 | 0 | 4 | 5 | G |
| agent-team (+profile, tool, ui) | P100-038 | 7 | 0 | 0 | 7 | G |
| extensions Cordis | P100-045 | 5 | 0 | 1 | 3 (+1 divergente) | M |
| webworker-packer/runtime | P100-045 | 3 | 0 | 0 | 3 | G (baixa prioridade) |
| auto-review / inspector | P100-046 | 5 | 0 | 2 | 2 (+1 divergente) | M |
| **Total** | | **56** | **0** | **12** | **40** | |

(Divergentes intencionais contados à parte: 3 itens, ver seções.)

---

## subagent (cartão P100-033)
- Referência: `packages/subagent/{subagent, tool-subagent, tool-subagent-control, subagent-in-process-driver, subagent-spawn-in-process, subagent-fork-in-process, subagent-acp, subagent-dsh-sdk, subagent-codex, subagent-claude-code}`; arquivos-chave: `*/README.md`, `subagent/src` (registro `ctx.subagents`).
- Capacidades da referência:
  - SUB-01 — Serviço de delegação com registro de provedores nomeados (`ctx.subagents`); vários backends lado a lado — `subagent/subagent/README.md`
  - SUB-02 — Ferramenta modelo-facing `subagent` por provedor: modo one-shot (espera o filho) e continuável (retorna id) — `tool-subagent/README.md`
  - SUB-03 — Filho in-process "spawn" (limpo) e "fork" (semeado com turnos concluídos do pai) — `subagent-spawn-in-process`, `subagent-fork-in-process`
  - SUB-04 — Controle de filhos continuáveis: `send_message`, `interrupt_agent`, `list_agents` — `tool-subagent-control/README.md`
  - SUB-05 — Limites por instância: persona, acesso a tools, profundidade — `tool-subagent/README.md`
  - SUB-06 — Provedores externos: ACP, SDK dsh, Codex, Claude Code (processo isolado, ambiente sem credenciais do pai) — `subagent-acp`, `subagent-dsh-sdk`, `subagent-codex`, `subagent-claude-code`
  - SUB-07 — Seleção de provedor/modelo/esforço do filho entre opções aprovadas — `tool-subagent/README.md`
  - SUB-08 — Inspeção: modo, atividade ao vivo, última conclusão, linhagem; falha do filho vira erro, nunca sucesso parcial — `subagent/README.md`
- CVG hoje:
  - SUB-01: AUSENTE — sem registro de delegação; `packages/orchestrator` só decide passos de um único agente.
  - SUB-02: AUSENTE — o catálogo `docs/architecture/TOOL_CATALOG.md` só lista fs.*, exam.*, shell.run.
  - SUB-03: AUSENTE.
  - SUB-04: AUSENTE.
  - SUB-05: PARCIAL — `packages/harness/src/iterative-runtime.ts` tem orçamento (`maxSteps`, `maxToolCalls`, `maxDurationMs`, `maxCostUsd`) e `packages/agent-core` tem ciclo de vida de run; falta profundidade/herança de autoridade para filhos.
  - SUB-06: AUSENTE.
  - SUB-07: AUSENTE — `packages/model-gateway` roteia modelos, sem escolha por filho.
  - SUB-08: AUSENTE — existe trajetória (`packages/harness/src/trajectory.ts`), sem linhagem pai/filho.
- Lacunas:
  1. Registro de subagentes + driver in-process (spawn/fork) sobre `agent-runtime` (G). Dep.: P100-025 (SDK/controles), P100-024, P100-026. Risco: filho ampliar tool/grant/tenant; efeito duplicado em retry do pai. Relevância: média (ex.: agente de exames delegando leitura de laudos a filho de leitura apenas).
  2. Herança estrita de autoridade, orçamento e tenant (filho recebe subconjunto; ancestry no audit) (M). Dep.: 1. Risco alto (autorização). Relevância: alta.
  3. Mailbox/continuação/interrupt/lista com persistência PostgreSQL e retomada após restart (G). Dep.: 1, P100-020. Risco: mensagem entregue duas vezes. Relevância: média.
  4. Provedores externos (ACP/SDK/Codex/Claude Code) (G cada, opcional). Risco: isolamento de processo e credenciais. Relevância: baixa (hospital não precisa de agentes de código externos).
  5. Seleção de modelo por filho e inspeção de linhagem (P a M). Relevância: baixa a média.
- Critério de aceite: filho sintético nunca executa tool fora do grant do pai, ancestry correta no audit, falha parcial devolve erro, restart retoma mensagem sem duplicar efeito.
- Fora de escopo razoável: backends Codex e Claude Code (produtos de terceiros); decidir se ACP/SDK entram só como double. Dúvida: filho deve ser sempre in-process sob o mesmo kernel (recomendado).

## ptc-runtime (cartão P100-034)
- Referência: `packages/ptc-runtime/{ptc-runtime, ptc-runtime-node}`, `packages/experimental/ptc-runtime-python`; arquivos-chave: READMEs e protocolo fd-3 do Python.
- Capacidades da referência:
  - PTC-01 — Seam `ctx.ptcRuntime`: `resolve(request)` + `run(spec)` executa um programa escrito pelo modelo contra bindings do host; resultado JSON, logs ordenados por canal, erro estruturado — `ptc-runtime/README.md`
  - PTC-02 — Backend Node em subprocesso com limites (timeout, heap, saída, chamadas pendentes, mensagem) e término gerenciado — `ptc-runtime-node/README.md`
  - PTC-03 — Backend Python (CPython 3.10+, subprocesso por requisição, `await` de topo, protocolo fd-3) — `experimental/ptc-runtime-python/README.md`
  - PTC-04 — Cada subchamada de tool dentro do programa passa pelo pipeline normal de tools — `dsh-tools` modo PTC
  - PTC-05 — Taxonomia de falhas (parse, exceção, saída excessiva, orçamento, abort, morte do substrato) — `PtcRunFailure.kind`
  - PTC-06 — Descritores de linguagem e isolamento; execução isolada entre runs, sem estado — README
- CVG hoje:
  - PTC-01: AUSENTE — sem seam de execução de programa do modelo.
  - PTC-02: PARCIAL — `packages/sandbox/src/shell-tool.ts` roda um comando em argv puro com limites de processo; não executa programa com bindings.
  - PTC-03: AUSENTE.
  - PTC-04: AUSENTE — mas o pipeline do kernel (`packages/harness/src/kernel/pipeline.ts`, `tool-invocation-boundary.ts` em `packages/platform`) é o destino natural.
  - PTC-05: AUSENTE.
  - PTC-06: AUSENTE.
- Lacunas:
  1. Seam PTC + backend Node em subprocesso/worker isolado, bindings = tools do registro (G). Dep.: P100-024, P100-030 (sandbox). Risco: escape, loop, saída excessiva; subchamada contornar aprovação/audit. Relevância: baixa a média (útil a agentes de leitura em lote; não clínico).
  2. Contabilidade e controles por subchamada (aprovação, journal, idempotência) (M). Risco alto: efeito externo repetido se o programa for reexecutado.
  3. Backend Python (M, opcional). Relevância: baixa; o próprio DeepSeek marca como experimental e sem fronteira de segurança.
- Critério de aceite: programa sintético com N subchamadas gera N entradas de audit/journal; escape, loop infinito e saída enorme são negados e o processo termina.
- Fora de escopo razoável: Python (sugerir adiar); dúvida sobre se PTC é desejável num hospital, dada a superfície de ataque. Alternativa: tools compostas pré-aprovadas.

## workflow (cartão P100-035)
- Referência: `packages/workflow/{workflow, workflow-ptc, tool-workflow, tool-ralph}`.
- Capacidades da referência:
  - WF-01 — Seam `ctx.workflowEngine`: script JS do modelo coordena filhos com `agent()`, `parallel()`, `pipeline()`, `phase()`, `log()` e devolve JSON — `workflow/README.md`
  - WF-02 — Tool `workflow` (meta, script, args), execução em primeiro plano ou `run_in_background` com id de job e saída ao vivo — `tool-workflow/README.md`
  - WF-03 — Engine em processos Node isolados sob política de sandbox da sessão (`workflow-ptc`), cancelamento descarta filhos — `workflow-ptc/README.md`
  - WF-04 — Cancelamento/anormal vira erro, nunca sucesso parcial; limite de caracteres do resultado — `tool-workflow/README.md`
  - WF-05 — Loop Ralph: rodadas de filho novo sobre objetivo imutável, só relatório limitado passa entre rodadas, `maxRounds` — `tool-ralph/README.md`
  - WF-06 — Validação do relatório da rodada e roteamento fixo de provedor (script fixo) — `tool-ralph/README.md`
- CVG hoje:
  - WF-01: AUSENTE.
  - WF-02: AUSENTE.
  - WF-03: AUSENTE.
  - WF-04: AUSENTE.
  - WF-05: PARCIAL (divergente em desenho) — `packages/harness/src/iterative-runtime.ts` já é um loop limitado por orçamento com `step-store.ts` (checkpoint por passo) e REPLAN/VERIFY; não usa filhos frescos, objetivo imutável ou relatório entre rodadas.
  - WF-06: AUSENTE.
- Lacunas:
  1. Serviço de workflow durável: run, passos, checkpoints, retomada, em vez de script livre do modelo (M a G). Dep.: P100-033, P100-034. Risco: estado/sucesso não podem vir de texto livre do modelo (exigência do cartão); efeito duplicado na retomada. Relevância: média (passagem de plantão com várias etapas).
  2. Adaptador Ralph sobre filhos frescos com `maxRounds` (M). Dep.: lacuna 1 e SUB. Relevância: baixa; o próprio DeepSeek só habilita sob pedido humano explícito.
  3. Execução em segundo plano com id de job (veja jobs). Dep.: JSW.
- Critério de aceite: workflow interrompido retoma do checkpoint; reexecução mantém um efeito; timeout, cancel, erro e ausência de provedor testados.
- Fora de escopo razoável: scripts JS escritos pelo modelo (candidato a DIVERGENTE_INTENCIONAL: preferir definições declarativas aprovadas). Decidir em SPEC.

## goal / plan / todo (cartão P100-036)
- Referência: `packages/goal/{goal, tool-goal, command-goal, goal-round-driver}`, `packages/plan/plan-mode`, `packages/todo/tool-todo`.
- Capacidades da referência:
  - GPT-01 — Goal persistido por sessão (um objetivo), sobrevive a resume/fork/restart; update por compare-and-set; limite de rodadas (256) e bloqueio com código estável — `goal/goal/README.md`
  - GPT-02 — Tools `get_goal`/`create_goal`/`update_goal`, criação só a pedido humano explícito, bloqueio autônomo após 3 rodadas iguais — `tool-goal/README.md`
  - GPT-03 — Comando humano `/goal` (criar, pausar, retomar, limpar) — `command-goal`
  - GPT-04 — Driver de rodadas: continua o goal na mesma sessão quando ociosa, esgotamento grava blocker — `goal-round-driver/README.md`
  - GPT-05 — Plan mode: `/plan`, exploração e plano, saída com revisão do usuário (`exit_plan_mode`), estado sobrevive a resume — `plan-mode/README.md`
  - GPT-06 — `todo_write`: lista de tarefas por sessão, substituição total, posse por sessão, flag de paralelismo, projeção para UI — `tool-todo/README.md`
  - GPT-07 — Projeções de goal/todo para a UI — READMEs
- CVG hoje:
  - GPT-01: PARCIAL — `AgentRun.state.goal` é o objetivo do run (`packages/harness/src/iterative-runtime.ts`); sem goal durável por sessão/CAS.
  - GPT-02: AUSENTE.
  - GPT-03: AUSENTE — sem comandos de operador equivalentes; existe `apps/api/src/routes/{tasks,approvals,conversations}.ts`.
  - GPT-04: AUSENTE — não há continuação automática entre turnos.
  - GPT-05: PARCIAL — handoff e aprovação (`packages/platform/src/handoff.ts`, `packages/approval-engine`) cobrem "revisão humana antes de agir", mas não um modo de planejamento nem plano revisável.
  - GPT-06: AUSENTE.
  - GPT-07: AUSENTE — `apps/web` não projeta tarefas.
- Lacunas:
  1. Tabela/serviço de goal por sessão com CAS, fences e RLS (M). Dep.: P100-020. Risco: goal virar autorização sensível (proibido); corridas pause/stop/round. Relevância: média (acompanhamento de pendência de plantão por várias rodadas).
  2. Todo da sessão com posse e projeção (P). Relevância: média (checklist de passagem de plantão); tem de ficar como dado não autoritativo.
  3. Plan mode com revisão via approval-engine (M). Dep.: P100-035. Relevância: média (plano de ação aprovado antes de qualquer efeito).
  4. Driver de rodadas e comandos de operador (M). Risco: continuação sem humano; limite rígido de rodadas e orçamento.
- Critério de aceite: corridas pause/stop/round e restart preservam a intenção; goal encerrado não reabre após desligamento; objetivo não concede autorização.
- Fora de escopo razoável: `/goal` como comando de TUI (trocar por rota de API). Dúvida: um goal por sessão ou por conversa/paciente.

## jobs / schedule / webhook (cartão P100-037)
- Referência: `packages/jobs/{jobs, jobs-local, tool-jobs}`, `packages/schedule/schedule`, `packages/webhook/{webhook, webhook-github}`, `packages/experimental/schedule-bundle`.
- Capacidades da referência:
  - JSW-01 — Serviço de jobs em segundo plano, ids `<kind>-N`, posse por sessão, saída lida/aguardada/cancelada só pelo dono — `jobs/jobs/README.md`
  - JSW-02 — `jobs-local`: jobs no processo com limite de concorrência e retenção de saída — `jobs-local/README.md`
  - JSW-03 — Tools `job_output`, `job_list`, `job_kill` e aviso de conclusão em sessão (acorda agente ocioso, teto de acordadas consecutivas) — `tool-jobs/README.md`
  - JSW-04 — Schedule: lembretes one-shot, taxa fixa, diário, semanal e cron com fuso IANA, entregues como mensagem na sessão original — `schedule/README.md`
  - JSW-05 — Persistência através de restart do host; recorrente entrega só a última ocorrência perdida; restaura sessão fria — `schedule/README.md`
  - JSW-06 — Gerenciamento: listar, inspecionar, desativar, apagar com registros de entrega — `schedule/README.md`
  - JSW-07 — Runtime de webhook com regras confiáveis registradas; ação única: criar sessão raiz num workspace; `register`/`dispatch` — `webhook/README.md`
  - JSW-08 — Adaptador GitHub: rota exata, corpo bruto limitado e verificado, resposta 202 sem esperar — `webhook-github/README.md`
  - JSW-09 — Bundle opt-in `schedule-bundle` (time-context, schedule, ui-schedule) — `experimental/schedule-bundle`
- CVG hoje:
  - JSW-01: AUSENTE — não há jobs de agente com id e posse; há jobs de fila de worker.
  - JSW-02: PARCIAL — `apps/worker/src/{continuous-worker,controlled-worker}.ts` e `jobs/process-outbox-event.ts`, `process-agent-turn.ts` rodam trabalho em segundo plano com concorrência controlada, sem a abstração job-por-agente.
  - JSW-03: AUSENTE.
  - JSW-04: AUSENTE — sem cron, lembrete ou agendador de domínio; `apps/worker/src/sweeps.ts` só varre aprovações expiradas em intervalo fixo.
  - JSW-05: PARCIAL — outbox durável com retry/backoff/dead-letter/requeue (`packages/persistence/src/{outbox,postgres-outbox}.ts`) e takeover/fence; falta agenda persistente por ocorrência.
  - JSW-06: AUSENTE.
  - JSW-07: PARCIAL — `apps/api/src/routes/webhooks.ts` (`/v1/webhooks/channels/:channel/messages`) e `webhook-security.ts` ingerem canais Chatwoot/Evolution (`packages/channel-gateway/src/adapters`); sem registro de regras genérico.
  - JSW-08: PARCIAL — autenticação e limite de corpo existem para canais; não há adaptador de provedor tipo GitHub (irrelevante ao hospital).
  - JSW-09: AUSENTE.
- Lacunas:
  1. Serviço de jobs de agente (start/list/read/kill, posse, notice de conclusão) sobre worker + outbox (G). Dep.: P100-020, P100-035. Risco: efeito duplicado em crash/retry/reorder; kill com fence. Relevância: média.
  2. Schedule persistente (one-shot, intervalo, diário, semanal, cron com IANA) com entrega idempotente e restauração de sessão (G). Risco: **nunca** confirmar/cancelar/reagendar consulta real sozinho; lembrete só gera mensagem/handoff. Relevância: alta (lembretes de plantão, retorno de exame, agenda).
  3. Registro de regras de webhook confiáveis: evento externo vira nova conversa/tarefa pelo mesmo pipeline (M). Dep.: P100-025. Risco: autenticação, replay, tenant. Relevância: média a alta (laboratório/PACS notificando exame pronto).
  4. Notificação de conclusão / acordar agente ocioso (M). Relevância: média.
  5. Adaptador GitHub (P). Relevância: nenhuma; só como exemplo de provedor.
- Critério de aceite: crash, retry, reordenação e duplicata não criam efeito extra; agenda clínica real nunca é alterada automaticamente; tick perdido entrega uma ocorrência.
- Fora de escopo razoável: webhook-github, schedule-bundle como pacote (virar configuração de perfil). Rede real só em T4.

## agent-team (cartão P100-038)
- Referência: `packages/experimental/{agent-team, agent-team-profile, tool-agent-team, client-ui-agent-team}`.
- Capacidades da referência:
  - AT-01 — Time numa sessão: Lead cria teammates nomeados (fresh/fork), roster com limite (16) — `agent-team/README.md`
  - AT-02 — Mailbox durável: mensagens sobrevivem a crash/reload; teammate offline recebe ao retomar; limites por membro e por mensagem — `agent-team/README.md`
  - AT-03 — Quadro de tarefas compartilhado (até 256) com `team_task_create/list/get/update` — `agent-team/README.md`, `tool-agent-team/README.md`
  - AT-04 — Espera e interrupção: aguardar progresso, `send_message` (steer), interrupt de trabalho preso — `tool-agent-team/README.md`
  - AT-05 — Nove tools iguais para todos os membros e política de sistema (delegação explícita, cwd compartilhado, recuperação de versão obsoleta) — `tool-agent-team/README.md`
  - AT-06 — Perfil/bundle que liga colaboração, tools e UI web e desliga subagentes comuns — `agent-team-profile`
  - AT-07 — UI: ação no cabeçalho, roster, quadro, navegação à conversa do teammate — `client-ui-agent-team`
- CVG hoje: AT-01 a AT-07: AUSENTE. Peças vizinhas: handoff para humano (`packages/conversation/src/handoff.ts`), outbox para mensagens, `apps/web`. Task DAG: AUSENTE (só tarefas internas de run em `apps/api/src/routes/tasks.ts`, sem dependências).
- Lacunas:
  1. Roster + mailbox durável com entrega/ack e idempotência (G). Dep.: P100-033, P100-035. Risco: duplicata executar duas vezes; irmão assumir autoridade/tenant de outro. Relevância: baixa a média (papéis de recepção/enfermagem/exames conversando entre si poderia ser modelado sem "time de coding").
  2. Quadro de tarefas com DAG, versão otimista e conflito explícito (M). Relevância: média (pendências de plantão).
  3. Tools, política e perfil (M). 4. Projeção UI (M). Relevância: baixa.
- Critério de aceite: mensagens e DAG sobrevivem a restart, duplicata não executa duas vezes, conflito de versão é explícito, sibling não age em outro tenant.
- Fora de escopo razoável: ficar experimental/default-off como na referência; dúvida sobre valor real para o produto antes de subagentes e jobs existirem (prioridade P1 já indica isso).

## extensions Cordis (cartão P100-045)
- Referência: `packages/extensions/{cordis-host-runner, cordis-client-runner, tool-cordis, ui-cordis}`.
- Capacidades da referência:
  - EXT-01 — Host runner: definições dinâmicas de plugin em realm `node:vm` por processo, somem no restart — `cordis-host-runner/README.md`
  - EXT-02 — Client runner: metade navegador carregada após aprovação/gesto, retirada quando o host retrai — `cordis-client-runner/README.md`
  - EXT-03 — `tool-cordis`: ferramentas somente leitura para inspecionar APIs de runtime Host/Client antes de escrever plugin — `tool-cordis/README.md`
  - EXT-04 — `ui-cordis`: cartões históricos e painel de controle de definições — `ui-cordis/README.md`
  - EXT-05 — Plugin Manager para mudanças persistentes de perfil (sem tool de criação dinâmica) — README
- CVG hoje:
  - EXT-01: DIVERGENTE_INTENCIONAL — ADR-011: plugins só via kernel com controles obrigatórios (`packages/harness/src/kernel`, `packages/platform/src/{controlled-plugins,plugin-gateway}.ts`); código de plugin gerado em tempo de execução não é permitido sem grant.
  - EXT-02: AUSENTE.
  - EXT-03: AUSENTE — o kernel é referido a `docs/cordis-primer.md` em comentário, sem inspeção em runtime.
  - EXT-04: AUSENTE.
  - EXT-05: PARCIAL — gestão de plugins/perfis em `packages/platform` (release-candidate, qualification, plugin-gateway); sem gerenciador de plugins em UI.
- Lacunas:
  1. Inspeção somente leitura do registro de serviços/hooks/tools do kernel (catálogo de runtime), exposta a operador autenticado (P a M). Dep.: P100-012. Risco: vazar config; só metadados. Relevância: média (diagnóstico).
  2. Definições dinâmicas host/client (G) só se a SPEC decidir aceitar; exige grant, caps declaradas e controles fora do alcance do código. Relevância: baixa.
  3. UI de gestão (M). Relevância: baixa.
- Critério de aceite: extensão nunca registra controle nem executa sem grant; inspeção não vaza segredo; unload de controle negado.
- Fora de escopo razoável: Cordis como framework (o CVG tem kernel próprio). Dúvida: marcar EXT-01/02 como DIVERGENTE_INTENCIONAL definitivo.

## webworker-packer / webworker-runtime (cartão P100-045)
- Referência: `packages/experimental/{webworker-packer, webworker-runtime}`.
- Capacidades da referência:
  - WW-01 — Empacotador de imagem VFS: perfil composto vira tar base gzip + overlays ordenados — `webworker-packer/README.md`
  - WW-02 — Runtime: árvore inteira de plugins dentro de um Web Worker dedicado, VFS em memória, loader CommonJS — `webworker-runtime/README.md`
  - WW-03 — Túnel postMessage que fala HTTP simples entre página e worker — `webworker-runtime/README.md`
- CVG hoje: WW-01, WW-02, WW-03: AUSENTE. O CVG assume Postgres/RLS e host Node (ADR-011); não há modo preview no navegador.
- Lacunas:
  1. Guest worker com VFS e túnel (G). Dep.: P100-012, P100-025, P100-041. Risco: CSP/IPC/autoridade, persistência PG inexistente no guest. Relevância: nenhuma para operação hospitalar; só demo.
- Critério de aceite: jornadas mapeadas equivalentes guest/host; CSP e limites de recurso testados.
- Fora de escopo razoável: recomendar DEFERRED/waiver explícito (preview experimental; DeepSeek não o inclui em perfis padrão).

## auto-review / inspector (cartão P100-046)
- Referência: `packages/experimental/{auto-review, inspector}`.
- Capacidades da referência:
  - AR-01 — Auto review: antes de cada tool call (nativa ou PTC interna), modelo do agente avalia a ação; permitido executa com Full access, negado pergunta ao usuário — `auto-review/README.md`
  - AR-02 — Novo modo no seletor de permissão da sessão; desligado por padrão — `auto-review/README.md`
  - AR-03 — Mensagem de negação da tool e revisão por chamada — README
  - INS-01 — Inspector: consoles Host/Client, fontes e depuração do Host, fetches capturados no Chrome DevTools via CDP em Worker — `inspector/README.md`
  - INS-02 — Árvore Cordis compartilhada como snapshots validados (coletor, sem objetos vivos) — `inspector/README.md`
- CVG hoje:
  - AR-01: DIVERGENTE_INTENCIONAL — em CVG toda ação sensível exige aprovação humana ou handoff; modelo aprovando a si mesmo contraria isso. Um revisor só pode ser consultivo (nunca concede).
  - AR-02: PARCIAL — modos de política existem (`packages/policy-engine`, `packages/platform/src/policy-evaluator.ts`), sem seletor de sessão.
  - AR-03: PARCIAL — recusa por política/aprovação com códigos de razão (`DECISION_REASON_CODES`); sem revisão por LLM.
  - INS-01: AUSENTE — há OTEL e redaction (`packages/observability/src/{otel,telemetry,redaction}.ts`), mas nenhum inspetor interativo; trajetória em `packages/harness/src/trajectory.ts`.
  - INS-02: AUSENTE.
- Lacunas:
  1. Inspetor de runtime autenticado e somente leitura (trajetória, passos, tools, eventos por correlation id, sem payload sensível) (M). Dep.: P100-020, P100-040. Risco: inspector sem auth, vazamento de PHI. Relevância: média (operação e auditoria).
  2. Revisor consultivo opcional que só pode rebaixar para aprovação humana, nunca autorizar (P a M). Relevância: baixa a média.
- Critério de aceite: reconstruir uma falha por correlation/trace sem payload sensível; inspector sem credencial é recusado; revisor nunca converte "requer aprovação" em "permitido".
- Fora de escopo razoável: depuração via CDP de Host/Client. Dúvida: inspetor como rota de API + painel `apps/web` em vez de DevTools.

---

## Riscos transversais
- Autoridade herdada: filho, job, schedule, webhook, workflow e time devem executar com subconjunto do grant do iniciador, no mesmo pipeline de controles obrigatórios (ADR-011); nada novo pode ser caminho paralelo ao kernel.
- Efeito duplicado: retry, replay, reordenação e restart exigem chave de idempotência e `effect-journal` em toda ação externa de jobs/schedule/workflow/PTC.
- Estado confiável: sucesso e progresso de workflow/goal/todo vêm de fatos persistidos, não de texto do modelo; goal nunca vira autorização.
- Isolamento multi-tenant (RLS) em mailbox, jobs, agenda e goals; sibling não cruza tenant.
- Ações clínicas/agenda: schedule e webhooks só geram mensagem, handoff ou proposta; nunca confirmar, cancelar ou reagendar consulta real sozinhos.

## Ordem sugerida
1. Fundação: registro de subagentes in-process com herança de autoridade (SUB) e serviço de jobs/outbox de agente (JSW-01..03), pois quase tudo depende deles.
2. Schedule persistente e regras de webhook (JSW-04..07): maior valor hospitalar.
3. Workflow durável por checkpoint, depois goal/todo/plan com aprovação (WF, GPT).
4. PTC Node (sem Python) e inspector de runtime consultivo (PTC, INS).
5. Agent Teams/task DAG e extensões Cordis por último; guest Web Worker e Python como DEFERRED com waiver explícito.
