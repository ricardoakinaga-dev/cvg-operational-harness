# I1 R13 static source review

Verdict: **FAIL_STATIC_SOURCE**. Two material source-role defects remain. Both traces below are manual control-flow deductions, not executed reproductions. No descendant reviewers were used.

## Scope and procedure

Packet: `/tmp/cvg-pare100-exec-20261014-6az3hlay/critic-reference-r13-packet`.

Read completely: original SPEC0209; frozen `adjudicate-reference-r11/role-decisions.json` (only the frozen decisions, not the report it references); helper lines 1–1848; tests lines 1–1404. Tests are evidence of intended assertions only; their outcomes are unverified. No prior Builder/critic report contents were opened. No reference-root files, Git commands, environment variables, credentials, network, provider, build, collector, embedded Python, guest code, or tests were accessed/executed. Standard filesystem inventory, text reads, line numbering and SHA-256 commands were used. No packet code was imported or evaluated.

**Procedure deviation:** the first tool batch included `pwd` in the supplied working directory and `ls -la` of the adjacent execution directory, besides the packet directory listing. That exposed current-directory metadata and sibling names/stat metadata beyond the requested packet-plus-sentinel inventory. No sibling file contents were read. Therefore strict exact-scope procedural compliance is not claimed. All subsequent source-content reads were confined to the four packet files and adjacent sentinel. The only intentional writes are this report and `verdict.json` in the authorized result directory; no repository coordination/runtime/log/backlog files were written.

## Material findings

### I1-R13-01 — Same-source TypeScript fences lose shared payload evidence (high)

Location: helper 1130–1158, 1221–1254; 710–737; 540–572.

The document prepass shares JSON payload literals across JSON fences, but indexes no TypeScript fences. Each recognized TypeScript fence is independently passed to `extractTypeScriptContracts`, which creates a fresh SourceFile and fresh initializer-literal set. Those sets do not share the authenticated Markdown source identity carried by the enclosing collector.

Concrete source context, in one candidate `docs/tool-catalog.md`:

````text
# Tools
## Mirror
```ts public-api
export type SourceMirror = 'throw/FENCE_I1/';
```
## Program
```ts public-api
export const WorkerSource = 'throw/FENCE_I1/';
new Worker(WorkerSource, { eval: true });
```
````

Manual node/context → output trace:

1. `extractDocument` receives one physical source path. Its prepass ignores both TypeScript fences because only `indexingFence === 'json'` contributes literals (1138–1145).
2. First fence: `extractTypeScriptContracts` creates its own SourceFile (710–716). The type alias has no initializer, so its fresh payload set stays empty (724–737).
3. `printed(node.type)` sees the literal `throw/FENCE_I1/`. It is absent from that set and satisfies the vocabulary regex (540–551). The printer therefore returns the literal type including its exact program bytes (569–572).
4. The `document-type` entry for `Tools/Mirror/SourceMirror` retains those bytes at `shape.declarations[0].type`. Its shape has no UNKNOWN, so `emitFor` marks this entry STATIC (1423). Parity remains NOT_VERIFIED.
5. Second fence: another SourceFile/set masks the initializer through `staticData` (598–605). Its known payload evidence cannot retroactively protect the first fence's type. Both entries nevertheless have the same catalog `source` Markdown path and source digest.

The explicit Worker/eval context establishes the program-source role locally in the same physical source; this is not a claim that a parseable declaration name is implementation. Frozen decision C requires the parallel literal-valued representation to stay opaque. At minimum this same-source dual must remain UNKNOWN. Existing JSON cross-fence tests (373–407) do not exercise TypeScript cross-fence sharing; TS mirror tests stay within one extraction call.

Required correction: preserve physical-source role evidence across recognized TypeScript fragments before projection. Retain the existing requirement/source/owner identities and UNKNOWN provenance; no program blacklist or filename identity change is needed.

### I1-R13-02 — Direct executable-source arguments escape the initializer-only mirror index (high)

Location: helper 724–737, 799–811, 540–572.

The prepass records literal descendants only of `node.initializer` or export-assignment expressions. A standalone expression-statement call can carry explicit executable source without any initializer root. The mirrored contract type is then classified by character vocabulary rather than the source-local payload context.

Concrete source context in a candidate TypeScript file:

```typescript
export type SourceMirror = 'throw/INLINE_I1/';
new Worker('throw/INLINE_I1/', { eval: true });
```

Manual node/context → output trace:

1. The alias literal is under `node.type`, not an initializer. The NewExpression's first argument is a StringLiteral; neither it nor the enclosing ExpressionStatement has `initializer`, and neither is an ExportAssignment.
2. Traversal visits the `eval: true` property's initializer, but that adds no string literal. Consequently `throw/INLINE_I1/` is never entered in `payloadLiterals` (730–733).
3. The alias branch calls `printed(node.type)` (799–811). No payload match exists; the bytes match the regex at 551; the printer copies the exact literal type (569–572).
4. The emitted `type` entry for `SourceMirror` has the program in `shape.declarations[0].type`, is STATIC at 1423, and remains NOT_VERIFIED. The generic UNKNOWN `source-surface` entry (1471–1477) does not make the copied bytes opaque.

Here the same source explicitly passes the matching literal as executable Worker source with `eval: true`. This is a concrete local role collision, not an inferred consumer elsewhere or a demand for universal sink analysis. Frozen C requires opacity in the parallel representation. Wrapped-initializer tests at 257–298 and mirrors at 465–502 do not cover an argument outside every initializer/export assignment.

Required correction: initializer-only evidence cannot be the full boundary for unresolved same-source expression-payload roles. Extend source-local evidence or conservatively retain such duals UNKNOWN before printing contract literals. Preserve source/owner/requirement entries; do not introduce language/program spelling blacklists.

## Other requested traces assessed

- **Nested JSON payload objects:** `jsonChildRole` makes payload absorbing (997–1008). Default/const/examples/unclassified object values become whole-object UNKNOWN digest/length at 1088–1093; arrays recurse with the same role (1084–1087). Their nested name/required/type keys cannot reopen declaration privilege. `jsonPayloadLiterals` indexes payload strings and object keys (1019–1037). Tests 190–228 and 504–571 specify these cases. No material defect found on those traced paths.
- **TypeScript instance keys:** `staticData` uses `payloadName` for assignment and method/shorthand names (617–628), including identifiers; nested objects recurse. Those key bytes become UNKNOWN digest/length (504–512). Pre-indexing also collects identifier/numeric object keys (490–496). Tests 230–255 cover nested instance keys. No material defect found on that path.
- **Unsupported initializer descendants vs parallel types:** binary, conditional, new and tagged-template initializer descendants are indexed by recursive AST traversal before projection (471–503, 724–737); fallback output carries digests/lengths (640–643), and matching literal types are UNKNOWN at 564–568. Tests 257–298 exercise these forms. This does not close the two evidence-scope holes above.
- **Genuine names, including spaces:** string-literal member names have a separate exact `declared_name` projection (516–521, 679–683). Thus a declaration-only event/tool name such as `throw 0` remains inert metadata even while the existing identity is opaque. Recognized JSON declaration `name`/`required` values survive when no local payload collision exists (1073–1075); schema-map keys retain exact spelling (1112–1123). Tests 300–345 describe this behavior. No defect is alleged merely because those bytes parse as a program.
- **Same-source collisions on indexed paths:** TS declarationName/nodeName consult the source-local initializer set (513–520, 574–579); JSON shares payload evidence across JSON fences (1132–1158) and masks colliding name/required values or schema-map keys (1073–1075, 1094–1101). Tests 347–407 specify UNKNOWN outcomes. This evidence is local to the physical JSON document but only to each parsed TS fragment, which is the distinction in finding 01.
- **Provenance and denominator:** authenticated relative paths remain exact metadata (205–211, 1408–1425, 1575–1577). No filename hashing/migration is requested. UNKNOWN ownership is retained (446–459, 1392–1393); all emitted entries carry owner/source/digest and NOT_VERIFIED. Freeze comparison rejects missing existing IDs and entry drift (1718–1724). This is source inspection, not authentication of any actual reference checkout or full denominator/semantic acceptance.

## Sentinel verification

Adjacent sentinel SHA-256, before and after full source reading:
`e83861c59a017073a019e94f749db0d0270e3aa6a81d720312b3bc2819612d0e`.

The regular-file set was enumerated before and after and equals exactly these four sentinel paths, without added/missing regular files. Each digest matched its sentinel entry in both observations:

| Relative file | SHA-256 before = after = sentinel |
| --- | --- |
| scripts/reference-contract-catalog.mjs | b4f6d559f68e3a4b1e2a8d28d3573e9d02b6dbf002062de42f9762d7fe2a6ea8 |
| tests/reference-contract-catalog.test.js | ee3c527d04381fdacfc7e18b7075fba0521dcc9eb6d01739f6116c714901322f |
| docs/02_spec/0209_pare100_reference_catalog.md | 6183bb50a4e9711fe13b21a3f97601d3c94dab2de46eb4a10d5328fc58871b94 |
| docs/04_audit/evidence/PARE100-EXEC-20261014/adjudicate-reference-r11/role-decisions.json | af4a8f72da413c41567ce4e5c7aab14d6f596829329d486f60c4d0a67376787a |

The final all-entry inventory showed directories plus precisely those four regular files, no symlinks or other entries. The initial enumeration selected regular files; absence of non-regular entries at that initial instant was not independently captured. Snapshot hashes do not establish uninterrupted immutability between observations.

## Limits

No executed reproduction, test pass, QA acceptance, full semantic freeze, rebase acceptance, 100% parity, or release acceptance is asserted. These findings concern the frozen helper's source-role projection only. Genuine declarations/selectors and authenticated filenames are not defects merely because another grammar parses their spelling. Proposed traces are review reasoning, not evidence that these exact examples occur in the unvisited reference root. Broader behavior, dependencies, complete semantic coverage and runtime enforcement remain unverified.
