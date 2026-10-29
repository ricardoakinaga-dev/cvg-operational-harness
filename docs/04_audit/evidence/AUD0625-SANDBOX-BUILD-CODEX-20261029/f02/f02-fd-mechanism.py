from pathlib import Path
import json,os,subprocess,time,hashlib
r=Path('/mnt/dados/cvg-work/aud0625-sandbox-build-codex-20261029');workspace=r/'f02-fd-owned-workspace';workspace.mkdir(exist_ok=True);(workspace/'inside.txt').write_text('OWNED-INSIDE');outside=r/'f02-fd-owned-outside.txt';outside.write_text('OWNED-OUTSIDE');manifest=json.loads((r/'f02-trusted-node-runtime-inputs.json').read_text());fds=[];rec={'purpose':'one bounded owned synthetic mechanism proof: empty root + FD-pinned runtime/workspace, before production implementation','app_cap_seconds':2}
try:
 for x in manifest['files']:fds.append(os.open(x['source'],os.O_RDONLY|os.O_NOFOLLOW))
 wfd=os.open(workspace,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW);fds.append(wfd);bfd=os.open('/usr/bin/bwrap',os.O_RDONLY|os.O_NOFOLLOW);fds.append(bfd)
 paths=set()
 for dest in [*[x['destination'] for x in manifest['files']],str(workspace)]:
  p=Path(dest).parent
  while str(p)!='/':paths.add(str(p));p=p.parent
 cmd=['/proc/self/fd/'+str(bfd),'--new-session','--die-with-parent','--unshare-pid','--unshare-ipc','--unshare-uts','--unshare-net','--tmpfs','/']
 for p in sorted(paths,key=lambda x:(x.count('/'),x)):cmd+=['--dir',p]
 cmd+=['--proc','/proc','--dev','/dev','--tmpfs','/tmp']
 for fd,x in zip(fds,manifest['files']):cmd+=['--ro-bind-fd',str(fd),x['destination']]
 cmd+=['--bind-fd',str(wfd),str(workspace),'--chdir',str(workspace),'--clearenv','--setenv','LANG','C.UTF-8','--setenv','LC_ALL','C.UTF-8','--setenv','TZ','UTC','--setenv','HOME','/tmp','--setenv','TMPDIR','/tmp','--setenv','PATH','','--setenv','PWD',str(workspace),'--','/home/ricardo/.nvm/versions/node/v22.23.2/bin/node','-e','const fs=require("node:fs");let outside=false;try{fs.readFileSync(process.argv[1]);outside=true}catch(e){if(!["ENOENT","EACCES","EPERM"].includes(e.code))throw e}process.stdout.write(JSON.stringify({inside:fs.readFileSync("inside.txt","utf8"),outside,env:process.env.CVG_OWN_SYNTHETIC??null}));',str(outside)]
 t=time.monotonic();p=subprocess.run(cmd,capture_output=True,timeout=2,pass_fds=fds,env={'LANG':'C','LC_ALL':'C','CVG_OWN_SYNTHETIC':'OWNED-NOT-FORWARDED'});rec.update(exit=p.returncode,seconds=time.monotonic()-t,stdout=p.stdout.decode(),stderr=p.stderr.decode());assert p.returncode==0,rec;d=json.loads(p.stdout);assert d=={'inside':'OWNED-INSIDE','outside':False,'env':None},d;rec['status']='PASS'
finally:
 for fd in fds:os.close(fd)
 outside.unlink(missing_ok=True);(workspace/'inside.txt').unlink(missing_ok=True);workspace.rmdir();rec['own_fixture_removed']=True;(r/'f02-fd-mechanism.json').write_text(json.dumps(rec,indent=2)+'\n')
print(json.dumps(rec))
