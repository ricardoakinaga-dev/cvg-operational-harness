import pathlib,subprocess,os,json,datetime
out=pathlib.Path(__file__).parent
snapshot=out.parent/'snapshot'
env=os.environ.copy()
env['PATH']='/home/ricardo/.nvm/versions/node/v22.23.2/bin:'+env.get('PATH','')
env.update(TEST_DATABASE_URL='postgres://hiso:hiso-synthetic-only@127.0.0.1:55594/hiso',AUD19_PG_REQUIRED='1',NODE_OPTIONS='--import='+str(out/'capture.mjs')+' --import='+str(out/'inject-health-delay.mjs'),TSX_DISABLE_CACHE='1',HOMOLOG_DIAG_INJECT='1',HOMOLOG_DIAG_CAPTURE=str(out/'injected'))
command=['node','node_modules/vitest/vitest.mjs','run','apps/worker/src/__tests__/operational-harness-homolog.integration.test.ts','-t','drains cleanly on SIGTERM with no work pending','--testTimeout=60000','--no-file-parallelism','--maxWorkers=1','--reporter=verbose']
start=datetime.datetime.now(datetime.timezone.utc).isoformat()
with (out/'injected.vitest.log').open('w') as log: r=subprocess.run(command,cwd=snapshot,env=env,stdout=log,stderr=subprocess.STDOUT,timeout=90)
result={'command':command,'cwd':str(snapshot),'node':'22.23.2','started':start,'finished':datetime.datetime.now(datetime.timezone.utc).isoformat(),'exitCode':r.returncode,'injection':'one queue probe delayed 50ms after startup preflight, real own PG; no source modification'}
(out/'injected-result.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result))
print((out/'injected.vitest.log').read_text())
