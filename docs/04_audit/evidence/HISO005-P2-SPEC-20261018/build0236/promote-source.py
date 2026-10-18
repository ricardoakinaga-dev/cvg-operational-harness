"""Promote only the frozen seventeen-file approved composition; default is read-only."""
from pathlib import Path
import datetime,hashlib,json,os,subprocess,sys,tempfile

ev=Path(__file__).resolve().parent
root=ev.parents[4]
candidate=Path('/home/ricardo/cvg-candidates/hiso005-integrated-20261018')
preflight=json.loads((ev.parent/'integration/integration-preflight.json').read_text())
frozen=json.loads((ev/'source-freeze-recovery-r2.json').read_text())
sha=lambda b:hashlib.sha256(b).hexdigest()
assert root.name=='cvg-operational-harness' and (root/'.git').is_dir()
assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip()==preflight['scope']['rootHead']
head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=candidate,text=True).strip()
assert head==frozen['commit']=='75dfef50d0b5bc5a8063829ea4c63af8b4ab8b54'
rows=[]
for entry in frozen['files']:
 name=entry['path'];target=root/name;source=candidate/name
 assert target.parent.resolve()==target.parent and not source.is_symlink()
 payload=source.read_bytes();assert sha(payload)==entry['sha256']
 original=next((x for x in preflight['ownedSourceAndDocumentPaths']if x['path']==name),None)
 before=original['rootWorking']['sha256'] if original else entry['base26dSha256']
 exists=os.path.lexists(target); assert exists==(before is not None)
 if exists:assert target.is_file()and not target.is_symlink()and sha(target.read_bytes())==before
 rows.append({'path':name,'beforeSha256':before,'afterSha256':entry['sha256'],'preimageMatches':True})
assert len(rows)==17 and len({x['path']for x in rows})==17
assert {x['path']for x in rows}=={x['path']for x in json.loads((ev.parent/'integration-build/source-freeze.json').read_text())['files']}|{'scripts/boundary-semantic-engine.mjs','scripts/boundary-semantic-compiled.mjs','tests/b6-0236-semantic-engine.test.js','tests/b6-0236-compiled-provenance.test.js','tests/b6-0236-boundary-integration.test.js','tests/pare100-sdk-boundary-qualification.test.js','tests/pare100-compiled-kernel-boundary.test.js'}
protected=[]
claude=json.loads((ev.parent/'integration-build/task-short-spec.json').read_text())['claudeSources']
for entry in claude:
 p=root/entry['path'];assert not p.is_symlink()and sha(p.read_bytes())==entry['expected'];protected.append({'path':entry['path'],'sha256':entry['expected']})
for name in ['package.json','package-lock.json','packages/platform/package.json','scripts/ci-bar.mjs','scripts/build-runtime.mjs','scripts/boundary-code-execution.mjs','scripts/boundary-lexical.mjs','scripts/tsconfig-path-grammar.mjs']:
 p=root/name;expected=sha(subprocess.check_output(['git','show','26d866c39060669680aca01b34a916d45e1ba362:'+name],cwd=candidate));assert sha(p.read_bytes())==expected;protected.append({'path':name,'sha256':expected})
result={'task':'HISO005-P2-BUILD-0236','observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'candidateCommit':head,'rootHead':preflight['scope']['rootHead'],'status':'PREFLIGHT_PASS_NO_WRITES','files':rows,'protectedSources':protected,'rootCertified':False,'b6Accepted':False}
if sys.argv[1:]==['--apply']:
 receipt=json.loads((ev/'certify-r2-receipt.json').read_text());assert receipt['status']=='FINISHED'and receipt['exitCode']==0 and receipt['head']==head
 review=json.loads((ev/'recovery-r2/review-r2/review.json').read_text());assert review['verdict']=='APPROVE'and review['mandatoryFindings']==0 and review['commit']==head
 verify=json.loads((ev/'certification-current-verification.json').read_text());assert verify['exitCode']==0 and verify['candidateCommit']==head and verify['mode']=='current'
 # Keep exact preimages before publishing any source; no index writes.
 backup=ev/'promotion-preimages';backup.mkdir()
 for entry in rows:
  if entry['beforeSha256'] is not None:
   out=backup/(entry['path']+'.source.txt');out.parent.mkdir(parents=True,exist_ok=True);out.write_bytes((root/entry['path']).read_bytes())
 # Index is observed, never written by this procedure.
 indexBefore=subprocess.check_output(['git','ls-files','--stage'],cwd=root)
 result['status']='PROMOTING';result['indexBeforeSha256']=sha(indexBefore);result['completedPaths']=[]
 (ev/'promotion-receipt.json').write_text(json.dumps(result,indent=2)+'\n')
 for entry in rows:
  target=root/entry['path'];payload=(candidate/entry['path']).read_bytes()
  if entry['beforeSha256'] is None:assert not os.path.lexists(target)
  else:assert sha(target.read_bytes())==entry['beforeSha256']and not target.is_symlink()
  fd,tmp=tempfile.mkstemp(prefix='.hiso005-stage-',suffix='.tmp',dir=target.parent)
  try:
   with os.fdopen(fd,'wb')as stream:stream.write(payload);stream.flush();os.fsync(stream.fileno())
   os.chmod(tmp,0o664);os.replace(tmp,target)
  finally:
   if os.path.exists(tmp):os.unlink(tmp)
  assert sha(target.read_bytes())==entry['afterSha256']
  result['completedPaths'].append(entry['path']);(ev/'promotion-receipt.json').write_text(json.dumps(result,indent=2)+'\n')
 assert sha(subprocess.check_output(['git','ls-files','--stage'],cwd=root))==result['indexBeforeSha256']
 for entry in protected:assert sha((root/entry['path']).read_bytes())==entry['sha256']
 result['status']='PROMOTED_SEVENTEEN_SOURCE_PATHS';result['completedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();result['protectedSourcesUnchanged']=True;result['indexUnchanged']=True
 (ev/'promotion-receipt.json').write_text(json.dumps(result,indent=2)+'\n')
elif not sys.argv[1:] or sys.argv[1:]==['--check']:
 (ev/'promotion-readonly-preflight.json').write_text(json.dumps(result,indent=2)+'\n')
else:raise SystemExit('Use --check or --apply')
print(json.dumps({'status':result['status'],'files':len(rows),'protectedSources':len(protected),'candidateCommit':head}))
