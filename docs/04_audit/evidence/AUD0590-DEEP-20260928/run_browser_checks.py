from pathlib import Path
import os, subprocess, json, time, uuid
base=Path('/tmp/cvg-aud0590-evidence-20260928');root=Path('/tmp/cvg-aud0590-20260928')
env={k:os.environ[k] for k in ['HOME','LANG','LC_ALL'] if k in os.environ}
env.update(PATH='/home/ricardo/.nvm/versions/node/v22.23.2/bin:/usr/local/bin:/usr/bin:/bin',TMPDIR=str(base/'tmp'),NODE_ENV='test',NO_COLOR='1',CI='1',CVG_API_PORT='3259',CVG_WEB_PORT='4199')
outputs=[]
for name,args,extra in [
 ('e2e-simulation',['npm','run','test:e2e'],{'PLAYWRIGHT_JSON_OUTPUT_NAME':str(base/'e2e-simulation-report.json'),'CI_RUN_ID':'run-aud0590-local-synthetic','CI_CANDIDATE_ID':'8a0b52f1cbb706535f341683b69097f63cecb381273ccb3cdc6c3d3f2d8b2fca','CVG_E2E_EXECUTION_ID':str(uuid.uuid4())}),
 ('browser-trusted',['npm','run','test:e2e:rem21-014'],{'REM21_014_REPORT_PATH':str(base/'browser-trusted-report.json'),'REM21_014_RUN_ID':'run-aud0590-local-trusted'})]:
 current=env.copy();current.update(extra);start=time.time()
 with (base/(name+'.log')).open('w') as log:
  try:r=subprocess.run(args,cwd=root,env=current,stdout=log,stderr=subprocess.STDOUT,timeout=600);code=r.returncode
  except subprocess.TimeoutExpired:code=124
 rec={'name':name,'argv':args,'exit_code':code,'seconds':round(time.time()-start,2),'node':'22.23.2','scope':'synthetic-local-only','log':name+'.log'}
 (base/(name+'.json')).write_text(json.dumps(rec,indent=2)+'\n');outputs.append(rec);print(json.dumps(rec),flush=True)
(base/'browser-checks.json').write_text(json.dumps(outputs,indent=2)+'\n')
