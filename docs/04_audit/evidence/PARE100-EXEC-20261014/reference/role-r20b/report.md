# R20b I0 scratch followup — proposed implementation, not applied

Bounded SPEC0209 T2 whole-edge exact copied-value collision, authorized by Lead. Work performed only in `/tmp/cvg-pare100-exec-20261014-6az3hlay/reference-r20b-scratch/**` and this new role-r20b evidence subtree. No source was applied to the worktree. Original reference-r20-scratch and all role-r20 evidence/report/patch bytes remain intact; retention.json binds their previously handed-off source/report/patch/handoff/index hashes. R19 worktree source hashes remain unchanged too.

## Reproduction and minimal guard

The inert physical-source witness supplies `left --> right` as a TS runtime string and repeats those exact bytes as a simple Mermaid edge. Its endpoints `left` and `right` individually have no payload collisions. Witness text is preserved in witness.json; the TS Worker is only AST input, never executed.

RED reproduced the direct gap: the graph returned raw `left --> right`. Before the existing raw edge return, the proposal checks the hash of the complete trimmed edge against the shared physical-source payload index. A match emits a connectivity-preserving object with `from`, `operator`, `to`, and whole-edge UNKNOWN reason/SHA-256/byte-length. Endpoints still use the existing projection, so their links to node IDs are retained. The complete-edge digest is `93ecb0c7e4034e072faaa9eaf34bffcb3365aa27b39b031ace57414c7d698884` and length is 14 bytes. Genuine noncolliding edges retain their old string representation.

Only this existing graph branch changed. No lexical program blacklist, callee/sink identification, parser expansion, semantic resolver, cross-file or whole-program analysis was introduced. ID/source/owner/requirement inventory logic and embedded Python AST are unchanged.

## Actual focused validation in new scratch

commands.json records exact executable/argument vectors, cwd, logs and exits. Node22 uses the Lead-provided node_modules symlink; Vitest runs with runner config loading, a Node environment and the new scratch-local `.vite` cache. ESLint/Prettier read existing configs without editing them. No install, network, provider/DB, live collection, actual reference, fullunit, coverage, descendants or research was used.

- red.log: exit 1, **1 failed / 114 passed / 115 total**. Only the new whole-edge witness failed.
- green.log: exit 0, **115 passed / 115 total** after the guard.
- lint.log and format.log: exit 0 for the two proposed scratch files only.

The new test retains two source entries, exact source SHA, owner P100-003, NOT_VERIFIED parity and ID formulas; asserts left/right nodes and endpoint connectivity; checks whole-edge UNKNOWN reason/hash/length and absence of raw full-edge copy. The prior ordinary graph and endpoint-collision controls still pass unchanged.

## Retention and exact proposal

All 114 previous case bodies/assertions/fixtures are byte-identical; their full suffix SHA-256 is `dedf4bf15e8c25e5fe757781e4fffd58de98f851c3c4d9a862f6d482b2ef691b`. This includes the original100 cases and the sole previously approved R20 representation refinement, with no additional old-case edits. The test preamble changes only disposable evidence role-r20 -> role-r20b. Original R17 encoding/three tests, R18 selectors and R19 tests remain intact. R20 baseline source/test/config bytes were copied into before-* evidence before changes.

| File | Exact R20 baseline SHA-256 | Final R20b proposal SHA-256 |
| --- | --- | --- |
| scripts/reference-contract-catalog.mjs | `e5658f5738b2d5b1b5105e27648e804d5ffc0a748f34e76732cc4753342c8bd0` | `f94bde59ade7bb6ae51b5e0497903d2637f4efd2b7ac93015dfffa9503f56813` |
| tests/reference-contract-catalog.test.js | `c341955e37e35215483b349ce938051d1e3885eb10354ece7c54c03abfe880cf` | `85660c7b478f411653be494e55c3e0b5371c66b235bcbeffa7fd2954aa46e161` |

Proposed paths: `/tmp/cvg-pare100-exec-20261014-6az3hlay/reference-r20b-scratch/scripts/reference-contract-catalog.mjs` and `/tmp/cvg-pare100-exec-20261014-6az3hlay/reference-r20b-scratch/tests/reference-contract-catalog.test.js`. proposed-exact-diff.patch SHA-256: `c6a69e34ffb3020f7c80eafaeb2e5a00abf2496efc584326b92914f558b736d6`. This incremental patch transforms exact R20 bytes into R20b; it is not a direct R19 worktree patch. The complete proposed pair already contains the R20 changes. No application was attempted. handoff.json contains machine-readable hashes/paths and sha256.json indexes final evidence and scratch proposals.

## Limits and owner of next step

The guard matches the exact whole trimmed text that this existing simple-edge branch would otherwise copy. It does not evaluate or normalize guest source, infer meaning, resolve computed strings, extend Mermaid grammar, or analyze other files. Syntactic connectivity is retained; graph semantics remains UNKNOWN. This focused scratch result is not universal no-language proof, worktree validation, self-I1 acceptance or parity PASS. Lead owns exact application, current focused checks, fresh I1 and any authorized live collection/rebase. Stop at this handoff.
