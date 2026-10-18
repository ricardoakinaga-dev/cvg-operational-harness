# R12 independent I1 static source review

**FAIL_STATIC_SOURCE — three material source defects.** This is a bounded review of source text against original SPEC0209 and the four frozen role decisions, not an executable reference audit. No descendants were created.

Input resolution: the literal path ending in `critic-reference-r12-packet4files` does not exist. The adjacent `critic-reference-r12-packet` contains exactly the four requested inputs and its matching sentinel; that four-file packet was reviewed. No alternative candidate or previous report was substituted.

Scope/claim: read-only packet and adjacent sentinel; exclusive output claim is `critic-reference-r12-result/report.md` and `critic-reference-r12-result/verdict.json`. Repository governance/ledger reads were administrative only, not evidence for the verdict. No prior critic report or builder rationale was opened. The explicit output-only instruction takes precedence over repository ledger/claim edits: no repository files were changed.

Only standard filesystem reads, SHA-256 checks and manual text analysis were used. The collector, its imports, embedded Python program, fixtures, tests, builds and commands appearing in the packet were never executed. No reference-root, Git, environment/credential or installed-reference inspection, network or provider operation was performed. Snippets below are unexecuted analytical witnesses, not observations of installed-reference contents.

## Material findings

### R12-S01 / P1 — instance payload keys bypass the opaque boundary

Location: helper lines 975–1003, especially the raw `[key, ...]` pair at 999; JSON ingress at 1058 and 1335; output at 1250–1263 and serializer at 30–42.

Consider this valid schema input:

```json
{"type":"object","default":{"throw/ROLE_R12/":true}}
```

Its `default` subtree is instance payload, not a tool/schema declaration. A consumer using `new Worker(Object.keys(schema.default)[0], { eval: true })` would supply the key as actual guest program source: `throw/ROLE_R12/` is a complete JavaScript throw of a regex literal. This consumer expression is illustrative only; neither it nor the guest was run.

Concrete reachable projection: `.schema.json` enters at 1335 (a documented JSON fence also enters at 1058). At 987–998, `default` gets the absorbing `payload` role. The object-key lexical check at 977–979 accepts `throw/ROLE_R12/`. The entry transformation at 999 then copies that key verbatim; only the boolean value is recursively projected. Line 1003 returns `true`. Thus the projected default still contains the entire raw program as an instance key. There is no UNKNOWN in this small shape, so 1261 labels the entry STATIC. Hashing the enclosing contract and serializing its keys do not remove these bytes.

This is a source-role defect, not a request to blacklist `throw`, slashes or programs by spelling. The same spelling in an authenticated event/tool declaration is legitimate. Inside `default`, the key has no established declaration privilege. Preserve the enclosing requirement/source/owner, and represent unclassified payload keys (or their complete subtree) as UNKNOWN with digest/length. Apply the same reasoning to `const`, `examples` and unclassified subtrees. The TypeScript object-initializer route also has an analogous raw-key channel: 568–570 calls `nodeName`, whose lexical acceptance at 525–528 does not establish a declaration role for an instance key.

Frozen test D at tests 285–355 checks opaque payload string **values** under ordinary keys `name`, `nested`, `type` and `required`; it does not cover payload keys carrying source bytes. The finding does not depend on merely program-looking schema property names.

### R12-S02 / P1 — dynamic initializer wrappers leave mirrored literal types printable

Location: helper 538–588, 664–680, 489–520 and 742–754.

Unexecuted same-file witness:

```ts
import { Worker } from 'node:worker_threads';
export const WorkerSource = 'throw/ROLE_R12/' + '';
export type SourceMirror = 'throw/ROLE_R12/';
new Worker(WorkerSource, { eval: true });
```

The guest role is explicit at the Worker use. Concatenating the empty string does not change its bytes. This is actual program source by use, rather than an event name that happens to parse as JavaScript.

The prepass calls `staticData` on the binary initializer at 673. Binary expressions fall through to 586–588, producing UNKNOWN with only `syntax_kind`; their string operands are not visited by `staticData`. `rememberOpaqueStrings` records only records with the exact `stringInitializerReason` (668–670). Although `visitInitializers` traverses the AST, its literal children have no `.initializer`, so neither operand enters that index. Consequently `printed(SourceMirror.type)` sees no indexed match at 497–499. The guest bytes pass the vocabulary regex at 500 and are printed raw at 518–520. The alias emission at 753 and catalog emission at 1260 preserve the raw guest while the value declaration is opaque. Even the initializer's own UNKNOWN lacks the literal digest/length.

Retain UNKNOWN and source/owner/requirement, but make same-source opaque-initializer tracking cover literal descendants of unsupported initializer expressions without evaluating those expressions. Protect each mirrored representation. Do not infer legitimate selector status from a missing index entry and lexical admissibility alone.

Frozen test C at tests 246–283 covers direct string initializers, for which the prepass succeeds. It does not exercise concatenation/conditional or other opaque expression wrappers. No test was run for this witness.

### R12-S03 / P2 — lexically excluded genuine names fail frozen PRESERVE decision A

Location: helper 19–20, 523–528, 726–739, 948–968 and 1232–1244.

Unexecuted declaration witnesses:

```ts
export interface Events { 'throw 0'(id: string): void }
```

```json
{"name":"throw 0","parameters":{"type":"object"}}
```

The TypeScript member is explicitly an event declaration; the JSON witness has the same tool-catalog declaration role accepted by test A. No executable-source use or instance payload is involved. Here the incidental JavaScript parse of `throw 0` does not make the bytes a program payload.

`nodeName` rejects the space through `identityVocabulary` and replaces the exact event spelling with an opaque object; the resulting symbol is then digested by `emitFor`. The JSON `name` branch similarly rejects the space at 962 and returns UNKNOWN at 966–969. The exact name is therefore absent from the respective output contract. Source and requirement remain, but frozen case A explicitly requires preserving the genuine inert spelling. No ambiguity in the illustrated declaration role justifies treating it as unresolved.

Test A at tests 190–219 uses only `throw/ROLE_R12/`, which already fits both regexes. That test cannot distinguish role-based preservation from lexical admission. Preserve names based on their established declaration role; keep payload uses opaque. This requests neither a program-word blacklist nor blanket preservation of unclassified text.

## Other bounded observations

The revised JSON child-role transition at 987–998 does prevent ordinary descendant **values** under payload from regaining vocabulary privilege via `name`, `type`, `required`, schema maps or nested arrays. The same-source prepass does suppress direct-string initializer mirrors even when the alias occurs first. These improvements do not close S01/S02.

Exact authenticated source-relative filenames remain inert provenance, including the program-shaped filename in tests 357–384. The source path is authenticated against pinned blob bytes at 194–212 and emitted as `source` at 1254. No filename hashing, path migration or lexical program blacklist is requested.

Static inspection found explicit root/commit/version checks, rejection of source symlinks, pinned-tree blob authentication, before-return source reauthentication and HEAD checks, and duplicate/source/requirement-removal checks in validation/freeze comparison (139–234, 1383–1387, 1451–1567). UNKNOWN entries remain emitted, source surfaces remain present, owners are attached, and parity stays NOT_VERIFIED. These are source observations, not live authentication or freeze results. No migration map, real denominator count, complete semantic coverage or executable behavior was verified here. The four-file packet alone cannot establish those outcomes.

## Integrity and limits

All four files match the adjacent sentinel before and after review; the file set is exactly the four requested inputs. Sentinel SHA-256 before/after: `1dc22c04df3f07f4415fb34ae8345fe7aacd57148512e0cdc7b072d4dad58c7a`.

| Input | SHA-256 before = after |
| --- | --- |
| helper | `26fd4241e6b2589f034042c665b211de333caec443077dc889837a9c7fb42000` |
| tests | `2abb886bb66c8d3a3c0972cc91119128a8ca5ef8b792220924c38f04c5e94af2` |
| original SPEC0209 | `6183bb50a4e9711fe13b21a3f97601d3c94dab2de46eb4a10d5328fc58871b94` |
| role decisions | `af4a8f72da413c41567ce4e5c7aab14d6f596829329d486f60c4d0a67376787a` |

The traces are source-derived, not executed reproductions. Whether the installed pinned reference actually contains these witnesses is unknown and was deliberately not investigated. Dependency/parser behavior and concurrent-filesystem races were not empirically tested. The sentinel proves packet consistency, not independent authenticity of its upstream producer. Review coverage is bounded and does not prove absence of further defects.

Executable QA, full parity, actual reference freeze and identity/denominator migration are all NOT_VERIFIED in this review. No production, release or task-completion acceptance is granted. PASS_STATIC_SOURCE is withheld because the material gaps above remain.
