# Private synthetic model fault server

SPEC0232 / PAR-Q04-FAULTS-001. This is a private test package outside the
workspace packages. It uses Node 22 HTTP on `127.0.0.1:0`; it never proxies,
resolves an upstream, calls a model, or installs global mocks. Q03 owns all
canonical JSON, digests and suite manifests. This package adds no engine,
approval, journal or production security policy.

`createModelFaultServer(plan, options?)` accepts the exact version-1 plan in
`index.d.ts`. `options` contains only `mode` and `recording`; replay is the
default. The seven fixed recipes are `ok-json`, `rate-limit`, `timeout`,
`disconnect`, `invalid-json`, `chunked-json` and `synthetic-sse`. IDs follow the
Q03 identifier alphabet, with 1–128 ASCII characters. No callbacks, URLs,
request strings, credentials or response bodies are configurable.

The request must match the native OpenAI adapter's **exact wire bytes**:
`JSON.stringify({model,messages,temperature,max_tokens,stream})`, including
`{role,content}` order inside the single message. Use
`expectedSyntheticRequest(plan)` for the values, rebuilding this insertion
order when using a raw HTTP client. The request digest is Q03 `jsonDigest`
of that known document; byte equality additionally rejects duplicate keys,
whitespace variants and hidden prompts. Rejected payloads and headers never
enter history or recordings. Only the three SPEC0232 auth sentinels are
admitted; the positive provider/gateway tests use no authentication.

The instance exposes a real URL, frozen detached `requestHistory()` and
`state()` snapshots, `recording()`, and an idempotent `close()` Promise.
Every instance owns its sockets/timers, expires after five seconds, and joins
actual listener/socket closure and active handlers with a five-second cleanup
deadline. Unexpected interruption prevents recording and remains the primary
error on close. `preservePrimaryError` retains both primary and cleanup
failures through an AggregateError when both exist.

Record/refresh require `maxRequests:1` and a completed real exchange. Their
factory entrypoints inspect the current enumerated credential environment
internally before listen; no snapshot override is accepted. The separately
exported `assertSyntheticEnvironment(snapshot)` is a pure guard for tests.
Replay never inspects host credentials. `recording()` before completion,
after rejected traffic, or after an unexpected interruption fails. Captured
chunk boundaries are successful application writes, not TCP packet or fetch
read boundaries. Delay fields are bounded scheduled delays, not wall-clock
measurements. SSE is synthetic protocol evidence only, with no provider
streaming or parity claim.

`persistSyntheticRecording(recording, {evidenceRoot,path,mode,previousDigest})`
is separate from HTTP. It guards the current environment before filesystem
access, validates the recording against the finite local recipes, and uses
exclusive mode-0600 creation. `evidenceRoot` must already be a private,
UID-owned directory strictly below the process's temporary directory. Relative
path components use the Q03 ASCII alphabet and at most 128 bytes. Directory
components are opened with no-follow directory FDs; files and symlinks are
refused where inappropriate. This private implementation requires Linux
`/proc/self/fd`, as on the registered build host; it is not a portable
filesystem sandbox against a process with the same user privileges.

Record requires `previousDigest:null`. Refresh requires the previous envelope
digest, validates the entire canonical file bytes (`canonicalJson(record)+"\n"`),
and creates `<original>.refresh-<new-full-digest>.json` beside it. It never
rewrites the historical file. Duplicate JSON keys, noncanonical bytes, special
files, unowned directories, traversal, symlinks and collisions are refused.
Persistence accepts only single-exchange factory recipes; a recording's full
plan digest cannot be changed to increase replay request count. Default replay
without an input recording supports up to 32 identical known requests.

Tests use a static child file with explicitly constructed minimal environment,
private HOME/TMPDIR and finite deadline for actual record/refresh. The host's
credential values are never logged or copied into that child. No installation,
PostgreSQL, E2E or certification is needed for these focal tests. MF07's full
gates and independent judgment remain the Lead's responsibility.

The native timeout outcome is intentionally preserved: direct provider timeout
is `timeout`; ModelGateway's own earlier AbortController deadline currently
becomes `cancelled`. Rate-limit, disconnect and invalid JSON map respectively
to `provider_rate_limited`, `provider_connection_reset` and
`provider_malformed_response`. No public source is changed to fit a test.
