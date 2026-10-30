# AUD0625-F15-SPEC-D9 — fase 1 (SPEC 0271 R1)

Base `claude/aud0625-wave3` @ `f38bfafc4`. Sem correção. Entregue: SPEC 0271 R1 (`PROPOSED_FOR_HUMAN_T3_REVIEW`, decisões D1/D2), teste PG `packages/persistence/src/__tests__/aud0625-f15-migration-0021-precheck.test.ts` (1 `it.fails` + 4 controles) e a prova em [red-on-base.txt](red-on-base.txt). Achado novo da fase 1: uma "migration de guarda" não destrava a 0021 (SPEC §2); a correção exige mudar o texto da 0021 e aceitar o checksum antigo no runner, no preflight e no baseline.
