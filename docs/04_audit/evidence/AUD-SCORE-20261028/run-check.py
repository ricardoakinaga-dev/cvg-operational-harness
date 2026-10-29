import subprocess,os,sys,json,time,datetime
from pathlib import Path
root=Path('/mnt/dados/cvg-work/aud-score-20261028'); source=root/'source'
name=sys.argv[1]; timeout=int(sys.argv[2]); cmd=sys.argv[3:]
env={k:v for k,v in os.environ.items() if k in ['HOME','USER','LOGNAME','LANG','LC_ALL','DISPLAY']};env.update(PATH='/home/ricardo/.nvm/versions/node/v22.23.2/bin:/usr/local/bin:/usr/bin:/bin',NODE_ENV='test',TMPDIR=str(root/'tmp'),NPM_CONFIG_CACHE=str(root/'npm-cache'))
(root/'tmp').mkdir(exist_ok=True)
start=time.monotonic(); record={'name':name,'command':cmd,'revision':'61e5cf8f41d15cc41ad524f8a57476d4f6080131','cwd':str(source),'started_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'node':'22.23.2','timeout_seconds':timeout}
with (root/(name+'.log')).open('wb') as log:
 try:r=subprocess.run(cmd,cwd=source,env=env,stdout=log,stderr=subprocess.STDOUT,timeout=timeout);record.update(exit_code=r.returncode,timed_out=False)
 except subprocess.TimeoutExpired:record.update(exit_code=None,timed_out=True)
record.update(duration_seconds=round(time.monotonic()-start,3));(root/(name+'.json')).write_text(json.dumps(record,indent=2));print(json.dumps(record))
sys.exit(0 if record['exit_code']==0 else 1)
