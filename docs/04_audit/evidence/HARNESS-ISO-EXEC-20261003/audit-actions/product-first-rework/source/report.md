# Source rework — frozen disjoint lane

**IMPLEMENTED_NOT_INTEGRATED.** The two source paths are frozen and returned to Lead. No own approval/review, integrated gate or R2 Critic was run. Original frozen R1 source, source ZIP, bundle ZIP and patches remain byte-exact.

## Changes and scope

Only `product-verification/products/shift-assistant/src/source-evidence.ts` and new `src/__tests__/source-validator-regressions.test.ts` were written. F01/F02 repros and R1 report/raw adversarial-complete.log were read. F03/F04, app/store/schema/reducer/old tests/fixtures are outside this lane. No shared ledger, core, lock, C1, original candidate, commit or push was touched.

Runtime validateOrganization now derives bounded fields from the complete persisted patient block, then checks that the located quote covers the complete selected source value. A short quote cannot hide a unit suffix or trailing negation. Header ID/bed values consume their complete delimited scalar; name/identity/source block and full field are bound independently of output order. A quote containing `leito 1, ID 2` cannot validate bed `2`. Nested full-field comparison retains units such as `mg/kg/h`, signs, scale and all free prose. `dose 1 mg/kg` cannot validate `dose 1 mg`.

The runtime no longer grants a field because numericText(local).includes(numericText(value)) succeeds. Only a complete extracted literal or its finite C2 numeral representation can match. Unit spelling/case and surrounding nonnumeric prose remain exact. Compound units are copied whole, without aliases/conversions. Signed quantities, fractions, intervals, percentages, unsupported decimal forms and duration-to-clock conversions are not canonicalized piecewise; identical literal copies remain possible. Exact source quote localization and absolute UTF16 offsets are unchanged.

Array items consume complete semicolon-delimited entries. A pending description consumes the entire task field, with only a finite explicit trailing `às <clock>` separated into quando; another field's clock cannot satisfy the task. Negation cannot be removed from a field or task. Reducer caller tests recompute validation and reject a falsely empty issues list for both F01/F02 rather than merely checking an isolated helper.

## Executed checks

Node22.23.2 scoped test command and raw argv/cwd/exit receipts: final-tests.command.json / final-tests.log / tests.json. **65 PASS, zero FAIL/skips: 61 new regressions + four unchanged oracle tests.** Oracles execute all approved 41 numeral cases/139 comparisons and 21 quote proposals unchanged. Own-file ESLint and formatting passed; final-lint-owned.log and final-format.log identify exactly the two paths. No full typecheck, lint, product suite, public rebuild, core tests or model/provider call was run in this disjoint lane.

Prepared static V2 fixtures pass through the actual strict parser and validateOrganization; selected tests also invoke the actual draft reducer. Positives cover unchanged full compound units/free fields, numeral-by-extenso equivalence, scalar bed/ID, literal identity preservation, existing admission/legacy/audio-text fixtures, list items, explicit time and non-BMP ranges. Negatives cover F01/F02, prefix/suffix/negation loss, partial quotes, numeric ID/bed substrings, cross-field/patient/unit/time borrowing, unsupported C2 compounds and forged reducer issues. These are source-validator/reducer tests, not independent HTTP/disk replay or actual audio/model qualification; Lead's integrated tests remain necessary.

Initial baseline with the new assertions retained 17 failures /33 passes. Subsequent failed development captures remain intact (round1–round4); current final capture is green. Tests were extended, not weakened to fit negatives. No old fixture/target was altered by this lane.

## Freeze and evidence

source-freeze.json SHA256: 7e810a9477e8375de58835e49443c0bcb81f3c0af50bfeff9d043faf585d6e97.

The manifest contains exact hashes of both changed paths and attached source-rework.patch / source-rework.zip. Patch is against the R1 source preimage recorded as source-evidence.before.ts / before.json; its new test path was absent. `patch --dry-run` on an owned preimage copy passed (patch-check.log). The ZIP contains only the two portable product paths. Lead can integrate them after baseline verification, then freeze the combined changes for the one fresh R2 Critic.

sentinels.json verifies all 90 original frozen R1 sources, original archived artifacts and approved SPEC hashes unchanged. It separately records concurrent verification-tree deltas outside this lane, including domain-v2.ts, vertical-state.ts and first-vertical.test.ts, plus app/store if changed. The first freeze attempt deliberately did not claim all verification source MATCH after detecting those deltas. They were not overwritten, fixed or evaluated here. This source lane's two hashes are stable; combined-candidate hashes/gates belong to Lead.

The initial scoped commands used evidence/tmp, producing a node-compile-cache. It is preserved with metadata and excluded from the decision-bearing manifest/archives; no deletion/cleanup was performed. Subsequent operations use private `/home/ricardo/.cache/cvg-harness-audit-actions-20261003/source-rework` as TMPDIR. No binary cache enters the source patch/ZIP or decision manifest.

## Contract limits and handoff

The generic string fields in the stable V2 schema do not supply independent model-controlled unit/field metadata. This implementation verifies bounded complete literals and finite numeral substitutions, never trusts semantic extraction or an inferred clinical equivalence. Named markers require deterministic structural placement (start or a punctuation/newline/parent-label separator); arbitrary prose with an embedded marker is refused. Unsupported free layouts, collective identity or ambiguous scalar headers need explicit relabelling/correction. Unlabelled header species support is limited to existing corpus literals; explicitly labelled species must copy the full literal. This conservative supported subset is documented, not a schema/SPEC change or blanket output rejection. Whole clinical/model corpus qualification remains open.

P07/P09 model HTTP, original ModelOrganizer positive schema intent, clinical D2, shared D009/D011 migration, C1, global harness/product acceptance and prior first-slice operational gaps are unchanged. Static fixtures do not close them. F03/F04 belong to Lead; no eligible shorthand/permanent correction verdict is made here. Next action: Lead integrated gates against both frozen lanes, combined hash capture, then fresh R2 Critic. Runtime/execution/backlog deltas remain this owned report/status only.
