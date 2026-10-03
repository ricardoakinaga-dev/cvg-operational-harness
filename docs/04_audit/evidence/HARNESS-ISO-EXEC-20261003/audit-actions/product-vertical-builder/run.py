import subprocess,json,sys,os,time
from pathlib import Path
ev=Path(__file__).resolve().parent
env=os.environ.copy();env['PATH']='/home/ricardo/.nvm/versions/node/v22.23.2/bin:'+env['PATH'];env['TMPDIR']='/home/ricardo/.cache/cvg-harness-audit-actions-20261003/product-vertical-builder'
name=sys.argv[1];cmd=sys.argv[2:];start=time.time()
with (ev/(name+'.log')).open('w') as f:
 f.write('COMMAND '+json.dumps(cmd)+'\n');f.flush();p=subprocess.run(cmd,cwd='/home/ricardo/.cache/cvg-harness-audit-actions-20261003/product-candidate',env=env,stdout=f,stderr=subprocess.STDOUT)
 f.write('\nEXIT_SENTINEL '+str(p.returncode)+'\n')
record={'command':cmd,'exitCode':p.returncode,'durationSeconds':time.time()-start,'node':'22.23.2','log':name+'.log'}
(ev/(name+'.json')).write_text(json.dumps(record,indent=2)+'\n');print(json.dumps(record))
print((ev/(name+'.log')).read_text()[-4000:])
sys.exit(p.returncode)
