# SPEC0209 T2 — role-r12 bounded builder handoff

Status: **I0_IMPLEMENTED**, synthetic validation only. Independent I1 and parity acceptance remain pending. Existing BuilderC/Lead claim was handed to this builder by the user; this round's claim and continuity are in [claim.json](claim.json). No descendants or capacity retries.

## Delivered change and limits

The helper now carries four finite JSON roles: declaration, schema-map, vocabulary and payload. Entering default/const/examples or an unclassified field makes payload context persistent through objects and arrays. Descendant name/type/required fields cannot recover declaration privileges. Established schema maps, schema children and tool parameter schemas retain declaration context, so genuine schema/tool names, required-property names and type selectors remain visible. Unclassified strings remain explicit UNKNOWN with reason, digest and UTF-8 length. Requirement entries, ownership and source records remain present.

TypeScript extraction indexes the string initializers already projected as UNKNOWN by staticData in each parsed source. Printed literal types matching those same-source initializer digests also become UNKNOWN with literal digest/length. The index is completed before emitting declarations, so preceding aliases are covered. It is source-local and does not affect nodeName or provenance. This is a conservative unresolved-dual-role rule, not an implementation recognizer: no keyword/program-language detection, consumer execution, whole-program analysis, or universal no-language claim. Arbitrary unresolved semantic roles remain UNKNOWN; roles outside this bounded repair remain OPEN for independent review.

R11-02 remains REJECT as submitted: exact authenticated relative source filenames are preserved as inert provenance. No source-path redaction or identity migration was introduced. The identity/emit/source/owner construction logic is unchanged. Current live counts and any complete rebase are NOT_RUN and remain Lead work; historical counts are not re-certified here.

## RED-first role regressions and preservation

Five cases were added before modifying the helper. The first run had two material failures and 37 passes (all 34 existing tests plus three new controls):

- A: identical program-shaped spelling `throw/ROLE_R12/` is retained as an actual declared event name and generated tool name.
- B: the same spelling is preserved as a declared literal selector and interface type constraint. An opaque initializer in a different source does not contaminate that declaration's role.
- C: fixed synthetic source contains a literal initializer, its literal-valued variable type and a preceding mirrored alias, with an explicit Worker eval-source consumer in the parsed fixture. Both type representations and the initializer become opaque; the Worker/guest is never executed. Three source requirements remain, with owner, source hash and NOT_VERIFIED parity.
- D: nested name/type/required values under default/const/examples/unclassified payloads become opaque, paired with retained genuine tool/schema names, required fields and type selectors. Both document and schema entries remain with exact owner/source assertions.
- Provenance: `apps/cli/src/function guest(){return 7;}.ts` remains exact in entry.source and sources[].path and carries the authenticated digest. Its actual function body marker is absent. Both source requirements remain.

The 34 original tests and assertions are retained byte-for-byte from their first existing test through end-of-file; [retention.json](retention.json) records this check and the new synthetic requirement counts. The only change outside the inserted tests is relocation of disposable fixture roots into this owned role-r12 directory.

Genuine fixture refinements after RED: the new tool fixture initially lacked package-ownership evidence. Adding its synthetic package heading did not establish ownership because the existing heading recognizer handles the real package namespace. An explicit static Source link to the synthetic package source establishes the intended P100-012 owner. The exact owner assertion was retained; owner logic and existing tests were untouched. Both unsuccessful reruns are preserved, not relabeled as GREEN.

## Actual validation

All test runs used Node **22.23.2**, command:

```text
/home/ricardo/.nvm/versions/node/v22.23.2/bin/node node_modules/vitest/vitest.mjs run tests/reference-contract-catalog.test.js --reporter=verbose
```

| Phase | Exit | Result | Original log bytes |
| --- | --- | --- | --- |
| RED, before helper change | 1 | 37 pass / 2 fail: mirrored type, nested payload context | [red.log](red.log) |
| First attempted GREEN | 1 | 38 pass / 1 fail: new fixture owner evidence | [attempted-green-1.log](attempted-green-1.log) |
| Second attempted GREEN | 1 | 38 pass / 1 fail: synthetic heading still insufficient | [attempted-green-2.log](attempted-green-2.log) |
| Final GREEN | 0 | 39 pass / 0 fail | [green.log](green.log) |
| Final ESLint, both owned source files | 0 | PASS, original log empty | [lint.log](lint.log) |
| Final Prettier check, both owned source files | 0 | PASS | [format.log](format.log) |

The attempted-green logs were initially written as green.log and renamed intact before subsequent runs. Commands, working directory and exit codes are in [commands.json](commands.json). Git warnings/errors in test logs are outputs of existing negative synthetic tests, which pass; they are not reference operations. Tests invoke existing tooling only on disposable synthetic fixtures, including existing Python AST projection and synthetic CLI subprocess checks. No executable guest payload is evaluated.

## Exact artifacts and handoff

[exact-diff.patch](exact-diff.patch) is the exact unified delta against the two saved pre-round files, rather than a misleading full-add diff for these pre-existing untracked files. SHA-256:

```text
6429691672f1bc4b65c9a0ba25382dd83f197cd34a6a1c7b375ba336ed9d4867  exact-diff.patch
26fd4241e6b2589f034042c665b211de333caec443077dc889837a9c7fb42000  scripts/reference-contract-catalog.mjs
2abb886bb66c8d3a3c0972cc91119128a8ca5ef8b792220924c38f04c5e94af2  tests/reference-contract-catalog.test.js
```

Frozen original SPEC0209, adjudication report and role-decisions hashes match the initial claim. [sha256.json](sha256.json) records final file/evidence hashes. No previous catalog/report was modified. Writes were restricted to the two owned source files and role-r12 evidence/temporary fixtures. No external actual DeepSeek reference, network, providers, DB, live collector, shared ledger, root checkout, lockfile, commit, push, I1 self-approval or parity acceptance.

Lead next action: independent I1 of this exact candidate; live collection, complete requirement/identity rebase if needed, and integration of continuity into shared ledgers remain Lead-owned. P100-003 and overall PARE100 acceptance remain open.
