import os, subprocess, json, time, concurrent.futures
from pathlib import Path
base=Path('/tmp/cvg-aud0590-evidence-20260928'); root=Path('/tmp/cvg-aud0590-20260928')
env={k:os.environ[k] for k in ['HOME','LANG','LC_ALL'] if k in os.environ}
env.update(PATH='/home/ricardo/.nvm/versions/node/v22.23.2/bin:/usr/local/bin:/usr/bin:/bin',TMPDIR=str(base/'tmp'),NODE_ENV='test',NO_COLOR='1')
results=[]
def run(name,args,extra=None,timeout=420):
 e=env.copy();e.update(extra or {});start=time.time()
 with (base/(name+'.log')).open('w') as log:
  try: r=subprocess.run(args,cwd=root,env=e,stdout=log,stderr=subprocess.STDOUT,timeout=timeout);code=r.returncode
  except subprocess.TimeoutExpired: code=124
 rec={'name':name,'argv':args,'exit_code':code,'seconds':round(time.time()-start,2),'log':name+'.log','node':'22.23.2'}
 (base/(name+'.json')).write_text(json.dumps(rec,indent=2)+'\n')
 print(json.dumps(rec),flush=True);return rec
# Inspect certification before other checks can produce test artifacts.
results.append(run('certification-current',['node','scripts/phase10-verify.mjs']))
results.append(run('skip-governance',['node','scripts/skip-inventory.mjs','--verify']))
checks=[('node-preflight',['node','scripts/node-version-preflight.mjs']),('typecheck',['npm','run','typecheck']),('lint',['npm','run','lint']),('docs-links',['npm','run','docs:check-links']),('dependency-audit',['npm','audit','--json'])]
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as ex:
 for future in concurrent.futures.as_completed([ex.submit(run,*c) for c in checks]): results.append(future.result())
pg={'TEST_DATABASE_URL':'postgresql://postgres:cvg_aud0590_synthetic@127.0.0.1:55590/cvg_audit','AUD19_PG_REQUIRED':'1','PHASE4A_DISPOSABLE_PG':'1','PHASE4A_PG_REQUIRED':'1'}
ready=subprocess.run(['docker','exec','cvg-aud0590-pg','pg_isready','-U','postgres','-d','cvg_audit'],stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
(base/'postgres-ready.log').write_bytes(ready.stdout)
if ready.returncode:raise SystemExit('owned PG not ready')
results.append(run('full-coverage-postgres',['npm','run','test:coverage'],pg,900))
results.append(run('postgres-gate',['npm','run','test:postgres'],pg,600))
results.append(run('coverage-critical',['npm','run','coverage:critical']))
results.append(run('build-runtime',['npm','run','build:runtime']))
results.append(run('build-web',['npm','run','build:web']))
(base/'checks.json').write_text(json.dumps(results,indent=2)+'\n')
