# Independent R1 — SPEC0225 journal BUILD

**Review delivery: IMPLEMENTED. Verdict: REVISE.** One mandatory code defect and one required evidence gap. Largest gap: a legitimate confirmed result is refused after recovery canonicalizes an otherwise identical tool input. J16 remains **NOT_COMPLETE**.

Candidate: `/tmp/cvg-claude100-exec-20261017/journal0225-candidate`, HEAD `428d0021c8ef61022d352831059e76567100b90d`, compared with `2f0cc11f7bdda82456f069ac7cc8914cb5335c57`. All23 frozen source files and their packet snapshots match the contract. Approved adjusted SPEC SHA256: `f26ccead3ad43d55d480ba08533e55bc9792a299608667570850668b0d12b315`.

Canonical contract SHA256 verified by UTF-8 JSON of the `contract` object, sorted keys, compact separators, no ASCII escaping: `c807d35015175aceae6b1ccb46510a9c17e05c49ceab99a31a8375ed7c6b3743`. The integrity field is outside that canonical payload. The manifest separately binds raw contract bytes.

This is the first of at most two code-review rounds. Existing human APPROVED_WITH_ADJUSTMENTS authority is unchanged. No whole SPEC approval, release approval,117+17 parity, rework authorization or renewed human gate is granted.

## Mandatory code finding — R1-01 / P1

**Make proposal identity survive canonical input serialization.** SPEC §7 and J08/J10/J11 require recovery of the same committed result without another tool body after a lost checkpoint/acknowledgement.

`packages/harness/src/effect-journal.ts:308` hashes a `JSON.stringify` object containing the original input. `complete-journal-recovery.ts:122` builds the recovery candidate with `JSON.parse(completeSnapshot(pending))`, which sorts nested object keys. `iterative-runtime.ts:980` passes that candidate input into `readNativeConfirmedEffect`; `effect-journal.ts:486` recomputes the order-sensitive proposal hash and returns null on mismatch. V2 physical checkpoint serialization also sorts keys (`complete-checkpoint.ts:510`).

The reachable source chain does not normalize the initial input first: Hybrid parses model text and sanitizes only decision fields (`packages/orchestrator/src/hybrid-orchestrator.ts:889–905`, `packages/contracts/src/execution-v2.ts:348`); dispatch and the kernel pass its toolInput to the journal wrapper (`iterative-dispatch.ts:386`, `kernel/pipeline.ts:505`). Capability input normalization happens inside that wrapper, after reservation identity has already been computed.

The private exact-source component probe exercises **the real candidate helper and callback**. For `{z:1,a:2}` and `{nested:{z:1,a:2}}`, the helper accepts the settled step, direct same-input recovery returns the output, but recovery using the helper's own candidate returns null. A sorted `{a:2,z:1}` control recovers and stages one step. Every body runs once and the journal remains CONFIRMED. A separate probe shows reservation replay rejects the reloaded input as a different proposal. Thus the demonstrated failure is recovery availability, not a demonstrated duplicate effect or row mutation.

Evidence: private `probe-recovery-input-result.json`, `probe-input-order-result.json`, and their module-binding records. Reproduce with:

```sh
/home/ricardo/.nvm/versions/node/v22.23.2/bin/node /tmp/cvg-claude100-exec-20261017/journal0225-build/code-review-r1/probe-recovery-input.mjs
```

The probe uses pinned TypeScript transpilation of exact source leaves, changing only module specifiers. Its in-memory get stamp is explicitly a component seam; it does **not** prove native PG provenance, an OS restart or a full factory run. Native factory reproduction is UNKNOWN because R1 was prohibited from PG/integration execution. The helper/callback failure and connected source chain are directly demonstrated.

Close with a consistent identity across initial reservation and canonical recovery, retaining actual changed-input/proposal/fingerprint/fence refusal. An unsorted and nested-input regression must discriminate this failure. The present native fixture uses `toolInput:{}` (`journal-result-process.ts:863`), explaining why the output-rich matrices do not reject this defect. Compatibility of existing proposal hashes must be handled deliberately by the Lead; this report does not authorize implementation.

## Required evidence finding — R1-E01 / P2

**J07's isolated minimum matrix remains open.** The approved §11 requires a distinct discriminating case for each required guard, including absent migration/wiring and mixed fleet, with other preconditions valid.

The current native91 suite provides useful mode, role, ACL, checksum, trigger, session, forged-GUC and DML negatives. Its finite mutation cases (`complete-effect-result-postgres.integration.ts:1550–1650`) include checksum tampering, which does not demonstrate missing expansion/activation wiring. The old-login session case is not evidence of an additional mixed-fleet/bin­ary case. The native preclaim case explicitly exercises a preflight method plus downstream counters (`:2012–2052`). The wider catalog-tamper matrix is a mocked-catalog unit fixture (`journal-result-preclaim-readiness.test.ts:107–248`). No supplied current native witness independently closes the missing mode1 composition conditions.

The subsequent339PASS focal run executes the original13 preflight PG regressions. They cover legacy/default-role behavior; they do not turn the added mocked catalog cases into native mode1 witnesses. Supply source-bound isolated witnesses or retain J07 open. This finding is an evidence shortfall, **not** a demonstrated readiness bypass. R1 performed no PG/fleet reproduction; that result is UNKNOWN. An unindexed proof may be supplied for audit rather than presumed absent globally.

## Source assessment and evidence boundaries

All production deltas were examined: the codec, activation renderer, readiness verifier,0030 migration/registration, PostgreSQL adapter, journal wrapper, recovery predicate/staging, iterative runtime and worker preflight. Supporting source bindings cover the unchanged canonicalizer, checkpoint codec, factory, dispatch/kernel, Hybrid and fence/tenant code.

The codec bounds base64 before allocation, checks exact envelope fields, padding/re-encoding, SHA/length, fatal UTF-8/BOM, lexical complexity and canonical equality. SQL SELECT/RETURNING share the bounded projection; logical corruption is not confused with absence. The guard distinguishes mode/principal and preserves confirmed rows. Readiness checks the actual connection without a cross-connection cache. The read provenance stamp is restricted to validated mode1 CONFIRMED get results without an assigned transaction ID; confirm/reserve results remain unstamped. Recovery stages before CAS, does not adopt on ambiguous ACK, and preserves the old checkpoint on the inspected failure paths. Both capture/encoding failure paths preserve started/uncertain handling, with the primary and secondary errors retained when uncertain settlement also fails. These are scoped source observations, not a blanket approval of unexecuted conditions.

R1 independently parsed current command output/JUnit and rehashed every declared binding input:

| Lead run | Actual result | Bound inputs | R1 execution |
| --- | --- | --- | --- |
| native-1792336818658 |91PASS /0FAIL /0SKIP |46, no drift |Artifact inspection only |
| native-1792337039621 |8PASS /0FAIL /0SKIP |37, no drift |Artifact inspection only |
| native-1792337046478 |19PASS /0FAIL /0SKIP |34, no drift |Artifact inspection only |
| native-1792337063914 |17PASS /0FAIL /0SKIP |50, no drift |Artifact inspection only |
| native-1792337066750 |66PASS /0FAIL /0SKIP |34, no drift |Artifact inspection only |

The earlier focal run is preserved as326PASS/13PENDING. The later `j07-preflight-pg-command.json/report.json` records339PASS/0FAIL/0PENDING with `TEST_DATABASE_URL`. Both are five-file runs under the original config, not the full unit/PG/E2E/certification gates. The SQL expansion evidence uses unchanged SQL/runner bytes and identical22-row before/after digests, including rollback of interrupted expansion. Its owner-only inactive denial is not service-role proof. Cleanup receipts record no schemas/residual roles/clients in the extra preflight DB, its removal, and unchanged original22-row legacy state; R1 did not inspect or operate the live resource.

## Required-criterion mapping

“Supported scoped” means the inspected implementation and named boundary evidence support that subset. It does not close the whole criterion or qualification automatically.

| Criterion | R1 status | Evidence and remaining boundary |
| --- | --- | --- |
| J01 | SUPPORTED_SCOPED | Native91 fresh write/get/re-reserve processes, own-null/value/type/bytes/hash checks; not a whole-program claim. |
| J02 | SUPPORTED_SCOPED | Native91 and public66 cover NUL/escapes/Unicode/reserved keys/apparent envelopes and JSON-looking strings. |
| J03 | SUPPORTED_WITH_BOUNDARIES | Logical byte/depth limits native. Node1M/+1 component discrimination plus public byte dominance (§11.1). Physical envelope E±1 uses virtual SQL/driver component, not damaged persisted native rows/RETURNING; shared projection reviewed statically. |
| J04 | SUPPORTED_WITH_BOUNDARIES | 43 native corruption/SQL refusal cases plus bounded codec controls. SQL-invalid shape cases are rejected by DB; no claim they exercised adapter decode. No new code failure identified in inspected codec. |
| J05 | SUPPORTED_SCOPED | Current SQL/runner hashes bind the expansion interruption and identical22-row before/after digests. Native legacy-null/SQL-NULL/FAILED no-adoption. General v0 refusal branch reviewed; no full J15 drill inferred. |
| J06 | SUPPORTED_SCOPED | Three original full reader modules, two distinct SQL texts, legacy controls9 and42501 outcomes12; PUBLIC/inherited known-bad readiness controls6. Current shared support is not certification of historical whole binaries. |
| J07 | PARTIAL_EVIDENCE | R1-E01. Native negatives and339focals do not close every isolated minimum guard/fleet witness. |
| J08 | REVISE_CODE | Real rollback/commit-ack observations exist; R1-01 breaks the matching-proposal recovery/replay invariant for reordered inputs. |
| J09 | SUPPORTED_SCOPED | public66 covers22outputs at full-CAS SIGKILL; frame/receipt/usage assertions and independent prekill read inspected. Does not cover all toolInput permutations or parity. |
| J10 | REVISE_CODE | public66 includes distinct journal-commit and commit/preack crashpoints. All use empty toolInput; R1-01 defeats nonempty reordered matching inputs. |
| J11 | REVISE_CODE | context19 covers output/depth/node/frame bounds,300KiB,save-failure and7 recovery faults. New callback/CAS staging is conservative on faults, but R1-01 blocks legitimate unsorted-input recovery. |
| J12 | SUPPORTED_SCOPED | capture8 keeps output1MiB and wholeToolResult8MiB distinct; 8MiB positive is component capture, public confirmation still fails1MiB. Started/uncertain fresh readers preserve checkpoint and counters. Primary+secondary errors retained in AggregateError for failed settlement. |
| J13 | SUPPORTED_SCOPED | bound17 includes real0029 AND0030 guards/fence positives, independent DML refusals, actual lease expiry during encode and reclaimed outer attempt; unbound proofs not substituted. |
| J16 | NOT_COMPLETE | Five focal files progressed326PASS+13PENDING to339PASS/0PENDING with TEST_DATABASE_URL. Full current Node22 unit/PG/E2E/certification and pertinent legacy/published/capability/tool/SDK regression qualification remain pending; no certificate transferred. |

Only J14 and the full J15 drill are deferred. J05–J07 policies remain required. J16 is an open qualification gate, not a newly discovered code defect: the five-file339PASS run does not establish all pertinent worker/published/capability/tool/SDK regressions, full Node22 gates, certification, observer coverage or baseline-red disposition. No full qualification or parity credit is transferred from historical reports.

## Review procedure and exit

R1 worked directly without descendants. Writes were restricted to this reviewer directory and the authorized private TMP. No candidate/root source, tests, generated outputs, dependency/lock files, shared configuration, ledgers, frozen packets, credentials or runtime resources were modified. No PG, Docker, apps, providers, network, installs, certify, E2E or full-suite commands ran.

Two private component probes ran under Node22.23.2. The first input-order probe initially failed because the reviewer expected the wrong error-message text; that oracle error and original probe are preserved. Only that expected text was corrected, after which all discriminating behavior assertions passed. No implementation assertion was relaxed.

Required returns are this report, `verdict.json`, `evidence-manifest.json`, source-before/after records and bound probe/evidence artifacts. The manifest hashes the report/verdict and all own artifacts (except its own bytes and its digest receipt, avoiding a circular hash); its detached SHA256 receipt binds the manifest itself. Status IMPLEMENTED describes delivery of R1, not completion of BUILD or SPEC. Next action belongs to the Lead: disposition R1-01 within the existing review budget and retain J07/J16 evidence gates explicitly open. R1 grants no additional rework authority.
