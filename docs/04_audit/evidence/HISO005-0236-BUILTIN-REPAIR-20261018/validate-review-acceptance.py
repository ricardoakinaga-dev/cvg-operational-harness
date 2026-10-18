from pathlib import Path
import datetime,hashlib,json,subprocess
b=Path(__file__).resolve().parent
review=b/'review-r1'
sha=lambda x:hashlib.sha256(x).hexdigest()
manifest=review/'artifact-manifest.json'
m=json.loads(manifest.read_text())
for row in m['files']:
    data=(review/row['path']).read_bytes()
    assert len(data)==row['bytes'] and sha(data)==row['sha256'],row['path']
f=json.loads((b/'source-freeze.json').read_text())
c=Path(f['candidate'])
assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=c,text=True).strip()==f['commit']
assert not subprocess.check_output(['git','status','--porcelain'],cwd=c,text=True)
for row in f['files']+f['unchangedPrior15SourcePaths']:
    assert sha((c/row['path']).read_bytes())==row['sha256']
d=json.loads((review/'review.json').read_text())
assert d['sourceCommit']==f['commit'] and d['verdict']=='APPROVE' and d['summary']['mandatoryFindings']==0 and not d['findings']
index=json.loads((review/'raw-result-index.json').read_text())
assert len(index['calls'])==40
for call in index['calls']:
    assert call['signal'] is None and call['error'] is None
    for suffix in ['stdout.txt','stderr.txt','command.json']:
        assert (review/'raw'/(call['id']+'.'+suffix)).exists()
results=json.loads((review/'results.json').read_text())['results']
native=ordinary=0
for row in results:
    oracle=(review/'raw'/(row['oracle']['raw']+'.stdout.txt')).read_text().strip()
    assert oracle==row['oracle']['expectedSelection']
    k=json.loads((review/'raw'/(row['kernel']['raw']+'.stdout.txt')).read_text())
    if row.get('product'):
        assert k['status']=='VIOLATION' and not k['proofs'] and row['cli']['status']=='FAIL'
    elif row.get('native',False):
        native+=1
        assert k['status']=='UNKNOWN' and not k['proofs']
        assert all(x['status']!='PROVEN' and not x['proofIds'] for x in k['installed'])
        assert any(x['reason']=='UNKNOWN_NATIVE_BUILTIN' for x in k['unknowns'])
        assert not any(x['file'].startswith('node_modules/'+row['pkg']+'/') for x in k['inputs'])
    else:
        ordinary+=1
        assert row.get('positive') and k['status']=='PROVEN'
positives=json.loads((review/'positive-selection-bindings.json').read_text())
for row in positives:
    p=Path(row['realpath'])
    assert not p.is_symlink() and sha(p.read_bytes())==row['sha256']
    case=next(x for x in results if x['id']==row['scenario'])
    k=json.loads((review/'raw'/(case['kernel']['raw']+'.stdout.txt')).read_text())
    cli=json.loads((review/'raw'/(case['cli']['raw']+'.stdout.txt')).read_text())
    assert any(x['file']==row['file'] and x['sha256']==row['sha256'] for x in k['inputs'])
    assert any(x['file']==row['file'] and x['sha256']==row['sha256'] for x in cli['semanticBoundary']['inputs'])
    assert any(x.get('file')==row['file'] and x.get('fileSha256')==row['sha256'] for x in cli['semanticBoundary']['proofs'])
o={'status':'PASS_LEAD_RECOMPUTED_REVIEW_BOUNDARY','observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sourceCommit':f['commit'],'artifactManifestSha256':sha(manifest.read_bytes()),'boundArtifactFilesVerified':len(m['files']),'controlledCalls':len(index['calls']),'distinctScenarios':len(results),'nativeUnknownWitnesses':native,'ordinaryPositiveWitnesses':ordinary,'positivePhysicalInputsRecomputed':len(positives),'source17Unchanged':True,'reviewerClosed':True,'mandatoryFindings':0,'currentFullGatesStarted':False}
(b/'review-r1-lead-acceptance.json').write_text(json.dumps(o,indent=2)+'\n')
print(json.dumps(o))
