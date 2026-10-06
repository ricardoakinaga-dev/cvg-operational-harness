from pathlib import Path
import subprocess,os,json,time,signal
base=Path('/tmp/cvg-aud0591-20260930');repo=base/'repo';ev=base/'evidence';env={'HOME':os.environ['HOME'],'PATH':'/home/ricardo/.nvm/versions/node/v22.23.2/bin:/usr/local/bin:/usr/bin:/bin','LANG':'C.UTF-8','NODE_ENV':'test','CVG_API_PORT':'3251','CVG_WEB_PORT':'4251','CI':'1'}
results=[]
for name in ['simulation','trusted']:
 args=['node','node_modules/@playwright/test/cli.js','test','--config=playwright.aud0591-'+name+'.config.ts','--output='+str(ev/('browser-'+name+'-results')),'--retries=0'];runenv={**env,'PLAYWRIGHT_JSON_OUTPUT_NAME':str(ev/('browser-'+name+'-raw.json'))};start=time.time()
 with (ev/('browser-'+name+'.log')).open('w') as f:
  proc=subprocess.Popen(args,cwd=repo,env=runenv,stdout=f,stderr=subprocess.STDOUT,start_new_session=True)
  try:code=proc.wait(timeout=420)
  except subprocess.TimeoutExpired:os.killpg(proc.pid,signal.SIGTERM);code=124
 row={'check':'browser-'+name,'command':args,'exitCode':code,'durationSeconds':round(time.time()-start,2),'data':'synthetic','externalServices':False,'adaptation':'loopback fixture; memory session; no retries'};results.append(row);(ev/('browser-'+name+'.json')).write_text(json.dumps(row,indent=2));print(row,flush=True)
(ev/'browser-checks.json').write_text(json.dumps(results,indent=2))
