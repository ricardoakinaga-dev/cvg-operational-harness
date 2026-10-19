# SPEC0229 independent correction review — R2

**STATIC_REVIEW_ONLY · REVISE_STATIC · Integrated gates pending · No overall approval**

Task `C100-Q01-QUALIFIER-001`; candidate `/tmp/cvg-claude100-exec-20261017/q01-candidate`. This reviews correction round **1 of at most 2**. Source-read phase is **COMPLETE**. One corrective round remains.

All **18** source/test/SPEC/authority/dependency pins match before and after inspection; the R2 packet is unchanged. All **19** separately frozen derived fixture pins plus the derivation recipe hash also match before and after; that packet is unchanged. See [source before](pins-before.json), [source after](pins-after.json), [fixture before](fixture-pins-before.json), [fixture after](fixture-pins-after.json), and [verdict](verdict.json).

The approved SPEC/authority and unchanged files retain their frozen R1 identity. The separate fixture preparation does not modify that authority or turn fabricated examples into real capture evidence. Format/lint/typecheck/certification progress reported by the lead is not represented here as independently verified acceptance.

No qualifier, CLI, Q03 kit or integrated test was imported or executed. No parser/IO test was run. No services, model, network, database, broader gate, descendant or commit was started. Only new `review-r2/**` artifacts were written; original R1 artifacts and all implementation/tests/fixtures remained readonly. The Q03 execution hold persists until an explicit lead lift.

## R1 correction assessment

| Finding | Static result and inspected mechanism |
| --- | --- |
| R1-001 | Addressed, executable closure pending: requested IDs deduplicated; scheduling iterates the capped index once per capture ID (`qualify.mjs:168–187`). The repeated-ID parse-count regression uses the actual parser and padded real-file receipt. |
| R1-002 | Addressed for the original numeric case, executable closure pending: complete ordered projection chunks each <=4 MiB; projection IO exceptions wrapped as INFRA_FAILURE (`qualify.mjs:435–456`). The 200k numeric test reconstructs both full byte streams and checks part hashes/sizes. Residual combined-fault classification is R2-001 below. |
| R1-003 | Addressed, executable closure pending: all awaited work and handle closure precede a synchronous selector followed immediately by exclusive `linkSync` (`qualify.mjs:555–571`, `safe-io.mjs:382–390`). There is no await or filesystem recheck between authority selection and publication. Tests cover expiry during snapshots and immediately before the selector, plus unexpired control. |
| R1-004 | Addressed, executable closure pending: pending files are not completion evidence; stages are written/synced/closed before `report.json` is exclusively linked; no fallible IO/cleanup follows successful publication. The test suite injects report sync/close, directory close and link faults and requires no completed report. |

The README explicitly defines only `report.json` as completion, explains ordered chunk concatenation, and avoids claiming power-loss durability of the new directory entry. Input descriptors are now retained through comparison until final IO.close. Static path/inode checks and exclusive no-replace publication preserve the operator-owned, nonconcurrent-writer boundary. These observations do not claim a stronger atomic physical-clock guarantee across arbitrary OS suspension than a local synchronous decision/publication operation.

Two residual P2 defects remain. They are reachable source conclusions and recipes for later tests, not reproduced runtime failures.

## S0229-R2-001 — P2: Expiry selection overwrites the mandatory INFRA_FAILURE for a comparator-generated output fault

Location: `tests/claude100/qualification/qualify.mjs:508`; related `tests/claude100/qualification/qualify.mjs:451`, `tests/claude100/qualification/qualify.mjs:563`, `tests/claude100/qualification/publication.test.js:172`.

Criteria: CQ06, CQ07. SPEC lines 70. Confidence HIGH; STATIC ONLY.

**Reachable example.** Use a valid synthetic bound pair with authority initially current. Inject the existing `PROJECTION_WRITE` fault. Let snapshot/staging IO subsequently succeed while the clock passes authority.expiresAt before final publication. The current test covers projection failure with unexpired/null authority, and expiry tests without an output fault; the combination is missing.

**Expected.** A failure of the comparator or generated-output IO produces INFRA_FAILURE/1 per the explicit final sentence of SPEC precedence. Expiration may outrank an authenticated execution outcome, but must not relabel an actual comparator/output failure.

**Actual, inferred from source.** The projection catch correctly sets INFRA_FAILURE, then authorityChecked=true plus report.status=INFRA_FAILURE creates a BLOCKED_CVG_SPEC alternative. The selector chooses that alternative after expiry, publishing and returning BLOCKED_CVG_SPEC/1. No distinction is retained between authenticated execution infra outcome and comparator-owned failure.

**Impact.** The persisted report hides the actual IO failure behind an authority result, violating the frozen deterministic error contract. Saved/returned reports agree, but agree on the wrong status.

**Remedy.** Track comparator/output failure provenance internally, separately from authenticated execution INFRA_FAILURE, without adding report/schema fields. Such failures must retain INFRA_FAILURE at final selection; expiry can still block a valid semantic result or authenticated execution classification.

**Required later evidence.** Combine projection-write failure with expiry during snapshots/publication. Assert returned and persisted INFRA_FAILURE/1; keep pure-expiry cases BLOCKED_CVG_SPEC and pure authenticated infra/authority precedence controls.

## S0229-R2-002 — P2: Metadata normalization can allocate a huge canonical projection before any generated-output budget check

Location: `tests/claude100/qualification/qualify.mjs:282`; related `tests/claude100/qualification/qualify.mjs:421`, `tests/support/governed-test-kit/index.js:84`, `tests/support/governed-test-kit/index.js:148`, `tests/support/governed-test-kit/index.js:158`, `tests/claude100/qualification/safe-io.mjs:281`.

Criteria: CQ02, CQ05, CQ06. SPEC lines 15, 37, 66, 70. Confidence HIGH; STATIC ONLY.

**Reachable example.** A policy declaring `eventId` in a namespace of 40,000 ASCII `n` characters, and an array of 20,000 `{"eventId":"a"}` envelopes on each side. Each raw document is only 320,001 bytes; the policy fits the 128 KiB rule cap and 64 KiB string cap. The current kit namespace regex accepts it. The generated value is `id:<namespace>:1`, yielding **800,400,001** canonical bytes on one side, before the 256 MiB output guard. See [exact size arithmetic](normalization-expansion-recipe.json). Only one small example string was used to compute lengths; no huge output or candidate code was generated/executed.

**Expected.** Raw bounded evidence must not bypass generated-resource accounting. Validate any applicable approved ID constraints before expansion, and check the generated normalization/canonicalization budget before allocating/hashing the expanded document. Comparator resource failure must remain an honest INFRA_FAILURE, rather than being treated as malformed envelopes.

**Actual, inferred from source.** The current namespace lexical validator has no length bound and the qualifier delegates policy validation to it. The long policy fits the raw rule/string limits and normalizeLog([],policy) succeeds. During SCHEMAS, normalizeLog(document,policy) replaces each eventId with id:<40000-byte-namespace>:1 and eagerly computes projectionDigest via canonicalJson, before the IO MAX_OUTPUT guard is reached. The result demands 800,400,001 bytes for one complete canonical string from only 320,001 raw bytes. Runtime string/heap failure is environment-dependent; a thrown range/resource error here is caught as INVALID_INPUT, while an OOM may terminate without a report. No OOM or timing was reproduced.

**Impact.** A small bounded local input can bypass the output cap at the allocation boundary and prevent a reliable report; output chunking protects files only after this eager expansion.

**Remedy.** Add a bounded generated-size preflight/accounting path before the digest-generating normalizer is invoked, using the approved finite metadata transforms, or a bounded/streaming implementation with the same kit semantics. Respect existing approved ID limits where applicable; do not silently invent a smaller namespace/input contract or clone normalization semantics. Distinguish envelope validation from comparator resource exceptions. Keep Q03 ownership/gates intact.

**Required later evidence.** Without constructing the huge output, verify an instrumented/preflight guard rejects or reports the over-budget generation before full normalization/digest allocation, with honest status. Include a within-budget long-namespace control, unchanged protected payload/topology, and the 200k numeric chunk regression.

## Evidence sufficiency and handoff

The pinned schemas/parser/CLI are unchanged from R1, and the Q03 source/declarations are now included in the R2 packet. New tests were read as code only. Their assertions cover complete real-file corpus bindings, JSON/bytes comparison, protected-field and topology negatives, missing/denied/expired authority, unsupported wire and precedence, output non-overwrite, CLI behavior, numeric chunking, receipt parse counts, and genuine file operations wrapped with controlled faults. None is a current independent executable PASS.

CQ01/CQ03/CQ04/CQ05 remain static partial with integrated evidence pending. CQ02/CQ05 resource accounting and CQ06/CQ07 failure precedence have the open findings above. CQ08 and all current integrated acceptance remain NOT_RUN in this review. The normalizer issue is at the qualifier's untrusted-input/resource boundary: do not modify Q03 ownership or its active certification merely to close this review, and do not invent a narrower normalization contract without authority.

Verdict: **REVISE_STATIC**, four original causes addressed in static code, two open P2 findings. No overall approval, PASS_CURRENT, real functional capture, M1 or production acceptance is granted. Source/test/fixture packets remained intact through the closing check. The critic's source-read phase is complete; the lead may unfreeze implementation only for the next explicitly scoped correction.

Next action: diagnose and fix the two residual defects in the **second/final corrective round**, freeze the new exact packet and any derived fixtures, and return for independent review. Keep the execution hold until explicit release after full current Q03 qualification; partial gate progress does not lift it. No background polling or autonomous executable work has started.
