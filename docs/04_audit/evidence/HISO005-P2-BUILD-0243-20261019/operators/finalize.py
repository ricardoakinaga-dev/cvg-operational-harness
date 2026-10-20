"""Final records for both tasks: acceptance status, state, empty-artifact delta, rule-name/40-hex check and the
final evidence manifest. usage: finalize.py <phase: acceptance|manifest>"""
import json, re, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

phase = sys.argv[1]
RULE = re.compile(r'sourcegraph|gitleaks:allow|generic-api-key|aws-access-token', re.I)
HEX40 = re.compile(r'\b[0-9a-f]{40}\b')
if phase == 'manifest':
    for task in ('0243', '0242'):
        ev = EVS[task]
        cooc, empty, files = [], [], []
        for f in sorted(ev.rglob('*')):
            if not f.is_file():
                continue
            rel = str(f.relative_to(ev))
            if f.stat().st_size == 0:
                empty.append(rel)
            if f.suffix in ('.json', '.md', '.txt', '.py', '.log') and rel != 'evidence-manifest-final.json':
                t = f.read_text(errors='replace')
                if RULE.search(t) and HEX40.search(t):
                    cooc.append(rel)
            if rel != 'evidence-manifest-final.json':
                files.append({'path': rel, 'bytes': f.stat().st_size, 'sha256': sha(f)})
        save(task, 'empty-artifact-delta.json', {'task': TASKS[task], 'observedAt': now(), 'targetCatalog': 'docs/04_audit/evidence/empty-artifact-status.json',
                                                 'note': 'Proposta aditiva (catálogo central não editado). Conferido no disco.', 'checkedExisting': True, 'entries': empty})
        save(task, 'evidence-manifest-final.json', {'task': TASKS[task], 'observedAt': now(), 'candidateHead': head(), 'files': files,
                                                    'count': len(files), 'ruleNameWith40HexFiles': cooc, 'emptyFiles': empty})
        print(task, len(files), 'files; rule+40hex:', cooc, 'empty:', empty)
