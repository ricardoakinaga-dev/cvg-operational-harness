import pathlib, subprocess, os, json, datetime
out=pathlib.Path(__file__).parent
snapshot=out.parent/'snapshot'
env=os.environ.copy()
env['PATH']='/home/ricardo/.nvm/versions/node/v22.23.2/bin:'+env.get('PATH','')
env.update(TEST_DATABASE_URL='postgres://hiso:hiso-synthetic-only@127.0.0.1:55594/hiso',AUD19_PG_REQUIRED='1',NODE_OPTIONS='--import='+str(out/'capture.mjs'),TSX_DISABLE_CACHE='1')
command=['node','node_modules/vitest/vitest.mjs','run','apps/worker/src/__tests__/operational-harness-homolog.integration.test.ts','-t','drains cleanly on SIGTERM with no work pending','--testTimeout=60000','--no-file-parallelism','--maxWorkers=1','--reporter=verbose']
results=[]
for i in range(1,6):
 name=f'focused-{i}'
 env['HOMOLOG_DIAG_CAPTURE']=str(out/name)
 started=datetime.datetime.now(datetime.timezone.utc).isoformat()
 with (out/(name+'.vitest.log')).open('w') as log:
  result=subprocess.run(command,cwd=snapshot,env=env,stdout=log,stderr=subprocess.STDOUT,timeout=90)
 item={'name':name,'started':started,'finished':datetime.datetime.now(datetime.timezone.utc).isoformat(),'command':command,'cwd':str(snapshot),'node':'22.23.2','exitCode':result.returncode,'log':name+'.vitest.log','instrumentation':'passive child_process stream and signal capture; sources unchanged'}
 results.append(item)
 (out/'focused-results.json').write_text(json.dumps(results,indent=2)+'\n')
 print(json.dumps(item),flush=True)
 print('\n'.join((out/(name+'.vitest.log')).read_text().splitlines()[-14:]),flush=True)
