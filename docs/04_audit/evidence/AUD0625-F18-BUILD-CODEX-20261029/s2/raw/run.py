import subprocess,os,sys,json,time,datetime,signal
from pathlib import Path
root=Path('/mnt/dados/cvg-work/aud0625-f18-build-codex-20261029');name=sys.argv[1];cap=int(sys.argv[2]);cmd=sys.argv[3:]
for d in ['home','tmp','cache','docker-config']:(root/d).mkdir(exist_ok=True)
env={k:v for k,v in os.environ.items() if k in ['LANG','LC_ALL','TZ']};env.update(PATH='/home/ricardo/.nvm/versions/node/v22.23.2/bin:/usr/local/bin:/usr/bin:/bin',HOME=str(root/'home'),TMPDIR=str(root/'tmp'),XDG_CACHE_HOME=str(root/'cache'),DOCKER_CONFIG=str(root/'docker-config'),NPM_CONFIG_CACHE=str(root/'cache/npm'),CVG_AUD0625_FIXTURE_ROOT=str(root/'fixtures'))
record={'task':'AUD0625-F18-BUILD-CODEX-20261029','name':name,'command':cmd,'timeout_seconds':cap,'started_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'cwd':str(root/'candidate')};start=time.monotonic()
with (root/(name+'.log')).open('wb') as log:
 p=subprocess.Popen(cmd,cwd=root/'candidate',env=env,stdout=log,stderr=subprocess.STDOUT,start_new_session=True);record['pid']=p.pid
 try:record['exit_code']=p.wait(timeout=cap);record['timed_out']=False
 except subprocess.TimeoutExpired:
  record['timed_out']=True;os.killpg(p.pid,signal.SIGTERM)
  try:p.wait(timeout=2)
  except subprocess.TimeoutExpired:os.killpg(p.pid,signal.SIGKILL);p.wait(timeout=2)
  record['exit_code']=p.returncode
record['duration_seconds']=round(time.monotonic()-start,3);record['reaped']=p.poll() is not None;(root/(name+'.json')).write_text(json.dumps(record,indent=2)+'\n');print(json.dumps(record));sys.exit(0 if record['exit_code']==0 and not record['timed_out'] else 1)
