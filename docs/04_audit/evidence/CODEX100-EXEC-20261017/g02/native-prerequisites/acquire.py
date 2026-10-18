#!/usr/bin/env python3
"""Authenticate two OS packages and extract data only into an own sysroot."""
from pathlib import Path, PurePosixPath
import datetime
import email.utils
import hashlib
import io
import json
import os
import shutil
import subprocess
import sys
import tarfile
import time

HERE = Path(__file__).resolve().parent
CONTRACT = '9daf80a18f1ec503203a21712f93cbf9ab8fad8b059de620b560753d49072510'
sha = lambda b:hashlib.sha256(b).hexdigest()

def need(ok, why):
    if not ok:raise ValueError(why)

def child():
    c = json.loads(Path('/inputs/contract.json').read_text());work = Path('/work')
    g = subprocess.run(['gpgv','--status-fd','1','--keyring','/inputs/Ubuntu_keyring','/inputs/InRelease'],capture_output=True,text=True,timeout=30)
    need(g.returncode == 0 and '[GNUPG:] VALIDSIG ' in g.stdout,'Ubuntu index signature failed')
    (work/'gpgv.stdout.log').write_text(g.stdout);(work/'gpgv.stderr.log').write_text(g.stderr)
    signed = Path('/inputs/InRelease').read_text();body = signed.split('\n\n',1)[1].split('-----BEGIN PGP SIGNATURE-----',1)[0]
    need('Origin: Ubuntu\n' in body and 'Suite: noble-updates\n' in body,'wrong signed repository')
    date = email.utils.parsedate_to_datetime(next(l[6:] for l in body.splitlines() if l.startswith('Date: ')))
    age = (datetime.datetime.now(datetime.timezone.utc)-date).total_seconds();need(-3600 <= age <= 604800,'signed index timestamp outside bounded current window')
    section = body.split('\nSHA256:\n',1)[1];hashes = {}
    for line in section.splitlines():
        if not line.startswith(' '):break
        h,size,name = line.split();hashes[name] = (h,int(size))
    index = Path('/inputs/Packages').read_bytes();need((sha(index),len(index)) == hashes['main/binary-amd64/Packages'],'Packages not bound to signed InRelease')
    stanzas = []
    for stanza in index.decode().split('\n\n'):
        row = {line.split(':',1)[0]:line.split(':',1)[1].strip() for line in stanza.splitlines() if ':' in line and not line.startswith((' ','\t'))}
        stanzas.append(row)
    sysroot = work/'sysroot';sysroot.mkdir();packages = []
    for expected in c['packages']:
        matching = [r for r in stanzas if (r.get('Package'),r.get('Version'),r.get('Architecture')) == (expected['name'],expected['version'],expected['architecture'])]
        need(len(matching) == 1,'missing/ambiguous exact package');entry = matching[0]
        for key in ['Filename','Size','SHA256']:need(str(expected[key]) == entry[key],'package metadata changed '+key)
        dest = work/Path(entry['Filename']).name;url = c['HTTPS_origins'][0]+entry['Filename']
        subprocess.run(['curl','--disable','--fail','--silent','--show-error','--proto','=https','--tlsv1.2','--connect-timeout','20','--max-time','120','--max-filesize',str(c['limits']['download_max_bytes']),'--output',str(dest),url],check=True,timeout=135)
        need(dest.stat().st_size == expected['Size'] and sha(dest.read_bytes()) == expected['SHA256'],'download is not signed-index-authenticated')
        # dpkg-deb decodes the data tar only; no install/control/maintainer scripts.
        data = subprocess.check_output(['dpkg-deb','--fsys-tarfile',str(dest)],timeout=30);need(len(data) <= c['limits']['archive_data_max_bytes'],'decoded package too large')
        with tarfile.open(fileobj=io.BytesIO(data)) as tar:
            members = tar.getmembers();total = 0
            for m in members:
                p = PurePosixPath(m.name);need(not p.is_absolute() and '..' not in p.parts,'unsafe package path')
                need(m.isdir() or m.isfile() or m.issym() or m.islnk(),'unsafe package member type');total += m.size
                if m.issym() or m.islnk():
                    target = Path('/work/sysroot')/p.parent/m.linkname if m.issym() else Path('/work/sysroot')/m.linkname
                    need(not PurePosixPath(m.linkname).is_absolute() and target.resolve().is_relative_to(sysroot.resolve()),'unsafe package link')
            need(total <= c['limits']['archive_data_max_bytes'],'expanded package bound exceeded')
            tar.extractall(sysroot,filter='data')
        packages.append({'package':expected,'url':url,'archive_path':str(dest),'data_tar_sha256':sha(data),'data_tar_bytes':len(data),'members':len(members),'maintainer_scripts_executed':False})
    files = []
    for p in sorted(sysroot.rglob('*')):
        if p.is_symlink():
            need(p.resolve().is_relative_to(sysroot.resolve()),'sysroot link escape');files.append({'path':str(p.relative_to(sysroot)),'kind':'SYMLINK','target':os.readlink(p)})
        elif p.is_file():
            files.append({'path':str(p.relative_to(sysroot)),'kind':'FILE','bytes':p.stat().st_size,'sha256':sha(p.read_bytes())})
    need(sum(r.get('bytes',0) for r in files) <= c['limits']['sysroot_max_bytes'],'sysroot byte bound exceeded')
    need((sysroot/'usr/include/openssl/ssl.h').is_file() and (sysroot/'usr/lib/x86_64-linux-gnu/libssl.so').is_file(),'expected OpenSSL inputs missing')
    report = {'kind':'SIGNED_UBUNTU_PACKAGE_DATA_PRIVATE_SYSROOT_NOT_INSTALL','contract_sha256':CONTRACT,'InRelease_sha256':sha(Path('/inputs/InRelease').read_bytes()),'Packages_sha256':sha(index),'signature_status':g.stdout,'index_date':date.isoformat(),'packages':packages,'sysroot_namespace_path':str(sysroot),'sysroot_host_path':c['resource_root']+'/sysroot','files':files,'file_count':len(files),'host_package_installation':False,'maintainer_scripts_executed':False,'Codex_compiled_or_executed':False,'functional_receipts':0}
    (work/'acquisition.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:report[k] for k in ['kind','file_count','host_package_installation','maintainer_scripts_executed']}),flush=True)

def parent():
    raw = (HERE/'contract.json').read_bytes();need(sha(raw) == CONTRACT,'contract drift');c = json.loads(raw);root = Path(c['resource_root']);need(not root.exists(),'resource root already exists; inspect prior job')
    need(shutil.disk_usage(root.parent).free >= c['limits']['minimum_free_disk_bytes'],'insufficient disk headroom');root.mkdir();inputs = root/'inputs';inputs.mkdir()
    (inputs/'contract.json').write_bytes(raw)
    for name,r in c['existing_public_APT_inputs'].items():
        b = Path(r['path']).read_bytes();need(sha(b) == r['sha256'] and len(b) == r['bytes'],'APT input drift');(inputs/name).write_bytes(b)
    wrap = ['/usr/bin/bwrap','--unshare-user','--unshare-pid','--unshare-uts','--unshare-ipc','--unshare-cgroup','--new-session','--die-with-parent','--clearenv','--ro-bind','/usr','/usr']
    for p in ['/lib','/lib64']:
        if Path(p).exists():wrap += ['--ro-bind',p,p]
    wrap += ['--symlink','usr/bin','/bin','--proc','/proc','--dev','/dev','--tmpfs','/tmp','--dir','/etc','--dir','/controller','--ro-bind',str(inputs),'/inputs','--ro-bind',str(HERE/'acquire.py'),'/controller/acquire.py','--bind',str(root),'/work']
    for p in ['/etc/resolv.conf','/etc/hosts','/etc/nsswitch.conf','/etc/ssl/certs']:
        if Path(p).exists():wrap += ['--ro-bind',p,p]
    wrap += ['--setenv','PATH','/usr/bin:/bin','--setenv','LANG','C.UTF-8','--chdir','/work','/usr/bin/python3','-I','/controller/acquire.py','--child']
    gate = "import pathlib,json,os,sys; s=pathlib.Path('/proc/self/cgroup').read_text().strip().split('::',1)[1]; p=pathlib.Path('/sys/fs/cgroup')/s.lstrip('/'); m=(p/'memory.max').read_text().strip(); n=(p/'pids.max').read_text().strip(); cpu=(p/'cpu.max').read_text().split(); assert m=='4294967296' and n=='128' and cpu[0]!='max' and int(cpu[0])/int(cpu[1])==2; print('CVG_KERNEL_LIMITS '+json.dumps({'scope':s,'memory_max':m,'pids_max':n,'cpu_max':cpu}),file=sys.stderr,flush=True); os.execv(sys.argv[1],sys.argv[1:])"
    unit = 'cvg-codex100-ref-native-'+str(os.getpid())+'.scope';env = {'PATH':'/usr/bin:/bin','LANG':'C.UTF-8','XDG_RUNTIME_DIR':'/run/user/'+str(os.getuid()),'DBUS_SESSION_BUS_ADDRESS':'unix:path=/run/user/'+str(os.getuid())+'/bus'}
    args = ['systemd-run','--user','--scope','--collect','--quiet','--unit',unit,'-p','MemoryMax=4294967296','-p','CPUQuota=200%','-p','TasksMax=128','-p','RuntimeMaxSec=600','/usr/bin/python3','-I','-c',gate]+wrap
    report = {'task':c['task'],'status':'RUNNING','unit':unit,'runner_pid':os.getpid(),'contract_sha256':CONTRACT,'helper_sha256':sha(Path(__file__).read_bytes()),'argv':args,'functional_receipts':0}
    start = time.monotonic()
    with (HERE/'acquisition.stdout.log').open('xb') as out,(HERE/'acquisition.stderr.log').open('xb') as err:
        p = subprocess.Popen(args,env=env,stdout=out,stderr=err);report['child_pid'] = p.pid;(HERE/'live.json').write_text(json.dumps(report,indent=2)+'\n');p.wait(timeout=620)
    report.update({'status':'TERMINAL','exit':p.returncode,'elapsed_seconds':round(time.monotonic()-start,3),'stdout_sha256':sha((HERE/'acquisition.stdout.log').read_bytes()),'stderr_sha256':sha((HERE/'acquisition.stderr.log').read_bytes()),'kernel_guard':(HERE/'acquisition.stderr.log').read_text().startswith('CVG_KERNEL_LIMITS ')})
    report['scope_active_state'] = subprocess.run(['systemctl','--user','show',unit,'-p','ActiveState','--value'],env=env,capture_output=True,text=True,timeout=10).stdout.strip()
    (HERE/'live.json').write_text(json.dumps(report,indent=2)+'\n');(HERE/'run.json').write_text(json.dumps(report,indent=2)+'\n')
    if p.returncode == 0:
        (HERE/'acquisition.json').write_bytes((root/'acquisition.json').read_bytes());(HERE/'gpgv.stdout.log').write_bytes((root/'gpgv.stdout.log').read_bytes());(HERE/'gpgv.stderr.log').write_bytes((root/'gpgv.stderr.log').read_bytes())
    print(json.dumps({k:report[k] for k in ['status','exit','unit','kernel_guard','scope_active_state','elapsed_seconds']}));need(p.returncode == 0 and report['kernel_guard'],'native input acquisition failed')

if __name__ == '__main__':
    if '--child' in sys.argv:child()
    else:parent()
