# Builder E — IMPLEMENTED, independent acceptance pending

SPEC0211 is unchanged at SHA-256
`ae109b33a8457869d0939bb3f32557b8f8d5e8d5054fa1e141ab5c896b508a7f`.
Authorization is the Lead's `t3-user-approval.json`. This is a bounded SDK
implementation, not closure of the 36-card/eight-phase user goal.

The stdio adapter implements strict UTF-8/LF JSON-RPC v1, correlated validators
before pending settlement, per-request uncertainty, terminal timeout, typed
IDs with lifetime bounds, frame/queue/byte caps, serialized callback/drain,
bounded close and explicit ownership. `SdkWireError` preserves remote code/data
and marks any attempted write as unknown, with no retry. The existing four
SDK methods and in-process transport remain. Dispatch uses own properties.

Changed paths:

- `packages/sdk/src/stdio.ts`, `validators.ts`, `client.ts`, `server.ts`, `index.ts`
- `packages/sdk/src/__tests__/stdio.test.ts`, `stdio-validators.test.ts`
- `examples/consumers/sdk-stdio/child.mts`, `index.mts`, `README.md`
- This `builder-e/**` evidence only.

Node22.23.2: **115/115 tests in 3 SDK files**, focused no-emit typecheck and lint
passed. Formatting passed. Raw commands, exits, stdout/stderr and SHA-256 are
in `commands.jsonl` and per-command JSON/logs. `source-manifest.json` freezes
the ten changed sources; `evidence-integrity.json` checks raw log hashes and
identifies actual empty logs without fabricated output.

The real shipped source child performs hello/open/send/read with createSdk,
kernel, session event store and a keyless deterministic model. A stubborn child
test verifies owner-only TERM/KILL escalation, exit and stdio closure. Source
examples use `.mts` to declare ESM without changing any package manifest.

Known-bad result/envelope/event/ID/payload fixtures reject. Tests also cover
multibyte fragmentation, frame/queue/lifetime limits, callback-before-drain
and drain-before-callback, terminal/queued timeout and late completion,
overflow after dispatch, a fallback envelope too large to fit, and executed
model followed by assistant append failure (UNKNOWN/retrySafe=false).

For SDK-W06, real createSdk proves peer identity/governance/tool fields are
ignored. v1 has no requestedTool/orchestrator wire parameter; a test host
SdkServer adapter composes a fixed neutral tool with the real public kernel,
proving DENY and PENDING approval execute zero bodies. There is no new v1
parameter or host option. The independent critic must assess this evidence.

Failures are preserved: first-check fixture scheduling/CJS/type/lint issues,
the incorrectly sized overflow fixture, and the final stderr fixture which
previously inspected logs before child shutdown. The measured boundary is a
128-byte request and 131-byte overflow envelope (ID50). The complete child
stderr includes its fixed EOF transport notification. Capacity recovery is
recorded as USER_REPORTED_TRANSIENT_INFRASTRUCTURE; the builder did not receive
the provider's raw error and does not invent one or infer approval from it.

Lead integration required before independent acceptance:

- Wire additive values `SDK_TRANSPORT_ERROR_CODES`, `SdkWireError`,
  `createStdioSdkTransport`, `serveStdioSdk` into PUBLIC_API/public-surface pins.
  Add type records for `SdkWireErrorKind`, `StdioTransportOptions`,
  `StdioSdkTransport`, `StdioServerOptions`, `StdioSdkServer` as appropriate.
- Run the existing public workspace builder for `packages/sdk`; compile the
  `.mts` example to `.mjs` against actual public package exports, without source
  aliases, then run the compiled child roundtrip. Builder E did not emit into
  harness/contracts/other lane paths or alter manifests/configs/dependencies.
- Integrate frozen wire snapshots/replay and execute broad unit/coverage,
  PostgreSQL, E2E, build/boundary and applicable certification gates under Lead
  claims. SDK-W07 remains PARTIAL with these checks NOT_RUN_BY_BUILDER.
- Obtain fresh independent code criticism, reconcile any findings, update
  shared ledgers/backlog/coordination, and preserve the full goal/release bars.

No independent PASS, DONE, parity PASS or release is claimed. No commit,
push, deploy, real data/effect, provider/network, root/reference change or
descendant/model override was performed by Builder E.
