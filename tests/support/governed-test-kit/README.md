# Private governed test kit (SPEC0230)

Private ESM test support, outside npm workspaces. All consumers import
`tests/support/governed-test-kit/index.js`; TypeScript uses `index.d.ts`.
No application exports, install, filesystem, network, process or service helpers.

`RecordingAudit` and `RecordingTelemetry` retain references by default, as the
conformance sinks did. Optional `copy` and `onAppend`/`onRecord` callbacks are
injected; copy happens before append, and the hook runs after append. Failures
propagate. Replay explicitly injects `replayJsonClone`, which remains exactly
`JSON.parse(JSON.stringify(value))`. This historical, lossy clone is **not**
strict validation. `fixedClock(ISO)` returns fresh Dates; `sequenceIds(prefix,
start = 0)` returns local increasing IDs, starting at `start + 1`. Neither changes
global clocks, timers, IDs or fetch. There is no policy/approval implementation,
default ALLOW, runtime builder or grant in this package. Callers compose real
runtime/SDK factories and supply governance ports explicitly.

`normalizeLog(events, policy = [])` returns detached, frozen `raw`, `policy` and
`projection`, plus SHA-256 `policyDigest` and `projectionDigest`. Empty policy is
identity. Rules are closed objects:

```js
;[
  { field: 'eventId', mode: 'id', namespace: 'event' },
  { field: 'correlationId', mode: 'id', namespace: 'correlation' },
  { field: 'traceId', mode: 'id', namespace: 'trace' },
  {
    field: 'occurredAt',
    mode: 'timestamp',
    value: '2026-10-17T12:00:00.000Z'
  }
]
```

Only these direct properties of each event envelope may be selected. No nested
path, wildcard, regex selector, deletion or recursive field search is accepted.
Absent fields stay absent; selected IDs must be nonempty strings, and selected
times must be canonical ISO UTC strings. Within each declared namespace, IDs
map bijectively to `id:<namespace>:<ordinal>` in encounter order. Equality and
distinction survive, including across fields sharing a namespace. New calls
start fresh maps. Repeated fields and unknown/conflicting modes fail. Object
key order does not affect digests; event and policy rule order remain significant.
Session `timestamp` is deliberately not an allowed rewrite: replay still compares
its exact transcript using injected identities/time. A projection is for
comparison only; effect/authority evidence must use the raw runtime output.

`createSuiteManifest` validates a closed synthetic inventory:

```js
{
  formatVersion: 1,
  id: 'synthetic-suite',
  version: '1.0.0',
  synthetic: true,
  cases: [{ id: 'recorded-turn', family: 'sdk' }]
}
```

The result is `{ manifest, digest }`, detached and frozen. Nonempty IDs/families
use letters, digits, dots, underscores and hyphens, starting with a letter or
digit; versions use three nonnegative integers without leading zeroes. Duplicate
case IDs, empty cases, unknown fields, non-synthetic declarations, and result or
parity claims fail. Case order is significant. A manifest grants no PASS.

`canonicalJson` and `jsonDigest` use sorted object keys and preserve array order.
Strict boundaries accept only plain JSON data (including null-prototype objects)
and reject cycles, unsupported values, nonfinite numbers, sparse/extended arrays,
symbols, accessors, hidden properties, custom prototypes and prototype-sensitive
keys (`__proto__`, `constructor`, `prototype`). Getters/toJSON are not invoked.

Real consumers: the three-runtime conformance suite records real audit/telemetry;
replay uses the original governance engines and exact goldens; the SDK consumer
test records a public in-process SDK turn with injected clocks/IDs. The kit's
adversarial tests cover TK02–06; focused regressions and frozen input hashes cover
TK01/TK07. Global T2 gates, independent review and TK08 belong to the Lead.
