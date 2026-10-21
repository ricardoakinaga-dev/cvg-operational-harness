"""Confere que as cópias de despejo (diag_patch + contexts_patch) reproduzem os diagnósticos da cópia sem patch.
uso: python3 dump_copies_check.py  (escreve dump-copies-check.json com v5diag/v6r1diag/v5bdiag/v6r2diag)"""
import gzip, json
from collections import Counter
from common import EV, TASK, now, save

PAIRS = {'v5diag': 'v5', 'v6r1diag': 'v6r1', 'v5bdiag': 'v5b', 'v6r2diag': 'v6r2'}
rep = lambda label: json.loads(gzip.decompress((EV / f'real-{label}-normal-report.json.gz').read_bytes()))
diags = lambda r: Counter(json.dumps(d, sort_keys=True) for d in r['diagnostics'])
checks = {}
for diag, base in PAIRS.items():
    a, b = rep(diag), rep(base)
    s = json.loads((EV / f'real-{diag}-summary.json').read_text())
    checks[diag] = {'diagnosticsEqualTo': base, 'equal': diags(a) == diags(b), 'count': [len(a['diagnostics']), len(b['diagnostics'])],
                    'references': s.get('references'), 'engine': s['engineSha256'],
                    'patches': ['operators/diag_patch.py', 'operators/contexts_patch.py']}
out = {'task': TASK, 'observedAt': now(), 'status': 'PASS' if all(c['equal'] for c in checks.values()) else 'FAIL', 'checks': checks}
save('dump-copies-check.json', out)
print(json.dumps({k: (v['equal'], v['count']) for k, v in checks.items()}), out['status'])
