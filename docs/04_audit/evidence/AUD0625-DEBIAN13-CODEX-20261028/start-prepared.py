from pathlib import Path
import subprocess,sys,json,time,hashlib,datetime
r=Path('/mnt/dados/cvg-work/aud0625-debian13-codex-20261028');mode=sys.argv[1];task='AUD0625-DEBIAN13-CODEX-20261028'
name='cvg-aud0625-d13-'+('inventory-amd64' if mode=='inventory' else mode)
frozen=json.loads((r/'recovered-own-container-custody.json').read_text());row=next(x for x in frozen['containers'] if x['name']==name);cid=row['id']
start=time.monotonic();end=start+60;rec={'kind':'first-native-APP-phase-after-late-setup-custody-recovery','task':task,'mode':mode,'id':cid,'name':name,'started_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'absolute_cap_seconds':60,'old_setup':'Preserved NOT_ADMITTED; nativePid0/neverStarted before this phase.'};failure=None
def run(args,cap=10,**kw):return subprocess.run(args,capture_output=True,timeout=min(cap,max(.05,end-time.monotonic())),**kw)
def inspect():
 p=run(['docker','container','inspect',cid]);assert p.returncode==0;d=json.loads(p.stdout)[0];assert d['Id']==cid and d['Name']=='/'+name and d['Config']['Labels'].get('cvg.task')==task and d['Image']==row['image'] and d['Config']['Image']==row['config_image'] and d['Created']==row['created'];return d
try:
 d=inspect();assert not d['State']['Running'] and d['State']['Pid']==0 and d['State']['StartedAt'].startswith('0001-')
 h=d['HostConfig'];assert d['Config']['User']=='10001:10001' and h['NetworkMode']=='none' and h['ReadonlyRootfs'] and h['CapDrop']==['ALL'] and 'no-new-privileges' in h['SecurityOpt'] and h['PidsLimit']==128 and h['Memory']==536870912 and h['NanoCpus']==1000000000
 rec['admission']={'never_started':True,'image':d['Image'],'created':d['Created'],'hardening_verified':True,'source':d['Config']['Image']}
 helper={'inventory':'inventory.mjs','tls-probe':'tls-probe.mjs','heartbeat':'heartbeat.mjs'}.get(mode)
 if helper:rec['helper_sha256']=hashlib.sha256((r/helper).read_bytes()).hexdigest()
 payload=None
 if mode=='tls-probe':
  p=r/'tls-fixtures';payload=json.dumps({key:(p/file).read_text() for key,file in [('ca','ca.crt'),('otherCa','other-ca.crt'),('key','leaf.key'),('leaf','leaf.crt'),('expired','expired.crt')]}).encode()
 cap={'inventory':20,'api':30,'worker':15,'tls-probe':35,'heartbeat':15}[mode]
 p=run(['docker','start','--attach',*(['--interactive'] if payload else []),cid],cap,input=payload)
 (r/('first-app-'+mode+'.stdout')).write_bytes(p.stdout);(r/('first-app-'+mode+'.stderr')).write_bytes(p.stderr)
 d=inspect();rec.update(cli_exit=p.returncode,container_exit=d['State']['ExitCode'],running=d['State']['Running']);assert p.returncode==0 and d['State']['ExitCode']==0 and not d['State']['Running']
 results=[]
 for line in p.stdout.decode().splitlines():
  try:results.append(json.loads(line))
  except json.JSONDecodeError:pass
 rec['results']=results
 if mode=='inventory':assert any(x.get('kind')=='c26-runtime-inventory' and x.get('uid')==10001 for x in results)
 elif mode=='api':assert any(x.get('status')=='PASS' and x.get('live')==200 and x.get('ready')==200 and x.get('sourceIncluded') is False for x in results)
 elif mode=='worker':assert any(x.get('event')=='worker.controlled_smoke_passed' and x.get('adapter')=='controlled-memory' and x.get('processed')==1 and x.get('durable') is False and x.get('externalEffects') is False for x in results)
 else:assert any(x.get('status')=='PASS' for x in results)
 rec['status']='PASS'
except BaseException as e:
 failure=e;rec['status']='FAIL';rec['error']=repr(e)
 if isinstance(e,subprocess.TimeoutExpired):
  (r/('first-app-'+mode+'.timeout-stdout')).write_bytes(e.stdout or b'');(r/('first-app-'+mode+'.timeout-stderr')).write_bytes(e.stderr or b'')
finally:
 try:
  d=inspect()
  if d['State']['Running']:
   rec['cleanup_stop']=run(['docker','stop','--time','2',cid],5).returncode
   if inspect()['State']['Running']:rec['cleanup_kill']=run(['docker','kill',cid],3).returncode
  rec['cleanup_remove']=run(['docker','rm',cid],5).returncode;check=run(['docker','container','inspect',cid],3);rec['removed_absent']=check.returncode!=0 and 'No such' in check.stderr.decode();assert rec['cleanup_remove']==0 and rec['removed_absent']
 except BaseException as e:failure=failure or e;rec['cleanup_error']=repr(e);rec['status']='FAIL'
 rec['duration_seconds']=time.monotonic()-start
 if rec['duration_seconds']>=60:failure=failure or RuntimeError('absolute phase deadline');rec['status']='FAIL'
 (r/('first-app-'+mode+'.json')).write_text(json.dumps(rec,indent=2)+'\n')
print(json.dumps({k:v for k,v in rec.items() if k!='results'}));sys.exit(1 if failure else 0)
