import os, subprocess, json, hashlib, datetime, sys, pathlib, time
base=pathlib.Path('/tmp/cvg-pare100-exec-20261014-6az3hlay')
scratch=base/'critic-qa-ab-r2-scratch'; result=base/'critic-qa-ab-r2-result'
node='/home/ricardo/.nvm/versions/node/v22.23.2/bin/node'
env=os.environ.copy();env['PATH']=str(pathlib.Path(node).parent)+os.pathsep+env['PATH'];env['CVG_TEST_SCOPE']='core'
env.pop('CVG_REPLAY_RECORD_CASE',None);env.pop('CVG_REPLAY_FIXTURES_DIR',None)
def run(name,argv,timeout=60):
 start=datetime.datetime.now(datetime.timezone.utc).isoformat();t=time.monotonic()
 try:
  r=subprocess.run(argv,cwd=scratch,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=timeout);code=r.returncode;raw=r.stdout
 except subprocess.TimeoutExpired as e: code=124;raw=(e.stdout or b'')+b'\nCRITIC TIMEOUT\n'
 path=result/(name+'.log');path.write_bytes(raw)
 meta={'name':name,'cwd':str(scratch),'argv':argv,'env_overrides':{'PATH_prefix':str(pathlib.Path(node).parent),'CVG_TEST_SCOPE':'core'},'start':start,'end':datetime.datetime.now(datetime.timezone.utc).isoformat(),'duration_s':round(time.monotonic()-t,3),'exit':code,'raw_log':str(path),'raw_log_sha256':hashlib.sha256(raw).hexdigest()}
 (result/(name+'.command.json')).write_text(json.dumps(meta,indent=2)+'\n');print(json.dumps(meta),flush=True);return code,raw
if __name__=='__main__':
 if sys.argv[1]=='coverage':run('existing-coverage-thresholds',[node,'node_modules/vitest/vitest.mjs','run','tests/coverage-thresholds.test.js','--no-file-parallelism','--maxWorkers=1'])
 elif sys.argv[1]=='replay':run('existing-test-replay',[node,str(pathlib.Path(node).parent/'npm'),'run','test:replay'])
