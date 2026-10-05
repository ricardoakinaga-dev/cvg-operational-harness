R17 candidate ready for Lead review; installed gate remains **INCOMPLETE**, not a release acceptance.

Changed only the checker, manifest helper and a byte-preserving appendix of 135 inert controls (initial 79 + 56 reviewer regressions). Original 253 and prior 658 cases remain intact; final native run: **1046 PASS, 0 FAIL, 0 SKIP**. Typecheck and lint: exit 0 in Node 22.23.2. Before new controls: 53 FAIL / 26 PASS; raw failures retained.

R16 steering: all 32 confirmed findings reproduced before corrections (F1: 20, F2: 4, F3: 8). The 56-case extension had 44 FAIL / 12 PASS before and 56 PASS after; four exploratory outer-ancestor cases excluded. The initial79 appendix remains byte-exact; exact intermediate990 code/reports/logs are indexed separately.

Installed scan: before exit 2 (ESLint local dependency abort), after exit 1 / INCOMPLETE, 2,957 blocking diagnostics and 0 known product violations. The exact ESLint manifest SHA, devDependency value and missing physical path are recorded. The 1,610 unknowns are an exact normalized multiset match to the preserved intermediate result: zero missing/added, 267 source hashes match. Lead separately reports historical-to-intermediate retention; Builder did not inspect that Lead-owned raw proof.

Source, deps and dist hashes/modes/mtimes match before/after. Candidate changed paths are exactly the three allowed paths. AST, case identity, prefix hashes and raw native logs are included.

Limitation: initial Root rules/ledger/coordination reads exceeded the latest opaque read boundary. This incident is recorded, and no resulting narrative is used as implementation/acceptance evidence. R16 REJECT3 was explicitly authorized as Builder evidence and its confirmed fixes are included. Separate passive diagnostic review, CI/neutral and Root persistence belong to Lead; this remains I0 with no independent or global acceptance.

[Artefatos completos e código atual](c1-installed-frontier-r17-build-raw-evidence.tar.gz). [Manifesto individual](c1-installed-frontier-r17-build-artifact-manifest.json).
