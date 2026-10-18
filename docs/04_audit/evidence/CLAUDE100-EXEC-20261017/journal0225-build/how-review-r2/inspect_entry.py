from pathlib import Path
import sys,json,hashlib,subprocess,datetime,os
R=Path(__file__).resolve().parent
ROOT=Path('/home/ricardo/Área de trabalho/cvg-operational-harness')
C=Path('/tmp/cvg-claude100-exec-20261017/runtime-build-closure-candidate')
P=R.parent
H=lambda b:hashlib.sha256(b).hexdigest()
def save(n,o):(R/n).write_text(json.dumps(o,ensure_ascii=False,indent=2)+'\n')
def log(argv,out,err='',code=0):
 d=R/'commands';save('commands/'+f'{len(list(d.glob("*.json")))+1:03d}.json',{'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'cwd':str(ROOT),'argv':argv,'exitCode':code,'stdout':out,'stderr':err})
def git(args):
 argv=['git','-C',str(C)]+args;c=subprocess.run(argv,text=True,capture_output=True,env=dict(os.environ,GIT_OPTIONAL_LOCKS='0'))
 log(argv,c.stdout,c.stderr,c.returncode);assert c.returncode==0
 return c.stdout
T=json.loads((P/'task.json').read_text());F=json.loads((P/'how-freeze-r1.json').read_text())
obs={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'freeze':[],'preimages':[],'protected':[]}
for x in F['files']:
 p=Path(x['path']);b=p.read_bytes();obs['freeze'].append(dict(x,match=H(b)==x['sha256'] and len(b)==x['bytes']))
obs['HEAD']=git(['rev-parse','HEAD']).strip();obs['status']=git(['status','--porcelain=v1','--untracked-files=all'])
for x in T['preimages']:
 p=C/x['path'];exists=p.is_file();digest=H(p.read_bytes()) if exists else None
 obs['preimages'].append(dict(x,observed_exists=exists,observed_sha256=digest,match=exists==x['exists'] and digest==x['sha256']))
for x in T['protected']:
 p=C/x['path'];b=p.read_bytes();obs['protected'].append(dict(x,observed_sha256=H(b),match=H(b)==x['sha256']))
obs['migration_inventory']=[p.name for p in sorted((C/'packages/persistence/migrations').glob('*.sql'))]
obs['inventory_matches']=obs['migration_inventory']==T['migration_inventory']
obs['0030_0031_present']=[p.name for p in (C/'packages/persistence/migrations').glob('003[01]*')]
obs['pathset_unique']=len({x['path'] for x in T['preimages']})==11
obs['pathset_disjoint_from_protected']=not ({x['path'] for x in T['preimages']}&{x['path'] for x in T['protected']})
obs['new_paths_absent']=sum(not x['observed_exists'] for x in obs['preimages'])
# Read immutable object content and compare it with the working source, never execute it.
blobs=[]
for rel in ['packages/persistence/migrations/0029_controlled_published_kernel.sql','packages/persistence/src/postgres-migrations.ts','scripts/build-runtime.mjs']:
 b=git(['show',T['base_commit']+':'+rel]).encode()
 name='sources/GIT-2f0cc11f-'+Path(rel).name+'.source.txt';(R/name).write_bytes(b)
 blobs.append({'ref':T['base_commit'],'path':rel,'sha256':H(b),'snapshot':name,'matches_worktree':H(b)==H((C/rel).read_bytes())})
obs['git_blobs']=blobs
obs['base_valid']=obs['HEAD']==T['base_commit'] and obs['status']==''
obs['all_static_matches']=all(x['match'] for k in ['freeze','preimages','protected'] for x in obs[k]) and obs['inventory_matches'] and obs['pathset_unique'] and obs['pathset_disjoint_from_protected'] and obs['base_valid'] and all(x['matches_worktree'] for x in blobs)
save('entry-inspection.json',obs)
# R1 is read only: integrity check, no reconsideration of its verdict or criteria.
r1=ROOT/'docs/04_audit/evidence/CLAUDE100-EXEC-20261017/foundation0225-entry-reconciliation/review-r1'
m=json.loads((r1/'manifest.json').read_text());r1rows=[]
for x in m['files']:
 p=r1/x['path'];b=p.read_bytes();r1rows.append({'path':str(p),'sha256':H(b),'expected_sha256':x['sha256'],'bytes':len(b),'match':H(b)==x['sha256'] and len(b)==x['bytes']})
save('R1-protected-before.json',r1rows)
assert obs['all_static_matches'] and all(x['match'] for x in r1rows)
out=json.dumps({'freeze_files_matched':len(obs['freeze']),'preimages_matched':len(obs['preimages']),'protected_matched':len(obs['protected']),'absent_new_paths':obs['new_paths_absent'],'base_clean':obs['base_valid'],'inventory_matches':obs['inventory_matches'],'R1_integrity_only':len(r1rows),'git_blobs_matched':len(blobs)},ensure_ascii=False)+'\n'
log(sys.argv,out);print(out,end='')
