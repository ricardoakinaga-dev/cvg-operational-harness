# Auditoria crítica integral — 20/10/2026

**Parecer: NO_GO para produção. Auditoria concluída no escopo inspecionado; correções não implementadas.**

Fonte congelada: `main` em `3704e3f853e45e9a967dfc07b366eb9c6acb51a5`. A revisão abrange harness, API, console, worker, persistência, policy/approval, orchestrators, modelos, canais, RAG, SDK e o consumidor Assistente de Plantão. Nenhuma fonte de aplicação foi alterada. Apenas documentação/evidências no workspace e fixtures/outputs na candidata isolada. Dados exclusivamente sintéticos; sem push ou deploy.

## Resultado e evidência

Foram registrados **26 achados**, 16 P1 e 10 P2. P1 indica bloqueio alto nos perfis afetados; P2 indica defeito material sem demonstração de dano crítico imediato. Inspeção estática e reprodução executável estão identificadas separadamente. Não se afirma que todos sejam regressões novas: vários continuam abertos nas carteiras HISO/PISO. Nenhum P0 foi demonstrado nesta rodada.

A certificação controlada anterior e CI verde não eliminam os negativos reproduzidos. Há falhas no próprio núcleo reutilizável, além das falhas do produto. A barra0368 e decisões D1–D4 pertencem apenas ao Assistente de Plantão; o ensaio do harness não concede release a esse consumidor.

| Verificação atual                           | Resultado e limite                                                                                                                                                                                                                                                   |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Typecheck/lint Node22.23.2                  | PASS                                                                                                                                                                                                                                                                 |
| Suíte agregada original, PostgreSQL próprio | **FAIL: 5730 PASS,2 FAIL,5 SKIP**, total5737. Falhas nos limites de15s; causa não estabelecida.                                                                                                                                                                      |
| Triagem dos três arquivos envolvidos        | 86/86 PASS; execução original preservada, sem nova suíte completa verde.                                                                                                                                                                                             |
| Phase4A PostgreSQL explícito                | 1/1 PASS com PHASE4A_DISPOSABLE_PG=1. A ausência da flag explica somente esse skip original.                                                                                                                                                                         |
| Navegador Chromium/API real                 | 12/12 PASS, zero skip/falha/flaky; perfil de simulação controlada.                                                                                                                                                                                                   |
| Build imagem runtime da fonte               | PASS; Docker build --target runtime em tag própria.                                                                                                                                                                                                                  |
| Imagem/produção sintética API+worker+PG     | Smoke reportou22/22: roles/migration, login/cookie, outage de sessão, webhooks/replay/restart, approval uma vez, pausa/retomada e health. Recepção/assinatura de alertas observadas; detecção da parada final **não demonstrada** (F26). Receptor sintético privado. |
| npm audit atual, total e produção           | Zero vulnerabilidades reportadas pelo registro; não é garantia universal de segurança.                                                                                                                                                                               |
| CI da própria main                          | Verify e Security concluídos success; jobs de atestação e proveniência independentes verdes.                                                                                                                                                                         |
| Sondas adversariais novas                   | 7 núcleo (incluem2 controles bons),13 integrações,2 outbox+1 RLSworker. Sucesso da caracterização confirma o defeito observado, não aprovação de produção.                                                                                                           |

Evidências: [resumo](evidence/AUD-CRITICAL-20261020/verification-summary.json), [resultados completos originais](evidence/AUD-CRITICAL-20261020/unit-results.json), [triagem](evidence/AUD-CRITICAL-20261020/unit-failure-triage.log), [runtime](evidence/AUD-CRITICAL-20261020/runtime-probes.json), [integrações](evidence/AUD-CRITICAL-20261020/integration-probes.json), [PostgreSQL](evidence/AUD-CRITICAL-20261020/data-probes.json), [primeiros outbox](evidence/AUD-CRITICAL-20261020/first-data-probes.json), [pilha](evidence/AUD-CRITICAL-20261020/production-stack.json). Logs completos e candidata: `/home/ricardo/cvg-critical-audit-20261020/`.

CI observado: [Verify main](https://github.com/ricardoakinaga-dev/cvg-operational-harness/actions/runs/39208986630), [Security main](https://github.com/ricardoakinaga-dev/cvg-operational-harness/actions/runs/39208986532). Nenhum workflow novo foi disparado por esta auditoria.

## Barra congelada e aderência

| Critério                                     | Parecer           | Aderência/contrato                                                                                                                                  |
| -------------------------------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1 Rotas e contratos                         | FAIL              | SPEC0107/0114/0144: F12,F22,F23.                                                                                                                    |
| Q2 Identidade/tenant/policy/approval         | FAIL              | SPEC0107/0176, ADR005 e NO_MODEL vigente: F01,F05,F08–F10,F24.                                                                                      |
| Q3 Runtime/orchestrator limitado             | FAIL              | SPEC0181, budgets e cancelamento públicos: F02–F04,F11,F13–F15,F17,F20–F21.                                                                         |
| Q4 Persistência/restart/integridade          | FAIL              | PRD0023/Phase2 e SPEC0179: F05–F07,F15–F20.                                                                                                         |
| Q5 Integrações/canais/modelo/RAG/produto     | FAIL              | ADR004/007/010 e SPEC0180: F13,F14,F21,F24; integrações reais NOT_RUN.                                                                              |
| Q6 Deploy/observabilidade/recuperação        | PARTIAL/BLOCKED   | Smoke0373 reportou22/22 com oracle insuficiente para a parada final (F26); ambiente real0374 e produto0368 sem aceite atual observado; F19–F21,F25. |
| Q7 Evidências e rastreabilidade da auditoria | PASS no relatório | Barra/manifesto congelados, negativos e limitações preservados; não concede PASS do programa.                                                       |

## Achados priorizados

### F01 — P1 — Operador sem vínculo ao caso lê conversas e auditoria

**Dono:** API/identidade. **Evidência:** `RUNTIME`; confiança alta. Fonte: `apps/api/src/server.ts:1394,1675,2247`.

Observado: Sessão trusted de Operator sem atribuição recebe200 na lista, timeline e auditoria de caso do mesmo tenant, incluindo marcador privado sintético.

Impacto: O isolamento por tenant não implementa o escopo por caso exigido para view_assigned/view_limited. Não foi demonstrado bypass entre tenants pela API.

Fechamento: Implementar a autoridade de atribuição e projeção por caso da SPEC0176 sob T3; testar matriz por pessoa/recurso e ausência de vínculo.

Prova: `integration-probes.json#trusted-unassigned-case` em [evidências desta rodada](evidence/AUD-CRITICAL-20261020/findings.json).

### F02 — P1 — Orquestração chama modelo antes de aplicar budget e perde consumo em erro

**Dono:** runtime/orchestrator. **Evidência:** `RUNTIME`; confiança alta. Fonte: `packages/harness/src/iterative-runtime.ts:992,1011,1355; packages/orchestrator/src/hybrid-orchestrator.ts:174`.

Observado: maxModelCalls=0 fez1 chamada; limite1/reparos0 fez6 chamadas;3 respostas inválidas terminaram INTERNAL_FAILURE com modelCalls/tokens/custo0. Controles: single-pass com limite0 fez0 chamadas; regra determinística também0.

Impacto: O limite não impede I/O/gasto na decisão e o erro oculta consumo já ocorrido.

Fechamento: Unificar reserva/contabilização por chamada da decisão e reparo com o kernel; conservar consumo em exceptions e aplicar budget restante antes de cada provider.

Prova: `runtime-probes.json#zero-model-budget,repair-overrun,lost-orchestration-usage` em [evidências desta rodada](evidence/AUD-CRITICAL-20261020/findings.json).

### F03 — P1 — Montagem de contexto ultrapassa prazo e ainda termina COMPLETED

**Dono:** runtime/contexto. **Evidência:** `RUNTIME`; confiança alta. Fonte: `packages/harness/src/iterative-runtime.ts:944,958,992`.

Observado: ContextEngine bloqueado, budget40ms e cancelamento: após125ms execução ainda pendente; liberar contexto chama orchestrator e termina COMPLETED.

Impacto: Dependência de contexto pode prender execução; o prazo calculado antes da espera fica obsoleto.

Fechamento: Limitar a espera de contexto pelo prazo absoluto e sinal, recalcular restante e revalidar antes da próxima decisão/efeito.

Prova: `runtime-probes.json#context-deadline` em [evidências desta rodada](evidence/AUD-CRITICAL-20261020/findings.json).

### F04 — P1 — Cancelamento durante decisão não chega ao orchestrator

**Dono:** runtime/orchestrator. **Evidência:** `RUNTIME`; confiança alta. Fonte: `packages/harness/src/iterative-runtime.ts:649,991,1764`.

Observado: Após abort do caller, o sinal recebido pelo orchestrator permanece ativo e execute não encerra; decisão STOP liberada depois retorna COMPLETED.

Impacto: O controle de cancelamento não governa essa fronteira.

Fechamento: Compor sinais do turno e do deadline, competir espera com cancelamento e revalidar ao retornar, preservando efeitos incertos.

Prova: `runtime-probes.json#orchestrator-cancel` em [evidências desta rodada](evidence/AUD-CRITICAL-20261020/findings.json).

### F05 — P1 — Preflight omite RLS do journal utilizado pelo kernel

**Dono:** worker/persistência. **Evidência:** `RUNTIME_POSTGRES`; confiança alta. Fonte: `apps/worker/src/postgres-role-preflight.ts:14; apps/worker/src/kernel-composition.ts:267; packages/persistence/src/effect-journal-postgres.ts:264`.

Observado: Role mínimo sem SUPERUSER/BYPASSRLS; RLS desativado somente em effect_journal. Ambos preflights aceitaram; sweep sob tenantA alterou reserva de tenantB para ABANDONED.

Impacto: Falha de configuração de uma tabela crítica passa despercebida e permite escrita entre tenants pelo sweep sem predicado tenant.

Fechamento: Incluir journal e approvals no inventário crítico canônico do worker e verificar RLS/FORCE/policy/owner/grants; defesa adicional no sweep e negativo conhecido.

Prova: `data-probes.json#worker-rls-preflight` em [evidências desta rodada](evidence/AUD-CRITICAL-20261020/findings.json).

### F06 — P1 — Tentativa antiga pode encerrar claim novo com workerId reutilizado

**Dono:** outbox. **Evidência:** `RUNTIME_POSTGRES`; confiança alta. Fonte: `packages/persistence/src/postgres-outbox.ts:224,524; deploy/harness/compose.production.yaml:158`.

Observado: Claim1 expirou, claim2 usou mesmo workerId; fail terminal da tentativa1 foi aceito e levou a tentativa2 a dead_letter.

Impacto: WorkerId estável não distingue gerações; ACK/fail de processo atrasado podem alterar trabalho atual.

Fechamento: Fencing token/generation por claim, obrigatório em ack/fail/renew; testar processo antigo contra claim novo, inclusive mesmo ID.

Prova: `first-data-probes.json#outbox-attempt-fence` em [evidências desta rodada](evidence/AUD-CRITICAL-20261020/findings.json).

### F07 — P1 — Falha de organização encerra entrada e impede retry

**Dono:** produto/inbox. **Evidência:** `RUNTIME`; confiança alta. Fonte: `products/shift-assistant/src/assistant.ts:175,185; products/shift-assistant/src/store.ts:62`.

Observado: Organizer falhou; message_processed foi registrado; resumePending retornou0 e o mesmo messageId foi recusado.

Impacto: A mensagem guardada fica fora da retomada apesar da orientação para tentar novamente.

Fechamento: Inbox com estados/tentativas/retomada e classificação de erro; concluir apenas após commit do resultado. Carteira existente PISO003.

Prova: `integration-probes.json#failed-message-retry` em [evidências desta rodada](evidence/AUD-CRITICAL-20261020/findings.json).

### F08 — P1 — Rascunho abre tarefa e dispara lembrete antes de ok

**Dono:** produto/confirmacão. **Evidência:** `RUNTIME`; confiança alta. Fonte: `products/shift-assistant/src/assistant.ts:341,447`.

Observado: Nota confirmed=false com tarefa open; tick enviou lembrete sem comando ok.

Impacto: Saída não validada do modelo ativa comportamento operacional do produto.

Fechamento: Confirmação atômica de revisão exata cria/ativa pendências; rascunho não fica elegível ao scheduler. PISO001.

Prova: `integration-probes.json#unconfirmed-ambiguous-task` em [evidências desta rodada](evidence/AUD-CRITICAL-20261020/findings.json).

### F09 — P1 — Homônimos vinculam pendência ao primeiro paciente

**Dono:** produto/identidade. **Evidência:** `RUNTIME`; confiança alta. Fonte: `products/shift-assistant/src/assistant.ts:491`.

Observado: Dois Rex com IDs101/202; pendência só com nome recebeu101 por ordem da lista.

Impacto: Lembrete pode ser associado ao paciente errado.

Fechamento: Referência inequívoca por paciente/pendência e pergunta em ambiguidade; evidência de ID por campo. PISO002.

Prova: `integration-probes.json#unconfirmed-ambiguous-task` em [evidências desta rodada](evidence/AUD-CRITICAL-20261020/findings.json).

### F10 — P1 — Revogação de membro não impede saída de lembrete

**Dono:** produto/allowlist. **Evidência:** `RUNTIME`; confiança alta. Fonte: `products/shift-assistant/src/assistant.ts:79,126`.

Observado: Recompor com lista semA e tarefa antiga deA manteve envio paraA.

Impacto: Informação do caso pode ser enviada a pessoa removida da equipe.

Fechamento: Revalidar destinatário atual antes do envio e estacionar pendências de membro revogado. PISO005/006.

Prova: `integration-probes.json#revoked-member` em [evidências desta rodada](evidence/AUD-CRITICAL-20261020/findings.json).

### F11 — P1 — Ticks duplicam lembrete e continuam após pausa

**Dono:** produto/scheduler. **Evidência:** `RUNTIME`; confiança alta. Fonte: `products/shift-assistant/src/compose.ts:111; products/shift-assistant/src/assistant.ts:110`.

Observado: Dois ticks sobre o mesmo task fizeram2 envios; pausa durante primeiro envio não impediu o segundo task.

Impacto: Efeito duplicado e controle de desligamento parcial.

Fechamento: Serializar/reservar disparos, outbox durável e rechecagem de pausa antes de cada efeito. PISO006.

Prova: `integration-probes.json#overlapping-ticks,pause-during-tick` em [evidências desta rodada](evidence/AUD-CRITICAL-20261020/findings.json).

### F12 — P1 — Bootstrap do console não restaura sessão só por cookie

**Dono:** web/sessão. **Evidência:** `RUNTIME_COMPONENT`; confiança alta. Fonte: `apps/web/src/main.tsx:14; apps/web/src/auth/session.ts:55; apps/api/src/server.ts:771`.

Observado: Provider de token retornou null; load rejeitou401 local sem chamar getSession, mesmo com endpoint preparado para cookie.

Impacto: Reload exige token novo apesar de cookie válido; integração real difere dos helpers que reinjetam token.

Fechamento: Tentar restauração por cookie antes de exigir bootstrap/reauth; validar navegador recarregado sem init-script. SPEC0144.

Prova: `integration-probes.json#cookie-only-bootstrap` em [evidências desta rodada](evidence/AUD-CRITICAL-20261020/findings.json).

### F13 — P2 — Sinal já abortado não impede provider

**Dono:** model-gateway. **Evidência:** `RUNTIME`; confiança alta. Fonte: `packages/model-gateway/src/gateway.ts:301,318`.

Observado: generate com AbortSignal.abort executou provider1vez com sinal novo não abortado e retornou sucesso.

Impacto: Cancelamento anterior não impede I/O/gasto.

Fechamento: Verificar aborto antes de budget/attempt e após backoff; compor sinais sem perder estado prévio; limpar listener.

Prova: `integration-probes.json#gateway-pre-abort` em [evidências desta rodada](evidence/AUD-CRITICAL-20261020/findings.json).

### F14 — P2 — Limites maxCostUsd da request/profile não são aplicados

**Dono:** model-gateway. **Evidência:** `RUNTIME`; confiança alta. Fonte: `packages/model-gateway/src/contracts.ts:59,120; packages/model-gateway/src/gateway.ts:262`.

Observado: Request e profile maxCostUsd0, estimativa positiva: provider executou e custo retornado0.002.

Impacto: Contrato expõe teto que o caller não pode fazer valer.

Fechamento: Aplicar combinação restritiva dos tetos antes do provider e contabilização honesta após resultado, sem substituir por budget global opcional.

Prova: `integration-probes.json#gateway-cost-ceiling` em [evidências desta rodada](evidence/AUD-CRITICAL-20261020/findings.json).

### F15 — P2 — Atualizações concorrentes reabrem tarefa terminal

**Dono:** API/tasks. **Evidência:** `RUNTIME_ROUTE`; confiança alta. Fonte: `apps/api/src/server.ts:1780; packages/persistence/src/postgres.ts:1036`.

Observado: Dois PATCHs leram open; done seguido de in_progress responderam200; estado final in_progress. Interleaving por barreira no port e escrita real do adapter memória, preservando método síncrono. SQL PostgreSQL também não possui expected status.

Impacto: Validação separada da escrita permite transição a partir de estado obsoleto.

Fechamento: CAS por versão/status ou transação com lock e audit atômico; confirmar também sob conexões PostgreSQL concorrentes.

Prova: `integration-probes.json#task-concurrent-terminal` em [evidências desta rodada](evidence/AUD-CRITICAL-20261020/findings.json).

### F16 — P2 — Falha de audit deixa alteração de task comprometida

**Dono:** API/audit. **Evidência:** `RUNTIME_ROUTE`; confiança alta. Fonte: `apps/api/src/server.ts:1785; apps/api/src/server.ts:4905`.

Observado: Injetar falha no port audit.append após update produziu500 e task done persistida no adapter memória. Operações SQL são separadas; fault durável específico não executado.

Impacto: Cliente recebe erro após mutação sem trilha correspondente.

Fechamento: Commit atômico de task+audit, ou obrigação durável verificável; fault/retry não deve criar resultado ambíguo.

Prova: `integration-probes.json#task-audit-partial` em [evidências desta rodada](evidence/AUD-CRITICAL-20261020/findings.json).

### F17 — P2 — Recuperação de crash contorna teto de tentativas

**Dono:** filas/retry. **Evidência:** `RUNTIME_POSTGRES_PARTIAL`; confiança alta. Fonte: `packages/persistence/src/postgres-outbox.ts:195,532; packages/persistence/src/operational-execution-postgres.ts:486,1124`.

Observado: Outbox com máximo5 continuou processing no claim7 após expirações sem fail. Caminho correspondente da execution spine inspecionado, sem sonda separada.

Impacto: Crash/lease expiry pode reciclar poison work indefinidamente.

Fechamento: Aplicar exhaustion na recuperação/claim e handoff/terminal durável; testar crash repetido nos dois stores.

Prova: `first-data-probes.json#outbox-unbounded-crash-retry` em [evidências desta rodada](evidence/AUD-CRITICAL-20261020/findings.json).

### F18 — P2 — Última linha JSONL truncada impede inicializar histórico válido

**Dono:** produto/journal. **Evidência:** `RUNTIME`; confiança alta. Fonte: `products/shift-assistant/src/store.ts:39,48`.

Observado: Prefixo válido carregou; acrescentar cauda incompleta fez construtor lançar SyntaxError.

Impacto: Após escrita interrompida, produto exige recuperação manual; perda física de dados não foi medida.

Fechamento: Protocolo de commit/recuperação do prefixo e sync/backup sob SPEC0179, preservando linha inválida para diagnóstico. PISO004.

Prova: `integration-probes.json#jsonl-tail` em [evidências desta rodada](evidence/AUD-CRITICAL-20261020/findings.json).

### F19 — P1 — Persistência parcial da cadeia perde registros não reenviados

**Dono:** worker/audit. **Evidência:** `STATIC`; confiança alta. Fonte: `apps/worker/src/kernel-composition.ts:345,395,462; apps/worker/src/kernel-audit-chain.ts:101`.

Observado: Slice começa no tamanho atual do ledger; inserts separados. Falha no segundo insert deixa sufixo em memória e o próximo turno começa após ele, sem cursor durável de retry.

Impacto: Cadeia persistida pode ter lacuna permanente e bloquear verificação/backup; fault não executado nesta rodada.

Fechamento: Batch transacional ou cursor durável que reenvia exatamente o sufixo faltante; fault no insert2 e verificação da cadeia após retry.

Prova: `review-data.md` em [evidências desta rodada](evidence/AUD-CRITICAL-20261020/findings.json).

### F20 — P2 — Heartbeat PostgreSQL verifica dono, mas não renova lease

**Dono:** worker/leases. **Evidência:** `STATIC`; confiança alta. Fonte: `apps/worker/src/continuous-worker.ts:270; packages/persistence/src/tenant-scoped-postgres.ts:234`.

Observado: Adapter não fornece heartbeatClaim; fallback lê status/owner, sem estender lease_until.

Impacto: Trabalho longo pode ser retomado por outro worker apesar de métricas de heartbeat; cenário de duas instâncias não executado aqui.

Fechamento: Renew por CAS/fencing e recusa quando expirada; testar handler acima do lease e takeover controlado.

Prova: `review-data.md` em [evidências desta rodada](evidence/AUD-CRITICAL-20261020/findings.json).

### F21 — P1 — Recepção e esperas de canais não têm limites efetivos em todas as camadas

**Dono:** transportes compartilhados/produto. **Evidência:** `STATIC`; confiança alta. Fonte: `packages/model-gateway/src/providers/ssrf-node.ts:167; packages/model-gateway/src/providers/openai-compatible.ts:198; packages/channel-gateway/src/adapters/evolution.ts:195; products/shift-assistant/src/whatsapp.ts:88,182; products/shift-assistant/src/transcriber.ts:57`.

Observado: Modelo acumula chunks antes do teste de tamanho; canais não propagam teto e prazo; produto usa leitura integral e fila serial. /health do produto informa ok sem demonstrar avanço.

Impacto: Resposta volumosa ou pendurada pode reter memória, fila, pausa e shutdown. Não foram enviados corpos grandes nem feitas chamadas reais.

Fechamento: Streaming com teto por chunk, deadline/cancelamento até fim do corpo, fila/stop limitados e health de progresso. SPEC0180/PISO005.

Prova: `review-product-clarification.md` em [evidências desta rodada](evidence/AUD-CRITICAL-20261020/findings.json).

### F22 — P2 — Decisão de approval não mostra resumo e caso

**Dono:** web/approval. **Evidência:** `STATIC`; confiança alta. Fonte: `apps/web/src/api/client.ts:457; apps/web/src/features/approvals/index.tsx:1,59`.

Observado: DTO tem summary/sessionId, mas o painel apresenta ação, risco e estado junto aos botões sem essas informações.

Impacto: Pedidos de mesma ação/risco de casos diferentes ficam indistinguíveis para decisão.

Fechamento: Exibir resumo/contexto e navegação inequívoca, sem ampliar permissões; prova de UI com dois casos. SPEC0114.

Prova: `review-api.md` em [evidências desta rodada](evidence/AUD-CRITICAL-20261020/findings.json).

### F23 — P2 — Listas de tarefas e approvals não aplicam paginação

**Dono:** API/listagens. **Evidência:** `RUNTIME_TASKS_STATIC_APPROVALS`; confiança alta. Fonte: `apps/api/src/server.ts:1756,1940; packages/persistence/src/postgres.ts:967,1221`.

Observado: GET tasks?limit=1&offset=100 retornou as2 tarefas. Handler/SQL de approvals também selecionam coleção inteira.

Impacto: Histórico crescente amplia consulta, payload e render; limiar de exaustão não foi medido.

Fechamento: Paginação validada/limitada e filtros de estado, contrato/metadados e testes sob volume representativo. SPEC0107.

Prova: `integration-probes.json#unbounded-task-list` em [evidências desta rodada](evidence/AUD-CRITICAL-20261020/findings.json).

### F24 — P1 — Produto chama provider direto apesar de NO_MODEL clínico vigente

**Dono:** produto/policy. **Evidência:** `STATIC_CONTRACT`; confiança alta. Fonte: `products/shift-assistant/src/compose.ts:67; products/shift-assistant/src/organizer.ts:45; docs/02_spec/0179_shift_consumer_reliability-approval-status.md:7`.

Observado: Compose injeta OpenAICompatibleProvider direto e organizer envia a nota sem gateway/classificação. Estado adjacente de0179 mantém NO_MODEL e D2 separada.

Impacto: Caminho implementado não faz cumprir a restrição de transmissão clínica; nenhum dado clínico ou provider real foi usado nesta auditoria.

Fechamento: Negar organização clínica antes do provider pela autoridade vigente; integração pública via SPEC0180, sem reclassificar notas fictícias como INTERNAL. Decisão D2 separada.

Prova: `review-product-clarification.md` em [evidências desta rodada](evidence/AUD-CRITICAL-20261020/findings.json).

### F25 — P1 — Imagem e egress do produto não cumprem toda barra0368

**Dono:** produto/deploy. **Evidência:** `STATIC_ARTIFACT_RECIPE`; confiança alta. Fonte: `products/shift-assistant/deploy/Dockerfile:20; products/shift-assistant/deploy/compose.yaml; docs/03_build/0368_barra_proporcional_assistente_de_plantao.md`.

Observado: Receita retém base Debian com shell; compose declara usuário/disco/capabilities, mas enforcement por destino da rede não é demonstrado.

Impacto: Barra sem shell/rede por lista não está comprovada no deploy do produto; imagem do produto não foi construída nesta rodada.

Fechamento: Validar receita final sem shell e firewall por destino no ambiente do produto; provas de backup, alerta e stop próprios, sem herdar certificação do harness.

Prova: `review-product-clarification.md` em [evidências desta rodada](evidence/AUD-CRITICAL-20261020/findings.json).

### F26 — P2 — Oracle de alerta aceita histórico anterior à parada

**Dono:** qualificação/observabilidade. **Evidência:** STATIC_AND_RAW_ARTIFACT; confiança alta. Fonte: `scripts/production-stack-smoke.ts:721,735`.

Observado: após remover o worker, o teste relê todos os logs e aceita qualquer `code=worker_down`, sem exigir `state=firing`, instante posterior à parada ou novo recebimento. O raw inclui firing/resolved anteriores. Assim, o smoke reportou22/22, a recepção/assinatura foram observadas e **a detecção da parada final não foi demonstrada**.

Impacto: o gate pode aprovar mesmo se a última parada não gerar novo alerta. Não se afirmou que o monitor efetivamente falhou; a insuficiência é do oracle.

Fechamento: capturar offset e instante antes de parar; exigir novo firing correlacionado ao evento e testar histórico antigo sem nova entrega como negativo conhecido. Prova: `production-stack.json#alert.worker_down_delivered_signed`, com código do script em721–751. Encontrado pela crítica final e confirmado pelo Lead, sem nova execução ou correção de software.

## Rotas, fronteiras e observabilidade inspecionadas

O buildServer monta74 registros explícitos método/path:63 em server.ts (incluem os probes por constantes) e11 de jornadas. Excluem HEAD automático/OPTIONS. Famílias: health/live/ready/métricas; sessão/logout; executions/input/cancel/approval/trajectory; conversas/timeline/takeover; webhook de canal; tasks; approvals de atendimento e capability; auditoria/checkpoints; catálogos de plugins/conhecimento/release; agentes/versões/publicação/rollback; laboratório de testes/traces; jornadas legadas/drafts/slots. Inventário e condições de montagem na [revisão de API](evidence/AUD-CRITICAL-20261020/review-api.md).

As rotas de métricas existem, mas respondem404 em produção. Trajectory depende de executionSteps injetado, ausente na composição publicada. Jornadas com adapter null permanecem montadas e recusam. OIDC start/callback não estão montados; `/v1/sessions/:sessionId/runs` da SPEC0107 também não é uma rota implementada. Essas ausências são lacunas de integração/contrato, não bypass de autenticação demonstrado.

A jornada de imagem provou API→inbox/outbox→worker/kernel→approval→efeito sintético→audit, além de recuperação de sessão, replay após restart e pausa/retomada. O smoke reportou22/22, mas só recepção/assinatura de alertas foram observadas: o oracle aceita histórico antigo e a detecção da parada final não foi demonstrada (F26). Não prova a cadeia sob insert parcialF19, handlers acima do leaseF20, nem concorrência com processo atrasadoF06. O alerta foi recebido dentro da rede de ensaio; nenhuma pessoa ou canal externo foi contactado.

Policy de ferramentas tem pisos determinísticos e approval de uso único no caminho exercitado. O núcleo, runtime turn-oriented e o consumidor não são contratos intercambiáveis: a existência desses controles não prova que a chamada direta do organizador do produto os atravesse. RAG/catalogação foram inspecionados e seus testes entram na suíte; nenhuma resposta clínica ou fonte institucional real foi usada. Providers/HIS/WhatsApp/Whisper reais permanecem NOT_RUN.

SDK e portas públicas foram inspecionados e testados no denominador agregado; candidatas de paridade/isolamento não promovidas não integram esta conclusão. Documentos de overview ainda descrevem fases antigas enquanto PUBLIC_API já descreve kernel/iterativo: usar exports e composição atuais como referência de implementação, sem tratar proposta como implementação.

## Plano de remediação e gates

1. **Conter efeitos:** impedir promoção para produção. Bloquear organização clínica no consumidor até D2 e preservar NO_MODEL. Nenhuma flag sensível foi habilitada.
2. **Núcleo/segurança primeiro:** F01–F06 e F19. SPEC finita para identidade, budgets, cancelamento, preflight/fencing e atomicidade de audit; mudanças T3 exigem revisão explícita conforme constituição. Negative tests devem falhar antes e passar após a correção, incluindo tenantA/B e processo antigo.
3. **Confiabilidade de execução:** F13–F18,F20–F23. CAS/audit de tasks, limites de gateway/transporte, retry bounded e renovação com fencing. Não criar backlog concorrente: registrar as linhas de continuidade no master e encaminhar aos cartões existentes quando houver.
4. **Consumidor separado:** F07–F11,F18,F24–F25 entram em PISO001–PISO008/SPEC0179–0180 e backlog do produto. As SPECs têm recibos adjacentes de aprovação local; nenhuma aprovação de BUILD sintético é release ou transmissão clínica.
5. **Qualificar depois dos reparos:** suíte integral sem skips inesperados, PG com roles mínimos, E2E trusted/reload sem reinjeção, falhas duráveis/restart/concurrency e certify do candidato final limpo. Preservar falhas anteriores. Coverage/SBOM/licenças não foram reemitidos nesta rodada só de auditoria.
6. **Ambiente real:** cumprir decisões0374 e barra0373/0368 por artefato: IdP/MFA/topologia HTTPS, rede por destino, segredos, restore do backup do próprio destino, alerta real e desligamento/retomada; aprovação humana vinculada à candidata. Ausência de integração real não vira aprovação por CI.

## Independência, não mutação e limites

Três críticos I1 em sessões novas, fork_context=false, mesmo modelo herdado, sem descendentes ou escrita: API/console, produto/transportes, worker/persistência. Lead executou as sondas em ambiente próprio. A leitura dos documentos obrigatórios expôs aos críticos algumas narrativas históricas embutidas; a ressalva de cegamento é preservada. Julgamentos estáticos são sustentados por fontes atuais, não convertidos em runtime PASS. A hipótese sobre classificação CLINICAL do prompt com request INTERNAL foi excluída dos achados: a semântica de teto versus conteúdo exige desambiguação, e o teste atual aceita classificação mais estreita.

Manifesto1288 inputs não documentais antes/depois: `21e540fa40f40bcebf32e38f93c1694be777691e967fb97c20f24ddb59f6d207`; [sentinela](evidence/AUD-CRITICAL-20261020/mutation-sentinel.json). Os outputs/fixtures de auditoria foram escritos apenas na candidata detached. As alterações documentais preexistentes na root foram preservadas. Os ledgers99/20/30 já estavam modificados; o [handoff](../08_runtime/handoffs/aud_critical_20261020.md) entrega entradas próprias para integração conforme regra5, sem sobrescrever trabalho pendente.

A crítica final I1 encontrou F26: a alegação inicial de detecção da parada foi retirada. A ressalva consta também no resumo verificável; o raw22/22 foi preservado sem reescrita.

Este é um parecer sobre a fonte e os perfis observados, não uma garantia de ausência de bugs. São limites materiais: ambiente real não inspecionado; dados/provedores/canais reais não utilizados; execução original integral com duas falhas de deadline e cinco skips não substituída por uma execução completa limpa; fault de audit durável e cenário longo de heartbeat ainda não executados; imagem do produto e homologação real próprias pendentes.

Crítica final e limpeza dos recursos: registradas em `final-review.md` e `cleanup.json` desta evidência após fechamento.
