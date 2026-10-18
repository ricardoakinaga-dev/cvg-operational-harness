from pathlib import Path
import subprocess,sys,os,json,hashlib,datetime,time,shlex
b=Path('/tmp/cvg-pare100-exec-20261014-6az3hlay');s=b/'critic-boundary-215-build-r1-scratch';r=b/'critic-boundary-215-build-r1-result'
name=sys.argv[1];argv=sys.argv[2:];env=os.environ.copy();delta={'TMPDIR':str(s/'tmp'),'PATH':'/home/ricardo/.nvm/versions/node/v22.23.2/bin:'+env.get('PATH',''),'CVG_TEST_SCOPE':'core'};env.update(delta)
t=datetime.datetime.now(datetime.timezone.utc).isoformat();start=time.monotonic()
with (r/(name+'.raw.log')).open('wb') as f:
 p=subprocess.run(argv,cwd=s/'candidate',env=env,stdout=f,stderr=subprocess.STDOUT)
raw=(r/(name+'.raw.log')).read_bytes();record={'name':name,'argv':argv,'shell':shlex.join(argv),'cwd':str(s/'candidate'),'envDelta':delta,'startedAt':t,'durationSeconds':time.monotonic()-start,'exit':p.returncode,'rawLog':name+'.raw.log','sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw)}
(r/(name+'.metadata.json')).write_text(json.dumps(record,indent=2)+'\n');print(json.dumps(record));print(raw.decode(errors='replace')[-3500:]);sys.exit(p.returncode)
