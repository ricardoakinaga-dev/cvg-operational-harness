# G5 — Aplicações, interface e providers de interação

Método: README e descrições dos pacotes, listagem de diretórios, grep no CVG. Não li todo o código. Onde a evidência é indireta, está dito. Referência: `/home/ricardo/deepseek-harness-session-fixes` (768fb1f3). CVG: `/home/ricardo/Área de trabalho/cvg-operational-harness`.

| Família | Cartão P100 | Capacidades | Presente | Parcial | Ausente | Esforço estimado |
|---|---|---|---|---|---|---|
| CLIENT (jornadas de UI) | P100-041 | 12 | 0 | 7 | 5 | GG |
| INTER (interaction) | P100-041 | 6 | 2 | 1 | 3 | M |
| WEB (shell apps/web) | P100-041 | 5 | 1 | 1 | 3 | G |
| DESK (desktop + host) | P100-042 | 7 | 0 | 0 | 7 | GG (ou decisão de não fazer) |
| BROW (browser use) | P100-043 | 6 | 0 | 0 | 6 | G |
| COMP (computer use) | P100-043 | 4 | 0 | 0 | 4 | G (ou decisão de não fazer) |
| VOZ (voz/transcrição) | P100-044 | 6 | 0 | 1 | 5 | G |
| **Total** | | **46** | **3** | **10** | **33** | |

Visão geral do CVG: `apps/web` é um console operacional de 6 painéis (conversas, aprovações, tarefas, jornadas, auditoria, plataforma). Fala com `apps/api` por REST (`apps/web/src/api/client.ts`, rotas `/v1/*`). Não há SSE, WebSocket nem EventSource em `apps/web` ou `apps/api` (grep sem resultado). Não há composer de mensagem, terminal, árvore de arquivos nem preview de documentos. O Assistente de Plantão (`products/shift-assistant`) tem chat de terminal (`src/sandbox/chat.ts`), WhatsApp e transcritor Whisper próprios. É produto, não núcleo.

---

## CLIENT — jornadas de UI (cartão P100-041)
- Referência: `packages/client/*` (63 pacotes; `ui-*` mais `web`, `modules`, `connection`, `file-upload`, `shortcuts`, `store`, `locale`, `hmr`, `product-analytics`). Docking em `ui-dockkit`, slots em `ui-slots`.
- Capacidades da referência (agrupadas por jornada):
  - CL-01 — Conversa: chat com streaming, anexos (rail, lightbox, drop), feedback like/dislike por mensagem — `ui-chat`, `ui-conversation`, `ui-attachment`, `ui-message-feedback`
  - CL-02 — Sessões e histórico: lista, troca, contexto por sessão, presets de agente — `ui-session`, `ui-agent-preset`, `ui-sidebar`
  - CL-03 — Trajetória, subagentes e workflow: ledger de eventos por turno com tempos, catálogo de subagentes, nó de workflow com membros — `ui-trajectory`, `ui-subagent`, `ui-workflow-run`
  - CL-04 — Plano, goal e todos: chip de modo plano, faixa de goal (editar, pausar, retomar, limpar), cartão de revisão de plano — `ui-plan`, `ui-goal`, `ui-user-questions`
  - CL-05 — Jobs e agendamento: jobs em segundo plano com saída em stream, tarefas e lembretes por sessão — `ui-jobs`, `ui-schedule`
  - CL-06 — Arquivos e workspace: árvore lazy, seletor de diretório (browse e nativo), abrir em app externo, referência @arquivo/@sessão — `ui-sidebar-files`, `ui-directory-picker-*`, `ui-workspace`, `ui-open-in-app`, `ui-reference`
  - CL-07 — Terminal: abas de shell interativo recuperáveis na lateral — `ui-sidebar-terminal`
  - CL-08 — Deliverables e preview: cartão de arquivos alterados, revisão/diff, preview de Markdown, código, imagem, PDF, Office e HTML — `ui-deliverables`, `ui-sidebar-documentpreview`
  - CL-09 — Configurações: modelos e chaves, agent loop, shell, web search, subagente, log de sessão, conta, inventário de plugins, geral — `ui-settings*`
  - CL-10 — Gerenciador de plugins: bundles, linhas e configuração do perfil — `ui-plugin-manager`
  - CL-11 — Comandos e atalhos: fonte `/`, três tipos de despacho, skills por `/`, tabela de atalhos, pipeline de gatilhos `/` e `@` — `ui-commands`, `ui-skill`, `ui-input-trigger`, `shortcuts`, `ui-shortcuts`
  - CL-12 — Transversais: i18n, tema, tamanho de fonte, layout acoplável, conexão com reconexão, sidebar de browser sandboxed — `locale`, `ui-theme`, `ui-dockkit`, `connection`, `ui-sidebar-browser`, `ui-layout`
- CVG hoje:
  - CL-01: PARCIAL — `apps/web/src/features/conversations/index.tsx` (93 linhas) lista conversas e mostra timeline somente leitura. Sem composer, anexos, streaming nem feedback.
  - CL-02: PARCIAL — `App.tsx`, `getTimeline`/`listConversations`. Lista conversas por canal, sem sessões navegáveis, fork nem presets.
  - CL-03: PARCIAL — `features/platform/TraceViewer.tsx` e `features/audit`. Mostram trace de execução e auditoria, mas não ledger por turno, subagentes nem workflow.
  - CL-04: AUSENTE — não há UI de plano, goal nem todos. Depende da família de goals/planos (P100-036).
  - CL-05: PARCIAL — `features/tasks/index.tsx` (97 linhas) lista e atualiza status de tarefas operacionais. Não há jobs em stream, schedule nem lembretes.
  - CL-06: AUSENTE — não há workspace de arquivos no console. O seletor de diretório talvez seja irrelevante num console multi-tenant.
  - CL-07: AUSENTE — não há terminal.
  - CL-08: AUSENTE — o console não tem preview de documentos nem diff. Há `audit` com export por approval (`requestAuditEvidenceExportApproval`), que é outra coisa.
  - CL-09: PARCIAL — `features/platform/index.tsx` (1739 linhas): perfil de prompt, versões de agente, test lab, catálogo de plugins, fontes de conhecimento, release candidates. Não há modelos/chaves, shell nem web search, e não há configuração por usuário.
  - CL-10: PARCIAL — catálogo de plugins com transições (`listPlatformPluginCatalog`, `transitionPlatformPluginCatalog`). Falta a edição da configuração por perfil.
  - CL-11: AUSENTE — não há comandos, atalhos nem gatilhos no console. `products/shift-assistant/src/commands.ts` é do produto (comandos de WhatsApp).
  - CL-12: PARCIAL — há `aria-label`, `role=status/alert` e `lang` pt-BR fixo, sem camada i18n. Não há tema, fonte, dock nem reconexão. Há `api/resilient-client.test.ts`, indício de retry no cliente REST.
- Lacunas:
  1. Composer e chat vivo (envio, anexos, estado de turno) — G; depende de canal de eventos (WEB-01) e da API de sessão; risco: o console enviar mensagem que o motor trate como efeito; relevância alta (equipe converse com agentes).
  2. Visão de sessão/fork/histórico e trajetória por turno — M; depende de P100-020; relevância alta (auditar o que o agente fez).
  3. UI de plano/goal/todos e revisão de plano — M; depende de P100-036; risco: aprovação de plano virar aprovação de efeito sem approval real; relevância média.
  4. Jobs e schedule na UI — M; depende de P100-037; risco: efeito duplicado em reenvio; relevância alta (rotinas de plantão).
  5. Subagentes/workflow na UI — M; depende de P100-033/035; relevância média.
  6. Deliverables e preview de documentos (PDF, imagem, Markdown; Office/HTML com sandbox) — G; risco: HTML/Office ativo é vetor de XSS, exige iframe isolado; relevância alta (laudos e anexos de exames só como leitura).
  7. Configurações por escopo (modelos, web search, shell, loop) — M; risco: chave de API exposta, deve ser só referência de segredo; relevância média.
  8. Gerenciador de plugins com configuração editável e fluxo de controles obrigatórios do ADR-011 — M; relevância média.
  9. Comandos, atalhos e gatilhos `/` `@` — M; depende de INTER-05; relevância média.
  10. Terminal e árvore de arquivos — G cada; risco alto (execução e leitura de arquivos arbitrários); relevância baixa para o uso hospitalar, só admin/dev. Pede decisão de escopo.
  11. i18n real (pt-BR e en), tema, acessibilidade por teclado auditada, reconexão — M; relevância média (a matriz de jornadas do cartão exige keyboard/accessibility).
  12. Matriz de jornadas UI com eventos reais do motor (critério do P100-041) — M; relevância alta.
- Critério de aceite: matriz de jornadas CL-01..CL-12 com cada linha PASS, DIVERGENTE_INTENCIONAL ou FORA_DE_ESCOPO decidido; testes e2e do console contra a API real; console nunca marca sucesso sem evento do motor.
- Fora de escopo razoável / dúvidas: `ui-brand-official` e onboarding DeepSeek (branding); `product-analytics` (coleta de uso; em hospital exige decisão de privacidade); `hmr` (dev-only); ui-dockkit pode ser simplificado. Dúvida: o console é para operador/equipe ou também replica a experiência de agente de código? Terminal e arquivos só fazem sentido no segundo caso.

---

## INTER — interaction (cartão P100-041)
- Referência: `packages/interaction/{commands,user-approval,permission-presets,user-questions,tool-ask-user}`; `docs/subsystems/{commands,approval,permission-presets,user-questions}.md`.
- Capacidades da referência:
  - INT-01 — Aprovação one-shot allow/reject por cadeia de respondedores — `user-approval`
  - INT-02 — Falha fechada sem respondedor — `user-approval`
  - INT-03 — Pergunta ao humano: schema validado, cascata de respondedores, ferramenta `ask_user_question` — `user-questions`, `tool-ask-user`
  - INT-04 — Presets de permissão (sandbox + política de aprovação num seletor) — `permission-presets`
  - INT-05 — Comandos slash sem ida ao modelo, registro e despacho — `commands`
  - INT-06 — Cartão de revisão de plano como aprovação — `ui-user-questions`
- CVG hoje:
  - INT-01: PRESENTE — `packages/approval-engine`, `apps/api/src/routes/approvals.ts`, `features/approvals/index.tsx`, `decideApproval`. Aprovação com decisão, nota e conflito (`attendance-approval-conflict.test.tsx`).
  - INT-02: PRESENTE (evidência indireta) — controles obrigatórios do ADR-011. Não verifiquei o código do caminho de falha.
  - INT-03: PARCIAL — `packages/contracts/src/execution-v2.ts` define decisão `ASK_USER` com `requestedInput`. Não encontrei ferramenta nem UI de resposta no núcleo; `packages/conversation` tem handoff.
  - INT-04: AUSENTE — existem `policy` e `policy-engine`, sem seletor de preset para o usuário.
  - INT-05: AUSENTE no núcleo — só `products/shift-assistant/src/commands.ts`.
  - INT-06: AUSENTE.
- Lacunas:
  1. Ferramenta ask_user no catálogo, com pausa e retomada do turno e resposta pelo console/canal — M; depende de P100-020; risco: resposta duplicada reentrar o turno (idempotência); relevância alta (agente pergunta antes de agir).
  2. Presets de permissão como contrato público e seletor — P/M; risco: preset não pode relaxar controles obrigatórios; relevância média.
  3. Registro de comandos slash no núcleo (distinto do produto) — M; relevância média.
  4. Cartão de revisão de plano — P; depende de CL-04.
- Critério de aceite: teste em que o agente pausa com ask_user, o humano responde uma vez (segunda resposta é rejeitada) e o turno retoma; sem respondedor, a ação sensível fica negada.
- Fora de escopo / dúvidas: ACP (outro grupo). Dúvida: ask_user mapeia para ASK_USER do v2 ou para ferramenta nova?

---

## WEB — shell apps/web (cartão P100-041)
- Referência: `apps/web` (Vite, `product-isolation.ts`, `stress-tests`, `tests`), `packages/client/{web,modules,connection,file-upload,hmr,store}`; `docs/api-gateway.md`.
- Capacidades da referência:
  - WEB-01 — Conexão host-navegador com RPC e entrega de eventos ao vivo, com reconexão — `client/connection`
  - WEB-02 — Autenticação do Web Remote e sessão — `docs/api-gateway.md`
  - WEB-03 — Upload de Blob/stream fora da thread da página — `client/file-upload`
  - WEB-04 — Módulos de cliente carregáveis (slots, plugins de UI) — `client/modules`, `ui-slots`
  - WEB-05 — Testes de estresse e isolamento de produto no app — `apps/web/stress-tests`, `product-isolation.ts`
- CVG hoje:
  - WEB-01: PARCIAL — REST com cliente resiliente (`api/resilient-client.test.ts`), sem push de eventos.
  - WEB-02: PRESENTE — `auth/session.ts`, `apps/api/src/operator-session*.ts`, `oidc-*.ts`; teste `trusted-session-app.test.tsx`.
  - WEB-03: AUSENTE.
  - WEB-04: AUSENTE — painéis fixos. Provavelmente divergência aceitável.
  - WEB-05: AUSENTE como estresse; há `scripts/check-product-boundary.mjs` para isolamento do produto (existe no CVG, não no app).
- Lacunas:
  1. Canal de eventos ao vivo (SSE ou WS) por tenant/sessão com autorização e retomada por cursor — M/G; risco: vazamento entre tenants, ordem e duplicação; relevância alta.
  2. Upload com limites, tipo e varredura, ligado a anexos — M; risco: dados sensíveis; relevância alta (exames).
  3. Decisão sobre extensibilidade de UI (slots) — P decisão.
- Critério de aceite: assinatura de eventos testada com dois tenants (sem vazamento), queda e reconexão sem perder nem duplicar evento.
- Fora de escopo / dúvidas: `hmr`; módulos de cliente dinâmicos (risco de supply chain na UI).

---

## DESK — desktop e desktop-host (cartão P100-042)
- Referência: `apps/desktop` (Electron, instalador NSIS, `src/{ipc,host-process,directory-picker,keybindings,crash-report,browser-guests}`), `apps/desktop-host` (`office-engine`, `update-tasks`, `quit-inspection`, `platform-session`).
- Capacidades da referência:
  - DK-01 — Shell Electron carregando o app Web empacotado por protocolo próprio
  - DK-02 — Ciclo de vida do host local (processo filho, boot, recuperação fatal)
  - DK-03 — Seletor de pasta nativo
  - DK-04 — Abrir em app externo, clipboard, deep links
  - DK-05 — Instalador, atualização e relatório de falha
  - DK-06 — Permissão de microfone restrita ao frame principal
  - DK-07 — Motor de preview Office no host
- CVG hoje: DK-01..DK-07: AUSENTE — não existe `apps/desktop` nem `desktop-host`; o CVG é servidor com `apps/api`, `apps/worker`, `apps/web`.
- Lacunas:
  1. Decisão explícita: o CVG precisa de carrier desktop? Um hospital opera por navegador e WhatsApp. Se sim: shell + IPC mínimo — G; plataforma de distribuição e assinatura — G; risco: IPC/preload com execução arbitrária; workspace picker ampliando grants.
  2. DK-07 só importa se CL-08 incluir Office.
- Relevância hospitalar: baixa (macOS, instalador, atualização automática, branding). Proposta: marcar o grupo inteiro como "decisão de escopo" e, se aprovada a exclusão, registrar como DIVERGENTE_INTENCIONAL.
- Critério de aceite (se mantido): jornadas do carrier em uma plataforma suportada; preload sem API genérica de exec. Se excluído: ADR registrando a decisão.
- Fora de escopo razoável: o grupo todo, a decisão é do usuário.

---

## BROW — browser use (cartão P100-043)
- Referência: `packages/browser-use/browser-use` (registro exclusivo `ctx.browserUse`), `packages/experimental/browser-use-{runtime,playwright-mcp,chrome-devtools-mcp,stagehand-native}`; `docs/subsystems/browser-use.md`.
- Capacidades da referência:
  - BRW-01 — Registro exclusivo de um provider (rejeita o segundo)
  - BRW-02 — Provider Playwright via MCP
  - BRW-03 — Provider Chrome DevTools via MCP
  - BRW-04 — Provider Stagehand nativo (ações assistidas por IA, observar, extrair)
  - BRW-05 — Propriedade do browser por sessão (lançar ou anexar; cleanup; anexo reservado a uma sessão)
  - BRW-06 — Ferramentas no pipeline normal e no log de sessão, com ativação explícita
- CVG hoje: BRW-01..06: AUSENTE — sem registro, provider nem ferramenta de browser (grep por playwright/browser só acha o módulo de URL e ferramentas de canal). Existem peças reaproveitáveis: `packages/sandbox`, `packages/shared` (validação de URL, `ssrf-node.ts` no gateway) e `tool-invocation-boundary.ts` na plataforma.
- Lacunas:
  1. Contrato de provider único + ownership por sessão e tenant — M; depende de P100-030 (MCP) e P100-024 (contenção); risco: processo/browser escapando de sessão ou tenant.
  2. Provider Playwright MCP com allowlist de destinos e approval por ação sensível — G; risco: SSRF, navegação para rede interna, credenciais em página; relevância baixa/média (consulta de sites públicos, páginas de laboratório externas; navegar em sistemas de prontuário exigiria handoff).
  3. Providers DevTools e Stagehand — M cada, opcionais; relevância baixa.
  4. Kill seguro e teste em site sintético — P.
- Critério de aceite: jornada em site sintético; destino fora da allowlist é negado; ação de submit exige approval; fechar sessão encerra o processo.
- Fora de escopo / dúvidas: Stagehand usa modelo próprio, o que cria uma segunda rota de modelo fora do model-gateway; decidir se aceita.

---

## COMP — computer use (cartão P100-043)
- Referência: `packages/computer-use/computer-use`, `packages/experimental/computer-use-cua-driver-{mcp,native}`; `docs/subsystems/computer-use.md`.
- Capacidades da referência:
  - CMP-01 — Registro exclusivo de provider de desktop
  - CMP-02 — Provider Cua Driver via MCP (executável local)
  - CMP-03 — Provider Cua Driver nativo via SDK, com screenshots duráveis
  - CMP-04 — Permissões explícitas do desktop do host
- CVG hoje: CMP-01..04: AUSENTE.
- Lacunas:
  1. Decisão de escopo: controlar o desktop de uma máquina de servidor multi-tenant é quase sempre inadequado — risco alto (controle do SO, captura de tela com dados de pacientes); relevância hospitalar: baixa/nenhuma.
  2. Se mantido: contrato + um provider em VM descartável com screenshot sob retenção — G; depende de P100-024.
- Critério de aceite: ou ADR de exclusão, ou jornada em app sintético numa VM isolada com approval por ação e kill.
- Fora de escopo razoável: a família inteira, sujeita a decisão do usuário.

---

## VOZ — voz e transcrição editável (cartão P100-044)
- Referência: `packages/experimental/{speech-to-text,speech-to-text-sensevoice,api-speech-to-text,client-ui-voice-input,voice-input-bundle}`.
- Capacidades da referência:
  - VOZ-01 — Registro de providers de transcrição nomeados, com cancelamento
  - VOZ-02 — Worker local SenseVoice em CPU, preparado sob demanda
  - VOZ-03 — API de transcrição transitória e limitada pelo Web Remote autenticado
  - VOZ-04 — UI grava e insere transcrição revisável no rascunho
  - VOZ-05 — Ativação em pacote pelo gerenciador de plugins
  - VOZ-06 — Assets versionados e aprovados
- CVG hoje:
  - VOZ-01: PARCIAL — `products/shift-assistant/src/transcriber.ts`: interface `Transcriber` com servidor Whisper compatível com OpenAI. Está no produto, não no núcleo; sem cancelamento nem registro.
  - VOZ-02: AUSENTE.
  - VOZ-03: AUSENTE — `channel-gateway` aceita mídia `audio` (contracts), mas não expõe API de transcrição do harness.
  - VOZ-04: AUSENTE — não há gravação nem rascunho no console.
  - VOZ-05: AUSENTE.
  - VOZ-06: AUSENTE.
- Lacunas:
  1. Subir o contrato de transcrição para o núcleo (provider, limites, cancelamento, retenção) — M; depende de P100-014; risco: áudio com dados pessoais, retenção mínima.
  2. Provider local (SenseVoice ou Whisper local) com assets aprovados — M/G; risco: licença e integridade dos modelos.
  3. UI de gravação com transcrição editável antes do envio; texto incerto vira revisão humana — M; depende de CL-01; risco: transcrição enviada como anotação de prontuário (proibido pelo cartão).
  4. Áudio recebido por WhatsApp transcrito no pipeline de canal, com marca "transcrito automaticamente" — P/M; relevância alta (tutor manda áudio).
- Critério de aceite: fixtures de áudio com resultado e cancelamento; baixa confiança gera revisão; nenhuma transcrição vira registro definitivo sem aprovação humana.
- Fora de escopo / dúvidas: gravação no desktop (microfone Electron) cai com DESK.

---

## Riscos transversais
- UI não pode criar efeito: toda ação do console deve ir pela API com approval; evento ao vivo precisa de isolamento por tenant e cursor idempotente.
- Preview de HTML/Office/PDF e anexos são vetores de XSS e de vazamento de dado de paciente; exigem sandbox de origem separada.
- Browser/computer use e terminal ampliam a superfície de execução; dependem de P100-024/030 e de decisão de escopo antes de qualquer código.
- Voz: áudio e transcrição são dado pessoal; sem retenção definida não se constrói.
- O console de referência é voltado a agente de código; copiar jornadas 1:1 pode desviar do uso hospitalar. O P100-041 diz "equivalentes"; convém definir equivalência por jornada.

## Ordem sugerida
1. Decisões de escopo (DESK, COMP, terminal/arquivos, módulos de UI) antes de qualquer estimativa final.
2. WEB-01 (eventos ao vivo) e INT-03 (ask_user) como base.
3. CL-01/02/03 (chat, sessões, trajetória), depois CL-05 e CL-04 conforme P100-036/037.
4. VOZ (núcleo + canal + UI) e CL-08 (preview seguro).
5. BROW por último, sob P100-030/024; COMP só se aprovado.
