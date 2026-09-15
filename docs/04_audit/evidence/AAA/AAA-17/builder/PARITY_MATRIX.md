# AAA-17 — Parity matrix (memory × PostgreSQL journey drafts)

Date: 2026-09-12 · Builder lane · Synthetic fixtures only.

Shared contract suite: `packages/persistence/src/__tests__/journeys-postgres.test.ts`
(`journeyContractSuite` runs the exact same assertions twice: `journey contract (in-memory)`
and `journey contract (postgres parity)`).

| # | Behavior | Shared contract test | Memory | PostgreSQL | Notes |
|---|----------|----------------------|--------|------------|-------|
| 1 | Owner draft create with phone normalization (`+55 (11) …` → `+5511999990001`) and candidate resolution | creates, reloads and lists owner drafts with normalized candidates | PASS | PASS | `candidate_ids jsonb` preserves the same fixtures |
| 2 | Idempotent owner create (same key returns same id, no duplicate row) | same test | PASS | PASS | `UNIQUE (tenant_id, idempotency_key)` + `ON CONFLICT DO NOTHING` |
| 3 | Ambiguous owner (2 candidates) rejects patient create without explicit candidate | same test | PASS | PASS | `conflict` |
| 4 | Explicit `ownerCandidateId` accepted and persisted | same test | PASS | PASS | `owner_candidate_id` column |
| 5 | Patient draft create + `linkPatient` (draft → linked) | links a patient and creates an approval-blocked appointment draft | PASS | PASS | audit event `patient_linked` |
| 6 | Relink of a linked patient rejected | same test | PASS | PASS | `conflict` |
| 7 | Slot list deterministic for the UTC day (same values after +25s) | same test | PASS | PASS | shared pure `buildJourneySlots` |
| 8 | Appointment draft is draft-only: `awaiting_approval`, `confirmationBlocked: true`, `sourceVersion: synthetic-schedule-v1` | same test | PASS | PASS | `CHECK (confirmation_blocked)` + status enum without `confirmed` |
| 9 | Idempotent appointment replay returns the same row | same test | PASS | PASS | `UNIQUE (tenant_id, idempotency_key)` |
| 10 | Expiry marks owner/appointment rows `expired` in place, rows preserved (count stays 1) | expires drafts in place without deleting evidence or inventing confirmation | PASS | PASS | expiry is `UPDATE`, never `DELETE` |
| 11 | Replaying the idempotency key after expiry returns the expired row (no new row) | same test | PASS | PASS | evidence preserved |
| 12 | New idempotency key after expiry creates a fresh draft | same test | PASS | PASS | |
| 13 | Expired slot rejected (`conflict`) even with a linked patient | same test | PASS | PASS | |
| 14 | Cross-tenant read of owner/patient drafts → `null` / `[]` | fails closed across tenant boundaries for reads and writes | PASS | PASS | explicit `tenant_id` predicate + RLS policy |
| 15 | Cross-tenant `linkPatient`, `createPatientDraft`, `searchPatient`, `createAppointmentDraft` → `not_found` | same test | PASS | PASS | fail-closed |
| 16 | Cross-tenant conversation/session context → `forbidden`; missing context → `invalid_action` | same test | PASS | PASS | composite FK to `conversations(tenant_id,id)` / `sessions(tenant_id,id)` |
| 17 | Journey task create idempotent (`source: journey-r3`, status `open`); missing session rejects | creates journey tasks idempotently and records handoffs | PASS | PASS | PostgreSQL delegates to `PostgresRuntimeRepository.createTask` under tenant context |
| 18 | `recordHandoff` resolves and writes audit evidence | same test | PASS | PASS | PG-specific test asserts the `journey_handoff` audit row |
| 19 | Slot limit and input bounds reject with `validation_failed` | rejects invalid inputs with stable validation failures | PASS | PASS | shared bounded helpers |

PostgreSQL-only evidence:

| Evidence | Test |
|----------|------|
| Migration artifact additive, RLS ENABLE/FORCE per table, no `confirmed` token in file | ships an additive draft-only migration with forced RLS |
| `schema_migrations` has `0014_journeys` with 64-hex checksum; catalog RLS flags, single tenant policy, status/confirmation constraints, `UNIQUE (tenant_id, idempotency_key)` per table | applies 0014 with forced RLS, idempotency constraints and draft-only states |
| Additive over a 0013 schema: prior conversation/session/task/audit rows preserved; migration re-applied twice (idempotent) | applies 0014 additively over a 0013 database and preserves prior data |
| Non-`BYPASSRLS` runtime role: no context → 0 rows; wrong tenant → 0 rows and 0 updated; cross-tenant INSERT → RLS error; own tenant → visible | fails closed for a non-BYPASSRLS runtime role without tenant context |
| Journey task + handoff audit persisted with `tenant_id` scope | persists journey task and handoff evidence through the tenant scope |
