# SPEC0209 T2 — bounded R15 handoff

**I0_IMPLEMENTED. Builder stops here.** Fresh I1, live collection, complete identity/requirement rebase and shared-ledger integration belong to Lead. No helper acceptance, parity acceptance, release or P100-003 completion is granted. [claim.json](claim.json) records authority, owned paths, exact input hashes and continuity. No descendants or capacity retries.

## Exact new witnesses, RED first

The immutable R14 I1 report's two examples were instantiated as synthetic fixtures and processed by the real helper before its source changed:

- **I1-R14-01:** one `docs/tool-catalog.md`, `# Roles / ## Payload`, JSON `{"type":"object","throw/ROOT_I1/":true}`, followed by `## Mirror` and a recognized `ts public-api` fence declaring `SourceMirror = 'throw/ROOT_I1/'`. The unclassified member key was copied and omitted from the shared index; the literal type remained raw. The new test requires UNKNOWN digest/length for the complete unknown-member object, an opaque literal mirror, retained recognized `type`, three entries, source/hash/owner and NOT_VERIFIED.
- **I1-R14-02:** one `docs/tool-catalog.md`, `# Tools / ## Payloads`, the exact WorkerSource/eval-source fence from the report followed by its Example/Meaning table with first cell `throw/TABLE_I1/`. The shape was opaque but the symbol copied the cell. The new test requires `opaque-symbol:<sha256(raw-context-and-first-cell)>`, matching UNKNOWN identity projection, opaque row value, three entries and intact source/hash/owner/parity.

Both exact witnesses failed in the initial RED. Four additional tests cover table identity opacity without runtime evidence, three distinct table groups surviving row reversal with stable IDs, known payload embedded inside slash-separated heading/context routes for TS/JSON/graph/table/unparsed outputs, table cells entering the index before earlier declarations, and preserved established schema/tool metadata beside unknown JSON members. Six new cases total; no guest source, Worker constructor or user payload was evaluated.

## Coherent role repair

**JSON member transition.** A finite recognized-member classifier replaces the former character predicate on declaration-object keys. Unknown member names themselves enter the physical-source payload index before fragment projection. Unknown members, including their keys, are grouped in the generated `unclassified_members` projection as UNKNOWN with reason and canonical-object digest/UTF-8 byte length. Their actual names/values are not copied. Recognized sibling names, required-property identifiers, schema maps and type selectors remain visible in their established roles. Default/const/examples/other recognized data-valued keywords remain absorbing payload values. Manifest projection has its own finite role for the already selected manifest fields; package-field names do not grant schema-key privileges elsewhere. No new program lexicon or punctuation blacklist was added; the old generic JSON member alphabet gate was removed.

**Consistent document identities.** A common identity projector is used both by the catalog emitter's existing formatting and by role-aware document emission. All table-row identities and unparsed-fence identities are opaque by role, regardless of whether their characters would pass the former alphabet. The complete original identity gets a deterministic digest and UNKNOWN reason/length. Existing table grouping, row sorting, duplicate rejection, source and owner lookup remain unchanged: no entry deletion, additional merge or row-position ID was introduced.

**Physical-source evidence.** The local scope retains transient digest-to-text mappings, never serialized into a catalog. This lets every document symbol route check for actual known payload bytes, including a value embedded inside a heading/context string, without a program-language recognizer. Known collisions force the same opaque identity projection. Outside-fence table cells/headers and unparsed-fence info are unclassified data and are indexed before any fragment is emitted. JSON unknown member names, JSON values and runtime TS literals share this same physical-source scope. Other physical sources remain separate. Authenticated filenames and source hashes are not transformed.

The table and heading tests verify emitted symbols and shapes together, rather than relying on UNKNOWN in one representation to excuse raw bytes in another. Genuine role-established names/selectors retain the existing positive controls; same-source unresolved collisions remain UNKNOWN.

## Actual commands and results

Node **22.23.2**, working directory `/tmp/cvg-pare100-exec-20261014-6az3hlay/worktree`. Both RED runs and GREEN used exactly:

```text
/home/ricardo/.nvm/versions/node/v22.23.2/bin/node node_modules/vitest/vitest.mjs run tests/reference-contract-catalog.test.js --reporter=verbose
```

| Phase | Exit | Actual result | Original log |
| --- | --- | --- | --- |
| Initial RED, helper unchanged | 1 | 5 failed / 62 passed; exact two witnesses fail, all 61 old cases pass | [red-initial.log](red-initial.log) |
| Corrected RED, helper unchanged | 1 | all 6 new cases fail / all 61 old cases pass | [red.log](red.log) |
| GREEN | 0 | 67/67, no skips | [green.log](green.log) |
| Final ESLint on two owned files | 0 | PASS, original empty log kept | [lint.log](lint.log) |
| Final Prettier check on two owned files | 0 | PASS | [format.log](format.log) |

[commands.json](commands.json) contains exact commands, exits and log provenance. The initial heading witness used spaces, so old lexical identity masking already hid its payload; before editing the helper, that new fixture was changed to an admitted slash-separated prefix/payload/suffix. The corrected RED therefore proves the missing role check rather than the old character gate. Both RED logs are retained. Existing negative Git/CLI/Python tests operate on disposable synthetic fixtures only; their expected diagnostics are not actual-reference operations. No broader tests/research/redesign followed GREEN.

## Assertion refinement provenance and retention

[assertion-policy-before.json](assertion-policy-before.json) was written and the user-facing explanation sent **before** helper/assertion edits. Exactly two old test blocks were refined:

1. **R13-S01, `unclassified` parameter case:** the old expectation `shape.unclassified` required copying an unknown member name. It now requires `shape.unclassified_members` to hash the whole canonical `{unclassified: payload}` object. The recognized type/count/source/owner/parity/raw-absence checks remain. The shared block has four parameter instances; default/const/examples still assert exactly the same payload hashes/lengths as before.
2. **R12-D:** default/const/examples retain their prior per-value opaque assertions. The unknown `worker.unclassified` expectation becomes a separate UNKNOWN digest/length/reason assertion for the entire `{unclassified: payload}` member projection, including raw-payload absence. All recognized metadata, entry count, owner, source and parity assertions remain.

All **61 existing cases remain**; none was renamed/deleted. Only two logical representation outcomes change. Five instances share the edited blocks; the other three parameter instances keep their prior expected values. The remaining **56 old case bodies are byte-identical**, and all 34 pre-R12 tests/assertions are byte-identical, including known-bad payload/path/identity guards and the existing exact Cordis identity pin. [retention.json](retention.json) records the byte comparisons, preserved counts and explicit refinements. Disposable fixture roots moved only from role-r14 into owned role-r15. Previous R14 artifacts were never edited.

## Exact final candidate

[exact-diff.patch](exact-diff.patch) is the unified delta against the two saved pre-R15 source files; they were already untracked worktree inputs, so a full-add Git diff would misdescribe this bounded change.

```text
05edd88d1ab41256dbdd41c42f460e891d81ca8f0d0c82c2a888b915c5d7bbae  scripts/reference-contract-catalog.mjs
3d1e1e3fb964c78570b696d7ab07bfa2e8b6b354b5316ae02de48ce65796d20b  tests/reference-contract-catalog.test.js
a7d07b601a22cb623d71241dc9d497e349227172099f71dafbcfafb83bf2537f  exact-diff.patch
```

[sha256.json](sha256.json) binds final source and evidence files. Original SPEC0209, frozen role-decisions and the supplied active R14 I1 report match their pre-round hashes.

## Known limits and Lead rebase

Finite role classification is conservative. Custom/unsupported JSON members become unknown-member data rather than receiving declaration privilege from their spelling. The generated `unclassified_members` label and UNKNOWN/identity metadata are helper-owned structural labels, not copied payload keys. JSON member/object digests describe canonical ordered JSON; literal and identity lengths describe their respective UTF-8 text; authenticated enclosing source hashes remain exact source provenance.

Identity collision checks match known source payload text within a document symbol, so even short matching values can conservatively opacify a larger identity. This is source-local evidence matching, not proof of executable semantics. Empty strings do not trigger substring masking. The repair does not evaluate computed/assembled values, resolve cross-file flows, analyze whole programs or recognize all languages. Existing recognized/parseable TS/JSON and table/identity routes are the bounded scope; no universal no-language or absence-of-other-leaks claim is made.

All table identities and some other document identities intentionally change. Their digests depend on original context/content, never row order. Existing grouping and duplicate checks remain, and synthetic distinct contexts remain distinct, but **the complete real bijection/denominator/owner/source migration must be measured by Lead**. No unchanged freeze or complete migration is asserted here. Lead's prior live 44,132-entry/28-new-ID-change evidence is context only; no catalog/map or previous raw intermediate was opened, regenerated or modified.

Writes were limited to the two owned source files and new role-r15 evidence/temporary fixtures. No actual reference, live collector, root checkout, lockfile, other phase code, shared ledger, network/provider/DB, descendant, commit or push. No independent I1 self-approval or parity acceptance. Lead next: fresh I1 of these exact hashes, then any authorized live/full-rebase and ledger integration. Builder stops here.
