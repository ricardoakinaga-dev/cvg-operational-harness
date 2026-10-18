from pathlib import Path
import subprocess,sys,os,json,hashlib,datetime,time,shlex
b=Path('/tmp/cvg-pare100-exec-20261014-6az3hlay');s=b/'critic-boundary-215-build-r1-scratch';r=b/'critic-boundary-215-build-r1-result';cwd=s/'sealed-input-candidate'
name=sys.argv[1];argv=sys.argv[2:];env=os.environ.copy();delta={'TMPDIR':str(s/'tmp'),'PATH':'/home/ricardo/.nvm/versions/node/v22.23.2/bin:'+env.get('PATH',''),'CVG_TEST_SCOPE':'core'};env.update(delta)
def inventory():
 return {str(f.relative_to(cwd)):hashlib.sha256(f.read_bytes()).hexdigest() for f in sorted(cwd.rglob('*')) if f.is_file() and 'node_modules' not in f.parts}
before=inventory();start=time.monotonic();at=datetime.datetime.now(datetime.timezone.utc).isoformat()
with (r/(name+'.raw.log')).open('wb') as f:p=subprocess.run(argv,cwd=cwd,env=env,stdout=f,stderr=subprocess.STDOUT)
after=inventory();raw=(r/(name+'.raw.log')).read_bytes();record={'name':name,'argv':argv,'shell':shlex.join(argv),'cwd':str(cwd),'envDelta':delta,'startedAt':at,'durationSeconds':time.monotonic()-start,'exit':p.returncode,'rawLog':name+'.raw.log','sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw),'inputsBefore':before,'inputsAfter':after,'inputsUnchanged':before==after,'provenance':'sealed packet31 plus own declared procedural/config files; local dependency link; no supplemental legacy source files'}
(r/(name+'.metadata.json')).write_text(json.dumps(record,indent=2)+'\n');print(json.dumps({k:v for k,v in record.items() if k not in ['inputsBefore','inputsAfter','envDelta']}));print(raw.decode(errors='replace')[-1800:]);sys.exit(p.returncode)
