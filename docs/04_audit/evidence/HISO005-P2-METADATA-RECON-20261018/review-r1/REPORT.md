# Independent contract review — R1

Verdict: **REVISE**. One required P2 finding, high confidence; zero P0/P1/P3 or optional findings. Subject is proposed SPEC0240, SHA-256 `bbae8db218164d06dc4953bd37298b142f5c741c0463fc242469beb07df11562`, 17,942 bytes. This is a documentary review before human T3 decision, not a third review of BUILD0237. No implementation0240 exists; **MS01–MS12 remain NOT_RUN**. No project approval, B6 acceptance, BUILD authorization, or production authority is granted.

The finite positive delta is generally sound as written: ordinary requests do not activate package imports; exact exports precede pattern matching only after global map classification; eligibility stays a conservative subset; body closure, compiled provenance, physical acquisition, worker/parent validation and origin accounting remain independent obligations. No full Node implementation or whole-B6 implementation is required to resolve this finding.

## Required finding R1-F01 — P2 / HIGH

Affected: §3.3, MS05, MS07. MS05 requires selected product to return VIOLATION/FAIL “antes de qualquer recusa/cap”. §3.3 simultaneously retains all physical/JSON/worker/FD/time limits. Those obligations need an explicit knowledge/acquisition boundary.

Concrete counterexample C08: a valid package manifest exceeds the existing 16MiB limit because of inactive JSON padding and contains an exact export to a product alias. The deciding target has not yet been discovered. The retained helper rejects file size before allocation, charges bytes before reading, then JSON.parse occurs only after successful acquisition (`raw/27-boundary-semantic-resolution.mjs.txt`, lines335–411; charge at196–207). §3 of the retained0237 contract likewise makes acquisition failures UNKNOWN (`raw/23-0237_b6_runtime_resolution_profile.md.txt`). No bounded selector can establish that export before every acquisition cap. The same issue occurs when the finite metadata budget expires before the deciding manifest. This is a documentary incompatibility in an unqualified acceptance, not evidence of a new-code vulnerability.

§3.3's “pontos existentes” and repeated “conhecidas” suggest the intended bounded interpretation; MS05 must make it mandatory and distinguish it from unlimited discovery. A builder must not satisfy one obligation by reading beyond caps, nor silently waive the product acceptance by interpreting all caps differently.

Minimal remedy: preserve every already-discovered violation through later refusals/errors/caps, run the bounded existing negative census before semantic/refinement caps at defined stages, and require the new selected-product VIOLATION when its deciding metadata/link chain is acquired within the existing limits. If a physical acquisition cap/deadline fails before any target is known, require explicit UNKNOWN/zero proofs while retaining any earlier violations. Never bypass caps or drop the full-v2 multiset-retention requirement. Add two discriminating MS05/MS07 controls: (1) known product then a reduced refinement/workspace cap => VIOLATION; (2) acquisition cap before target discovery => UNKNOWN/zero proofs/no loss of previously known violations. This is a small contract clarification, not a request to implement unbounded negative discovery.

Direct evidence is included locally: `raw/01-0240_b6_node_metadata_resolution_scope.md.txt` (§3.3/MS05/MS07), `raw/27-boundary-semantic-resolution.mjs.txt`, `raw/23-0237_b6_runtime_resolution_profile.md.txt`. `verdict.json` carries exact input paths, clauses and remedy in structured form.

## Twelve documentary adversarial cases

These are static thought experiments against the contract, not executed fixtures or future acceptance PASS results.

- **C01 — SOUND_CONTRACT**: Ordinary demo request; imports {"#private":"./private.mjs"}; closed JS exact export. Only presence refusal may be relaxed; all bodies/successors and full manifest remain premises. Raw imports-unused/both-unused are v2 UNKNOWN, not v3 evidence. (3.1; MS01)

- **C02 — SOUND_CONTRACT**: Same eligible imports, but main.mjs contains import "#private". Active # stays UNKNOWN; no textual absence or inactive-code shortcut. Future paired acceptance explicitly required, not observed in current body controls. (3.1; MS02/MS04)

- **C03 — SOUND_CONTRACT**: Same eligible imports; exported value uses Reflect.get(globalThis,"open"). Opaque body blocks proof. Existing opaque-body observations lack the eligible-map combination; MS04 correctly requires that future combination. (3.1; MS04)

- **C04 — SOUND_CONTRACT**: exports {".":"./main.mjs","node":"./other.mjs"}. Reject global dot/condition mixture before exact lookup. Both raw mixed-global native errors and Node source agree. (3.2; MS03)

- **C05 — SOUND_CONTRACT**: Request demo/src/a; exports {"./src/a":null,"./src/*":"./good.mjs"}. Exact null blocks, never falls into a matching pattern or main; exact non-root branch follows same own-property rule. Selected unsupported arrays/numeric branches also remain refused by retained algorithm. (3.2; MS02/MS03)

- **C06 — SOUND_CONTRACT**: exports {".":"./main.mjs","./src/*":{"0":"../bad"}}; ordinary demo request. Inactive values need no global target validation; key grammar and global map classification remain required. Hash entire manifest; do not turn inactive values into proofs. Inactive-bad-target raw is only an analogous v2 literal-subpath observation. (3.2; MS01/MS03)

- **C07 — REQUIRES_CLARIFICATION**: Eligible imports + inactive ./src/* + exact ./alias.mjs -> products/consumer/mod.mjs; later workspace/refinement cap. New path must discover product within bounded readable metadata and retain it over later caps. Raw both-unused-product-alias is currently UNKNOWN; selected-product-alias already records product. No v3 success claimed. (3.3; MS05/MS07)

- **C08 — REVISION_REQUIRED**: Valid manifest padded beyond 16MiB in inactive JSON, exact export ultimately points at product alias; no prior target known. Before-all-caps discovery is incompatible with bounded preallocation refusal. Proposed documentary counterexample only; no huge fixture created or run. R1-F01. (3.3; MS05/MS07)

- **C09 — SOUND_CONTRACT**: Selected exact ./absent.mjs with no physical target; a neighboring file/main exists. Native ESM URL does not establish availability; no extension/main fallback or proof. Tab/percentual target normalization remains expressly forbidden. (3.2; MS02/MS06)

- **C10 — SOUND_CONTRACT**: Installed MATCH package resolves dist/index.js, receipt belongs to another path/root, body otherwise closed. Physical identity, provenance, closure and origin proof remain separate. No Vitest name/URL exemption, no credit from MATCH alone. (2/4; MS04/MS09/MS11)

- **C11 — SOUND_CONTRACT**: Replay a v2 proof with same target URL under new profile while an old origin changes reason or becomes unavailable. Reject old/tampered profile proof; preserve origin multiplicity and null physical hash. Layered baseline/history/current ledgers cannot be treated as disjoint counts or resolved by disappearing reason. (4; MS08/MS09)

- **C12 — CORRECTION_ACCOUNTED**: 14 body command rows label private analysisRoot as cwd although subprocess inherited repository cwd. Operator omits cwd; argv explicitly supplies frozen engine and root/start. Native collector passes cwd. Bind correction and never use these rows as native or v3 tests. (1/5; auxiliary correction)

## Evidence and exact checks

`freeze-verification.json`: recomputed SHA-256 for freeze + SPEC + all13 bound inputs (15/15 match); checked every declared input byte count. `inputs-manifest.json` binds34 inspected inputs with absolute paths, byte counts, SHA-256 and standalone plain-text byte snapshots. Five duplicate snapshots from an initial interrupted capture are explicitly mapped as additionalSnapshots; none supersedes an input.

`observations.json`: parsed the61 preexisting native/operator command records (exit codes0); matched all28 selector-native outputs to recorded raw JSON; recomputed all14 body stdout hashes and compared summary status/proof counts to raw kernel results, all v2; compared all3 captured native source strings to the corresponding source bytes/hashes. Inspected4 real oracle observations and census structure (359 records,358 physical files,1586 candidate edges; summary360 presence-guard edges;357 Vitest,2 OTel,1 ReactDOM). Census attribution is recorded observation, not a one-origin/one-edge proof. No historical run was reexecuted by this reviewer.

Static source inspection checked Node ESM resolve lines555–615 (global dot/condition classification then own exact export before patterns) and831–856 (# dispatch); retained helper selectExports/censusEntry/ownerAt/resolve and bounded read; engine body guard and version handling; checker semantic kernel integration. Source contracts0236/0237 hashes are cf07fd5dd87220cd3c41704a64d2bd294a8b972bfbf230e38fb6c3453fbffa49 and81f091fa8edaf3ce89543773e24960b4dc9feff3de15f6552940192e9f1ef5f1 respectively. This establishes the retained documentary/implementation context, not new certification.

The supplied auxiliary body-operator correction is bound independently:1,082 bytes, SHA-25676f15db667cdd1daf9d1e7958121850d969a2d33650084bd2941d81d6bf8fe64. In `raw/25-check-body-separation.py.txt`, subprocess.run omits cwd, whereas argv supplies frozen engine/private root/start explicitly; the native collector in `raw/26-collect-node-witnesses.py.txt` passes cwd. The14 raw cwd fields therefore describe analysisRoot, not actual inherited process cwd. Original frozen bytes are unchanged. No native oracle runs inside those body controls; their PROVEN controls are v2 synthetic results only. Correction is not treated as fake proof or v3 validation. Descriptor high-water correction is likewise retained separately from actual closure observations.

## Scope, limitations, and handoff

Executed only read-only shell/static Python metadata/JSON/hash inspection and writes inside review-r1. No target module, approved helper, native oracle, gate, install, PG, Docker, compiler, prototype selector, network, external effect, descendant, commit or push. No verification of historical target marker absence beyond the recorded evidence. Lead separately owns full590/source20/Root7, current operator and shared-ledger/link checks; this review does not duplicate or certify that lane. Full-file snapshots of large ledgers preserve observed bytes; substantive reading was confined to current scoped top entries. Two initially guessed absent paths were corrected by file discovery and are recorded in observations.json; neither absence is a finding.

Root AGENTS, constitution and coordination were read. The existing claim covers this review; explicit user ownership forbids ledger/coordination/index/HEAD changes, so no general state-update instruction was applied outside the review directory. The frozen inputs and immutable source were read only. Engineering-framework skill was used for evidence discipline, without starting BUILD/AUDIT runtime qualification.

Next action: Lead resolves R1-F01 and freezes the revised proposed contract, then uses at most R2 (second/final documentary round) before asking for human T3 decision. Future implementation review has its own authority; old BUILD0237 approvals and its exhausted review budget are not reopened. Artifact freeze is the final artifact-manifest.json; it hashes this report, verdict, input manifests, raw observations and snapshots. Its own digest is returned separately to avoid a self-hash cycle.
