# Independent resolver review R2 — REVISE

**One mandatory P1 / HIGH-confidence finding remains.** R1-01 and R1-02 are resolved in current independent controls. This is the **second and final** round: cycle outcome **FAILED_QUALITY_BAR**, status **IMPLEMENTED**, not self-approvedDONE. No fullcert, integration, B6 or production acceptance is granted.

Candidate `7ad6d2f7a3da48786b0770f6cd7a259aab4cc20a`, base `75dfef50d0b5bc5a8063829ea4c63af8b4ab8b54`. [SPEC0236 snapshot](inputs/007-0236_b6_semantic_boundary_proof.source.txt) SHA-256 `cf07fd5dd87220cd3c41704a64d2bd294a8b972bfbf230e38fb6c3453fbffa49`; K0–K7 authority unchanged. [Freeze R2](inputs/009-source-freeze-r2.json). [Input manifest](input-manifest.json) SHA-256 `272e8e83e1a0a88c7d12c892d3601becc9913145ba2b8a59c71e917c73bc15a0`. [Machine verdict](review.json); [unchanged criteria](criteria.json).

## Mandatory finding

**R2-01 — P1 / HIGH: built-in precedence permits proof of an unselected installed implementation.** The bare-specifier branch in `scripts/boundary-semantic-engine.mjs` (lines324–363) enters self-reference/package lookup without first recognizing native built-in names. This is an existing v1 conformance gap still present in R2, not a claimed regression introduced by the two R2 guards.

- **S13 / CJS:** the pinned `require.resolve('module')` returns `module`. A synthetic `node_modules/module` has a byte-identical independent reference and harmless `module.exports=1`. Given this valid physical identity premise, the supervised kernel analyzes that installed file and returns `PROVEN`, `validation.valid:true`, two SourceFile proofs, installed `PROVEN`, and zero unknowns. It has proved a primitive substitute; the selected native export is a module/loader capability. [Observation](S13.json), [kernel input/output](S13.kernel.json), [oracle command](raw/033.command.json), [oracle result](raw/033.stdout.txt), [kernel command](raw/035.command.json), [kernel raw result](raw/035.stdout.txt).
- **S20 / ESM:** pinned `import.meta.resolve('fs')` returns `node:fs`, while the kernel analyzes the same-named installed `node_modules/fs/index.js` and likewise emits two valid-looking proofs and installed `PROVEN`. [Observation](S20.json), [kernel input/output](S20.kernel.json), [oracle command](raw/052.command.json), [oracle result](raw/052.stdout.txt), [kernel command](raw/054.command.json), [kernel raw result](raw/054.stdout.txt).

The pinned CJS `_resolveFilename` returns recognized built-ins before filesystem/package lookup (lines1346–1349); ESM `packageResolve` returns the `node:` URL before package discovery (lines762–766). [CJS source](inputs/020-node-internal-modules-cjs-loader.source.txt), [ESM source](inputs/021-node-internal-modules-esm-resolve.source.txt), [frozen engine](inputs/025-boundary-semantic-engine.mjs.source.txt), [binary/source bindings](native-bindings.json). Native `.js/.json/.node` extension keys were also independently read from the trusted runtime.

**Affected criteria: C1/C2, SP07/SP09/SP10/SP17.** Physical identity of a homonymous installed package cannot prove the implementation Node actually selects. Both CLI witnesses remain `INCOMPLETE/exit1/semanticUNKNOWN` through a separate installed-identity refusal, so **no new global CLI false PASS is claimed**. The separately exported kernel nevertheless publishes consumable false proofs, the same kind of mechanism violation evaluated in R1.

Required repair: conservatively refuse unmodelled built-ins before bare-package/self-reference selection and proof publication in both modes, using the exact trusted runtime identity rules. Keep native/built-in positive summaries unsupported; this is a negative0236 correction, not positive0237. Preserve these witnesses. This final-round verdict does not authorize another review cycle or fullcert.

## Resolution of R1 findings

**R1-01 resolved:** S01 repeats the absolute-main witness. Native still selects the absolute external private-fixture file; the current kernel and CLI now return `UNKNOWN`, no consumable proofs, installed `verified:false`. The new guard rejects the selected absolute main before joining it to the package key. [S01](S01.json), [kernel](S01.kernel.json).

**R1-02 resolved:** S02–S04 independently cover `.js`, `.json` and `.node` siblings; S07 covers a nearer sibling before an outer package. Each standalone kernel is UNKNOWN with empty proof arrays. S02–S04 CLI exits2 with retained `ENOTDIR` and no JSON, an explicit tested refusal rather than proof. S05 confirms exports win over a sibling; S06 confirms exports ignore an unselected absolute main. Both are `PASS/PROVEN/verified:true`, with the exact native-selected file among current proof inputs. [Sibling witness](S02.kernel.json), [nearer witness](S07.kernel.json), [exports/sibling](S05.json), [exports/main](S06.json).

## Bounded evidence

Twenty distinct scenarios completed in one foreground collector attempt: **18 met their expectation; S13/S20 reveal the one mandatory gap**. There are54 recorded oracle/checker/kernel/compatibility calls. Every selected positive file is present in the current CLI semantic inputs; five positives agree with native selection. [Positive bindings](positive-selection-bindings.json). URL-sensitive exports, nearest self-reference, exact extensionless exports, JSON fallback, interop, invalid/conditional exports remain refused in their controls. Finite concatenated product import still gives `FAIL/VIOLATION` (S14).

S09 normal/strict trust payloads match after excluding telemetry. S15 compares the old75df and R2 public checkers on the **same physical input**, default and P1: stdout/stderr/exits are byte-equivalent. All test-call source bodies from base and R1 remain unchanged:19/31 declarations respectively before parameter expansion (the historical21/38 expanded controls). The current source has35 declarations/44 expanded producer controls. This is source-preservation evidence, not independent execution of the producer's159-control suites. [AST test-call comparison](static-controls.stdout.json), [static command](static-controls.command.json), [current frozen tests](inputs/026-b6-0236-boundary-integration.test.js.source.txt).

| ID | Scenario | CLI / semantic | Direct kernel | Focal criterion |
| --- | --- | --- | --- | --- |
| S01 | R1-01 absolute legacy main | INCOMPLETE / UNKNOWN | UNKNOWN | PASS |
| S02 | R1-02 CJS sibling js | exit2/noJSON / noJSON | UNKNOWN | PASS |
| S03 | R1-02 CJS sibling json | exit2/noJSON / noJSON | UNKNOWN | PASS |
| S04 | R1-02 CJS sibling node | exit2/noJSON / noJSON | UNKNOWN | PASS |
| S05 | exports precedes sibling file | PASS / PROVEN | PROVEN | PASS |
| S06 | exports ignores absolute main | PASS / PROVEN | PROVEN | PASS |
| S07 | nearer CJS sibling precedes outer package | INCOMPLETE / UNKNOWN | UNKNOWN | PASS |
| S08 | legacy main extension fallback positive | PASS / PROVEN | not separately called | PASS |
| S09 | exact js exports positive and strict equivalence | PASS / PROVEN | not separately called | PASS |
| S10 | exact exports missing extension | INCOMPLETE / UNKNOWN | not separately called | PASS |
| S11 | URL tab target refused | INCOMPLETE / UNKNOWN | not separately called | PASS |
| S12 | nearest self-reference before outer package | INCOMPLETE / UNKNOWN | not separately called | PASS |
| S13 | CJS builtin name precedes same-named installed package | INCOMPLETE / UNKNOWN | PROVEN | FAIL |
| S14 | finite concatenated product remains FAIL | FAIL / VIOLATION | not separately called | PASS |
| S15 | closed ESM with default and P1 byte comparison | PASS / PROVEN | not separately called | PASS |
| S16 | JSON fallback before main index refused | INCOMPLETE / UNKNOWN | not separately called | PASS |
| S17 | require into ESM remains unsupported | INCOMPLETE / UNKNOWN | not separately called | PASS |
| S18 | invalid exports dot segment refused | INCOMPLETE / UNKNOWN | not separately called | PASS |
| S19 | conditional exports remain unsupported | INCOMPLETE / UNKNOWN | not separately called | PASS |
| S20 | ESM builtin name precedes same-named installed package | INCOMPLETE / UNKNOWN | PROVEN | FAIL |

[Results](results.json), [scenario procedure](probes.mjs), [receipt helper/recorder](fixture-helper.mjs), [launcher command](probe-launch.command.json), [launcher exit0](probe-launch.exit.json), [stdout](probe-launch.stdout.txt), [collector attempt status](collector-attempts.json), [fixture hashes](fixture-manifest.json), [synthetic identity bindings](synthetic-identity-bindings.json). All fixture package inventories match their reference bytes. These are controlled private identity premises, not offline npm/SRI attestations. Each `raw/*.command.json` records argv/cwd/environment/stdin/timestamps/exit/signal and has retained stdout/stderr siblings. No invalid or incomplete R2 attempt is omitted; none occurred. Expected nonzero CLI/oracle outcomes remain explicit.

## Integrity, scope and final stop

All17 source files match HEAD and frozen hashes before/after; exactly engine and CLI tests differ from base, the other15 are unchanged. [Before](source-before.json), [after](source-after.json). All760 R1 files and their file set are unchanged. [R1 before](r1-before.json), [R1 after](r1-after.json). Pinned Node22.23.2 and all five saved native-source bodies match independent extraction. No target application was imported/executed; oracles only resolve, and trusted analyzer parsing is compile-only.

The implementation-independent critic continues R1 into R2; independenceI1 applies from initial entry, not a new fresh-context claim this round. Zero descendants. Only `review-r2` and its private temporary subtree were written. Shared ledgers, source, lock/manifests, R1/older sealed evidence and peer resources stayed read-only by reviewer action. Lead concurrent compiled/consumer/native-documentation work is outside this verdict.

This review does not revalidate full suites, compiled receipts/consumer projections, integration, B6 or production. Producer159 passes and historical16gates/38hashes are not current independent review approval. Native conformance is not exhaustively established by20 fixtures.

**Stop: R2 of2,20 scenarios, mandatory R2-01 open.** Lead should record the failed quality bar and reconcile the negative conformance repair under the existing0236 contract. Preserve all results; no automatic third round, budget reset, fullcert or promotion follows from this verdict. Status remains **IMPLEMENTED**.
