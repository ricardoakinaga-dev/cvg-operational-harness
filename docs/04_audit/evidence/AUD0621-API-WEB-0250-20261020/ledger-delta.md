# AUD0621-API-WEB-0250 — texto proposto para os ledgers e backlogs donos

Frente `AUD0621-API-WEB-0250` (tasks `AUD0621-API-WEB-SPEC-0250-20261020` e `AUD0621-API-WEB-BUILD-0250-20261020`), task-mãe `AUD0621-REMEDIATION-20261020`. O lead integra; esta frente não edita `docs/99_runtime_state.md`, `docs/20_master_execution_log.md`, `docs/30_backlog_master.md`, `docs/02_spec/` nem os backlogs donos.

## Promoções propostas

1. `materialized/0250_api_tasks_session_approvals.md.txt` → `docs/02_spec/0250_api_tasks_session_approvals.md`, bytes inalterados (sha256 `f83d49788372b29909e15eaa68c6a91bf2ae51f0bf0e897bb858dc222a3727af`, revisão r2 aprovada pelo crítico independente sem obrigatórios). Ao promover, acrescentar ao fim da SPEC a seção de registro:

   > **BUILD local — 20/10/2026.** Candidata `b912b348221b1e9cdf3d40d53f4931d95d86ee8d` sobre `6c9fc6517f272e884a4adc5d7b8c71d1e1a552e9` (commits `3a4f4b9d…` e `b912b348…`). P1–P8 vermelhos na base com o texto dos testes commitado e verdes na candidata; P9 E2E escrito (execução local registrada na evidência). Crítico de código: R1 REQUEST_CHANGES (paginação presa em "Carregando..." ao trocar de caso), R2 APPROVE. Nota de comportamento (P3 da R2 da SPEC): depois de 503 no caminho com token, o provider já consumiu o token de uso único; "Tentar novamente" segue pelo cookie e termina em "Autenticação necessária" ou restaura a identidade de um cookie anterior, que pode diferir da do token; nova autenticação pelo host resolve, sem ampliar acesso. [Evidência](task.json). Não autoriza deploy, produção, dado real nem IdP corporativo.

2. Adendo à `docs/02_spec/0107_contratos_de_api.md`, nas seções `GET /v1/approvals` e `GET /v1/tasks`:

   > Paginação (SPEC0250): `limit` 1–100 (padrão 25), `offset` 0–10000, `status` opcional como lista separada por vírgula de valores distintos do enum do recurso. `data` é array; `meta.pageInfo = { limit, offset, total, hasNextPage }`. Parâmetro inválido: 400 `invalid_pagination` (limite/deslocamento) ou `validation_failed` (status). `/v1/conversations` mantém `data: { items, pageInfo }`; unificar exige versão nova.

## `docs/99_runtime_state.md` (entrada da frente)

- `AUD0621-API-WEB-0250` — `READY_FOR_NEXT_STEP` (integração pelo lead). SPEC0250 r2 aprovada pelo crítico (R1 REQUEST_CHANGES com 2 obrigatórios corrigidos; R2 APPROVE). BUILD local na candidata `/mnt/dados/cvg-work/cvg-aud0621-apiweb0250-20261020`, commit `b912b348`, fecha F12, F15, F16, F22 e F23 com testes first-red; crítico de código R2 APPROVE. Próxima ação: lead integra os dois commits, promove a SPEC e o adendo da SPEC0107 e roda `test:e2e`/`certify` integrados. Produção `NO_GO`.

## `docs/20_master_execution_log.md`

- 20/10/2026 — AUD0621-API-WEB-0250 (CONT-20261018-D9EF, executor da frente). SPEC0250 (`f83d4978…`) escrita, crítico independente R1 REQUEST_CHANGES (modo PostgreSQL de cliente único fora do escopo de I1/I2; token de uso único reenviado pelo retry de GET) e R2 APPROVE. BUILD na candidata detached: transição de tarefa atômica (memória síncrona; PostgreSQL `FOR UPDATE OF tasks` + CAS + audit na mesma transação), listas de tarefas/approvals limitadas com `meta.pageInfo` e filtro de status, contexto de caso/resumo na fila de approvals, restauração de sessão por cookie com token de tentativa única e estado "Sessão indisponível". Crítico de código R1 REQUEST_CHANGES (paginação presa), corrigido em `b912b348`; R2 APPROVE. Gates no commit final: typecheck e lint exit 0; vitest `apps/api`+`packages/persistence`+`apps/web` 132 arquivos/754 testes PASS (13 arquivos/159 testes PostgreSQL pulados sem banco, por convenção); PostgreSQL 16 descartável 6 arquivos/107 testes PASS (inclui o novo `task-approval-postgres.test.ts` com role `NOSUPERUSER NOBYPASSRLS`); mutantes 14, 12 mortos e 2 sobreviventes esperados (lock e CAS são redundantes entre si). Recursos removidos ao fim.

## `docs/30_backlog_master.md` (linhas de continuidade, sem backlog concorrente)

- AUD0621 F12, F15, F16, F22, F23 — `FIXED_IN_CANDIDATE` (`b912b348`), pendente integração e certificação do lead.
- Novo (sob UP91-018): autorização por caso atribuído (Operator/Approver) em `GET /v1/tasks` e `GET /v1/approvals`; a SPEC0176 cobre só os cinco readers de conversa/timeline/execução/auditoria.
- Novo (sob UP91-018): `POST /v1/tasks` e `POST /v1/approvals` criam e auditam em dois passos (mesma classe do F16 na criação); `createTask` já aceita `onCreated` para a versão atômica.
- Novo (composição): modo PostgreSQL de cliente único (`buildServerFromEnv` sem RLS) compartilha uma conexão entre requisições; transações de `decideApprovalWithAudit`, `transitionTakeover` e agora `transitionTaskStatusWithAudit` não ficam isoladas por requisição. Produção exige RLS (`postgres-pool`). Ação: compor o modo sem RLS com pool e conexão por operação, ou retirá-lo.
- Novo (refatoração T2): mover `listTaskPage`, `listApprovalPage` e `transitionTaskStatusWithAudit` para `TenantScopedPostgresRuntimeRepository` quando `tenant-scoped-postgres.ts` estiver livre; hoje `server.ts` aplica `withTenantContext` diretamente (`runTaskApprovalOperation`).
- Resíduos web (P3): nome de botão de decisão duplicado entre linhas (mitigado por nome da linha e `aria-describedby`); recarga da página de tarefas após 409/`invalid_action` sem mensagem ao operador e sem teste dedicado; rótulo "Reautenticar" durante a nova tentativa que segue "Sessão indisponível".

## Backlogs donos

- `docs/03_build/0356_production_backlog_2026-09-26.md`, PR-302: "20/10/2026, AUD0621 F12 — recarga por cookie, 401 inicial distinto de expiração, 503 como indisponibilidade e token de uso único sem retry implementados na candidata `b912b348` (SPEC0250 §3.5), com teste de componente e E2E `rem21-014` sem reinjeção de token. IdP corporativo e topologia SPEC0150 seguem pendentes; `NO_GO`."
- `docs/03_build/0367_program_backlog_reaudit_2026-09-30.md`, UP91-018: "20/10/2026, AUD0621 F23 — contrato paginado de `GET /v1/tasks` e `GET /v1/approvals` (adendo SPEC0107 proposto pela SPEC0250); linhas novas de autorização por caso nessas listas e de criação atômica com audit."
