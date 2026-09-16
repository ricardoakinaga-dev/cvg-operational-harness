# AAA-21-R1 repair evidence

Captured 2026-09-13 in the controlled local lane. This artifact records the
repair scope and its limits; it is not a production approval.

## Delivered controls

- The neutral harness remains limited to `@cvg/harness-contracts` and
  `@cvg/harness-orchestrator`; the durable approval adapter is composed from
  `@cvg/persistence`.
- `WAITING_APPROVAL` carries a non-null approval identifier in the execution
  record and event path. Direct `WAITING_APPROVAL → QUEUED` transitions are
  rejected; resume uses `resolveApproval` under a locked tenant-scoped
  transaction.
- `POST /v1/executions/:executionId/approvals/:approvalId/decision` requires
  authenticated `approval:decide` authority, tenant resolution, an
  idempotency key, matching execution/approval identity, and matching
  execution reference, agent, version, and correlation.
- Migration `0017_runtime_approval_execution_binding.sql` adds the execution
  event approval link, the waiting-state check, the composite execution-to-
  approval foreign key, and the partial unique index on
  `(tenant_id, operation_key, execution_ref)`.
- The adapter serializes local request races and handles the SQL unique
  violation by re-reading the exact binding. Before a tool call it rechecks
  agent/version/policy/action/resource/payload/operation/execution binding and
  reserves the single-use approval.
- The controlled lifecycle is
  `PENDING → APPROVED → RESERVED → EXECUTING → EXECUTED`; tool errors are
  marked `FAILED`, and timeout/ambiguous outcomes are marked `UNCERTAIN`.
  Policy is re-evaluated before the effect.

## Verification

| Check                                     | Result                                                                          |
| ----------------------------------------- | ------------------------------------------------------------------------------- |
| `npm run typecheck`                       | PASS                                                                            |
| `npm run lint`                            | PASS                                                                            |
| `npm run build`                           | PASS; Vite transformed 163 modules                                              |
| `npm run build:harness`                   | PASS                                                                            |
| `npm run test:evals -- --reporter=dot`    | PASS; 1 file / 8 tests                                                          |
| Focused Phase 2 + structure suite         | PASS; 8 files / 43 tests                                                        |
| `npm run test:postgres -- --reporter=dot` | 13 files passed, 8 skipped; 81 passed, 103 skipped                              |
| `npm test -- --reporter=dot`              | 243 passed, 5 failed, 9 skipped; 1,696 passed, 12 failed, 105 skipped; 8 errors |

The full-suite failures remain the pre-existing controlled-worker/startup,
identity/IPC, continuous-worker-startup, and eight loopback HTTP-provider
areas. No new Phase 2 architecture failure remains after moving the adapter
out of the neutral package.

## Explicit limits

The restart check is process-local/restart-equivalent: a second adapter and
worker are constructed over the same in-memory authority. It does not prove a
real process restart, PostgreSQL transaction durability, RLS/grants, physical
recovery, or D5 fault-injected concurrency. Those gates remain `NOT_PROVEN`,
the maximum defensible durability level remains D2, and production remains
`NO_GO`.
