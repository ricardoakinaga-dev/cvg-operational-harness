#!/usr/bin/env python3
"""Own scope/namespace runner for source data acquisition; never a source build."""
from pathlib import Path
import argparse
import hashlib
import json
import os
import shutil
import signal
import subprocess
import time
import uuid

HERE = Path(__file__).resolve().parent
CONTRACT = '7ad8f3de808cf2342ee0f9e7547387145453764c29f6d7134a1b649eaa2184dd'
sha = lambda b: hashlib.sha256(b).hexdigest()


def need(ok, why):
    if not ok:raise ValueError(why)


def main():
    ap = argparse.ArgumentParser();ap.add_argument('phase',choices=['snapshot','help','vendor']);a = ap.parse_args()
    raw = (HERE/'contract.json').read_bytes();need(sha(raw) == CONTRACT,'acquisition contract changed');c = json.loads(raw)
    root = Path(c['resource_root']);limit = c['limits'];need(shutil.disk_usage(root).free >= limit['minimum_free_disk_bytes'],'disk headroom below acquisition start threshold')
    tool_manifest = Path(c['toolchain_manifest']['path']);need(sha(tool_manifest.read_bytes()) == c['toolchain_manifest']['sha256'],'toolchain identity manifest changed')
    tools = json.loads(tool_manifest.read_text())
    for name in ['bin/cargo','bin/rustc']:
        row = next(r for r in tools['files'] if r['path'] == name);p = Path(c['toolchain_readonly'])/name
        with p.open('rb') as f:need(hashlib.file_digest(f,'sha256').hexdigest() == row['sha256'],'tool binary changed')
    for name in ['source','work','vendor','control']:(root/name).mkdir(exist_ok=True)
    control = root/'control';(control/'no-hooks').mkdir(exist_ok=True);(control/'empty-template').mkdir(exist_ok=True)
    common = '[credential]\n    helper =\n[core]\n    hooksPath = /control/no-hooks\n[protocol]\n    allow = never\n[protocol "https"]\n    allow = always\n[http]\n    version = HTTP/1.1\n    sslVerify = true\n[maintenance]\n    auto = false\n[safe]\n    directory = /source\n    directory = /upstream\n'
    (control/'git-snapshot.config').write_text(common+'[protocol "file"]\n    allow = always\n')
    (control/'git-https.config').write_text(common+'[protocol "file"]\n    allow = never\n')
    (root/'work/cargo').mkdir(exist_ok=True)
    (root/'work/cargo/config.toml').write_text('[net]\ngit-fetch-with-cli = true\nretry = 2\n[http]\ntimeout = 30\nproxy = ""\n')
    id = a.phase+'-'+uuid.uuid4().hex[:10];unit = 'cvg-codex100-ref-deps-'+id
    need(not (HERE/(id+'.json')).exists(),'attempt collision')
    uid = os.getuid();env = {'PATH':'/usr/bin:/bin','LANG':'C.UTF-8','XDG_RUNTIME_DIR':'/run/user/'+str(uid),'DBUS_SESSION_BUS_ADDRESS':'unix:path=/run/user/'+str(uid)+'/bus'}
    wrap = ['/usr/bin/bwrap']
    if a.phase == 'vendor':wrap += ['--unshare-user','--unshare-pid','--unshare-uts','--unshare-ipc','--unshare-cgroup']
    else:wrap += ['--unshare-all']
    wrap += ['--new-session','--die-with-parent','--clearenv','--ro-bind','/usr','/usr']
    for lib in ['/lib','/lib64']:
        if Path(lib).exists():wrap += ['--ro-bind',lib,lib]
    wrap += ['--symlink','usr/bin','/bin','--proc','/proc','--dev','/dev','--tmpfs','/tmp','--dir','/etc','--dir','/controller',
             '--ro-bind',str(control),'/control','--ro-bind',str(HERE/'child-phase.py'),'/controller/child.py',
             '--ro-bind',c['toolchain_readonly'],'/toolchain','--bind',str(root/'work'),'/work',
             '--bind',str(root/'vendor'),'/vendor']
    wrap += ['--bind' if a.phase == 'snapshot' else '--ro-bind',str(root/'source'),'/source']
    if a.phase == 'snapshot':wrap += ['--ro-bind',c['upstream_readonly'],'/upstream']
    if a.phase == 'vendor':
        for path in ['/etc/resolv.conf','/etc/hosts','/etc/nsswitch.conf','/etc/ssl/certs']:
            if Path(path).exists():wrap += ['--ro-bind',path,path]
    for k,v in {'PATH':'/toolchain/bin:/usr/bin:/bin','LANG':'C.UTF-8','CARGO_HOME':'/work/cargo','CARGO_TARGET_DIR':'/work/metadata-target','RUSTC':'/toolchain/bin/rustc','GIT_CONFIG_NOSYSTEM':'1','GIT_CONFIG_GLOBAL':'/control/git-snapshot.config' if a.phase == 'snapshot' else '/control/git-https.config','GIT_TERMINAL_PROMPT':'0','GIT_TEMPLATE_DIR':'/control/empty-template','GIT_OPTIONAL_LOCKS':'0','CARGO_TERM_COLOR':'never'}.items():wrap += ['--setenv',k,v]
    wrap += ['--chdir','/work','/usr/bin/python3','-I','/controller/child.py',a.phase]
    gate = "import pathlib,json,os,sys; s=pathlib.Path('/proc/self/cgroup').read_text().strip().split('::',1)[1]; p=pathlib.Path('/sys/fs/cgroup')/s.lstrip('/'); m=(p/'memory.max').read_text().strip(); n=(p/'pids.max').read_text().strip(); cpu=(p/'cpu.max').read_text().split(); assert m=='4294967296' and n=='128' and cpu[0]!='max' and int(cpu[0])/int(cpu[1])==2; print('CVG_KERNEL_LIMITS '+json.dumps({'scope':s,'memory_max':m,'pids_max':n,'cpu_max':cpu}),file=sys.stderr,flush=True); os.execv(sys.argv[1],sys.argv[1:])"
    argv = ['/usr/bin/systemd-run','--user','--scope','--collect','--quiet','--unit',unit,'-p','MemoryMax=4294967296','-p','TasksMax=128','-p','CPUQuota=200%','-p','RuntimeMaxSec=1800','/usr/bin/python3','-I','-c',gate]+wrap
    outpath,errpath = HERE/(id+'.stdout.log'),HERE/(id+'.stderr.log')
    report = {'task':c['task'],'phase':a.phase,'attempt':id,'contract_sha256':CONTRACT,'runner_sha256':sha(Path(__file__).read_bytes()),'child_sha256':sha((HERE/'child-phase.py').read_bytes()),'unit':unit+'.scope','argv':argv,'network':'PUBLIC_DEPENDENCY_ACQUISITION_ONLY' if a.phase == 'vendor' else 'UNSHARED_NETWORK','stdout':outpath.name,'stderr':errpath.name,'status':'RUNNING','Codex_compiled':False,'Codex_executed':False,'functional_receipts':0,'disk_enforcement':limit['disk_enforcement']}
    start = time.monotonic();reason = None;peak = 0
    with outpath.open('xb') as out,errpath.open('xb') as err:
        p = subprocess.Popen(argv,env=env,stdout=out,stderr=err,start_new_session=True)
        report.update({'runner_pid':os.getpid(),'child_pid':p.pid});(HERE/'live.json').write_text(json.dumps(report,indent=2)+'\n')
        while p.poll() is None:
            free = shutil.disk_usage(root).free
            du = subprocess.run(['/usr/bin/du','-sb',str(root)],capture_output=True,text=True,timeout=15)
            owned = int(du.stdout.split()[0]) if du.returncode == 0 else None
            if owned is not None:peak = max(peak,owned)
            if free < limit['abort_free_disk_bytes']:reason = 'DISK_RESERVE_GUARD'
            if owned is None:reason = 'DISK_MONITOR_FAILED'
            if owned is not None and owned > limit['monitored_owned_bytes_limit']:reason = 'OWNED_BYTES_MONITOR_GUARD'
            if time.monotonic()-start > limit['runtime_seconds']+15:reason = 'OWNED_SCOPE_DEADLINE'
            if reason:
                subprocess.run(['/usr/bin/systemctl','--user','kill','--kill-who=all',unit+'.scope'],env=env,capture_output=True,timeout=10)
                try:os.killpg(p.pid,signal.SIGKILL)
                except ProcessLookupError:pass
                break
            time.sleep(2)
        p.wait(timeout=15)
    report.update({'status':'TERMINAL','exit':p.returncode,'abort_reason':reason,'elapsed_seconds':round(time.monotonic()-start,3),'peak_owned_bytes_observed':peak})
    for kind,path in [('stdout',outpath),('stderr',errpath)]:report[kind+'_sha256'] = sha(path.read_bytes())
    first = errpath.read_text(errors='replace').splitlines()[0] if errpath.stat().st_size else ''
    report['actual_kernel_guard_observed'] = first.startswith('CVG_KERNEL_LIMITS ')
    if a.phase == 'snapshot' and p.returncode == 0:report['snapshot'] = json.loads((root/'work/snapshot-result.json').read_text())
    if a.phase == 'vendor' and p.returncode == 0:
        import tomllib
        tomllib.loads(outpath.read_text());(HERE/'vendor-config.toml').write_bytes(outpath.read_bytes())
    (HERE/(id+'.json')).write_text(json.dumps(report,indent=2)+'\n');(HERE/'live.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({k:report[k] for k in ['phase','attempt','unit','status','exit','abort_reason','actual_kernel_guard_observed','elapsed_seconds','Codex_compiled','Codex_executed']}))
    if p.returncode or reason or not report['actual_kernel_guard_observed']:raise SystemExit(1)


if __name__ == '__main__':main()
