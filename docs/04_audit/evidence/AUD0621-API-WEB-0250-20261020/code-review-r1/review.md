<!-- Crítico de código independente R1 (Agent general-purpose novo, sem fork, separado do crítico da SPEC; só leitura), commit 3a4f4b9d56037585d0a6b575f6f8d9792f415117, 20/10/2026. -->

**verdict: REQUEST_CHANGES** (one mandatory item, in the web app; the backend has no defects)

## mandatory

**M1. Changing page in the approvals or tasks panel can leave it stuck on "Carregando..." (new bug from this change)**

- Where: apps/web/src/App.tsx:632-638 (goToApprovalPage) with refreshApprovals at 609-630 (guard at 627); same for tasks at App.tsx:822-828 (goToTaskPage) with refreshTasks at 799-820 (guard at 817).
- goTo*Page sets the panel to loading(...), then calls refresh*(viewScopeToken, offset). If the view scope changes before the response (user picks a conversation, or listConversations resolves and auto-selects the first), refresh\* returns at `if (!isCurrentViewScope(scope)) return` and never writes loaded or failed. The panel stays on "Carregando...", rows and decision buttons hidden, page buttons disabled; nothing recovers it until reload. Before this change list refreshes never set a loading state.
- Fix: guard page navigation with the identity scope (capture identityKey and previous data; call listApprovalPage/listTaskPage directly with the empty-page fallback; commit only if isCurrentIdentity(scope); on error failed(previous)). Alternative: isCurrent predicate and restore loaded(previous) on early return.
- Test: defer the offset=25 response, click "Próxima página de aprovações", click a conversation, resolve; assert "Resumo: Resumo c" renders and "Carregando..." is gone. Same for tasks.

## optional (P3)

1. First-red evidence is from an earlier version of the tests (P1 asserted toEqual([200, 400]); PG log lines 232/281/393 vs committed 236/287/410; PG P5 log shows 103 tasks from the older shared-tenant version). Committed tests are still red on base by reading, but regenerate the logs from the committed test text.
2. Memory P5 lacks the cross-tenant PATCH → 400 check listed in SPEC P5 (only PG has it).
3. No test for reload of the current offset after a decision/transition, nor for the fallback to offset 0 when that page comes back empty.
4. Cookie-path 503 test does not assert that getSession(null) used all 3 attempts.
5. P9 checks for the token in window only on the second page; checking the first page after bootstrap (provider deletes the global) would mean more.
6. After a failed task PATCH (e.g. the 400 race loser) the panel shows failed without reloading; if "conflito" in §3.6 also covers tasks, reload the current page.
7. During reauthenticating that follows unavailable, the button reads "Reautenticar" instead of "Tentar novamente".
8. requestPage turns a non-array data into [] silently, hiding a server contract error.

## checked

API and persistence: no defects. PATCH route single call with actorType/actorId/correlationId, log after return, codes 400 validation_failed / 400 invalid_action / 409 CAS / 500. Audit content matches the previous route in memory, single-client and pool modes; tenant-scoped appendAudit checks pass. Memory adapter synchronous, reads db.state, stages audit, publishes after success. PostgreSQL transition BEGIN → SELECT … FOR UPDATE OF tasks (tenant join/filter) → rule on locked row → CAS UPDATE → appendAudit same client → COMMIT; errors roll back; pool mode via withTenantContext with tenantIsolation and required tenant; no migration. Lists: single statement COUNT + LEFT JOIN LATERAL, $1/$2 limit/offset then tenant/status, ANY($n::text[]) parameterised, empty page keeps total, outer ORDER BY, hasNextPage correct. parseStatusPageQuery validation before query; adapters re-check; meta.pageInfo additive; data stays array. updateStatus gone from RuntimePersistence; no forbidden files touched; package.json only adds the PG test. No other consumer depends on the full list.
Web: cookie-first load; token single attempt; getSession never calls global onUnauthorized; 401 vs 0/429/≥500 classification, retry button and focus, no logout; request/requestEnvelope refactor keeps behaviour for other calls; StrictMode dedupe untouched; approval rows ARIA wired, summary redacted, Abrir caso via selectConversation, no permission widened.
Tests: P1–P8 logic and mutant kills reasoned through; waitForLockWaiters cannot cause false failure; role/trigger teardown correct; existing tests changed only list URL mocks; E2E URL-predicate routes and P9 flow correct for three browsers.
