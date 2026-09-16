# Phase 4A task registration — AAA-4A

- Task: `CVG-PHASE4A-CONVERSATIONAL-INTELLIGENCE`
- Quality bar: `docs/phase4a/QUALITY_BAR.md` (`AAA-4A v1`)
- Authority: the user-provided 18-part Phase 4A prompt archived under
  `docs/phase4a/prompts/`.
- Gate validation: `docs/phase4a/GATE_VALIDATION.md`.
- Traceability: `REQUIREMENTS_TRACEABILITY.md`; tests: `CRITICAL_TEST_CATALOG.md`.
- Boundary and consumers: `ARCHITECTURE_SYMBOL_MAP.md`,
  `CONSUMER_CHANGE_SURFACE.md`.
- Reviewer packet: `INDEPENDENT_REVIEW_PACKET.md`.
- Scope: controlled synthetic consumers only; production and real effects
  remain `NO_GO`.
- Current status: `PLANNING_BLOCKED_BY_PHASE4_HANDOFF`.

## Entry gates

1. `docs/phase4/PHASE_3_HANDOFF.md` remains verified.
2. `docs/phase4a/PHASE_4_HANDOFF.md` is superseded by a current
   `PHASE_4_HANDOFF=VERIFIED` record with fresh candidate evidence and a
   mutation-clean sentinel.
3. Discovery, PRD and SPEC records are validated under the CVG pipeline; the
   required human review/authorization is recorded before BUILD.
4. A new Gauntlet run is created for AAA-4A; the historical `.gauntlet*`
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
