IMPLEMENTED — bounded T2 legacy test-contract migration in `/home/ricardo/cvg-candidates/hiso005-integrated-20261018`.

Changed only `tests/pare100-sdk-boundary-qualification.test.js` and `tests/pare100-compiled-kernel-boundary.test.js`. Preserved **92 runtime variants (62 compiled + 30 SDK)** plus the existing static historical-table seal: **93/93 PASS**, zero failed/skipped/todo. The initial 93-versus-92 observation is reconciled by that additional static seal; nothing was removed or added to the testcase denominator.

The first real post-public-build red is `first-red-public-build.json` / `.log`: **72 FAIL / 21 PASS**, exit1, before source edits. `first-red.log` retains a preceding private-config startup failure (wrong .ts extension; corrected to actual .mts without editing tests). Public SDK/persistence/channel/model-gateway build record is preserved in `public-build-record.json`. All later iterations and command exits remain alongside those files.

The 0228 oracle keeps every group inactive, all raw inventories (59 SDK, 25 compiled) and every attack variant. Default=strict is full report equality; explicit exceptions:true adds the exact UNAPPROVED_EXCEPTION_REQUEST refusal and retires nothing. Private repins and reason/path/line/expression mutations leave diagnostics intact; exact expression changes, duplicate multisets, unlisted sites, physical-link refusals, product/env FAIL and unresolved/installed unknown witnesses stay asserted. Copied checkers add only boundary-installed-identity.mjs to their prior four helpers; no semantic engine or compiled helper is copied.

[All case IDs/assertions](case-preservation.md), [machine matrix](case-preservation.json), [reviewable patch](test-diff.patch), [source hashes](source-hashes.json), [command/exits](verified-focused-command.json), [staticchecks](focused-static-checks.json), [self-review](self-review.json), [verification](verification.json).

Final focused run uses pinned Node 22.23.2 and the actual source TypeScript compiler/config, private cache/TMP. Exit 0; all actual default dependencies/tests/compiler/config stayed identical during that run. A concurrent change in the unused peer boundary-semantic-compiled.mjs is explicitly recorded and is not covered by this default-path result. The default checker hash was `a3893ca1c5f4e440532a40a0edf532e99b92e390de8796ecbe6745e9af4e0503`.

All 63 protected candidate specs/catalogs/pins retain their initial hashes; the historical table array is byte-exact to root (38,027 bytes, SHA256 614d036a02bb6884a349a5c7d68bc613e453aa112411e52fec66cf7e7c1873af). Root approved 0236 hash cf07fd5d is intact. Original root test files still equal lane preimages. ESLint, Prettier and Git diff whitespace checks exit 0 on the two owned files.

Remaining risks: Lead's subsequent checker wiring/freeze wrappers need fresh composed verification; independent review and complete gates are Lead-owned and pending. No new trust/B6/production acceptance is claimed. No descendants, broader gates,PG/E2E/certify/SBOM/licenses/install/network/Gitindex/commit/rootpromotion. Root ledgers/coordination remain readonly for Lead updates.

Next action: Lead reviews the exact two-file delta and93-row matrix, composes checker wiring and runs the required gates before any promotion. Evidence checksum manifest is `evidence-manifest.json`; its SHA256 is in `EVIDENCE.sha256`.
