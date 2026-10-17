// `@cvg/policy` is a thin legacy layer for the `@cvg/agent-core` autonomy and
// approval commands: `evaluatePolicy` (turn autonomy + risk), `ApprovalService`
// and the clinical-boundary guard. It is NOT a second capability-authorization
// engine. The single canonical `PolicyEngine` (capability catalog, grants, role
// ceilings, versioned documents) lives in `@cvg/policy-engine`. New consumers
// should import authorization from `@cvg/policy-engine`; keep imports here only
// for the turn-autonomy / approval-command surface. See
// `docs/architecture/PUBLIC_API.md` (PDSH-002) and ADR-005.
export * from './approvals/approval-service.ts'
export * from './policy-engine.ts'
export * from './policy-version.ts'
export * from './safety/clinical-boundaries.ts'
