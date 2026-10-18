# SPEC0229 final independent implementation review — R3

**APPROVE_SCOPED_IMPLEMENTATION** — local synthetic qualifier only, exact frozen candidate. No open implementation finding remains from this review. CQ08 full general gates remain Lead-owned and pending. Whole Q01, M1, functional parity, PASS_CURRENT and production are **not closed or approved** by this verdict.

Task: `C100-Q01-QUALIFIER-001`; candidate `/tmp/cvg-claude100-exec-20261017/q01-candidate`; commit `cff0e7c3b1e5b9baa40e0c2c62d398109da0889d`. Two corrective rounds were used. No source edits occurred during this review. The independent critic's source-read/executable phase is complete.

## Integrity, authority and execution boundary

All **43** pins in `review-r3-inputs.json` matched before and after review, including implementation/tests/fixtures, approved SPEC, local BUILD authority, explicit Q03 hold lift, qualified Q03 manifest and builder observations. The packet itself remained unchanged. See [before](pins-before.json), [after](pins-after.json), and [verdict](verdict.json). The original approved SPEC hash remains `bb42eb61cbd30c5720b00ef3145d9fdac4196b942eb3c42bff1d94acf4fe8243`.

All nine shared Q03 source/input hashes were independently recomputed against the qualified dependency manifest before and after; see [shared pins](q03-shared-pins.json). The explicit hold lift authorizes this local execution. The prior Q03 certification's 16 gates/official38 verification were not rerun or independently recertified by this critic. Its record is a pinned input, not a substitute for the executable qualifier checks below.

Tests ran under **Node v22.23.2**, using an isolated environment, `/tmp/qualifier-review-r3/**` for temporary files/config/cache/results and a private Vitest config with only the six qualification test files included. Native config loading avoided writing bundled config into the source candidate. No app/service, PG, network, model, install, broad gate, agent descendant, commit or push was started. Bounded Node/Vitest/CLI child processes were the authorized local test execution. Only new root `review-r3/**` and the authorized temporary directory were written; source, fixtures, authority, SPEC and prior review reports stayed readonly.

## Independently executed results

| Procedure | Actual outcome |
| --- | --- |
| Frozen qualifier/foundation suite | **399 passed**, 0 failed, 0 pending, six test files; process exit0. |
| Independent real-file/CLI adversarial scenarios | **39 final scenarios passed**, with one initial reviewer-hook targeting error preserved and corrected as described below. |
| Canonical numeric expansion | Two 1,000,001-byte raw JSON arrays became complete 4,400,001-byte canonical streams; four parts each <=4MiB, SHA/length checked and concatenated exactly on both sides. |
| Number expansion bound corpus | **1,898** finite source number forms over exponents -324..308 checked independently against sixfold bound. This samples the bound; the static rationale covers remaining forms. |
| Physical evidence/report audit | **34** completed reports checked against the closed report structure, **34** normalized descriptors checked against bytes/SHA, and **419** input snapshots checked against inventory hashes/lengths. |
| Catalog preservation | Current root catalog and frozen fixture are byte-identical: SHA `71a461b63ba7723e79510ba66bd0054ded1a67b539bfce52aff41a1318e4d21b`;134IDs,117functional,17controls,16families; all ID/class/family/required mappings preserved. |

Exact commands, exit codes, raw log/result references and procedure descriptions are in [execution evidence](execution-evidence.json). The actual suite log/result are [foundation log](logs/foundation.log) and [raw JSON](results/foundation.json). Builder's399/399 observation was pinned but not accepted as the independent result: the critic ran the suite afresh.

The independent probes use their own local fixture/receipt/index builder and their own wire canonicalization; they do not import the builder's test setup or trust its report flags. Probes cover actual CLI match output, complete snapshot hashes, manifest-only execution/timeout/identity/fixture adulteration, receipt drift, missing origin versus denied authority, integrity versus unsupported wire, unsupported versus missing capture, missing reference/schema precedence, empty/binary EXACT_BYTES, malformed UTF-8 JSON, all protected/unknown fields,128/129/40000-character namespace boundaries, topology and protected nested IDs, numeric chunk reconstruction, unprojected required-role integrity, symlinks, output non-overwrite, budget guards, and genuine IO/clock/publication fault paths.

Private scripts are preserved as [initial probe source](scripts/adversarial-initial.mjs), [final probe source](scripts/adversarial-final.mjs), and [private test config](scripts/foundation-config.mjs). All inputs/collector/decision values used for these runs were fabricated mechanism data, not functional Claude captures or real equivalence approval.

### Preserved reviewer harness correction

The initial independent probe command exited1 with38 passing scenarios and one failed expectation. Its `input-close` hook matched a duplicate descriptor closed during INTEGRITY, rather than the first descriptor retained until final cleanup. The implementation correctly returned and published **INTEGRITY/INFRA_FAILURE** for that earlier failure. The probe had incorrectly expected that publication was impossible, an expectation intended only for failure of final cleanup.

The initial result/log/source are retained unchanged in [raw initial results](results/adversarial.json), [initial log](logs/adversarial.log), and the initial script snapshot. Only the reviewer's private hook was narrowed to the first retained input handle, with the same terminal/no-completed-report assertions. The targeted rerun exited0: final retained-descriptor close failure returned INFRA_FAILURE/1 and published no completed report. See [targeted result](results/adversarial-targeted.json) and [targeted log](logs/adversarial-targeted.log). No implementation or frozen test assertion was changed. The final39-scenario count combines the38 valid initial successes with this corrected target; it does not hide the initial command failure or claim a single39/39 command.

## Finding closure

- **S0229-R1-001 — CLOSED_SCOPED_IMPLEMENTATION.** 399-test suite: publication repeated attestation receipt parsed once, eventual INVALID_INPUT; static index schedule capped32/deduplicated.
- **S0229-R1-002 — CLOSED_SCOPED_IMPLEMENTATION.** 399-test numeric regression and independent 200k numeric probe: 1000001 raw bytes ->4400001 canonical bytes per side; four complete hashed parts <=4MiB; generated fault INFRA.
- **S0229-R1-003 — CLOSED_SCOPED_IMPLEMENTATION.** Existing expiry regressions plus independent expire-stage and expire-final faults publish/return BLOCKED_CVG_SPEC. Sync selection directly precedes exclusive linkSync; no awaited gap.
- **S0229-R1-004 — CLOSED_SCOPED_IMPLEMENTATION.** Actual report sync/close, directory close and link faults; independent final retained input handle close fault; no completed MATCH after failure, zero candidate IO after successful publication.
- **S0229-R2-001 — CLOSED_SCOPED_IMPLEMENTATION.** Static comparatorFailure flag plus current suite and own projection-expire fault: persisted/returned INFRA_FAILURE; authenticated-infra-expire control BLOCKED_CVG_SPEC.
- **S0229-R2-002 — CLOSED_SCOPED_IMPLEMENTATION.** Current suite rejects 40000 namespace INVALID_INPUT before expansion, accepts128 namespace, pure preflight rejects huge recipe INFRA without constructing output. Independent128/129/40000 controls, budget boundary, 1898 finite-number source forms (exact count in raw probe detail).

The generated-resource helper counts only upper bounds: raw bytes times6 plus finite metadata replacement byte bounds, with namespace128 and ordinal digits; it does not transform values or replace Q03. Unchanged JSON strings/keys/literals do not expand beyond their original spelling after JSON decoding/stringification; finite numeric canonical spelling is longest near the decimal/exponential boundary (`1e20` gives21bytes from4). Sixfold is conservative.128-ASCII namespaces keep this finite per-envelope estimate bounded. Resource exceptions are internally distinguished from invalid data and authenticated execution infra outcomes; no new wire fields or SPEC amendment were introduced.

Publication stages both possible terminal reports, completes required writes/syncs and handle closure, validates the confined path/staged inode, chooses the current-authority result synchronously and performs an exclusive `linkSync`. Successful publication returns immediately with no required fallible IO/cleanup afterward. Independent hooks observed zero candidate IO after successful publication. The guarantee is the documented local synchronous selection/link completion boundary in an operator-owned root; it is not power-loss directory durability, distributed authorization or a physical-clock guarantee across arbitrary machine suspension.

The combined projection-failure/expiry probe retained persisted/returned INFRA_FAILURE; the authenticated-execution-infra/expiry control became BLOCKED_CVG_SPEC. This establishes the distinction requested in R2 without weakening authority precedence for semantic outcomes.

## Contract assessment and limits

| Criterion | Assessment for this local mechanism |
| --- | --- |
| CQ01 | PASS_SCOPED: exact134-ID catalog preserved; actual membership/duplicate/mixed-class negatives green. |
| CQ02 | PASS_SCOPED: strict UTF-8/JSON, duplicate keys, depth/string/file/aggregate bounds, fd snapshots, paths/symlinks/FIFO, namespace and generated budgets exercised. |
| CQ03 | PASS_SCOPED: exact fabricated receipt/index/manifest/fixture/execution binding and negative tampering exercised; no real-capture authentication claimed. |
| CQ04 | PASS_SCOPED: complete JSON/bytes, numeric chunks, extra/missing/order/type/Unicode and protected-field negatives exercised. |
| CQ05 | PASS_SCOPED: qualified kit preserved; finite metadata-only policy,128 namespace, equality/distinction topology and nested/protected data exercised. |
| CQ06 | PASS_SCOPED: actual CLI0/1/2 and saved results, missing/unsupported/trust/authority/infra precedence plus combined IO/expiry faults exercised. |
| CQ07 | PASS_SCOPED: physical hashes/snapshots, exclusive output, ordered full projections and pending/final publication fault behavior verified. |
| CQ08 | **Lead pending full general gates**; independent implementation review completed, no general type/lint/PG/E2E/certify acceptance granted here. |

These are scoped implementation results, not the overall program's acceptance or a broader release verdict. Actual reference capture/driver availability, scenario-specific functional equivalence, M1, whole Q01 and PASS_CURRENT remain outside this review. The qualifier still produces MATCH_REQUIRES_REVIEW only, with reviewStatus PENDING; no catalog/task is promoted by the reviewed mechanism.

The six historical findings are closed for this scoped implementation. There are **zero open findings** from this final review. Prior R1/R2 evidence is preserved. Next action: Lead completes CQ08 current general gates, rechecks candidate/evidence pins and updates its owned ledgers while retaining the separate Q01/M1/functional-parity limitations. No further source correction is requested by this review.
