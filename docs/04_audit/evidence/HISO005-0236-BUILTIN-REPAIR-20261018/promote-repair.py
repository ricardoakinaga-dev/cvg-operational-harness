"""Guarded two-path repair promotion; --check is read-only for source/index."""
from pathlib import Path
import datetime, hashlib, json, os, subprocess, sys, tempfile

ev = Path(__file__).resolve().parent
root = Path('/home/ricardo/Área de trabalho/cvg-operational-harness')
candidate = Path('/home/ricardo/cvg-candidates/hiso005-resolver-fix-20261018')
pre = json.loads((ev/'candidate-preflight.json').read_text())
freeze = json.loads((ev/'source-freeze.json').read_text())
sha = lambda b:hashlib.sha256(b).hexdigest()
head = subprocess.check_output(['git','rev-parse','HEAD'],cwd=candidate,text=True).strip()
assert head == freeze['commit']
assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip() == pre['rootHead']
assert {x['path'] for x in freeze['files']} == {'scripts/boundary-semantic-engine.mjs','tests/b6-0236-boundary-integration.test.js'}
rows = []
for row in freeze['files']:
    source = candidate/row['path']
    target = root/row['path']
    before = next(x['beforeRootSha256'] for x in pre['files'] if x['path'] == row['path'])
    assert not source.is_symlink() and not target.is_symlink() and target.parent.resolve() == target.parent
    assert sha(source.read_bytes()) == row['sha256'] and sha(target.read_bytes()) == before
    rows.append({'path':row['path'],'beforeSha256':before,'afterSha256':row['sha256']})
old = json.loads((root/'docs/04_audit/evidence/HISO005-P2-SPEC-20261018/build0236/promotion-receipt.json').read_text())
protected = {x['path']:x['sha256'] for x in old['protectedSources']}
for row in freeze['unchangedPrior15SourcePaths']:
    assert row['path'] not in {x['path'] for x in rows}
    if row['path'] in protected:
        assert protected[row['path']] == row['sha256']
    protected[row['path']] = row['sha256']
peerReanchors = json.loads((ev/'promotion-peer-preimages.json').read_text())['entries']
assert {x['path'] for x in peerReanchors} == {'tests/claude100/qualification/qualify.mjs','tests/claude100/qualification/strict-json.mjs','tests/claude100/qualification/strict-json.d.mts'}
for row in peerReanchors:
    assert protected[row['path']] == row['beforeSha256']
    assert sha((root/row['path']).read_bytes()) == row['currentSha256']
    protected[row['path']] = row['currentSha256']
for name, digest in protected.items():
    assert not (root/name).is_symlink() and sha((root/name).read_bytes()) == digest
result = {'task':'HISO005-0236-BUILTIN-REPAIR-20261018','observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
          'sourceCommit':head,'rootHead':pre['rootHead'],'status':'PREFLIGHT_PASS_NO_SOURCE_WRITES',
          'files':rows,'protectedSources':[{'path':n,'sha256':d} for n,d in sorted(protected.items())],
          'rootCertified':False,'b6Accepted':False,'protectedPeerPreimagesReanchored':peerReanchors,'prior75ProtectedHashesPreserved':True}
if sys.argv[1:] == ['--apply']:
    review = json.loads((ev/'review-r1/review.json').read_text())
    receipt = json.loads((ev/'certify-r1-receipt.json').read_text())
    verify = json.loads((ev/'certification-current-verification.json').read_text())
    assert review['sourceCommit'] == head and review['verdict'] == 'APPROVE'
    assert review['summary']['mandatoryFindings'] == 0 and not any(x.get('mandatory',True) for x in review.get('findings',[]))
    assert receipt['status'] == 'FINISHED' and receipt['exitCode'] == 0 and receipt['head'] == head
    assert verify['exitCode'] == 0 and verify['mode'] == 'current' and verify['candidateCommit'] == head
    assert verify['verifiedArtifactCounts'] == [38]
    backup = ev/'promotion-preimages'
    backup.mkdir()
    for row in rows:
        path = backup/(row['path']+'.source.txt')
        path.parent.mkdir(parents=True,exist_ok=True)
        path.write_bytes((root/row['path']).read_bytes())
    index = sha(subprocess.check_output(['git','ls-files','--stage'],cwd=root))
    result.update(status='PROMOTING',rootIndexBeforeSha256=index,completedPaths=[])
    for row in rows:
        target = root/row['path']
        assert not target.is_symlink() and sha(target.read_bytes()) == row['beforeSha256']
        fd, temporary = tempfile.mkstemp(prefix='.hiso005-resolver-',suffix='.tmp',dir=target.parent)
        try:
            with os.fdopen(fd,'wb') as stream:
                stream.write((candidate/row['path']).read_bytes())
                stream.flush()
                os.fsync(stream.fileno())
            os.chmod(temporary,target.stat().st_mode & 0o777)
            os.replace(temporary,target)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)
        assert sha(target.read_bytes()) == row['afterSha256']
        result['completedPaths'].append(row['path'])
        (ev/'promotion-receipt.json').write_text(json.dumps(result,indent=2)+'\n')
    assert sha(subprocess.check_output(['git','ls-files','--stage'],cwd=root)) == index
    assert all(sha((root/n).read_bytes()) == digest for n,digest in protected.items())
    result.update(status='PROMOTED_TWO_REPAIR_PATHS',rootIndexUnchanged=True,protectedSourcesUnchanged=True,
                  finishedAt=datetime.datetime.now(datetime.timezone.utc).isoformat())
    (ev/'promotion-receipt.json').write_text(json.dumps(result,indent=2)+'\n')
elif sys.argv[1:] in [[],['--check']]:
    (ev/'promotion-readonly-preflight.json').write_text(json.dumps(result,indent=2)+'\n')
else:
    raise SystemExit('Use --check or --apply')
print(json.dumps({'status':result['status'],'paths':len(rows),'protected':len(protected),'sourceCommit':head}))
