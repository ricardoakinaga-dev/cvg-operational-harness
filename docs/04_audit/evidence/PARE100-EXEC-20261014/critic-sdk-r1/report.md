**Scoped verdict: FAIL — approved SPEC0211 SDK stdio reliability/code review.**

Independent frozen-packet review; no inherited builder rationale, builder reports, worktree source/history, external reference, provider, network, database, or agent descendants. Repository governance documents were read only. User authorization for approved SPEC0211 is authoritative; the packet SPEC SHA-256 is `ae109b33a8457869d0939bb3f32557b8f8d5e8d5054fa1e141ab5c896b508a7f`. Writes are limited to this result directory and the explicitly authorized scratch copy. PublicAPI/pin integration and repository ledgers remain with the Lead.

The shipped focused tests pass, but the source has two contract defects below. These are source-backed findings with deterministic reproduction schedules, **not newly executed probes**. SDK-W07 remains OPEN: executable source/library tests and source export checks do not establish a successful compiled SDK consumer artifact.

**F01 — P1 — exhausting the lifetime ID budget can discard previously accepted requests.**

Location: [stdio.ts:536](/tmp/cvg-pare100-exec-20261014-6az3hlay/critic-sdk-packet/packages/sdk/src/stdio.ts:536), especially line 543; cleanup [stdio.ts:456](/tmp/cvg-pare100-exec-20261014-6az3hlay/critic-sdk-packet/packages/sdk/src/stdio.ts:456), and the late-completion check at line 488. Contract: ownership/limits item 3 requires refusal of new requests while preserving accepted requests; SDK-W03 is rejectable on this behavior.

Observation from source: the first request beyond `maxLifetimeRequests` sets `exhausted`, detaches input, then arms `setTimeout(finish, closeTimeout)` even though no host close or I/O failure occurred. `finish()` clears the accepted queue and closes the connection. An active dispatch that resolves after this timer is discarded at the `state !== 'OPEN'` check. The close deadline intended for explicit shutdown therefore becomes an unsolicited deadline for legitimate accepted work.

Reproducible synthetic schedule (NOT_RUN, because only shipped tests were authorized):
1. Configure `maxLifetimeRequests: 2`, `closeTimeoutMs: 15`, a valid server whose first dispatch is deferred, and writable output that otherwise completes normally.
2. Feed valid coalesced `hello(1)`, `hello(2)`, `hello(3)` frames. Request 1 is active; request 2 has already been accepted and charged; request 3 exhausts the budget and arms the timer.
3. Advance time by 16 ms without host close or I/O error. `closed` resolves and accepted request 2 is discarded.
4. Resolve request 1 with a valid correlated response. No response is written; request 2 never dispatches.

This is not ordinary rejection of request 3 and is not the explicit-close contract. The shipped preservation test [stdio.test.ts:368](/tmp/cvg-pare100-exec-20261014-6az3hlay/critic-sdk-packet/packages/sdk/src/__tests__/stdio.test.ts:368) uses an immediately resolving dispatch. The timer test at line 376 explicitly calls close and therefore does not check this loss. Required repair: refuse extra IDs without applying an implicit close deadline to accepted work; add a discriminating delayed-active/accepted-queued lifetime test, retaining the separate bounded host-close behavior.

**F02 — P2 — the real SDK server sends raw local exception messages to the peer.**

Location: [server.ts:418](/tmp/cvg-pare100-exec-20261014-6az3hlay/critic-sdk-packet/packages/sdk/src/server.ts:418); concrete throwing-hook entry at [server.ts:235](/tmp/cvg-pare100-exec-20261014-6az3hlay/critic-sdk-packet/packages/sdk/src/server.ts:235). The stdio path accepts and serializes the resulting error at [stdio.ts:490](/tmp/cvg-pare100-exec-20261014-6az3hlay/critic-sdk-packet/packages/sdk/src/stdio.ts:490) and line 495; the error-message predicate only checks size/type at [validators.ts:101](/tmp/cvg-pare100-exec-20261014-6az3hlay/critic-sdk-packet/packages/sdk/src/validators.ts:101). Contract: ownership/framing item 8 requires fixed, bounded local errors and forbids echoing hostile payloads.

Observation from source: `dispatch` maps an unexpected local `Error` to JSON-RPC `internal_error` using `error.message`. A message of 1..1024 UTF-8 bytes passes the response validator and is written verbatim by `serveStdioSdk`. It is a locally generated failure, not an original error received from a remote SDK peer.

Reproducible synthetic schedule (NOT_RUN):
1. Compose `createSdkServer` with valid keyless options and `newCorrelationId` that throws `Error('SYNTHETIC_HOST_SECRET')`.
2. Feed a valid stateless `turn.send` frame to `serveStdioSdk`.
3. The hook throws before the guarded harness execution; the server catch returns code -32603 and message `SYNTHETIC_HOST_SECRET`.
4. The adapter validates that envelope and writes the marker to the peer, rather than a fixed local internal-error message.

No actual credential exposure is claimed. The failure is the directly observable source path that allows arbitrary local exception text through. Required repair: sanitize unexpected locally generated failures while keeping the existing v1 codes and preserving original code/data only for errors actually received remotely. The adjacent `mapSessionError` branches that use local `error.message` at lines 155/157 need the same contract review. The shipped tests do not cover this throwing-hook marker.

**Executed evidence.**

Node `v22.23.2`; cwd `/tmp/cvg-pare100-exec-20261014-6az3hlay/critic-sdk-scratch`. Scratch was copied from the frozen packet and existing worktree `node_modules` only. All copied dependency symlink targets resolved inside scratch; no dependency installation or access to worktree code/history occurred.

```sh
PATH=/home/ricardo/.nvm/versions/node/v22.23.2/bin:$PATH CVG_TEST_SCOPE=core node node_modules/vitest/vitest.mjs run packages/sdk/src/__tests__/stdio.test.ts packages/sdk/src/__tests__/stdio-validators.test.ts packages/sdk/src/__tests__/pdsh-023-sdk.test.ts tests/consumers-sdk-session.test.ts tests/consumers-public-surface.test.ts tests/phase4-public-consumer.test.ts --reporter=verbose
```

Exit **0**; **6 files, 127 tests passed**, no skips reported; duration 4.22 s. Full raw console output is in [focused-tests.raw.log](focused-tests.raw.log); command arguments, exits, session completion, reads/copies and verification output are in [commands.json](commands.json).

| Shipped file | Passed tests | What the evidence establishes |
| --- | ---: | --- |
| SDK stdio | 62 | Real child plus stream framing, duplicate/typed IDs, bounds, backpressure, per-request uncertainty, terminal timeout, close/late completion, overflow and authority checks |
| SDK validators | 45 | Good results preserved; invalid version/capabilities/counters/usage/session/tenant/sequence/fingerprint/payload/envelopes rejected |
| Existing SDK v1 | 8 | Focused in-process v1 regression, session and minimal composition behavior |
| SDK session consumer | 3 | Synthetic source consumer and package-root imports |
| Public surface consumer | 7 | Source exports, source checker export names, public pins and deep-import refusal |
| Existing phase4 public consumer | 2 | Synthetic public harness composition and deep-import refusal |

The child integration is genuine: [stdio.test.ts:173](/tmp/cvg-pare100-exec-20261014-6az3hlay/critic-sdk-packet/packages/sdk/src/__tests__/stdio.test.ts:173) runs the fixed neutral child, checks hello/open/send/read, exact stop/result/counters/usage and six real session events. [child.mts:5](/tmp/cvg-pare100-exec-20261014-6az3hlay/critic-sdk-packet/examples/consumers/sdk-stdio/child.mts:5) composes `createSdk` with a deterministic keyless model and fixed host tenant; [index.mts:56](/tmp/cvg-pare100-exec-20261014-6az3hlay/critic-sdk-packet/examples/consumers/sdk-stdio/index.mts:56) spawns it. This is executable source integration, not a double-only transport test.

It is **not compiled artifact proof**: the test imports `index.mts`; that path spawns `child.mts` through `--import tsx` (index lines 55..61). Vitest aliases SDK roots to source. The public-surface test creates a TypeScript program with `noEmit: true`, enumerates source exports, and does not check compiler diagnostics or execute a compiled SDK consumer. The example README lines 17..20 explicitly leaves package builds and compilation/run of `child.mjs` to the Lead.

**Approved rejectable criteria assessment.**

| Criterion | Scoped status | Evidence / limit |
| --- | --- | --- |
| SDK-W01 | PASS within keyless source-child scope | Genuine child journey, kernel results and real session-store events |
| SDK-W02 | PASS for shipped cases | Fragmented multibyte UTF-8, CRLF/coalescing, malformed/oversized/partial EOF before dispatch |
| SDK-W03 | FAIL | F01 loses already accepted work when lifetime exhaustion starts an implicit shutdown timer; other shipped rejection/correlation cases pass |
| SDK-W04 | PASS for shipped cases | Per-waiter QUEUED/WRITTEN outcomes; terminal timeout; stuck write/explicit close deadline; late rejection observed; owner escalation/exit checks |
| SDK-W05 | PASS for shipped cases | Callback AND drain gating, write failure discards queue, full-result overflow mapped to -32081/UNKNOWN, assistant append failure remains UNKNOWN without replay |
| SDK-W06 | PASS for the exercised public-host paths | Real SDK ignores peer tenant/actor/budget/policy/approval/tool fields. Separate fixed host SdkServer adapter runs the real kernel for DENY/REQUIRE_APPROVAL with zero tool bodies; this is not a new peer-requested-tool method |
| SDK-W07 | OPEN / NOT_PROVEN | Existing focused v1/source imports pass; successful compiled SDK consumer and all required integrated gates are absent from this review |

Additive SDK exports, v1 protocol constant and method vocabulary remain present in the reviewed source. Passing source tests do not prove all public API compatibility, complete functional parity or packaging.

**NOT_RUN, explicitly.**

- New critic scripts/probes/tests, including F01's delayed lifetime trace and F02's throwing-hook marker: prohibited by the run boundary; findings are static.
- Successful compiled SDK package/consumer artifact, `child.mjs` execution, public workspace build or standalone compilation: not a shipped focused test in this authorized run; SDK-W07 stays open.
- Repository-wide typecheck, lint, unit/coverage, PostgreSQL, E2E, build/check-boundary, wire snapshot/replay, certify, SBOM and licenses checks.
- External reference/differential execution, provider/network/database, real data or effects.
- No repository edits, commit, push, deploy or release; no agent descendants.

**Integrity and handoff.**

Sentinel SHA-256 before and after: `e13ec292b922c313f76b6d8551d025af8e2bc2d484be96f48477b87de5965627`. Both verifications matched all **1,070** packet files with zero missing/extra/changed files; the sentinel file itself is unchanged. All 1,070 copied packet files in scratch also retain their sentinel hashes after testing. See [sentinel-before.json](sentinel-before.json) and [sentinel-after.json](sentinel-after.json).

Lead next action: resolve F01/F02, obtain discriminating regression evidence in an authorized builder lane, then re-review the frozen replacement and complete compiled consumer/integrated SDK-W07 evidence. This verdict grants no acceptance of all 36 tasks, full functional parity, unrestricted production, or release.

