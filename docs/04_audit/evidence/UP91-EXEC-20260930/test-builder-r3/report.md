# UP91-004-R3 — builder handoff

IMPLEMENTED / AWAITING_LEAD_ACCEPTANCE. Direct bounded builder, no descendants. Test source frozen in root and `/tmp/cvg-up91-exec-20260930/repo`; no product change. Parent004/021 remain open and production remains NO_GO. SPEC0172, task and claim preceded this BUILD; controller and ledgers remain owned by the Lead.

Edited source: `packages/agent-runtime/src/__tests__/runtime-recovery-boundary.test.ts`. Other writes are only this evidence directory and `/tmp/cvg-up91-exec-20260930/test-builder-r3/**`. Only the new test and SPEC0172 were copied to their same snapshot paths. SPEC0172 was not edited in root.

## Observed validation

Node22.23.2, direct Vitest4.1.11 on the snapshot. Exact command, cwd, exit and duration accompany each raw log in `*.command.json`.

| Check | Result | Evidence |
| --- | --- | --- |
| First focused run | PASS 1 file / 8 tests, exit0 | [focused-initial.log](focused-initial.log), [JSON](focused-initial.json) |
| Joint runtime corpus | PASS 14 files / 278 tests, zero skipped, exit0 | [joint-corpus.log](joint-corpus.log), [JSON](joint-corpus.json) |
| Existing corpus included | PASS all13 files / 270 tests | Joint JSON, [pre-BUILD title inventory](corpus-before.json) |
| New test plus transitive imports typecheck | PASS exit0, strict/noEmit | [typecheck-initial.log](typecheck-initial.log), [scope](tsconfig.json) |
| New test ESLint | PASS exit0 | [lint.log](lint.log) |
| New test Prettier | PASS exit0 | [format-check.log](format-check.log) |

The first actual focused/typecheck/lint runs passed. There was no first failure to preserve; their original logs and JSON were retained. No expectation was changed after running the tests. Global coverage/gates were not executed or inferred from partial checks.

Existing positive controls ran in the joint suite: execution-recovery2305 (expired persisted RESERVED/journal missing executes),1093 (ABANDONED recovery executes once), and legacy-rearm476 (persisted absent journal never-executing state rearms). They were not duplicated in the new file. The paired RESERVED sweep control was explicitly requested to distinguish the new EXECUTING/missing case.

## Cases and public oracles

| Case | Concrete observation | Recon guard |
| --- | --- | --- |
| 1 | Legacy keyless RESERVED expires after initial sweep timestamp; real journal missing; approval becomes UNCERTAIN, no reserve/effect | recovery482 |
| 2 | Persisted EXECUTING expires after initial sweep timestamp; missing journal cannot prove absence; UNCERTAIN, no reserve/effect | recovery495 |
| 3 | First recovery get captures actual absence; other actor reserves same requested key with a different proposal; second recovery get denies, journal and approval fence unchanged | recovery579 |
| 4a | Other actor creates UNCERTAIN row after first recovery get for keyless legacy approval; second read marks approval UNCERTAIN, no rearm | recovery609 |
| 4b | Same interleaving with persisted authority key; UNCERTAIN, no rearm | recovery643 |
| 5 | Journal's real TTL sweep produces ABANDONED from a never-started reservation; after active get captures ABANDONED, another actor acquires it; runtime's real reserve returns in_progress | recovery710 |
| 6 | Sweep read and first recovery read succeed with absence; fault occurs only after actual inner get on the second recovery read; denied, live approval unchanged | active-get catch |
| 7 | Public sweep with real approval authority/persisted key and absent journal: RESERVED releases to APPROVED, EXECUTING stays UNCERTAIN; zero effects | runtime96 |

On resume the get order is sweep, first recovery, active recovery. The typed port captures `inner.get`, invokes the fault/concurrent action, then returns the original observation. No runtime/policy mock, private call, invalid cast, invented no-effect evidence or hardcoded reserve outcome is used. Legacy fields come from the public optional reserve contract. Keys are received by the port or explicitly persisted by the approval API; no operation-key algorithm is copied.

Denied cases assert zero new provider calls (one request call total), tool/outbox/confirmation/reconciliation calls, no release, unchanged proposal/reservation generation/token, and full equality of inserted/winning journal rows. Active recovery necessarily attempts one real approval reserve that fails already_reserved before reading the journal again; journal reserve is forbidden except the real losing race. Expired recovery denies before any approval reserve. Sweep transitions use actual releaseExpired rather than forged release/uncertain outcomes.

Audit integrity uses the real ledger verification. Closed spans are counted against every actual telemetry.startSpan call, including child spans, with unique span IDs and valid end timestamps. Fallbacks57/187/822/826 were not targeted.

## Frozen candidate and limits

Test SHA-256: `71ac93f0025f2e11bf297cfabf5a86a40f763cc5c8cfd8530cb685aecf5d51f8`.

SPEC0172 SHA-256: `a3ab754b47cf9bc4de405e1197aac96a2111d2f00b2b1a52b93a9bc6684f7c78`.

[Proof](proof.json) binds raw logs, commands, suite JSON, configs and [tested source manifest](tested-source.json) by SHA-256. [Before](source-before.json)/[after](source-after.json) preserve158 preexisting paths: zero root drift; snapshot drift only the authorized SPEC copy. Generated declarations missing in the snapshot were not copied and are excluded from the tested source manifest.

No behavioral bug observed. Full native T2 gates, PostgreSQL/E2E, native certification and independent I1 remain for the Lead. This report gives no parent DONE, independent approval, public-contract change or production authority. Batch7 actual approval response remains pending. No commit, push, dependencies/install, real DB, provider/clinical effect, controller/ledger/manifest/catalogue edit or README/navigation/SPEC0170/0166/0167 write.
