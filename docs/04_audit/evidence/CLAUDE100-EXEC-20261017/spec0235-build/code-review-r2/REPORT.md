# SPEC0235 independent re-review R2

**REJECT — first bounded native launch remains ineligible.** Two mandatory residual findings. R1-03 is fixed only for intact statuses; R1-02 is fixed after controller entry but not during trusted bootstrap entry. The other four R1 findings are resolved within the bounded tests. Final real positive controls and NP01–NP10 acceptance remain **NOT_RUN**.

Candidate `/tmp/cvg-claude100-exec-20261017/ref-port-candidate`; checkpoint `8997560a4ace2a6b51e5f877bbdb4940536d43d5`. Original SPEC and human authority unchanged. Correction1of2 consumed; **one correction remains**. Completed `2026-10-18T02:35:30.642920+00:00`.

## Mandatory findings, largest first

### R2-01 / R1-03 — HIGH — Contradictory PASS proofs still accepted for INFRA_FAILURE reports

Confidence **HIGH**. Affected NP02, NP03, NP08. Mandatory before launch.

Expected: Approved SPEC lines397–409 require PASS evidence and rejection of contradictory bindings; this is not restricted to PORT_OBSERVED.

Direct code:
- [tests/claude100/reference-port/report.mjs:396](</tmp/cvg-claude100-exec-20261017/ref-port-candidate/tests/claude100/reference-port/report.mjs:396>): PASS checks are checked for referenced artifact roles only.
- [tests/claude100/reference-port/report.mjs:406](</tmp/cvg-claude100-exec-20261017/ref-port-candidate/tests/claude100/reference-port/report.mjs:406>): Any status other than PORT_OBSERVED or PORT_NOT_OBSERVED returns before semantic proof validation.
- [tests/claude100/reference-port/report.mjs:580](</tmp/cvg-claude100-exec-20261017/ref-port-candidate/tests/claude100/reference-port/report.mjs:580>): assertContainmentProofs is unreachable for INFRA_FAILURE, BLOCKED_CONTAINMENT and INVALID_INPUT.

Reproducer and actual result: Start from the newly generated, genuine simulated privacy_failure report: INFRA_FAILURE/exit1 with CONTAINER_PROFILE=PASS and NAMESPACES=PASS. Change inspect-observer HostConfig.Privileged to true and update its artifact hash/size. Separately change preflight uid=0, hostMarkerAbsent=false, pidNamespace=synthetic host inode and rehash. assertEvidenceBindings returns each contradictory report unchanged. The identical mutations on PORT_OBSERVED are rejected.

Evidence: [validator_INFRA_FAILURE_inspect.json](validator_INFRA_FAILURE_inspect.json), [validator_INFRA_FAILURE_preflight.json](validator_INFRA_FAILURE_preflight.json), [validator_PORT_OBSERVED_inspect.json](validator_PORT_OBSERVED_inspect.json), [validator_PORT_OBSERVED_preflight.json](validator_PORT_OBSERVED_preflight.json), [adversarial-r2.json](adversarial-r2.json).

Impact: The successful-status repair works, but failed reports can still claim intact security checks that their own bound bytes disprove. This is the SPEC verifier property, not an allegation of arbitrary host forgery or a positive native escape.

Safe proposed correction: Recompute every claimed PASS from its available, corresponding proof for all statuses. Apply only reached-check requirements so a legitimate partial failure does not need future evidence. Reject contradictory retained proofs even when the terminal status is failure; do not remove the PASS checks merely to hide the contradiction.

### R2-02 / R1-02 — MEDIUM — SIGINT/SIGTERM during trusted bootstrap entry bypass cancellation cleanup

Confidence **HIGH**. Affected NP07. Mandatory before launch.

Expected: Approved SPEC lines169–174,373–381 require finite cancellation cleanup; SIGKILL/power loss are the explicit no-cleanup cases. R2 contract explicitly requires assessment during entry.

Direct code:
- [scripts/claude100-reference-port.mjs:32](</tmp/cvg-claude100-exec-20261017/ref-port-candidate/scripts/claude100-reference-port.mjs:32>): CLI freezes/verifies/imports before entering the signal-owning controller and has no entry signal handlers.
- [scripts/claude100-reference-port.mjs:50](</tmp/cvg-claude100-exec-20261017/ref-port-candidate/scripts/claude100-reference-port.mjs:50>): Fallback cleanup requires graph already returned; normal process signal termination does not enter this finally.
- [tests/claude100/reference-port/bootstrap.mjs:104](</tmp/cvg-claude100-exec-20261017/ref-port-candidate/tests/claude100/reference-port/bootstrap.mjs:104>): freezeHostGraph creates owned private files/FDs without cancellation handling.
- [tests/claude100/reference-port/controller.mjs:123](</tmp/cvg-claude100-exec-20261017/ref-port-candidate/tests/claude100/reference-port/controller.mjs:123>): Scoped handlers start only after the copied controller execute function begins.

Reproducer and actual result: Two owned Node22 subprocesses call the actual builtin-only freezeHostGraph on fresh reviewer-owned roots. fs.watch self-delivers SIGINT or SIGTERM after the exclusive bootstrap directory appears, before freeze resolves or any controller import. Both checkpoints have zero handlers; each process terminates by that signal and leaves its private partial snapshot. The valid probe CLI/main is not invoked. By contrast, four copied-controller cases after entry handle both signals at CONFIGURE/START_PORT, preserve SIGNAL, clean both virtual containers and dispose the graph.

Evidence: [signal-r2.json](signal-r2.json), [/tmp/cvg-claude100-exec-20261017/ref-port-review-r2/artifacts/bootstrap_SIGINT/signal-checkpoint.json](</tmp/cvg-claude100-exec-20261017/ref-port-review-r2/artifacts/bootstrap_SIGINT/signal-checkpoint.json>), [/tmp/cvg-claude100-exec-20261017/ref-port-review-r2/artifacts/bootstrap_SIGTERM/signal-checkpoint.json](</tmp/cvg-claude100-exec-20261017/ref-port-review-r2/artifacts/bootstrap_SIGTERM/signal-checkpoint.json>).

Impact: Ordinary entry cancellation is still treated like a crash and leaves an avoidable private snapshot. No Docker/native resources existed in these bootstrap tests; the residual finding is narrower than the original in-controller leak.

Safe proposed correction: Own cancellation from before the first bootstrap side effect, abort further entry/native starts, close owned pins/handles and attempt finite identity-checked disposal on cancellation. Preserve the signal plus cleanup causes, transfer ownership cleanly to the controller, and keep the no-fallible-IO-after-publication guarantee.

## Explicit six-finding recheck

| R1 ID | R2 state | Independent result |
|---|---|---|
| R1-01 | RESOLVED_WITHIN_BOUNDED_RETEST | All six physical input/profile mutations are refused both before native launch and after the port phase; all12 return exit1, DRIFT_RUNTIME and no published report. Both empty-directory mutations produce INFRA_FAILURE. No virtual resources remain. Refusing publication when physical bytes cannot support a coherent inventory is correct. |
| R1-02 | PARTIALLY_RESOLVED_MANDATORY_REMAINS | Copied-controller SIGINT/SIGTERM at configure and port pass four independent tests: SIGNAL preserved, zero post-configure starts when cancelled there, both virtual resources removed, graph disposed, handlers restored. Entry/bootstrap still fails both signals (R2-02). |
| R1-03 | PARTIALLY_RESOLVED_MANDATORY_REMAINS | Rehashed inspect/preflight contradictions are rejected for PORT_OBSERVED. Exactly the same contradictions are accepted for a real simulated INFRA_FAILURE report while CONTAINER_PROFILE and NAMESPACES remain PASS (R2-01). Cannot close on positive-only validation. |
| R1-04 | RESOLVED_WITHIN_BOUNDED_RETEST | Nonzero actual wrapper status preserves IO/INFRA_FAILURE and continues rm/final inspect; both virtual identities removed. The baseline independently preserves the distinct native port exit1 while wrapper/cleanup remain intact. |
| R1-05 | RESOLVED_WITHIN_BOUNDED_RETEST | Complete body terminal without REQUEST/RESPONSE is now PROTOCOL/INFRA_FAILURE rather than clean absence, with partial body evidence retained. Controller enforces body/request/response cardinality and bytes/hash agreement after cleanup. |
| R1-06 | RESOLVED_REPRESENTATION_AND_GRAPH_TESTED | Fixed builtinAllowlist is present in profile and checked for exact equality. Actual frozen graph imports copied controller/helper code, pins both original and copied graphs, and disposes graph before publication. Trusted entry representation is compatible with the approved SPEC as explained separately; entry cancellation is R2-02. |

## Trusted bootstrap, profile keys and fixed import judgment

**profileTopLevel: COMPATIBLE.** The approved text explicitly requires a fixed Node builtin allowlist in the profile. Its top-level profile description uses contém rather than an exact closed key set. Docker config projections and Reportv1 are explicitly closed and remain unchanged. Adding the fixed top-level builtinAllowlist fulfils an existing required datum; it grants no configurable capability. Twelve fixed entries exactly match independent AST observations and resolved profile.

**trustedBootstrap: COMPATIBLE_ARCHITECTURE_WITH_CANCELLATION_GAP.** The minimal trusted pre-import bootstrap uses only Node builtins and fixed source/path/hash constants. It pins originals and copies before the host controller/helper graph is imported from the private snapshot. A small original bootstrap necessarily precedes its own copied execution and is itself in the reviewed inventory. Copied-controller integration with fake Engine/native observed a valid recon report and disposal before publication. This closes original host-graph consumption, but entry cancellation remains mandatory R2-02.

**fixedWithinClosureImport: COMPATIBLE_SCOPED_INTERPRETATION_EXPLICIT.** I read Imports dinâmicos/resolução fora da closure são proibidos as prohibiting dynamic/out-of-closure resolution, not the sole reviewed bootstrap import of a fixed already-verified path within that closure. The target is graph.root plus the literal tests/claude100/reference-port/controller.mjs; it is not chosen by manifest/env/target. Independent AST finds exactly this one ImportExpression, no unresolved static edge, and all subsequent module imports resolve inside the copied graph or the fixed builtin list. This interpretation does not permit generic dynamic import or resolution outside the frozen graph and does not alter the immutable SPEC, Docker config or report schema.

## Four compatibility questions

**Q1: COMPATIBLE_FAIL_CLOSED_NOT_RUNTIME_PROVEN.** Ordinal domain stays0–3. Simulated protected observer EOF/nonzero after a valid exchange remains INFRA_FAILURE and both virtual resources are removed; no invented ordinal or observed host CAP claim. Actual fifth HTTP attempt is NOT_RUN.

**Q2: COMPATIBLE_DEADLINE_INTERPRETATION_NOT_RUNTIME_PROVEN.** Transport unchanged: counted <=2s local Unixsocket Enginev1.51 attach handshake, stream bounded by shared controller deadline; no 30s Docker CLI attach. Original source judgment preserved, actual Engine/HTTP handshake and image compatibility NOT_RUN.

**Q3: COMPATIBLE_ZERO_TERMINALS_AND_BODY_JOIN_RETESTED.** Zero-length terminal wire representation stays within admitted0–4096length. Safe unit tests cover duplicates/after-terminal/fragmentation/EOF, and the original orphan-body counterexample now gives PROTOCOL/INFRA_FAILURE. Actual cross-pipe native timing remains NOT_RUN.

**Q4: COMPATIBLE_CONSERVATIVE_HOST_WINDOW_NOT_RUNTIME_PROVEN.** No total cross-pipe order invented between native start/port and HTTP. Late observer raw bytes after STOP are rejected with INFRA_FAILURE and both virtual identities removed. Conservative false negatives are possible; no positive evidence inferred. Actual scheduling is NOT_RUN.

## Executed proof and limits

- **171/171** original safe unit tests in eight files PASS, zero failures/skips/todo, Node22.23.2. [JSON](safe-unit-r2.json), [log](safe-unit-r2.log).
- **22/22** bootstrap unit tests PASS after moving only fixture output ownership and import/read URLs into this reviewer lane. Assertions are preserved. Original test hardcodes builder output; it was not run unchanged. [Adapted source](</tmp/cvg-claude100-exec-20261017/ref-port-review-r2/bootstrap-adapted.test.js>), [JSON](bootstrap-adapted-r2.json).
- **22** new finite adversarial scenarios plus **four** rehashed-proof probes. The zero harness exit proves that the expected corrected behaviors and remaining counterexamples were observed; it is not a candidate PASS. [Cases](adversarial-r2.json), [script](</tmp/cvg-claude100-exec-20261017/ref-port-review-r2/adversarial-r2.mjs>).
- **Six** owned Node signal subprocesses: four copied-controller cases handle cancellation/cleanup; two bootstrap-entry cases terminate by SIGINT/SIGTERM with no handlers and retain private partial snapshots. Parents have4s deadlines; no selected native executable or actual resources. [Signal cases](signal-r2.json), [script](</tmp/cvg-claude100-exec-20261017/ref-port-review-r2/signal-parent.mjs>).
- Independent Acorn AST: **20sources/248695bytes/12fixedbuiltins/one fixed within-closure ImportExpression/zero unresolved edges**. Profile allowlist exactly matches. Actual copied controller/helper graph was executed only with fake Engine/native dependencies and disposed before publication. [Closure](closure-independent-r2.json).
- Source freeze **34/34** unchanged before/after; all seven protected helpers/manifests match base26d866c3. Current Node/Docker CLI/Claude raw bytes match approved hashes; Node alone executed. Image/API/ELF/runtime NOT_RUN. [Before](source-before.json), [after](source-after.json), [pins](current-pins.json).
- All **680** R1 evidence artifacts remain byteexact under the sealed R1 manifest. Historical candidate source pins are intentionally superseded by authorized correction, not rewritten in R1. [Seal check](r1-seal-verification.json).
- No source changes, delegated agents, shared ledger writes, Docker/Engine commands, HTTP/network, valid probe CLI/main, observer/client main, actual native/Claude, broad gates or PG actions by this reviewer. Lead owns shared documentation/resource/gate updates.
- Lead220/220 and scoped lint/format are consumed implementation evidence, independently bound; they do not override counterexamples. Stopped fullcert R1 has no final certification credit.

## Reproduction

Scripts use exclusive outputs and preserve failed fixtures. Re-run in a new review-owned subtree; do not overwrite this attempt or R1.

```sh
TMPDIR=/tmp/cvg-claude100-exec-20261017/ref-port-review-r2/tmp /home/ricardo/.nvm/versions/node/v22.23.2/bin/node /tmp/cvg-claude100-exec-20261017/ref-port-candidate/node_modules/vitest/vitest.mjs run --config /tmp/cvg-claude100-exec-20261017/ref-port-review-r2/vitest.config.mjs
TMPDIR=/tmp/cvg-claude100-exec-20261017/ref-port-review-r2/tmp /home/ricardo/.nvm/versions/node/v22.23.2/bin/node /tmp/cvg-claude100-exec-20261017/ref-port-candidate/node_modules/vitest/vitest.mjs run --config /tmp/cvg-claude100-exec-20261017/ref-port-review-r2/bootstrap-vitest.config.mjs
TMPDIR=/tmp/cvg-claude100-exec-20261017/ref-port-review-r2/tmp /home/ricardo/.nvm/versions/node/v22.23.2/bin/node /tmp/cvg-claude100-exec-20261017/ref-port-review-r2/adversarial-r2.mjs
TMPDIR=/tmp/cvg-claude100-exec-20261017/ref-port-review-r2/tmp /home/ricardo/.nvm/versions/node/v22.23.2/bin/node /tmp/cvg-claude100-exec-20261017/ref-port-review-r2/signal-parent.mjs
TMPDIR=/tmp/cvg-claude100-exec-20261017/ref-port-review-r2/tmp /home/ricardo/.nvm/versions/node/v22.23.2/bin/node /tmp/cvg-claude100-exec-20261017/ref-port-review-r2/closure-r2.mjs
```

## Source/contract/evidence binding

- Immutable approved SPEC: `aaa12b3ee55021e357fc9a17518316135eb4ca423b87215af754cd18dbb41f04`.
- SourcefreezeR2: `e5294292b5affba4ac3b1b74cdc1c999fbfb0122b1b43297329764e3738d2c15`.
- ReviewcontractR2: `467bd51864cdd585ad036392047b3340e303301902ceb105a5d99ff01b954027`.
- Correctioncontract: `4b1cb1d9d3b7bafd2bdb0638f3eccbbc9d79807346fe836fe6500c608c02b7af`.
- [Inputs manifest](inputs-manifest.json): `0eb94f861829902e3bd8441c4679766b0867980eb1748f2e164e3c5e8843c3f0`, with exact27source/7protected pins and original SPEC authority/contracts/R1 and correction evidence.
- [Final manifest](manifest.json) binds REPORT.md/result.json and all owned reviewer scripts, unit results, logs and retained scenario files to raw SHA256 bytes. It excludes only itself to avoid a circular digest; manifest digest is returned in the handoff.
- [Machine verdict](result.json) contains both residual findings, all six rechecks, explicit profile/import judgments, NP01–NP10 final NOT_RUN states and proof boundaries.

## Next action

Use the one remaining correction round to fix negative-status PASS proof validation and bootstrap-entry cancellation, preserve R1/R2 evidence, refreeze exact corrected source and obtain independent review/current fullgates before any native launch.

No real positive controls, final NP acceptance, M1,117+17catalog credit or release is granted by this re-review.
