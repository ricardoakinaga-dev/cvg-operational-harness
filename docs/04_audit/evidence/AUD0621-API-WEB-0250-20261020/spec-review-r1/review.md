<!-- Crítico independente R1 da SPEC0250 r1 (Agent general-purpose, sem fork, só leitura), 20/10/2026. Texto integral devolvido pelo crítico. -->

## Review of SPEC0250 r1 (base 6c9fc651)

**verdict: REQUEST_CHANGES**

Note: the worktree is not untouched. It has untracked tests (task-approval-pagination, task-approval-postgres, task-status-atomicity, task-status-transition, approval-task-queue, cookie-session-restore) and a modified tests/e2e/rem21-014-qualification.spec.ts. Code facts taken from `git show HEAD:`.

### mandatory

1. I1/I2 are claimed for every composition, but they fail in `postgres` (single-client) mode. server.ts:5423-5426 reaches `{kind:'postgres', client: await pool.connect()}` whenever POSTGRES_RLS_ENFORCEMENT !== 'true'; createPersistence (server.ts:4892-4894) wraps that one connection and every request shares it. Two concurrent PATCHes interleave on that connection: B's BEGIN is a no-op (joins A's transaction); B's CAS sees A's uncommitted update, gets 0 rows, 409 and ROLLBACK, undoing A's update; A's appendAudit then autocommits and A answers 200 — audit without state change, a new failure class. Every invalid transition now runs ROLLBACK on the shared connection, which can undo unrelated statements. decideApprovalWithAudit (postgres.ts:1125-1164) has the same exposure; production is protected because packages/shared/src/env.ts:91 forces RLS (postgres-pool). Fix (documentation only): limit I1/I2 and §3.1/§3.3 to memory and postgres-pool; state that single-client is non-production and not isolated per request, pre-existing for approvals/takeover, 409 reachable there; add the residual to §8 with a backlog line; do not say "inalcançável" without that qualifier.

2. I6 is broken on the token path by the client's automatic GET retry. getSession goes through request() as a GET (client.ts:751-758), retried on 429/5xx/network up to 2 times (client.ts:606-638, DEFAULT_MAX_GET_RETRIES=2 at :126). The API records the jti when it resolves the token (operator-identity.ts:172-179, called at server.ts:786-797) and only then writes the store; a store failure returns 503 and keeps the cookie (server.ts:838-846). The retry resends the same token, gets "replay detected" → 401, and the catch at server.ts:859-865 clears the cookie. A transient 503 or timeout during login/rotation becomes "Autenticação necessária" plus server-side logout of a previously valid cookie, against I6 and SPEC0144. Fix: getSession(token) makes a single attempt (only the cookie-only path may retry); add a P8 case token+503 → "Sessão indisponível", exactly one /v1/session request with x-cvg-operator-token, no clear-cookie; add mutant "retry com token" killed by P8.

### optional

- P1 is inert after BUILD (route no longer calls findById); [200,400] depends on `done` dispatched first; if the memory method calls this.findById the test's async override hands a Promise to the sync method. Gate transitionStatusWithAudit or assert an order-independent serial chain; state that the memory method reads db.state.
- Approval accessible names stay duplicated; aria-describedby not used by voice control/rotor. At minimum name each row (article aria-labelledby → summary and case) or put the case in the button name.
- Duplicate pager names: name per panel.
- Outer ORDER BY page.created_at, page.id in the LATERAL query; COUNT(\*)::integer.
- §4 cites SPEC0176 for list authorization by case, but SPEC0176 does not cover these lists; cite UP91-018 only or open a line.
- P5 first-red text: base returns 101 items, not "2 itens".
- Anchor: audit.append is at server.ts:1793.
- P8 must account for GET retries (503 mock must serve the whole retry budget).
- Remove updateStatus from RuntimePersistence.tasks (no caller remains; avoids a non-CAS write path).
- POST /v1/tasks and POST /v1/approvals also create-then-audit in two steps: declare out of scope with a backlog line.
- Tenant cases in PostgreSQL: cross-tenant PATCH → 400; total excludes other tenant; run with a NOSUPERUSER/NOBYPASSRLS role.
- Record meta.pageInfo and 25/100/10000 limits in SPEC0107.
- Clarify P9: no token on new page and on reload; token not in storage; record whether P9 first red was run.

### checked

Findings vs code correct (F12, F15, F16, F22, F23); anchors correct except audit.append; postgres-pool traced (withTenantContext session-level config without outer transaction, audit insert reads current_setting, tasks RLS FOR ALL, runtime role has UPDATE, statement_timeout in production); READ COMMITTED + FOR UPDATE OF tasks rechecks (done → 400), no deadlock; mutants (lock alone removed → CAS 409 keeps P2 green; transaction removed → P4; both → P2 red); P2–P4 red on base; ok()/ApiEnvelope serialize extra meta; parsePagination rejects repeated params; enums correct; no other writer of tasks.status; only consumers are web, tests and smoke (status only); StrictMode dedupe via trustedBootstrapInFlightRef; onUnauthorized before 401 handling (client.ts:672); generic-error test holds; E2E/web mocks affected only by URL matching; no migration, no new premise, no permission widened.
