from pathlib import Path
import subprocess,json,time
root=Path('/tmp/cvg-hiso005-integration-20261018/without-product-r4')
ev=Path('/home/ricardo/Área de trabalho/cvg-operational-harness/docs/04_audit/evidence/HISO005-P2-SPEC-20261018/build0236')
commands=[]
with (ev/'consumer-r4-build.log').open('w') as log:
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
(ev/'consumer-r4-build-receipt.json').write_text(json.dumps({'cwd':str(root),'sourceCommit':'75dfef50d0b5bc5a8063829ea4c63af8b4ab8b54','commands':commands,'status':'PASS' if success else 'FAIL','observerInstrumentation':'Fresh source/outputs; build procedure adapted from executed0234, not prior results.'},indent=2)+'\n')
print(json.dumps(commands));raise SystemExit(0 if success else 1)
