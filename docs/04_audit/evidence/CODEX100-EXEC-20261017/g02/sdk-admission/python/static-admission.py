"""Static admission of the SDK profile inputs (DX100-G02 ADMIT). AST, ELF headers, hashes and stdlib re only.

No SDK, Pydantic, packaging or compiler code is imported or executed. Checks:
  1. private sdk-python tree equals the 22 pinned snapshots (bytes, SHA256, Git blob id);
  2. private python-deps equals the authenticated merge (169 files) and the TypeScript tree equals validation.json;
  3. module-level import closure of the openai_codex package resolves inside sdk-python, python-deps, the
     mounted stdlib (/usr/lib/python3.12, lib-dynload) or interpreter builtins; guarded imports are reported;
  4. native boundary: the pydantic_core extension is ELF64 x86-64 and every DT_NEEDED library exists in a
     mounted read-only root (/usr/lib/x86_64-linux-gnu);
  5. fixture parser/field checks re-derived from the source AST (SDKPY08/09 regex, generated response fields);
  6. the ten TypeScript sources and typescript.js match the node-transpile template and validation.json.
Usage: python3 -I static-admission.py <output-json>
"""
import ast
import hashlib
import importlib.util
import json
import os
import re
import struct
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent


def load(name, mod):
    spec = importlib.util.spec_from_file_location(mod, HERE / name)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


SUP = load('supervisor.py', 'cvg_supervisor_static')
STDLIB = Path('/usr/lib/python3.12')
DYNLOAD = STDLIB / 'lib-dynload'
SUFFIX = '.cpython-312-x86_64-linux-gnu.so'
checks = []


def check(cid, fn):
    try:
        detail = fn()
        checks.append({'id': cid, 'status': 'PASS', 'detail': detail})
    except Exception as exc:  # noqa: BLE001
        checks.append({'id': cid, 'status': 'FAIL', 'error': ('%s: %s' % (type(exc).__name__, exc))[:600]})


def sha(b):
    return hashlib.sha256(b).hexdigest()


def sdk_tree():
    manifest = json.loads((SUP.UNIT / 'staging' / 'sdk-python-manifest.json').read_text())['files']
    got = SUP.tree_manifest(SUP.SDK_PY_TREE)
    assert {k: {'bytes': v['bytes'], 'sha256': v['sha256']} for k, v in manifest.items()} == got and len(got) == 22
    for rel, v in manifest.items():
        data = (SUP.SDK_PY_TREE / rel).read_bytes()
        assert hashlib.sha1(b'blob %d\0' % len(data) + data).hexdigest() == v['git_blob'], rel
    return {'files': len(got), 'git_blobs_rechecked': True, 'py.typed_bytes': got['openai_codex/py.typed']['bytes']}


def deps_tree():
    validation = json.loads((SUP.ARTIFACTS / 'validation.json').read_text())
    want = {f['path']: {'bytes': f['bytes'], 'sha256': f['sha256']} for f in validation['merged_python']['files']}
    assert SUP.tree_manifest(SUP.PY_DEPS_TREE) == want and len(want) == 169
    ts = [r for r in validation['rows'] if r['name'] == 'typescript'][0]
    assert SUP.tree_manifest(SUP.TS_TREE) == {f['path']: {'bytes': f['bytes'], 'sha256': f['sha256']} for f in ts['files']}
    return {'python_deps_files': 169, 'typescript_files': len(ts['files'])}


# ------------------------------------------------------------------------------------------- import closure

def resolve(name):
    """Return ('sdk'|'deps'|'stdlib'|'builtin', path) for a top-level or dotted module name, or None."""
    parts = name.split('.')
    for base, label in ((SUP.SDK_PY_TREE, 'sdk'), (SUP.PY_DEPS_TREE, 'deps'), (STDLIB, 'stdlib')):
        p = base.joinpath(*parts)
        for cand in (p / '__init__.py', p.with_suffix('.py'), Path(str(p) + SUFFIX)):
            if cand.is_file():
                return label, cand
        if p.is_dir() and label == 'stdlib':
            return label, p
    if len(parts) == 1:
        if name in sys.builtin_module_names:
            return 'builtin', None
        so = DYNLOAD / (name + SUFFIX)
        if so.is_file():
            return 'stdlib', so
    return None


def static_condition(test):
    """Evaluate `sys.version_info <op> (ints)` and `sys.platform ==/!= 'str'` for the pinned host (3.12.3, linux); else None."""
    import operator
    ops = {ast.Lt: operator.lt, ast.LtE: operator.le, ast.Gt: operator.gt, ast.GtE: operator.ge, ast.Eq: operator.eq, ast.NotEq: operator.ne}
    if isinstance(test, ast.UnaryOp) and isinstance(test.op, ast.Not):
        v = static_condition(test.operand)
        return None if v is None else not v
    if not (isinstance(test, ast.Compare) and len(test.ops) == 1 and type(test.ops[0]) in ops):
        return None
    left, right = test.left, test.comparators[0]
    if isinstance(left, ast.Attribute) and isinstance(left.value, ast.Name) and left.value.id == 'sys':
        if left.attr == 'version_info' and isinstance(right, ast.Tuple) and all(isinstance(e, ast.Constant) and type(e.value) is int for e in right.elts):
            return ops[type(test.ops[0])]((3, 12, 3, 'final', 0)[:len(right.elts)], tuple(e.value for e in right.elts))
        if left.attr == 'platform' and isinstance(right, ast.Constant) and isinstance(right.value, str) and type(test.ops[0]) in (ast.Eq, ast.NotEq):
            return ops[type(test.ops[0])]('linux', right.value)
    return None


def module_imports(path, package):
    """Module-level imports with a 'guarded' flag (try/except ImportError, TYPE_CHECKING or function scope excluded)."""
    tree = ast.parse(path.read_text(encoding='utf-8'))
    out = []

    def visit(nodes, guarded):
        for n in nodes:
            if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                if isinstance(n, ast.ClassDef):
                    visit(n.body, guarded)
                continue
            if isinstance(n, ast.If) and 'TYPE_CHECKING' in ast.dump(n.test):
                continue
            if isinstance(n, ast.Try):
                handles = any(h.type is None or 'ImportError' in ast.dump(h.type) or 'ModuleNotFoundError' in ast.dump(h.type) for h in n.handlers)
                visit(n.body, guarded or handles)
                for h in n.handlers:
                    visit(h.body, guarded)
                visit(n.orelse + n.finalbody, guarded)
                continue
            if isinstance(n, ast.If):
                v = static_condition(n.test)
                if v is None:
                    visit(n.body + n.orelse, guarded)
                else:
                    visit(n.body if v else n.orelse, guarded)
                continue
            if isinstance(n, ast.Import):
                for a in n.names:
                    out.append((a.name, guarded))
            elif isinstance(n, ast.ImportFrom):
                if n.level:
                    base = package.split('.')
                    base = base[:len(base) - (n.level - 1)] if n.level > 1 else base
                    mod = '.'.join(base + ([n.module] if n.module else []))
                    if n.module is None:
                        for a in n.names:
                            out.append((mod + '.' + a.name, guarded, mod))
                        continue
                else:
                    mod = n.module
                out.append((mod, guarded))
    visit(tree.body, False)
    return out


def import_closure():
    root = SUP.SDK_PY_TREE
    todo = ['openai_codex']
    seen, third_party, stdlib, guarded_unresolved, unresolved = set(), set(), set(), [], []
    while todo:
        name = todo.pop()
        if name in seen:
            continue
        seen.add(name)
        r = resolve(name)
        assert r and r[0] == 'sdk', 'SDK module not found: ' + name
        path = r[1]
        package = name if path.name == '__init__.py' else name.rsplit('.', 1)[0]
        for item in module_imports(path, package):
            mod, guarded = item[0], item[1]
            alt = item[2] if len(item) > 2 else None
            top = mod.split('.')[0]
            if top == 'openai_codex':
                target = mod if resolve(mod) else alt
                if target and resolve(target) and resolve(target)[0] == 'sdk':
                    todo.append(target)
                    # parents of a dotted submodule are imported first
                    parts = target.split('.')
                    for i in range(1, len(parts)):
                        todo.append('.'.join(parts[:i]))
                    continue
                (guarded_unresolved if guarded else unresolved).append('%s <- %s' % (mod, name))
                continue
            r2 = resolve(mod) or resolve(top)
            if r2 is None:
                (guarded_unresolved if guarded else unresolved).append('%s <- %s' % (mod, name))
            elif r2[0] == 'deps':
                third_party.add(top)
            else:
                stdlib.add(top)
    assert not unresolved, 'unguarded unresolved imports: %s' % unresolved
    assert third_party <= {'pydantic', 'pydantic_core', 'typing_extensions', 'annotated_types', 'typing_inspection', 'packaging'}, third_party
    return {'sdk_modules_reached': sorted(seen), 'third_party_top_level': sorted(third_party), 'stdlib_top_level': sorted(stdlib),
            'guarded_or_lazy_unresolved': guarded_unresolved,
            'scope': 'Module-level unguarded imports of the openai_codex closure; third-party internals (pydantic lazy __getattr__) are checked by top-level presence and the authenticated RECORD/closure only.'}


def deps_top_level():
    want = {'pydantic', 'pydantic_core', 'typing_extensions', 'annotated_types', 'typing_inspection', 'packaging'}
    present = {p.name for p in SUP.PY_DEPS_TREE.iterdir() if p.is_dir() and not p.name.endswith('.dist-info')}
    present |= {p.stem for p in SUP.PY_DEPS_TREE.iterdir() if p.is_file() and p.suffix == '.py'}
    assert want <= present, (want, present)
    # top-level unguarded imports of each dependency package __init__ resolve inside deps/stdlib
    unresolved = []
    for top in sorted(want):
        init = SUP.PY_DEPS_TREE / top / '__init__.py'
        path = init if init.is_file() else SUP.PY_DEPS_TREE / (top + '.py')
        for item in module_imports(path, top):
            mod, guarded = item[0], item[1]
            if not guarded and not mod.startswith(top) and resolve(mod) is None and resolve(mod.split('.')[0]) is None:
                unresolved.append('%s <- %s' % (mod, top))
    assert not unresolved, unresolved
    return {'packages': sorted(want), 'init_level_unguarded_imports_resolved': True}


# ------------------------------------------------------------------------------------------- ELF boundary

def elf_needed(b):
    assert b[:4] == b'\x7fELF' and b[4] == 2 and b[5] == 1, 'ELF64 LSB'
    e_machine = struct.unpack_from('<H', b, 18)[0]
    assert e_machine == 62, 'x86-64'
    shoff, = struct.unpack_from('<Q', b, 0x28)
    shentsize, shnum = struct.unpack_from('<HH', b, 0x3A)
    secs = [struct.unpack_from('<IIQQQQIIQQ', b, shoff + i * shentsize) for i in range(shnum)]
    dyn = [s for s in secs if s[1] == 6]  # SHT_DYNAMIC
    assert len(dyn) == 1
    _, _, _, _, off, size, link, _, _, entsize = dyn[0]
    strsec = secs[link]
    stroff = strsec[4]
    needed = []
    for i in range(size // entsize):
        tag, val = struct.unpack_from('<qQ', b, off + i * entsize)
        if tag == 0:
            break
        if tag == 1:  # DT_NEEDED
            end = b.index(b'\0', stroff + val)
            needed.append(b[stroff + val:end].decode())
    return needed


def native_boundary():
    sos = [p for p in SUP.PY_DEPS_TREE.rglob('*.so')]
    assert len(sos) == 1, sos
    b = sos[0].read_bytes()
    needed = elf_needed(b)
    roots = [Path('/usr/lib/x86_64-linux-gnu')]
    found = {n: next((str(r / n) for r in roots if (r / n).is_file()), None) for n in needed}
    assert all(found.values()), found
    return {'extension': str(sos[0].relative_to(SUP.PY_DEPS_TREE)), 'sha256': sha(b), 'DT_NEEDED': found,
            'mounted_ro_root': '/usr/lib/x86_64-linux-gnu', 'loader': '/usr/lib64/ld-linux-x86-64.so.2 (ro-bind)'}


# ------------------------------------------------------------------------------------- fixtures vs source

def fixture_source():
    client = (SUP.SDK_PY_TREE / 'openai_codex' / 'client.py').read_text()
    tree = ast.parse(client)
    pattern = None
    for n in ast.walk(tree):
        if isinstance(n, ast.FunctionDef) and n.name == '_active_turn_id_from_error':
            for c in ast.walk(n):
                if isinstance(c, ast.Call) and getattr(c.func, 'attr', None) == 'search' and isinstance(c.args[0], ast.Constant):
                    pattern = c.args[0].value
    assert pattern == r' but found `?([^`]+)`?$', pattern
    rows = json.loads(SUP.fixture_bytes())
    got = {}
    for case, want in (('SDKPY08', 'B'), ('SDKPY09', 'A')):
        m = re.search(pattern, rows[case]['interrupt_A_reply']['error']['message'])
        assert m and m.group(1) == want
        got[case] = m.group(1)
    rt = (SUP.SDK_PY_TREE / 'openai_codex' / '_runtime_requirements.py').read_text()
    assert 'MINIMUM_RUNTIME_VERSION = "0.151.0"' in rt
    guard = re.search(r'runtime_fields = \{\s*"turn/start": \(([^)]*)\)', client)
    assert guard and '"toolOutput"' in guard.group(1)
    assert 'Cannot verify an unversioned CLI with a custom launch command' in client
    handler = re.search(r'def _default_approval_handler.*?return \{\}', client, re.S).group(0)
    assert handler.count('{"decision": "accept"}') == 2
    version_src = (SUP.SDK_PY_TREE / 'openai_codex' / '_version.py').read_text()
    assert 'parents[2] / "pyproject.toml"' in version_src and 'UNKNOWN_VERSION = "0+unknown"' in version_src
    return {'regex_from_AST': pattern, 'extracted': got, 'minimum_runtime_version': '0.151.0', 'guarded_fields_turn_start': guard.group(1),
            'default_handler_accepts': 2, 'expected_client_version_in_profile': '0+unknown (no /profile/pyproject.toml and no openai-codex dist-info; observed, not asserted)'}


def ts_inputs():
    tmpl = json.loads((SUP.UNIT / 'profile-templates' / 'node-transpile.json').read_text())
    assert tmpl['sources'] == SUP.ts_source_hashes()
    assert SUP.sha_path(SUP.TS_TREE / SUP.TYPESCRIPT_JS[0]) == SUP.TYPESCRIPT_JS[1] and (SUP.TS_TREE / SUP.TYPESCRIPT_JS[0]).stat().st_size == SUP.TYPESCRIPT_JS[2]
    pkg = json.loads((SUP.TS_TREE / 'package.json').read_text())
    assert pkg['name'] == 'typescript' and pkg['version'] == '5.9.2' and not pkg.get('dependencies')
    return {'sources': len(tmpl['sources']), 'typescript_js_sha256': SUP.TYPESCRIPT_JS[1], 'version': pkg['version']}


check('SDK_PYTHON_TREE_EQUALS_PIN', sdk_tree)
check('DATA_TREES_EQUAL_AUTHENTICATED', deps_tree)
check('IMPORT_CLOSURE_RESOLVES', import_closure)
check('DEPENDENCY_TOP_LEVEL_PRESENT', deps_top_level)
check('NATIVE_BOUNDARY_ELF_AND_NEEDED', native_boundary)
check('FIXTURE_SOURCE_CHECKS', fixture_source)
check('TYPESCRIPT_INPUTS', ts_inputs)
out = {'kind': 'STATIC_ADMISSION_AST_ELF_HASH_ONLY', 'status': 'PASS' if all(c['status'] == 'PASS' for c in checks) else 'FAIL',
       'checks': checks, 'helper_sha256': sha(Path(__file__).read_bytes()), 'SDK_imports': 0, 'Pydantic_imports': 0, 'compiler_executions': 0,
       'observed_at': datetime.now(timezone.utc).isoformat()}
Path(sys.argv[1]).write_text(json.dumps(out, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'status': out['status'], 'failed': [c for c in checks if c['status'] != 'PASS']}, ensure_ascii=False)[:3000])
sys.exit(0 if out['status'] == 'PASS' else 1)
