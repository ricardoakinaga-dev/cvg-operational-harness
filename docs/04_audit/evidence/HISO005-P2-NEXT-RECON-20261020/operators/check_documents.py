"""SPEC draft checks (links resolve from docs/02_spec, no absolute paths, numbers cited exist), rule-name/40-hex
co-occurrence and empty files in this package. usage: check_documents.py <out-name> <spec-file>..."""
import json, re, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

out, specs = sys.argv[1], sys.argv[2:]
SPECDIR = PROJECT / 'docs/02_spec'
docs = []
for name in specs:
    t = (EV / name).read_text()
    links = re.findall(r'\]\(([^)#\s]+)(?:#[^)]*)?\)', t)
    broken = [l for l in links if not l.startswith('http') and not (SPECDIR / l).resolve().exists()]
    docs.append({'file': name, 'sha256': sha(EV / name), 'bytes': (EV / name).stat().st_size, 'links': len(links), 'brokenFromSpecDir': broken,
                 'absolutePaths': bool(re.search(r'/home/|/mnt/', t)), 'status': 'PASS' if not broken and not re.search(r'/home/|/mnt/', t) else 'FAIL',
                 'targetFree': not list(SPECDIR.glob('0244_*'))})
RULE = re.compile(r'sourcegraph|gitleaks:allow|generic-api-key|aws-access-token', re.I)
HEX40 = re.compile(r'\b[0-9a-f]{40}\b')
cooc = [str(f.relative_to(EV)) for f in sorted(EV.rglob('*')) if f.is_file() and f.suffix in ('.json', '.md', '.txt', '.py')
        and RULE.search(f.read_text(errors='replace')) and HEX40.search(f.read_text(errors='replace'))]
empty = [str(f.relative_to(EV)) for f in sorted(EV.rglob('*')) if f.is_file() and f.stat().st_size == 0]
rec = {'task': TASK, 'observedAt': now(), 'documents': docs, 'ruleNameWith40HexFiles': cooc, 'emptyFiles': empty,
       'status': 'PASS' if all(d['status'] == 'PASS' for d in docs) and not cooc else 'FAIL'}
save(out, rec)
print(json.dumps(rec, indent=1, ensure_ascii=False))
