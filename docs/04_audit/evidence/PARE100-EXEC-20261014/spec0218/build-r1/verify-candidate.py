"""Mechanical builder checks; not an independent review or acceptance."""
import ast
import hashlib
import json
from pathlib import Path
import sys

root = Path.cwd()
evidence = Path(__file__).resolve().parent
source = root / 'packages/sdk/python'
baseline = json.loads((evidence / 'baseline.json').read_text())
drift = []
for row in baseline['sources']:
    p = root / row['path']
    if hashlib.sha256(p.read_bytes()).hexdigest() != row['sha256']:
        drift.append(row['path'])
assert not drift, drift
library_imports = set()
for p in source.rglob('*.py'):
    tree = ast.parse(p.read_text(), filename=str(p))
    assert not any(line.rstrip() != line for line in p.read_text().splitlines()), p
    if p.parent.name == 'cvg_sdk':
        for n in ast.walk(tree):
            if isinstance(n, ast.Import):
                library_imports.update(a.name.split('.')[0] for a in n.names)
            if isinstance(n, ast.ImportFrom) and not n.level:
                library_imports.add(n.module.split('.')[0])
assert library_imports <= sys.stdlib_module_names, library_imports
assert not library_imports & {'subprocess', 'threading', 'socket', 'multiprocessing'}
assert not list(source.rglob('__pycache__'))
assert not list(source.rglob('package.json'))
assert not list(source.rglob('pyproject.toml'))
assert not list(evidence.rglob('node-home-*')), 'Unreconciled private child home'
report = json.loads((evidence / 'focused-final/all-result.json').read_text())
assert report['successful'] and report['tests'] == 47 and report['skipped'] == 0
node_records = list((evidence / 'focused-final').glob('node-*.json'))
for p in node_records:
    r = json.loads(p.read_text())
    assert r['exit_code'] is not None and r['streams_closed']
    assert r['home_removed_after_confirmed_exit']
    assert r['stderr_retained_bytes'] <= 4096
result = {'kind': 'BUILDER_MECHANICAL_CHECK_NOT_INDEPENDENT_REVIEW',
          'protected_inputs': len(baseline['sources']), 'drift': drift,
          'python_ast_files': len(list(source.rglob('*.py'))),
          'source_files': len(list(p for p in source.rglob('*') if p.is_file())),
          'library_direct_imports': sorted(library_imports),
          'final_focused_tests': report['tests'], 'skips': 0,
          'node_child_records_verified': len(node_records), 'orphan_homes': 0,
          'no_pycache_or_install_manifests': True,
          'spec_sha256': hashlib.sha256((root / 'docs/02_spec/0218_pare100_python_sdk_stdio.md').read_bytes()).hexdigest(),
          'limitations': ['Integrated public builds/gates and fresh BUILD review belong to Lead',
                          'Only CPython3.12.3 Linux selector exercised; no reference SDK parity claim']}
(evidence / 'mechanical-checks.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result, indent=2))
