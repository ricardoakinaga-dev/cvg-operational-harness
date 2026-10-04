import argparse,json,hashlib,os,subprocess
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--checker',required=True);p.add_argument('--node',required=True);p.add_argument('--output',required=True);a=p.parse_args()
home=Path(a.output);home.mkdir(parents=True,exist_ok=False);(home/'tmp').mkdir()
inputs=json.loads(Path(__file__).with_name('boundary-rejection-fixtures.json').read_text());rows=[]
for case in inputs['cases']:
 root=home/case['id'];root.mkdir()
 for name,data in case['files'].items():
  f=root/name;f.parent.mkdir(parents=True,exist_ok=True);f.write_text(data['text']);assert hashlib.sha256(f.read_bytes()).hexdigest()==data['sha256']
 env={k:v for k,v in os.environ.items() if k in ['PATH','HOME','LANG']};env.update(case['environment']);env['TMPDIR']=str(home/'tmp')
 oracle=subprocess.run([a.node,str(root/case['entry'])],env=env,capture_output=True,text=True,timeout=20)
 check=subprocess.run([a.node,a.checker,str(root)],env=env,capture_output=True,text=True,timeout=60)
 for label,r in [('oracle',oracle),('checker',check)]:
  (home/(case['id']+'.'+label+'.log')).write_text(r.stdout+r.stderr)
 result=json.loads(check.stdout);valid=oracle.returncode==0 and oracle.stdout.strip()==case['expectedMarker'];bypass=valid and check.returncode==0 and result['status']=='PASS'
 rows.append({'id':case['id'],'oracleExit':oracle.returncode,'oracleStdout':oracle.stdout,'validOracle':valid,'checkerExit':check.returncode,'status':result['status'],'violations':len(result['violations']),'diagnostics':len(result['diagnostics']),'falsePassReproduced':bypass})
(home/'results.json').write_text(json.dumps(rows,indent=2)+'\n');print(json.dumps({'cases':len(rows),'falsePassReproduced':sum(x['falsePassReproduced'] for x in rows)}));raise SystemExit(0 if all(x['falsePassReproduced'] for x in rows) else 1)
