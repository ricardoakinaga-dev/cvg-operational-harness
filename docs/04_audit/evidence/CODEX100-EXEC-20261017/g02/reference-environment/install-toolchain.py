#!/usr/bin/env python3
"""Install authenticated Rust tools into an owned prefix under proven bounds."""
from pathlib import Path
import hashlib
import json
import os
import signal
import subprocess
import uuid

HERE = Path(__file__).resolve().parent
sha = lambda b: hashlib.sha256(b).hexdigest()


def need(ok, why):
    if not ok:raise ValueError(why)


def main():
    raw = (HERE/'component-acquisition-contract.json').read_bytes()
    need(sha(raw) == '94fb96effd630be495a4165faf14d98c08b4092e884a44d32b3356b210d8c373','component contract drift')
    c = json.loads(raw);x = json.loads((HERE/'extracted-files.json').read_text());root = Path(c['owned_root'])
    need(json.loads((HERE/'resource-control-probe.json').read_text())['result'] == 'KERNEL_SCOPE_LIMITS_MATCH','resource limits unproven')
    need(json.loads((HERE/'preflight.json').read_text())['bwrap']['status'] == 'BOUNDED_TRUSTED_PROBES_PASS','containment unproven')
    a = (HERE/'official-installer.sh.txt').read_bytes();b = (HERE/'official-rust-src-installer.sh.txt').read_bytes()
    need(a.replace(b"TEMPLATE_SUCCESS_MESSAGE='rust installed.'",b"TEMPLATE_SUCCESS_MESSAGE='rust src installed.'") == b,'unreviewed installer difference')
    need(sha(a) == c['installer_inspected_sha256'],'reviewed installer drift')
    for r in x['files']:
        p = Path(x['root'])/r['path'];need(not p.is_symlink() and p.stat().st_size == r['bytes'],'extracted file drift')
        with p.open('rb') as f:need(hashlib.file_digest(f,'sha256').hexdigest() == r['sha256'],'extracted content changed')
    prefix = root/'toolchain';work = root/'install-work';need(not prefix.exists() and not work.exists(),'existing install attempt; inspect before retry')
    prefix.mkdir();work.mkdir();uid = os.getuid()
    env = {'PATH':'/usr/bin:/bin','LANG':'C.UTF-8','XDG_RUNTIME_DIR':'/run/user/'+str(uid),'DBUS_SESSION_BUS_ADDRESS':'unix:path=/run/user/'+str(uid)+'/bus'}
    report = {'kind':'CONFINED_AUTHENTICATED_RUST_TOOL_INSTALLATION_NOT_CODEX_BUILD','contract_sha256':sha(raw),'prefix':str(prefix),'installer_review':{'main_sha256':sha(a),'rust_src_sha256':sha(b),'only_difference':'TEMPLATE_SUCCESS_MESSAGE rust installed -> rust src installed'},'invocations':[],'host_PATH_changed':False,'global_installation':False,'Codex_executed':False,'Codex_compiled':False,'functional_receipts':0}
    gate = "import pathlib,json,os,sys; s=pathlib.Path('/proc/self/cgroup').read_text().strip().split('::',1)[1]; p=pathlib.Path('/sys/fs/cgroup')/s.lstrip('/'); m=(p/'memory.max').read_text().strip(); n=(p/'pids.max').read_text().strip(); cpu=(p/'cpu.max').read_text().split(); assert m=='4294967296' and n=='128' and cpu[0]!='max' and int(cpu[0])/int(cpu[1])==2; print(json.dumps({'kernel_limits_before_tool':True,'scope':s,'memory_max':m,'pids_max':n,'cpu_max':cpu}),flush=True); os.execv(sys.argv[1],sys.argv[1:])"
    def confined(label,command):
        unit = 'cvg-codex100-rust-tools-'+label+'-'+uuid.uuid4().hex[:10]
        wrap = ['/usr/bin/bwrap','--unshare-all','--new-session','--die-with-parent','--ro-bind','/usr','/usr']
        for lib in ['/lib','/lib64']:
            if Path(lib).exists():wrap += ['--ro-bind',lib,lib]
        wrap += ['--symlink','usr/bin','/bin','--proc','/proc','--dev','/dev','--tmpfs','/tmp','--dir','/work','--bind',str(work),'/work','--ro-bind',x['root'],'/dist','--bind',str(prefix),'/toolchain','--setenv','PATH','/usr/bin:/bin','--setenv','CARGO_HOME','/work/cargo','--chdir','/work']+command
        argv = ['/usr/bin/systemd-run','--user','--scope','--collect','--quiet','--unit',unit,'-p','MemoryMax=4294967296','-p','TasksMax=128','-p','CPUQuota=200%','-p','RuntimeMaxSec=300','/usr/bin/python3','-I','-c',gate]+wrap
        invocation = {'label':label,'unit':unit+'.scope','argv':argv,'status':'RUNNING_OWNED_SCOPE'}
        report['invocations'].append(invocation);(HERE/'installation-progress.json').write_text(json.dumps(report,indent=2)+'\n')
        p = subprocess.Popen(argv,env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE,start_new_session=True)
        try:out,err = p.communicate(timeout=315)
        except subprocess.TimeoutExpired:
            subprocess.run(['/usr/bin/systemctl','--user','kill','--kill-who=all',unit+'.scope'],env=env,capture_output=True,timeout=10)
            try:os.killpg(p.pid,signal.SIGKILL)
            except ProcessLookupError:pass
            out,err = p.communicate(timeout=5)
            invocation['timeout'] = True
        (HERE/(label+'.stdout.log')).write_bytes(out);(HERE/(label+'.stderr.log')).write_bytes(err)
        invocation.update({'status':'TERMINAL','exit':p.returncode,'stdout_sha256':sha(out),'stderr_sha256':sha(err),'stdout':label+'.stdout.log','stderr':label+'.stderr.log'})
        need(p.returncode == 0 and b'"kernel_limits_before_tool": true' in out,'bounded tool invocation failed: '+label)
        return out.decode()
    def installer(top,components):
        return ['/usr/bin/bash','--noprofile','--norc','/dist/'+top+'/install.sh','--prefix=/toolchain','--sysconfdir=/toolchain/etc','--bindir=/toolchain/bin','--libdir=/toolchain/lib','--datadir=/toolchain/share','--mandir=/toolchain/share/man','--components='+','.join(components),'--disable-ldconfig']
    try:
        confined('install-main',installer('rust-1.95.0-x86_64-unknown-linux-gnu',[v for v in c['requested_components'] if v != 'rust-src']))
        confined('install-src',installer('rust-src-1.95.0',['rust-src']))
        rustc = confined('verify-rustc',['/toolchain/bin/rustc','-Vv']);cargo = confined('verify-cargo',['/toolchain/bin/cargo','-V'])
        need('rustc 1.95.0 ' in rustc and 'cargo 1.95.0 ' in cargo,'installed compiler version mismatch')
        need((prefix/'lib/rustlib/src/rust/library').is_dir(),'required Rust source component missing')
        report.update({'result':'RUST_1_95_0_COMPONENTS_INSTALLED_AND_VERIFIED_IN_CONTAINMENT','installed':True,'rustc_version_output':rustc,'cargo_version_output':cargo,'required_components':c['requested_components']})
    except Exception as e:report.update({'result':'INSTALLATION_FAILED_PRESERVED_OWN_ATTEMPT_NO_CODEX_EXECUTION','installed':False,'error_type':type(e).__name__,'error':str(e)})
    report['live_jobs'] = []
    (HERE/'installation.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({k:report[k] for k in ['result','installed','prefix','host_PATH_changed','global_installation','Codex_executed','Codex_compiled','functional_receipts']}))
    if not report['installed']:raise SystemExit(1)


if __name__ == '__main__':main()
