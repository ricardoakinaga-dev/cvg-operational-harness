#!/usr/bin/env python3
"""Launch the finite reference probe only after terminal compiled-byte attestation."""
from pathlib import Path
import datetime
import hashlib
import json
import os
import signal
import shutil
import subprocess
import sys
import time
import uuid

HERE = Path(__file__).resolve().parent
BUILD = HERE.parent / 'reference-compilation'


def sha(path):
    with path.open('rb') as f:
        return hashlib.file_digest(f, 'sha256').hexdigest()


def save(path, value):
    path.write_text(json.dumps(value, indent=2) + '\n')


def storage(path):
    total = 0
    def onerror(exc):
        if not isinstance(exc, FileNotFoundError):
            raise exc
    for directory, dirs, files in os.walk(path, followlinks=False, onerror=onerror):
        for name in files:
            p = Path(directory) / name
            try:
                size = p.lstat().st_size
            except FileNotFoundError:
                continue  # concurrently removed private SQLite/temp file, contributes no storage
            total += size
    return total


def inspect_scope(scope, env, kernel_group):
    q = subprocess.run(['systemctl', '--user', 'show', scope, '-p', 'LoadState',
                        '-p', 'ActiveState', '-p', 'ControlGroup'],
                       env=env, capture_output=True, text=True, timeout=10)
    assert q.returncode == 0, 'scope query failed: ' + q.stderr[:500]
    fields = dict(line.split('=', 1) for line in q.stdout.splitlines() if '=' in line)
    assert fields.get('LoadState') in ['loaded', 'not-found'], 'unknown scope load state'
    assert fields.get('ActiveState') in ['active', 'inactive', 'failed', 'deactivating'], 'unknown scope activity'
    if fields.get('ControlGroup'):
        assert fields['ControlGroup'] == kernel_group, 'scope cgroup differs from trusted guard'
    populated = None
    if kernel_group:
        assert kernel_group.endswith('/' + scope) and '..' not in kernel_group.split('/')
        path = Path('/sys/fs/cgroup') / kernel_group.lstrip('/')
        try:
            events = dict(line.split() for line in (path / 'cgroup.events').read_text().splitlines())
            populated = events['populated']
        except FileNotFoundError:
            assert not path.exists(), 'partial cgroup inspection'
            populated = 'REMOVED'
    inactive = fields.get('ActiveState') in ['inactive', 'failed']
    empty = populated in ['0', 'REMOVED']
    return {'query_exit': q.returncode, 'query_stderr': q.stderr, **fields,
            'kernel_group': kernel_group, 'cgroup_populated': populated,
            'cleanup_verified': inactive and empty}


def main():
    c = json.loads((HERE / 'contract.json').read_text())
    review = json.loads((HERE / 'review-status.json').read_text())
    assert review['status'] == 'APPROVED_BOUNDED_HOW', 'HOW review not yet accepted; no execution'
    for name in ['contract.json', 'driver.py', 'run.py', 'target-guard.py', 'cases.json']:
        assert sha(HERE / name) == review['input_sha256'][name], 'reviewed control drift'
    for row in c['executable_control_inputs']:
        assert sha(Path(row['path'])) == row['sha256'], 'verifier/control chain drift'
    for row in c['source_inputs']:
        assert sha(Path(c['upstream']) / row['path']) == row['sha256'], 'source input drift'
    assert sha(HERE / 'driver.py') == c['driver_sha256'], 'probe driver changed after contract'
    run = json.loads((BUILD / 'live.json').read_text())
    assert run['attempt'] == c['expected_build']['attempt'] and run['unit'] == c['expected_build']['unit'], 'different build identity'
    assert run['status'] == 'TERMINAL' and run['exit'] == 0 and not run['abort_reason'], 'same build not yet successful'
    # Recheck the terminal build provenance and its readonly trees before any ELF execution.
    verified = subprocess.run(['/usr/bin/python3', '-I', str(BUILD / 'verify-build.py'), '--check'],
                              check=True, capture_output=True, timeout=240)
    provenance = json.loads((BUILD / 'build-provenance.json').read_text())
    assert provenance['pin'] == c['pin'] and provenance['attempt'] == c['expected_build']['attempt'], 'different provenance pin/attempt'
    assert run['contract_sha256'] == c['expected_build']['base_contract_sha256'], 'different build contract'
    assert provenance['attempt_report_sha256'] == sha(BUILD / (run['attempt'] + '.json')), 'different terminal record'
    artifact = Path(provenance['artifact']['path'])
    assert not artifact.is_symlink() and artifact.is_file()
    assert artifact.stat().st_size == provenance['artifact']['bytes'] and sha(artifact) == provenance['artifact']['sha256']
    mem = int(next(line.split()[1] for line in Path('/proc/meminfo').read_text().splitlines()
                   if line.startswith('MemAvailable:'))) * 1024
    assert mem >= c['minimum_available_memory_bytes'], 'insufficient current memory headroom'
    resource = Path(c['resource_root'])
    resource.mkdir(parents=True, exist_ok=True)
    assert shutil.disk_usage(resource).free >= c['minimum_free_disk_bytes'], 'insufficient disk'
    attempt = 'settled-' + uuid.uuid4().hex[:10]
    work = resource / attempt
    work.mkdir(exist_ok=False)
    control = resource / (attempt + '-control')
    control.mkdir(exist_ok=False)
    home = work / 'home'
    (home / '.codex').mkdir(parents=True)
    (home / '.codex/config.toml').write_text(c['synthetic_config_toml'])
    (control / 'driver.py').write_bytes((HERE / 'driver.py').read_bytes())
    (control / 'target-guard.py').write_bytes((HERE / 'target-guard.py').read_bytes())
    (control / 'base-driver.py').write_bytes(Path(c['base_driver_input']['path']).read_bytes())
    (control / 'cases.json').write_bytes((HERE / 'cases.json').read_bytes())
    (control / 'environment.json').write_text(json.dumps(c['environment']))
    save(control / 'host-namespaces.json', {k: os.readlink('/proc/self/ns/' + k) for k in ['net', 'mnt', 'pid']})
    uid, gid = os.getuid(), os.getgid()
    (control / 'passwd').write_text(f'cvgprobe:x:{uid}:{gid}:Synthetic reference:/reference-home:/usr/sbin/nologin\n')
    (control / 'group').write_text(f'cvgprobe:x:{gid}:\n')
    scope = 'cvg-codex100-ref-probe-' + attempt + '.scope'
    env = {'PATH': '/usr/bin:/bin', 'LANG': 'C.UTF-8',
           'XDG_RUNTIME_DIR': '/run/user/' + str(uid),
           'DBUS_SESSION_BUS_ADDRESS': 'unix:path=/run/user/' + str(uid) + '/bus'}
    guard = """import pathlib,json,os,sys
cg=pathlib.Path('/proc/self/cgroup').read_text().strip().split('::',1)[1]
p=pathlib.Path('/sys/fs/cgroup')/cg.lstrip('/')
v={k:(p/k).read_text().strip() for k in ['memory.max','memory.swap.max','pids.max','cpu.max']}
assert v['memory.max']=='4294967296' and v['memory.swap.max']=='0' and v['pids.max']=='256'
cpu=v['cpu.max'].split();assert cpu[0]!='max' and int(cpu[0])/int(cpu[1])==2
assert cg.endswith('/'+sys.argv[1]),'unexpected scope'
print('CVG_REFERENCE_PROBE_KERNEL '+json.dumps({'cgroup':cg,'limits':v}),file=sys.stderr,flush=True)
os.execv(sys.argv[2],sys.argv[2:])"""
    sandbox = ['/usr/bin/bwrap', '--unshare-all', '--new-session', '--die-with-parent',
               '--clearenv', '--cap-drop', 'ALL', '--ro-bind', '/usr', '/usr',
               '--ro-bind', '/lib', '/lib', '--ro-bind', '/lib64', '/lib64',
               '--symlink', 'usr/bin', '/bin', '--proc', '/proc', '--dev', '/dev',
               '--tmpfs', '/tmp', '--dir', '/etc', '--dir', '/reference',
               '--ro-bind', str(artifact), '/reference/codex',
               '--ro-bind', c['native_sysroot'], '/native',
               '--ro-bind', str(control), '/control',
               '--ro-bind', str(control / 'passwd'), '/etc/passwd',
               '--ro-bind', str(control / 'group'), '/etc/group',
               '--bind', str(home), '/reference-home', '--bind', str(work), '/work',
               '--chdir', '/work']
    for k, v in c['environment'].items():
        sandbox.extend(['--setenv', k, v])
    sandbox.extend(['/usr/bin/python3', '-I', '/control/driver.py'])
    command = ['/usr/bin/systemd-run', '--user', '--scope', '--collect', '--quiet', '--unit', scope,
               '-p', 'MemoryMax=4294967296', '-p', 'MemorySwapMax=0', '-p', 'CPUQuota=200%',
               '-p', 'TasksMax=256', '-p', 'RuntimeMaxSec=180',
               '/usr/bin/python3', '-I', '-c', guard, scope, *sandbox]
    report = {'task': c['task'], 'attempt': attempt, 'scope': scope, 'status': 'PREPARED',
              'started_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'command': command, 'contract_sha256': sha(HERE / 'contract.json'),
              'runner_sha256': sha(Path(__file__)), 'driver_sha256': sha(HERE / 'driver.py'),
              'build_provenance_sha256': sha(BUILD / 'build-provenance.json'),
              'reference_artifact': provenance['artifact'], 'work': str(work),
              'memory_available_at_launch': mem, 'functional_parity_receipts': 0}
    save(work / 'attempt.json', report)
    dest = HERE / attempt
    dest.mkdir(exist_ok=False)
    save(dest / 'launch.json', report)
    started = time.monotonic()
    cause = None
    secondary = []
    proc = None
    code = None
    try:
        with (work / 'supervisor.stdout.log').open('xb') as stdout, (work / 'supervisor.stderr.log').open('xb') as stderr:
            proc = subprocess.Popen(command, env=env, stdout=stdout, stderr=stderr, start_new_session=True, close_fds=True)
            report.update(status='RUNNING', runner_pid=os.getpid(), child_pid=proc.pid)
            save(HERE / 'live.json', report)
            while proc.poll() is None:
                assert time.monotonic() - started < 185, 'supervisor timeout'
                assert storage(work) <= c['monitored_storage_limit_bytes'], 'private storage cap exceeded'
                assert shutil.disk_usage(work).free >= c['abort_free_disk_bytes'], 'free disk threshold'
                time.sleep(0.25)
            code = proc.wait()
            if code != 0:
                driver_failure = work / 'output/first-failure.json'
                cause = {'type': 'DriverExit', 'exit': code,
                         'driver_first_failure': json.loads(driver_failure.read_text()) if driver_failure.exists() else None}
    except BaseException as exc:
        cause = {'type': type(exc).__name__, 'message': str(exc)}
    finally:
        def fail(where, exc):
            nonlocal cause
            record = {'where': where, 'type': type(exc).__name__, 'message': str(exc)}
            if cause is None:
                cause = record
            else:
                secondary.append(record)
            try:
                save(dest / 'first-supervisor-failure.json', cause)
            except BaseException as write_error:
                secondary.append({'where': 'write first supervisor failure', 'type': type(write_error).__name__})
        if cause is not None:
            try:
                save(dest / 'first-supervisor-failure.json', cause)
            except BaseException as exc:
                secondary.append({'where': 'persist primary cause', 'type': type(exc).__name__})
        group = None
        inspection = {'cleanup_verified': False, 'ActiveState': 'UNKNOWN'}
        try:
            line = (work / 'supervisor.stderr.log').read_bytes().split(b'\n', 1)[0]
            prefix = b'CVG_REFERENCE_PROBE_KERNEL '
            assert line.startswith(prefix), 'no trusted pre-target kernel proof'
            proof = json.loads(line[len(prefix):])
            group = proof['cgroup']
            assert group.endswith('/' + scope)
            report['kernel_proof'] = proof
            for _ in range(20):
                inspection = inspect_scope(scope, env, group)
                if inspection['cleanup_verified']:
                    break
                time.sleep(0.1)
        except BaseException as exc:
            fail('initial cleanup inspection', exc)
        if not inspection['cleanup_verified']:
            if cause is None:
                fail('residual scope', RuntimeError('scope/cgroup not verified empty'))
            try:
                killed = subprocess.run(['systemctl', '--user', 'kill', '--kill-whom=all', '--signal=SIGKILL', scope],
                                        env=env, capture_output=True, text=True, timeout=10)
                report['kill_result'] = {'exit': killed.returncode, 'stdout': killed.stdout, 'stderr': killed.stderr}
                if killed.returncode != 0:
                    fail('scope kill', RuntimeError(killed.stderr[:500]))
            except BaseException as exc:
                fail('scope kill', exc)
            if proc is not None and proc.poll() is None:
                try:
                    os.killpg(proc.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                except BaseException as exc:
                    fail('own supervisor process-group fallback', exc)
        if proc is not None:
            try:
                code = proc.wait(timeout=10)
            except BaseException as exc:
                fail('wait own supervisor', exc)
        try:
            for _ in range(20):
                inspection = inspect_scope(scope, env, group)
                if inspection['cleanup_verified']:
                    break
                time.sleep(0.1)
            assert inspection['cleanup_verified'], 'scope/cgroup cleanup unknown or populated'
        except BaseException as exc:
            fail('final cleanup inspection', exc)
        copied = 0
        final_storage = None
        try:
            final_storage = storage(work)
            assert final_storage <= c['monitored_storage_limit_bytes'], 'terminal storage cap exceeded'
            assert shutil.disk_usage(work).free >= c['abort_free_disk_bytes'] + final_storage, 'insufficient final preservation reserve'
            # Only after the exact scope is proven empty can target-owned data be copied.
            assert inspection['cleanup_verified'], 'unsafe preservation while scope state unknown'
            for path in sorted(work.rglob('*')):
                if path.is_file() and not path.is_symlink():
                    count = path.stat().st_size
                    assert copied + count <= c['preservation_limit_bytes'], 'preservation byte cap exceeded'
                    target = dest / 'raw' / path.relative_to(work)
                    target.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copyfile(path, target)
                    copied += count
            for path in control.iterdir():
                count = path.stat().st_size
                assert copied + count <= c['preservation_limit_bytes'], 'control preservation byte cap'
                target = dest / 'raw/control' / path.name
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(path, target)
                copied += count
        except BaseException as exc:
            fail('terminal storage/preservation', exc)
        report.update(status='TERMINAL', exit=code, first_supervisor_failure=cause,
                      elapsed_seconds=round(time.monotonic() - started, 3), scope_now=inspection['ActiveState'],
                      cleanup=inspection, secondary_failures=secondary,
                      final_storage_bytes=final_storage, preserved_bytes=copied)
        try:
            report['reference_unchanged'] = sha(artifact) == provenance['artifact']['sha256']
            journal = subprocess.run(['journalctl', '--user', '-u', scope, '--no-pager', '-o', 'short-iso'],
                                     env=env, capture_output=True, timeout=15)
            (dest / 'unit.journal.log').write_bytes(journal.stdout + journal.stderr)
        except BaseException as exc:
            fail('artifact/journal finalization', exc)
            report['first_supervisor_failure'] = cause
        # Terminal result is not contingent on successful journal/copy/cleanup.
        save(dest / 'terminal.json', report)
        save(HERE / 'live.json', report)
    print(json.dumps({k: report.get(k) for k in ['attempt', 'status', 'exit', 'first_supervisor_failure', 'elapsed_seconds', 'scope_now', 'reference_unchanged']}))
    assert code == 0 and cause is None and report.get('reference_unchanged') is True, 'probe did not succeed; preserve raw first failure'
    proof = dest / 'raw/output/namespace-proof.json'
    assert proof.is_file() and (dest / 'raw/output/observations.json').is_file()
    assert report['cleanup']['cleanup_verified'] and report['kernel_proof']


if __name__ == '__main__':
    main()
