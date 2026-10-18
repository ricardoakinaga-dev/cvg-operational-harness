"""Independent feasibility observation; production recipe/receipt tested separately."""
from pathlib import Path
import base64,hashlib,io,json,os,signal,stat,subprocess,tarfile,time
ROOT=Path('/home/ricardo/cvg-candidates/hiso005-0234-20261017')
OUT=Path('/tmp/cvg-hiso005-0234-20261017/reference-preflight')
EV=Path('/home/ricardo/Área de trabalho/cvg-operational-harness/docs/04_audit/evidence/HISO005-0234-BUILD-20261017')
OUT.mkdir(); src=OUT/'source';src.mkdir();cache=OUT/'cache';cache.mkdir()
commit=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()
pin=json.loads((EV.parent/'HISO005-PROOF-PLAN-20261017/toolchain-pin.json').read_text())
node=Path('/home/ricardo/.nvm/versions/node/v22.23.2/bin/node');npm=node.parent.parent/'lib/node_modules/npm'
hashfile=lambda p:hashlib.file_digest(p.open('rb'),'sha256').hexdigest()
assert hashfile(node)==pin['nodeBinarySha256']
for e in pin['entries']:
 p=npm/e['path'];assert p.is_file() and not p.is_symlink() and hashfile(p)==e['sha256'] and p.stat().st_mode&0o111==e['executableBits']
archive=subprocess.check_output(['git','archive','--format=tar',commit],cwd=ROOT)
with tarfile.open(fileobj=io.BytesIO(archive)) as tar:
 for m in tar:
  parts=Path(m.name).parts
  if any(p in ['node_modules','dist','.git'] or p.startswith('.env') for p in parts):continue
  assert not m.name.startswith('/') and '..' not in parts
  tar.extract(m,src,filter='data')
lock=json.loads((src/'package-lock.json').read_text()); copied=[];missing=[];seen=set();total=0
for key,e in sorted(lock['packages'].items()):
 if not key or e.get('link') or 'integrity' not in e:continue
 sri=e['integrity'];assert sri.startswith('sha512-'); digest=base64.b64decode(sri[7:],validate=True);assert len(digest)==64
 h=digest.hex();relative=Path('content-v2/sha512')/h[:2]/h[2:4]/h[4:];original=Path('/home/ricardo/.npm/_cacache')/relative
 if not original.exists():missing.append({'key':key,'optional':bool(e.get('optional'))});continue
 assert original.is_file() and not original.is_symlink()
 if h in seen:continue
 seen.add(h); before=original.stat();data=original.read_bytes();assert hashlib.sha512(data).digest()==digest
 total+=len(data);assert total<=2*1024**3
 target=cache/'_cacache'/relative;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
 assert original.stat().st_ino==before.st_ino and original.stat().st_mtime_ns==before.st_mtime_ns
 copied.append({'sha512':h,'bytes':len(data)})
for name in ['userconfig','globalconfig']:(OUT/name).write_text('')
sourcefiles={str(p.relative_to(src)):hashfile(p)for p in src.rglob('*')if p.is_file() and not p.is_symlink()}
env={k:os.environ[k]for k in ['HOME','USER','LOGNAME','LANG','LC_ALL','TZ']if k in os.environ};env['PATH']=str(node.parent)+':/usr/bin:/bin';env['npm_config_userconfig']=str(OUT/'userconfig');env['npm_config_globalconfig']=str(OUT/'globalconfig');env['TMPDIR']=str(OUT/'tmp');Path(env['TMPDIR']).mkdir()
argv=[str(node),str(npm/'bin/npm-cli.js'),'ci','--offline','--ignore-scripts','--audit=false','--fund=false','--include=dev','--include=optional','--cache',str(cache)]
result={'purpose':'independent feasibility, no production success receipt or acceptance inferred','commit':commit,'nodeSha256':hashfile(node),'npmTreeSha256':pin['npmTreeSha256'],'cachePayloads':len(copied),'compressedBytes':total,'missingCache':missing,'argv':argv,'environmentKeys':sorted(env),'root':str(src),'archiveSha256':hashlib.sha256(archive).hexdigest()}
start=time.monotonic();peak=0;maxbytes=0;reason=None
with (OUT/'npm.log').open('w') as log:
 process=subprocess.Popen(['/usr/bin/strace','-f','-qq','-e','trace=process,network','-o',str(OUT/'observer.log'),*argv],cwd=src,env=env,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
 while process.poll() is None:
  children={process.pid}; changed=True
  while changed:
   changed=False
   for d in Path('/proc').iterdir():
    if not d.name.isdigit():continue
    try:
     info=(d/'stat').read_text().rsplit(')',1)[1].split();ppid=int(info[1])
     if ppid in children and int(d.name) not in children:children.add(int(d.name));changed=True
    except (FileNotFoundError,ProcessLookupError,PermissionError):pass
  peak=max(peak,len(children))
  regular=sum(p.stat().st_size for p in src.rglob('*')if not p.is_symlink() and p.is_file());maxbytes=max(maxbytes,regular)
  if peak>8 or regular>4*1024**3 or time.monotonic()-start>180:
   reason='PROCESS_CAP' if peak>8 else 'TOTAL_BYTES_CAP' if regular>4*1024**3 else 'TIMEOUT'
   os.killpg(process.pid,signal.SIGKILL);break
  time.sleep(.03)
 process.wait(timeout=10)
result.update(exitCode=process.returncode,elapsedSeconds=round(time.monotonic()-start,3),peakProcessesIncludingObserver=peak,peakRegularBytes= maxbytes,refusal=reason)
result['sourceIntegrity']=all((src/p).is_file() and hashfile(src/p)==h for p,h in sourcefiles.items())
trace=(OUT/'observer.log').read_text();result['connectSyscalls']=[l for l in trace.splitlines() if 'connect(' in l];result['execveObserved']=[l for l in trace.splitlines() if 'execve(' in l]
(EV/'reference-preflight.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:result[k]for k in ['exitCode','elapsedSeconds','cachePayloads','compressedBytes','peakProcessesIncludingObserver','sourceIntegrity','connectSyscalls','refusal']}))
