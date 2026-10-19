"""Seven owned paths only; --check is read-only, --apply requires all current evidence."""
from pathlib import Path
import datetime,hashlib,json,os,subprocess,sys,tempfile
b=Path(__file__).resolve().parent
root=Path('/home/ricardo/Área de trabalho/cvg-operational-harness')
c=Path('/mnt/ia/cvg-hiso005-build0237-20261018')
h=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
hb=lambda x:hashlib.sha256(x).hexdigest()
s=json.loads((b/'state.json').read_text());f=json.loads((b/s['sourceFreeze']).read_text());pre=json.loads((b/'candidate-preflight.json').read_text());protected=json.loads((b/'root-protected-preimages.json').read_text())
head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=c,text=True).strip();rh=subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip()
assert head==f['commit'] and rh==pre['rootHead']==protected['rootHead']
indexPath=Path(subprocess.check_output(['git','rev-parse','--git-path','index'],cwd=root,text=True).strip())
if not indexPath.is_absolute():indexPath=root/indexPath
assert h(indexPath)==protected['rootIndexSha256']
index=hb(subprocess.check_output(['git','ls-files','--stage'],cwd=root))
assert len(f['files'])==7 and len(protected['protectedSources'])==77
rows=[]
for row in f['files']:
 source=c/row['path'];target=root/row['path'];before=next(x for x in pre['paths']if x['path']==row['path'])
 assert source.is_file()and not source.is_symlink()and h(source)==row['sha256']
 assert not target.is_symlink()and target.parent.resolve()==target.parent
 assert os.path.lexists(target)==before['rootExists']
 if before['rootExists']:assert target.is_file()and h(target)==before['rootSha256']
 rows.append({'path':row['path'],'beforeExists':before['rootExists'],'beforeSha256':before['rootSha256'],'afterSha256':row['sha256']})
for row in protected['protectedSources']:
 p=root/row['path'];assert p.is_file()and not p.is_symlink()and h(p)==row['sha256'],row['path']
for row in f['unchangedOriginal0236']:assert h(c/row['path'])==row['sha256']
result={'task':s['task'],'observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sourceCommit':head,'rootHead':rh,'status':'READONLY_PREFLIGHT_PASS','files':rows,'protectedSources':protected['protectedSources'],'rootIndexBeforeSha256':index,'rootCertified':False,'b6Accepted':False,'productionApproved':False}
mode=sys.argv[1:]or['--check'];assert mode in [['--check'],['--apply']]
if mode==['--apply']:
 review=json.loads((b/s['acceptedCodeReview']).read_text());assert review['sourceCommit']==head and review['verdict']=='APPROVE'and not review['requiredFindings']
 focus=json.loads((b/'focused-final-r2.json').read_text());assert focus['sourceStable']and focus['exitCode']==0 and focus['sourceCommit']==head
 cert=json.loads((b/'certify-r2-receipt.json').read_text());verify=json.loads((b/'certification-current-verification.json').read_text());assert cert['head']==verify['sourceCommit']==head and cert['status']=='FINISHED'and cert['exitCode']==0 and verify['status']=='PASS_CURRENT_38_HASHES'
 qual=json.loads((b/'current-qualification-summary.json').read_text());assert qual['sourceCommit']==head and qual['artifactHashesVerified']==38 and len(qual['gates'])==16 and all(x['status']=='PASS'and x['exitCode']==0 for x in qual['gates'])
 compat=json.loads((b/'compatibility-postcert.json').read_text());assert compat['sourceCommit']==head and compat['status']=='PASS_DEFAULT_AND_IDENTITY_BYTE_EQUIVALENCE'
 reval=json.loads((b/'postsdk-input-revalidation.json').read_text());assert reval['sourceCommit']==head and reval['status']=='PASS_POSTCERT_COMPILED_AND_CONSUMER'
 measurement=json.loads((b/'real-postcert-reconciliation.json').read_text());assert measurement['sourceCommit']==head and measurement['status']=='CURRENT_QUALIFIED_MEASUREMENT'and measurement['baseline']==537 and measurement['original537OriginTuplesPreserved']and measurement['normalStrictPayloadEqual']and measurement['normalStrictGraphByteEqual']
 old=json.loads((b/'prior-sealed-preserved-final.json').read_text());assert old['status']=='PASS_PRIOR_SEALED_BYTES_UNCHANGED'and old['filesVerified']==4532
 sdk=json.loads((b/'sdk-physical-parity.json').read_text());assert sdk['sourceCommit']==head and sdk['status']=='SDK_PHYSICAL_PARITY_RESTORED_FROM_CURRENT_FROZEN_SOURCE'and sdk['oldPhysicalOriginHashesExact']==2257
 ledger=json.loads((b/'profile-frontier-multiset-reconciliation.json').read_text());assert ledger['sourceCommit']==head and ledger['status']=='PASS_PROFILE_FRONTIER_MULTISETS_RETAINED_NO_SILENT_RESOLUTION'and ledger['priorFrontierUnprovenRetained']==1721 and ledger['priorFrontierResolvedCredit']==0
 for round in ['review-r1','review-r2']:
  m=json.loads((b/round/'artifact-manifest.json').read_text())
  for row in m['entries']:
   p=Path(m['scopes'][row['scope']])/row['path'];assert p.parent.resolve().is_relative_to(Path(m['scopes'][row['scope']]).resolve())
   if row['kind']=='file':assert p.is_file()and not p.is_symlink()and p.stat().st_size==row['bytes']and h(p)==row['sha256']
   else:assert row['kind']=='symlink'and p.is_symlink()and os.fsencode(os.readlink(p)).hex()==row['rawLinkHex'] and hb(os.fsencode(os.readlink(p)))==row['sha256']
 backup=b/'promotion-preimages';backup.mkdir();result.update(status='PROMOTING',completedPaths=[])
 for row in rows:
  target=root/row['path']
  if row['beforeExists']:
   p=backup/(row['path']+'.source.txt');p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(target.read_bytes())
  assert not target.is_symlink()and os.path.lexists(target)==row['beforeExists']
  if row['beforeExists']:assert h(target)==row['beforeSha256']
  fd,temporary=tempfile.mkstemp(prefix='.hiso005-0237-',suffix='.tmp',dir=target.parent)
  try:
   with os.fdopen(fd,'wb')as stream:stream.write((c/row['path']).read_bytes());stream.flush();os.fsync(stream.fileno())
   os.chmod(temporary,target.stat().st_mode&0o777 if row['beforeExists']else 0o644);os.replace(temporary,target)
  finally:
   if os.path.exists(temporary):os.unlink(temporary)
  assert h(target)==row['afterSha256'];result['completedPaths'].append(row['path']);(b/'promotion-receipt.json').write_text(json.dumps(result,indent=2)+'\n')
 assert hb(subprocess.check_output(['git','ls-files','--stage'],cwd=root))==index
 for row in protected['protectedSources']:assert h(root/row['path'])==row['sha256']
 result.update(status='PROMOTED_SEVEN_OWNED_PATHS',rootIndexUnchanged=True,protectedSourcesUnchanged=True,finishedAt=datetime.datetime.now(datetime.timezone.utc).isoformat());(b/'promotion-receipt.json').write_text(json.dumps(result,indent=2)+'\n')
else:(b/'promotion-readonly-preflight.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'status':result['status'],'paths':len(rows),'protected':len(protected['protectedSources']),'sourceCommit':head}))
