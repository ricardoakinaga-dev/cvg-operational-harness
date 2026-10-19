"""Contract freeze for a review round: SHA of every package input and of the read-only sources the critic may
consult. usage: freeze.py <R1|R2> <spec0242-file> <spec0243-file>"""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

rnd, s42, s43 = sys.argv[1], sys.argv[2], sys.argv[3]
inputs = []
for f in sorted(EV.rglob('*')):
    rel = str(f.relative_to(EV))
    if f.is_file() and not rel.startswith(('review-', 'contract-freeze-')) and rel != 'state.json':
        inputs.append({'path': rel, 'bytes': f.stat().st_size, 'sha256': sha(f)})
sources = []
for rel in ['scripts/boundary-semantic-engine.mjs', 'scripts/check-product-boundary.mjs', 'scripts/boundary-installed-identity.mjs',
            'scripts/build-installed-reference.mjs', 'scripts/boundary-semantic-compiled.mjs', 'scripts/boundary-manifests.mjs']:
    f = CANDIDATE / rel
    sources.append({'path': str(f), 'sha256': sha(f)})
runtime = []
for rel in ['probe-P4-phase-normal/report.json.gz', 'probe-P4-phase-strict/report.json.gz', 'tools-diag/scripts/boundary-semantic-engine.mjs', 'tools-probe/scripts/check-product-boundary.mjs', 'tools-probe/scripts/boundary-installed-identity.mjs',
            'tools-q2/scripts/build-installed-reference.mjs', 'tools-q2/scripts/boundary-semantic-compiled.mjs',
            'pipeline-caps-256-250k/normal-report.json.gz', 'pipeline-caps-256-250k/strict-report.json.gz',
            'probe-P1-official/report.json.gz', 'probe-P2-caps256-250k/report.json.gz', 'probe-P3-caps256-250k-240s-cmp300s/report.json.gz',
            'pipeline-q2-excl/normal-report.json.gz', 'installed-reference-ref/reference.json', 'installed-reference-excl/reference.json',
            'compiled-reference-ref/reference.json', 'compiled-reference-excl/reference.json', 'engine-input.json']:
    f = RUNTIME / rel
    runtime.append({'path': str(f), 'sha256': sha(f)})
rec = {'task': TASK, 'round': rnd, 'observedAt': now(),
       'specs': {'SPEC0242-draft': {'path': s42, 'sha256': sha(EV / s42)}, 'SPEC0243-draft': {'path': s43, 'sha256': sha(EV / s43)}},
       'inputs': inputs, 'readOnlySources': {'candidate': str(CANDIDATE), 'candidateHead': head(CANDIDATE), 'files': sources},
       'runtimeArtifacts': runtime, 'reviewBudget': {'max': 2, 'used': 0 if rnd == 'R1' else 1},
       'reviewerOutput': 'docs/04_audit/evidence/' + TASK + '/review-' + rnd.lower()}
save('contract-freeze-' + rnd.lower() + '.json', rec)
print(json.dumps({k: rec[k] for k in ('round', 'specs', 'reviewerOutput')}, indent=1), len(inputs), 'inputs')
