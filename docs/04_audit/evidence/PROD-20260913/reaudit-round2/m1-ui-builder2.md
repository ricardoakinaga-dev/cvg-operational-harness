# PROD-03 RA-M1-02/03 bounded builder delivery

2026-09-13. Implementation complete for independent review; no self-approval or production qualification. Required operational docs, task REWORK registration, reauditoria contract and independent critic/probes read. Shared governance updates remain leader-owned.

Only owned files changed:

- apps/web/src/features/journeys/index.tsx: add selectedSessionId to existing generation/reset effect dependencies; reset patientName to existing synthetic initial value Bolt. Existing generation guards, abort propagation, busy reset and all previous dirty changes preserved.
- apps/web/src/**tests**/journeys-identity-race.test.tsx: retain original three tests, add ten executable regression cases. Session A→B and A→null each exercise abort, busy reset, stale success/error suppression, old finally preserving an active new search, and successful current search completion. Six form tests cover tenant/actor/role/logout/session/session cleared, check phone/name reset and draft association removal, then recreate owner draft and check no previous pet name survives. Logout includes re-entry with the same identity.

No API, authorization, visual design, runtime or external-effect change. No descendant agents. The previous feature source is saved unchanged at /tmp/m1-ui-builder2-before.tsx (SHA256 40178910ad38aca18d9d0c2a4f01088244ba3ace8b094abe231578e4f5b6501e).

## Validation

All commands run from /home/ricardo/cvg-agent-secretary-v2 with exact Node binary /home/ricardo/.nvm/versions/node/v22.23.2/bin/node (v22.23.2).

1. RED before product fix: `node node_modules/vitest/vitest.mjs run apps/web/src/__tests__/journeys-identity-race.test.tsx` → exit 1, 10 failures / 3 pass. Log /tmp/m1-ui-builder2-red.log. All new cases discriminated the initial defective source; original three passed.
2. Format test file: `node node_modules/prettier/bin/prettier.cjs --write apps/web/src/__tests__/journeys-identity-race.test.tsx` → exit 0; /tmp/m1-ui-builder2-format.log.
3. GREEN nearby regression: `node node_modules/vitest/vitest.mjs run apps/web/src/__tests__` → exit 0, 5 files / 37 tests pass. Log /tmp/m1-ui-builder2-green.log.
4. `node node_modules/typescript/bin/tsc -p tsconfig.typecheck.json --noEmit` → exit 0. Log /tmp/m1-ui-builder2-typecheck.log (empty success).
5. `node node_modules/eslint/bin/eslint.js apps/web/src/features/journeys/index.tsx apps/web/src/__tests__/journeys-identity-race.test.tsx` → exit 0. Log /tmp/m1-ui-builder2-lint.log (empty success).
6. `git diff --check -- apps/web/src/features/journeys/index.tsx apps/web/src/__tests__/journeys-identity-race.test.tsx` → exit 0.

Final SHA256:

```
068ab5263fd0dcda7b6a4c124fc07beb500b2f7ac2ae153f064f63f360ccf78a  apps/web/src/features/journeys/index.tsx
8faca69ed0986cef7a18aa7c0a426f4c950b2e98bc47790894c7beafa13c2bdc  apps/web/src/__tests__/journeys-identity-race.test.tsx
```

Limits: focused jsdom coverage, not browser acceptance. No full npm test, coverage, production, PostgreSQL, external services or fresh critic performed by this builder. Independent original custom probe source was inspected, not modified or rerun in its preserved critic evidence directory. No approval inferred; pending leader integration and fresh independent review.
