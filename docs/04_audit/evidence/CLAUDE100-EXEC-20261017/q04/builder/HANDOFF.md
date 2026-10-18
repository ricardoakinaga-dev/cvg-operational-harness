# PAR-Q04-FAULTS-001 — IMPLEMENTED

Builder delivery only; no DONE, approval, parity, integration or release verdict.
Base `d80e9bb8026fdd6d5baf4172a3d6dda0d5c533e9`, frozen SPEC0232
`8f8ecd2934fd3dbfd7b82141efb6a97e2a653782eefe10ef8c177b01a408fe93`.
All 9 qualified Q03 inputs and 5 provider/gateway recon inputs match after work;
see `source-sentinel.json` (15 matches including SPEC).

Eight new files exclusively in the delegated paths, with exact paths/bytes/SHA256
in `source-manifest.json` and full additions in `implementation.patch`. No commits,
index changes, descendants, installs, source emits, root writes or other candidate
source edits. SPEC was already copied by Lead and remains unchanged. Lead owns
all root ledgers, docs, recon, independent review, integration and general gates.

Implementation uses the existing Q03 canonical JSON/digest/manifest helpers.
Separate contract, HTTP lifecycle and exclusive persistence modules isolate the
small failure boundaries. Finite fixed recipes avoid an arbitrary HTTP callback,
proxy, provider or parser engine. Strict native request byte equality also
prevents hidden duplicate-key prompts; this is additional wire validation, not
a replacement canonicalizer. The static child probe does not import Q01.

| MF | Current builder evidence | Limit / next owner |
| --- | --- | --- |
| MF01 | Real loopback TCP, real OpenAICompatibleProvider and ModelGateway; normal and split-multibyte JSON, usage 3/2, real events; no fetchImpl/mock in positive path. | Independent critic/Lead judge. |
| MF02 | Public provider kinds rate_limited/timeout/connection/malformed_response; gateway codes provider_rate_limited/cancelled/provider_connection_reset/provider_malformed_response; maxRetries 0, one attempt. | Existing gateway timer abort maps to cancelled, unlike direct provider timeout. Public source unchanged. |
| MF03 | Scrubbed child records and replays all seven scenarios, compares actual received bytes and observed recording, preserves split UTF-8 write boundaries, order and termination. Tampered byte/base64/ordinal/order/delay/status/header/termination/digest/extra inputs rejected, including rehashed envelopes. | Application write boundaries and scheduled delays, not TCP segmentation or timing precision. SSE synthetic only. |
| MF04 | Pure guard tests all 13 enumerated credential names/getters. Actual factory + persistence guard negative in a child with fake credential; actual positive record/refresh in a minimal clean child. Exact request wire rejects duplicate keys, free prompt, false synthetic declarations, auth sentinels outside whitelist, unknown plan/URL/options/getters/prototypes. No host values copied to child. | Finite private fixture guard, not a production credential detector or policy change. |
| MF05 | 32 requests/+1, plan max delay/ID exact/+1, 64KiB/+1 including actual chunked receiving path, cancellation, partial-header autonomous lifetime, real listener closed, zero tracked sockets/timers/handlers, same idempotent Promise, unexpected chunk interruption retained as primary error and not recordable. Pure primary+cleanup AggregateError ordering checked. | OS-level server.close/FD-close failure was not induced; dual-failure assembly has a pure unit test. Trusted fixed recipes are much smaller than response/chunk caps; oversized recording attempts are rejected rather than admitted as arbitrary payloads for load testing. |
| MF06 | Default replay; explicit live record/refresh; exclusive record and sibling collision refusal; old bytes compared unchanged; exact previous envelope digest plus complete canonical byte roundtrip; duplicate fields/whitespace/missing newline rejected; traversal/symlink/unknown inputs rejected. Directory FDs/no-follow opens and regular-file/UID checks enforce private local paths. | Persistence requires Linux /proc/self/fd and pre-existing private owned temporary evidence root. It is not a sandbox against same-UID processes. No crash/disk-error injection. |
| MF07 | Current Node22 focal suite 202/202 (40 new +162 Q03), no skips; project no-emit typecheck, focal lint and format all exit 0. | NOT_RUN here: full suite, PG, E2E, certify, SBOM/licenses, independent review. Q01 claim remains active; Lead must schedule full gates and judge separately. |

Commands, cwd, exits and historical failed attempts: `commands.json`. Final raw
outputs: `logs/focal-regression-final.log`, `logs/typecheck-final.log`,
`logs/lint-final.log`, `logs/format-final.log`. Empty lint/type logs are normal
successful tool stdout. Early failed debugging logs remain intact and are not
represented as current evidence. No independent review rework round used yet.

The initial CLI Vitest invocations unexpectedly wrote their default private
candidate dependency-cache results file and config-bundle temporary directory.
No root or Q01 cache was touched. This was outside the intended builder temp
destination; disclosed rather than silently cleaned or restored. Exact known
cache path/hash/mtime is in `tool-cache-side-effect.json`. Final verification
uses `run-focal.mjs` under builder temp with own cacheDir, test cache disabled
and native config loader. Lead can decide whether to remove candidate-local
cache outputs; no application/workspace config was edited for this workaround.

Static subprocess entrypoint uses explicitly constructed HOME/TMPDIR/LANG/TZ,
no host env spread, and a 12-second child deadline. Each owned server retains
its independent five-second lifetime and five-second cleanup bound. Every probe
in this delivery completed and joined before return. All generated test inputs
are synthetic, including the deliberately malformed historical-file controls.

Next action: freeze the eight source hashes for the independent critic, then
Lead handles any bounded rework and later full gates under its own claim.
