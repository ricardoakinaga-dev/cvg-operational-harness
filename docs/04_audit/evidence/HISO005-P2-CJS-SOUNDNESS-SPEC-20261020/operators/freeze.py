"""Contract freeze for a review round of the SPEC0247 draft: the draft, every evidence input (except reviews, freezes
and state) and the private engine copies, by sha256. usage: freeze.py <R1|R2> <spec-file-in-evidence>"""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

rnd, spec = sys.argv[1:3]
inputs = [{'path': str(f.relative_to(EV)), 'bytes': f.stat().st_size, 'sha256': sha(f)} for f in sorted(EV.rglob('*'))
          if f.is_file() and not str(f.relative_to(EV)).startswith(('review-', 'contract-freeze-')) and f.name != 'state.json']
runtime = [{'path': str(f.relative_to(RUNTIME)), 'sha256': sha(f)} for f in sorted(RUNTIME.glob('tools-*/scripts/boundary-semantic-engine.mjs'))]
rec = {'task': TASK, 'round': rnd, 'observedAt': now(), 'spec': {'path': spec, 'sha256': sha(EV / spec)},
       'inputs': inputs, 'runtimeArtifacts': runtime, 'runtime': str(RUNTIME), 'reviewBudget': {'maxRounds': 2, 'repairs': 1, 'used': 0 if rnd == 'R1' else 1}}
save('contract-freeze-' + rnd.lower() + '.json', rec)
print(json.dumps(rec['spec']), len(inputs), 'inputs', len(runtime), 'runtime')
