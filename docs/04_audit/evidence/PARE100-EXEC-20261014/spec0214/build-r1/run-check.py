import sys,subprocess,json,time,pathlib,os,hashlib
root=pathlib.Path.cwd()
evidence=root/'docs/04_audit/evidence/PARE100-EXEC-20261014/spec0214/build-r1'
label=sys.argv[1]; command=sys.argv[2:]
env=dict(os.environ); env['PATH']='/home/ricardo/.nvm/versions/node/v22.23.2/bin:'+env['PATH']; env['CVG_TEST_SCOPE']='core'
inputs=json.loads((evidence/'freeze-inputs.json').read_text())['files'] if (evidence/'freeze-inputs.json').exists() else {}
before={p:hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest() for p in inputs}
start=time.time()
with (evidence/(label+'.log')).open('w') as out:
 result=subprocess.run(command,stdout=out,stderr=subprocess.STDOUT,env=env)
after={p:hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest() for p in inputs}
record={'inputHashesStable':before==after,'matchesFrozenInputs':before==inputs,'inputSHA256':before,'command':command,'exitCode':result.returncode,'durationSeconds':time.time()-start,'node':'22.23.2','scope':'synthetic focused; no DB/network/install/cert/coverage','logSHA256':hashlib.sha256((evidence/(label+'.log')).read_bytes()).hexdigest()}
(evidence/(label+'.json')).write_text(json.dumps(record,indent=2)+'\n')
print(json.dumps(record))
sys.exit(result.returncode)
