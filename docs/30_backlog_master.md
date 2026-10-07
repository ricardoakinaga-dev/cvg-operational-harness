# PROD-0373 rodada 5 — AUD-0604 corrigida — 06/10/2026

- Task `PROD-0373-20261006` rodada 5: `DONE_LOCAL`. Supersede a disposição OPEN de AUD0604-F01/F02.

| Task               | Estado           | Critério atendido                                                                                                         |
| ------------------ | ---------------- | ------------------------------------------------------------------------------------------------------------------------- |
| AUD0604-F01        | FIXED_LOCAL      | Conexão terminada no meio da troca: 503 sem Set-Cookie, processo e `/live` vivos, cookie anterior 200, nova sessão 200    |
| AUD0604-F02        | FIXED_LOCAL      | Serving recusa credencial DDL e auto-migração; dono do schema verificado por catálogo; job de migração separado na imagem |
| SECRET-SCAN-WEEKLY | DECISION_PENDING | Política para os 105 achados heurísticos da varredura semanal                                                             |
| 0373-C5            | PENDING_PUSH     | Push, CI verde e proteção do `main`                                                                                       |

# AUD-0604 — correções AUD-0603 verificadas, novo P1 e P2 — 06/10/2026

- Task `AUD0604-REMEDIATION-PUBLISH-20261006`, Codex; auditoria DONE, publicação DONE (main5dad651 confirmado), entrega PARTIAL/NO_GO. [Parecer](04_audit/0604_reauditoria_aud0603_2026-10-06.md).

| Item            | Estado                 | Próxima ação / critério                                                                                                                            |
| --------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| AUD0603-F01/F02 | CLOSED_EXERCISED_SCOPE | Rollback503 antiga200/retry e predecessor401/sucessora401/nova200 em PostgreSQL e imagem                                                           |
| AUD0604-F01 P1  | OPEN                   | PROD-0373/API: tratar erro no cliente adquirido sem crash,503 sem cookie, live/proc vivos e recuperação; repro imagem exit1                        |
| AUD0604-F02 P2  | OPEN_INHERITED         | PROD-0373/API/arquitetura: reconciliar SPEC0144 sem DDL no serving com bootstrap que exige URL migration; decisão explícita ou remover dependência |
| Publicação Git  | DONE_FIRST_PUSH        | Main5dad651 confirmado; recibo/follow-up documental com staging próprio e push normal                                                              |
| CI / condição5  | PENDING_REMOTE         | Verify/Security/E2E/certificação no SHA final, depois proteção por frente responsável; nenhum PASS inferido                                        |
| Scan semanal    | POLICY_PENDING         | Resultado histórico105/94/11, sem triagem universal ou mudança de política nesta auditoria                                                         |
| Ambiente real   | OPEN_NO_GO             | Servidor, PG/papéis/migrações, segredos, HTTPS/proxy e backup agendado; nenhum release                                                             |

- 359/2.948 e PG37/301 PASS, branches críticos≥96,73%, mutation10/10 e gates básicos PASS; imagem18/18 e23/23 PASS, mas interrupção da conexão FAIL. Fonte/lock preservados, recursos próprios removidos; implementação da remediação pertence ao owner, auditoria não altera código.

- Publicação DONE: commit5dad651 e os sete recebidos publicados por push normal; main remoto confirmado. [Recibo](04_audit/evidence/AUD0604-REMEDIATION-20261006/publication.json). Verify/Security inicial em andamento/pendente; follow-up do recibo exclusivamente documental terá CI próprio. F01/F02 novos permanecem OPEN, produção NO_GO.

# PROD-0373 rodada 4 — AUD-0603 corrigida — 06/10/2026

- Task `PROD-0373-20261006` rodada 4: `DONE_LOCAL`. Supersede a disposição OPEN de AUD0603-F01/F02.

| Task               | Estado           | Critério atendido                                                                                                  |
| ------------------ | ---------------- | ------------------------------------------------------------------------------------------------------------------ |
| AUD0603-F01        | FIXED_LOCAL      | Criação falhando após revogação: 503 sem Set-Cookie, sessão anterior 200; retry troca e aposenta (PostgreSQL real) |
| AUD0603-F02        | FIXED_LOCAL      | Predecessor A1 → sucessora A2 → troca com A1: A1 e A2 401, nova sessão 200                                         |
| SECRET-SCAN-WEEKLY | DECISION_PENDING | Política para os 105 achados heurísticos da varredura semanal                                                      |
| 0373-C5            | PENDING_PUSH     | Push, CI verde e proteção do `main`                                                                                |

# AUD-0603 — reauditoria rodada 3; dois P2 de sessão — 06/10/2026

- Task `AUD0603-REMEDIATION-REAUDIT-20261006`, Codex, `COMPLETED_AUDIT / PARTIAL_TWO_P2`. [Parecer](04_audit/0603_reauditoria_aud0602_2026-10-06.md).

| Item                      | Estado          | Próxima ação                                                                                  |
| ------------------------- | --------------- | --------------------------------------------------------------------------------------------- |
| AUD0602-F01, janela final | VERIFIED_SCOPED | Corpo0, APPROVED, retomada1 e replay sem duplicação; original corrigido                       |
| AUD0602-F02, revoke falha | VERIFIED_SCOPED | Original503 sem cookie e retry confirmados; transição integral ainda parcial                  |
| AUD0603-F01 P2            | OPEN            | Substituição atômica: falha create após revoke deve preservar sessão/cookie; regressão7088342 |
| AUD0603-F02 P2            | OPEN            | Troca com predecessor deve aposentar família sucessora anterior; herdado4aa4d8f               |
| CI atual / condição5      | PENDING         | Novo SHA ainda não publicado; Verify/Security/E2E/certificação e proteção sem confirmação     |
| Scan semanal              | POLICY_PENDING  | Simulação105 genéricos,94 em evidências e11 fora; exclusão só da pasta não resolve tudo       |

- Suíte atual359/2.946, PostgreSQL37/299, zero skips; critical mínimo branches96,73%, mutation10/10 e type/lint/formato/docs/audit PASS. Kernel conservador/cancel+pause são observações, sem novos P2 aprovados. Sem código/lock, commit/push ou configuração remota. Produção NO_GO por findings, gates e ambiente real pendentes.

# PROD-0373 rodada 3 — AUD-0602, secret-scan e certificação corrigidos — 06/10/2026

- Task `PROD-0373-20261006` rodada 3: `DONE_LOCAL`. Supersede a disposição OPEN de AUD0602-F01/F02 e das falhas de `secret-scan` e `certify` do CI de `4aa4d8f`.

| Task                   | Estado       | Critério atendido                                                                                                                  |
| ---------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| AUD0602-F01            | FIXED_LOCAL  | Cancelamento e prazo durante a última leitura da pausa: corpo 0, aprovação APPROVED, retomada executa uma vez                      |
| AUD0602-F02            | FIXED_LOCAL  | Troca de papel com revogação falhando: 503 sem Set-Cookie, sessão antiga válida, nenhuma nova; retry troca limpo (PostgreSQL real) |
| CI-SECRET-SCAN-SHALLOW | FIXED_LOCAL  | `fetch-depth: 0`; intervalo do push sem achados                                                                                    |
| CI-CERTIFY-ANSI        | FIXED_LOCAL  | Resumo colorido do Vitest lido; `metrics.unit` preenchido                                                                          |
| 0373-C5                | PENDING_PUSH | Push, CI verde e proteção do `main`                                                                                                |

# AUD-0602 — remediações originais confirmadas; novo P1/P2 — 06/10/2026

- Task `AUD0602-REMEDIATION-PUBLISH-20261006`, Codex; auditoria DONE, entrega PARTIAL, núcleo NO_GO. [Parecer](04_audit/0602_reauditoria_aud0601_2026-10-06.md), [evidências](04_audit/evidence/AUD0602-REMEDIATION-20261006/summary.md). Casos originais F01–F07 da AUD0601 passam; contraexemplos novos não são apagados pelas suítes verdes. Publicação Git autorizada pelo pedido atual, sem release.

| Item             | Estado / aceite esperado                                                                                                                                                                                            |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AUD0601-F01–F07  | CLOSED_EXERCISED_ORIGINAL_SCOPE — pausa/resume PG real, família/logout, cookie logout503, healthy API/worker, progresso serializado, cadeia estrita/âncoras, perfil restore. Limites e modos degradados no parecer. |
| AUD0602-F01      | P1 / OPEN — PROD-0373/KERNEL-PLUGINS; revalidar cancelamento/prazo após await da última leitura de pausa, antes do corpo; corpo0 em ambas as variantes, liquidação/retry seguros.                                   |
| AUD0602-F02      | P2 / OPEN — PROD-0373/API; troca de operador/papel/tenant atômica,503 preserva cookie anterior e não emite novo cookie utilizável; timeout/ambos revokes falhos e duas réplicas. Herdado.                           |
| CI e proteção    | OPEN_REMOTE — branches críticos≥95% passam localmente; CI do histórico publicado, E2E/browser/certificação e checks reais ainda pendentes; proteção não alterada nesta auditoria.                                   |
| Implantação real | OPEN — ambiente, quatro roles/migrations/segredos, TLS/proxy, backup agendado, sondas e evidência operacional. Mesmo CI verde não elimina o P1/P2 atual.                                                            |

- Verificação principal81f01e8:358 arquivos/2.940 PASS com cobertura, PG37/298 PASS, sem skips; type/lint/formato/mutation10/10/audit0 PASS; smoke18/18, restore e backup0027 PASS. Follow-up8652319:119 testes e typecheck PASS. 25 gates do builder não reemitidos integralmente; E2E/browser/certify/SBOM/licenças locais NOT_RUN. Alerta desligado conforme decisão declarada do usuário.

- Publicação Git DONE: main confirmado d76691c no primeiro push; recibo/ledgers documentais seguem no fechamento. P1/P2 e CI/proteção/implantação continuam OPEN; nenhum release foi concedido.

# PROD-0373 rodada 2 — Verify publicado e AUD-0601 corrigidos — 06/10/2026

- Task `PROD-0373-20261006` rodada 2: `DONE_LOCAL`. Supersede a disposição OPEN de AUD0601-F01–F07 e da falha de cobertura crítica do Verify `37524247242`. [Resumo](04_audit/evidence/PROD-0373-20261006/summary.md#rodada-2--verify-publicado-e-aud-0601).

| Task                | Estado       | Critério atendido                                                                                                      |
| ------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------- |
| AUD0601-F01         | FIXED_LOCAL  | Pausa após reserva da aprovação, do journal ou do início: corpo não roda, aprovação APPROVED, retomada executa uma vez |
| AUD0601-F02         | FIXED_LOCAL  | Logout com o cookie anterior revoga o sucessor (PostgreSQL real)                                                       |
| AUD0601-F03         | FIXED_LOCAL  | Logout 503 preserva cookie; retry revoga                                                                               |
| AUD0601-F04         | FIXED_LOCAL  | API e worker `healthy` pela sonda da imagem no smoke                                                                   |
| AUD0601-F05         | FIXED_LOCAL  | Heartbeats lentos não duplicam nem perdem progresso                                                                    |
| AUD0601-F06         | FIXED_LOCAL  | Payload adulterado invalida; âncoras detectam cauda truncada                                                           |
| AUD0601-F07         | FIXED_LOCAL  | Prova de restore exige `NODE_ENV=test`                                                                                 |
| CI-COVERAGE-CHANNEL | FIXED_LOCAL  | `channel` 96,48%; 25 gates locais PASS                                                                                 |
| 0373-C5             | PENDING_PUSH | Push, CI verde e proteção do `main`                                                                                    |

# AUD-0601 — auditoria concluída; remediação e implantação abertas — 06/10/2026

- Task `AUD0601-PRODUCTION-DELIVERY-20261006`: auditoria DONE; entrega PARTIAL, produção NO_GO. [Parecer](04_audit/0601_auditoria_entrega_producao_2026-10-06.md), [evidências](04_audit/evidence/AUD0601-PRODUCTION-20261006/summary.md). Cenários antigos AUD0600 passam; esta entrada registra os achados atuais sem reescrever cartões anteriores.

| Item                               | Prioridade         | Estado / owner / aceite esperado                                                                                                                                     |
| ---------------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AUD0601-F01 pausa pós-reserva      | P1                 | OPEN — PROD-0373/KERNEL-PLUGINS; guarda na fronteira do efeito, liquidação segura das reservas, regressões das três janelas e PostgreSQL real.                       |
| AUD0601-F02 família de sessão      | P1                 | OPEN — PROD-0373/API; substituição atômica e logout por linhagem, A→B/logoutA invalidaB em PostgreSQL real.                                                          |
| AUD0601-F03 cookie em logout503    | P2                 | OPEN — PROD-0373/API; preservar cookie na indisponibilidade e limpar só após revogação confirmada.                                                                   |
| AUD0601-F04 healthcheck worker     | P2                 | OPEN — PROD-0373/OPS; sonda de worker ou override explícito e prova de healthy com heartbeat.                                                                        |
| AUD0601-F05 progresso no heartbeat | P2                 | OPEN — PROD-0373/WORKER; serializar/reservar delta com retry seguro, evento1 não pode somar3.                                                                        |
| AUD0601-F06 integridade payload    | P2                 | OPEN — PROD-0373/AUDIT; integridade do payload persistido/sanitizado ou sinal parcial e política verificável para divergências.                                      |
| AUD0601-F07 receita restore        | P3                 | OPEN — PROD-0373/OPS; explicitar NODE_ENV=test na sonda sintética ou compor webhook assinado, sem enfraquecer API.                                                   |
| 0373 condição5                     | Bloqueante         | OPEN — PROD-0373/CI; corrigir cobertura crítica channel sem baixar95%, repetir Verify/Security no mesmo SHA; proteção com contextos reais publicados.                |
| Implantação do núcleo              | Bloqueante         | OPEN — OPS/usuário; destino/manifesto, quatro roles/migrations/credenciais, TLS/proxy, backup agendado, sondas/restart, mesmo digest API/worker e prova operacional. |
| 0373 condição9                     | Decisão registrada | Alerta desligado por decisão declarada do usuário; não pedir ativação. Manter disposição/limites explícitos para eventual GO.                                        |

- Suítes canônicas locais 2.925/296 PASS não encerram achados adversariais. Security PASS/zero high não substitui Verify FAIL e evidência de implantação. Nenhum commit/push/deploy ou liberação de produto nesta auditoria.

# PROD-0373 — AUD-0600 corrigida e barra 0373 executada — 06/10/2026

- Task `PROD-0373-20261006`, Claude Code: `DONE_LOCAL`, condição 5 pendente de publicação. Supersede a disposição OPEN de AUD0600-F01/F02 e das condições 1, 3, 4, 6, 7, 8, 9 e 10 da [0373](03_build/0373_barra_producao_harness.md); registros anteriores ficam como histórico. [Resumo](04_audit/evidence/PROD-0373-20261006/summary.md).

| Task          | Estado       | Critério atendido                                                                                                                                   |
| ------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| AUD0600-F01   | FIXED_LOCAL  | Log inteiro fora depois da reserva: motivo presente, body0, aprovação FAILED                                                                        |
| AUD0600-F02   | FIXED_LOCAL  | Cancelamento, ferramenta ausente, ferramenta some antes do despacho e prazo: mesma etapa FAILED com código; `RUNNING` incerto vira `unknown_effect` |
| 0373-C1/C10   | DONE_LOCAL   | Zero `it.fails`; pausa durável no worker e no kernel com retomada                                                                                   |
| 0373-C3/C4/C7 | DONE_LOCAL   | Smoke 16/16 na imagem distroless em produção; login 200/401                                                                                         |
| 0373-C6/C8/C9 | DONE_LOCAL   | Gitleaks na imagem 0; restore com cadeia íntegra; alerta de parada assinado recebido                                                                |
| 0373-C5       | PENDING_PUSH | Push, CI verde no SHA, CodeQL sem high, proteção do `main`                                                                                          |

# AUD-0600 — disposição da reauditoria AUD0599-REMEDIATION — 06/10/2026

- Task `AUD0600-REMEDIATION-REAUDIT-20261006`: auditoria `DONE`; cenários originais de AUD0599-F01/F02 `CLOSED_ORIGINAL_SCOPE`, aderência integral §12 `PARTIAL_TWO_P2`. [Relatório](04_audit/0600_reauditoria_remediacao_aud0599_2026-10-06.md), [evidência](04_audit/evidence/AUD0600-REMEDIATION-20261006/summary.md). Produção `NO_GO`; nenhum commit/push nesta rodada. Entradas anteriores permanecem históricas.

| Task              | Prioridade/estado        | O quê e onde                                                        | Como e dependência                                                                                                | Critério de pronto                                                                                                        |
| ----------------- | ------------------------ | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| AUD0600-F01       | P2 / OPEN                | Motivo apagado no turn/end; kernel/kernel-runtime.ts                | Owner KERNEL-PLUGINS; compor falha final com decisão já acumulada, SPEC0181 §11.3/§12.1                           | tool/result e turn/end rejeitados: negação visível, INSUFFICIENT_EVIDENCE, body0 e liquidação única                       |
| AUD0600-F02       | P2 / OPEN                | Checkpoint terminal com WAITING/RUNNING; iterative-runtime/dispatch | Owner KERNEL-PLUGINS; alcançar terminais anteriores ao pipeline, com certeza de efeito e pausa preservadas, §12.3 | Retomada cancelada/ferramenta ausente; ausência no despacho/prazo: mesma etapa terminal e código coerente, sem duplicação |
| CI-ZOD-PREINSTALL | P1 / CLOSED_LOCAL_SCOPE  | Bootstrap sem dependências                                          | Init real antes do install e controle negativo da base                                                            | Local PASS; Verify remoto no candidato ainda pendente                                                                     |
| DEP-SOURCE-MAP-JS | P1 / CLOSED_LOCAL_SCOPE  | Lock 1.2.2 e audit completo                                         | Única entrada alterada, instalação própria congelada                                                              | Audit completo zero, versão instalada confirmada                                                                          |
| CODEQL-ACTIVE     | P1 / VERIFIED_LOCAL_ONLY | Seis alertas ativos tratados                                        | Regex/alias/helper confirmados por sondas próprias                                                                | Fechamento oficial pendente de scan remoto; #6/#7 e históricos continuam abertos                                          |

- Verificação independente: 352 arquivos/2.844 PASS ordinários + duas falhas esperadas; PG 288 PASS, zero skips; type/lint/formato/links/audit PASS. Sondas novas 26 PASS/7 FAIL em dois P2; 12 cenários anteriores PASS. Parte B, demais condições 0373 e decisões de publicação/proteção/CodeQL continuam pendentes.

# AUD0599-REMEDIATION — correções da AUD-0599 — 06/10/2026

- Task `AUD0599-REMEDIATION-20261006`, Claude Code: `DONE_LOCAL`, aguardando reauditoria. [Evidência](04_audit/evidence/AUD0599-REMEDIATION-20261006/summary.md). Supersede a disposição OPEN de AUD0599-F01/F02 e AUD0598-R04; os registros anteriores ficam como histórico.

| Task              | Prioridade/estado  | O quê e onde                                                              | Critério de pronto atendido                                                                |
| ----------------- | ------------------ | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| AUD0599-F01       | P2 / FIXED_LOCAL   | `kernel-runtime.ts`, `pipeline.ts` (`unrecordedBlock`)                    | Guarda nega após begin e log falha: motivo presente, body0, aprovação FAILED, 1 fechamento |
| AUD0599-F02       | P2 / FIXED_LOCAL   | `pipeline.ts` (`blocked`), `iterative-dispatch.ts`                        | WAITING e RUNNING com log rejeitado: mesma etapa FAILED, errorCode da negação, body0       |
| CI-ZOD-PREINSTALL | P1 / FIXED_LOCAL   | `scripts/ci-bar.mjs`, `scripts/lib/test-log-summaries.mjs`                | `ci-bar.mjs init` sem node_modules exit 0; teste do grafo de imports                       |
| DEP-SOURCE-MAP-JS | P1 / FIXED_LOCAL   | `package-lock.json`                                                       | `npm audit --audit-level=high` 0                                                           |
| CODEQL-ACTIVE     | P1 / FIXED_LOCAL   | #17 auditor de alias; #1/#2/#4/#9 URLs; #8 `state.ts`                     | Testes negativos e de tempo linear; fechamento no GitHub depende do próximo scan           |
| CODEQL-DECISION   | P2 / OPEN_DECISION | #6/#7 rate limit, 11 alertas em evidências históricas, proteção do `main` | Decisão do usuário                                                                         |

# AUD-0599 — disposição atual da entrega Fable — 06/10/2026

- Task `AUD0599-FABLE-DELIVERY-20261006`: auditoria `DONE`, publicação `DONE` em `28ffc26` e `origin/main`; aceite integral da parte A `REJECT_TWO_P2`, produção `NO_GO`. [Relatório](04_audit/0599_auditoria_entrega_fable_2026-10-06.md) e [evidência](04_audit/evidence/AUD0599-FABLE-20261006/proof.json). Esta entrada supersede a disposição OPEN anterior de R01–R03 no escopo medido; os registros anteriores permanecem históricos, sem reescrita.

| Task        | Prioridade/estado | O quê e onde                                                          | Como e dependência                                                                      | Critério de pronto                                                                      |
| ----------- | ----------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| AUD0598-R01 | P1 / CLOSED_SCOPE | Pausa após reserva com adaptador real                                 | Release opcional implementado; máquinas reais em memória e porta PostgreSQL verificadas | Retomada body1, aprovação EXECUTED, replay e reserva antiga recusados                   |
| AUD0598-R02 | P1 / CLOSED_SCOPE | Slot após aprovação pendente                                          | Checkpoint de despacho sem stopReason herdado; dois pontos de pausa                     | maxToolCalls1, COMPLETED, contador1/body1                                               |
| AUD0598-R03 | P2 / CLOSED_SCOPE | Encerrar chamada quando hook rejeita                                  | Sondas checkpoint/recordStep e log indisponível; nenhuma reserva/efeito                 | Exatamente uma tentativa tool/result not_started                                        |
| AUD0598-R04 | P2 / PARTIAL_OPEN | Motivo da negação após perder log                                     | Variante single-pass após reserva ainda falha; remediação em AUD0599-F01                | INSUFFICIENT_EVIDENCE com negação visível em todos os caminhos                          |
| AUD0599-F01 | P2 / OPEN         | Resposta single-pass após reserva; kernel-runtime.ts                  | Owner KERNEL-PLUGINS; preservar motivo junto ao erro de log, SPEC0181 §11.3             | Guarda nega após begin, log falha: motivo presente, body0 e uma tentativa de fechamento |
| AUD0599-F02 | P2 / OPEN         | Etapa WAITING/RUNNING após negação/log; pipeline e iterative-dispatch | Owner KERNEL-PLUGINS; preservar causa e fechar mesma etapa, SPEC0181 §11.4              | Identidade preservada, FAILED/errorCode, checkpoint INSUFFICIENT_EVIDENCE, body0        |

- Continuidade 0373: duas falhas esperadas do GovernedAgentRuntime continuam; extração 4950a27 já commitada, parte B ainda sem entrega. Login oficial sem composição de store; CI quebra por zod antes de install, audit completo source-map-js high, 19 CodeQL high (8 ativos/11 históricos), main sem proteção. Imagem sem shell, scan da imagem, restore com cadeia e alerta de parada não comprovados. Os dois relatórios antigos foram arquivados, não convertidos em entregas. Publicação não encerra esses itens nem concede release.

# SYNC-20261006 — pendências auditadas e commitadas — 06/10/2026

- Claude Code, pedido do usuário: "verifica o que tem mais de código não commitado, faz uma auditoria e sincroniza tudo". As 174 pendências do checkout compartilhado foram auditadas num worktree isolado idêntico: typecheck, lint, links/higiene, build do produto e Prettier PASS; suíte completa 2.810 PASS + 2 falhas esperadas (`GovernedAgentRuntime` I6/I7), com 1 arquivo (`test-suite-catalog`) sem rodar por timeout de worker na máquina sobrecarregada; `boundary:products` 0 violações e `INCOMPLETE` por diagnósticos já conhecidos do HISO-005. Varredura gitleaks local: 105 falsos positivos (hashes, marcadores sintéticos), nenhum segredo.
- Commits: `25881f3` extração do produto, `4950a27` extração do `agent-runtime` (Codex), `adb9679` correção AUD-0589, `347a622` documentação/evidência, mais este de ledgers. Ficaram de fora, por pedido da sessão Fable (`cvg-operational-harness-c6`), os arquivos da remediação AUD-0598 em andamento.
- `next_action`: rodar `test:postgres` e o `test-suite-catalog` quando a máquina sair da sobrecarga (load ~650, 53 contêineres de outros projetos) e só então dar push para `origin/main`.

# AUD0598 — reauditoria de 2356a25 — 06/10/2026

- Task `AUD0598-KPLG004-REAUDIT-20261006`: auditoria `DONE`; aceite integral da remediação `REJECT`. [AUD-0598](04_audit/0598_reauditoria_kplg004_2026-10-06.md). Casos originais F01–F06 passam, mas settlement retomável de F01/F03, observação de orçamento e promessas ampliadas de logging continuam incompletos. Esta entrada registra a disposição independente atual sem reescrever os cartões históricos/linhas de outros agentes.
- Verificação: 2733 PASS + 2 falhas esperadas do worker, zero skips; PostgreSQL 288 PASS; typecheck/lint PASS; oito sondas originais e 13 regressões PASS; cinco sondas adicionais: 1 PASS/4 FAIL. Revisão independente confirma dois P1 e dois P2. Owner de código continua KERNEL-PLUGINS; produção `NO_GO`, parte B e duas lacunas do worker abertas.

| Task        | Prioridade/estado | O quê e onde                                                              | Como e dependência                                                                                                               | Critério de pronto                                                                   |
| ----------- | ----------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| AUD0598-R01 | P1 / OPEN         | Aprovação FAILED após pausa sem efeito; controls e adaptador de aprovação | Reconciliar settlement not_started e retomada na máquina de estados real; owner KERNEL-PLUGINS, gate aplicável se contrato mudar | Pausa após reserva: body0; unpause/resume: autorização utilizável, body1, sem replay |
| AUD0598-R02 | P1 / OPEN         | Recontagem depois de aprovação pendente; iterative-runtime/dispatch       | Reconhecer contador de chamada em andamento com stopReason anterior; owner KERNEL-PLUGINS, SPEC 0181                             | APPREQ→approve→pausecheckpoint→resume com max1 termina COMPLETED, toolCalls1/body1   |
| AUD0598-R03 | P2 / OPEN         | Exceção de beforeDispatch não fecha tool/call; pipeline                   | Encerrar uma vez no erro de checkpoint/recordStep sem reservar/executar; owner KERNEL-PLUGINS, I5                                | Store rejeita: um call e uma tentativa not_started, body0                            |
| AUD0598-R04 | P2 / OPEN         | closeNotStarted ignora erro de appendLog; pipeline                        | Propagar erro normalizado conservando negação e ausência de efeito; owner KERNEL-PLUGINS, I5                                     | Log de chamada negada falha: INSUFFICIENT_EVIDENCE, uma tentativa final, body0       |

- `next_action`: corrigir R01–R04 e repetir sondas antigas/novas, conformidade e regressão no próximo candidato. Sem push nesta rodada.

# AUD-KPLG004 — auditoria de ee7b3f9 — 06/10/2026

- Task `AUD-KPLG004-20261006`: auditoria `DONE`; aceite integral do código `FAIL`, produção `NO_GO`. [AUD-0597](04_audit/0597_auditoria_kplg004_2026-10-06.md). Publicação Git autorizada pelo usuário; nenhum código de runtime alterado, nenhum fechamento por suíte verde.
- Evidência no SHA isolado: 2711 testes PASS + 2 falhas esperadas de conformidade, zero skips; PostgreSQL 288 PASS; typecheck/lint PASS; sondas novas 1 PASS/7 FAIL em oito casos, pai 2 PASS selecionados. Seis remediações abertas abaixo, coordenadas com KERNEL-PLUGINS; nenhum path de runtime transferido por esta auditoria.

| Task        | Prioridade/estado | O quê e onde                                                                     | Como e dependência                                                                             | Critério de pronto                                                         |
| ----------- | ----------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| AUD0597-F01 | P1 / FIXED_LOCAL  | Pausa nas janelas checkpoint/reserva; `kernel/pipeline.ts`, `kernel/controls.ts` | Revalidar guardas antes do corpo, liquidar reserva sem efeito; SPEC 0181, claim KERNEL-PLUGINS | Zero corpo/efeito após pausa nessas janelas nos três modos                 |
| AUD0597-F02 | P1 / FIXED_LOCAL  | Cancelamento cria reserva/efeito fantasma; `kernel/pipeline.ts`                  | Compartilhar correção F01, discriminar not-started; SPEC 0181 I8, claim KERNEL-PLUGINS         | Abort no checkpoint/reserva: zero body e zero effects.started pré-despacho |
| AUD0597-F03 | P1 / FIXED_LOCAL  | Pausa torna pendência terminal; `iterative-runtime.ts`                           | Preservar pendência retomável; SPEC 0181 I12, revisar T3 se mudar estado/contrato              | Approval/pergunta pendentes retomam após pausa, sem execução duplicada     |
| AUD0597-F04 | P1 / FIXED_LOCAL  | Falha em log de resultado admite COMPLETED; `kernel/pipeline.ts`                 | Propagar falha preservando fato do efeito; dívida herdada do kernel, claim KERNEL-PLUGINS      | Falha de registro final nunca vira sucesso/replay silencioso               |
| AUD0597-F05 | P1 / FIXED_LOCAL  | Requisição do modelo enviada difere do log; `kernel/pipeline.ts`                 | Snapshot efetivo após hook, sem signal; regressão pai/candidato, claim KERNEL-PLUGINS          | Igualdade de todos os campos enviados/logados após reescrita               |
| AUD0597-F06 | P2 / FIXED_LOCAL  | Guarda nega sem tool/result; `kernel/pipeline.ts`                                | Registrar not_started único sem reserva/ledger; regressão pai/candidato, claim KERNEL-PLUGINS  | Toda chamada negada por guarda encerra exatamente uma vez                  |

- Observação de recovery preexistente: último slot de ferramenta consumido antes do crash impede resume (`MAX_TOOL_CALLS`) nos dois candidatos; crítico confirmou em memória. Preparar reprodução arquivada antes de remediar, sem classificar como regressão nova. As duas lacunas conhecidas do worker e a parte B seguem abertas.
- Remediação KERNEL-PLUGINS (Claude Code, 06/10/2026): F01–F06 e a observação de recontagem corrigidos localmente, sem mudar contrato ou estado durável (F03 usa o `preserveCheckpoint` existente). As 8 sondas originais desta auditoria passam (antes 1/7); 13 regressões novas em `packages/harness/src/__tests__/aud0597-kplg004-regressions.test.ts`; suíte 2.732 PASS, PostgreSQL 288 PASS, typecheck/lint PASS ([evidência](04_audit/evidence/KERNEL-PLUGINS-20261006/baseline-and-conformance.md)). Estado `FIXED_LOCAL` aguarda reauditoria independente; não é aceite de KPLG-004.
- `next_action`: reauditoria independente da remediação; release permanece separado da publicação Git autorizada.

# KERNEL-PLUGINS — auditoria do motor e direção de kernel de plugins — 06/10/2026

- Task `KERNEL-PLUGINS-20261006` (Claude Code); `status: IN_PROGRESS`. Usuário definiu: o produto é o Operational Harness; o Assistente de Plantão existe para validá-lo; o motor serve agentes hospitalares semiautônomos (tudo menos diagnóstico e prescrição); linha de referência DeepSeek Harness (cópia local `~/deepseek-harness`). Medido: motor 31/520 PASS, assistente 2/37 PASS, typecheck PASS, `npm audit` 0. Correções ENG-001–018 já commitadas em `73669b8`. Produção `NO_GO`.
- `last_completed_action`: KPLG-004 parte A `DONE`: iterativo sobre o pipeline compartilhado do kernel (`packages/harness/src/kernel/pipeline.ts`); aprovação reservada só na hora do despacho, depois do checkpoint. Suíte 2.709 PASS (1 falha de arquitetura por nome de variável, corrigida e reexecutada), PostgreSQL 288 PASS, typecheck/lint PASS; conformidade com 2 lacunas restantes, ambas no `GovernedAgentRuntime` ([evidência](04_audit/evidence/KERNEL-PLUGINS-20261006/baseline-and-conformance.md)). `next_action`: KPLG-004 parte B quando o Codex commitar a extração de `packages/agent-runtime`; enquanto isso, KPLG-005 (modelo e canais como plugins) não depende dela.

# HARNESS-ISO-GREEN — checkpoint 62 — 05/10/2026

- Task `HARNESS_ISO_GREEN_20261004`; `status: IN_PROGRESS`. R56 certificação terminou FAIL_ENOSPC: 5792/414 unit PASS zero skip; coverage/PG/E2E sem certificação válida. R58 e R61 REJECT por integridade de backup retido e restart pós-truncamento; R63 corrigido isoladamente, R65 payload aguardando freeze. R64 REJECT reproduziu falso PASS module-sync; R70 recusa contexto não comprovado e passou 89/2 focados zero skip, types/lint/sintaxe/formato; crítico R72 novo ativo. R66 cópia8354 exata+overlayR63+deps17394/48 preparada sem promoção. R50 gates locais/neutral finite aceitos parcialmente, N2 histórico INCOMPLETE; sem herdar inventário global. Liberadas apenas dependências próprias inativas R69/R71 com source/lock MATCH. GLOBAL FAIL, produção NO_GO, só HISO001 DONE; NO_MODEL e nenhum provider/push/dado real.
- `last_completed_action`: R70 89 testes focados PASS, R72 crítico novo ativo; R64 REJECT preservado e recursos próprios liberados. `next_action`: concluir R65 freeze/R72 e integrar R66; certificar novamente com PostgreSQL/E2E e críticos novos; promoção/T4 separados.
- [Evidência do checkpoint](04_audit/evidence/HARNESS-ISO-EXEC-20261003/green-20261004/checkpoint-62-module-sync-and-storage-continuation.json).

# Assistente de Plantão — disponibilidade para teste local — 01/10/2026

- AP-LOCAL-20261001: `DONE` — sandbox da entrega existente rodando com console de teste em http://127.0.0.1:3401; dez verificações de navegador PASS. Recursos continuam reservados enquanto o processo estiver rodando. [Handoff e evidências](08_runtime/handoffs/ap_local_20261001.md).
- Próximo: teste interativo pelo Ricardo. Piloto AP-015/AP-016 e conexão a provedores reais não foram concluídos por esta sessão simulada; seguem a missão ADR-009 e barra 0368. Os programas genéricos abaixo são histórico anterior à mudança de missão.

# PR301-WEBHOOK-CLOCK-GUARD — I11 aceita; aguarda T3 humano — 28/09/2026

- A [I11](04_audit/evidence/PR301-WEBHOOK-CLOCK-SPEC-20260928/I11-review.md) verificou o hash final `c33410876ef204faa655e41c663630bed127a9d9df274c50fd9427f86a07e53e` e retornou `ACCEPT`, sem P0/P1/P2. O usuário exigiu nova crítica antes de BUILD, gate satisfeito. T3 humana da SPEC 0162 ainda pendente; migration 0028 e BUILD não autorizados, produção `NO_GO`.

# PR301-WEBHOOK-CLOCK-GUARD — resposta documental I10 — 28/09/2026

- I10 verificou o candidato `9a262565656c935aa8217a094bbdef7a05ba1a74ecf289ff90d1ae681a938ed9` e retornou `REVISE` (5 P1/2 P2). A [resposta](04_audit/evidence/PR301-WEBHOOK-CLOCK-SPEC-20260928/I10-response.md) atualizou a SPEC 0162 para SHA-256 `c33410876ef204faa655e41c663630bed127a9d9df274c50fd9427f86a07e53e`, com ACL única, timestamp/assinatura precisos, reconciliação idempotente, associação chrony/PG limitada, rotação HMAC e leases curtos por instância/boot. Prettier direcionado, links/higiene e diff PASS; formato global só aponta o arquivo AUD-0590 não reivindicado. Crítica I11 exigida pelo usuário antes de BUILD; T3 não solicitada, migration 0028 não autorizada, produção `NO_GO`. [I10](04_audit/evidence/PR301-WEBHOOK-CLOCK-SPEC-20260928/I10-review.md), [prova](04_audit/evidence/PR301-WEBHOOK-CLOCK-SPEC-20260928/proof.json).

# PR301-WEBHOOK-CLOCK-GUARD — resposta documental I9 — 28/09/2026

- I9 fresh-context verificou o SHA 433c46bb7fe0c66c1b2926ed8592cca023209b3374439af8de5d603b04fae40a e retornou REVISE (3 P1, sem P0): conflito statement_timestamp/sample, bootstrap baseline em retry/crash e readiness antes de RECOVERY_REBASE. A [resposta](04_audit/evidence/PR301-WEBHOOK-CLOCK-SPEC-20260928/I9-response.md) produziu o candidato 9a262565656c935aa8217a094bbdef7a05ba1a74ecf289ff90d1ae681a938ed9, com attestation one-use do receipt exato, baseline/revisões consistentes e sequência RECOVERY_REBASE/readback/GATE_OPEN. Nenhum código, SQL, migration 0028, teste comportamental ou BUILD. I10 fresh-context read-only está em andamento; aprovação humana T3 segue pendente e produção NO_GO. [I9](04_audit/evidence/PR301-WEBHOOK-CLOCK-SPEC-20260928/I9-review.md), [SPEC](02_spec/0162_webhook_clock_highwater_marker.md), [prova](04_audit/evidence/PR301-WEBHOOK-CLOCK-SPEC-20260928/proof.json).

# PR301-WEBHOOK-CLOCK-GUARD — resposta documental ao I8 — 28/09/2026

- I8 fresh-context verificou `08892d7328ce6a7ce45943f5316f3e9de270fe21b11aeb18a55934469e520646` e retornou `REVISE` sem P0 (2 P1/1 P2). A [resposta](04_audit/evidence/PR301-WEBHOOK-CLOCK-SPEC-20260928/I8-response.md) revisou a SPEC para SHA-256 `433c46bb7fe0c66c1b2926ed8592cca023209b3374439af8de5d603b04fae40a`; I9 independente read-only está em andamento antes de pedir aprovação humana T3. Estado `I8_REVISE_RESPONDED / I9_REQUIRED / BUILD_NOT_AUTHORIZED / PRODUCTION_NO_GO`. [Parecer](04_audit/evidence/PR301-WEBHOOK-CLOCK-SPEC-20260928/I8-review.md), [prova](04_audit/evidence/PR301-WEBHOOK-CLOCK-SPEC-20260928/proof.json). Nenhuma migration 0028, mudança de código ou produção.

# AUD-0589 — sessão nas rotas públicas do root — 28/09/2026

- `CONDITIONAL_PASS_LOCAL / I1_NOT_RETURNED / PRODUCTION_NO_GO`: auditoria dinâmica no root `eff8e0d` cobriu 61 templates/108 pares, com 98 protegidos em 401 nos três cenários negativos. Corrigido o cookie desconhecido transformar `/health`, `/health/metrics`, `/live` e `/ready` em 401; novo teste GET/HEAD preserva os status públicos e não consulta o store. 27/27 focados e suíte root 2.241 PASS; 162 testes PG skipped. Typecheck, lint, formato, links/higiene PASS. Duas tentativas independentes sem veredito; integração OIDC/PG/staging e produção seguem `NO_GO`. [Relatório](04_audit/0589_root_session_route_boundary_2026-09-28.md), [evidência](04_audit/evidence/AUD0589-ROOT-SESSION-ROUTES-20260928/proof.json).
- Suplemento Node 22/PostgreSQL: 326 arquivos/2.401 testes PASS sem skips no worktree `eff8e0d` + patch AUD-0589; `test:postgres` 35/258, sessão PG 18/18, Phase4A 1/1, foco 27/27, typecheck/lint PASS. Container, porta e worktree removidos. A composição `buildServerFromEnv` + PG no root aguarda PR-L04; revisão independente e produção continuam `NO_GO`. [Verificação](04_audit/evidence/AUD0589-ROOT-SESSION-ROUTES-20260928/pg-20260928/verification.md).

# AUD-0588 — cobertura HTTP por rota de execução — 28/09/2026

- `STATIC_SOURCE_REFERENCE_MATCHES_63_OF_63 / NEW_ROUTE_TESTS_2_OF_2 / I1_REVISE_RESPONDED / I2_ACCEPT_SCOPE / PRODUCTION_NO_GO`: [auditoria](04_audit/0588_execution_route_coverage_2026-09-28.md) e scanner hash-bound mapeiam referências textuais de 63 handlers explícitos com 586 trechos `app.inject`; I1 delimitou esse resultado a referências estáticas. I2 aceitou o escopo e pediu igualdade estrita da etapa da trajetória, adicionada e aprovada no reteste focado. Suíte root 306/2.233 PASS, com 20/162 skipped sem PostgreSQL; typecheck, ESLint, Prettier, `format:check` e links/hygiene PASS. Produção `NO_GO`.

# PR-301-WEBHOOK — fechamento de BUILD sintético e SPEC 0162 — 28/09/2026

- Correções da inbox/preflight estão no commit local isolado `aad04d9ace6ed5b6d9c9902f4ddcad67b87a4abc`: suíte completa com PostgreSQL 341/2.594 e `test:postgres` 36/273, sem skips; typecheck, lint e build web sintético PASS. A crítica I2 permanece `REVISE` com três P1; integração root aguarda PR-L04. Container descartável foi removido. [Verificação](04_audit/evidence/PR301-WEBHOOK-REPLAY-FIX-20260928/verification.md), [I2](04_audit/evidence/PR301-WEBHOOK-REPLAY-FIX-20260928/I2-independent-review.md).
- B3/`UNKNOWN_COMMIT`: a rota e o reconciliador precisam compartilhar o mesmo finalizador/commit atômico; não foi criado worker paralelo. Implementação conectada aguarda liberação de `apps/api/src/server.ts` por PR-L04 e task/claim T3 próprio. [Decisão e prova exigida](04_audit/evidence/PR301-WEBHOOK-REPLAY-FIX-20260928/recovery-boundary-decision.md).
- `SPEC_DRAFT / I6_REVISE_RESPONDED / I7_UNAVAILABLE / BUILD_NOT_AUTHORIZED / NO_GO`: [SPEC 0162](02_spec/0162_webhook_clock_highwater_marker.md) deriva A2 de 0160 sem ampliar migration 0027. I1 encontrou 4 P1/1 P2, I2 3 P1/2 P2, I3 5 P1/1 P2, I4 2 P1/2 P2, I5 2 P1/3 P2 e I6 4 P1/2 P2; a resposta documental está no hash `ee949d17daa04241131bae402bd49f5c28e61f4dcda38a5e81b772d2d497bc8e`. Duas tentativas I7 não retornaram parecer; formato e links/higiene passaram, mas não há aceite. Revisão humana T3 não solicitada; migration 0028 não autorizada. Pareceres [I1](04_audit/evidence/PR301-WEBHOOK-CLOCK-SPEC-20260928/I1-review.md), [I2](04_audit/evidence/PR301-WEBHOOK-CLOCK-SPEC-20260928/I2-review.md), [I3](04_audit/evidence/PR301-WEBHOOK-CLOCK-SPEC-20260928/I3-review.md), [I4](04_audit/evidence/PR301-WEBHOOK-CLOCK-SPEC-20260928/I4-review.md), [I5](04_audit/evidence/PR301-WEBHOOK-CLOCK-SPEC-20260928/I5-review.md), [I6](04_audit/evidence/PR301-WEBHOOK-CLOCK-SPEC-20260928/I6-review.md), [resposta I6](04_audit/evidence/PR301-WEBHOOK-CLOCK-SPEC-20260928/I6-response.md), [tentativa I7](04_audit/evidence/PR301-WEBHOOK-CLOCK-SPEC-20260928/I7-review.md), [prova](04_audit/evidence/PR301-WEBHOOK-CLOCK-SPEC-20260928/proof.json).

# PR-301-WEBHOOK-REPLAY — BUILD sintético SPEC 0160 — 28/09/2026

- `SYNTHETIC_BUILD_GATES_PASS_WITH_OPEN_P1_SPEC_GAPS / NO_GO`: commit isolado `737e9c17b5246ab623ff9e7bdcf33a16f9ba0844` implementa replay com timestamp, inbox cifrado tenant-scoped, lease fencing e commit atômico. 341 arquivos/2.592 testes sem skips, PostgreSQL 16, E2E 12/12, cobertura crítica RLS 96,09% PASS. Faltam o high-water marker durável e reconciliador interno requeridos por 0160; retenção D-06, provider real, crítica independente e integração root/CI/staging pendentes. [Prova](04_audit/evidence/PR301-WEBHOOK-REPLAY-BUILD-20260928/proof.json).

# PR-301-WEBHOOK-REPLAY-SCHEMA — BUILD sintético SPEC 0161 — 28/09/2026

- `BUILD_LOCAL_VERIFIED / ACCEPTANCE_INCOMPLETE / NO_GO`: migration 0027, inventário, RLS/FORCE, trigger de transições e preflight semântico passaram em PostgreSQL 16 descartável. Payloads são AES-256-GCM; a suíte completa teve 341 arquivos/2.592 testes sem skips. Pending não é apagado e DELETE permanece bloqueado até política D-06. High-water/reconciliador não pertencem ao delta aprovado 0161 e precisam de gate T3 separado. [Prova](04_audit/evidence/PR301-WEBHOOK-REPLAY-BUILD-20260928/report.md).

# AUD-0587 — replay do webhook — 28/09/2026

- `TWO_P1_REPLAY_REPRODUCED / NO_GO`: [AUD-0587](04_audit/0587_isolated_webhook_boundary_2026-09-28.md) obteve 16/16 testes HMAC/replay e sete casos HTTP, mas [negativo de timestamp](04_audit/evidence/AUD0587-WEBHOOK-20260928/future-replay.json) aceitou assinatura futura duas vezes e [takeover PG](04_audit/evidence/AUD0587-WEBHOOK-20260928/lease-takeover.json) deixou segunda entrega entrar enquanto a primeira processava (200/500). Sem efeito externo duplicado provado. [Pacote](04_audit/evidence/AUD0587-WEBHOOK-20260928/proof.json), task PR-301-WEBHOOK-REPLAY no [0356](03_build/0356_production_backlog_2026-09-26.md). SPEC T3, root/CI/staging e 0354 pendentes; produção `NO_GO`.

# PR-011-CODEQL — SPEC de remediação T3 — 28/09/2026

- `SPEC_0159_I2_ACCEPT / HUMAN_T3_PENDING / NO_GO`: [contrato](02_spec/0159_codeql_active_source_remediation.md) delimita alias, regex, prova de rate limit e histórico sob PR-011-CODEQL; [I2](04_audit/evidence/PR011-CODEQL-SPEC-20260928/I1-I2-review.md) aceitou o contrato após 2 P1/3 P2 corrigidos; nenhum BUILD autorizado até revisão humana explícita. Integração PR-L04, CodeQL/CI no SHA final, IAM/staging e 0354 pendentes.

# AUD-0586 — alertas CodeQL abertos — 28/09/2026

- `15_HIGH_TRIAGED / ACTIVE_REMEDIATION_PENDING / NO_GO`: [AUD-0586](04_audit/0586_codeql_alert_triage_2026-09-28.md) classifica sete cópias históricas e oito paths ativos. [Negativos](04_audit/evidence/AUD0586-CODEQL-20260928/alias-audit-probe.json) mostram config TypeScript inválida aceita pelo auditor; regex tem custo sintético crescente e publish/rollback recebem limite global, com cobertura autenticada/PG ainda pendente. PR-011-CODEQL no [0356](03_build/0356_production_backlog_2026-09-26.md) requer SPEC T3, disposição formal dos alertas e CodeQL no SHA integrado; produção `NO_GO`.

# AUD-0585 — barra remota de CI/segurança — 28/09/2026

- `REMOTE_CI_NOT_BOUND_TO_CANDIDATE / SECURITY_CHECK_FAILED / NO_GO`: [prova](04_audit/evidence/AUD0585-REMOTE-CI-20260928/proof.json) confirmou root local e candidato certificado ausentes do remoto, PR draft antigo com CodeQL high falho, `main` com `secret-scan` falho, branch protection 404 e rulesets vazios. [Auditoria](04_audit/0585_remote_ci_release_bar_2026-09-28.md); PR-009-PROV e PR-011-CODEQL no [backlog 0356](03_build/0356_production_backlog_2026-09-26.md). Triar alertas, corrigir sob SPEC T3, exigir checks externos/atestação no SHA final e completar 0354 antes de GO.

# AUD-0584 — RBAC admin por operação — 28/09/2026

- `LOCAL_RBAC_POLICY_MATCH / I2_ACCEPT / NO_GO`: [sonda](04_audit/evidence/AUD0584-ADMIN-RBAC-20260928/summary.json) no SHA isolado `7ef74e7`: 48 pares `/v1/admin` com sessão `Operator` pré-criada, 45×403 e 3×400 em capability approvals permitidos pela matriz. Ciclo sintético executou ferramenta uma vez (200) e recusou replay (400); tenant e role falsificada não elevaram acesso. [Relatório](04_audit/0584_isolated_admin_rbac_2026-09-28.md) e [I2](04_audit/evidence/AUD0584-ADMIN-RBAC-20260928/I2-review.md). PR-207 deve declarar permissão por operação; root/IdP/PG/CI/IAM/staging e condições 0354 pendentes.

# AUD-0583 — negativas de rotas sem sessão — 28/09/2026

- `LOCAL_ROUTE_NO_SESSION_PASS / I2_ACCEPT_SCOPE / NO_GO`: [AUD-0583](04_audit/0583_isolated_route_authentication_2026-09-28.md) sondou 111 pares rota/método no SHA isolado `7ef74e7`, com 98 pares protegidos 401 nos três cenários, três controles positivos 200 e zero revogações sem cookie. [Pacote](04_audit/evidence/AUD0583-ROUTES-20260928/summary.json) e [crítica I2](04_audit/evidence/AUD0583-ROUTES-20260928/I2-review.md). Repetir no SHA root/PR-L04 e staging corporativo do mesmo digest; CI/IAM e condições 0354 pendentes.

# AUD20-008 — fencing I1 aceito no novo candidato — 28/09/2026

- `I1_APPROVED_NEW_CANDIDATE / SENTINEL_MATCH / A21-F20_REGISTRY_OPEN / NO_GO`: [packet e parecer](04_audit/evidence/AUD20-008-I1-20260928/I1-review.md) de `7ef74e7` aprovam memory/PG fencing, com 1.503 arquivos e 38 artefatos vinculados; [sentinel](04_audit/evidence/AUD20-008-I1-20260928/sentinel-review.md) confere. P2 de definição de constraints no preflight exige SPEC/gate de segurança; reemitir adjudicação/certificado do SHA root após PR-L04. O histórico `579d2100` continua rejeitado; produção `NO_GO`.

# PR-003 — desvio do HEAD aceito pelo verificador — 28/09/2026

- `P1_REPRODUCED / SPEC_0157_REVIEW_PENDING / NO_GO`: [negativo](04_audit/evidence/PR003-HEAD-DRIFT-20260928/reproduction.json) aceito em I1 mostrou `certification:verify` exit 0 após commit vazio com HEAD diferente dos três commits registrados e candidato igual. Aprovar SPEC 0157 T3, corrigir/validar em branch isolado e recertificar o SHA final após PR-L04; CI/atestação, IAM/staging e 13 condições 0354 seguem abertos.

# PR-301 — login local completo validado; corporativo aberto — 28/09/2026

- `LOCAL_KEYCLOAK_ENTRYPOINT_I2_ACCEPT / CORPORATE_STAGING_PENDING / NO_GO`: [prova](04_audit/evidence/PR301-LOCAL-ENTRYPOINT-20260928/proof.json) do SHA isolado `7ef74e7` percorreu Keycloak OTP, Chromium, API e PostgreSQL; I2 aceitou negativos pré-MFA/replay/logout e limpeza, 10/10 hashes. O harness não pertence ao commit e usa console sintético. Ainda faltam root integrado, IdP/IAM corporativo, staging HTTPS no mesmo digest, CI/atestação, SPEC 0157 aprovada e condições 0354.

# PR-003 / AUD20-008 — gates de proveniência em aberto — 28/09/2026

- `SPEC_0157_REVIEW_READY / BUILD_T3_WAITING_HUMAN`: [contrato](02_spec/0157_certificate_live_head_binding.md) de vínculo Git HEAD ↔ certificado aceito em crítica técnica, aguardando revisão humana explícita e testes. Certificado local `7ef74e7` continua apenas daquele SHA.
- `AUD20-008_I1_REJECTED_EVIDENCE / A21-F20_OPEN_INTERNAL`: [parecer](04_audit/evidence/AUD-20260920/AUD20-008/I1-20260928.md) encontrou 33 hashes históricos divergentes e sentinel ausente; reemitir pacote no mesmo candidato/run ou recuperar arquivos íntegros antes de I1. Root/CI/IAM/staging e 13 condições 0354 permanecem abertos; produção `NO_GO`.

# PR-003 — certificado local passou; produção ainda aberta — 28/09/2026

- `ISOLATED_16_GATES_PASS / AAA_CONTROLLED_CONDITIONAL_GO / PRODUCTION_NO_GO`: [prova](04_audit/evidence/PR003-COMPOSITE-20260928/proof.json) do SHA `7ef74e7` inclui 2.582 unit, PG 261, E2E 12, zero skips, RLS 96,95%, 38/38 hashes e verificador PASS. Integração root após PR-L04, certificado do SHA definitivo, CI/atestação, staging/IAM, provider/canal, revisão I1, proveniência do commit e condições 0354 seguem abertos.

# PR-301 — composição sintética passou; certificado atual pendente — 28/09/2026

- `ISOLATED_COMPOSITION_TESTS_PASS / CURRENT_SHA_CERTIFICATION_PENDING / NO_GO`: [prova](04_audit/evidence/PR301-COMPOSITE-20260928/proof.json) de `ae0344f`: merge OIDC/RLS sem conflitos, 340/2.582, PG 35/261, E2E 12/12, guard de catálogo PASS e RLS 191/197 branches no pai de mesmo código. Relatórios versionados de skips são antigos e ainda não certificam este SHA. Após PR-L04, integrar root, gerar relatórios atuais, CI/atestação e staging/IAM; completar 0354 antes de GO.

# PR-301 — RLS crítico passou localmente; integração pendente — 28/09/2026

- `CRITICAL_COVERAGE_LOCAL_PASS / ROOT_INTEGRATION_PENDING / NO_GO`: [prova](04_audit/evidence/PR301-RLS-20260928/proof.json) do commit isolado `42e69f4` mostra RLS 191/197 branches (96,95% ≥ 95%), 340/2.581 testes, PostgreSQL 35/261 e E2E 12/12 sem skips. Integrar após PR-L04, reconciliar `SKIP-PG-004/006` e certificar o SHA composto; fechar positivo de staging/IAM/CI e condições 0354 antes de GO.

# PR-301/302 — follow-up T3 isolado — 28/09/2026

- `LOCAL_FUNCTIONAL_PASS / CRITICAL_COVERAGE_FAIL / SYNTHETIC_BROWSER_TRANSPORT_PASS / ROOT_INTEGRATION_PENDING / NO_GO`: [correção](04_audit/evidence/PR301-CORP-I1-20260928/proof.json) `ed012a4` passou 2.578 testes, PG 258, E2E 12 e cobertura global, mas o grupo RLS ficou em 83,76% de branches contra piso 95%; [prova HTTPS](04_audit/evidence/PR302-HTTPS-BROWSER-20260928/proof.json) passou no bundle/NGINX reais com API/IdP sintéticos. Integrar após PR-L04, elevar cobertura RLS com negativos significativos, corrigir o catálogo de skips, provar o entrypoint corporativo com MFA/PG no mesmo digest em staging HTTPS público controlado, receber IAM e fechar rollback, CI/atestação/certificação e condições 0354 antes de GO.

# PR-301/302/204 — BUILD T3 sintético isolado — 28/09/2026

- `ISOLATED_SYNTHETIC_BUILD_PASS / ROOT_INTEGRATION_PENDING / STAGING_POSITIVE_NOT_RUN / NO_GO`: [prova](04_audit/evidence/PR301-CORP-T3-20260928/proof.json) do commit `7019422` registra 2.410 testes unitários PASS, PG 258/258 e OIDC/sessão PG 20/20, além do build web selado. Integrar após PR-L04 e comprovar entrypoint produtivo, MFA e recarga no mesmo digest em staging HTTPS público controlado; obter IAM, CI/atestação/certificado e demais gates 0354 antes de GO.

# PR-204 — B2 preparado, release ainda aberto — 28/09/2026

- `B2_PREPARATION_LOCAL_PASS / B2_RELEASE_NOT_PROVEN / NO_GO`: [prova](04_audit/evidence/PR204-B2-PREP-20260928/proof.json) de `643f6ad`: 333/2.478, PG 35/258, Chromium 12/12, cobertura e imagem API B1. Fase B2 por env falha antes do listener. Crítica rejeitou fechamento B2 enquanto o binário permanece pinado em B1; faltam dreno A, cofre, B1 certificado, imagem B2 e rollback em staging.

# PR-301/204 — autoridade corporativa em SPEC T3 — 28/09/2026

- `SPEC_REVIEW_READY / HUMAN_T3_REVIEW_PENDING / NO_GO`: [AUD-0582](04_audit/0582_corporate_oidc_boot_gap_2026-09-27.md) e [SPEC 0152](02_spec/0152_corporate_oidc_authority_contract.md) delimitam boot OIDC corporativo e prova no mesmo candidato. I1–I3 P1 corrigidos, I4 aceitou revisão documental. BUILD depende de aprovação explícita; IAM, SPEC 0150, staging e certificado final seguem abertos.

# PR-204 — BUILD T3 isolado validado — 27/09/2026

- `ISOLATED_BUILD_LOCAL_PASS / ROOT_INTEGRATION_PENDING / NO_GO`: [prova](04_audit/evidence/PR204-BUILD-20260927/proof.json) do branch `99692e3` registra suíte 333/2.477, PG 35/258 e Chromium 12/12 sem skips, além da imagem web selada com 10 arquivos. Fechamento de boot, gateway e worker feito sob SPEC 0151; cobertura 333/2.477 PASS com 92,28% statements e 87,45% branches. Integrar após PR-L04, executar B2, completar IdP corporativo/SPEC 0150 e certificar o SHA integrado com CI/atestação antes de GO.

# PR-203 — extração PostgreSQL inbound local concluída — 27/09/2026

- `ROOT_LOCAL_PASS / COMPOSITE_CERTIFICATION_PENDING / NO_GO`: branch `codex/pr203-postgres-extraction-20260927` (`9e949d7`) integrado ao root em `7b3871d`, com três hashes iguais, deixa `postgres.ts`/`postgres-inbound.ts` em 1.455/813 linhas. [Prova](04_audit/evidence/PR203-20260927/proof.json): AST 9/9, assinatura 7/7, crítico `ACCEPT`, suíte final 325/2.392, PG 35/258, E2E 12/12, zero skips; tipo/lint/negativo focado PASS no root. Próximo gate: compor OIDC/PR-L04 e certificar o SHA final com CI remoto; sem promoção de produção.

# PR-204 — configuração de produção T3 pronta para revisão — 27/09/2026

- `SPEC_REVIEW_READY / HUMAN_T3_REVIEW_PENDING / NO_GO`: [AUD-0581](04_audit/0581_production_boot_configuration_gap_2026-09-27.md) e [SPEC 0151](02_spec/0151_production_boot_configuration_contract.md) delimitam parser, API, worker, web e gateway. I1 rejeitou quatro P1; I2 aceitou a revisão documental. Implementar só após revisão T3, com negativos do entrypoint e certificado do SHA integrado; PR-L04 e decisões de produto continuam abertas.

# PR-301 — merge OIDC isolado validado — 27/09/2026

- `LOCAL_INTEGRATION_PASS / ROOT_INTEGRATION_PENDING / NO_GO`: [prova](04_audit/evidence/PR301-ROOT-INTEGRATION-20260927/proof.json) do branch `codex/pr301-root-integration-preview` (`0b4a95b`) combina root com OIDC sem conflitos, com 331/2.437 testes, PG 35/258 e skips zero. E2E Keycloak MFA/Chromium, tipo/lint/links/higiene PASS. PR-L04 ainda detém API/web no checkout principal; certificado/CI do SHA final, IdP corporativo, SPEC 0149/0150 e decisões de dados seguem P0. Produção `NO_GO`.

# PR-009-PROV — autenticação da CLI no job independente — 27/09/2026

- `LOCAL_VALIDATION_PASS / REMOTE_PROVENANCE_PENDING / NO_GO`: commit `cae1c2a` fornece `GH_TOKEN` ao `gh attestation verify` e [prova](04_audit/evidence/PR009-GH-TOKEN-20260927/proof.json) inclui negativo, 16 testes focados, suíte Node 22 305/2.229, PostgreSQL 35/258, Chromium 12/12, tipo/lint/actionlint. Ainda exigir execução remota no SHA integrado, atestação/digest OCI, check obrigatório e certificação.

# PR-009-PROV — CI remoto histórico não sela o candidato atual — 27/09/2026

- `HISTORICAL_REMOTE_VERIFY_PASS / CURRENT_PROVENANCE_UNPROVEN / NO_GO`: [prova remota](04_audit/evidence/PR009-REMOTE-AUDIT-20260927/proof.json) confirmou Verify/Security verdes em `8ee6fa2` e 37/37 gates no manifesto antigo, mas sem jobs/bundle de atestação, SHA divergente do checkout e `main` sem proteção/rulesets. Exigir CI da SPEC 0147 no SHA integrado, verificação independente da atestação e digest OCI, retenção/exportação e check obrigatório antes de promoção.

# PR-301 — prova sintética de topologia HTTPS — 27/09/2026

- `SYNTHETIC_BROWSER_SEMANTICS_PASS / NO_GO`: [prova Chromium](04_audit/evidence/PR301-CROSS-ORIGIN-PROBE-20260927/proof.json) em quatro hosts HTTPS sintéticos confirma isolamento de cookies da API em relação ao console e host irmão, envio do `Strict` por CORS com credenciais e retorno do `Lax` sem `Strict` por navegação iniciada no documento do IdP. É prova do navegador, não do produto. SPEC 0150 T3, BUILD, E2E integrado, issuer corporativo e certificação do SHA integrado continuam P0.

# PR-301/302 — cross-origin HTTPS do console — 27/09/2026

- `SPEC_REVIEW_READY / HUMAN_T3_REVIEW_PENDING / NO_GO`: [AUD-0580](04_audit/0580_cross_origin_oidc_gap_2026-09-27.md) provou falta de ACAC no GET/OPTIONS do hook em Node 22; web e NGINX usam `/v1` relativo/proxy. [SPEC 0150](02_spec/0150_cross_origin_operator_console.md) recebeu I27/I28 `ACCEPT_SPEC_REVIEW_READY` após corrigir cookie de domínio irmão, cache entre tenants, rollback e CSP. Aprovação T3, BUILD, hosts HTTPS/Chromium, integração e certificação permanecem P0. O E2E local anterior não cobre essa topologia.

# PR-301/402 — rollout de purge e topologia de cookie — 27/09/2026

- `SPEC_REVIEW_READY / DPO_POLICY_PENDING / NO_GO`: [SPEC 0149](02_spec/0149_operator_auth_purge.md) inclui matriz A0–A4, runner versionado, attest da policy, comparação/lock antes de purge e isolamento `READ COMMITTED`; I25 `ACCEPT_SPEC_REVIEW_READY` após dois P1 corrigidos. DP-01 a DP-06, revisão T3 humana, código, PostgreSQL, staging e certificado do candidato integrado pendentes.
- I26 `ACCEPT_LOCAL` no branch OIDC `85c2c7d`: logout por digest antigo é contrato aprovado de revogação da família; P3 local de cookie visível ao servidor Vite no mesmo hostname. Para GO, provar host-only `Secure; HttpOnly; SameSite=Strict` com console/API em hosts HTTPS distintos do mesmo site, cookie pendente Lax no callback e cookie operacional ausente nele. PR-L04 ainda mantém integração root pendente.

# PR-301/402 — retenção OIDC, SPEC 0149 pronta para revisão — 27/09/2026

- `SPEC_REVIEW_READY / DPO_POLICY_PENDING / NO_GO`: [SPEC 0149](02_spec/0149_operator_auth_purge.md) e inventário DB-09 registram purge de state/sessões/famílias, isolamento do job e rollout. I24 `ACCEPT_SPEC_REVIEW_READY` após corrigir policy sem domínio e risco de família ativa sem limite. DP-01 a DP-06 e revisão T3 explícita são gates antes de BUILD; nenhum purge foi executado. PR-301/402 permanecem P0 para GO.

# PR-301 — serving sem DDL validado isoladamente — 27/09/2026

- `I23_ACCEPT_LOCAL / ROOT_INTEGRATION_PENDING / NO_GO`: commit isolado `85c2c7d` rejeita credencial DDL e migração automática na API de produção e executa preflight somente leitura para owner, runtime, grants e schemas. Node 22: 331/2.437 sem skips, PostgreSQL 35/258, E2E Keycloak/Chromium entre sites PASS, I23 `ACCEPT_LOCAL`, 18 hashes em `docs/04_audit/evidence/PR301-PROD-STARTUP-20260927/proof.json` no branch; inventário sintético zero e contêineres encerrados. Integrar após PR-L04; IdP corporativo, retenção/purga, rollout e certificação/CI no SHA integrado permanecem P0 de GO.

# PR-301/302 — prova local I22 aceita; produção ainda bloqueada — 27/09/2026

- `I22_ACCEPT_LOCAL_PROOF / ROOT_INTEGRATION_PENDING / NO_GO`: rechecagem independente aceitou a prova entre sites e replay de cookie salvo (`8b0f92d`). Commit isolado `0b57416` corrige a descrição da sessão antiga e exige limpeza verificável antes de emitir PASS; Node 22 E2E final, tipos/lint/links/higiene PASS. Tentativa com timeout deixou objetos sintéticos descartáveis, removidos manualmente; execução final zerou inventário. Prova no branch: `docs/04_audit/evidence/PR301-302-TRUSTED-E2E-20260927/proof.json`. Integração após PR-L04 e demais gates de produção abertos.

# PR-301/302 — I22: callback entre sites e revogação comprovados localmente — 27/09/2026

- `CROSS_SITE_E2E_PASS_LOCAL / I22_RECHECK_PENDING / NO_GO`: crítica independente rejeitou a prova anterior por não reapresentar o cookie salvo após logout nem usar sites distintos. Commit isolado `8b0f92d` executou Keycloak `localhost`, API/web `127.0.0.1`, callback sem cookie Strict mas com pendente Lax, substituição da sessão antiga e replays 401. Prova Node 22 no branch: `docs/04_audit/evidence/PR301-302-TRUSTED-E2E-20260927/proof.json`. Rechecagem I22, integração após PR-L04, rollout/IdP corporativo, dados e certificação no mesmo SHA seguem abertos.

# PR-301/302 — E2E confiável local com MFA real — 27/09/2026

- `TRUSTED_BROWSER_E2E_PASS_LOCAL / ROOT_INTEGRATION_PENDING / NO_GO`: commit isolado `cb943e8` comprova console/API/PostgreSQL/Keycloak em Chromium, OTP errado negado, OTP correto, cookie HttpOnly/Strict, recarga só por cookie e logout revogado; Node 22 e 24 PASS. Prova no branch `docs/04_audit/evidence/PR301-302-TRUSTED-E2E-20260927/proof.json`. Integração após PR-L04, crítica independente, IdP corporativo, retenção/purge, rollout e certificação/CI no SHA integrado seguem abertos.

# PR-302-WEB-OIDC — console local com login MFA — 27/09/2026

- `BUILD_VERIFIED_LOCAL / REVIEW_AND_E2E_PENDING / NO_GO`: branch isolado `codex/pr301-oidc-client` commits `531ef2a` e `1c1ae32` liga início OIDC, recarga por cookie, 401/503 distintos e logout seguro; suíte web 26/96, tipos/lint/build/links PASS. Prova no branch: `docs/04_audit/evidence/PR302-OIDC-WEB-20260927/proof.json`. Faltam crítica independente, E2E web/API/PostgreSQL/Keycloak, integração após PR-L04 e certificação do SHA integrado.

# PR-301-OIDC-ROUTES — rotas locais com sessão confiável — 27/09/2026

- `ACCEPT_LOCAL / ROOT_INTEGRATION_PENDING / NO_GO`: branch isolado `codex/pr301-oidc-client` commit `b41cff2` contém rotas de login/callback OIDC, preflight PostgreSQL, sessão opaca por cookie, replace atômico e logout revogado. I19/I20 aceitaram após correções; suíte com banco 330/2.428, `test:postgres` 35/258, Keycloak MFA e gates de tipos/lint/links/audit PASS. Prova no próprio branch: `docs/04_audit/evidence/PR301-OIDC-ROUTES-20260927/proof.json`. Integrar após PR-L04; implementar PR-302 web, IdP corporativo, retenção/purge, rollout e certificação/CI no mesmo SHA antes de considerar produção.

# PR-301-OIDC-CLIENT — cliente OIDC local isolado — 27/09/2026

- `ACCEPT_LOCAL / ROOT_INTEGRATION_PENDING / NO_GO`: branch `codex/pr301-oidc-client` commit `30d3ca4` contém cliente OIDC com assinatura/JWKS, nonce, PKCE, MFA/tenant e prova real Keycloak. I18 aceitou; Node 22: 41/41 focados, suíte sem banco 306/2.240 PASS (20/162 skipped), tipo/lint/audit/links PASS. Prova no branch isolado `docs/04_audit/evidence/PR301-OIDC-CLIENT-20260927/proof.json`. Integrar depois que PR-L04 liberar package/lockfile/contrato, API e web; compor store PostgreSQL, testar E2E confiável e certificar mesmo SHA. Produção segue bloqueada.

# PR-301-OIDC-STATE-PG — state OIDC compartilhado — 27/09/2026

- `ACCEPT_LOCAL / INTEGRATION_PENDING / NO_GO`: [prova](04_audit/evidence/PR301-OIDC-STATE-PG-20260927/proof.json) da migration incremental e consumo único em PostgreSQL 16; I16 aceitou desenho local, I17 aceitou BUILD após negativos de FK extra e timeout. Node 22: 26/26 focados, suíte 325/2.391 sem skips, PostgreSQL 35/258 PASS. PR-301 ainda P0: compor API, completar cliente OIDC/discovery/JWKS, ligar web/Keycloak, executar purge/rollback, E2E confiável e certificado no mesmo SHA.

# PR-301-OIDC-TRANSACTION — contrato de início/callback — 27/09/2026

- `ACCEPT_LOCAL / INTEGRATION_PENDING / NO_GO`: [prova](04_audit/evidence/PR301-OIDC-TRANSACTION-20260927/proof.json) de state/nonce/PKCE S256 e cookie temporário autenticado; I15 rechecagem aceitou após corrigir replay e callback exato do Keycloak. Node 22: 6/6 focados, suíte geral 305/2.226 PASS (20/154 skipped sem banco), PostgreSQL 35/258 PASS. PR-301 permanece P0: implementar state store durável e atômico, cliente OIDC/discovery/JWKS, rotas e sessão/web confiáveis, E2E e certificação no mesmo SHA.

# PR-003-INTERIM — certificado diagnóstico do candidato — 27/09/2026

- `NO_GO / PR-L04_PENDING`: [prova isolada](04_audit/evidence/PR003-INTERIM-20260927/proof.json) do SHA `c634fcd`: 16 comandos exit 0, 15 gates PASS/1 FAIL após adjudicação; E2E em simulação 12/12, PostgreSQL 35/258. `SKIP-PG-014` tem hash de fonte vencido sob claim PR-L04. Suíte unitária completa com ambiente PostgreSQL correto passou 324/2.374 sem skips, mas o certificado arquivado não foi promovido. I14 aceitou os fatos e 38/38 hashes do bundle. Reemitir no candidato integrado após correção do catálogo; OIDC e condições de GO abertas.

# PR-301-PG-INDEX — índices de sessão PostgreSQL — 27/09/2026

- `PG_INDEX_BOUNDARY_ACCEPTED_LOCAL / INTEGRATION_PENDING / NO_GO`: [preflight](../apps/api/src/operator-session-preflight.ts) exige cinco índices canônicos e falha fechado em drift de chave, predicado ou inventário; [prova PostgreSQL](04_audit/evidence/PR301-PG-INDEX-20260927/proof.json) Node 22 com 9/9 focados, suíte geral 304/2.220 e PostgreSQL 35/258 PASS; I13 `ACCEPT_LOCAL`. PR-301 ainda depende de OIDC criptográfico, composição API/web, E2E e certificação no SHA integrado.

# PR-301-OIDC-MAP — identidade OIDC verificada — 27/09/2026

- `MAPPING_ACCEPTED_LOCAL / API_INTEGRATION_PENDING / NO_GO`: [mapeador](../apps/api/src/oidc-identity.ts) e [prova](04_audit/evidence/PR301-OIDC-MAP-20260927/proof.json) exigem MFA, autenticação recente e grupo único após verificação de ID token. Keycloak real confirmou `pwd`/`otp`/`auth_time`; Node 22: 22 testes focados, suíte geral 304/2.220 e PostgreSQL 35/258 PASS; I12 `ACCEPT_LOCAL`. PR-301 ainda precisa validar assinatura/JWKS/nonce/state/PKCE na API, compor sessão PostgreSQL, integrar web, E2E e certificar o candidato; produção não autorizada.

# PR-301-OIDC-LOCAL — IdP de homologação — 27/09/2026

- `BUILD_ACCEPTED_LOCAL / API_INTEGRATION_PENDING / NO_GO`: [D-09](03_build/0357_production_decision_packet_2026-09-26.md) aplica IdP OIDC local com MFA e identidades sintéticas. [Keycloak local](../deploy/local-oidc/README.md) importou realm e passou prova real de PKCE S256 obrigatório, redirect exato, setup e validação OTP, `amr: otp` e grupo sintético no ID token ([prova](04_audit/evidence/PR301-OIDC-LOCAL-20260927/proof.json)); I11 `ACCEPT_LOCAL`. Sem composição de API/web, validação de assinatura/nonce, E2E confiável ou IdP corporativo; nenhum GO.

# PR-301 — store PostgreSQL em BUILD T3 — 27/09/2026

- `PG_STORE_ACCEPTED_LOCAL / INTEGRATION_PENDING / NO_GO`: [SPEC 0144](02_spec/0144_trusted_operator_session_production.md) aprovada e D-09 esclarecida para IdP OIDC local com MFA em desenvolvimento/homologação ([pacote](03_build/0357_production_decision_packet_2026-09-26.md), SHA-256 `0309ca28394c2499f0a47b60b90281b8ceca214d27066be8fd420ab1bcb15460`). Migration isolada, adapter, preflight e negativos em PostgreSQL 16: 8/8 do store e 16/16 focados PASS; tipo/lint/formato/links PASS. I7–I9 rejeitaram sete lacunas corrigidas; I10 `ACCEPT_LOCAL`. A [task PR-301](03_build/0356_production_backlog_2026-09-26.md) mantém composição, OIDC/PKCE, IdP local, web, E2E e certificação abertos; nenhum GO.

# PR-301/302 — SPEC 0144 e D-09 aprovadas — 27/09/2026

- `API_HOOK_PARTIAL_BUILD / WEB_REJECTED_I2 / NO_GO`: hook preserva cookie em falha de store sob [SPEC 0144](02_spec/0144_trusted_operator_session_production.md), com [prova local](04_audit/evidence/PR301-20260927/proof.json). A tentativa de recarga web foi retirada após crítica I2 dos estados 401/503 em `App.tsx`. PostgreSQL/role/RLS, troca atômica, composição do entrypoint, OIDC + PKCE e E2E confiável seguem abertos na [task 0356](03_build/0356_production_backlog_2026-09-26.md). Issuer e parâmetros IdP ainda aguardados do usuário; produção não autorizada.

# PR-009-PROV — BUILD T3 autorizado — 27/09/2026

- Usuário aprovou [SPEC 0147](02_spec/0147_ci_bar_external_provenance.md). Selo de cada gate em output externo ao diretório, inventário de hashes brutos e jobs separados de atestação/verificação implementados localmente. I1–I3 `REJECT` corrigidos; I4 `ACCEPT_LOCAL`; [prova local](04_audit/evidence/PR009-PROV-20260927/proof.json) com 24 testes focados e suíte completa 301/2.196 PASS, 20/146 skipped sem banco. [Task 0356](03_build/0356_production_backlog_2026-09-26.md) segue `REMOTE_PROOF_PENDING`: prova remota no SHA integrado, digest OCI publicável, proteção de `main` e política de retenção/exportação pendentes. Produção `NO_GO`.

# PR-401 — inventário de dados pessoais — 27/09/2026

- `INVENTORY_DRAFT / DPO_APPROVAL_PENDING`: [inventário técnico](platform/09-personal-data-inventory.md) por schema, fluxo e legado, e [modelo RIPD](platform/10-ripd-template.md) sem valores reais. Críticas I1–I3 corrigidas; I4 `ACCEPT` factual; links, higiene e formato PASS. D-10 e [PR-401](03_build/0356_production_backlog_2026-09-26.md) só fecham após revisão/aprovação do controlador/DPO e preenchimento por produto. PR-402/403/405 e gates de produção permanecem abertos; `NO_GO`.

# PR-007 — cobertura completa e lint tipado — 27/09/2026

- `SPEC_READY / BUILD_WAITING_PR003_AND_PATH_CLAIM`: [SPEC 0148](02_spec/0148_coverage_denominator_and_typed_lint.md) e [task 0356](03_build/0356_production_backlog_2026-09-26.md). Falta liberar `vitest.config.mts` da PR-L04, estabelecer baseline certificada da PR-003 e então implementar dois relatórios/guard e lint type-aware sem reduzir pisos. Produção `NO_GO`.

# PR-306 — ameaças das integrações reais — 27/09/2026

- `DOCUMENTED_LOCAL / FACT_CHECK_ACCEPTED`: [modelo de ameaças](10_phase10/PHASE10_THREAT_MODEL.md) e [task 0356](03_build/0356_production_backlog_2026-09-26.md) cobrem canal, provider, RAG, agenda, IdP, exfiltração por tool e prova de CI com teste atual e lacuna de staging. I1 encontrou quatro afirmações/omissões corrigidas; I2 aceitou o inventário local. PR-504/505 registram handoff sem fonte e destino de tool como testes faltantes. Nenhuma integração real, dado real ou release autorizado.

# PR-009-PROV — âncora externa do ci-bar — 27/09/2026

- `SPEC_PROPOSED / WAITING_HUMAN_REVIEW`: [SPEC T3 0147](02_spec/0147_ci_bar_external_provenance.md) e [task em 0356](03_build/0356_production_backlog_2026-09-26.md). Falta selo fora do diretório de artefatos, verificação remota de manifesto/imagem e teste de adulteração coerente pós-gate. Sem BUILD de segurança antes de revisão explícita; produção `NO_GO`.

# PR-008/009 — verificação local e pendências de promoção — 27/09/2026

- `BUILD_VERIFIED_LOCAL`: [PR-008](02_spec/0146_web_image_digest_and_name.md) tem digest fixado, web build/smoke e gate `image` verdes; [PR-009](02_spec/0145_e2e_junit_json_run_binding.md) tem vínculo JSON/JUnit/log/run, regressões negativas e E2E 12/12 no candidato isolado `2a11435`. [Prova web/imagem](04_audit/evidence/PR008-20260927/proof.json) e [prova E2E r3](04_audit/evidence/PR009-20260927-r3/proof.json). Node 22: `npm test` 300/2.182, PostgreSQL 35/258 PASS.
- `OPEN / NO_GO`: I5 rejeitou a proveniência adversarial sem âncora externa ao diretório mutável; desenho e revisão T3 pendentes. PR-L04 ainda detém `SKIP-PG-014` e os artefatos compartilhados; recertificação/CI no SHA integrado não executados. NGINX web depende do hostname `secretary-api` no deploy (PR-L10). SPEC T3 0144/D-09 e as 13 condições de GO permanecem abertas. Nenhum deploy ou dado real autorizado.

# PR-008 — imagem web reproduzível — 27/09/2026

- `SPEC_READY / BUILD_T2`: [SPEC-PR008-001](02_spec/0146_web_image_digest_and_name.md) define digest multiarch da imagem NGINX e nome corrente no Dockerfile. Gates ainda pendentes; produção `NO_GO`.

# PR-009 I2 — prova ci-bar isolada — 27/09/2026

- `E2E_CI_BAR_VERIFIED_ISOLATED / I2_RECHECK_PENDING`: gate E2E do ci-bar 12/12 no commit `1413809`; [log/snapshots/hash e negativo de finalização](04_audit/evidence/PR009-20260927-r2/proof.json). Falta reavaliação I2 e certificado/CI no SHA integrado. Produção `NO_GO`.

# PR-009 fatia 3 — I2 em remediação — 27/09/2026

- `BUILD_VERIFIED_LOCAL_R2 / CI_BAR_E2E_PENDING`: I2 rejeitou o vínculo de log/snapshots no commit `725a1b3`; correções implementadas e testes locais verdes (`npm test` 2.178, PostgreSQL 258). Falta prova E2E/ci-bar do código corrigido, reavaliação independente e certificado integrado. Produção `NO_GO`.

# PR-009 fatia 3 — E2E isolado aprovado — 27/09/2026

- `E2E_VERIFIED_ISOLATED / CERTIFICATION_PENDING_INTEGRATED`: 12/12 PASS no commit `6bc3bfc` em worktree próprio; [JSON/JUnit com hashes](04_audit/evidence/PR009-20260927/proof.json) e IDs internos coerentes. Ainda exige certificação/CI no SHA integrado; produção `NO_GO`.

# PR-009 fatia 3 — BUILD local — 27/09/2026

- `BUILD_VERIFIED_LOCAL / E2E_PENDING_ISOLATED`: [SPEC-PR009-003](02_spec/0145_e2e_junit_json_run_binding.md) implementada. Testes focados, `typecheck`, lint, formatação, links, self-test, `npm test` 2.177 PASS e PostgreSQL 258 PASS. Falta E2E real em claim próprio e certificado do candidato integrado. Produção `NO_GO`.

# PR-009 fatia 3 — evidência E2E — 27/09/2026

- `SPEC_READY / BUILD_T2`: [SPEC-PR009-003](02_spec/0145_e2e_junit_json_run_binding.md) define JSON e JUnit da mesma invocação, com `runId`, `candidateId` e `executionId` internos, comparados ao log/certificado. Artefatos E2E aguardam claim após a PR-L04. Produção `NO_GO`.

# Backlog mestre vigente — PROD-20260926 — 27/09/2026

A [task list 0356](03_build/0356_production_backlog_2026-09-26.md) é a fonte detalhada de PR-001–PR-709 e PR-L01–L12. O [plano 0354](03_build/0354_production_executive_plan_2026-09-26.md) define 13 condições de GO. Produção `NO_GO`.

## Estado de execução

- `COMPLETED`: PR-005 (rotação integral dos ledgers, links, formatação e reconstrução SHA-256 comprovados). Concluídas anteriormente: PR-001, PR-002, PR-004, PR-006, PR-108, PR-109, PR-012 e PR-L01, L02, L03, L05, L06, conforme 0356.
- `IN_PROGRESS`: PR-003 (certificado do candidato atual; `SKIP-PG-014` no claim PR-L04), PR-009 (par JSON/JUnit e jornadas), PR-L04 (outro agente), PR-010/011 (validação remota no mesmo SHA e em `main`).
- `WAITING_HUMAN_SPEC_REVIEW`: PR-301/302 sob [SPEC-PR301/302-001](02_spec/0144_trusted_operator_session_production.md), com D-09. F1–F7 e a maioria das tarefas restantes continuam propostas, sujeitas aos gates próprios.
- RA25: [0574](04_audit/0574_aud0573_execution_evidence_2026-09-25.md) comprova RA25-01/02/03/06/08/09 concluídas, RA25-10 com política registrada; [0575](04_audit/0575_aud53_closure_rebind_decision_packet.md) concluiu RA25-04/11. RA25-07 teve fatias 1–3 concluídas segundo o [log arquivado](08_runtime/archive/prod20260926_execution_log_history.md), com trabalho estrutural adicional ainda aberto. RA25-05 depende da matriz nova e da decisão C1M; os estados históricos de 0351 e 0574 representam suas datas, sem promoção automática a GO.

## Histórico íntegro

- [Backlog mestre anterior](08_runtime/archive/prod20260926_backlog_history.md), fonte `docs/30_backlog_master.md`, SHA-256 `fedc1c99cfe9333f80c8aad864df0a310995e1d1d5c5c26c427e276dd332f937` (revisão `4aac877e5e0c504940c8ef2856928e43a1a5ed2a`).
- [Runtime anterior](08_runtime/archive/prod20260926_runtime_state_history.md) e [log anterior](08_runtime/archive/prod20260926_execution_log_history.md) mantêm as decisões e evidências completas dos ciclos anteriores.

# PR-202 — fatia local integrada; OIDC/HTTPS T3 liberados para BUILD sintético — 28/09/2026

- `FIRST_SLICE_ROOT_LOCAL_PASS / FULL_PR202_OPEN / NO_GO`: [prova](04_audit/evidence/PR202-SLICE-20260928/proof.json) do root `69d08d3` com AST 3/3, crítico I2 `ACCEPT`, 325/2.393 com cobertura, PG 35/258, Chromium 12/12 e regressão root 13/275. Restam execução/replay, redução do arquivo e certificado composto. `skip:governance` falha por hash `SKIP-PG-014` vencido sob PR-L04; zero skips observados.
- [SPEC 0150](02_spec/0150_cross_origin_operator_console.md) e [SPEC 0152](02_spec/0152_corporate_oidc_authority_contract.md) receberam aprovação humana T3 para BUILD e testes somente sintéticos. Implementar em worktree com IdP HTTPS e hosts distintos; IAM real, DP/ops, integração, CI/atestação e 13 condições de 0354 permanecem gates de produção.

# PR-301 — preflight semântico do fencing — 28/09/2026

- `SPEC_0158_REVIEW_READY / HUMAN_T3_PENDING / NO_GO`: [prova](04_audit/evidence/PR301-FENCING-PREFLIGHT-SPEC-20260928/proof.json) PostgreSQL 16 reproduziu constraint homônima em outra tabela e `CHECK (true)` aceita por nome. [SPEC 0158](02_spec/0158_webhook_fencing_constraint_preflight.md) define o reparo e os negativos reais; BUILD depende de revisão humana T3. `A21-F20` continua aberto no certificado; root/CI/IAM/staging e condições 0354 pendentes.
