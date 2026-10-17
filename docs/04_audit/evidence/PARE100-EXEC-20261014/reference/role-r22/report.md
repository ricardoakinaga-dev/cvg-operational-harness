# R22 proposed collector — IMPLEMENTED, pending independent review

Task P100-003 / original SPEC0209, T2; finding I1-R21-01. Proposal only, not applied to W or root and not accepted as full P100-003 completion.

`export_metadata` now requires `n in tree.body` before its existing metadata early return. This matches the module-level export emitter. Function/class `__all__` assignments are ordinary runtime AST; dynamic module annotation traversal is unchanged. The helper diff is one added scope predicate plus an explanatory comment. No evaluation, sink blacklist, dataflow engine, or extra family repair was added.

Fixed Node v22.23.2: RED reproduced all four local collision cases (annotated/unannotated function and class), with 132 passing. GREEN passed 136/136, no skips: all 130 original tests plus those four local cases and two pure module controls. The same test bytes were used for RED and GREEN. Lint and format both exit 0. Inert source contains `exec(__all__[0])` only as parser input; no witness is executed. The annotation becomes UNKNOWN with reason, SHA-256 and length 8; provenance, owner, identity and NOT_VERIFIED parity are retained. Module controls preserve the exact declaration spelling; retained R21 dynamic-annotation controls pass.

Removing the single added R22 test block reproduces the complete original R21 test file byte-for-byte, without normalization. See `retention-proof.json` for offsets/lengths/hashes. The existing role-r21 fixture path stays unchanged inside the test file to retain every old byte; cwd is R22 scratch so it writes only there.

Frozen sources are in `proposal/*.source.txt` and own scratch; exact relative-path patch is `proposal.patch`. SHA-256 values and Node/config provenance are in `source-freeze.json`. All eight previous sealed I1 inputs, the sentinel, R21 baseline and live W helper/tests match their before hashes (`integrity-after.json`). No write to W source, root, ledgers, lockfile, baseline or previous I1 inputs. Local dependency link and Vite cache are confined to own scratch. Existing tests create disposable synthetic Git objects only, not project commits.

No environment blocker. Expected synthetic Git negative-test warnings are preserved verbatim in stderr. Initial setup encountered an absent root helper while preparing guards; resumed recording that absence as null before any code change or check, without creating root files (`setup-note.json`).

Independent review/integration, live collection/denominator verification and affected integrated gates remain Lead responsibilities. This is bounded source-local static role indexing, with no whole-program/cross-file or universal opacity proof. No reference/real-data/network/DB/guest execution, descendant agents, coverage or broad gates were run for this proposal. Current216 cohort results are not attributed to R22. Stop at focused green; P100-003 acceptance/parity/release remain ungranted.
