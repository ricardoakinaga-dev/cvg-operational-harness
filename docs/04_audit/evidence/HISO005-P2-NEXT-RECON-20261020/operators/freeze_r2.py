"""Contract freeze for review round R2 (separate diagnostic copies per R1-O5). usage: freeze_r2.py <spec-file>"""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

spec = sys.argv[1]
inputs = [{'path': str(f.relative_to(EV)), 'bytes': f.stat().st_size, 'sha256': sha(f)} for f in sorted(EV.rglob('*'))
          if f.is_file() and not str(f.relative_to(EV)).startswith(('review-', 'contract-freeze-')) and f.name != 'state.json']
names = ['tools/scripts/boundary-semantic-engine.mjs', 'tools-diag/scripts/boundary-semantic-engine.mjs', 'tools-tags2/scripts/boundary-semantic-engine.mjs',
         'tools-tags3/scripts/boundary-semantic-engine.mjs', 'tools-v1/scripts/boundary-semantic-engine.mjs', 'tools-v2/scripts/boundary-semantic-engine.mjs',
         'tools-v3/scripts/boundary-semantic-engine.mjs', 'tools-v5a/scripts/boundary-semantic-engine.mjs', 'variant-v1-report.json.gz',
         'variant-v2-report.json.gz', 'variant-v3-report.json.gz', 'variant-v5a-report.json.gz', 'graph-v5a.json', 'diag-normal-report.json.gz']
runtime = [{'path': str(RUNTIME / n), 'sha256': sha(RUNTIME / n)} for n in names]
rec = {'task': TASK, 'round': 'R2', 'observedAt': now(), 'spec': {'path': spec, 'sha256': sha(EV / spec)},
       'previous': {'spec': 'spec0244-r1.md', 'sha256': sha(EV / 'spec0244-r1.md'), 'diff': 'spec0244-r1-to-r2.diff', 'corrections': 'r1-corrections.json'},
       'inputs': inputs, 'runtimeArtifacts': runtime,
       'diagnosticCopies': {'tools-diag': 'diag_patch + cause_patch (aplicados no mesmo diretório no r1)', 'tools-tags2': 'diag_patch + cause_patch + binding_origin_patch',
                            'tools-tags3': 'tools-tags2 + k0_origin_patch', 'tools-v5a': 'tools-tags2 + variant_esm_patch (variante, nunca oficial)'},
       'sealedInputs': {'officialNormal': str(REPORTS['normal'].relative_to(PROJECT)), 'officialNormalSha256': sha(REPORTS['normal']),
                        'officialStrict': str(REPORTS['strict'].relative_to(PROJECT)), 'officialStrictSha256': sha(REPORTS['strict'])},
       'reviewBudget': {'max': 2, 'used': 1, 'thisRoundIsLast': True}, 'reviewerOutput': 'review-r2'}
save('contract-freeze-r2.json', rec)
print(json.dumps(rec['spec']), len(inputs), 'inputs', len(runtime), 'runtime')
