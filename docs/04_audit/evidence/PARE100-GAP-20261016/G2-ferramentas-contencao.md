# G2 — Ferramentas, execução, contenção e protocolos (análise de lacunas)

Somente leitura. Referência: DeepSeek 768fb1f3 (0.2.0-rc.1). CVG: checkout atual.
Análise por README, docs/subsystems e grep. Amplitude priorizada; não li código a fundo.
Profundidade: lado CVG verificado em `packages/sandbox/src/*`, `docs/architecture/TOOL_CATALOG.md`, auditoria 0611. "Não encontrado" = grep sem resultado, não prova de ausência.

| Família | Cartão P100 | Capacidades | Presente | Parcial | Ausente | Esforço estimado |
|---|---|---|---|---|---|---|
| fs | P100-022 | 7 | 0 | 3 | 4 | M |
| workspace | P100-022 | 3 | 0 | 1 | 2 | P |
| attachment | P100-022 | 3 | 0 | 0 | 3 | M |
| document | P100-022 | 3 | 0 | 0 | 3 | M–G |
| deliverables | P100-022 | 3 | 0 | 0 | 3 | M |
| skill | P100-022 | 5 | 0 | 2 | 3 | M |
| shell | P100-023 | 6 | 0 | 3 | 3 | M |
| terminal | P100-023 | 4 | 0 | 0 | 4 | G |
| subprocess | P100-023 | 4 | 0 | 2 | 2 | M |
| sandbox + native/system | P100-024 | 7 | 1 | 3 | 3 | GG |
| web | P100-031 | 5 | 0 | 1 | 4 | G |
| mcp | P100-030 | 6 | 0 | 1 | 5 | G |
| lsp | P100-032 | 3 | 0 | 0 | 3 | M |
| ssh | P100-026 | 4 | 0 | 0 | 4 | GG |
| acp | P100-026 | 4 | 0 | 0 | 4 | G |

Nota geral: o CVG tem 7 ferramentas catalogadas (`exam.download`, `exam.upload`, `fs.edit`, `fs.list`, `fs.read`, `fs.write`, `shell.run`) e um skill (`exam-intake`). Todo o resto do grupo é ausente ou parcial.

---

## fs (cartão P100-022)

- Referência: `packages/fs/{fs,fs-local,fs-sandbox,fs-observation-policy,tool-fs,tool-fs-search,tool-str-replace-editor}`. Chave: `tool-fs/src`, `fs-observation-policy`, `docs/subsystems/filesystem.md`.
- Capacidades:
  - FS-01 — contrato `ctx.fs`: caminhos do "mundo de execução", I/O de texto limitado, mutação atômica com guarda de versão — `packages/fs/fs`
  - FS-02 — backend local de host — `packages/fs/fs-local`
  - FS-03 — backend que cerca escrita/edição pelo modo de sandbox da chamada — `packages/fs/fs-sandbox`
  - FS-04 — política read-before-edit (registra o observado e barra write/edit sem leitura prévia) — `packages/fs/fs-observation-policy`
  - FS-05 — ferramentas `read` (offset/limit de linhas, padrão 2000), `write`, `edit` (replace literal, `replace_all`) — `packages/fs/tool-fs`
  - FS-06 — `read_image` (imagem como anexo ao modelo) — `packages/fs/tool-fs`
  - FS-07 — `glob` e `grep` sobre ripgrep empacotado — `packages/fs/tool-fs-search`
  - FS-08 — `str_replace_editor` (view/create/str_replace/insert) — `packages/fs/tool-str-replace-editor`
- CVG hoje:
  - FS-01: PARCIAL — `packages/sandbox/src/fs-tools.ts`, `confine.ts` — confinamento por realpath e escrita atômica com prefixo reservado; sem contrato de serviço trocável (provider) nem guarda de versão.
  - FS-02/FS-03: DIVERGENTE_INTENCIONAL — `fs-tools.ts` + `gate.ts` — o workspace por tenant e o gate WORKSPACE substituem backends local/sandbox; não existe "host fs".
  - FS-04: AUSENTE — não encontrado read-before-edit; `fs.edit` exige string única e "intent", mas não prova leitura prévia.
  - FS-05: PARCIAL — `fs.read/fs.write/fs.edit/fs.list` — sem offset/limit de linhas, sem `replace_all`; limite de 1 MiB em leitura (`maxReadBytes`). `fs.list` existe (DeepSeek não tem list dedicado).
  - FS-06: AUSENTE — só UTF-8.
  - FS-07: AUSENTE — sem glob/grep.
  - FS-08: AUSENTE — redundante com `edit`; baixa prioridade.
- Lacunas:
  1. read-before-edit como política (guarda de versão/hash na escrita) — P; depende de journal; risco: edição sobre estado obsoleto (concorrência entre agentes); relevância média: protege notas de plantão editadas por mais de um agente.
  2. `read` com faixa de linhas e truncamento informado; `edit` com `replace_all` — P; relevância média.
  3. `glob`/`grep` com limites e sem sair do workspace (binário rg ou implementação Node) — M; risco: DoS por regex/arquivos enormes, tempo; relevância média.
  4. leitura binária/imagem com tipo, tamanho e magic bytes (ver attachment) — M; risco: formato hostil; relevância alta (fotos de exames, laudos).
  5. seam de provider (`ctx.fs` trocável) para permitir fs remoto/fixture — M; depende de ssh; relevância baixa agora.
- Critério de aceite: `fs.edit` sobre arquivo não lido ou alterado depois da leitura é negado e journalizado; `grep`/`glob` recusam path fora do workspace e symlink de fuga; arquivo >limite devolve erro estruturado.
- Fora de escopo: `str_replace_editor` duplicado; backend local de host (CVG nunca lê fora do workspace do tenant).
- Dúvida: o catálogo "gerado" (P100-022) quer `read_image`/binário no mesmo `fs.*` ou em ferramenta separada?

## workspace (cartão P100-022)

- Referência: `packages/workspace/workspace` (`ctx.workspaceRegistry`); `docs/subsystems/workspace.md`.
- Capacidades:
  - WS-01 — lista ordenada de projetos nomeados, com sessões agrupadas por diretório — `packages/workspace/workspace`
  - WS-02 — esconder sessão do agrupamento sem apagar; remover projeto nunca apaga pasta/sessões — idem
  - WS-03 — membership de sessão validada por header — idem
- CVG hoje:
  - WS-01: PARCIAL — `gate.ts` (`workspaceBase`, tenant) — workspace por tenant resolvido por realpath; sem registry de projetos/sessões.
  - WS-02: AUSENTE — não encontrado.
  - WS-03: DIVERGENTE_INTENCIONAL — tenant/RLS no PostgreSQL substitui membership por header (ADR-011).
- Lacunas:
  1. registro de "projetos" (ex.: unidade/turno/paciente) por tenant — P/M; relevância média; dúvida: o hospital precisa disso ou só de sessões/tarefas?
- Critério de aceite: listar sessões por workspace só do tenant; esconder não apaga evidência.
- Fora de escopo: UI de projetos DeepSeek.

## attachment (cartão P100-022)

- Referência: `packages/attachment/{attachment,attachment-local}` (`ctx.attachments`).
- Capacidades:
  - ATT-01 — anexar imagens a prompts/comandos com persistência durável — `attachment`
  - ATT-02 — reexibir anexos no histórico e reenviar ao modelo em turnos futuros — idem
  - ATT-03 — backend local sob `DSH_HOME` — `attachment-local`
- CVG hoje:
  - ATT-01..03: AUSENTE — não encontrado em `packages/*`. O canal (Chatwoot/Evolution) tem mídia de exame em `packages/channel-gateway/src/exam-egress.ts` (download/upload allow-list), mas sem entidade de anexo ao modelo.
- Lacunas:
  1. entidade de anexo por tenant/sessão (hash, mime verificado, tamanho, retenção/LGPD) — M; depende de persistence, retention-ledger, model-gateway multimodal; risco: dados de tutor/paciente em imagens, retenção; relevância alta (fotos, exames, receitas do tutor).
  2. política de redação e de retenção antes de enviar ao provider — M; risco: vazamento a provedor externo.
- Critério de aceite: anexo com mime falso é recusado; anexo fica ligado a tenant/sessão e é apagado pela política de retenção; replay reconstrói a referência.
- Fora de escopo: caminho `DSH_HOME`.

## document (cartão P100-022)

- Referência: `packages/document/office-to-pdf` (`ctx.officeToPdf`): conversão Office→PDF via LibreOffice/WASM com filas limitadas e cache.
- Capacidades:
  - DOC-01 — converter bytes autorizados de Office em PDF completo — `office-to-pdf`
  - DOC-02 — filas limitadas e cache reutilizável de PDFs — idem
  - DOC-03 — escolha de engine nativo ou WASM por alvo — idem
- CVG hoje: DOC-01..03: AUSENTE — não encontrado.
- Lacunas:
  1. conversão em ambiente contido (processo bwrap sem rede) com timeout e limite de página/tamanho — M/G; depende de sandbox (P100-024); risco: formato hostil, macro; relevância média (laudos/termos em docx).
  2. preview seguro de PDF para a equipe — M.
- Critério de aceite: docx hostil (zip bomb, macro) é recusado ou convertido sem efeito de rede/fs fora do workspace; conversão cancelada não deixa processo.
- Fora de escopo: kit LibreOffice independente e distribuição.
- Dúvida: o hospital precisa disso na F2 ou fica atrás dos exames?

## deliverables (cartão P100-022)

- Referência: `packages/deliverables/{tool-present,workspace-changes}`.
- Capacidades:
  - DLV-01 — ferramenta `present` declara arquivos finais entregues ao usuário (eventos duráveis) — `tool-present`
  - DLV-02 — resumo por turno dos arquivos alterados (snapshot git + captura de arquivo inteiro) — `workspace-changes`
  - DLV-03 — comparação de alterações servida por serviço — idem
- CVG hoje:
  - DLV-01..03: AUSENTE — não encontrado. O `fs.write` já grava "intent" e journal (`FsWriteJournal` em `fs-tools.ts`), que é um embrião de DLV-02.
- Lacunas:
  1. evento `deliverable.presented` com referência ao arquivo + hash e aprovação para entrega externa — P/M; risco: entregar arquivo a tutor sem aprovação; relevância alta.
  2. resumo de mudanças por turno a partir do journal de escrita (sem git) — M; relevância média (passagem de plantão: "o que mudou").
- Critério de aceite: nenhum arquivo sai do workspace sem evento `present` e aprovação; resumo de turno lista só caminhos journalizados.
- Fora de escopo: cards de UI.

## skill (cartão P100-022)

- Referência: `packages/skill/{skill,skill-filesystem,skill-badge,skill-office,tool-skill,tool-workspace-dependencies}`.
- Capacidades:
  - SKL-01 — registry que mescla catálogos de qualquer provider; vencedor por nome — `skill`
  - SKL-02 — descoberta em diretórios de projeto/custom/usuário com watch — `skill-filesystem`
  - SKL-03 — ferramenta `skill` que carrega instruções sob demanda + catálogo no prompt — `tool-skill`
  - SKL-04 — pacote Office (Word/PowerPoint/Excel) com checagens estruturais — `skill-office`
  - SKL-05 — relatório de dependências/interpretadores — `tool-workspace-dependencies`
- CVG hoje:
  - SKL-01: PARCIAL — `packages/harness/src/skills/registry.ts` — registry de skills com `requiredTools`/`requiredKnowledge` e risco.
  - SKL-02: PARCIAL — `skills/loader.ts`, `assert.ts` — loader/validação; sem watch nem múltiplas origens (provavelmente só repo).
  - SKL-03: PARCIAL — skill carregável (auditoria 0611); sem ferramenta de catálogo ao modelo confirmada.
  - SKL-04/05: AUSENTE.
- Lacunas:
  1. descoberta por origem com precedência e assinatura/hash (skill = código-instrução com autoridade) — M; risco: skill hostil ampliando tools; ligar a ADR-011 (controles obrigatórios); relevância alta.
  2. skills hospitalares (passagem de plantão, agenda, exame) com `requiredTools` verificados — M; relevância alta.
  3. catálogo gerado de skills em `TOOL_CATALOG.md` (já existe seção) — P.
- Critério de aceite: skill que exige tool fora do grant do agente falha ao carregar; skill sem hash aprovado não entra no catálogo.
- Fora de escopo: skill-badge (marca), skill-office.

---

## shell (cartão P100-023)

- Referência: `packages/shell/{shell,bash-local,bash-sandbox,pwsh-local,pwsh-sandbox,shell-env,tool-bash,tool-bash-persistent,tool-pwsh,tool-pwsh-persistent}`.
- Capacidades:
  - SH-01 — contrato de executor: foreground, handle de background, resolução de pedido — `shell`
  - SH-02 — `bash -c` fresco por chamada, com `workdir`, descrição e timeout — `tool-bash`
  - SH-03 — timeout move o comando para background como job (não mata); `run_in_background` com `job_output`/`job_kill` — `tool-bash` + `tool-jobs`
  - SH-04 — saída truncada com preview e caminho para o resto — `tool-bash`
  - SH-05 — executor confinado pela capacidade sandbox, com negações reportadas como fato — `bash-sandbox`
  - SH-06 — ambiente `DSH_*` gerenciado — `shell-env`
  - SH-07 — bash persistente isolado por dono — `tool-bash-persistent`
  - SH-08 — PowerShell (local/sandbox/persistente) — `pwsh-*`
- CVG hoje:
  - SH-01: PARCIAL — `shell-tool.ts` (`ShellRunRequest`, runner injetável) — contrato interno mínimo.
  - SH-02: DIVERGENTE_INTENCIONAL — `shell.run` aceita só argv puro (sem shell string), cwd confinado; risco HIGH e `requiresApproval: true`.
  - SH-03: AUSENTE — sem background nem jobs; timeout mata (máx 120 s).
  - SH-04: PARCIAL — `maxOutputBytes` 1 MiB (teto 8 MiB), `truncated` no resultado; sem spill/arquivo.
  - SH-05: PARCIAL — `run.ts` usa bwrap; `spawn_failed` vira falha; sem relatório de "negação" por efeito.
  - SH-06: AUSENTE — ambiente do filho não descrito; verificar que não herda segredos do host.
  - SH-07: AUSENTE (ver terminal). SH-08: AUSENTE e sem relevância (Linux).
- Lacunas:
  1. jobs em background com id, dono, kill e coleta de saída — M; depende de subprocess (kill de descendentes) e de journal de efeito; risco: processo órfão e efeito duplicado em retry; relevância média.
  2. relatório estruturado de negação/exit por política (fs deny, net deny) — P; relevância média.
  3. ambiente do filho com allowlist de variáveis e sem credenciais — P; risco alto (vazamento de segredos); relevância alta.
  4. spill de saída longa para artefato do workspace — P.
- Critério de aceite: filho nunca vê env de produção; timeout/cancel mata o grupo de processos inteiro; job de outro tenant não é legível.
- Fora de escopo: pwsh, `bash -c` livre (argv puro é decisão), UI de comando.
- Dúvida: o produto precisa de shell? Para hospital, `shell.run` pode ficar desativado por padrão; decidir antes de investir em jobs.

## terminal (cartão P100-023)

- Referência: `packages/terminal/{terminal,terminal-bash,tool-terminal}`; `docs/subsystems/terminal.md`.
- Capacidades:
  - TRM-01 — sessões PTY persistentes, ids opacos, dono exato, limpeza aguardada — `terminal`
  - TRM-02 — seis ferramentas: `terminal_open/send/read/close/list/signal` — `tool-terminal`
  - TRM-03 — `send` retorna por `stdin_read`, `inferred_idle`, `timeout` ou `session_exit`; leitura limitada — `terminal`
  - TRM-04 — backend bash/pwsh interativo sob a mesma política de sandbox — `terminal-bash`
- CVG hoje: TRM-01..04: AUSENTE.
- Lacunas:
  1. serviço de terminais por tenant/sessão com PTY real — G; depende de subprocess, sandbox nativo (PTY dentro de bwrap), node-pty/nativo; risco: reconexão herdar autoridade de outra sessão, processo órfão; relevância baixa (nenhuma jornada hospitalar pede REPL).
  2. cartão P100-023 pede "recuperação de screen" e reconexão — GG se incluído.
- Critério de aceite: terminal só responde ao dono exato; ao encerrar sessão/tenant todos os descendentes morrem; `send` repetido não repete efeito.
- Fora de escopo razoável: toda a família, até um caso de uso real; priorizar no fim.
- Dúvida: manter P100-023 como P0 se o produto não precisa? Sugiro rebaixar e dividir shell (P0) de terminal (P2).

## subprocess (cartão P100-023)

- Referência: `packages/subprocess/{subprocess,subprocess-local,win32-process}` (`ctx.subprocess`).
- Capacidades:
  - SUB-01 — lookup de executável, spawn gerenciado, observação de saída e terminação por um serviço único — `subprocess`
  - SUB-02 — faixa de processos gerenciada (kill de descendentes) com fallback explícito mais fraco — `subprocess-local`
  - SUB-03 — sessões de terminal reais — `subprocess`
  - SUB-04 — vida do processo sobrevive a reload do consumidor — `subprocess`
  - (win32-process: fora de escopo)
- CVG hoje:
  - SUB-01: PARCIAL — `run.ts` (`runContained`) — spawn de bwrap com timeout e limite de saída; sem serviço, sem lookup, sem registro.
  - SUB-02: PARCIAL — não confirmei kill de grupo/descendentes; `--unshare-pid` ajuda dentro do namespace.
  - SUB-03: AUSENTE. SUB-04: AUSENTE.
- Lacunas:
  1. serviço de subprocesso único (spawn, grupo, kill, wait, dispose) usado por shell, LSP, MCP stdio — M; depende de nada; risco: processo órfão; relevância alta como base técnica.
  2. teste funcional de kill de descendentes por timeout/cancel — P.
- Critério de aceite: após cancel/timeout/dispose não resta processo da árvore (verificado por /proc); dois consumidores usam o mesmo serviço.
- Fora de escopo: win32-process.

## sandbox + native/system (cartão P100-024)

- Referência: `packages/sandbox/{sandbox,sandbox-local,sandbox-policy,sandbox-windows-acl}`; `native/system/packages/{linux-x64,linux-arm64,darwin-*,entry}`; `docs/subsystems/sandbox.md`.
- Capacidades:
  - SBX-01 — modos `read-only`, `workspace-write`, `danger-full-access` (só os dois primeiros chegam ao provider) — `sandbox/src`
  - SBX-02 — `enforcement` reportado (`full` | `partial` | `unavailable`) e `describe(policy)` com runner, tmp e identidade — `sandbox`
  - SBX-03 — Linux: bwrap primeiro, depois Landlock — `sandbox-local`
  - SBX-04 — macOS Seatbelt — `sandbox-local`
  - SBX-05 — Windows token restrito + ACL de escrita — `sandbox-windows-acl`
  - SBX-06 — política compartilhada: padrões de deploy e override por sessão — `sandbox-policy`
  - SBX-07 — binários nativos por plataforma (`native/system`) — pacotes linux/darwin
- CVG hoje:
  - SBX-01: PARCIAL — `gate.ts` (`SandboxMode` IN_PROCESS/WORKSPACE/PROCESS; vocabulário próprio) — modos por ferramenta, com `denyModes` e journal; fail-closed.
  - SBX-02: PARCIAL — `capabilities.ts` (`mode`, `partial`, `reason`) — fatos reportados, mas sem "enforcement por efeito" e sem describe por chamada.
  - SBX-03: PRESENTE (bwrap) / AUSENTE (Landlock) — `run.ts` aplica `--unshare-pid/ipc/uts/net`, root ro, workspace rw. **Landlock é só `os.release() >= 5.13`; não há `landlock_create_ruleset`/`restrict_self`** (auditoria 0611, SPEC 0196 divergente). `requireLandlock` não prova nada.
  - SBX-04: AUSENTE. SBX-05: AUSENTE.
  - SBX-06: PARCIAL — `LocalSandboxGateOptions`; sem política por sessão persistida.
  - SBX-07: AUSENTE — sem addon nativo; o próprio capabilities.ts diz que Node não emite o syscall sem addon.
- Lacunas:
  1. Landlock real: probe de ABI por syscall (create_ruleset com flag de versão) e ruleset aplicado no filho (helper nativo pequeno em Rust/C, ou `bwrap`+`landlock` helper) — G; risco: false sense of security hoje; relevância alta (item de auditoria aberto, P0).
  2. renomear o booleano: até haver ruleset, `landlock` deve reportar "kernel_supports_abi_guess" e `requireLandlock` falhar fechado — P; relevância alta (honestidade de auditoria).
  3. teste funcional nativo: escrever fora do workspace, abrir /etc/shadow, conectar rede, ler `~/.ssh`, symlink e hardlink de fuga — M; relevância alta.
  4. seccomp / no-new-privs / limites de recursos (cgroups ou rlimits: memória, CPU, pids, tamanho de arquivo) — M; ausência hoje; risco: fork bomb, disco cheio.
  5. enforcement por efeito (fs, rede, processo) como fato e política recusável — M.
  6. macOS Seatbelt e Windows ACL — G/GG cada; relevância baixa para um servidor hospitalar Linux; sugerir "indisponível/recusável" explícito em vez de implementar.
  7. política de sandbox por sessão/tenant persistida — M; depende de persistence.
- Critério de aceite: nenhum suporte inferido só de versão; teste nativo prova negação de escrita fora, rede e leitura de segredos; indisponível/partial são recusáveis pelo chamador.
- Fora de escopo razoável: Seatbelt, ACL Windows, binários darwin.
- Dúvida: aceitar bwrap como contenção principal e Landlock como camada extra, ou exigir Landlock? Isso decide G vs. M.

---

## web (cartão P100-031)

- Referência: `packages/web/{web,web-fetch-http,web-search-exa,web-search-perplexity,web-search-deepseek,tool-web}`; `docs/subsystems/web.md`.
- Capacidades:
  - WEB-01 — serviço com duas operações (`search`, `fetch`) e seleção explícita de provider; ambíguo = erro, não "primeiro vence" — `web`
  - WEB-02 — fetch HTTP anônimo: resolve cada requisição, rejeita endereço não público (inclui DNS64), fixa o conjunto de IPs, repete a checagem em redirects do mesmo origin; cross-origin exige nova chamada — `web-fetch-http`
  - WEB-03 — três providers de busca (Exa, Perplexity, DeepSeek) — `web-search-*`
  - WEB-04 — `available()` local, sem rede — `web`
  - WEB-05 — ferramentas `web_search` e `web_fetch` — `tool-web`
  - WEB-06 — `WebError` com código aberto — `web`
- CVG hoje:
  - WEB-01: AUSENTE — sem seam.
  - WEB-02: PARCIAL — `packages/channel-gateway/src/adapters/ssrf-node.ts` + `fetchWithSsrfGuard` em `exam-egress.ts` — SSRF guard com DNS fixado e allow-list HTTPS; uso só para exames, não geral; confirmar redirect/size/rebind.
  - WEB-03: AUSENTE. WEB-04: AUSENTE. WEB-05: AUSENTE.
  - WEB-06: PARCIAL — erros da egress existem; sem taxonomia comum.
- Lacunas:
  1. seam web (fetch/search) reusando o guard de `ssrf-node` — M; depende de P100-014 e sandbox; risco: SSRF, exfiltração de dado de paciente na query, injeção por conteúdo da página; relevância média.
  2. proveniência e classe de dados: conteúdo web não vira "fonte institucional" (AGENTS.md: sem RAG sem fonte aprovada) — P; risco alto de misturar.
  3. provider de busca real — M; atrás de fixture e T4; relevância baixa/média (bula, consulta a guideline externa nunca é diagnóstico).
  4. teto de bytes, tipos de conteúdo, redirects e deadline testados — P.
- Critério de aceite: rebind, redirect para IP privado, resposta acima do cap e host fora da allow-list falham fechado; resultado marcado como "não institucional".
- Fora de escopo: provider DeepSeek native search.
- Dúvida: allow-list fechada por tenant ou web aberta com aprovação? Para hospital, recomendo allow-list.

## mcp (cartão P100-030)

- Referência: `packages/mcp/{mcp-client,mcp-resources}`; `docs/subsystems/mcp.md`.
- Capacidades:
  - MCP-01 — cliente por servidor, stdio ou Streamable HTTP, pelo SDK oficial (negociação, descoberta, cancelamento) — `mcp-client`
  - MCP-02 — tools expostas com nome qualificado pelo servidor; refresh em mudança de lista, mantendo geração anterior se falhar — `mcp-client`
  - MCP-03 — adaptador de resultado (JSON canônico + texto; imagens via attachment; conteúdo não suportado vira diagnóstico) — `mcp-client`
  - MCP-04 — recursos e templates: `list_mcp_resources`, `list_mcp_resource_templates`, `read_mcp_resource` — `mcp-resources`
  - MCP-05 — instruções do servidor no prompt, com limite `maxInstructionBytes` — `mcp-client`
  - MCP-06 — timeout, política de falha de startup, reconexão, scrub de ambiente — `mcp-client`
  - Limites declarados: sem prompts, elicitation, tasks, subscriptions de recursos.
- CVG hoje:
  - MCP-01: AUSENTE — só o tipo `CapabilityOrigin = 'mcp'` em `packages/harness/src/capability-boundary.ts` (registry); sem cliente.
  - MCP-02: PARCIAL — o registry com descritor, schema e `duplicate_capability` serve de base; nada descobre tools.
  - MCP-03: AUSENTE. MCP-04: AUSENTE. MCP-05: AUSENTE. MCP-06: AUSENTE.
- Lacunas:
  1. cliente MCP (stdio + HTTP) como adaptador de capacidades com origem `mcp`, passando por policy, approval e journal — G; depende de P100-025, subprocess, sandbox (stdio roda confinado) e web guard (HTTP); risco: tool externa fora do controle, schema hostil, prompt injection por resultado, servidor desconhecido; relevância média (integrar agenda/prontuário de terceiros via MCP é plausível).
  2. allow-list de servidores aprovados por tenant e credencial por servidor, sem vazar env do host — M.
  3. validação de schema e tamanho de resultado + efeito classificado (READ/WRITE/EXTERNAL) obrigatório antes de expor a tool — M; sem classificação, a tool fica indisponível.
  4. recursos (list/read) com limite e redação — M.
- Critério de aceite: tool externa não executa sem passar pelo mesmo pipeline (policy, approval, journal); servidor desconhecido, schema hostil e timeout são recusados; processo stdio morre no dispose.
- Fora de escopo: prompts, elicitation, tasks, Cua Driver.
- Dúvida: aceitar apenas tools de servidores internos aprovados no primeiro corte?

## lsp (cartão P100-032)

- Referência: `packages/lsp/{lsp,lsp-stdio,tool-lsp}`; `docs/subsystems/lsp.md`.
- Capacidades:
  - LSP-01 — quatro consultas somente leitura: `goToDefinition`, `findReferences`, `goToImplementation`, `hover` (coordenadas UTF-16 no seam, 1-based na ferramenta) — `lsp`
  - LSP-02 — provider por extensão de arquivo, servidores stdio configurados, sobre fs e subprocess — `lsp-stdio`
  - LSP-03 — ferramenta `lsp` dona do nome/schema; erros `LspError` estruturados — `tool-lsp`
- CVG hoje: LSP-01..03: AUSENTE — não encontrado.
- Lacunas:
  1. serviço LSP e ferramenta read-only — M; depende de subprocess e sandbox; relevância **baixa**: o produto não edita código; só útil se agentes mantiverem workspace de código (ex.: skills/regras).
- Critério de aceite: arquivo fora do workspace, timeout e EOF do servidor são recusados; subprocesso encerra no dispose.
- Fora de escopo razoável: família inteira, adiar até haver caso de uso. Sugestão: rebaixar P100-032 para P3.

## ssh (cartão P100-026)

- Referência: `packages/ssh/{ssh,fs-ssh,subprocess-ssh,sandbox-ssh}`; `docs/subsystems/ssh.md`.
- Capacidades:
  - SSH-01 — conexão OpenSSH compartilhada com helper remoto instalado e verificado; RPC administrativo por exec streams — `ssh`
  - SSH-02 — fs remoto (identidade de arquivo, leitura, mutação atômica com guarda) — `fs-ssh`
  - SSH-03 — subprocessos e terminais remotos; lançamento aceito no máximo uma vez; perda de SSH invalida operações pendentes e dispara limpeza — `subprocess-ssh`
  - SSH-04 — sandbox remoto aplicado pelo helper — `sandbox-ssh`
- CVG hoje: SSH-01..04: AUSENTE.
- Lacunas:
  1. carrier remoto (host aprovado, credencial isolada, deadline, reconexão sem repetir efeito) — GG; depende de ACP/SDK, subprocess, fs seam, sandbox; risco: efeito duplicado em retry, segredo de SSH, host não aprovado; relevância baixa/média (só se houver execução em máquina de laboratório/PACS).
- Critério de aceite: fixture remota controlada PASS; disconnect/retry não duplicam efeito; remoto real só no gate T4.
- Fora de escopo razoável: tudo, exceto se houver necessidade de executar no equipamento do hospital. Recomendo adiar.

## acp (cartão P100-026)

- Referência: `packages/acp/acp` — servidor ACP (Agent Client Protocol) por JSON-RPC/stdio, automação apenas.
- Capacidades:
  - ACP-01 — criar, listar, retomar e fechar sessões persistentes — `acp`
  - ACP-02 — escolher modelo e esforço de raciocínio por sessão — idem
  - ACP-03 — prompt, cancelar e receber atualizações semânticas — idem
  - ACP-04 — anexar servidores MCP por sessão; várias sessões multiplexadas numa conexão, com isolamento e posse por sessão — idem
- CVG hoje:
  - ACP-01..04: AUSENTE — não encontrado. Existem `packages/sdk` (client/server; P100-025 IN_PROGRESS) e API HTTP; ACP seria outro perfil sobre o mesmo contrato de sessão.
- Lacunas:
  1. perfil ACP stdio sobre o SDK/API (initialize, session/new, session/prompt, session/cancel, updates) — G; depende de P100-025; risco: sessão ACP sem tenant/auth, cancel não propagado, MCP anexado pelo cliente contornando allow-list; relevância baixa/média (integração com editores/IA externa; útil para subagentes externos P100-033).
  2. conformance wire com cliente de referência — M.
- Critério de aceite: sessão ACP herda tenant e grants do chamador; cancel interrompe sem efeito parcial duplicado; servidor MCP não aprovado é recusado.
- Fora de escopo razoável: seleção de modelo "reasoning effort" específica da DeepSeek.

---

## Riscos transversais

- Contenção: Landlock não aplicado; qualquer feature nova (shell, MCP stdio, LSP, conversão de documentos) herda a contenção de `bwrap`+allowlist. Fechar P100-024 (probe+ruleset+teste nativo) antes de ampliar processos.
- Efeito duplicado: background, terminais, ACP e SSH reconectam. Sem idempotência por chamada e journal de efeito, retry repete ação sensível.
- Dados: anexos, documentos e web trazem dado de tutor/paciente e conteúdo não institucional. Exigir classe de dados, retenção e rótulo "não é fonte aprovada".
- Autoridade: MCP, skills e ACP trazem capacidades de fora. Tudo precisa de allow-list por tenant, classificação de efeito e passagem pelo pipeline do kernel (ADR-011).
- Cobertura honesta: marcar indisponível/partial como recusável e testar funcionalmente (não por versão).

## Ordem sugerida

1. P100-024: renomear/fechar a alegação de Landlock, probe+ruleset real, testes nativos, limites de recurso.
2. Serviço de subprocesso único + ambiente do filho com allowlist (base de shell, MCP stdio, LSP, conversão).
3. P100-022 em fatias: read-before-edit, glob/grep, leitura binária/anexos com retenção, `present` com aprovação, skills com hash.
4. P100-030 (MCP com servidores aprovados) e P100-031 (web com allow-list reusando o SSRF guard).
5. Adiar ou rebaixar: terminal persistente, LSP, SSH, ACP, Seatbelt/ACL — só com caso de uso hospitalar.
