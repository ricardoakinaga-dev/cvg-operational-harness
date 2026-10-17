# R20 bounded I0 scratch handoff — proposed implementation only

Status: I0_IMPLEMENTED_SCRATCH_PROPOSAL. The two R19 worktree collector files were never edited or applied in this lane and remain byte-identical to their captured baseline. Only `/tmp/cvg-pare100-exec-20261014-6az3hlay/reference-r20-scratch/**` and this new worktree evidence subtree were written. Stop at this handoff; Lead owns exact application after coverage, current-worktree focused verification, fresh I1, live collection and rebase. No self-I1, T3 authority, criteria/denominator reduction, acceptance or parity PASS is asserted.

## Inputs and proposed change

All four fresh findings were read in full from critic-reference-r19-result/findings.json, SHA-256 `926d68970ee1b71b8bf01ff272c478be3adf69f73188e682b024f48971dc7190`. Frozen SPEC0209 and role-decisions hashes remain unchanged. witnesses.json captures the exact inert sources; Worker/guest syntax was parsed as data only, never executed or loaded.

- I1-R19-01: JSON string classification is shared by the physical-source prepass and projection. Every string without a recognized declaration-vocabulary role enters the local payload map, including root strings and unclassified strings in known schema fields. A later or earlier literal type cannot regain copy privilege for those same bytes.
- I1-R19-02: All input JSON string-copy branches now pass the same payload-collision guard, including built-in types and `$ref`. Their existing finite declaration rules remain; no lexical program blacklist was added. Genuine clean schema types/reference/name remain exact.
- I1-R19-03: The existing Mermaid node-ID/simple-edge grammar now projects matching source-local payload IDs as UNKNOWN objects with SHA-256/length/reason. Simple edges with a colliding endpoint become `{from, operator, to}`; equal node and endpoint opaque projections preserve syntactic connectivity. Noncolliding graph nodes and simple edge strings keep their old representation. Complex/unrecognized edge text retains its existing opaque fallback.
- I1-R19-04: Exports retain exact `module_selector` declaration metadata through existing declarationName collision policy, for named, star and namespace exports. Legacy `from` projection and ID formulas remain unchanged. A same-source payload collision makes the new metadata UNKNOWN rather than copying bytes.

No nodeName, projectIdentity, ID formula, source/owner mapping or inventory/requirement deletion logic was changed. Shapes/contract hashes can change; no live catalog or migration map was produced.

## RED / intermediate conflict / GREEN

Every command ran with cwd `/tmp/cvg-pare100-exec-20261014-6az3hlay/reference-r20-scratch` using Node22 fixed local tools via a single symlink to worktree/node_modules; there was no install. Scratch vitest.config.mjs selects the Node environment and scratch `.vite` cache. ConfigLoader runner avoids bundled config writes into shared node_modules. ESLint/Prettier read worktree config files without editing them. Commands, exits, cwd and logs are recorded in commands.json.

- red.log: exit 1; **11 failed / 103 passed / 114 total**. The original 100 cases all passed. The four exact witnesses and bounded order/role controls reproduced their gaps.
- post-fix-full.log: exit 1; **1 failed / 113 passed / 114 total**. All 14 new cases passed. The sole historical failure was the old raw `worker.type: 'string'` expectation despite that exact string already appearing as opaque nested instance payload in the same physical sources. This failure is preserved, not called GREEN.
- green.log after the separately approved assertion edit: exit 0; **114 passed / 114 total**.
- Final focused scratch lint.log and format.log: exit 0.

The 14 new cases cover both physical fence orders for root JSON/type mirrors, built-in type/runtime mirrors and graph/runtime mirrors; an unclassified schema string/type mirror; declaration-only literal type and all seven clean built-in schema types plus `$ref`; ordinary graph identity preservation; quoted named-export selectors with spacing/punctuation/program-shaped spelling; star/namespace opaque identity retention; and export/runtime collision. The reverse-order graph control also covers a colliding target endpoint. New tests assert relevant source counts, owners/hashes/parity, stable IDs or legacy identity formulas, and connectivity. No Cartesian test expansion or broader resolver was introduced.

## Exact approved historical assertion delta

Before any edit to the old case, saved historical-case-before.txt and historical-case-proposal.json, SHA-256 `85f9f9695a6230559edee3dd06bade721abad4acba443816dbdd04efcb3f976e`. The proposal was sent while the assertion/fixture remained unchanged. Lead then approved exactly this scratch-only representation refinement; lead-assertion-adjudication.txt preserves the decision (SHA-256 `9a165c45a9f5f3f8b027f244cd8403208f071fe06f03fc608a6e83c83529227c`), with proposal/before-case hashes in its JSON record. The original proposal remains in its chronological awaiting state; the separate decision records approval.

The existing R12 D fixture is completely unchanged: its schema worker type and opaque nested payload type both contain the exact string `string`. The single `worker` expectation now retains `name` and expects UNKNOWN SHA-256/length for type, plus a nonempty reason, instead of raw `'string'`. The frozen unresolved-collision rule applies to built-in strings too. All other assertions, payload guards, digest/length expectations, source/owner/counts and inputs remain. This is a measurement refinement, not a new criterion or denominator reduction. The new clean-schema control independently preserves all seven built-in types and reference without collision.

retention.json verifies all 100 old cases remain: 99 case bodies byte-identical, one exact approved assertion refinement, all original fixture bytes unchanged, and every other old assertion byte-identical. Reversing only the approved assertion delta makes the complete original 100-case suffix byte-identical (SHA-256 `1058872c4a0bbf9d75a02e7e10dc84ec3d80528e2b37bd432ad4645aa86ff502`). The only preamble difference is disposable fixture evidence role-r19 -> role-r20, relative to scratch cwd. The entire embedded Python AST program, original R17 surrogatepass/encoding behavior, three R17 cases, 16 R18 cases and 10 R19 cases are unchanged.

## Bounded limits and next owner

Classification remains finite, syntactic and local to a physical source using exact literal digests. It performs no expression evaluation, sink/callee resolution, cross-file flow or whole-program analysis. UNKNOWN collisions are conservative; this does not establish the meaning of arbitrary guest-language text. Graph connectivity is retained only for the existing simple-edge syntax; graph semantics remains UNKNOWN. Legacy opaque export `from` metadata stays opaque even when `module_selector` preserves a genuine exact selector. This proposal does not resolve modules or assert their existence.

Focused results are scratch-only, with an isolated Node environment; they are not a claim that worktree tests or Lead's broad gates ran on these proposed bytes. No actual reference/live catalog/map/root checkout/shared ledger/lock/other-phase code/network/provider/DB/fullunit/coverage/descendant was used or changed by this lane. Lead's coverage results remain Lead-owned and are not converted to acceptance for R20.

## Exact proposed files and patch

| Target | R19 baseline/worktree SHA-256 | Proposed scratch SHA-256 |
| --- | --- | --- |
| scripts/reference-contract-catalog.mjs | `ae8481ffce22c69980505345cbde6c997ae462b9ebacc54a0c5c8adad75021a8` | `e5658f5738b2d5b1b5105e27648e804d5ffc0a748f34e76732cc4753342c8bd0` |
| tests/reference-contract-catalog.test.js | `7e0cf8c0e48f0063d60a3028679f44b5eee8e4c2411b0082e7b1c512245a1f63` | `c341955e37e35215483b349ce938051d1e3885eb10354ece7c54c03abfe880cf` |

Scratch paths are `/tmp/cvg-pare100-exec-20261014-6az3hlay/reference-r20-scratch/scripts/reference-contract-catalog.mjs` and `/tmp/cvg-pare100-exec-20261014-6az3hlay/reference-r20-scratch/tests/reference-contract-catalog.test.js`. proposed-exact-diff.patch SHA-256: `7405df03275a8d106671f56509250531ec6894fb63c8e37959dfe9cf66e958a4`. It transforms only those two captured R19 files into the proposed bytes; it was never applied to worktree. handoff.json supplies machine-readable paths/baseline/final hashes. sha256.json indexes all final evidence and proposed files, excluding itself.
