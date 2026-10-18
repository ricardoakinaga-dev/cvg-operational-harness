import os,sys,pathlib,subprocess,json,time
work=pathlib.Path('/tmp/cvg-codex100-exec-20261017/native-delivery-probe')
repo=pathlib.Path('/home/ricardo/Área de trabalho/cvg-operational-harness')
unit=sys.argv[1]
def save(n,x): (work/n).write_text(json.dumps(x,indent=2)+'\n')
show=subprocess.run(['/usr/bin/systemctl','--user','show',unit,'--property=ControlGroup,MemoryMax,CPUQuotaPerSecUSec,TasksMax,RuntimeMaxUSec,ActiveState'],capture_output=True,text=True,timeout=5)
save('live-scope.json',{'argv':show.args,'returncode':show.returncode,'stdout':show.stdout,'stderr':show.stderr})
if show.returncode: raise RuntimeError('scope inspection failed')
props=dict(l.split('=',1) for l in show.stdout.splitlines() if '=' in l)
assert props['MemoryMax']=='2147483648' and props['CPUQuotaPerSecUSec']=='1s' and props['TasksMax']=='128' and props['RuntimeMaxUSec']=='2min' and props['ActiveState']=='active',props
cgroup=pathlib.Path('/sys/fs/cgroup'+props['ControlGroup'])
limits={k:(cgroup/k).read_text().strip() for k in ['memory.max','cpu.max','pids.max','cgroup.procs']}
assert limits['memory.max']=='2147483648' and limits['cpu.max']=='100000 100000' and limits['pids.max']=='128',limits
save('live-cgroup-before-target.json',limits)
save('host-namespaces.json',{k:os.readlink('/proc/self/ns/'+k) for k in ['user','mnt','pid','net','ipc','uts','cgroup']})
args=['/usr/bin/bwrap','--unshare-all','--die-with-parent','--new-session','--cap-drop','ALL','--clearenv','--setenv','PATH','/nonexistent','--setenv','LANG','C','--proc','/proc','--dev','/dev','--tmpfs','/tmp','--dir','/repo','--ro-bind',str(repo/'packages'),'/repo/packages','--ro-bind',str(repo/'package.json'),'/repo/package.json','--ro-bind',str(work/'probe.mjs'),'/bundle/probe.mjs','--ro-bind','/home/ricardo/.nvm/versions/node/v22.23.2/bin/node','/node','--ro-bind',str(cgroup),'/limits','--bind',str(work/'output'),'/work','--chdir','/work']
libs=['/lib/x86_64-linux-gnu/libdl.so.2','/lib/x86_64-linux-gnu/libstdc++.so.6','/lib/x86_64-linux-gnu/libm.so.6','/lib/x86_64-linux-gnu/libgcc_s.so.1','/lib/x86_64-linux-gnu/libpthread.so.0','/lib/x86_64-linux-gnu/libc.so.6','/lib64/ld-linux-x86-64.so.2']
for lib in libs: args+=['--ro-bind',os.path.realpath(lib),lib]
args+=['/node','/bundle/probe.mjs']
save('target-command.json',{'argv':args,'libraries':[{ 'mount':p,'realpath':os.path.realpath(p)} for p in libs]})
(work/'output').mkdir(exist_ok=True)
with (work/'target.stdout.log').open('wb') as stdout,(work/'target.stderr.log').open('wb') as stderr:
 try:
  result=subprocess.run(args,stdout=stdout,stderr=stderr,timeout=100,env={})
  save('target-exit.json',{'returncode':result.returncode,'timedOut':False});sys.exit(result.returncode)
 except BaseException as e:
  save('target-error.json',{'type':type(e).__name__,'message':str(e)});raise
