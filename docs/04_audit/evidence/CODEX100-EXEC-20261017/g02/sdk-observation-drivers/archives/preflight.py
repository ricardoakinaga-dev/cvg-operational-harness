from pathlib import Path
import os,json,hashlib,subprocess,select,time,uuid,shutil
from datetime import datetime,timezone
R=Path('/home/ricardo/Área de trabalho/cvg-operational-harness');E=R/'docs/04_audit/evidence/CODEX100-EXEC-20261017';P=E/'g02/sdk-observation-drivers';N=Path('/tmp/cvg-codex100-exec-20261017/sdk-observation-drivers')
def save(n,j):(P/n).write_text(json.dumps(j,ensure_ascii=False,indent=2)+'\n')
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
attempt='primitive-'+uuid.uuid4().hex[:12];A=N/'attempts'/attempt;A.mkdir(mode=0o700)
assert not (P/'namespace-primitive.json').exists(),'One recorded preflight; no automatic rerun'
unit='cvg-codex100-sdkdiag-'+attempt+'.service';uid=os.getuid();fifo=A/'fifo';fifo.mkdir(mode=0o700);fds={}
for role in ['driver','adapter','peer']:
 for suffix in ['events','control']:
  p=fifo/(role+'.'+suffix);os.mkfifo(p,0o600);fd=os.open(p,os.O_RDWR|os.O_NONBLOCK|os.O_CLOEXEC);fds[p.name]=fd
probe=P/'python/admission-probe.py';py=Path('/usr/bin/python3.12');node=Path(shutil.which('node')).resolve()
sentinel=A/'host-sentinel';sentinel.write_text('SYNTHETIC_PRIVATE_SENTINEL_ONLY\n')
bwrap=['/usr/bin/bwrap','--unshare-all','--uid','0','--gid','0','--new-session','--die-with-parent','--clearenv','--dir','/runtime','--dir','/usr/lib','--dir','/usr/lib64','--symlink','usr/lib','/lib','--symlink','usr/lib64','/lib64','--ro-bind',str(py),'/runtime/python','--ro-bind',str(node),'/runtime/node','--ro-bind','/usr/lib/python3.12','/usr/lib/python3.12','--ro-bind','/usr/lib/x86_64-linux-gnu','/usr/lib/x86_64-linux-gnu','--ro-bind','/usr/lib/locale','/usr/lib/locale','--ro-bind','/usr/lib/x86_64-linux-gnu/ld-linux-x86-64.so.2','/usr/lib64/ld-linux-x86-64.so.2','--ro-bind',str(probe),'/profile/admission-probe.py','--dir','/observer','--proc','/proc','--dev','/dev','--size','67108864','--tmpfs','/work','--dir','/work/home','--dir','/work/tmp','--chdir','/work']
for name in fds:bwrap+=['--ro-bind',str(fifo/name),'/observer/'+name]
for k,v in {'HOME':'/work/home','TMPDIR':'/work/tmp','PATH':'/runtime','LANG':'C.UTF-8','LC_ALL':'C.UTF-8','TZ':'UTC','PYTHONDONTWRITEBYTECODE':'1'}.items():bwrap+=['--setenv',k,v]
bwrap+=['--remount-ro','/','--','/runtime/python','-I','-S','/profile/admission-probe.py',os.readlink('/proc/self/ns/net'),str(sentinel),f'/run/user/{uid}/bus']
props={'MemoryMax':'536870912','TasksMax':'32','CPUQuota':'100%','RuntimeMaxSec':'45','KillMode':'control-group','TimeoutStopSec':'3','NoNewPrivileges':'yes','LimitNOFILE':'128','LimitFSIZE':'8388608','LimitCORE':'0'}
cmd=['/usr/bin/systemd-run','--user','--quiet','--unit',unit,'--wait','--pipe','--collect']
for k,v in props.items():cmd+=['--property',k+'='+v]
cmd+=['--',*bwrap]
env={'PATH':'/usr/bin:/bin','HOME':str(Path.home()),'LANG':'C.UTF-8','XDG_RUNTIME_DIR':f'/run/user/{uid}','DBUS_SESSION_BUS_ADDRESS':f'unix:path=/run/user/{uid}/bus'}
save('namespace-primitive-command.json',{'attempt':attempt,'unit':unit,'command':cmd,'service_properties':props,'probe_sha256':digest(probe),'FIFO_host_stats':{n:{'dev':str(os.stat(fifo/n).st_dev),'ino':str(os.stat(fifo/n).st_ino),'uid':uid,'mode':'0600'} for n in fds},'target':'Own constant diagnostic only; no SDK/compiler/dependency code execution.','before_launch':datetime.now(timezone.utc).isoformat()})
start=time.monotonic();proc=subprocess.Popen(cmd,stdout=subprocess.PIPE,stderr=subprocess.PIPE,env=env,start_new_session=True);raw=b'';witness=None;error=None
try:
 while b'BWRAP_FIFO_READY\n' not in raw and proc.poll() is None:
  if time.monotonic()-start>20:raise TimeoutError('no primitive READY within20s')
  if select.select([fds['driver.events']],[],[],.1)[0]:raw+=os.read(fds['driver.events'],4096)
 if b'BWRAP_FIFO_READY\n' in raw:
  fields=['Id','MainPID','ControlGroup','MemoryMax','TasksMax','CPUQuotaPerSecUSec','RuntimeMaxUSec','TimeoutStopUSec','NoNewPrivileges','KillMode']
  c=subprocess.run(['/usr/bin/systemctl','--user','show',unit,*[arg for k in fields for arg in ['-p',k]]],capture_output=True,text=True,env=env,timeout=5);assert c.returncode==0,c.stderr
  values=dict(line.split('=',1) for line in c.stdout.splitlines());pid=int(values['MainPID']);cg=Path('/sys/fs/cgroup'+values['ControlGroup']);assert pid>0
  witness={'properties':values,'mainPID_startticks':Path(f'/proc/{pid}/stat').read_text().rsplit(')',1)[1].split()[19],'cgroup_before_release':{n:(cg/n).read_text() for n in ['cgroup.events','memory.max','pids.max','cpu.max']}}
  assert witness['cgroup_before_release']['memory.max'].strip()=='536870912' and witness['cgroup_before_release']['pids.max'].strip()=='32'
  assert witness['cgroup_before_release']['cpu.max'].split()[0]==witness['cgroup_before_release']['cpu.max'].split()[1]
  os.write(fds['driver.control'],b'GO\n')
 out,err=proc.communicate(timeout=max(1,50-(time.monotonic()-start)))
except Exception as exc:
 error={'type':type(exc).__name__,'error':str(exc)}
 # Only this unique owned service may be stopped. A recorded MainPID binding is retained if present.
 subprocess.run(['/usr/bin/systemctl','--user','stop',unit],env=env,capture_output=True,timeout=8)
 try:out,err=proc.communicate(timeout=5)
 except subprocess.TimeoutExpired:proc.kill();out,err=proc.communicate(timeout=3)
while select.select([fds['driver.events']],[],[],0)[0]:
 try:
  more=os.read(fds['driver.events'],4096)
  if not more:break
  raw+=more
 except BlockingIOError:break
for fd in fds.values():os.close(fd)
cg_path=Path('/sys/fs/cgroup'+witness['properties']['ControlGroup']) if witness else None
cg_after='REMOVED' if cg_path and not cg_path.exists() else ((cg_path/'cgroup.events').read_text() if cg_path else 'NO_READY_CGROUP_WITNESS')
c=subprocess.run(['/usr/bin/systemctl','--user','show',unit,'-p','LoadState','-p','ActiveState'],env=env,capture_output=True,text=True,timeout=5)
result={'kind':'EXECUTED_CONSTANT_CONTAINMENT_PRIMITIVE','attempt':attempt,'unit':unit,'exit_status':proc.returncode,'stdout':out.decode(errors='replace'),'stderr':err.decode(errors='replace'),'FIFO_raw':raw.decode(errors='replace'),'error':error,'witness':witness,'cgroup_after':cg_after,'unit_after':c.stdout,'elapsed_seconds':time.monotonic()-start,'SDK_imports':0,'compiler_imports':0}
result['status']='PASS_PRIMITIVE_ONLY' if proc.returncode==0 and error is None and witness and b'BWRAP_FIFO_END\n' in raw and (cg_after=='REMOVED' or 'populated 0' in cg_after) else 'ADMISSION_FAILED_NO_FALLBACK'
save('namespace-primitive.json',result);print(json.dumps(result,ensure_ascii=False,indent=2));raise SystemExit(0 if result['status']=='PASS_PRIMITIVE_ONLY' else 1)
