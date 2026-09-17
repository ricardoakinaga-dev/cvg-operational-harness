# Phase 4A implementation report — AAA-4A

## Scope and result

The repository now contains one optional generic conversational layer above
the frozen Phase 4 Harness. It provides bounded typed contracts, rules-first
interpretation with an optional model adapter, state/references/corrections,
goal and question planning, source-grounded composition, explicit handoff,
the public Harness bridge, in-memory and PostgreSQL stores, delivery
idempotency, and two synthetic consumers.

The implementation was checked through the focused suite, structural
verifier, package and repository typechecks, frozen Harness build, golden and
performance evidence generators, existing Harness integration, and local
synthetic demo. With `TEST_DATABASE_URL` and
`PHASE4A_DISPOSABLE_PG=1` set to the disposable PostgreSQL 16.4 instance, the
focused result is 12 files and 73 tests passed, with no environment skip. The
structural verifier records 16 assertions. The production decision is
`NO_GO`; real data, providers, channels, credentials, clinical/financial
actions, appointments and deployment are outside the controlled build.

## Main artifacts

- `packages/conversation/` — public package and adapters.
- `packages/persistence/migrations/0020_conversation_intelligence.sql` —
  additive tenant/RLS schema.
- `examples/phase4a/` — synthetic Service Desk and Knowledge Assistant.
- `tests/phase4a/` — golden, adversarial, journey and public Harness tests.
- `scripts/phase4a-demo.ts` and `scripts/phase4a-verify.mjs` — repeatable
  controlled commands.
- `docs/phase4a/evidence/` — candidate-bound audit artifacts.

The current controlled certification is `PASS`: the frozen quality bar,
candidate, three fresh independent critics with complete axis scores and all
required local environment gates are green. The final sentinel is the last
integrity capture for this source snapshot. The generated evidence is under
`docs/phase4a/evidence/`.
