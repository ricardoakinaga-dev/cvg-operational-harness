import sys, subprocess, json, os, datetime
from pathlib import Path
base=Path('/tmp/cvg-pare100-exec-20261014-6az3hlay')
result=base/'critic-reference-result'
name=sys.argv[1]; args=sys.argv[2:]
env=dict(os.environ); env['PATH']='/home/ricardo/.nvm/versions/node/v22.23.2/bin:'+env['PATH']
started=datetime.datetime.now(datetime.timezone.utc).isoformat()
r=subprocess.run(args,cwd=base/'critic-reference-scratch/packet',env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
(result/(name+'.stdout.log')).write_bytes(r.stdout)
(result/(name+'.stderr.log')).write_bytes(r.stderr)
meta={'argv':args,'cwd':str(base/'critic-reference-scratch/packet'),'PATH_prefix':'/home/ricardo/.nvm/versions/node/v22.23.2/bin','started_utc':started,'exit_code':r.returncode,'stdout':str(result/(name+'.stdout.log')),'stderr':str(result/(name+'.stderr.log'))}
(result/(name+'.command.json')).write_text(json.dumps(meta,indent=2)+'\n')
print(json.dumps(meta));print(r.stdout.decode(errors='replace'));print(r.stderr.decode(errors='replace'),file=sys.stderr)
sys.exit(r.returncode)
