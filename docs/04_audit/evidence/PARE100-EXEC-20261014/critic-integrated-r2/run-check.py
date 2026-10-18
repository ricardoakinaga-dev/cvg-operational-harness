import subprocess,os,sys,json,time,hashlib,datetime
from pathlib import Path
base=Path('/tmp/cvg-pare100-exec-20261014-6az3hlay'); result=base/'critic-integrated-r2-result'; scratch=base/'critic-integrated-r2-scratch'
label=sys.argv[1]; argv=sys.argv[2:]; out=result/'checks'/label
assert not out.exists(); out.mkdir()
env=os.environ.copy(); env['PATH']='/home/ricardo/.nvm/versions/node/v22.23.2/bin:'+env['PATH']; env['HOME']=str(result/'home');env['TMPDIR']=str(result/'tmp'); env['CI']='1'
start=time.monotonic(); meta={'argv':argv,'cwd':str(scratch),'env':{k:env[k] for k in ['PATH','HOME','TMPDIR','CI']},'started_utc':datetime.datetime.now(datetime.timezone.utc).isoformat()}
(out/'invocation.json').write_text(json.dumps(meta,indent=2)+'\n')
with (out/'stdout.log').open('wb') as stdout,(out/'stderr.log').open('wb') as stderr:
    r=subprocess.run(argv,cwd=scratch,env=env,stdout=stdout,stderr=stderr)
meta.update(exit=r.returncode,duration_s=round(time.monotonic()-start,3),finished_utc=datetime.datetime.now(datetime.timezone.utc).isoformat())
meta['artifacts']={f.name:{'bytes':f.stat().st_size,'sha256':hashlib.sha256(f.read_bytes()).hexdigest()} for f in [out/'stdout.log',out/'stderr.log']}
(out/'result.json').write_text(json.dumps(meta,indent=2)+'\n');print(json.dumps({'check':label,'exit':r.returncode,'duration_s':meta['duration_s']}))
sys.exit(r.returncode)
