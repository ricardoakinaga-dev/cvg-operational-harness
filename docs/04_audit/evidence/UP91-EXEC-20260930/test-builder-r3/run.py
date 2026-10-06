from pathlib import Path
import subprocess,os,json,sys,time
base=Path('/tmp/cvg-up91-exec-20260930/test-builder-r3')
repo=Path('/tmp/cvg-up91-exec-20260930/repo')
node='/home/ricardo/.nvm/versions/node/v22.23.2/bin/node'
env=dict(os.environ,PATH=str(Path(node).parent)+':'+os.environ['PATH'])
label=sys.argv[1]; args=sys.argv[2:]
start=time.time()
with (base/(label+'.log')).open('w') as out:
 result=subprocess.run([node,*args],cwd=repo,env=env,stdout=out,stderr=subprocess.STDOUT)
meta={'command':[node,*args],'cwd':str(repo),'exit_code':result.returncode,'duration_seconds':round(time.time()-start,3)}
(base/(label+'.command.json')).write_text(json.dumps(meta,indent=2)+'\n')
print(json.dumps(meta))
print((base/(label+'.log')).read_text()[-6500:])
sys.exit(result.returncode)
