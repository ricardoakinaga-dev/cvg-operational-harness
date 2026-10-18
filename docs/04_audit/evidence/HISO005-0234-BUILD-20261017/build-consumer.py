from pathlib import Path
import subprocess,json,time
root=Path('/tmp/cvg-hiso005-0234-20261017/without-product-r1')
ev=Path('/home/ricardo/Área de trabalho/cvg-operational-harness/docs/04_audit/evidence/HISO005-0234-BUILD-20261017')
commands=[]
with (ev/'consumer-build.log').open('w') as log:
 for workspace in ['packages/sdk','packages/persistence','packages/channel-gateway','packages/model-gateway']:
  argv=['/home/ricardo/.nvm/versions/node/v22.23.2/bin/node','scripts/build-public-workspace.mjs',workspace]
  start=time.time();p=subprocess.run(argv,cwd=root,stdout=log,stderr=subprocess.STDOUT)
  commands.append({'argv':argv,'exitCode':p.returncode,'elapsedSeconds':round(time.time()-start,3)})
  if p.returncode:break
 if all(c['exitCode']==0 for c in commands):
  argv=['/home/ricardo/.nvm/versions/node/v22.23.2/bin/node','node_modules/typescript/bin/tsc','-p','audit-consumer/tsconfig.json']
  start=time.time();p=subprocess.run(argv,cwd=root,stdout=log,stderr=subprocess.STDOUT)
  commands.append({'argv':argv,'exitCode':p.returncode,'elapsedSeconds':round(time.time()-start,3)})
success=len(commands)==5 and all(c['exitCode']==0 for c in commands)
(ev/'consumer-build-receipt.json').write_text(json.dumps({'cwd':str(root),'sourceCommit':'b7032f8245fbfbec5570c585518172de9ab7f075','commands':commands,'status':'PASS' if success else 'FAIL','previousInvocation':'Inline wrapper syntax error before execution; corrected into this persisted script. No compile or result from that invocation.'},indent=2)+'\n')
print(json.dumps(commands));raise SystemExit(0 if success else 1)
