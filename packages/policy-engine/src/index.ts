// `@cvg/policy-engine` is the single canonical capability-authorization
// engine (capability catalog, grants, role ceilings, versioned documents).
// The runtime `PolicyEngine` type in `@cvg/harness-contracts` is a port; this
// class is one implementation of the same domain, adapted by the host
// compositor (see `docs/architecture/PUBLIC_API.md`). The separate
// `@cvg/policy` package is a thin legacy layer for autonomy/approval commands
// in `@cvg/agent-core`, not a second engine.
export * from './profile.ts'
export * from './reference-profile.ts'
export * from './documents.ts'
export * from './engine.ts'
