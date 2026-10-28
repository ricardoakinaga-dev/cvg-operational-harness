import pathlib,subprocess,json,time,sys,hashlib,datetime
r=pathlib.Path('/mnt/dados/cvg-work/aud0625-debian13-codex-20261028');mode=sys.argv[1];task='AUD0625-DEBIAN13-CODEX-20261028';name='cvg-aud0625-d13-final-'+mode
image=('node:22.23.2-bookworm-slim@sha256:48e4b67d85f87bd551df43704e24d252f56cc5f8e9718841aace50f19948f0f9' if mode=='reference' else 'cvg-aud0625-debian13-codex@sha256:1751d6a8e4b88fd09e09f147a8cfa96534936a2edf8d79ce4dc10ea5ec495fcc')
helper=r/('heartbeat.mjs' if mode=='heartbeat' else 'inventory.mjs');cid=None;end=None;failed=None
rec={'task':task,'mode':mode,'name':name,'image':image,'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'helper_sha256':hashlib.sha256(helper.read_bytes()).hexdigest(),'setup_create_cap':60,'native_phase_cap':60,'admission':'qa-diagnostic-readmission.json + DF9007; no automatic retry'}
def run(cmd,cap=10):return subprocess.run(cmd,capture_output=True,timeout=min(cap,max(.05,end-time.monotonic())) if end else cap)
def inspect():
 p=run(['docker','container','inspect',cid]);assert p.returncode==0;d=json.loads(p.stdout)[0];assert d['Id']==cid and d['Name']=='/'+name and d['Config']['Labels'].get('cvg.task')==task and d['Config']['Image']==image;return d
try:
 cmd=['docker','create','--pull=never','--platform','linux/amd64','--name',name,'--label','cvg.task='+task,'--network','none','--read-only','--user','10001:10001','--cap-drop','ALL','--security-opt','no-new-privileges','--pids-limit','128','--memory','512m','--cpus','1','--tmpfs','/tmp:rw,noexec,nosuid,size=16m','--mount','type=bind,src='+str(helper)+',dst=/cvg-qa.mjs,readonly','--entrypoint','/usr/local/bin/node',image,'/cvg-qa.mjs']
 t=time.monotonic();p=run(cmd,60);rec['create_duration']=time.monotonic()-t;assert p.returncode==0,p.stderr.decode();cid=p.stdout.decode().strip();rec['id']=cid
 t=time.monotonic();end=t+60;d=inspect();rec['initial_state']=d['State'];rec['image_id']=d['Image'];rec['hardening']={k:d['HostConfig'][k] for k in ['ReadonlyRootfs','NetworkMode','CapDrop','SecurityOpt','PidsLimit','Memory','NanoCpus','Tmpfs']};rec['user']=d['Config']['User'];assert not d['State']['Running'] and d['State']['Pid']==0
 p=run(['docker','start','--attach',cid],45);(r/('final-'+mode+'.stdout')).write_bytes(p.stdout);(r/('final-'+mode+'.stderr')).write_bytes(p.stderr);d=inspect();rec['app_duration']=time.monotonic()-t;rec['exit']=d['State']['ExitCode'];assert p.returncode==0 and not d['State']['Running'] and d['State']['ExitCode']==0,p.stderr.decode()[:2000]
 rows=[]
 for s in p.stdout.decode().splitlines():
  try:rows.append(json.loads(s))
  except json.JSONDecodeError:pass
 rec['results']=rows
 if mode=='heartbeat':assert any(x.get('status')=='PASS' and x.get('live')==0 and x.get('stale')==1 and x.get('missing')==1 and x.get('absentAgain')==1 for x in rows)
 else:assert any(x.get('kind')=='c26-runtime-inventory' and x.get('uid')==10001 for x in rows)
 rec['status']='PASS'
except BaseException as e:failed=e;rec['status']='FAIL';rec['error']=repr(e)
finally:
 if cid:
  try:
   d=inspect()
   if d['State']['Running']:
    run(['docker','stop','--time','2',cid],5)
    if inspect()['State']['Running']:run(['docker','kill',cid],3)
   p=run(['docker','rm',cid],5);rec['remove_exit']=p.returncode;assert p.returncode==0
   p=run(['docker','container','inspect',cid],3);rec['removed_absent']=p.returncode!=0 and b'No such' in p.stderr;assert rec['removed_absent']
  except BaseException as e:failed=failed or e;rec['status']='FAIL';rec['cleanup_error']=repr(e)
 if end:
  rec['native_phase_duration']=time.monotonic()-(end-60)
  if rec['native_phase_duration']>=60:failed=failed or RuntimeError('phase deadline');rec['status']='FAIL'
 (r/('final-'+mode+'.json')).write_text(json.dumps(rec,indent=2)+'\n')
print(json.dumps({k:v for k,v in rec.items() if k not in ['results','initial_state']}));sys.exit(1 if failed else 0)
