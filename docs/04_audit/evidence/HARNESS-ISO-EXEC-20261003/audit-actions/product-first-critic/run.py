import subprocess,json,sys,os,hashlib,time
from pathlib import Path
own=Path(__file__).parent
name=sys.argv[1];cmd=sys.argv[2:];env=dict(os.environ);env['PATH']='/home/ricardo/.nvm/versions/node/v22.23.2/bin:'+env['PATH'];env['TMPDIR']=str(own/'tmp');Path(env['TMPDIR']).mkdir(exist_ok=True)
t=time.time()
with (own/(name+'.log')).open('wb') as log:
 p=subprocess.run(cmd,cwd=own/'repo-fresh',env=env,stdout=log,stderr=subprocess.STDOUT)
r={'command':cmd,'cwd':str(own/'repo-fresh'),'exit':p.returncode,'elapsedSeconds':time.time()-t,'logSha256':hashlib.sha256((own/(name+'.log')).read_bytes()).hexdigest()};(own/(name+'.command.json')).write_text(json.dumps(r,indent=2));print(json.dumps(r));print((own/(name+'.log')).read_text(errors='replace')[-2200:]);sys.exit(p.returncode)
