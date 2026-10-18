from pathlib import Path
import hashlib
import json
import os
import runpy
import selectors
import shutil
import signal
import subprocess
import time
import uuid

HERE = Path(__file__).resolve().parent
ROOT = Path('/tmp/cvg-codex100-exec-20261017/reuse-native-delivery-probe')
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()


def save(path, value):
    path.write_text(json.dumps(value, indent=2) + '\n')


def owned_bytes():
    total = 0
    def failed(exc):
        if not isinstance(exc, FileNotFoundError):
            raise exc
    for directory, _, names in os.walk(ROOT, onerror=failed, followlinks=False):
        for name in names:
            path = Path(directory) / name
            try:
                total += path.lstat().st_size
            except FileNotFoundError:
                pass
    return total


def main():
    contract = json.loads((HERE / 'contract.json').read_text())
    limits = contract['limits']
    old = HERE / 'live.json'
    previous = json.loads(old.read_text()) if old.exists() else None
    repair = None
    if previous is not None:
        assert previous['status'] == 'TERMINAL', 'inspect same live diagnostic; never duplicate it'
        repair = json.loads((HERE / 'fixture-repair-addendum.json').read_text())
        assert previous['unit'] == repair['prior_unit'] and sha(HERE / 'terminal.json') == repair['prior_terminal_sha256'], 'bounded retry already used or prior report changed'
    provenance = json.loads((ROOT / 'bundle-provenance.json').read_text())
    assert sha(Path(provenance['bundle']['path'])) == provenance['bundle']['sha256']
    for row in provenance['inputs']:
        assert sha(Path(row['path'])) == row['sha256'], 'bundle input drift'
    helper = HERE.parents[1] / 'g02/keyless-cli-probe/run.py'
    review = json.loads((helper.parent / 'review-status.json').read_text())
    assert review['status'] == 'APPROVED_BOUNDED_HOW' and sha(helper) == review['input_sha256']['run.py']
    inspect_scope = runpy.run_path(str(helper), run_name='trusted_scope_inspection_only')['inspect_scope']
    if previous is not None:
        uid = os.getuid()
        check_env = {'PATH': '/usr/bin:/bin', 'XDG_RUNTIME_DIR': '/run/user/' + str(uid), 'DBUS_SESSION_BUS_ADDRESS': 'unix:path=/run/user/' + str(uid) + '/bus'}
        assert inspect_scope(previous['unit'], check_env, previous['kernel_proof']['group'])['cleanup_verified'], 'previous owned scope not freshly empty'
    main_build = json.loads((HERE.parents[1] / 'g02/reference-compilation/live.json').read_text())
    q = subprocess.run(['systemctl', '--user', 'show', main_build['unit'], '-p', 'ActiveState', '-p', 'MemoryCurrent'], capture_output=True, text=True, timeout=10)
    assert q.returncode == 0
    fields = dict(line.split('=', 1) for line in q.stdout.splitlines() if '=' in line)
    available = int(next(line.split()[1] for line in Path('/proc/meminfo').read_text().splitlines() if line.startswith('MemAvailable:'))) * 1024
    remaining = max(0, limits['aggregate_main_max_bytes'] - int(fields['MemoryCurrent'])) if fields.get('ActiveState') == 'active' else 0
    assert available - remaining >= limits['memory_bytes'] + limits['extra_reserve_bytes'], 'insufficient aggregate memory headroom'
    assert shutil.disk_usage(ROOT).free >= limits['minimum_free_disk_bytes'] and owned_bytes() <= limits['monitored_owned_bytes']
    (ROOT / 'output').mkdir(exist_ok=False)
    unit = 'cvg-codex100-reuse-delivery-' + uuid.uuid4().hex[:10] + '.scope'
    command = ['/usr/bin/systemd-run', '--user', '--scope', '--collect', '--quiet', '--unit', unit,
               '-p', 'MemoryMax=2147483648', '-p', 'MemorySwapMax=0', '-p', 'CPUQuota=100%', '-p', 'TasksMax=128', '-p', 'RuntimeMaxSec=120',
               '/usr/bin/python3', '-I', str(HERE / 'guard.py'), unit]
    uid = os.getuid()
    env = {'PATH': '/usr/bin:/bin', 'LANG': 'C.UTF-8', 'XDG_RUNTIME_DIR': '/run/user/' + str(uid), 'DBUS_SESSION_BUS_ADDRESS': 'unix:path=/run/user/' + str(uid) + '/bus'}
    report = {'unit': unit, 'command': command, 'contract_sha256': sha(HERE / 'contract.json'), 'bundle_sha256': provenance['bundle']['sha256'],
              'scope_helper_sha256': sha(helper), 'guard_sha256': sha(HERE / 'guard.py'), 'runner_sha256': sha(Path(__file__)),
              'aggregate_headroom': {'available': available, 'main_remaining_allowance': remaining, 'own_memory': limits['memory_bytes'], 'reserve': limits['extra_reserve_bytes']},
              'status': 'PREPARED', 'functional_receipts': 0, 'native_feature_BUILD': False}
    report['attempt_number'] = 2 if repair is not None else 1
    report['fixture_repair_addendum_sha256'] = sha(HERE / 'fixture-repair-addendum.json') if repair is not None else None
    save(HERE / 'launch.json', report)
    files = {name: (ROOT / ('scope.' + name + '.log')).open('xb') for name in ['stdout', 'stderr']}
    selector = selectors.DefaultSelector()
    proc = None
    first = None
    secondary = []
    group = None
    cleanup = {'cleanup_verified': False}
    started = time.monotonic()
    captured = {name: bytearray() for name in files}
    try:
        proc = subprocess.Popen(command, env=env, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True, close_fds=True)
        report.update(status='RUNNING', runner_pid=os.getpid(), child_pid=proc.pid)
        save(HERE / 'live.json', report)
        for name in files:
            descriptor = getattr(proc, name)
            os.set_blocking(descriptor.fileno(), False)
            selector.register(descriptor, selectors.EVENT_READ, name)
        while selector.get_map():
            assert time.monotonic() - started < 125, 'own diagnostic deadline'
            assert owned_bytes() <= limits['monitored_owned_bytes'], 'own storage limit'
            assert shutil.disk_usage(ROOT).free >= limits['minimum_free_disk_bytes'], 'disk reserve'
            for key, _ in selector.select(0.1):
                chunk = os.read(key.fd, 65536)
                if not chunk:
                    selector.unregister(key.fileobj)
                    continue
                files[key.data].write(chunk)
                files[key.data].flush()
                captured[key.data].extend(chunk)
                assert sum(map(len, captured.values())) < 8 * 1024 * 1024, 'capture cap'
        code = proc.wait(timeout=3)
        assert code == 0, 'native probe exited ' + str(code)
    except BaseException as exc:
        first = {'type': type(exc).__name__, 'message': str(exc)}
        save(HERE / 'first-supervisor-failure.json', first)
    finally:
        try:
            line = bytes(captured['stderr']).split(b'\n', 1)[0]
            prefix = b'CVG_REUSE_KERNEL '
            assert line.startswith(prefix), 'trusted kernel guard absent'
            proof = json.loads(line[len(prefix):])
            assert proof['unit'] == unit
            group = proof['group']
            report['kernel_proof'] = proof
            for _ in range(20):
                cleanup = inspect_scope(unit, env, group)
                if cleanup['cleanup_verified']:
                    break
                time.sleep(0.1)
            if not cleanup['cleanup_verified']:
                killed = subprocess.run(['systemctl', '--user', 'kill', '--kill-whom=all', '--signal=SIGKILL', unit], env=env, capture_output=True, text=True, timeout=10)
                report['kill'] = {'exit': killed.returncode, 'stderr': killed.stderr}
                assert killed.returncode == 0, 'owned kill failed'
                if proc is not None:
                    proc.wait(timeout=10)
                cleanup = inspect_scope(unit, env, group)
                assert cleanup['cleanup_verified'], 'owned cgroup remains populated'
        except BaseException as exc:
            secondary.append({'where': 'cleanup', 'type': type(exc).__name__, 'message': str(exc)})
            if proc is not None and proc.poll() is None:
                try:
                    os.killpg(proc.pid, signal.SIGKILL)
                    proc.wait(timeout=10)
                except BaseException as extra:
                    secondary.append({'where': 'own group fallback', 'type': type(extra).__name__, 'message': str(extra)})
        selector.close()
        for file in files.values():
            file.close()
        report.update(status='TERMINAL', exit=proc.returncode if proc is not None else None, first_failure=first, secondary_failures=secondary,
                      cleanup=cleanup, elapsed_seconds=round(time.monotonic() - started, 3), owned_storage_final=owned_bytes())
        save(HERE / 'live.json', report)
        save(HERE / 'terminal.json', report)
    assert first is None and not secondary and report['exit'] == 0 and cleanup['cleanup_verified'], 'diagnostic not accepted; preserve first failure'
    assert owned_bytes() <= limits['monitored_owned_bytes'] and shutil.disk_usage(ROOT).free >= limits['minimum_free_disk_bytes']
    for row in provenance['inputs']:
        assert sha(Path(row['path'])) == row['sha256'], 'source input changed'
    assert sha(ROOT / 'probe.mjs') == provenance['bundle']['sha256']
    dest = HERE / 'raw'
    dest.mkdir(exist_ok=False)
    for path in sorted(ROOT.rglob('*')):
        if path.is_file() and 'source-view' not in path.parts:
            target = dest / path.relative_to(ROOT)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(path, target)
    print(json.dumps({'unit': unit, 'exit': report['exit'], 'cleanup_verified': True, 'elapsed_seconds': report['elapsed_seconds'], 'source_inputs_unchanged': len(provenance['inputs']), 'functional_receipts': 0}))


if __name__ == '__main__':
    main()
