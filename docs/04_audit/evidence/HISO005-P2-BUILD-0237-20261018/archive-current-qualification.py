"""Preserve only manifest-bound artifacts of the completed current run."""
from pathlib import Path
import datetime, gzip, hashlib, json, subprocess

ev = Path(__file__).resolve().parent
candidate = Path('/mnt/ia/cvg-hiso005-build0237-20261018')
state = json.loads((ev/'state.json').read_text())
receipt = json.loads((ev/'certify-r2-receipt.json').read_text())
verify = json.loads((ev/'certification-current-verification.json').read_text())
head = subprocess.check_output(['git','rev-parse','HEAD'],cwd=candidate,text=True).strip()
assert receipt['status'] == 'FINISHED' and receipt['exitCode'] == verify['exitCode'] == 0
assert receipt['head'] == verify['sourceCommit'] == head
assert verify['qualifiedCandidateIds'] == [state['certificationCandidateId']]
manifest = json.loads((candidate/'certification/manifest.json').read_text())
result = json.loads((candidate/'certification/phase10-result.json').read_text())
assert manifest['candidateId'] == result['candidate']['candidateId'] == state['certificationCandidateId']
assert manifest['runId'] == result['runId']
state['certificationRunId']=manifest['runId']
(ev/'state.json').write_text(json.dumps(state,indent=2)+'\n')
assert len(result['gates']) == 16 and all(x['status'] == 'PASS' and x['exitCode'] == 0 for x in result['gates'])
assert len(manifest['artifacts']) == 38
sha = lambda b:hashlib.sha256(b).hexdigest()
out = ev/'qualification-current'
out.mkdir()
rows = []
for artifact in manifest['artifacts']:
    path = candidate/artifact['path']
    assert path.resolve().is_relative_to(candidate) and path.is_file() and not path.is_symlink()
    data = path.read_bytes()
    assert len(data) == artifact['size'] and sha(data) == artifact['sha256']
    target = out/(artifact['path']+'.gz')
    target.parent.mkdir(parents=True,exist_ok=True)
    with gzip.open(target,'wb') as stream:
        stream.write(data)
    rows.append({**artifact,'preservedPath':str(target.relative_to(ev)),'archiveSha256':sha(target.read_bytes())})
for name in ['manifest.json','phase10-result.json']:
    (out/name).write_bytes((candidate/'certification'/name).read_bytes())
summary = {'sourceCommit':head,'candidateId':manifest['candidateId'],'runId':manifest['runId'],
           'observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'gates':result['gates'],
           'metrics':result['metrics'],'decision':result['decision'],'certification':result['certification'],
           'artifactHashesVerified':len(rows),'artifacts':rows,'officialCurrentVerifierExit':verify['exitCode'],
           'rootCertified':False,'b6Accepted':False,'productionApproved':False}
(ev/'current-qualification-summary.json').write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps({k:v for k,v in summary.items() if k not in ['gates','artifacts']}))
