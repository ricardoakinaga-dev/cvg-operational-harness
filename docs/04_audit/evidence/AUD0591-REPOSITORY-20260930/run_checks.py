from pathlib import Path
import os,subprocess,time,json,concurrent.futures,signal
base=Path('/tmp/cvg-aud0591-20260930');repo=base/'repo';ev=base/'evidence';
env={'HOME':os.environ['HOME'],'PATH':'/home/ricardo/.nvm/versions/node/v22.23.2/bin:/usr/local/bin:/usr/bin:/bin','LANG':'C.UTF-8','NODE_ENV':'test','TEST_DATABASE_URL':'postgres://cvg_audit:cvg_synthetic_audit_only@127.0.0.1:55591/cvg_audit','AUD19_PG_REQUIRED':'1','PHASE4A_PG_REQUIRED':'1','PHASE4A_DISPOSABLE_PG':'1','CI':'1'}
checks=[('preflight',['node','scripts/node-version-preflight.mjs']),('typecheck',['npm','run','typecheck']),('lint',['npm','run','lint']),('docs-links',['npm','run','docs:check-links']),('skip-governance',['npm','run','skip:governance']),('npm-audit',['npm','audit','--json']),('workspace-boundaries',['node','scripts/workspace-dependency-audit.mjs'])]
def run(item):
 name,args=item;start=time.time();log=ev/(name+'.log')
 with log.open('w') as f:
  try:proc=subprocess.Popen(args,cwd=repo,env=env,stdout=f,stderr=subprocess.STDOUT,start_new_session=True);code=proc.wait(timeout=900)
  except subprocess.TimeoutExpired:
   os.killpg(proc.pid,signal.SIGTERM);proc.wait(timeout=15);code=124
 result={'check':name,'command':args,'cwd':str(repo),'exitCode':code,'durationSeconds':round(time.time()-start,3),'log':log.name,'node':'22.23.2','environment':'isolated-synthetic'};(ev/(name+'.json')).write_text(json.dumps(result,indent=2));print(json.dumps(result),flush=True);return result
results=[] # Initial static checks already captured; preserve them.
for name,args in [('unit-postgres',['npm','test']),('coverage',['npm','run','test:coverage']),('postgres-gate',['npm','run','test:postgres']),('critical-coverage',['npm','run','coverage:critical']),('build',['npm','run','build']),('build-runtime',['npm','run','build:runtime'])]:results.append(run((name,args)))
(ev/'checks.json').write_text(json.dumps(results,indent=2))
