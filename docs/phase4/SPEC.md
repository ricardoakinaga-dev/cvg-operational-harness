# Phase 4 — Technical Specification (AAA-41)

## 1. Architecture decision

The capability boundary is a governed socket, not an appliance. The neutral
contracts package defines the stable data and execution ports. The harness
package owns the immutable registry and the one adapter into the existing
`ToolRegistry` runtime port. Product/platform packages may create explicit
registrations, but they are not dependencies of Core.

The existing `@cvg/platform` `PluginRegistry` and `CapabilityGateway` remain a
product/platform boundary. AAA-41 does not duplicate their authority or import
them into `@cvg/harness`; the new neutral boundary is the seam for future
adapters and controlled conformance tests.

## 2. Neutral contract

The following types are added to `@cvg/harness-contracts`:

```ts
type CapabilityOrigin = 'core' | 'skill' | 'plugin' | 'knowledge' | 'mcp'

interface CapabilityDescriptor extends ToolDescriptor {
  origin: CapabilityOrigin
  providerId: string
  providerVersion: string
}

interface CapabilityImplementation {
  validateInput(input: unknown): boolean
  execute(input: unknown, context: ToolExecutionContext): Promise<ToolResult>
  validateOutput(output: unknown): boolean
}

interface CapabilityRegistration {
  descriptor: CapabilityDescriptor
  implementation: CapabilityImplementation
}

interface CapabilityRegistry {
  register(registration: CapabilityRegistration): CapabilityRegistry
  listDescriptors(): readonly CapabilityDescriptor[]
  resolveDescriptor(
    id: string,
    version: string
  ): CapabilityDescriptor | undefined
  compositionFingerprint(): string
}
```

`inputSchema` and `outputSchema` are bounded JSON metadata. Validation is an
implementation port because the neutral package must not acquire a schema
framework dependency. The implementation receives a cloned bounded input and
the adapter returns a cloned bounded result.

## 3. Registry rules

- Registration is immutable: `register` returns a new registry.
- IDs, provider IDs, versions, descriptions, and schemas are bounded and
  validated; cycles, functions, symbols, non-finite numbers, unsafe object keys,
  and unsupported prototypes are rejected.
- `id + version` is unique. Duplicate registration throws.
- `resolveDescriptor` and the runtime adapter require an exact non-empty
  version. Missing versions and `latest` never select an implementation.
- `listDescriptors` returns detached descriptor snapshots without handlers.
- The adapter requires `validateInput`, `execute`, and `validateOutput` to
  return safe results. Invalid input/output/result status becomes `REJECTED`.
- The registry fingerprint is SHA-256 over canonical sorted descriptors and
  provider identity only; it excludes executable function bodies and payloads.
- Origin is descriptive metadata. It does not alter policy, approval, tenant,
  effect, or audit authority.
- Executable implementations are held in a module-private registry store. The
  `ToolRegistry` adapter is an internal composition-root operation and is not
  part of the public capability contract or package entrypoint.

## 4. Runtime composition

`createOperationalHarness` accepts either the existing compatibility `tools`
port or a `capabilities` registry, never both. When `capabilities` is present,
the factory creates the sole internal adapter, requires an explicit effect
journal, and passes the journaled adapter to both Runtime V1 and Runtime V2.
The returned harness exposes the immutable `capabilityFingerprint` for evidence
and composition inspection.

The fingerprint is injected into the runtime input, approval proposal payload,
effect proposal hash, and iterative checkpoint state. Durable submissions carry
the same fingerprint so a worker cannot resume an execution with a different
capability composition.

The execution chain remains:

```text
origin registration
  -> capability descriptor/implementation validation
  -> exact-version registry resolution
  -> Runtime decision validation
  -> Policy
  -> Approval when required
  -> Effect Journal / durable execution path
  -> adapter execution
  -> output validation
  -> Audit and Telemetry
```

The compatibility `tools` option remains available for Phase 2/3 consumers.
External capability composition must use the capability registry. Single-pass
tool selection also enforces the agent profile allowlist so a requested tool
cannot bypass the declared profile.

## 5. Origin adapters

Origins are explicit registrations, not loaders:

- `core`: a native deterministic capability.
- `skill`: a capability declared by a Skill-owned integration; Skill text has
  no execution or policy authority.
- `plugin`: a locally registered adapter; no remote install or discovery.
- `knowledge`: a retrieval/data capability; returned content remains untrusted.
- `mcp`: an optional simulated adapter in tests only; no MCP client or network
  dependency is part of Core.

All five are expected to produce the same descriptor and governance behavior.
Only the implementation/provider identity and observable synthetic output may
vary.

## 6. Failure and durability

The boundary rejects invalid registration and resolution before execution. The
Runtime retains ownership of operation identity, budgets, policy, approvals,
effect fencing, pause/resume, checkpoints, tenant context, audit, and
telemetry. No new persistence table or authority is introduced by this slice.

The composed proof must cover confirmed replay, uncertain outcomes, approval
binding, provider swap, tenant mismatch, version drift, concurrent callers,
and restart-equivalent construction through the existing effect journal.

## 7. Compatibility and rollback

Existing callers that pass `tools` continue to use the previous runtime path.
The Phase 4 path is opt-in through `capabilities`. Rollback is removing the
capability option and retaining the existing `tools` port; no migration or
external service rollback is required.
