# R19 bounded I0 handoff — I0_IMPLEMENTED

SPEC0209 T2 / P100-003. Source/tests stable; this bounded lane stops at handoff. Fresh independent I1, live collection and any catalog rebase belong to Lead. No I1 self-approval or acceptance/parity PASS is asserted. Lead's other integration/unit/PG/E2E/coverage/0214/0216 work is outside this result and was not awaited or treated as R19 acceptance.

## Findings reproduced and repaired

Read all three findings from critic-reference-r18-result/findings.json (SHA-256 `fd2b520c0feb06983855a4abab99a570218cabee12861179de93c63476ae4285`). Frozen SPEC0209 and role-decisions.json were read and hashes verified unchanged after the work. witnesses.json captures the three exact inert witness sources from that report.

1. I1-R18-01: Python `eval("40 + 2")` in a parameter annotation plus its string return mirror reproduces loss of runtime evidence/provenance. The existing pure-annotation allowed-AST predicate is now shared by projection and indexing. Dynamic annotation/return expression descendants supply source-local literal evidence without evaluating anything. Their UNKNOWN projection includes literal SHA-256/byte-length provenance; mirrored pure annotations collide and become UNKNOWN. The same repair is tested with an ordinary call name in both parameter and return slots, not an eval-specific or sink-specific rule. Pure annotation containers retain declaration-only literals exactly.
2. I1-R18-02: The exact physical Markdown witness combines the TS runtime `/C_ROUTE/` argument and a JSON `$ref` mirror. The existing `$ref` preservation branch now checks the already-shared physical-source payload index. Known collisions use the existing UNKNOWN reason/digest/length projection; a locator-only paired document retains its exact `$ref` and literal type. No collector topology or regex expansion was added.
3. I1-R18-03: The exact quoted module witness `opaque module one` now appears in each child declaration's `module_context` metadata, separately from existing identity projection. The existing declarationName classifier preserves its exact spelling or returns UNKNOWN digest/length on source-local payload collision. Ordered context chains follow nested scopes and do not leak into siblings/top level. Spaced and punctuated/Unicode selectors are covered. No module entry is added, removed or merged, and existing opaque symbols/IDs remain under their original formulas.

## Actual commands and exits

commands.json records exact executable/argument vectors and cwd. All tests use disposable synthetic fixtures and the existing AST collectors; the Python eval/ordinary calls and TS Worker in fixture text are never executed.

- RED, red.log: exit 1; **8 failed / 92 passed / 100 total**. All 90 previous cases passed. The three dynamic-annotation variants, shared `$ref` collision, two module positives, nested scope context and module collision assertions failed as expected. Pure-Python and locator-only positives passed already.
- GREEN, green.log: exit 0; **100 passed / 100 total** after the smallest bounded source repair.
- lint.log: exit 0, two owned source paths only; stdout/stderr empty.
- format.log: exit 0, two owned source paths only.
- No capacity retries, full unit, coverage, live reference collection or broad suite run in this lane.

## Retention and ownership

Before source/test edits, claim.json recorded authorization, paths and input hashes, and full owned source bytes were saved as before-reference-contract-catalog.mjs and before-reference-contract-catalog.test.js. Ten new tests were inserted before the existing cases; their RED version and formatted insertion are retained. There was no historical fixture/assertion refinement request or edit in R19.

retention.json proves the entire original 90-case suffix is byte-identical, including all 16 R18 selectors, the previously adjudicated historical case, and all three R17 surrogate cases. The original embedded opaque surrogatepass/conditional-encoding block is byte-identical (SHA-256 `f82a1b5785eba2eed6802b652e276316de38ed5498bfe610b10a788e63381eb4`). The remaining test preamble is byte-identical except disposable evidence directory role-r18 -> role-r19. No old assertion, input source or requirement was removed.

New witnesses assert fixed per-source entry counts (Python 2, Markdown 3, ambient-module 2, nested/sibling/outside 5), provenance/ownership/NOT_VERIFIED fields, distinct IDs and existing identity formulas. ID construction, symbol projection, source paths, owner mapping and requirement inventory logic were not changed. Module-context enrichment and UNKNOWN provenance/collision repairs change shapes/contract hashes as expected; live impact was not measured in this lane.

Only the two owned collector files and new role-r19 evidence were written. No frozen previous evidence/report, actual reference, live catalog/map/history, root checkout, shared ledger/lock, other phase source, network/provider/DB/install or descendants were used or changed.

## Bounded limits

This remains finite, syntactic, physical-source-local role analysis and exact literal-digest matching. No expression evaluator, name/callee resolver, cross-file data flow or whole-program analyzer was added. Dynamic annotations are conservatively UNKNOWN; their contained string/bytes constants may conservatively obscure identical declaration text elsewhere in that physical source. Pure declaration annotations keep their established AST roles; the existing type-parameter metadata exclusion remains. Existing Python stdlib AST/unparse and TypeScript parser limitations remain. Surrogate provenance continues to use the unchanged R17 encoding behavior.

Module metadata follows already-recognized TypeScript module/namespace declaration ancestry only; it does not resolve imported modules. Same-source quoted-selector payload collisions remain UNKNOWN. This result proves the focused regressions, not universal absence of implementation-language text, catalog parity, or live acceptance.

## Exact final deliverables

- scripts/reference-contract-catalog.mjs: `ae8481ffce22c69980505345cbde6c997ae462b9ebacc54a0c5c8adad75021a8`
- tests/reference-contract-catalog.test.js: `7e0cf8c0e48f0063d60a3028679f44b5eee8e4c2411b0082e7b1c512245a1f63`
- exact-diff.patch: `1d3b2f968c03bc406647a572dae18edfb59bf62565fc8543417636dc4eac9001`

exact-diff.patch compares captured R18 baseline source bytes with final owned files only. sha256.json indexes final sources and every evidence file except itself. Source/tests will receive no further edits in this lane.
