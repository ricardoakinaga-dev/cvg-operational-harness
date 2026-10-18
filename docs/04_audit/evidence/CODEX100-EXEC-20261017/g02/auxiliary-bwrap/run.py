from pathlib import Path
import json,os,hashlib,subprocess,time,shutil,uuid,signal
H=Path(__file__).resolve().parent; C=json.loads((H/'contract.json').read_text()); R=Path(C['resource_root'])/'attempt-2'; B=H.parent
E={'PATH':'/usr/bin:/bin','LANG':'C.UTF-8','XDG_RUNTIME_DIR':f'/run/user/{os.getuid()}','DBUS_SESSION_BUS_ADDRESS':f'unix:path=/run/user/{os.getuid()}/bus'}
def save(n,d): (H/n).write_text(json.dumps(d,indent=2)+'\n')
def sha(p):
 with Path(p).open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
def run(a,**kw):return subprocess.run(a,capture_output=True,env=E,timeout=30,**kw)
def need(x,s):
 if not x:raise RuntimeError(s)
def headroom(tag):
 q=run(['/usr/bin/systemctl','--user','show','cvg-codex100-ref-build-release-1a7b51ad27.scope','-p','ActiveState','-p','SubState','-p','MemoryCurrent','-p','LoadState'],text=True)
 data=dict(l.split('=',1) for l in q.stdout.splitlines() if '=' in l)
 active=data.get('ActiveState') in ['active','activating']; terminal=data.get('ActiveState') in ['inactive','failed'] or data.get('LoadState')=='not-found'
 need(active or terminal,'unknown CLI scope status')
 current=int(data['MemoryCurrent']) if active else 0
 mem=next(int(l.split()[1])*1024 for l in Path('/proc/meminfo').read_text().splitlines() if l.startswith('MemAvailable:'))
 remaining=max(0,19327352832-current) if active else 0; available=mem-remaining
 d={'tag':tag,'cli_stdout':q.stdout,'cli_stderr':q.stderr,'cli_exit':q.returncode,'cli_live':active,'cli_memory_current':current,'MemAvailable':mem,'CLI_remaining':remaining,'aggregate_headroom':available,'required':10737418240,'free_disk':shutil.disk_usage(R).free,'pass':available>=10737418240 and shutil.disk_usage(R).free>=16000000000};save('headroom-'+tag+'.json',d)
 need(d['pass'],'BLOCKED_RESOURCE')
def checkrows(root,rows):
 for r in rows:
  p=root/r['path'];kind=r.get('kind');link=kind=='SYMLINK' or r.get('git_mode')=='120000'
  if link:
   need(p.is_symlink() and p.resolve().is_relative_to(root.resolve()),'unsafe link '+str(p)); value=os.readlink(p)
   need(value==r['target'] if 'target' in r else hashlib.sha256(os.fsencode(value)).hexdigest()==r['sha256'],'link drift '+str(p))
  else:need(p.is_file() and not p.is_symlink() and sha(p)==r['sha256'],'input drift '+str(p))
def transient(rc,err):
 return rc==1 and bool(err.splitlines()) and all(l.partition(': cannot access ')[0] in ['du','/usr/bin/du'] and ': cannot access ' in l and l.endswith('No such file or directory') for l in err.splitlines())
def main():
 R.mkdir(exist_ok=False);headroom('retry2-initial')
 for r in C['input_identities']:need(sha(r['path'])==r['sha256'],'contract input drift '+r['path'])
 S=Path(C['readonly_source']);V=Path(C['readonly_vendor']);T=Path(C['readonly_toolchain']);N=Path(C['readonly_native_sysroot'])
 snap=json.loads((B/'locked-dependencies/source-snapshot.json').read_text());checkrows(S,snap['files'])
 native=json.loads((B/'native-prerequisites/combined/acquisition.json').read_text());checkrows(N,native['files'])
 need({str(p.relative_to(N)) for p in N.rglob('*') if p.is_file() or p.is_symlink()}=={r['path'] for r in native['files']},'native exact set drift')
 tools=json.loads((B/'reference-environment/toolchain-files.json').read_text());selected=[r for r in tools['files'] if r['path'].startswith('bin/') or r['path'].endswith('.so')];checkrows(T,selected)
 vendor=json.loads((B/'locked-dependencies/vendor-verification.json').read_text());idx=Path(vendor['file_registry']['path']);need(sha(idx)==vendor['file_registry']['sha256'],'vendor index drift');checkrows(V,json.loads(idx.read_text()))
 save('input-verification.json',{'contract_sha256':sha(H/'contract.json'),'source_count':len(snap['files']),'native_count':len(native['files']),'vendor_count':vendor['file_registry']['entries'],'toolchain_selected':selected,'inputs':C['input_identities'],'vendor_index_sha256':sha(idx),'native_files':native['files'],'source_matches_pin':C['pin'],'public_tools':[{'path':p,'resolved':str(Path(p).resolve()),'sha256':sha(p)} for p in ['/usr/bin/bwrap','/usr/bin/gcc','/usr/bin/g++','/usr/bin/ld','/usr/bin/as','/usr/bin/ar','/usr/bin/pkg-config',*[str(x) for x in Path('/usr/lib/gcc/x86_64-linux-gnu').glob('*/cc1')],*[str(x) for x in Path('/usr/lib/gcc/x86_64-linux-gnu').glob('*/collect2')]]]})
 before={r['path']:r['sha256'] for r in snap['files']};save('source-before.json',before)
 for name in ['work','target','tmp']:(R/name).mkdir()
 W=R/'work';(W/'cargo').mkdir();(W/'cargo/config.toml').write_bytes((B/'locked-dependencies/vendor-config.toml').read_bytes())
 wrap=['/usr/bin/bwrap','--unshare-all','--new-session','--die-with-parent','--clearenv','--cap-drop','ALL','--ro-bind','/usr','/usr']
 for p in ['/lib','/lib64']:
  if Path(p).exists():wrap+=['--ro-bind',p,p]
 wrap+=['--symlink','usr/bin','/bin','--proc','/proc','--dev','/dev','--bind',str(R/'tmp'),'/tmp','--dir','/etc','--dir','/etc/alternatives','--dir','/controller']
 for host,dest in [(S,'/source'),(V,'/vendor'),(T,'/toolchain'),(N,'/native-input'),(H/'child.py','/controller/child.py')]:wrap+=['--ro-bind',str(host),dest]
 wrap+=['--tmpfs','/native','--dir','/native/usr']
 for item in N.iterdir():
  if item.name!='usr':wrap+=['--ro-bind',str(item),'/native/'+item.name]
 for item in (N/'usr').iterdir():wrap+=['--ro-bind',str(item),'/native/usr/'+item.name]
 wrap+=['--symlink','lib/x86_64-linux-gnu','/native/usr/lib64','--remount-ro','/native']
 for p in ['cc','c++']:
  link=os.readlink('/etc/alternatives/'+p);need(link==('/usr/bin/gcc' if p=='cc' else '/usr/bin/g++'),'GCC alias drift');wrap+=['--symlink',link,'/etc/alternatives/'+p]
 wrap+=['--bind',str(W),'/work','--bind',str(R/'target'),'/target']
 env={'PATH':'/toolchain/bin:/usr/bin:/bin','LANG':'C.UTF-8','CARGO_HOME':'/work/cargo','CARGO_TARGET_DIR':'/target','CARGO_NET_OFFLINE':'true','CARGO_BUILD_JOBS':'1','CARGO_TERM_COLOR':'never','RUSTC':'/toolchain/bin/rustc','GIT_CONFIG_NOSYSTEM':'1','GIT_CONFIG_GLOBAL':'/dev/null','GIT_TERMINAL_PROMPT':'0','TZ':'UTC','PKG_CONFIG_SYSROOT_DIR':'/native','PKG_CONFIG_PATH':'/native/usr/lib/x86_64-linux-gnu/pkgconfig','LD_LIBRARY_PATH':'/native/usr/lib/x86_64-linux-gnu'}
 for k,v in env.items():wrap+=['--setenv',k,v]
 wrap+=['--chdir','/source/codex-rs','/usr/bin/python3','-I','/controller/child.py']
 gate="import pathlib,json,os,sys; s=pathlib.Path('/proc/self/cgroup').read_text().strip().split('::',1)[1]; p=pathlib.Path('/sys/fs/cgroup')/s.lstrip('/'); d={n:(p/n).read_text().strip() for n in ['memory.max','memory.swap.max','pids.max','cpu.max']}; assert d['memory.max']=='2147483648' and d['memory.swap.max']=='0' and d['pids.max']=='128'; cpu=d['cpu.max'].split(); assert cpu[0]!='max' and int(cpu[0])==int(cpu[1]); print('CVG_KERNEL_LIMITS '+json.dumps({'scope':s,**d}),file=sys.stderr,flush=True); os.execv(sys.argv[1],sys.argv[1:])"
 unit='cvg-codex100-aux-bwrap-'+uuid.uuid4().hex[:10]+'.scope'
 argv=['/usr/bin/systemd-run','--user','--scope','--collect','--quiet','--unit',unit,'-p','MemoryMax=2147483648','-p','MemorySwapMax=0','-p','CPUQuota=100%','-p','TasksMax=128','-p','RuntimeMaxSec=600','/usr/bin/python3','-I','-c',gate]+wrap
 report={'task':C['task'],'unit':unit,'argv':argv,'environment':env,'status':'RUNNING','functional_receipts':0,'reference_binary_executed':False,'disk_enforcement':'periodic monitor, not quota'};save('command.json',report)
 headroom('prelaunch');start=time.monotonic();reason=None;peak=0;diagnostics=[]
 with (H/'attempt-2-cargo.stdout.log').open('xb') as out,(H/'attempt-2-cargo.stderr.log').open('xb') as err:
  p=subprocess.Popen(argv,env=E,stdout=out,stderr=err,start_new_session=True);report.update(pid=p.pid,started_unix=time.time());save('live.json',report)
  try:
   while p.poll() is None:
    free=shutil.disk_usage(R).free;owned=None
    for retry in range(3):
     du=run(['/usr/bin/du','-sb',str(R)],text=True)
     if du.returncode==0:owned=int(du.stdout.split()[0]);break
     diagnostics.append({'elapsed':time.monotonic()-start,'retry':retry,'exit':du.returncode,'stdout':du.stdout,'stderr':du.stderr})
     if not transient(du.returncode,du.stderr):break
     time.sleep(.15)
    if owned is not None:peak=max(peak,owned)
    if free<8000000000:reason='DISK_RESERVE_GUARD'
    elif owned is None:reason='DISK_MONITOR_FAILED'
    elif owned>4000000000:reason='OWNED_BYTES_GUARD'
    elif time.monotonic()-start>600:reason='RUNTIME_GUARD'
    with (H/'disk-monitor.jsonl').open('a') as f:f.write(json.dumps({'elapsed':time.monotonic()-start,'free':free,'owned':owned,'reason':reason})+'\n')
    if reason:break
    time.sleep(2)
  finally:
   if p.poll() is None:
    k=run(['/usr/bin/systemctl','--user','kill','--signal=SIGKILL','--kill-who=all',unit],text=True);save('own-scope-abort.json',{'stdout':k.stdout,'stderr':k.stderr,'exit':k.returncode,'reason':reason})
    try:os.killpg(p.pid,signal.SIGKILL)
    except ProcessLookupError:pass
   p.wait(timeout=15)
 report.update(status='TERMINAL',exit=p.returncode,abort_reason=reason,elapsed_seconds=time.monotonic()-start,peak_owned_bytes=peak,monitor_diagnostics=diagnostics)
 for _ in range(20):
  q=run(['/usr/bin/systemctl','--user','show',unit,'-p','ActiveState','-p','SubState','-p','LoadState','-p','Result','-p','MemoryPeak','-p','TasksCurrent'],text=True)
  if 'ActiveState=active' not in q.stdout:break
  time.sleep(.25)
 save('post-scope.json',{'unit':unit,'stdout':q.stdout,'stderr':q.stderr,'exit':q.returncode,'terminal': 'ActiveState=active' not in q.stdout})
 j=run(['/usr/bin/journalctl','--user','-u',unit,'--no-pager','-n','30']);(H/'scope.journal.log').write_bytes(j.stdout)
 checkrows(S,snap['files']);report['all_source_files_unchanged']=len(snap['files']);save('source-after.json',before)
 for f in ['tool-versions.json','metadata.json','tree.txt']:
  if (W/f).exists():shutil.copyfile(W/f,H/f)
 artifact=R/'target/release/bwrap'
 if p.returncode==0 and reason is None:
  need(artifact.is_file() and not artifact.is_symlink() and artifact.read_bytes()[:4]==b'\x7fELF','not regular ELF')
  rows=[]
  for line in (H/'attempt-2-cargo.stdout.log').read_text().splitlines():
   if line.startswith('{'):
    d=json.loads(line)
    if d.get('reason')=='compiler-artifact' and d.get('target',{}).get('name')=='bwrap' and d.get('executable'):rows.append(d)
  need(len(rows)==1 and rows[0]['executable']=='/target/release/bwrap','Cargo bin record missing');save('cargo-bin-artifact.json',rows[0])
  report['artifact']={'path':str(artifact),'sha256':sha(artifact),'bytes':artifact.stat().st_size,'Cargo_record':'cargo-bin-artifact.json'}
  for name,args in [('readelf',['/usr/bin/readelf','-aW',str(artifact)]),('file',['/usr/bin/file',str(artifact)])]:
   q=run(args);(H/(name+'.stdout.log')).write_bytes(q.stdout);(H/(name+'.stderr.log')).write_bytes(q.stderr);need(q.returncode==0,name+' failed')
  raw=[]
  for pat in ['release/build/codex-bwrap-*/output','release/.fingerprint/codex-bwrap-*/*.json','release/.fingerprint/cc-*/*.json','release/.fingerprint/libc-*/*.json']:
   for fp in (R/'target').glob(pat):
    dest=H/'native-profile-raw'/fp.relative_to(R/'target');dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(fp,dest);raw.append({'path':str(dest.relative_to(H)),'sha256':sha(dest)})
  save('native-profile-inputs.json',{'raws':raw,'profile_source':str(S/'codex-rs/Cargo.toml'),'profile_sha256':sha(S/'codex-rs/Cargo.toml'),'lock_sha256':sha(S/'codex-rs/Cargo.lock'),'features':rows[0]['features'],'profile':rows[0]['profile'],'build_scripts':[json.loads(l) for l in (H/'attempt-2-cargo.stdout.log').read_text().splitlines() if l.startswith('{') and json.loads(l).get('reason')=='build-script-executed']})
 save('result.json',report);print(json.dumps(report.get('artifact',report)),flush=True)
if __name__=='__main__':
 try:main()
 except Exception as e:save('failure.json',{'exception':repr(e),'functional_receipts':0});raise
