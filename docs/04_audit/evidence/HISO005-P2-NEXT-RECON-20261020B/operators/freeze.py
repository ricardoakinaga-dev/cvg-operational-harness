"""Contract freeze for a review round of both SPEC drafts. usage: freeze.py <R1|R2> <spec0245-file> <spec0246-file>"""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

rnd, s45, s46 = sys.argv[1:4]
inputs = [{'path': str(f.relative_to(EV)), 'bytes': f.stat().st_size, 'sha256': sha(f)} for f in sorted(EV.rglob('*'))
          if f.is_file() and not str(f.relative_to(EV)).startswith(('review-', 'contract-freeze-')) and f.name != 'state.json']
runtime = [{'path': str(f.relative_to(RUNTIME)), 'sha256': sha(f)} for f in sorted(RUNTIME.glob('tools-*/scripts/boundary-semantic-*.mjs'))]
rec = {'task': TASK, 'round': rnd, 'observedAt': now(), 'specs': {'SPEC0245': {'path': s45, 'sha256': sha(EV / s45)}, 'SPEC0246': {'path': s46, 'sha256': sha(EV / s46)}},
       'inputs': inputs, 'runtimeArtifacts': runtime, 'runtime': str(RUNTIME), 'reviewBudget': {'max': 2, 'used': 0 if rnd == 'R1' else 1}}
save('contract-freeze-' + rnd.lower() + '.json', rec)
print(json.dumps(rec['specs']), len(inputs), 'inputs', len(runtime), 'runtime')
