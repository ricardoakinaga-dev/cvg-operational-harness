"""(adapted from HISO005-P2-BUILD-0245) Final records: empty-artifact delta, rule-name/40-hex co-occurrence check
(including the word sourcegraph) and the evidence manifest with sha256. usage: finalize.py"""
import json, re, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

RULE = re.compile(r'sourcegraph|gitleaks:allow|generic-api-key|aws-access-token', re.I)
HEX40 = re.compile(r'\b[0-9a-f]{40}\b')
cooc, empty, files, badjson = [], [], [], []
for f in sorted(EV.rglob('*')):
    if not f.is_file() or '__pycache__' in f.parts:
        continue
    rel = str(f.relative_to(EV))
    if f.stat().st_size == 0:
        empty.append(rel)
    if f.suffix in ('.json', '.md', '.txt', '.py', '.log') and rel != 'evidence-manifest-final.json':
        t = f.read_text(errors='replace')
        if RULE.search(t) and HEX40.search(t):
            cooc.append(rel)
        if f.suffix == '.json':
            try: json.loads(t)
            except Exception: badjson.append(rel)
    if rel != 'evidence-manifest-final.json':
        files.append({'path': rel, 'bytes': f.stat().st_size, 'sha256': sha(f)})
save('empty-artifact-delta.json', {'task': TASK, 'observedAt': now(), 'targetCatalog': 'docs/04_audit/evidence/empty-artifact-status.json',
                                   'note': 'Proposta aditiva (catálogo central não editado). Conferido no disco.', 'checkedExisting': True, 'entries': empty})
save('evidence-manifest-final.json', {'task': TASK, 'observedAt': now(), 'candidateHead': head(), 'files': files, 'count': len(files),
                                      'ruleNameWith40HexFiles': cooc, 'emptyFiles': empty, 'unparseableJson': badjson,
                                      'notEdited': ['docs/99_runtime_state.md', 'docs/20_master_execution_log.md', 'docs/30_backlog_master.md',
                                                    'docs/08_runtime/agent_coordination.md', 'docs/04_audit/evidence/empty-artifact-status.json', 'docs/02_spec']})
print(len(files), 'files; rule+40hex:', cooc, 'empty:', empty, 'bad json:', badjson)
assert not cooc and not empty and not badjson
