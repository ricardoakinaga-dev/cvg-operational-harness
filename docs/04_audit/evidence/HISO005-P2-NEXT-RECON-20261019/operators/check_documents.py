"""T1 document checks for the SPEC drafts and the package: relative links resolve, no absolute home paths in
markdown, rule-name/40-hex co-occurrence absent, empty files listed. usage: check_documents.py <out-name>"""
import json, re, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

out = sys.argv[1]
docs = sorted(EV.glob('spec*.source.md'))
checks = []
for d in docs:
    text = d.read_text()
    links = re.findall(r'\]\(([^)#\s]+)(?:#[^)]*)?\)', text)
    bad = [l for l in links if not l.startswith('http') and not (d.parent / l).resolve().exists()]
    checks.append({'file': d.name, 'sha256': sha(d), 'bytes': d.stat().st_size, 'links': len(links), 'brokenLinks': bad,
                   'absoluteHome': bool(re.search(r'/home/|/mnt/', text)), 'status': 'PASS' if not bad and not re.search(r'/home/|/mnt/', text) else 'FAIL'})
RULE = re.compile(r'sourcegraph|gitleaks:allow|generic-api-key|aws-access-token', re.I)
HEX40 = re.compile(r'\b[0-9a-f]{40}\b')
cooc = []
for f in sorted(EV.rglob('*')):
    if f.is_file() and f.suffix in ('.json', '.md', '.txt', '.py', '.mjs'):
        t = f.read_text(errors='replace')
        if RULE.search(t) and HEX40.search(t):
            cooc.append(str(f.relative_to(EV)))
empty = [str(f.relative_to(EV)) for f in sorted(EV.rglob('*')) if f.is_file() and f.stat().st_size == 0]
rec = {'task': TASK, 'observedAt': now(), 'documents': checks, 'ruleNameWith40HexFiles': cooc, 'emptyFiles': empty,
       'status': 'PASS' if all(c['status'] == 'PASS' for c in checks) and not cooc else 'FAIL'}
save(out, rec)
print(json.dumps(rec, indent=1, ensure_ascii=False))
