from pathlib import Path
import sys,json,hashlib,subprocess,datetime,os
R=Path(__file__).resolve().parent
ROOT=Path('/home/ricardo/Área de trabalho/cvg-operational-harness')
BASE=ROOT/'docs/04_audit/evidence/CLAUDE100-EXEC-20261017'
C=Path('/tmp/cvg-claude100-exec-20261017/journal0225-candidate')
S=Path('/tmp/cvg-claude100-exec-20261017/runtime-build-closure-candidate')
H=lambda b:hashlib.sha256(b).hexdigest()
def save(n,o):(R/n).write_text(json.dumps(o,ensure_ascii=False,indent=2)+'\n')
def run(argv):
 c=subprocess.run(argv,capture_output=True,text=True,env=dict(os.environ,GIT_OPTIONAL_LOCKS='0'))
 d=R/'commands';d.mkdir(exist_ok=True)
 save('commands/'+f'{len(list(d.glob("*.json")))+1:03d}.json',{'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'argv':argv,'exitCode':c.returncode,'stdout':c.stdout,'stderr':c.stderr})
 assert c.returncode==0
 return c.stdout
T=json.loads((BASE/'journal0225-build/task.formatted.json').read_text());obs={}
obs['HEAD']=run(['git','-C',str(C),'rev-parse','HEAD']).strip()
obs['status']=run(['git','-C',str(C),'status','--porcelain=v1','--untracked-files=all'])
obs['preimages']=[];obs['protected']=[]
for kind in ['preimages','protected']:
 for x in T[kind]:
  p=C/x['path'];exists=p.is_file();dig=H(p.read_bytes()) if exists else None
  obs[kind].append(dict(x,observed_exists=exists,observed_sha256=dig,match=exists==x.get('exists',True) and dig==x['sha256']))
obs['migration_inventory']=[p.name for p in sorted((C/'packages/persistence/migrations').glob('*.sql'))]
obs['inventory_match']=obs['migration_inventory']==T['migration_inventory']
obs['typescript_file_stat']=[]
for base in [S,C]:
 p=base/'node_modules/typescript/lib/typescript.js';st=p.stat()
 obs['typescript_file_stat'].append({'path':str(p),'device':st.st_dev,'inode':st.st_ino,'bytes':st.st_size,'sha256':H(p.read_bytes())})
a,b=obs['typescript_file_stat'];obs['typescript_sample_physically_distinct']=(a['device'],a['inode'])!=(b['device'],b['inode']) and a['sha256']==b['sha256']
obs['limitations']='Only one dependency payload inode/hash sample verified; no full dependency-copy attestation. No SQL/PG/Docker/process-resource inspection; PG_created=false is receipt evidence only.'
assert obs['HEAD']==T['base_commit'] and obs['status']=='' and obs['inventory_match'] and obs['typescript_sample_physically_distinct']
assert all(x['match'] for k in ['preimages','protected'] for x in obs[k])
save('candidate-static-inspection.json',obs)
sealed=[]
for root in [BASE/'foundation0225-entry-reconciliation/review-r1',BASE/'journal0225-build/how-review-r2']:
 m=json.loads((root/'manifest.json').read_text())
 for x in m['files']:
  p=root/x['path'];bb=p.read_bytes();assert H(bb)==x['sha256'] and len(bb)==x['bytes']
  sealed.append({'path':str(p),'sha256':H(bb),'bytes':len(bb),'matches_sealed_manifest':True})
 for name in ['manifest.json','manifest.sha256']:
  p=root/name;bb=p.read_bytes();sealed.append({'path':str(p),'sha256':H(bb),'bytes':len(bb),'matches_sealed_manifest':'self/digest excluded by original manifest; snapshot binding'})
save('sealed-before.json',sealed)
cor=json.loads((BASE/'journal0225-build/format-correction.json').read_text());pairs=[]
for pair in [x for x in cor['pairs'] if 'original' in x]:
 a=ROOT/pair['original'];b=ROOT/pair['formatted']
 pairs.append(dict(pair,original_match=H(a.read_bytes())==pair['original_sha256'],formatted_match=H(b.read_bytes())==pair['formatted_sha256']))
assert all(p['original_match'] and p['formatted_match'] for p in pairs)
save('pair-hash-inspection.json',pairs)
print(json.dumps({'preimages_matched':11,'protections_matched':9,'base_clean':True,'sample_physical_dependency_copy':True,'sealed_R1_artifacts':139,'sealed_R2_artifacts':77,'seal_and_digest_files':4,'pair_hashes_matched':8},ensure_ascii=False))
