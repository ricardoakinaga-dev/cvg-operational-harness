from pathlib import Path
import datetime,hashlib,json,os,subprocess
b=Path(__file__).resolve().parent
r=Path('/home/ricardo/Área de trabalho/cvg-operational-harness')
sha=lambda data:hashlib.sha256(data).hexdigest()
f=json.loads((b/'source-freeze.json').read_text());c=Path(f['candidate'])
assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=c,text=True).strip()==f['commit']
tracked=subprocess.check_output(['git','diff','--name-only'],cwd=c,text=True).splitlines()
untracked=subprocess.check_output(['git','ls-files','--others','--exclude-standard'],cwd=c,text=True).splitlines()
assert all(name.startswith('certification/') for name in tracked),tracked
assert all(name.startswith('docs/04_audit/evidence/PARE100-EXEC-20261014/differential/') for name in untracked),untracked
for row in f['files']+f['unchangedPrior15SourcePaths']:
    assert sha((c/row['path']).read_bytes())==row['sha256']
for row in f['files']:
    assert sha((r/row['path']).read_bytes())==row['sha256']
promotion=json.loads((b/'promotion-receipt.json').read_text())
assert promotion['rootIndexUnchanged'] and promotion['protectedSourcesUnchanged']
for row in promotion['protectedSources']:
    assert sha((r/row['path']).read_bytes())==row['sha256']
review=b/'review-r1';manifest=json.loads((review/'artifact-manifest.json').read_text())
for row in manifest['files']:
    assert sha((review/row['path']).read_bytes())==row['sha256']
central=json.loads((r/'docs/04_audit/evidence/empty-artifact-status.json').read_text());by={x['path']:x for x in central['files']}
local=json.loads((b/'empty-artifact-status.json').read_text());assert len(local['files'])==55
for row in local['files']:
    assert by[b.name+'/'+row['path']]==dict(row,path=b.name+'/'+row['path'])
old=json.loads((r/'docs/04_audit/evidence/HISO005-0236-RESOLVER-CONFORMANCE-20261018/empty-artifact-central-delta.json').read_text())
assert all(by[x['path']]==x for x in old['files'])
pg=json.loads((b/'postgres-preparation.json').read_text())
assert subprocess.run(['docker','inspect',pg['containerId']],capture_output=True).returncode!=0
active=[]
for p in Path('/proc').iterdir():
    if not p.name.isdigit():continue
    try:
        args=(p/'cmdline').read_bytes().split(b'\0');exe=Path(os.fsdecode(args[0])).name;cwd=os.readlink(p/'cwd')
    except (OSError,IndexError):continue
    if exe in ['node','npm','chromium','chrome'] and (cwd==str(c) or cwd.startswith('/tmp/cvg-hiso005-builtin-fix-20261018/')):
        active.append({'pid':int(p.name),'name':exe,'cwd':cwd})
assert not active,active
result={'status':'PASS_FINAL_LOCAL_INVARIANTS','observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sourceCommit':f['commit'],'source17Unchanged':True,'candidateCleanAtCertificationStart':True,'candidateSourceCleanAfterGates':True,'candidateWorktreeCleanAfterGates':False,'expectedGeneratedTrackedOutputs':tracked,'expectedGeneratedUntrackedEvidence':untracked,'rootTwoAfterHashesMatch':True,'root78ProtectedHashesMatchIncluding3PeerPreimages':True,'indexUnchangedDuringPromotion':True,'review567FrozenFilesUnchanged':True,'current55AndPrior119RowsCentralByteEquivalent':True,'ownPGAbsent':True,'ownProcesses':active,'rootCertified':False,'b6Accepted':False}
(b/'final-invariants.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:v for k,v in result.items()if k not in ['expectedGeneratedTrackedOutputs','expectedGeneratedUntrackedEvidence']}))
