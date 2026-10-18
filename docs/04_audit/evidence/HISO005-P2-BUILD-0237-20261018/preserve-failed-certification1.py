from pathlib import Path
import datetime,gzip,hashlib,json,os,subprocess
b=Path(__file__).resolve().parent;c=Path('/mnt/ia/cvg-hiso005-build0237-20261018');runtime=Path('/mnt/ia/cvg-hiso005-build0237-runtime-20261018')
r=json.loads((b/'certify-r1-receipt.json').read_text());assert r['status']=='FINISHED'and r['exitCode']==-15
for path in Path('/proc').iterdir():
 if not path.name.isdigit():continue
 try:args=(path/'cmdline').read_bytes().split(b'\0');exe=Path(os.fsdecode(args[0])).name;cwd=os.readlink(path/'cwd')
 except(OSError,IndexError):continue
 assert not(exe in ['node','npm','chromium','chrome']and(cwd==str(c)or cwd.startswith(str(c)+'/')or cwd.startswith(str(runtime)+'/'))),(path.name,exe,cwd)
tracked=subprocess.check_output(['git','diff','--name-only'],cwd=c,text=True).splitlines();untracked=subprocess.check_output(['git','ls-files','--others','--exclude-standard'],cwd=c,text=True).splitlines()
assert all(x.startswith('certification/')for x in tracked)
assert all(x.startswith('docs/04_audit/evidence/PARE100-EXEC-20261014/differential/')for x in untracked)
out=b/'qualification-attempt1-failed';out.mkdir(exist_ok=True);moved=runtime/'qualification-attempt1-untracked';moved.mkdir(exist_ok=True);rows=[]
for name in tracked+untracked:
 p=c/name
 if not p.exists():
  assert name in tracked;rows.append({'path':name,'exists':False,'bytes':None,'sha256':None,'rawStatus':'absent_after_certification_reset'});continue
 assert p.is_file()and not p.is_symlink();data=p.read_bytes();target=out/(name+'.gz');target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(gzip.compress(data,mtime=0));rows.append({'path':name,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'archive':str(target.relative_to(b)),'archiveSha256':hashlib.sha256(target.read_bytes()).hexdigest(),'rawStatus':'expected_empty'if not data else'captured'})
for name in tracked:
 p=c/name;data=subprocess.check_output(['git','show','HEAD:'+name],cwd=c);expected=next(x['sha256']for x in rows if x['path']==name);assert (hashlib.sha256(p.read_bytes()).hexdigest()if p.exists()else None)==expected;p.write_bytes(data)
for name in untracked:
 target=moved/name;target.parent.mkdir(parents=True,exist_ok=True);(c/name).rename(target)
assert subprocess.check_output(['git','status','--porcelain'],cwd=c,text=True)==''
result={'status':'FAILED_ATTEMPT1_PRESERVED_OWN_GENERATED_OUTPUTS_REANCHORED','observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sourceCommit':r['head'],'gatesObserved':{'format':'PASS','typecheck':'PASS','lint':'PASS','build':'PASS','unit':'FAIL','coverage':'INTERRUPTED','remaining':'NOT_RUN'},'reason':'92 missing generated input ENOENTs in2historical suites; no source edit or source verdict reset. Next attempt requires proper runtime preparation plus focused reproduction first.','trackedGeneratedFilesReanchoredToOwnCommit':tracked,'untrackedGeneratedFilesRetainedUnder':str(moved),'files':rows,'sourceChanged':False,'codeReviewRoundsReset':False,'candidateWorktreeCleanAfterPreservation':True}
(b/'qualification-attempt1-preservation.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({'status':result['status'],'tracked':len(tracked),'untracked':len(untracked),'sourceChanged':False}))
