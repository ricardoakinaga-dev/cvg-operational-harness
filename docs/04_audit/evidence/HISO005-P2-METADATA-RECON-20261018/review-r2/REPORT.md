# Independent contract review — R2 FINAL

**APPROVE_SPEC** for SPEC0240 SHA-256 `1c14d92852a6d33475a67b533aadfd22ce01e54b86252c404258d33ef0895161`. Zero open required or optional findings; original R1-F01/P2 is closed in the documentary contract, confidence HIGH. This approves technical boundedness/testability for presentation to human T3 decision only. **MS01–MS12 remain NOT_RUN. No BUILD authority, project approval, release or B6 acceptance is granted.**

## Finding closure

R1-F01 concerned an impossible unconditional selected-product discovery requirement before every acquisition cap. §3.3 now limits new discovery to decisive metadata/link chains acquired inside existing physical limits, explicitly prioritizes every already-discovered violation over later errors/caps, and forbids bypassing file-size, metadata, depth/FD or deadline limits. It preserves the full v2 negative multiset on identical inputs/limit configurations and forbids new refinement from consuming the preexisting negative census opportunity. Thus preacquisition UNKNOWN cannot become an excuse to erase an already-known violation.

MS05 now distinguishes product known then later semantic/workspace cap (VIOLATION) from acquisition failure before target knowledge (UNKNOWN/zero proofs with prior violations retained). MS07 expressly adds an oversized manifest padded with inactive JSON and budget exhaustion before the deciding manifest, without acquisition beyond the cap. These paired mandatory future checks can discriminate preservation from impossible discovery. When another violation is already known, the failed resolution may be UNKNOWN but §3.3's priority keeps that violation in the aggregate result; it cannot be downgraded globally.

Direct local evidence: `raw/01-0240_b6_node_metadata_resolution_scope.md.txt`, §3.3 contains “Toda violação já descoberta, inclusive pela v2, tem prioridade sobre erros/caps posteriores.” and “o novo refinamento não pode consumir a oportunidade do census negativo preexistente.” MS05 mandates the later-cap pair; MS07 mandates the two preacquisition controls. Exact quotes and absolute input paths are also included in verdict.json. The text matches the R1 minimal remedy without weakening the v2 negative-retention requirement or broadening the positive selector language. Closure is documentary, not an assertion that an implementation passes those controls.

## Regression of the same twelve documentary cases

No new scenarios or runtime executions were added. These assessments address the contract, not future test PASS results.

- **C01 — CONTRACT_SOUND_UNCHANGED**: Ordinary demo request; imports {"#private":"./private.mjs"}; closed JS exact export. Relevant contract semantics unchanged by exact normalized diff; R1 reasoning retained. (3.1; MS01)

- **C02 — CONTRACT_SOUND_UNCHANGED**: Same eligible imports, but main.mjs contains import "#private". Relevant contract semantics unchanged by exact normalized diff; R1 reasoning retained. (3.1; MS02/MS04)

- **C03 — CONTRACT_SOUND_UNCHANGED**: Same eligible imports; exported value uses Reflect.get(globalThis,"open"). Relevant contract semantics unchanged by exact normalized diff; R1 reasoning retained. (3.1; MS04)

- **C04 — CONTRACT_SOUND_UNCHANGED**: exports {".":"./main.mjs","node":"./other.mjs"}. Relevant contract semantics unchanged by exact normalized diff; R1 reasoning retained. (3.2; MS03)

- **C05 — CONTRACT_SOUND_UNCHANGED**: Request demo/src/a; exports {"./src/a":null,"./src/*":"./good.mjs"}. Relevant contract semantics unchanged by exact normalized diff; R1 reasoning retained. (3.2; MS02/MS03)

- **C06 — CONTRACT_SOUND_UNCHANGED**: exports {".":"./main.mjs","./src/*":{"0":"../bad"}}; ordinary demo request. Relevant contract semantics unchanged by exact normalized diff; R1 reasoning retained. (3.2; MS01/MS03)

- **C07 — CONTRACT_SOUND_AFTER_REMEDY**: Eligible imports + inactive ./src/* + exact ./alias.mjs -> products/consumer/mod.mjs; later workspace/refinement cap. §3.3/MS05 now require VIOLATION after a product target is known, including later semantic/workspace caps. Within-bounds both-metadata selected product remains mandatory; no alias content acquisition is authorized. (3.3; MS05/MS07)

- **C08 — CONTRACT_SOUND_AFTER_REMEDY**: Valid manifest padded beyond 16MiB in inactive JSON, exact export ultimately points at product alias; no prior target known. §3.3/MS05/MS07 now require bounded preacquisition UNKNOWN/no proof for the oversized manifest or exhausted metadata budget before deciding metadata. Any other previously known violation remains retained and globally prioritized; UNKNOWN here is not permission to downgrade that violation. (3.3; MS05/MS07)

- **C09 — CONTRACT_SOUND_UNCHANGED**: Selected exact ./absent.mjs with no physical target; a neighboring file/main exists. Relevant contract semantics unchanged by exact normalized diff; R1 reasoning retained. (3.2; MS02/MS06)

- **C10 — CONTRACT_SOUND_UNCHANGED**: Installed MATCH package resolves dist/index.js, receipt belongs to another path/root, body otherwise closed. Relevant contract semantics unchanged by exact normalized diff; R1 reasoning retained. (2/4; MS04/MS09/MS11)

- **C11 — CONTRACT_SOUND_UNCHANGED**: Replay a v2 proof with same target URL under new profile while an old origin changes reason or becomes unavailable. Relevant contract semantics unchanged by exact normalized diff; R1 reasoning retained. (4; MS08/MS09)

- **C12 — CORRECTION_ACCOUNTED_UNCHANGED**: 14 body command rows label private analysisRoot as cwd although subprocess inherited repository cwd. Same auxiliary correction is now part of the19 frozen inputs. It corrects cwd metadata only; neither body controls nor proposed v3 are reexecuted. (1/5; auxiliary correction)

## Exact checks and retained boundaries

Read-only Python byte/hash/JSON inspection verified21 SHA-256 bindings: freeze R2, SPEC R2, and all19 frozen inputs; every declared input byte count matches. The previous13 bindings are byte-for-byte unchanged from freeze R1. The prior manifest and verdict hashes match the frozen R2 bindings. The actual unified diff reconstructed from the original R1 SPEC byte snapshot exactly equals spec-r1-r2.diff.txt. After removing only Markdown table-cell padding/separator width, all text outside §3.3/MS05/MS07 is unchanged. observations.json preserves these checks; inputs-manifest.json binds29 standalone plain-text byte snapshots with absolute source paths, sizes and SHA-256. No input was mutated.

The original criteria remain satisfied at contract level: the proposal distinguishes actual native/v2 reconnaissance from unexecuted v3 obligations; positive selection is finite, with inactive imports eligibility and exact exports after global key classification; selected patterns, active #, malformed maps, unsupported selected branches and browser remain refused. Body/closure/provenance/native/interop remain independent barriers. Complete manifest hashes, mutation invalidation, new profile/kernel versions, worker-parent revalidation and rejection of v2 proof replay remain mandatory. Origin multiplicity and MATCH versus verified remain explicit. Negative product detection remains prioritized within bounded acquisition, with the full v2 multiset retained. None of these facts establishes a future implementation result or closes B6.

The auxiliary cwd correction is unchanged and now frozen as an input: SHA-25676f15db667cdd1daf9d1e7958121850d969a2d33650084bd2941d81d6bf8fe64. Body raw cwd fields represent logical analysisRoot rather than actual inherited process cwd; explicit argv supplies analysis root/start, and no native oracle runs in those controls. This remains a metadata correction, not a source/proof change. Native observations remain actual historical native resolution observations only; no new behavior is inferred from unchanged evidence.

## Scope and handoff

Used the already-loaded engineering-framework evidence discipline and existing claim. Refreshed current scoped guidance/coordination/ledger context read-only. Wrote only this review-r2 directory. No prototype, target/helper/native oracle, gate, install, compiler, PG, Docker, network, external effect or descendant execution; no root/index/HEAD/coordination/ledger/source/R1 writes. No broad BUILD0237 code audit or duplication of Lead's full590/source20/Root7/operator/link/state lane. Lead's45-artifact R1 check is a separately bound record, not new implementation certification by this critic. Current ledger snapshots are observations, not claims that concurrent Lead work stayed unchanged.

R2 is the second/final documentary round:2/2 consumed, no third review/reset. Lead may finish its own T1 work and present the exact evaluated SHA for explicit human T3 decision. That decision is still required before BUILD0240. All twelve future MS acceptances are NOT_RUN, without exception. Artifact freeze is artifact-manifest.json; its own digest is returned externally to avoid circular self-hashing.
