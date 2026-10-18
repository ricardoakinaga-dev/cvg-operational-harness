import subprocess,os,pathlib,sys,json,hashlib,time
B=pathlib.Path('/tmp/cvg-pare100-exec-20261014-6az3hlay'); S=B/'critic-boundary-216-build-r1-scratch'; R=B/'critic-boundary-216-build-r1-result'
label=sys.argv[1]; argv=sys.argv[2:]; env=os.environ.copy();env.update(TMPDIR=os.environ.get('I1_TMPDIR',str(S/'i1-extra/tmp')),TMP=os.environ.get('I1_TMPDIR',str(S/'i1-extra/tmp')),TEMP=os.environ.get('I1_TMPDIR',str(S/'i1-extra/tmp')),PATH='/home/ricardo/.nvm/versions/node/v22.23.2/bin:'+env['PATH'],NO_COLOR='1')
start=time.time();log=R/'logs'/(label+'.log')
with log.open('wb') as output:p=subprocess.run(argv,cwd=S,env=env,stdout=output,stderr=subprocess.STDOUT)
p.stdout=log.read_bytes()
record={'label':label,'argv':argv,'cwd':str(S),'TMPDIR':env['TMPDIR'],'exit':p.returncode,'durationSeconds':time.time()-start,'log':str(log.relative_to(R)),'logSHA256':hashlib.sha256(p.stdout).hexdigest()}
with (R/'commands.jsonl').open('a') as f:f.write(json.dumps(record)+'\n')
print(json.dumps(record));print(p.stdout.decode(errors='replace')[-15000:]);sys.exit(p.returncode)
