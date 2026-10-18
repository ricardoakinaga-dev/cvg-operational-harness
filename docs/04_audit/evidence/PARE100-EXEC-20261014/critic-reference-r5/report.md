# Independent static review — SPEC0209 / R5

**Verdict: FAIL (bounded metadata-only library QA).** Three P1 source-backed gaps remain in the central prohibition on copying implementation text. These are static control/data-flow findings; none of the examples below was executed. They concern generated catalog contents, not evidence that the reference executes.

Only the frozen script, tests and SPEC0209 were reviewed as task inputs. Permitted root governance documents were read; no separate builder report, worktree code/history or external reference was consulted. No collector import/execution, test execution, synthetic repository, Git command, network/config/hook operation or descendant agent was used. Shell and Python were used only to read/hash inputs and serialize reports. The direct user scope overrides root ledger/coordination writes: claim and results exist only in the authorized result directory.

## Integrity

Sentinel SHA-256: `ee5d3170462240f730db6d08b242dfeee8cdef31b5e26ca7b8f36cc388c0b5e3`.

The sentinel digest and exact packet file set/hashes matched **before and after** review. There are precisely three regular input files and no symlinks or special entries. Directory sets also remain unchanged. Full records are in `integrity-before.json` and `integrity-after.json`.

| Input | SHA-256 |
| --- | --- |
| scripts/reference-contract-catalog.mjs | 648a2b3ce085e5bd4cb00b71146f6fabc2df5fe25dd6ba434d2522f4e42ae430 |
| tests/reference-contract-catalog.test.js | e7001501088941d703c54ba6a06e2b623b26b1eb8647282b1b0d08bf68d4fe99 |
| docs/02_spec/0209_pare100_reference_catalog.md | 6183bb50a4e9711fe13b21a3f97601d3c94dab2de46eb4a10d5328fc58871b94 |

Line references below are relative to this exact packet, not the live worktree. `S` means `scripts/reference-contract-catalog.mjs`; `T` means `tests/reference-contract-catalog.test.js`. SPEC0209:10 prohibits implementation copying; :12 requires unknown/unextractable data to retain reason/source.

## Findings

### R5-F01 — P1: Document row identities bypass cell redaction

**S:1065, :1081, :1127**, with raw heading handling at **S:1045**.

`extractDocument` builds the row key from raw `context()/columns[0]`, emits that key as the symbol, and `emitFor` stores the symbol verbatim. The projection at S:1083–1086 redacts cells only in the shape. For a declared catalog table with a guest function body in the first data cell, that body remains in `entry.symbol` even when the cell itself becomes UNKNOWN. A guest body in a heading likewise propagates through `context()`.

For example, a first cell containing `function guest() { return 1; /* DOC_BODY_MARKER */ }` follows this path without interpretation. This is an unexecuted static counterexample. The existing test T:712–739 places its body in the **second** cell (T:718) and uses safe headings, so it misses this path.

Project identity text as well as shape text. Use stable opaque digests for unsafe row/heading/anchor components while retaining the requirement entry, owner, source and UNKNOWN reason. Check the entire serialization for body absence.

### R5-F02 — P1: TypeScript literal keys/member names bypass string protection

**S:479–485, :526, :666, :676**; class/enum paths also use the same helper at S:719/:753.

`nodeName` returns a string literal's `node.text` verbatim. `staticData` uses it for initializer property names, and interface/class extraction embeds it in serialized symbols. Neither path applies the literal protection in `staticData` values or `printed` types.

Unexecuted static counterexample:

```ts
export const Options: Record<string, boolean> = {
  "function guest(){return 1;/* TS_NAME_BODY_MARKER */}": true
};
```

The guest body is copied into `shape.declarations[0].value.properties[0].name`. An interface method using the same quoted name copies it into its member symbol. The typed object example has no UNKNOWN reason for the unsafe key. T:513–534 covers executable AST/computed names, T:590–630 covers string values, and T:633–678 covers schema values; none covers quoted keys/member names.

Apply bounded vocabulary/opaque projection to literal names too, with stable digest-based identity components and source-bound UNKNOWN metadata for unsafe names. Preserve declaration/requirement entries instead of dropping them.

### R5-F03 — P1: Python bytes annotation literals reach `ast.unparse`

**S:802–806**, consumed by signatures at S:811/:815 and class/field extraction at S:823/:826.

`typ` permits `ast.Constant`, but its literal check only handles `str`. A `bytes` constant passes the whitelist and reaches `ast.unparse`, which copies its literal contents into the annotation text.

Unexecuted static counterexample:

```python
def run(value: b'function guest() { return 1; /* PY_BYTES_BODY_MARKER */ }') -> int:
    pass
```

The function is retained with the guest body inside its parameter type and no UNKNOWN marker for that literal. Python annotation syntax allows such an expression; it need not be executed for the copying path to be visible. T:464–475 covers lambda expressions and T:716 covers `str` annotations, not bytes constants.

Handle bytes as opaque hash/byte-length UNKNOWN data, or disallow non-vocabulary literal kinds before unparsing. Retain the declaration and its owner/source provenance.

## Requested checks and prior issues

| Area | Static assessment |
| --- | --- |
| Previous schema/document JSON raw-string issue | Addressed for the examined values: S:841–891 projects recursively, preserving UNKNOWN/hash/length; used by document JSON at :945 and JSON files at :1206. Regression source T:633–678 covers default/const/examples. Tests NOT_RUN. |
| Previous standalone **live-root** validator authentication issue | Addressed in source: S:1342–1367 invokes `inspectReference`, checks each live source against the pinned tree blob, and compares authenticated SHA-256/blob/byte count. Missing candidate sources are rejected at :1370–1372. Regression source T:680–710 recomputes all source metadata after a live edit and expects rejection with `{root}`. NOT_RUN. |
| Authentication trust boundary | `validateCatalog(catalog)` without `{root}` is intentionally checksum/shape-only (S:1342–1348); T:706 explicitly accepts its recomputed metadata. Its `VALID_STATIC_CATALOG` status is **not evidence of live/pin authentication**. This review gives authentication credit only to collection and the root-supplied validation path, relative to the expected/caller-selected pin. |
| Git implicit execution | S:94–125 disables replacement objects, fsmonitor/hooks and inherited global/system config; inspection uses rev-parse/config/ls-tree and hashes filesystem bytes directly (S:179–193), without status/diff/filter conversion. Promisor guard: S:142–163. Corresponding tests T:742–771 and :784–830 are source-only, NOT_RUN. No remaining material configured-filter/status issue identified by this static inspection. |
| Output IO | S:1441–1493 checks root containment, aliases, file kinds and hardlinks; writes an exclusive no-follow temporary inode and renames it. CLI also guards owner-map collision (S:1529). Test T:832–868 is NOT_RUN. No material stable-filesystem output issue identified statically; hostile concurrent path replacement was not established or tested. |
| UNKNOWN/provenance/denominator | S:1115–1135 retains owner/source hashes and NOT_VERIFIED; :1180/:1199/:1209/:1218/:1227 retains source-surface requirements; :1254–1258 rechecks collected bytes/HEAD; :1298–1305 explicitly limits parity claims. Literal channels in the findings still violate this boundary. Full semantic denominator completeness is not established. |
| Generated Python distribution | Untracked-only exclusion S:243–264; a tracked path is not excluded by that exception. S:1305–1314 assigns artifact closure to P100-052 with UNKNOWN/provenance limitations. Ownership is explicitly declared in source; actual artifact closure/owner-map correctness was not inspected or established. |

## Verification status and limits

- **PERFORMED:** read all 1,557 script lines, all 869 test lines and all 20 SPEC lines; trace each requested boundary; inspect the new regression assertions directly; verify sentinel, exact file set, file hashes, regular-file/no-symlink status and unchanged directory set before/after.
- **NOT_RUN:** collector, imports, tests, typecheck/lint, real-reference collection, freeze comparison, synthetic fixtures, configured-filter/hook probes, output IO probes, and the illustrative counterexamples above. Existing test definitions and suggested regression cases are not executions, schedules, or passing evidence. No future execution was scheduled.
- This static review cannot establish executable correctness, actual reference inventory counts/318-manifest or 55-family ownership completeness, full 36-card parity, or release readiness/authorization. It grants no release, deployment or production permission.

The scoped FAIL follows from the three remaining source-backed no-copy violations, independently of runtime or broader parity judgments. Remediation must preserve UNKNOWN/source/owner/requirement entries while preventing literal text from escaping through identity and annotation channels.
