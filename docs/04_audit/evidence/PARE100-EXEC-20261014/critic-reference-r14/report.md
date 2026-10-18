# critic-reference-r14-result

Verdict: **FAIL_STATIC_SOURCE**. Two material role-to-output paths remain in the sealed helper. These are manual control-flow findings, not executed reproductions. Whether the external pinned reference actually contains either input is **UNKNOWN**.

Reviewer: fresh I1, STATIC_SOURCE only, no descendants. Authority: original SPEC0209 and frozen role-decisions.json in this packet. No prior builder or critic report was consulted; historical case names appearing in current test source were read only as test source.

## I1-R14-01 — An unclassified JSON member name escapes the payload boundary

Materiality: an unclassified JSON key is copied verbatim and does not enter the source-local payload index. Consequently the same bytes can also escape through a parallel literal type in another recognized fragment of the same physical Markdown source. This does not concern an authenticated filename, a declared schema-map property name, or a genuine selector.

Helper evidence (all line numbers refer to scripts/reference-contract-catalog.mjs):

- Lines 1028–1039 assign an unrecognized declaration-object member's **value** the payload role.
- Lines 1050–1068 index an object's keys only when the **parent object** is already payload (or an object-valued vocabulary slot). A key of a declaration object is not indexed merely because its child role is payload.
- Lines 1133–1147 allow such a key through a character grammar and return it unchanged as the output property name. This is a syntax check, not an established declaration role.
- Lines 1203–1217 and 1285–1306 share the resulting incomplete index across recognized JSON and TS fences. Lines 548–572 then print an otherwise bounded literal type whose bytes were omitted from that index.

Minimal manual witness, proposed text for the already-supported docs/tool-catalog.md route, **not created or executed**:

````text
# Roles
## Payload
```json
{"type":"object","throw/ROOT_I1/":true}
```
## Mirror
```ts public-api
export type SourceMirror = 'throw/ROOT_I1/';
```
````

Trace: the unrecognized `throw/ROOT_I1/` member has no role-established declaration privilege. Its boolean child returns unchanged at line 1158. Its key passes line 1136 and is copied at line 1146. The prepass hashes neither that key nor its boolean value. The JSON shape therefore contains the key literally, with no UNKNOWN introduced by this member; the SourceMirror type is also printed literally. For the shown simple headings, neither route needs identity opacity to mask the error. emitFor attaches source/source_sha256/owner_task and NOT_VERIFIED, but hasUnknown cannot detect an unresolved role that projection never marked UNKNOWN (lines 1465–1478).

Expected: keep the enclosing requirement, exact authenticated source, digest, owner and NOT_VERIFIED; represent the unresolved member/payload and its same-source literal mirror as UNKNOWN with reason and opaque digest/length. Resolve this at the finite JSON role boundary; no expression evaluation or cross-file resolver is needed.

Current test-source coverage: lines 344–381 cover payload keys **inside** default/const/examples/unclassified values; lines 527–560 cover collisions where the key is already inside default payload. Neither covers the transition from an unclassified declaration-object **member name** to its payload value. The recognized mixed-fragment test at lines 304–342 uses a default string, which is indexed correctly and does not exercise this gap. No tests were run.

## I1-R14-02 — A concrete payload table cell reappears as an unguarded symbol

Materiality: table cells are made opaque in the shape, but the first cell is separately concatenated into the entry identity. That identity route never checks the physical source's payload evidence. A concrete runtime guest-source literal can therefore be copied despite being UNKNOWN in every projected cell/value. UNKNOWN elsewhere does not repair forbidden bytes in another output representation.

Helper evidence:

- Lines 1193–1217 correctly index runtime strings in recognized TS fences across the physical Markdown source.
- Lines 1380–1402 accept arbitrary table headers/cells, then form the table key from context() and raw columns[0] at line 1393. No column-role authentication occurs.
- Lines 1406–1416 pass that raw key as symbol, although columns/rows themselves go through projectJsonContract and become opaque.
- Lines 1447–1460 consult only identityVocabulary(symbol), not the source-local payload set or a declaration role; line 1471 emits the literal symbol.

Minimal manual witness for the same supported document route, **not created or executed**:

````text
# Tools
## Payloads
```ts public-api
export const WorkerSource = 'throw/TABLE_I1/';
new Worker(WorkerSource, { eval: true });
```
| Example | Meaning |
| --- | --- |
| throw/TABLE_I1/ | guest source |
````

Trace: the guest-source literal is runtime payload without evaluating Worker or its argument. The prepass remembers it, and staticData makes WorkerSource.value UNKNOWN. The table's Example cell is instance payload, not an authenticated event/tool declaration or selector; its projected row value is opaque. Nevertheless line 1393 produces `Tools/Payloads/throw/TABLE_I1/`. Every character passes identityVocabulary, so the exact payload bytes survive in the document-table-row symbol. The output still has source/source_sha256/owner_task, UNKNOWN cell projections and NOT_VERIFIED; those retained fields do not prevent this second copy.

Expected: preserve the table requirement and provenance/owner while keeping its unresolved payload identity opaque/UNKNOWN, with any identity migration separately accounted for. Do not hash authenticated filenames or reject genuine declaration names merely because their bytes parse as a program. This finding depends on the actual payload role and alternate output path, not a word blacklist.

Current test-source coverage: lines 1283–1310 check a body-shaped string in a non-first table cell and lines 1313–1362 put body text in a first cell/heading whose punctuation already fails identityVocabulary. Those inputs do not exercise bounded payload bytes passing the raw table-symbol route. The R14 physical-source prepass tests at lines 190–342 exercise TS/JSON shapes, not table identity. No tests were run.

## Bounded observations

The current routes do retain UNKNOWN and provenance/ownership for the cases explicitly handled: runtime TS strings, literal descendants of ordinary runtime expressions, nested JSON payload objects/keys, and matching literal types in recognized same-document fragments. The R14 tests explicitly describe forward/reverse fragment order, direct runtime arguments, generic expression contexts, declaration-only names/locators and physical-source separation. Their source is evidence of intended coverage, not evidence of passing execution.

The findings above do not require recovering concatenated values, evaluating expressions, following dependencies, recognizing arbitrary programs, or consulting another physical source. Exact authenticated relative filenames remain inert provenance under the frozen decision. Genuine role-established names/selectors are not defects merely because the same bytes can parse in another language. Requirements, owners, sources and UNKNOWNs must remain in the denominator. No implementation changes or migration acceptance were made by this review.

## Packet integrity and exact sentinel observations

Packet root: /tmp/cvg-pare100-exec-20261014-6az3hlay/critic-reference-r14-packet

Sentinel: /tmp/cvg-pare100-exec-20261014-6az3hlay/critic-reference-r14-packet.sentinel.json

Sentinel SHA-256 **pre**: `461fba940c893b277d40d10d650e98a507f0ec6c004fee98e737e10a3df54faf`

Sentinel SHA-256 **post**: `461fba940c893b277d40d10d650e98a507f0ec6c004fee98e737e10a3df54faf`

Exact sentinel text, identical at both reads:

```json
{
  "files": {
    "scripts/reference-contract-catalog.mjs": "068ec6ff2625063a2513d2ad4b6e339a5bda61857faab659a0492254eea8b56b",
    "tests/reference-contract-catalog.test.js": "a4e3aa7b623b254f2da8f05bd40faf96d79fae15b7ea43f1277829b23f1e9492",
    "docs/02_spec/0209_pare100_reference_catalog.md": "6183bb50a4e9711fe13b21a3f97601d3c94dab2de46eb4a10d5328fc58871b94",
    "docs/04_audit/evidence/PARE100-EXEC-20261014/adjudicate-reference-r11/role-decisions.json": "af4a8f72da413c41567ce4e5c7aab14d6f596829329d486f60c4d0a67376787a"
  }
}
```

The regular-file set was exactly these four relative paths in the initial enumeration and the final enumeration; each file's SHA-256 matched its sentinel value both times. The final typed inventory additionally showed only the necessary directories and these four regular files, with no other leaf entries or symlinks. No packet or sentinel file was written.

## Actual procedure and limitations

Only ordinary shell listing/reading/hashing tools were used for inspection: ls, find, sha256sum, printf, cat, wc, nl and sed. The helper and test source were read in full; embedded Python was read as text only. Analysis consisted of manual branch/data-flow tracing. No imports, reference/Git commands, environment inspection commands, credential reads, network/providers/DB access, fixtures, tests, collectors, embedded Python, module code or builds were executed. No descendants were created. No outside skills, repository operational files, current-directory inventory, or prior reports were read. Only this report and its verdict are output artifacts.

**Procedural deviation:** the first command was `ls -la` on the packet root; it displayed the `..` parent entry and its metadata. That exceeded the requested no-outside-metadata boundary. No sibling inventory or parent contents were listed. This review therefore does not claim flawless strict packet-only procedure. The sentinel was located using the narrowly scoped adjacent `critic-reference-r14*sentinel*` glob, which returned only the authorized sentinel path.

**Ordering limitation:** initial packet hashes were obtained before content review; SPEC0209 and frozen decisions were then read before the first sentinel read/hash and manual comparison. Sentinel authentication was completed before helper/test review, but not before those two authority-document reads. The initial inventory checked regular files; the full typed/no-extra-leaf check was made after source review. Before/after matching hashes establish the observed endpoints, not continuous immutability, atomic snapshot isolation or reference authenticity beyond this supplied sentinel. Earlier read commands used the shell tool's default login setting; shell startup behavior was not independently audited.

External reference contents and occurrence of the witnesses: UNKNOWN. Executable QA: NOT_RUN. Full semantic freeze, complete migration, parity and release acceptance: NOT_ASSESSED/NOT_GRANTED. PASS_STATIC_SOURCE is withheld because of the two bounded material source findings; no broader PASS is inferred.
