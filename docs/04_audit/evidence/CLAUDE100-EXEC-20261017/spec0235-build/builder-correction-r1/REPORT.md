# R1-06 — trusted bootstrap correction

**IMPLEMENTED — independent review PENDING. No DONE or approval claim.**

Changed only:
- `tests/claude100/reference-port/bootstrap.mjs`
- `tests/claude100/reference-port/bootstrap.test.js`
- `scripts/claude100-reference-port.mjs`

22/22 Node22 pure synthetic filesystem tests PASS, zero failures/skips. Scoped lint and format checks exit0. Exact commands/status: [result.json](result.json). [Unit log](procedures/unit-final.log). [Source hashes](source-manifest.json).

ABI: fixed20sources include bootstrap itself; fixed sorted12builtins; `{root,pins,entries,totalBytes,builtinAllowlist,dispose}`. Each of40pins returns JSON metadata `{path,sha256,bytes,stat}`. `dispose` requires pins closed, checks known children and retained identities before removal, closes directory handles even on refusal, and caches its result for idempotence.

CLI statically imports only bootstrap and Node URL. After freezing and verifying pins, it dynamically imports the one fixed snapshotted controller and calls `runProbe(options,graph)`. Import/entry failure closes pins then disposes; successful controller return/publication triggers no fallible cleanup IO. Usage parsing remains inert.

A declared synthetic helper import verified that copied modules resolve copied bytes after an original helper mutation. Tests also cover symlink/traversal/private modes, identity rebinding, original/copy drift, exact1MiB/+1, partial-error FD cleanup, and refusal to remove unknown/substituted children.

No real probe CLI/main/controller execution, native/Claude, Docker/container, HTTP/network, provider/model/account, PG/E2E/certify/full gates or descendants. Other five findings and independent judgment remain with Lead. Unconfirmable identity/removal fails and can leave private partial evidence; no malicious-host atomicity claim.

Frozen correction contract SHA256: `4b1cb1d9d3b7bafd2bdb0638f3eccbbc9d79807346fe836fe6500c608c02b7af`.
Approved SPEC SHA256: `aaa12b3ee55021e357fc9a17518316135eb4ca423b87215af754cd18dbb41f04`.

Next: Lead take ownership, integrate R1-06 with its R1-01..05 repairs, freeze final sources and obtain fresh independent re-review before any actual launch.
