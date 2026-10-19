# Comparer lane handoff — SPEC0234

Implementation handed to Lead for freeze and selective staging. This report is builder evidence, not independent approval or closure of HISO-005/B6. No commit, subagent, dependency/lock change, runner/wiring edit, shared controller edit, real data or network/provider operation was performed by this lane.

Owned candidate paths, now released to Lead:

- `scripts/boundary-installed-identity.mjs` — SHA256 `3d282e4f9a54ecd5668fdfb4d9d0e80c9f699b65b4495bfeaf368233b040d5cf`.
- `tests/b6-0234-installed-identity.test.js` — SHA256 `ce4feeafbdc2b36a392e34106dafd3b4aadfb2614ea6a4dd59db9ce58b24bddb`.

Candidate: `/home/ricardo/cvg-candidates/hiso005-0234-20261017`; starting HEAD `f11f762f6a176417a40d2d53bdb67c633d7e1cef`. Normative SPEC SHA256 `b33aff4d1d1e36d64dd97298bc73d1c058220776c349e6704478303ef8a9c76d`; shared build-contract.md remains authoritative. No edits are planned after this handoff; Lead may freeze/commit the two paths selectively.

Exports: synchronous `canonicalJson`, `sha256File`, `fingerprintResolution`, `fingerprintToolchain`, `collectPackageInventory`, `createInstalledIdentityComparator`, plus `INSTALLED_IDENTITY_LIMITS` and typed `InstalledIdentityError`. Comparator takes exact physical package context and lock key, returns mutable identity objects, and `finalize()` revalidates actual receipt/config/lock/toolchain/package bytes and invalidates previously returned objects. No method emits verified:true. Structural options fail explicitly; bad receipts cannot MATCH. Package output has no timings or inode metadata. See api-note.md for inventory/error/partial-frontier details.

Fixed caps apply across the comparator lifetime to combined unique physical inventories on both sides, including partial collection usage; package size caps remain individual. Streaming reads use bounded buffers, no-follow/nonblocking opens and before/after inode/type/mode/size/time checks. Actual pinned npm fingerprint reproduces the preparation's component-wise path ordering over all 1964 files; pins were not changed. Only test collection can lower limits/use synchronization hooks; comparator/CLI have no elevation or pin bypass.

Executed in Node22.23.2: **78/78 focal tests passed**, zero skips/todo; scoped ESLint, Prettier check and Node syntax check passed. Exact argv, timestamps, exit codes, log digests and both source hashes are in checks-r5.json; raw outputs are focal-r5.log, lint-r5.log, format-r5.log and syntax-r5.log. All four original focal files are byte-identical to HEAD (original-test-preservation.json); this lane did not execute their 156 regressions.

Controls primarily cover ID-01–06/10–11: complete equal synthetic content; body/hidden/unknown/extra/missing/type/executable-bit/name/version divergence; malformed/missing installed manifests; canonical/digest/schema/recipe/TCB failures; root alias/hardlink self-reference; strict SRI syntax; changed resolution inputs; internal/dangling/cyclic/external links; scoped nested successors; unknown files and directories under node_modules; .bin link records; independent successor discovery after early refusal; reduced limits, actual oversized sparse file, actual FIFO and unreadable file; real midstream byte/type/link changes, child-process mutation after collection, repeated comparisons and repeated finalization without stale MATCH.

Preserved failures: first-red.log demonstrates missing new module before implementation (failed import/suite, zero tests; the wrapper did not separately capture the child exit). focal-r1.log preserves 56/57 with the scoped-directory discovery defect, subsequently fixed without weakening assertions. r2–r4 and final-* logs preserve intermediate passing evidence; r5 supersedes their source freshness.

Limitations: recipe/cache/network/lifecycle provenance, CLI integration, all156 regressions, real-reference inventory, global gates and independent critical review are Lead/runner responsibilities and NOT_RUN by this lane. The rejected real preflight was never consumed here. Full 4GiB/200000-entry stress was not materialized; lowered collection caps and the immutable real 512MiB package cap were exercised. Provenance remains the trusted operator's reviewed recipe; no guarantee of immutability after the last check is claimed. No unresolved failure was observed within the executed focal scope.

Temporary fixtures under `/tmp/cvg-hiso005-0234-20261017/comparer` were cleaned (zero remaining case directories); no owned child remains. Root ledgers/backlog/control are left to Lead per lane authorization. Next action: Lead freezes these exact hashes, performs independent critical review and completes integration/regression/reference/global gates.
