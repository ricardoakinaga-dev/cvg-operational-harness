# SPEC0209 T2 — bounded R14 handoff

**I0_IMPLEMENTED. Stop bounded builder work here; fresh I1, live collection and rebase belong to Lead.** No helper acceptance, parity acceptance, release or completion of P100-003 is claimed. [claim.json](claim.json) records the explicit user authorization, owned paths, initial hashes and continuity. No descendants or capacity retries.

## New findings reproduced before repair

The supplied immutable R13 I1 report identifies two new source-role gaps. Both exact examples were reproduced by executing the real helper against disposable synthetic fixtures, without executing their guest code:

1. **I1-R13-01:** one physical `docs/tool-catalog.md`, two recognized `ts public-api` fences. The first declares `SourceMirror = 'throw/FENCE_I1/'`; the second initializes `WorkerSource` with those bytes and includes `new Worker(WorkerSource, { eval: true })`. Before repair the mirrored type was raw while the initializer was opaque. The new test uses the report's exact source text, then repeats with fence order reversed. Both RED failures are in [red.log](red.log).
2. **I1-R13-02:** one TypeScript source declares `SourceMirror = 'throw/INLINE_I1/'` followed by `new Worker('throw/INLINE_I1/', { eval: true })`, with no initializer containing the program literal. Before repair the alias was raw. The exact witness is another RED failure in the same log.

Five additional cases distinguish the intended generic role boundary from a sink-specific fix: standalone ordinary call, unary and tagged-template expressions; a passing declaration-only selector/event/name/static-module-locator control; and a TS/JSON collision within one physical document paired with an unrelated document that must preserve its selector. Eight cases were added in total. No Worker name, eval flag, program word or payload punctuation is used by the repair to classify source.

## Small repair

The source-role index now visits runtime string/template literal positions throughout a parsed source, including direct arguments and standalone/body expressions. Type syntax, static import/export module locators, and declaration-name slots retain their separate roles. Object-initializer keys remain payload evidence. Any matching literal type/name is conservatively unresolved/UNKNOWN before projection. This replaces the initializer/export-assignment-only evidence boundary with AST-position evidence, without resolving consumers or evaluating expressions.

For Markdown, a complete prepass gathers payload evidence from all recognized TypeScript fragments and JSON fences into one local set **before** projecting any fragment. The existing fence recognition, standalone parse behavior and Cordis wrapping are shared between prepass and projection. Both forward and backward matches are therefore covered. Each physical document gets a fresh scope; unrelated files cannot contaminate its declarations. Standalone extractor calls retain a fresh default scope and can receive the explicit scope used by the document collector.

The source-scope set also feeds JSON projection, preserving the existing same-physical-source collision rule across recognized TS/JSON fragments. Declaration-only metadata, static module locators and authenticated filenames retain their existing role handling. No requirement emit, owner lookup, source authentication, path transformation, freeze-validation or ID formula was changed. Existing UNKNOWN data still stays in the denominator. Expanded collision evidence can affect identity projection of previously raw literal names; any complete real delta/migration remains Lead work.

## Actual validation and assertion provenance

Node **22.23.2**, working directory `/tmp/cvg-pare100-exec-20261014-6az3hlay/worktree`. The exact suite command for both runs was:

```text
/home/ricardo/.nvm/versions/node/v22.23.2/bin/node node_modules/vitest/vitest.mjs run tests/reference-contract-catalog.test.js --reporter=verbose
```

| Phase | Exit | Actual result | Evidence |
| --- | --- | --- | --- |
| RED, before helper edit | 1 | 7 failed / 54 passed | [red.log](red.log) |
| GREEN | 0 | 61/61, no skips | [green.log](green.log) |
| Final ESLint, two owned source files | 0 | PASS; original empty output preserved | [lint.log](lint.log) |
| Final Prettier check, two owned source files | 0 | PASS | [format.log](format.log) |

The 54 RED passes were all **53 existing cases plus the new declaration-only control**. No old assertion was altered or removed. The entire pre-existing test body from the first R13 case to end-of-file is byte-identical, including the prior explicit R12-D refinement and all old payload/path/owner/count guards. The only edit outside the inserted eight tests relocates disposable fixture roots into this round's owned role-r14 directory. [retention.json](retention.json) records that check and synthetic entry-count controls: three document requirements for the two-fence witness; two source requirements for the direct-argument witness. Owner/source/hash/NOT_VERIFIED assertions remain in those witnesses.

[commands.json](commands.json) records all exact commands and exit codes. Existing negative synthetic Git tests emit expected diagnostics while passing. Git/CLI subprocesses in this focused suite operate only on disposable synthetic fixture trees; none addresses the installed reference or repository history. There was no broader gate/test/research round after GREEN.

## Exact final candidate

[exact-diff.patch](exact-diff.patch) is the unified delta against the two saved pre-R14 files. These source files were already untracked worktree inputs; the saved baseline avoids misreporting this change as their entire creation.

```text
068ec6ff2625063a2513d2ad4b6e339a5bda61857faab659a0492254eea8b56b  scripts/reference-contract-catalog.mjs
a4e3aa7b623b254f2da8f05bd40faf96d79fae15b7ea43f1277829b23f1e9492  tests/reference-contract-catalog.test.js
c4473a1b3c7be22e7ee5c8f56d42dacd0561e48d2a8fbb63f3743d0ab445b55a  exact-diff.patch
```

[sha256.json](sha256.json) records final source/evidence hashes. Original SPEC0209, frozen role-decisions and the supplied active R13 I1 report match their initial hashes. R13 artifacts, catalog/maps and active reports were not edited.

## Known limits and stop boundary

This is conservative same-physical-source literal-role tracking. It does not evaluate concatenation, execute functions/constructors/guests, resolve variables/imports across files, prove consumer semantics, or perform whole-program/program-language analysis. It records string/template text and object-key digests at AST roles, not arbitrary computed program values. Shared document evidence covers the existing recognized, parseable TypeScript fragments and JSON fences. Malformed/unsupported fragments retain their existing UNKNOWN/error behavior; other languages and unrecognized fences were not newly analyzed. No universal no-language or absence-of-other-leaks claim follows.

Opaque JSON objects continue to hash canonical ordered JSON; literal digests/lengths describe decoded AST string/template/key text. Exact authenticated enclosing-source hashes and relative locators remain separate provenance. The prior live 44,132-entry/98-ID-change information is Lead-supplied context only, not independently measured or accepted here. No historical/current catalog or map was opened, regenerated or migrated.

Writes were restricted to the two owned source files and new role-r14 evidence/disposable fixtures. No actual DSH/reference/live collector, install, network/provider/DB, descendant, root checkout, lockfile, shared ledger, other phase code, commit or push. Newly approved SPEC0214/0215 remain outside this ownership and were untouched. No independent I1 self-approval or parity acceptance. Lead next: fresh independent I1 of these exact hashes, then any authorized live/identity/denominator revalidation and ledger integration. Builder stops here.
