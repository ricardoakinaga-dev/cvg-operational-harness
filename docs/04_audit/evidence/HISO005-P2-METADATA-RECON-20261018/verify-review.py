"""Verify returned documentary artifacts against the critic's returned manifest digest."""
from pathlib import Path
import datetime
import hashlib
import json
import sys

EV = Path(__file__).resolve().parent
round_number, expected_manifest = int(sys.argv[1]), sys.argv[2]
review = EV / f'review-r{round_number}'
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
manifest_file = review / 'artifact-manifest.json'
assert sha(manifest_file) == expected_manifest
manifest = json.loads(manifest_file.read_text())
for x in manifest['artifacts']:
    f = review / x['path']
    assert f.is_file() and f.stat().st_size == x['bytes'] and sha(f) == x['sha256'], str(f)
inputs = json.loads((review / 'inputs-manifest.json').read_text())
for x in inputs['inputs']:
    f = review / x['snapshot']
    assert f.stat().st_size == x['bytes'] and sha(f) == x['sha256'], str(f)
verdict = json.loads((review / 'verdict.json').read_text())
freeze = json.loads((EV / f'contract-freeze-r{round_number}.json').read_text())
assert verdict['evaluatedSpecSha256'] == freeze['spec']['sha256'] == manifest['evaluatedSpecSha256']
assert len(verdict['scenarios']) <= 12
required = [x for x in verdict['findings'] if x.get('required')]
if verdict['verdict'] == 'APPROVE_SPEC':
    assert not required
assert all(x == 'NOT_RUN' for x in verdict['futureAcceptance'].values())
assert verdict['b6Accepted'] is False and verdict['buildAuthorized'] is False
out = {'status': 'PASS', 'observedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
       'review': f'R{round_number}', 'verdict': verdict['verdict'], 'requiredFindings': len(required),
       'scenarios': len(verdict['scenarios']), 'manifestSha256': expected_manifest,
       'artifactCount': len(manifest['artifacts']), 'snapshots': len(inputs['inputs']),
       'reportSha256': sha(review / 'REPORT.md'), 'verdictSha256': sha(review / 'verdict.json'),
       'evaluatedSpecSha256': verdict['evaluatedSpecSha256'], 'noRuntimeAcceptanceGranted': True}
(EV / f'lead-review-r{round_number}-verification-final.json').write_text(json.dumps(out, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(out, ensure_ascii=False))
