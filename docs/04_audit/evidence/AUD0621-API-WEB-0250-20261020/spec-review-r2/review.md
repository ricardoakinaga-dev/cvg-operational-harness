<!-- Crítico independente R2 (mesmo crítico da R1, retomado; só leitura) da SPEC0250 r2, sha256 f83d49788372b29909e15eaa68c6a91bf2ae51f0bf0e897bb858dc222a3727af, 20/10/2026. -->

SPEC0250 r2 review: **verdict APPROVE**. Both mandatory items are resolved, and nothing left is mandatory.

**mandatory:** none

**M1 (single-client `postgres` mode): resolved** — §2 "Escopo de I1 e I2" limits the invariants to memory and `postgres-pool`, single-client described as non-productive and not isolated per request; §3.1 says the 409 is unreachable in `postgres-pool` and reachable in single-client; §3.3 labels the mode non-productive; §8 records the residual (absorbed BEGIN, ROLLBACK undoing another request's write, reachable 409) and proposes a remedy. Anchors hold: server.ts:5423-5426 inside buildServerFromEnv (5128); env.ts:91 requires RLS in production.

**M2 (retry of the one-use token): resolved** — §1.5 describes the replay risk with correct anchors (client.ts:606-638, operator-identity.ts:172-179, server.ts:838-846, 859-865); I6 forbids an automatic retry that resends the token; §3.5 makes getSession(token) a single attempt, only getSession(null) keeps the GET retry; P8 adds "token + 503 → exactly one /v1/session request with the token header"; the "retry com token" mutant is listed. On the base the token path makes 3 requests, so the new P8 case is red.

**optional (P3)**

1. Missing linked files: the SPEC cites `ledger-delta.md` (§4 twice, §8) and `corrections.md` cites `spec-hashes.json`; neither exists yet in AUD0621-API-WEB-0250-20261020/. Create both, or link the exact path, before the BUILD round closes.
2. P9 reload: reload the new page (without init script); the first page's addInitScript would put the token back on every reload.
3. "Tentar novamente" after a token-path 503: the provider already consumed the token, so the retry goes through the cookie path, ending in "Autenticação necessária" or restoring the identity of an earlier cookie, which can differ from the token's identity. Document in §3.5 or §8.
4. Test roles in P2/P4/P5: the NOSUPERUSER NOBYPASSRLS role is cluster-global; unique name and drop in teardown; trigger and lock holder on the admin/owner connection.
5. P1: also assert that the number of 200 responses equals the number of status events.

**checked** — r2 changes match corrections.md item by item; no new mandatory defect: P1 order-independent and red on base; memory method reads db.state so the barrier on findById is inert; removing updateStatus from RuntimePersistence.tasks is safe (only repository-error-paths.test.ts uses TaskRepository.updateStatus and the class keeps it; the memory instance still has it, so the P1 harness works); outer ORDER BY and COUNT(\*)::integer sound (unqualified ORDER BY in the subquery resolves to output columns); article aria-labelledby valid ARIA, duplicate button names declared as residual; per-panel pager names do not collide with "Proxima pagina de evidencias"; SPEC0107 addendum and §4 re-attribution consistent with code; P5 first-red text corrected; no migration, no new premise, no permission widened.
