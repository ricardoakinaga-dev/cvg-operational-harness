#!/usr/bin/env python3
"""Trusted, owned containment preflight. No upstream code, download or install."""
from pathlib import Path
import hashlib
import json
import os
import platform
import shutil
import signal
import socket
import subprocess
import threading
import time

HERE = Path(__file__).resolve().parent
CONTRACT = '3d5ba72d6c11de4f58b7eff7b395341abfb8c7d4f9beecf56e5e88d4672e1c56'
sha = lambda b: hashlib.sha256(b).hexdigest()


def run(argv, timeout=15):
    started = time.monotonic()
    try:
        p = subprocess.Popen(argv,stdout=subprocess.PIPE,stderr=subprocess.PIPE,
                             env={'PATH':'/usr/bin:/bin','LANG':'C.UTF-8'},start_new_session=True)
    except OSError as e:
        return {'argv':argv,'exit':None,'error':str(e),'operation':'NOT_STARTED'}
    timed_out = False
    try:out,err = p.communicate(timeout=timeout)
    except subprocess.TimeoutExpired:
        timed_out = True
        try:os.killpg(p.pid,signal.SIGKILL)
        except ProcessLookupError:pass
        out,err = p.communicate(timeout=3)
    return {'argv':argv,'exit':p.returncode,'timed_out':timed_out,
            'stdout':out.decode(errors='replace'),'stderr':err.decode(errors='replace'),
            'elapsed_seconds':round(time.monotonic()-started,3)}


def main():
    raw = (HERE/'contract.json').read_bytes()
    if sha(raw) != CONTRACT:raise ValueError('preflight contract changed')
    c = json.loads(raw);tmp = Path(c['roots']['resources'])
    config = tmp/'docker-config';config.mkdir(exist_ok=True)
    outdir = tmp/'sandbox-out';outdir.mkdir(exist_ok=True)
    sentinel = tmp/'host-sentinel.txt';sentinel.write_text('SYNTHETIC_HOST_ONLY\n')
    tools = {name:shutil.which(name) for name in ['bwrap','unshare','docker','rustc','cargo','rustup','cc','clang','pkg-config']}
    disk = shutil.disk_usage(tmp)
    report = {'kind':'TRUSTED_REFERENCE_ENVIRONMENT_PREFLIGHT_NOT_TARGET_EXECUTION',
              'contract_sha256':CONTRACT,'reader_sha256':sha(Path(__file__).read_bytes()),
              'host':{'system':platform.system(),'machine':platform.machine(),'cpu_count':os.cpu_count(),
                      'resource_disk_free_bytes':disk.free,'resource_disk_total_bytes':disk.total},
              'tools':tools,'commands':[],'upstream_executed':False,'upstream_compiled':False,
              'downloaded':False,'installed':False,'container_started':False,'functional_receipts':0}
    if tools['bwrap']:
        report['commands'].append(run([tools['bwrap'],'--version']))
        listener = socket.socket();listener.bind(('127.0.0.1',0));listener.listen();listener.settimeout(.1)
        port = listener.getsockname()[1];stop = threading.Event();connections = []
        def serve():
            while not stop.is_set():
                try:
                    conn,_ = listener.accept();connections.append(True)
                    with conn:conn.sendall(b'OWNED_SYNTHETIC_ACK')
                except socket.timeout:continue
                except OSError:return
        worker = threading.Thread(target=serve);worker.start()
        code = '''import json,os,socket,sys
from pathlib import Path
p=Path('/work/out/allowed.txt');p.write_text('SYNTHETIC_ALLOWED')
ro=False
try:Path('/usr/codex100-owned-probe.txt').write_text('SYNTHETIC')
except OSError:ro=True
outside=Path(sys.argv[1]).exists()
net=False
try:
 s=socket.create_connection(('127.0.0.1',int(sys.argv[2])),timeout=1);s.close();net=True
except OSError:pass
print(json.dumps({'owned_write':p.read_text()=='SYNTHETIC_ALLOWED','usr_readonly':ro,'host_sentinel_inaccessible':not outside,'owned_host_listener_unreachable':not net,'pid_namespace':os.readlink('/proc/self/ns/pid'),'network_namespace':os.readlink('/proc/self/ns/net')}))
'''
        argv = [tools['bwrap'],'--unshare-all','--new-session','--die-with-parent','--ro-bind','/usr','/usr']
        for lib in ['/lib','/lib64']:
            if Path(lib).exists():argv += ['--ro-bind',lib,lib]
        argv += ['--proc','/proc','--dev','/dev','--tmpfs','/tmp','--dir','/work','--bind',str(outdir),'/work/out','--chdir','/work','/usr/bin/python3','-I','-c',code,str(sentinel),str(port)]
        result = run(argv)
        stop.set();listener.close();worker.join(timeout=2)
        report['commands'].append(result)
        bounded = None
        if result.get('exit') == 0:
            try:bounded = json.loads(result['stdout'])
            except ValueError:pass
        guards = ['owned_write','usr_readonly','host_sentinel_inaccessible','owned_host_listener_unreachable']
        report['bwrap'] = {'status':'BOUNDED_TRUSTED_PROBES_PASS' if bounded and all(bounded.get(k) is True for k in guards) and not connections and not worker.is_alive() else 'NOT_PROVEN_DO_NOT_EXECUTE_UPSTREAM',
                           'guards':bounded,'owned_listener_connections':len(connections),'owned_listener_closed':True,'owned_thread_stopped':not worker.is_alive(),
                           'limits':'These specific probes do not certify public CVG sandbox or all syscall/resource confinement.'}
    else:report['bwrap'] = {'status':'UNAVAILABLE_DO_NOT_EXECUTE_UPSTREAM'}
    if tools['docker']:
        argv = [tools['docker'],'--config',str(config),'--host','unix:///var/run/docker.sock','version','--format','{{.Server.Version}}|{{.Server.Os}}|{{.Server.Arch}}|{{.Server.APIVersion}}']
        result = run(argv);report['commands'].append(result)
        report['docker'] = {'status':'LOCAL_DAEMON_OBSERVED_ISOLATION_UNTESTED' if result.get('exit') == 0 else 'LOCAL_DAEMON_UNAVAILABLE','configuration':'empty task-specific config; explicit local Unix socket; no personal config or remote daemon','no_container_started':True}
        if result.get('exit') == 0:
            result = run([tools['docker'],'--config',str(config),'--host','unix:///var/run/docker.sock','image','inspect','rust:1.95.0-bookworm','--format','{{.Id}}|{{.Os}}|{{.Architecture}}|{{json .RepoDigests}}'])
            report['commands'].append(result);report['docker']['requested_official_image_cached'] = result.get('exit') == 0
    else:report['docker'] = {'status':'DOCKER_CLI_UNAVAILABLE'}
    report['next_boundary'] = 'Select and specify contained toolchain acquisition/build only after evaluating these actual results; no target execution is authorized by Docker metadata alone.'
    (HERE/'preflight.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'bwrap':report['bwrap']['status'],'docker':report['docker']['status'],'rustc_path':tools['rustc'],'cargo_path':tools['cargo'],'functional_receipts':0,'upstream_executed':False}))


if __name__ == '__main__':
    main()
