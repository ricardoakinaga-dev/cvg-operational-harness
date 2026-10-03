**REJECT — C1/HISO005 criterion FAIL.** Critic `C1-HISO005-POSTERIOR-20261003-3b8e74840ac3`; one authorized posterior review, I1 with the independence limitation below; `fork_turns: none`; descendants: zero. This is a scoped technical rejection, not a verdict on the 24-card program or any release.

The public candidate and all 17 archived cases match their sealed expectations. The additional 28 cases produce seven false PASS results across two material gaps. API and CLI outputs agree for all 46 cases. All 23 synthetic runtime controls exit 0; the false-pass runtime controls print `PRODUCT_LOADED` where applicable. No candidate/source edits or actual product/runtime execution occurred.

**Largest material gap: C1-P1-01, P1, HIGH confidence.** `localTarget` at checker line 196 drops physical targets in `node_modules` without recording an edge, inspecting either closure, or returning INCOMPLETE. The preserved `negative-physical-npm-require` and `negative-physical-npm-import` fixtures return API PASS, empty diagnostics and violations, and CLI exit 0, while the actual synthetic runtime loads the product. `negative-physical-npm-type-closure` also passes while TypeScript resolves its declaration re-export into product types. Neutral physical-package controls pass correctly. This is a transitive runtime/type boundary failure, not an unresolved package or a failed runtime control.

**C1-P1-02, P1, HIGH confidence.** The module namespace classifier at line 426 and the call visitor at line 809 do not propagate capabilities obtained from `process.getBuiltinModule('module')` or `process.mainModule`. The preserved process-derived loader chain and main-module fixture pass while executing the synthetic product. A nonliteral target through the process-derived loader returns PASS/exit 0 for both environment-selected product and neutral targets; frozen C1 requires INCOMPLETE/nonzero for that unknown. Direct module aliases, supported namespace/factory aliases and known unknown-reference controls are rejected correctly in this review.

Frozen target, copied verbatim from the sealed packet: No core-to-product runtime or type reachable dependency via direct/transitive/dynamic/alias references. Types declarations may not hide runtime closure. All archived seven negatives rejected, four positives admitted; unknown references/resolution return INCOMPLETE and nonzero public CLI. Core neutral/product-to-core imports admitted. Artifact inputs immutable.

| Frozen criterion aspect | Result | Direct evidence |
| --- | --- | --- |
| public root API and CLI | OBSERVED_PASS | public-root |
| 17 sealed archived cases, including original seven negatives and four positives | PASS | archived-*; 13 rejects, four positives |
| direct/transitive runtime and type closure | FAIL | negative-physical-npm-require/import/type-closure |
| neutral declarations may not conceal runtime closure | PASS_FOR_TESTED_CASES | archived script shadow, adversarial runtime-declaration mjs/cjs and type-closure |
| loader capability propagation | FAIL | negative-process-module-capability; negative-main-module-loader |
| unknown references/resolution => INCOMPLETE and nonzero CLI | FAIL | unknown-process-module-capability-product/neutral => PASS, exit0 |
| neutral core, type declarations and product-to-core admitted | PASS_FOR_TESTED_CASES | four archived positives + 11 new positive fixtures |
| artifact inputs immutable | PASS | repository+state and whole physical candidate pre/post MATCH |

The authoritative current root invocation reports 909 source files, 544 core files, 26 workspaces and 4314 edges, with PASS and no diagnostics. The allowed historical boundary log reports 584 source files and 2717 edges. Those captures are distinct; no inference of complete closure is made from either PASS. Selected actual API imports (`fastify`, `pg`, `zod`) and zod package/source metadata were inspected statically, and selected Node/TypeScript resolution paths were captured without importing actual runtime. The node_modules finding does not assert that the real installed zod package imports the product; it proves the checker's missing coverage via controlled packages.

Allowed T2 records and raw logs were all SHA-verified. Raw logs show focused 78/78, unit suites 2679 passed with one skipped test/file, PostgreSQL 288/288, conversation PG 1/1, no typecheck/lint diagnostics, and successful public API/product builds. The first E2E capture has 10 failures and two passes with unresolved workspace imports; the after-build capture has 12 passes. The security-before raw capture exits 1 and contains four vulnerability entries. Those are historical observations only; this review did not rerun those commands or reinterpret them as approval of C1 or other gates. The archived-17 aggregate log was not used as proof: each fixture was independently replayed against expectations from the packet.

Packet SHA-256: `190ca95526ee90124407d2397aac4d945764b068f48c91ce7690aab27f910f19`. ZIP SHA-256: `0ab9aa550325297a86976f0b64efde67db9da5d36fdd11cefe0b74b390184a10`. Checker SHA-256: `d69c6ef1bfda824250809707cec6a25eb0777a32132282ea6828a48f5b4113fb`. Tests SHA-256: `dd13c0ad7626012007ea6b6a114a094523eee0079f93a236c0a65637d4d23d4e`. All 32 packet/artifact/archive/allowed-log checks MATCH.

Required repository+state sentinel: pre `c479e182893cee1b2d3a2c13bffbbabd8a243748e2a68a910601db55fdd60d3c`, post `c479e182893cee1b2d3a2c13bffbbabd8a243748e2a68a910601db55fdd60d3c` — **MATCH**. Additional whole physical candidate capture: pre `c5e88dfa245759c07925bdf1c880fc1e3e09144fc272867b81847066f6cabd1b`, post `c5e88dfa245759c07925bdf1c880fc1e3e09144fc272867b81847066f6cabd1b` — **MATCH**, 30143 entries, including ignored dependencies/builds/git/state. Content/state was not interpreted by the sentinel. Symlinks are captured as symlinks and not followed externally.

The 128 archive files were extracted only from `fixtures/**`; archive reports, verdicts and other members were excluded. [Extraction listing](proof/archive-extraction.json), [per-case captures](proof/results.json), [selected resolution proof](proof/selected-closure.json), [pre sentinel](proof/pre.json), [post sentinel](proof/post.json), [whole pre](proof/whole-pre.json) and [whole post](proof/whole-post.json) are preserved. [Standalone runner](proof/review.mjs) and all archived/adversarial fixture sources are included as proof. The runner records its original scratch/candidate layout; use the direct commands below for the durable fixture copy.

Reproduce the largest gap using the durable fixture (only synthetic code executes):

```sh
NODE='/home/ricardo/.nvm/versions/node/v22.23.2/bin/node'
CHECKER='/home/ricardo/.cache/cvg-harness-audit-actions-20261003/candidate/scripts/check-product-boundary.mjs'
FIXTURE='/home/ricardo/Área de trabalho/cvg-operational-harness/docs/04_audit/evidence/HARNESS-ISO-EXEC-20261003/audit-actions/c1-posterior-critic/proof/adversarial/negative-physical-npm-require'
"$NODE" "$CHECKER" "$FIXTURE"
"$NODE" "$FIXTURE/packages/core/src/entry.cjs"
```

Expected C1 rejection; observed checker PASS/exit 0, then runtime `PRODUCT_LOADED`/exit 0. For API proof see `proof/raw/negative-physical-npm-require.api.json`. The direct two-command reproduction applies also to `negative-process-module-capability` and `negative-main-module-loader`. For the unknown process-derived case select `unknown-process-module-capability-product` and run the synthetic entry with `CRITIC_TARGET='../../../products/shift/src/index.cjs'`; the stored API/CLI captures incorrectly remain PASS. Its neutral companion changes the runtime target to `./neutral.cjs` while the same nonliteral source still must be INCOMPLETE.

I1 limitations are explicit:

- I1: same model family, no inherited conversation/Builder rationale, fork_turns none as assigned. No descendants were created. Host fork configuration was not independently attestable from within this session.
- Reading the required coordination document too broadly incidentally exposed historical verdict summaries and other task history. The review was therefore not fully blind; this procedural limitation is explicit. No Builder report, prior review artifact, SPEC history, or .gauntlet contents were opened or used to derive findings. The rejection rests on new preserved API/CLI/runtime captures, not those summaries.
- Finite synthetic fixtures cannot prove universal static-analysis completeness. The actual candidate product/runtime was never imported or executed; only resolution and static inspection were performed on the candidate.
- T2 raw logs were read and hash-verified, not independently rerun. Record inputSentinel MATCH claims were not accepted as an independent check of every historical artifact. Their referenced before/after inputs were outside the allowed packet list and were not opened.
- Whole physical fingerprints hash ignored files, dependencies, builds, .git and state; symlinks are recorded without following external targets. No permission, ownership, atime, inode or external symlink-content attestation is claimed.
- Runtime controls execute synthetic JavaScript only. Type-only closure is demonstrated through preserved declarations and standalone TypeScript resolution, not runtime execution of types.

No Vitest, full suite, build, certification, lockfile change, shared-ledger edit, actual product import, external provider, git mutation, fix, descendant or further review cycle was performed. Shared runtime/log/backlog integration remains Lead-owned, consistent with the narrow user authorization and existing report-path claim.

| Executed case | Frozen/separate adversarial expectation | API | CLI exit | Result |
| --- | --- | --- | --- | --- |
| public-root | PASS | PASS | 0 | MATCH |
| archived-positive-neutral | PASS | PASS | 0 | MATCH |
| archived-negative-direct | REJECT | FAIL | 1 | MATCH |
| archived-negative-anchored | REJECT | FAIL | 1 | MATCH |
| archived-negative-alias-namespace | REJECT | FAIL | 1 | MATCH |
| archived-negative-module-require-factory | REJECT | FAIL | 1 | MATCH |
| archived-negative-commonjs-module-alias | REJECT | FAIL | 1 | MATCH |
| archived-negative-commonjs-computed | REJECT | INCOMPLETE | 1 | MATCH |
| archived-negative-resolve-alias | REJECT | FAIL | 1 | MATCH |
| archived-negative-script-declaration-shadow | REJECT | FAIL | 1 | MATCH |
| archived-negative-script-no-shadow | REJECT | FAIL | 1 | MATCH |
| archived-positive-script-declaration | PASS | PASS | 0 | MATCH |
| archived-negative-unknown-import | REJECT | INCOMPLETE | 1 | MATCH |
| archived-positive-domain-method | PASS | PASS | 0 | MATCH |
| archived-negative-script-env-shadow | REJECT | FAIL | 1 | MATCH |
| archived-positive-anchored-neutral | PASS | PASS | 0 | MATCH |
| archived-negative-dev-manifest | REJECT | FAIL | 1 | MATCH |
| archived-negative-type-reference | REJECT | FAIL | 1 | MATCH |
| positive-alias-fixedpoint | PASS | PASS | 0 | MATCH |
| negative-alias-fixedpoint | REJECT | FAIL | 1 | MATCH |
| positive-module-host | PASS | PASS | 0 | MATCH |
| negative-module-host | REJECT | FAIL | 1 | MATCH |
| positive-namespace-factory | PASS | PASS | 0 | MATCH |
| negative-namespace-factory | REJECT | FAIL | 1 | MATCH |
| unknown-dynamic-import | INCOMPLETE | INCOMPLETE | 1 | MATCH |
| unknown-computed-module-property | INCOMPLETE | INCOMPLETE | 1 | MATCH |
| unknown-resolver-target | INCOMPLETE | INCOMPLETE | 1 | MATCH |
| positive-process-module-capability | PASS | PASS | 0 | MATCH |
| negative-process-module-capability | REJECT | PASS | 0 | FALSE PASS |
| unknown-process-module-capability-product | INCOMPLETE | PASS | 0 | FALSE PASS |
| unknown-process-module-capability-neutral | INCOMPLETE | PASS | 0 | FALSE PASS |
| negative-main-module-loader | REJECT | PASS | 0 | FALSE PASS |
| positive-domain-require | PASS | PASS | 0 | MATCH |
| positive-runtime-declaration-mjs | PASS | PASS | 0 | MATCH |
| negative-runtime-declaration-mjs | REJECT | FAIL | 1 | MATCH |
| positive-runtime-declaration-cjs | PASS | PASS | 0 | MATCH |
| negative-runtime-declaration-cjs | REJECT | FAIL | 1 | MATCH |
| positive-type-closure | PASS | PASS | 0 | MATCH |
| negative-type-closure | REJECT | FAIL | 1 | MATCH |
| positive-product-to-core | PASS | PASS | 0 | MATCH |
| unknown-declaration-only-runtime | INCOMPLETE | INCOMPLETE | 1 | MATCH |
| positive-physical-npm-require | PASS | PASS | 0 | MATCH |
| negative-physical-npm-require | REJECT | PASS | 0 | FALSE PASS |
| positive-physical-npm-import | PASS | PASS | 0 | MATCH |
| negative-physical-npm-import | REJECT | PASS | 0 | FALSE PASS |
| negative-physical-npm-type-closure | REJECT | PASS | 0 | FALSE PASS |

Artifact manifest SHA-256: `af32693f37ac1e1a0a67642bb57fddab72675d14864cae2385b2777a535fc02d`. [Manifest](artifact-manifest.json) hashes all proof/raw-capture artifacts and excludes report/verdict/freeze to avoid a circular digest. The freeze envelope separately binds this report, verdict and manifest. Stop: independent report complete; no fix or additional review authorized. **Lead notification: frozen C1/HISO005 report ready.**
