# Phase 4A task registration — AAA-4A

## Superseding controlled-build registration — 2026-09-17T03:22:00Z

`PHASE4A_TASK=CVG-PHASE4A-CONVERSATIONAL-INTELLIGENCE`
`PHASE4A_STATUS=PASS`
`PHASE4A_ENTRY_GATE=VERIFIED`

The task is registered against the exact current prompt copy and the frozen
machine quality bar. The current 16 source parts are
`docs/phase4a/prompts/MASTER_PROMPT_2026-09-17-001.txt` through
`MASTER_PROMPT_2026-09-17-016.txt`, with their byte and digest inventory in
`docs/phase4a/PROMPT_COPY_2026-09-17.md`. The older 18-part archive remains
historical evidence and is preserved.

Phase 4 handoff verification is recorded in
`docs/phase4a/PHASE_4_HANDOFF.md`, with the fresh critic approval and
mutation-clean sentinel under `docs/phase4/evidence/`. The user's request to
implement the supplied prompt authorizes this controlled build after the
verified gate. A fresh Gauntlet run is complete in `.gauntlet`; the finished
prior run is preserved under `.gauntlet-aaa41-closure-retry-finished-20260916/`.

The implementation authority covers synthetic, disposable consumers and
candidate-bound tests/evidence only. It does not authorize real data,
providers, channels, credentials, sensitive actions or production release.

Current audit candidate: `aaa4a-df2c0b1a1b7e0e9a` /
`df2c0b1a1b7e0e9a40badf7bd04a444a0ecf1f30390865412b2845adce492e77`.
The controlled suite records 73/73 tests across 12 files with disposable PostgreSQL;
the final three fresh critics approved this snapshot with every axis at or above
the frozen 90-point floor.

- Task: `CVG-PHASE4A-CONVERSATIONAL-INTELLIGENCE`
- Quality bar: `docs/phase4a/QUALITY_BAR.md` (`AAA-4A v1`)
- Authority: the exact current 16-part prompt copy archived under
  `docs/phase4a/prompts/`, indexed by `PROMPT_COPY_2026-09-17.md`.
- Gate validation: `docs/phase4a/GATE_VALIDATION.md`.
- Traceability: `REQUIREMENTS_TRACEABILITY.md`; tests: `CRITICAL_TEST_CATALOG.md`.
- Boundary and consumers: `ARCHITECTURE_SYMBOL_MAP.md`,
  `CONSUMER_CHANGE_SURFACE.md`.
- Reviewer packet: `INDEPENDENT_REVIEW_PACKET.md`.
- Scope: controlled synthetic consumers only; production and real effects
  remain `NO_GO`.
- Current status: `PASS` in the controlled synthetic scope; the final sentinel
  captured a matching frozen source snapshot.

## Entry gates

1. `docs/phase4/PHASE_3_HANDOFF.md` remains verified.
2. `docs/phase4a/PHASE_4_HANDOFF.md` contains the current
   `PHASE_4_HANDOFF=VERIFIED` record with fresh candidate evidence and a
   mutation-clean sentinel.
3. Discovery, PRD and SPEC records are validated under the CVG pipeline; the
   user's explicit implementation request is the recorded authorization for
   this controlled BUILD.
4. A new Gauntlet run is active for AAA-4A; the historical `.gauntlet*`
   directories are preserved and not resumed or overwritten.

## Atomic work items

| ID    | What                                               | Where                                           | Dependency      | Done when                                                   |
| ----- | -------------------------------------------------- | ----------------------------------------------- | --------------- | ----------------------------------------------------------- |
| 4A-01 | Freeze contract/state model                        | `packages/conversation`, `docs/phase4a`         | handoff + SPEC  | public types, invariants and tests exist.                   |
| 4A-02 | Implement rules-first interpreter/dialogue manager | `packages/conversation`                         | 4A-01           | no direct execution/authority access; malformed input safe. |
| 4A-03 | Implement response grounding/repair                | `packages/conversation`                         | 4A-01           | verifier rejects unsupported/fake success claims.           |
| 4A-04 | Bridge to public Harness                           | `packages/conversation`, examples               | 4A-02/03        | policy/approval/journal evidence exists for actions.        |
| 4A-05 | Add durable store/delivery migration               | `packages/persistence`, `packages/conversation` | handoff + 4A-01 | disposable PostgreSQL proves RLS/recovery/idempotency.      |
| 4A-06 | Build two synthetic consumers and corpus           | `examples/phase4a`, tests                       | 4A-04/05        | 15 golden + adversarial + second-profile conformance pass.  |
| 4A-07 | Audit and certify                                  | `docs/phase4a/evidence`                         | all above       | fresh critics/sentinel/final status are candidate-bound.    |

No item authorizes real data, real channels/providers, clinical/financial/
record action, automatic appointment confirmation, or production release.
