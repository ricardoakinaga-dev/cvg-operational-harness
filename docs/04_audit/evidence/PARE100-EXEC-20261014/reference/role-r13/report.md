# SPEC0209 T2 — bounded R13 repair

**I0_IMPLEMENTED. No PASS acceptance, independent I1, parity acceptance, live freeze or rebase is claimed.** S01/S02/S03 have executable synthetic witnesses and bounded source changes. The user's handoff, exact inputs, paths and continuity are in [claim.json](claim.json). No descendants or capacity retries.

## Findings addressed

**S01 — payload object keys.** JSON object values in absorbing payload context (default, const, examples and unclassified descendants) are now represented as a complete UNKNOWN object with reason, digest and UTF-8 byte length. Their keys are not serialized raw, even when they fit the former namespace regex. Array positions and enclosing schema fields/requirements remain. Object-valued malformed vocabulary slots receive the same treatment. TypeScript object-initializer property names are projected as opaque payload names by source slot, including identifier/numeric keys; computed keys retain only UNKNOWN and literal digests. Property/value requirements remain as structural records.

**S02 — opaque initializer descendants.** The source-local prepass now visits AST string/template literal descendants directly, independent of whether staticData supports their enclosing expression. It also indexes payload object keys. Binary, conditional, new-expression and tagged-template fixtures are parsed without evaluation. Unsupported initializers retain their syntax kind and descendant literal digests/lengths; matching literal types in the same source become UNKNOWN, including aliases appearing earlier in the file. No string concatenation, constructor or guest program is executed.

**S03 — established declaration names.** Exact TS literal member names are retained in declared_name when no same-source initializer literal/key digest matches them. Supported export names and enum names use the same declaration-role decision. Historical opaque identity projection is retained for declaration-only spellings such as `throw 0`, keeping the old symbol and its requirement identity inputs. JSON schema/tool name/required values and schema-map keys permit exact inert spelling, including spaces, only in their established declaration/vocabulary roles. JSON payload literals/keys are indexed before projection; all JSON fences in one generated document share that source-local index, including forward matches. Matching declaration names remain UNKNOWN; a matching schema-map key makes that map opaque. Legitimate type selectors remain visible. Unclassified graph labels do not acquire declaration privileges merely because the helper caller uses field name `name`.

No program keyword/punctuation blacklist was added. Existing identity formatting is not used to decide whether an exact member name can appear in declared_name. Same-source digest collisions between payload data and literal declarations are conservatively unresolved dual roles, never semantic acceptance.

## Executable witnesses and actual runs

The critique was static. [witness.mjs](witness.mjs) is a separate executable observer with its own AST inputs and minimal synthetic Git/schema tree; it does not reuse the Vitest fixture/assertion implementation. It runs the real helper and reports booleans instead of saving raw catalogs. Its unchanged code observed seven repair checks false and requirement retention true against the R12 helper; against this candidate all eight checks are true. [witness-red.log](witness-red.log) and [witness-green.log](witness-green.log) bind observations to the respective helper SHA-256. This is an independent fixture/observation path within the **same I0 builder**, not a second independent agent or an I1 verdict. No actual installed reference occurrence is asserted.

Fourteen new Vitest cases cover four JSON payload fields in schema/document inputs, TypeScript payload keys, four unsupported initializer wrappers, exact whitespace-bearing event/class/tool/schema names with historical symbol controls, two same-source TypeScript value/key collisions, and two same-document JSON value/key collisions across fences. The fixed synthetic program-source consumers are present only in parsed source strings; guests and Worker constructors are never evaluated.

All runs used Node 22.23.2, working directory `/tmp/cvg-pare100-exec-20261014-6az3hlay/worktree`. The suite command was exactly:

```text
/home/ricardo/.nvm/versions/node/v22.23.2/bin/node node_modules/vitest/vitest.mjs run tests/reference-contract-catalog.test.js --reporter=verbose
```

| Phase | Exit | Actual result | Log |
| --- | --- | --- | --- |
| Initial RED, before helper change | 1 | 12 fail / 41 pass | [red-initial.log](red-initial.log) |
| Corrected RED, before helper change | 1 | all 14 new cases fail / all 39 old cases pass | [red.log](red.log) |
| Standalone observer RED | 1 | 7 repair checks false, enclosing requirement retained | [witness-red.log](witness-red.log) |
| First attempted GREEN | 1 | 1 fail / 52 pass; old graph-label guard caught broad name allowance | [attempted-green-1.log](attempted-green-1.log) |
| Final GREEN | 0 | 53/53, no skips | [green.log](green.log) |
| Same standalone observer GREEN | 0 | all 8 checks true | [witness-green.log](witness-green.log) |
| ESLint, both owned files | 0 | PASS, original log empty | [lint.log](lint.log) |
| Prettier check, both owned files | 0 | PASS | [format.log](format.log) |

[commands.json](commands.json) records exact suite/observer/lint/format commands, exits and log renames. Existing negative synthetic tests emit Git diagnostics while passing; they are not operations against an actual reference.

## Explicit test refinements and retention

[assertion-policy-before.json](assertion-policy-before.json) and the user-facing update recorded the R12-D conflict before any assertion change: per-descendant payload assertions conflict with the requested complete object opacity; its identical payload/declaration spelling is now an explicit same-source dual-role case. R12-D now compares the entire canonical payload object's UNKNOWN digest/length and absence of payload text, retaining its entry count, source/hash, owner, required/type structure, declaration-only name control, extraction status and NOT_VERIFIED parity. Its preserve control uses a distinct name with spaces; the old identical-byte dual-role expectation is covered by four explicit new value/key collision cases. No test was removed.

All **34 pre-R12 tests and assertions remain byte-identical**. The four R12 cases other than D also remain byte-identical. In particular, the old IDENTITY_BODY_MARKER test still prohibits raw payload bytes in interface/export names and initializer keys: those names share a source with the payload key, so remain unresolved/UNKNOWN. Its assertions were not weakened or edited. [retention.json](retention.json) records these checks and the maintained synthetic counts (2 schema/document entries, 3 source/value/alias requirements, 4 interface/member/value/source requirements).

Two new-fixture refinements occurred before the corrected RED: the TS collision fixture initially expected three entries, but actually has four because the interface container is also a requirement; the assertion was increased to four. JSON collisions initially used a whitespace spelling that the old lexical filter already rejected, so they were sharpened to an admitted spelling to prove the missing role boundary. The original failed/partial-discriminating run is retained. During the first attempted GREEN an old annotation/graph-literal guard failed; the helper was corrected to require explicit vocabulary role, and that old assertion stayed intact.

Disposable fixture roots moved from role-r12 to this exclusively owned role-r13 directory. Prior R12 artifacts were never edited.

## Exact artifacts

The exact delta against the two saved pre-R13 source files is [exact-diff.patch](exact-diff.patch). These files were already untracked inputs in the shared worktree, so a full-add Git diff would not accurately describe this bounded repair.

```text
e8941af69581f16b468b292dc36c00e8e1e6d72285ce0b6de821336fdf91eaf1  exact-diff.patch
b4f6d559f68e3a4b1e2a8d28d3573e9d02b6dbf002062de42f9762d7fe2a6ea8  scripts/reference-contract-catalog.mjs
ee3c527d04381fdacfc7e18b7075fba0521dcc9eb6d01739f6116c714901322f  tests/reference-contract-catalog.test.js
```

[sha256.json](sha256.json) contains final source/evidence hashes. Original SPEC0209, frozen role-decisions and the supplied R12 I1 report match their pre-round input hashes.

## Limits and Lead handoff

Matching is conservative, source-local and based on literal/key digests and node/JSON roles. It does not resolve imports, variable flows, consumer semantics, assembled programs without a matching literal descendant, or whole-program language/role analysis. TypeScript indexing records decoded string/template literal text and payload-key text; unsupported expressions are not computed. JSON payload object digests/lengths describe canonical ordered JSON, not the original source slice; the enclosing source digest remains the authenticated exact source digest. Unclassified or dual-role values remain explicit UNKNOWN. This does not establish absence of other leaks.

Declaration-only whitespace member identities retain their previous opaque symbols, as checked by the exact symbol control. Newly unresolved names that previously occupied raw symbol slots may need identity migration because validation binds IDs to emitted identity fields. No historical catalog was inspected to measure that delta, no unchanged freeze is claimed, and no incomplete migration map is fabricated. **Lead owns complete live denominator/identity comparison and any rebase.**

No actual DSH/reference, catalog/history or withdrawn R12 intermediate was read or written. No live collection, network/provider/DB, root checkout, lockfile, shared ledger, descendant, commit, push, self-I1 or parity acceptance. Only the two owned source files and new role-r13 evidence/temporary fixtures were written. Remaining independent I1, actual-source evidence, live collection/rebase and ledger integration belong to Lead. P100-003/global acceptance remain open.
