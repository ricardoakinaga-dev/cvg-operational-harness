from pathlib import Path
import datetime,gzip,hashlib,json,os,socket,subprocess
b=Path(__file__).resolve().parent
root=Path('/home/ricardo/Área de trabalho/cvg-operational-harness');c=Path('/mnt/ia/cvg-hiso005-build0237-20261018');runtime=Path('/mnt/ia/cvg-hiso005-build0237-runtime-20261018')
h=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();hb=lambda x:hashlib.sha256(x).hexdigest()
s=json.loads((b/'state.json').read_text());f=json.loads((b/s['sourceFreeze']).read_text());promotion=json.loads((b/'promotion-receipt.json').read_text())
assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=c,text=True).strip()==f['commit']==promotion['sourceCommit']
assert promotion['status']=='PROMOTED_SEVEN_OWNED_PATHS'and promotion['rootIndexUnchanged']and promotion['protectedSourcesUnchanged']
assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip()==promotion['rootHead']
assert hb(subprocess.check_output(['git','ls-files','--stage'],cwd=root))==promotion['rootIndexBeforeSha256']
for row in f['files']:
 assert h(c/row['path'])==h(root/row['path'])==row['sha256']
for row in f['unchangedOriginal0236']:assert h(c/row['path'])==row['sha256']
for row in promotion['protectedSources']:assert h(root/row['path'])==row['sha256']
tracked=subprocess.check_output(['git','diff','--name-only'],cwd=c,text=True).splitlines();untracked=subprocess.check_output(['git','ls-files','--others','--exclude-standard'],cwd=c,text=True).splitlines()
assert all(x.startswith('certification/')for x in tracked),tracked
assert all(x.startswith('docs/04_audit/evidence/PARE100-EXEC-20261014/differential/')for x in untracked),untracked
reviewCount=0
for round in ['review-r1','review-r2']:
 m=json.loads((b/round/'artifact-manifest.json').read_text())
 for row in m['entries']:
  p=Path(m['scopes'][row['scope']])/row['path']
  if row['kind']=='file':assert p.is_file()and not p.is_symlink()and p.stat().st_size==row['bytes']and h(p)==row['sha256']
  else:assert p.is_symlink()and os.fsencode(os.readlink(p)).hex()==row['rawLinkHex']and hb(os.fsencode(os.readlink(p)))==row['sha256']
 reviewCount+=len(m['entries'])
assert reviewCount==1036
review=json.loads((b/s['acceptedCodeReview']).read_text());assert review['sourceCommit']==f['commit']and review['verdict']=='APPROVE'and not review['requiredFindings']and not s['activeAgents']and s['codeReviewRoundsConsumed']==2
manifest=json.loads((c/'certification/manifest.json').read_text());summary=json.loads((b/'current-qualification-summary.json').read_text());assert manifest['candidateId']==s['certificationCandidateId']==summary['candidateId']and len(manifest['artifacts'])==38
for row in manifest['artifacts']:
 p=c/row['path'];assert h(p)==row['sha256']and p.stat().st_size==row['size'];archive=b/'qualification-current'/(row['path']+'.gz');assert gzip.decompress(archive.read_bytes())==p.read_bytes()
assert len(summary['gates'])==16 and all(x['status']=='PASS'and x['exitCode']==0 for x in summary['gates'])
cleanup=json.loads((b/'cleanup-owned-runtime.json').read_text());assert cleanup['status']=='OWN_RUNTIME_CLEANED'and cleanup['clientBackendsBeforeRemoval']==0 and not cleanup['ownProcesses']
assert subprocess.run(['docker','inspect',cleanup['containerId']],capture_output=True).returncode!=0
for port in cleanup['portsFree']:
 with socket.socket()as server:server.bind(('127.0.0.1',port))
active=[]
for p in Path('/proc').iterdir():
 if not p.name.isdigit():continue
 try:args=(p/'cmdline').read_bytes().split(b'\0');exe=Path(os.fsdecode(args[0])).name;cwd=os.readlink(p/'cwd')
 except(OSError,IndexError):continue
 if exe in ['node','npm','chromium','chrome']and(cwd==str(c)or cwd.startswith(str(c)+'/')or cwd==str(runtime)or cwd.startswith(str(runtime)+'/')):active.append({'pid':int(p.name),'exe':exe,'cwd':cwd})
assert not active,active
assert not json.loads((b/'empty-artifact-status.json').read_text())['files']
assert not[p for p in b.rglob('*')if p.is_file()and not p.is_symlink()and p.stat().st_size==0]
assert json.loads((b/'prior-sealed-preserved-final.json').read_text())['filesVerified']==4532
result={'status':'PASS_FINAL_LOCAL_INVARIANTS','observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sourceCommit':f['commit'],'source20Unchanged':True,'rootSevenAfterHashesMatch':True,'root77ProtectedHashesMatch':True,'rootHeadAndIndexUnchanged':True,'candidateCleanAtCertificationStart':True,'candidateSourceCleanAfterGates':True,'candidateWorktreeCleanAfterGates':False,'expectedGeneratedTrackedOutputs':tracked,'expectedGeneratedUntrackedEvidence':untracked,'review1036ScopedArtifactsUnchanged':True,'prior4532SealedFilesUnchanged':True,'current38ArtifactsMatchPreservedArchives':True,'ownPGAbsent':True,'ownPortsFree':cleanup['portsFree'],'ownProcesses':active,'newEmptyArtifacts':0,'rootCertified':False,'b6Accepted':False,'productionApproved':False}
(b/'final-invariants.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({k:v for k,v in result.items()if k not in ['expectedGeneratedTrackedOutputs','expectedGeneratedUntrackedEvidence']}))
