# AUD0625-F07-0257-BUILD-07-20261028 — plano de fatias (SPEC 0257 R2, sha256 c22d15d3…)

Base: `origin/candidate/aud0625-wave-20261028` a69030d3. Node 22. Migration livre: **0030** (base termina em 0029). Regra de carga: PG só com uptime < 12; sem npm test completo.

Padrão de referência existente: SPEC 0250 `TaskRepository.transitionStatusWithAudit` (memória: seção crítica síncrona com estado em staging; PG: `runTaskApprovalOperation` + `transitionTaskStatusWithAudit`).

## Fatias (cada uma com commit local)
1. **Persistência (memória + PG) + migration 0030 + inventário/preflight/migrate-job** — `api-creation` (digests §3), `InMemoryDatabase` com ponteiro privado e CAS (§5), `createTaskWithAudit`/`createApprovalWithAudit` (memória), `runCreationTransaction` + commands PG (§4.2), tabela `api_creation_receipts` (§4.1), `runtimePrivileges: 'read-insert'` em tenant-schema/preflight e grants do migrate-job. Testes: unidade memória (AC01/02/03/10), PG (AC01–AC04, AC07, AC08, AC11), contrato de migration.
2. **API** — header `Idempotency-Key` único (§2), rotas `/v1/tasks` e `/v1/approvals` via port atômico, 503 sem port, 409 para chave reutilizada, replay 200, `cache-control: no-store`; ator autenticado no audit (§6). Atualizar callers/testes do inventário (§7).
3. **Console** — `requestAuditEvidenceExportApproval` recebe chave; registro de operação lógica no App (sessionStorage, uuid antes do 1º fetch, mesma chave em retry/reload/duplo clique) (§7, AC06).
4. **Fechamento** — inventário de callers por caminho/linha/hash, mutantes (§8), BUILD-RESULT.md, gates focados.

## Inventário prévio de callers (grep por literal; completar na fatia 2)
Arquivos com `/v1/approvals` ou `/v1/tasks` (POST ou GET): apps/api/src/server.ts, routes/{approvals,tasks}.ts, __tests__/{case-scope-tasks-approvals(+postgres),identity-trusted-resolver,case-assignment-authorization,observability,health,operator-identity-rbac,task-status-atomicity,identity-composition-wiring,postgres-persistence-mode,oidc-console-hosts-api,audit-evidence,approval-actions,attendance-approval-atomic,production-bootstrap-postgres-own,production-boundary,oidc-login-entrypoint-postgres,task-approval-postgres,oidc-login-routes,tenant-inbound-isolation,task-approval-pagination,server-boundary-envelope,task-lifecycle,oidc-login-guards}.test.ts, approval-request-field-boundary.test.ts, internal-task-field-boundary.test.ts, approval-decision-note-field-boundary.test.ts, http-request-boundary.test.ts; apps/web/src/api/client.ts, __tests__/{app,approval-task-queue,cookie-session-restore}.test.tsx; tests/e2e/{critical-flows.test.ts,rem21-014-qualification.spec.ts}, tests/e2e-oidc-hosts/oidc-hosts.spec.ts, tests/production-target-smoke.test.ts, scripts/production-target-smoke.ts.
