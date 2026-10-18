# SPEC0209 T2 — bounded R16 Python role-collision hypothesis

**Hypothesis CONFIRMED; I0_IMPLEMENTED.** Builder stops after this bounded handoff. Fresh I1 and any live/rebase/ledger work belong to Lead. No helper/parity/release acceptance or P100-003 completion is granted. [claim.json](claim.json) records the user authorization, input hashes, exclusive paths and continuity. No descendants or capacity retries.

## RED reproduction before implementation

Two synthetic `python/sdk/src/sdk.py` fixtures contain the exact reported program bytes, with import/call text held inert and parsed only by the existing stdlib AST subprocess:

```python
import subprocess
source = 'throw/PY_ROLE/'
def run(value: 'throw/PY_ROLE/') -> None:
    pass
subprocess.run(['node', '-e', source])
```

```python
import subprocess
def run(value: 'throw/PY_ROLE/') -> None:
    pass
subprocess.run(['node', '-e', 'throw/PY_ROLE/'])
```

Against the unchanged R15 helper, both fixtures retained raw program bytes in the string annotation. A third, sink-independent fixture using an ordinary `consume(...)` call and method return also retained the same-source bytes in nested/return/method/field annotations. These three cases failed RED. All 67 existing cases and the new declaration-only control passed: **3 failed / 68 passed**. Thus the hypothesis was reproduced, rather than assumed from source inspection. Guest source, subprocess calls and fixture module imports were never executed.

## Small confirmed repair

Only the existing embedded `PYTHON_AST` program changed. A fresh digest set is built for each parsed physical Python source before emitting its declarations. Generic AST traversal harvests runtime string/bytes constants in ordinary assignments, calls, defaults, decorators, returns, bodies and other expression positions. It does not identify a sink, language or program by words; `subprocess`, `node` and `-e` occur only in the synthetic witness source, not in the classification logic.

Annotation/return/type-parameter roots are declaration metadata and excluded from the runtime index. Python docstrings and literal identifier-only `__all__` lists/tuples are also treated as declaration metadata, preventing self-contamination of genuine forward references and export names. Mixed/dynamic/invalid export assignments retain conservative runtime handling; the existing export extraction logic is unchanged.

`typ` checks whether a string annotation constant's digest occurs in that source's runtime set before allowing its old static spelling projection. A collision becomes explicit UNKNOWN with a collision reason, SHA-256 and UTF-8 length. The existing unsafe-literal/dynamic-annotation guards remain. The index is rebuilt per input item, so runtime data in another Python file cannot contaminate the annotation file. Nothing evaluates an initializer, resolves a variable, imports a fixture module, executes a guest or runs the recorded subprocess call.

Declaration names, export symbols/rows, owners, source paths/hashes and catalog ID construction were untouched. The helper text outside the embedded Python program is byte-identical to its pre-round version. No catalog or actual installed Python source was inspected to claim a real migration result.

## Positive controls and retained guards

Four new cases (two parameterized exact witnesses, one generic runtime case and one positive control) bring the focused suite to **71**. The positive control preserves `Client`/`Remote` forward-reference annotations, nested `list['Client']`, method returns and field annotations, genuine class/function names, `__all__` names, and an imported export alias. Its class docstring and `__all__` list contain `Client`; a different physical Python file has runtime `consume("Client")`, proving metadata exclusion and source isolation together.

The exact witnesses retain two entries each (function + source surface); the generic function/class/field/method source retains five; the declaration/export control retains seven and the separate runtime-only source retains one. Owner, exact source hash and NOT_VERIFIED parity assertions remain. These are synthetic counts, not a real denominator measurement.

All **67 prior test-case bodies and assertions are byte-identical**, including R15's recorded refinements and every older known-bad guard. No assertion refinement or test removal was needed. Only new cases were inserted and disposable fixture roots relocated from role-r15 to owned role-r16. [retention.json](retention.json) records the byte checks and unchanged identity/emission code boundary.

## Actual validation

Node **22.23.2**, working directory `/tmp/cvg-pare100-exec-20261014-6az3hlay/worktree`. RED and GREEN command:

```text
/home/ricardo/.nvm/versions/node/v22.23.2/bin/node node_modules/vitest/vitest.mjs run tests/reference-contract-catalog.test.js --reporter=verbose
```

| Phase | Exit | Actual result | Log |
| --- | --- | --- | --- |
| RED before helper edit | 1 | 3 failed / 68 passed | [red.log](red.log) |
| GREEN | 0 | 71/71, no skips | [green.log](green.log) |
| Final ESLint, two owned files | 0 | PASS; empty original output retained | [lint.log](lint.log) |
| Final Prettier check, two owned files | 0 | PASS | [format.log](format.log) |

[commands.json](commands.json) contains exact commands/exits. Existing negative Git/CLI tests work on disposable synthetic fixture trees; the existing Python extraction uses isolated `python3 -I` with stdlib `ast`, JSON, hashing and regular expressions. The existing literal-only export-list evaluation is unchanged. Fixture code and its calls are AST data, never executed. No broad gates/research/redesign followed GREEN.

## Exact final candidate

[exact-diff.patch](exact-diff.patch) is the exact unified delta against the saved pre-R16 versions of the two pre-existing untracked worktree source files.

```text
d991ad976563bb094419819d8e60fdbc97fde6b491d14edfbc82c7d857562f62  scripts/reference-contract-catalog.mjs
8b0dd210e70b582cfd163994d685b213e8564c65ab25bffa3e442ac28afda4ad  tests/reference-contract-catalog.test.js
9fdfd3bafd145dbde1d02695df93a6c4c33665893ad5f7b347155a92e90e943c  exact-diff.patch
```

[sha256.json](sha256.json) records final source/evidence hashes. Original SPEC0209 and frozen role-decisions match their pre-round hashes. R15 and other frozen artifacts were not edited.

## Limits and stop boundary

This is conservative, source-local literal-role matching. It preserves the existing supported annotation grammar; it does not add full Python type-hint resolution or support for every forward-reference expression format. Unsupported annotation forms retain their prior UNKNOWN treatment. The traversal records runtime string/bytes constants, not computed program values; it does not evaluate concatenation/interpolation, trace variables, resolve cross-file flows or analyze consumer semantics. Annotation/docstring/export metadata consumed dynamically as program source is not resolved by this bounded index. No whole-program, sink-specific, universal no-language or absence-of-other-leaks claim is made.

The opacity representation remains the existing annotation-field UNKNOWN with colliding literal digest/length and exact enclosing source provenance. All requirements remain emitted; no real identity/denominator/parity acceptance follows from synthetic tests. Lead owns fresh I1 and any subsequent actual-source/live/rebase proof.

Writes were limited to the two owned source files and new role-r16 evidence/temporary fixtures. No actual reference/live catalog/maps, root checkout, lockfile, shared ledger, other phase code, network/provider/DB, descendant, commit or push. Frozen SPEC0214 source/handoff remains outside this ownership and untouched. No self-I1 or parity acceptance. Builder stops here.
