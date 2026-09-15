# Test readiness para extração

| Comportamento                      | Estado                     | Evidência/gap                                       |
| ---------------------------------- | -------------------------- | --------------------------------------------------- |
| approval binding/resume/fencing    | EXISTING_STRONG            | ~245 runtime + ~100 approval cases                  |
| effect journal/idempotency/crash   | EXISTING_STRONG controlado | runtime journal/recovery tests                      |
| model routing/retry/budget/circuit | EXISTING_STRONG            | ~65 cases                                           |
| policy decision matrix             | EXISTING_STRONG            | ~54 cases                                           |
| PostgreSQL adapters/outbox/tenant  | EXISTING_STRONG local      | ~163 cases, mas DB suite não rodada nesta auditoria |
| worker lease/retry/shutdown        | EXISTING_STRONG local      | consumer tests e current unit pass                  |
| canonical HTTP→SQL→worker→kernel   | BLOCKING_EXTRACTION        | runtime state diz AAA-21 ainda não construída       |
| dual-runtime parity/golden traces  | MISSING/BLOCKING           | nenhum equivalence contract                         |
| non-Secretary consumer             | MISSING/BLOCKING           | capability enum fechado                             |
| package public API/build isolation | MISSING/BLOCKING           | manifest/import drift                               |
| schema/state cross-version         | MISSING/BLOCKING           | cutover/rollback não provados                       |
| no-duplicate effect during cutover | MISSING/BLOCKING           | exige mixed-version crash/replay                    |
| audit/trace continuity across repo | MISSING/BLOCKING           | kernel audit in-memory                              |
| conversational golden flows        | EXISTING_WEAK              | heurística/fake, não modelo real                    |

Gates mínimos antes de mover: artifact manifest; public export snapshot; isolated package compile; consumer contract; two-product profile; HTTP→SQL trace; cross-version DB migration; approval pause/restart; idempotent cutover; rollback; no source import from Secretary.

Evidência atual desta auditoria: `npm test` PASS 240/249 files, 1.680/1.785 tests, 9 files/105 tests skipped; typecheck PASS. Skips impedem usar a suíte como prova integral de PostgreSQL/external boundaries.
