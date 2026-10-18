from pathlib import Path
import sys,json,hashlib,subprocess,os,datetime,re
R=Path(__file__).resolve().parent
ROOT=Path('/home/ricardo/Área de trabalho/cvg-operational-harness')
P=R.parent
H=lambda b:hashlib.sha256(b).hexdigest()
def save(p,o):(R/p).write_text(json.dumps(o,ensure_ascii=False,indent=2)+'\n')
def log(argv,out,err='',code=0):
 d=R/'commands';d.mkdir(exist_ok=True)
 save('commands/'+f'{len(list(d.glob("*.json")))+1:03d}.json',{'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'cwd':str(ROOT),'argv':argv,'exitCode':code,'stdout':out,'stderr':err})
def git(args,name=None):
 argv=['git']+args;c=subprocess.run(argv,cwd=ROOT,capture_output=True,env=dict(os.environ,GIT_OPTIONAL_LOCKS='0'))
 log(argv,c.stdout.decode(),c.stderr.decode(),c.returncode)
 assert c.returncode==0,(argv,c.stderr)
 if name:(R/'sources'/name).write_bytes(c.stdout)
 return c.stdout
rows=json.loads((R/'hash-before.json').read_text())
extra=[str(x) for x in P.glob('*.json')]+[str(x) for x in (P/'snapshots').glob('*')]+['docs/04_audit/evidence/PARE100-GAP-20261016/decisions-d1-d7.json']
for path in extra:
 p=Path(path);p=p if p.is_absolute() else ROOT/p
 if any(x['path']==str(p) for x in rows):continue
 b=p.read_bytes();name=f'sources/{len(rows):03d}-{p.name}.source.txt';(R/name).write_bytes(b)
 rows.append({'path':str(p),'bytes':len(b),'sha256':H(b),'snapshot':name})
# Direct filesystem inputs: never execute SQL or loaders.
W=Path('/tmp/cvg-pare100-exec-20261014-6az3hlay/worktree')
C=Path('/tmp/cvg-claude100-exec-20261017/runtime-build-closure-candidate')
for base in [W,C]:
 for rel in ['packages/persistence/migrations/0029_controlled_published_kernel.sql','packages/persistence/src/postgres-migrations.ts']:
  p=base/rel;b=p.read_bytes();name=f'sources/{len(rows):03d}-{p.name}.source.txt';(R/name).write_bytes(b)
  rows.append({'path':str(p),'bytes':len(b),'sha256':H(b),'snapshot':name})
save('hash-before.json',rows)
freeze=json.loads((P/'freeze-r1.json').read_text());inputs=json.loads((P/'inputs.json').read_text())
checks={'freeze':[dict(x,observed_sha256=H((P/x['path']).read_bytes()),match=H((P/x['path']).read_bytes())==x['sha256']) for x in freeze['files']],
 'input_pairs':[dict(x,source_matches=H(Path(x['path']).read_bytes())==x['sha256'],snapshot_matches=H((P/x['snapshot']).read_bytes())==x['sha256']) for x in inputs['files']]}
checks['links']=[{'target':u,'exists':(P/u).resolve().is_file()} for u in re.findall(r'\[[^\]]+\]\(([^)]+)\)',(P/'entry-reconciliation.md').read_text())]
checks['format_receipt']='Historical formatter receipt exit0 authenticated by frozen hash; not rerun in this review.'
checks['all_match']=all(x['match'] for x in checks['freeze']) and all(x['source_matches'] and x['snapshot_matches'] for x in checks['input_pairs']) and all(x['exists'] for x in checks['links'])
save('documentary-inspection.json',checks)
blobs=[]
for ref in ['a72422bee3730ecc98226e3ff8f4c7fb51a4e7fe','5e3b51bd97e0c328640e472f784fcf3f769ee8ec']:
 for rel in ['packages/persistence/migrations/0029_controlled_published_kernel.sql','packages/persistence/src/postgres-migrations.ts']:
  name=f'GIT-{ref[:8]}-{Path(rel).name}.source.txt';b=git(['show',ref+':'+rel],name)
  blobs.append({'ref':ref,'path':rel,'snapshot':'sources/'+name,'bytes':len(b),'sha256':H(b)})
ref=git(['rev-parse','7ecc5b53']).decode().strip()
b=git(['show',ref+':scripts/build-runtime.mjs'],'GIT-7ecc5b53-build-runtime.mjs.source.txt')
blobs.append({'ref':ref,'path':'scripts/build-runtime.mjs','snapshot':'sources/GIT-7ecc5b53-build-runtime.mjs.source.txt','bytes':len(b),'sha256':H(b)})
save('git-blobs-before.json',blobs)
obs={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'inventories':[]}
for base in [ROOT,W,C]:
 obs['inventories'].append({'base':str(base),'migrations':[p.name for p in sorted((base/'packages/persistence/migrations').glob('*.sql'))], '0030_0031':[p.name for p in (base/'packages/persistence/migrations').glob('003[01]*')]})
obs['candidate_HEAD']=git(['-C',str(C),'rev-parse','HEAD']).decode().strip()
obs['candidate_status']=git(['-C',str(C),'status','--porcelain=v1','--untracked-files=all']).decode()
obs['candidate_builder_sha256']=H((C/'scripts/build-runtime.mjs').read_bytes())
obs['candidate_since_base']=git(['-C',str(C),'diff','5e3b51bd97e0c328640e472f784fcf3f769ee8ec','HEAD','--stat']).decode()
obs['root_branch']=git(['branch','--show-current']).decode().strip()
save('independent-primary-observations.json',obs)
log(sys.argv,json.dumps({'freeze_files':len(checks['freeze']),'primary_pairs':len(checks['input_pairs']),'all_match':checks['all_match'],'snapshotted_files':len(rows),'git_blobs':len(blobs),'candidate_HEAD':obs['candidate_HEAD']},ensure_ascii=False))
print(json.dumps({'all_match':checks['all_match'],'snapshotted_files':len(rows),'candidate':obs},ensure_ascii=False,indent=2))
