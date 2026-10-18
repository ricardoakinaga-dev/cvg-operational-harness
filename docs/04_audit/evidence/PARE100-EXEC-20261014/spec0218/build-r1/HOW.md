# SPEC0218 BUILD handoff

Implemented the 14 planned files in `packages/sdk/python/` under explicit approval
of SPEC SHA `3ac5f37484c09c1d7d7419eb3a68e896e011f557e90aaca34bff5752887fd10a`.
No SPEC, TS SDK, contracts, harness, manifests, lock, scanner, root, frozen
certification checkout or ledgers were edited. Lead owns canonical updates.

`candidate-files.json` fixes all source hashes; `handoff.json` and
`acceptance-map.json` separate focused execution from outstanding integrated
gates and independent BUILD acceptance. `baseline.json` captures the approved
inputs; `mechanical-checks.json` reports21 unchanged input hashes and30 final
Node child exit/stream/home cleanup records. These are builder checks.

The final focused run passed47 tests (33 unit +14 real compiled Node interop),
zero failures/errors/skips, CPython3.12.3/Linux selector and Node22.23.2.
`focused-final.command.json` contains exact argv/cwd/exit/time and raw-stream
hashes; `.stdout.log` is honestly empty, `.stderr.log` holds raw unittest output
including two slow-callback diagnostics. Earlier successful runs are historical
and retained; only `focused-final` corresponds to the final source candidate.

Reproduce without installing/building or touching the Lead's broad gates:

```sh
python3 -I -S -B packages/sdk/python/tests/run.py --suite all \
  --node /home/ricardo/.nvm/versions/node/v22.23.2/bin/node \
  --evidence-dir docs/04_audit/evidence/PARE100-EXEC-20261014/spec0218/build-r1/review-rerun
```

Use a fresh evidence destination; do not overwrite the frozen final-run files.
Runner artifacts and private child homes stay under that destination. No
network/provider/real data or arbitrary child command is involved. Client
library owns neither FDs nor processes; runner owns only its fixed synthetic
fixtures and the explicit attached-example subprocess.

Inspect `focused-final/public-ts-oracle.json`: all9 fingerprints and catalog,
methods/errors/STOP_REASONS match public compiled exports; all9 event types
validate including Gregorian year0000. The near-cap probe explicitly shows a
TS-valid event rejected by the approved conservative Python size bound.
`focused-final/cross-language-transcripts.json` binds four complete raw wire
logs with byte lengths/hashes and the exact typed ID mapping. Comparison never
changes payloads/events/order/counters or uses numeric tolerance. Python uses
real OS pipes across a Node process boundary. The fresh TS comparison uses
both public stdio adapters over byte streams inside its own Node process.

Model execution and zero-retry invariants are exercised against the real
kernel/store. Final Node metadata stores bounded raw stderr head/tail as base64,
including server counts and integral assistant size; no real credentials are
involved. TERM/KILL tests verify only owned children; no private home remains.

Next: Lead freezes source/evidence, requests fresh independent BUILD review,
then runs its integrated public API/scanner/type/lint/unit/PG/E2E/certification
gates under its own claims. PY09/PY10 remain pending; this worker does not
self-accept or close P100-025. Keep original reference SDK parity, remote
resume/cancel/notifications/streaming, other platforms/transports, and packaging
obligations open. Only the actually tested runtime/platform is claimed.
