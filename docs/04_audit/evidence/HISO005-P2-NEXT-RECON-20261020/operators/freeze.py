"""Contract freeze for a review round. usage: freeze.py <R1|R2> <spec-file>"""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

rnd, spec = sys.argv[1], sys.argv[2]
inputs = [{'path': str(f.relative_to(EV)), 'bytes': f.stat().st_size, 'sha256': sha(f)} for f in sorted(EV.rglob('*'))
          if f.is_file() and not str(f.relative_to(EV)).startswith(('review-', 'contract-freeze-')) and f.name != 'state.json']
runtime = [{'path': str(f), 'sha256': sha(f)} for f in [RUNTIME / 'tools/scripts/boundary-semantic-engine.mjs', RUNTIME / 'tools-diag/scripts/boundary-semantic-engine.mjs',
           RUNTIME / 'tools-v1/scripts/boundary-semantic-engine.mjs', RUNTIME / 'tools-v2/scripts/boundary-semantic-engine.mjs',
           RUNTIME / 'tools-v3/scripts/boundary-semantic-engine.mjs', RUNTIME / 'variant-v1-report.json.gz', RUNTIME / 'variant-v2-report.json.gz',
           RUNTIME / 'variant-v3-report.json.gz', RUNTIME / 'diag-normal-report.json.gz']]
rec = {'task': TASK, 'round': rnd, 'observedAt': now(), 'spec': {'path': spec, 'sha256': sha(EV / spec)}, 'inputs': inputs, 'runtimeArtifacts': runtime,
       'sealedInputs': {'officialNormal': str(REPORTS['normal'].relative_to(PROJECT)), 'officialNormalSha256': sha(REPORTS['normal']),
                        'officialStrict': str(REPORTS['strict'].relative_to(PROJECT)), 'officialStrictSha256': sha(REPORTS['strict'])},
       'reviewBudget': {'max': 2, 'used': 0 if rnd == 'R1' else 1}, 'reviewerOutput': 'review-' + rnd.lower()}
save('contract-freeze-' + rnd.lower() + '.json', rec)
print(json.dumps(rec['spec']), len(inputs), 'inputs')
