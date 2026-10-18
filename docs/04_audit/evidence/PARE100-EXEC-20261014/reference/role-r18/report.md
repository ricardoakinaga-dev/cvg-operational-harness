# R18 bounded I0 handoff — I0_IMPLEMENTED

SPEC0209 T2, P100-003. No I1 self-approval, parity acceptance, or production release. Fresh I1, live collection and any catalog/ID rebase remain Lead-owned. Work stops at this handoff.

## Implementation and limits

Removed only the character/spelling whitelist from established TypeScript literal-type printing and Python annotation types. Declaration-only literals retain their exact value, including spaces, punctuation, Unicode and the historical statement-shaped body. Existing source-local runtime literal collision checks still project UNKNOWN with SHA-256 and byte length. No keyword list or runtime sink special case was added. TypeScript executable-node guards and Python allowed-node/bytes guards remain unchanged. R17 embedded Python opaque surrogatepass implementation and its three tests are byte-identical to the before source.

Matching is static, exact-literal and local to the existing physical-source index. No computed-value resolution, cross-file flow or whole-program analysis is claimed. Arbitrary declaration-only spelling does not prove a runtime role; unresolved same-source runtime/declaration collisions remain UNKNOWN. This establishes the bounded synthetic regression result, not universal absence of program-language bytes. Guest payloads were never executed; synthetic Python extraction uses the existing stdlib AST path.

No identity, owner, requirement mapping, filename/provenance, or source-inventory logic was changed. No source or requirement was deleted. No real reference, live catalog, maps, frozen evidence, other phase source, shared state, locks or root checkout were written. No network, providers, DB, install, descendants, full-unit or coverage run was used.

## RED, fixture adjudication and GREEN

See commands.json for executable/argument vectors, cwd, exit codes and log paths.

- red.log: exit 1, 8 failed / 82 passed (90 total). All eight declaration-positive TS/Python cases reproduced spelling-based loss; eight paired runtime-collision cases and the 74 prior cases passed.
- post-fix-full.log: exit 1, 1 failed / 89 passed. The historical TS alias-only fixture now correctly retained declaration metadata, conflicting with its old global marker-absence measurement. This intermediate failure is preserved, not called GREEN.
- r18-green.log: exit 0, 16 new cases passed / 74 skipped before fixture approval; subset result only.
- green.log after the approved fixture edit: exit 0, all 90 cases passed.
- Final lint.log and format.log: exit 0 for the two owned files only.

The 16 new cases pair declaration preservation and same-source runtime collision in TS and Python for four exact values: `throw 0`, `event: ready?! [v2]`, `ação ✓ 你好`, and the original function-shaped historical body. Python positives also carry the same runtime literal in a separate physical file to verify source isolation. Declaration names/export entries, source SHA, owner and NOT_VERIFIED parity status remain asserted.

## Historical assertion refinement provenance

Before any historical edit, preserved the complete before helper/test sources, historical-case-before.txt, and historical-case-proposal.json. The proposal was submitted while that case remained unchanged. Lead then approved exactly its fixture refinement within T2; lead-fixture-adjudication.txt preserves the decision and lead-fixture-adjudication.json binds its SHA and proposal SHA. The original proposal remains immutable with its pre-decision awaiting status; the separate decision records subsequent approval.

Original TS input: `export type GuestSource = <original body literal>;`. Approved input adds the identical same-source runtime `export const ProgramSource = <original body literal>;` beside the unchanged alias. Frozen rule B preserves the old standalone declaration literal: its spelling-only no-copy measurement was defective. This adjudication changes the fixture role evidence, not the frozen criterion or quality bar.

All prior assertions remain, including raw marker absence and UNKNOWN checks for type, Python function/exports, document table and graph. Python/document/graph inputs are unchanged. Added exact alias/initializer UNKNOWN digest and byte-length assertions plus source SHA, owner, NOT_VERIFIED and TS count 3 (previously 2, none removed). An independent declaration-only exact-body positive and its runtime-collision pair prevent the new fixture from hiding the preservation requirement.

retention.json proves all 74 prior cases remain: 73 case bodies byte-identical; one approved strengthened fixture; original historical assertions retained byte-identically after reversing only the approved fixture/additions. All three R17 tests and opaque block are byte-identical. Only the disposable fixture evidence root changes from role-r16 to role-r18 to protect frozen previous artifacts.

## Exact deliverables

- scripts/reference-contract-catalog.mjs SHA-256: `9e3b800ab0efb98b137f714ba25815ea009dddd28e774f233bf39e7fd70968f7`
- tests/reference-contract-catalog.test.js SHA-256: `1f4e0a6d091341b2cb69a16d29bb981bb8ef02cb27de5cf17ff1d02c8018ead6`
- exact-diff.patch SHA-256: `54c53d58f9885f1dcc4d09affc35c7497f5b9f7b18e83dadd326ad7cd6ef2df3`

The patch compares captured R17 baseline bytes with final owned source bytes; it does not incorporate other worktree changes. sha256.json indexes final source and evidence hashes (excluding itself). No catalog was regenerated and no parity or live acceptance is asserted.
