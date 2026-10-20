"""Offline self-tests of DX100-G02:IMPLEMENT-AND-ADMIT-SDK-DISTRIBUTED-PROFILE-DP-1 (no service, no SDK, no cache file executed).

Usage: python3 -I -B selftests/selftest_dp1.py   (cwd = unit folder) -> selftests/selftest-results.json
Runs the Node self-test (selftest_dp1_driver.mjs) with the pinned Node, then the host-side tests:
- frozen table (EDP-01, R3-12): every predicate of every DP-1 case is in the table with a known class; copied predicate unchanged;
- stage (DDP-02, DDP-11): fixture materialization of every kind, tamper detection, /dist manifest equal to artifact-metadata.json;
- observer: BLOB rebuild, gap and digest refusal, driver_only reconcile (erratum DP-SPEC/R2-F01);
- erratum DP-SPEC/R2-F01 mandatory self-tests: a complete synthetic driver_only capture gives PASS; the same with an adapter frame
  gives INVALID_CAPTURE; a synthetic DP1-CTRL01 capture gives MISMATCH only by wrap.exit_mirror_exact (rule 6); with the mirrored
  code it gives PASS_CLIENT_OBSERVATION; a wrapper killed by a signal in a PASS_DECLARED_TERMINATION case gives MISMATCH by the
  predicate (rule 6), not by the form;
- composition, artifact evaluator (export parser), CONTROL gate inputs.
"""
import base64
import hashlib
import importlib.util
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

sys.dont_write_bytecode = True
UNIT = Path(__file__).resolve().parent.parent
NODE = '/home/ricardo/.nvm/versions/node/v24.20.0/bin/node'
TMP_ROOT = '/mnt/dados/cvg-work/cvg-codex100-dp1-runtime-20261019/tmp'
results = []


def load(name, mod):
    spec = importlib.util.spec_from_file_location(mod, UNIT / 'dplane' / name)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


OBS = load('observer.py', 'st_obs')
STG = load('stage.py', 'st_stage')
ACC = load('acceptance.py', 'st_acc')


def t(name, fn):
    try:
        ok = fn()
        results.append({'name': name, 'ok': ok is True})
    except Exception as exc:  # noqa: BLE001
        results.append({'name': name, 'ok': False, 'error': ('%s: %s' % (type(exc).__name__, exc))[:300]})


def raises(fn):
    try:
        fn()
        return False
    except Exception:  # noqa: BLE001
        return True


def sha(b):
    return hashlib.sha256(b).hexdigest()


# ------------------------------------------------------------------------------------------------ Node self-test
def node_selftest():
    os.makedirs(TMP_ROOT, exist_ok=True)
    r = subprocess.run([NODE, str(UNIT / 'selftests' / 'selftest_dp1_driver.mjs'), str(UNIT)], capture_output=True, text=True, timeout=120,
                       cwd=TMP_ROOT, env={'PATH': '/usr/bin:/bin', 'HOME': TMP_ROOT, 'CVG_SELFTEST_TMP': TMP_ROOT})
    doc = json.loads(r.stdout.strip().splitlines()[-1])
    for x in doc['results']:
        results.append({'name': 'node: ' + x['name'], 'ok': x['ok'], **({'error': x['error']} if 'error' in x else {})})
    return doc


# ------------------------------------------------------------------------------------------------ frames
class Frames:
    def __init__(self, case, case_input_sha):
        self.attempt, self.nonce, self.case, self.seq, self.mono = 'a' * 40, 'b' * 40, case, 0, 1000
        self.src = 'c' * 64
        self.buf = bytearray()
        self.add('BEGIN', {'nonce': self.nonce, 'source_sha256': self.src, 'pid_namespace': 'pid:[4026532000]', 'case_input_sha256': case_input_sha})
        self.add('READY', {})

    def add(self, kind, data, role='driver'):
        e = {'v': 1, 'attempt': self.attempt, 'case': self.case, 'role': role, 'seq': self.seq, 'kind': kind, 'pid': 2, 'mono_ns': str(self.mono), 'data': data}
        p = json.dumps(e, separators=(',', ':'), ensure_ascii=False).encode()
        self.buf += len(p).to_bytes(4, 'big') + p
        self.seq += 1
        self.mono += 10

    def diag(self, name, detail):
        self.add('DIAGNOSTIC', {'milestone': name, 'detail': detail})

    def blob(self, name, data):
        b = data if isinstance(data, bytes) else json.dumps(data).encode()
        for off in range(0, len(b), 2048):
            part = b[off:off + 2048]
            self.add('BLOB', {'name': name, 'offset': off, 'base64': base64.b64encode(part).decode(), 'sha256': sha(part)})
        self.add('BLOB_END', {'name': name, 'bytes': len(b), 'sha256': sha(b)})

    def logs(self, adapter_frame=False):
        expect = {'attempt': self.attempt, 'case': self.case, 'nonce': self.nonce, 'source_sha256': self.src}
        d = OBS.RoleLog('driver', expect)
        d.feed(bytes(self.buf), 1)
        d.finish()
        a = OBS.RoleLog('adapter', dict(expect, source_sha256='0' * 64))
        p = OBS.RoleLog('peer', dict(expect, source_sha256='0' * 64))
        if adapter_frame:
            a.feed(b'\x00\x00\x00\x02{}', 1)
        a.finish()
        p.finish()
        return {'driver': d, 'adapter': a, 'peer': p}


OS_OK = {'checks': {k: True for k in ('admission_witness_ok', 'cgroup_limits_match', 'service_exited', 'cgroup_removed_or_empty', 'no_role_process_alive',
                                      'unit_collected', 'fifo_eof_all', 'supervisor_bound_not_hit', 'driver_exit_zero', 'case_artifact_budget',
                                      'service_output_within_cap')}}


def listing_rows(trees):
    rows = []
    for tr in trees:
        for e in tr['entries']:
            x = STG.expected_entry(e)
            row = {'path': e['path'], 'type': x['type']}
            if x['type'] == 'symlink':
                row['target'] = x['target']
            else:
                row['mode'] = x['mode']
            if x['type'] == 'file':
                row.update(bytes=x['bytes'], sha256=x['sha256'])
            rows.append(row)
    return rows


def witness_for(c):
    trees = c['case_input'].get('trees', [])
    host = {e['path']: STG.expected_entry(e) for tr in trees for e in tr['entries']}
    return {'os_checks': OS_OK['checks'], 'maps': {'ok': True, 'entries': [1], 'unknown': []}, 'cgroup_limits': {'memory.max': '1073741824', 'pids.max': '256', 'cpu.max': '100000 100000'},
            'limits_ok': True, 'driver_net_ns': 'net:[1]', 'host_net_ns': 'net:[2]',
            'stage_witness': {'archives': {a: STG.ARCHIVES[a]['observed']['sha256'] for a in STG.LAYOUT}, 'dist_manifest_equal': True},
            'fixture_manifest_host': host, 'fixture_problems_host': [], 'case_input_sha256_supervisor': c['case_input_sha256'],
            'case_input_sha256_recomputed': c['case_input_sha256'], 'control_actions': [], 'supervisor_kills': [], 'timed_out': False,
            'loader_json': {'sdk_entries': {}}}


def control_capture(wrapper_exit, adapter_frame=False):
    c = ACC.CASES_DEF['DP1-CTRL01']
    f = Frames('DP1-CTRL01', c['case_input_sha256'])
    f.diag('KEYLESS_WITNESS', {'net_devices': ['lo'], 'codex_home_present': False, 'home_entries': [], 'credential_vars_in_driver_env': []})
    f.blob('fixture-listing', listing_rows(c['case_input']['trees']))
    f.diag('CHILD_PROGRAM', {'step': 1, 'id': 'exit3'})
    f.diag('PROC_SAMPLE', {'step': 1, 'pids': []})
    f.diag('CHILD_RUN', {'step': 2, 'run': 1, 'program_id': 'exit3'})
    f.diag('WRAPPER_RESULT', {'step': 2, 'as': 'ctrl', 'run': 1, 'pid': 9, 'exit_code': wrapper_exit, 'signal': None, 'stdout_bytes': 0, 'stdout_sha256': sha(b''),
                              'stderr_bytes': 0, 'stderr_sha256': sha(b''), 'records': 1, 'shim': None, 'settled': 'close', 'elapsed_ms': 30})
    rec = {'pid': 11, 'exec_path': '/fixture/ctrl1/vendor/child', 'argv_tail': [], 'env': {'HOME': '/work/home', 'PATH': '/runtime'}, 'stdin': None, 'signals': [],
           'program_id': 'exit3', 'ready': False, 'declared_termination': {'exit_code': 3}, 'no_signal': False}
    f.blob('child-records:2', [rec])
    f.diag('LEFTOVER', {'step': 2, 'pids': [], 'states': []})
    f.diag('PROC_SAMPLE', {'step': 2, 'pids': []})
    f.diag('CALLS_DONE', {'source_sdk_claim': False, 'topology': 'driver_only'})
    f.add('END', {'streams': {}, 'child_exit_code': None, 'child_signal': None, 'complete': True})
    logs = f.logs(adapter_frame)
    verdict, reasons, _ = OBS.reconcile_driver_only(logs, OS_OK)
    return ACC.evaluate('DP1-CTRL01', logs, verdict, reasons, witness_for(c)), verdict


def pk06_signal_capture():
    """DP-PK06A shape with the e_fwd_term wrapper killed by SIGTERM: the form stays PASS_DECLARED_TERMINATION and the outcome is
    MISMATCH by wrap.exit_mirror_exact (rule 6), never by rule 2."""
    c = ACC.CASES_DEF['DP-PK06A']
    f = Frames('DP-PK06A', c['case_input_sha256'])
    f.diag('KEYLESS_WITNESS', {'net_devices': ['lo'], 'codex_home_present': False, 'home_entries': [], 'credential_vars_in_driver_env': []})
    f.blob('fixture-listing', listing_rows(c['case_input']['trees']))
    run = 0
    for s in c['case_input']['sdk_calls']:
        if s['api'] == 'child.program':
            f.diag('CHILD_PROGRAM', {'step': s['step'], 'id': s['id']})
        else:
            run += 1
            w = c['expected']['wrappers'][s['as']]
            prog = ACC.program_at(c, s['step'])
            f.diag('CHILD_RUN', {'step': s['step'], 'run': run, 'program_id': prog['id']})
            if s.get('send_signal'):
                f.diag('SIGNAL_SENT', {'step': s['step'], 'as': s['as'], 'signal': s['send_signal']['signal'], 'sent': True, 'after': 'CHILD_READY', 'ready_marker': 'ready-9',
                                       'sigcgt_bit_seen': True, 'waited_ms': 0, 'kill_ok': True, 'kill_error': None})
            code, sig = w['exit_code'], w['signal']
            if s['as'] == 'e_fwd_term':
                code, sig = None, 'SIGTERM'
            f.diag('WRAPPER_RESULT', {'step': s['step'], 'as': s['as'], 'run': run, 'pid': 9, 'exit_code': code, 'signal': sig, 'stdout_bytes': 0, 'stdout_sha256': sha(b''),
                                      'stderr_bytes': 0, 'stderr_sha256': sha(b''), 'records': 1, 'shim': None, 'settled': 'close', 'elapsed_ms': 30})
            if 'stderr_contains' in w:
                f.blob('stderr:%d' % s['step'], b'Error: spawn /fixture/pk06/noexec/x EACCES\n')
            recs = []
            if w.get('child_spawned') is not False:
                p = prog['program']
                dt = ACC.expected_declared_termination(p, {'signals': w.get('child_received', []), 'no_signal': False})
                recs = [{'pid': 11, 'exec_path': '/x', 'argv_tail': w.get('child_argv_tail', []), 'env': {}, 'stdin': None, 'signals': w.get('child_received', []),
                         'program_id': prog['id'], 'ready': bool(p.get('ready_barrier')), 'declared_termination': dt, 'no_signal': False}]
            f.blob('child-records:%d' % s['step'], recs)
            f.diag('LEFTOVER', {'step': s['step'], 'pids': [], 'states': []})
        f.diag('PROC_SAMPLE', {'step': s['step'], 'pids': []})
    f.diag('CALLS_DONE', {'source_sdk_claim': False, 'topology': 'driver_only'})
    f.add('END', {'streams': {}, 'child_exit_code': None, 'child_signal': None, 'complete': True})
    logs = f.logs()
    verdict, reasons, _ = OBS.reconcile_driver_only(logs, OS_OK)
    w = witness_for(c)
    return ACC.evaluate('DP-PK06A', logs, verdict, reasons, w)


def golden_capture(case):
    """Synthetic capture of a client that behaves exactly as frozen (the frames dp-driver.mjs emits), for the alignment check
    between the driver lane conventions and the evaluator: every DP-1 service case must give PASS_CLIENT_OBSERVATION."""
    c = ACC.CASES_DEF[case]
    exp = c['expected']
    f = Frames(case, c['case_input_sha256'])
    f.diag('KEYLESS_WITNESS', {'net_devices': ['lo'], 'codex_home_present': False, 'home_entries': [], 'credential_vars_in_driver_env': []})
    f.blob('fixture-listing', listing_rows(c['case_input'].get('trees', [])))
    calls_ = c['case_input']['sdk_calls']
    if any((s.get('module') or s.get('script') or '').startswith('/dist/') for s in calls_):
        f.blob('dist-manifest', {'/dist/' + k: v for k, v in STG.expected_dist().items()})
    api_items = {a['step']: a for a in exp.get('api', [])}
    children = list(exp.get('children') or []) if isinstance(exp.get('children'), list) else []
    run = 0
    for s in calls_:
        n = s['step']
        api = s['api']
        if api == 'import':
            f.add('API_RESULT', {'api': '%d:import' % n, 'result': None, 'observations': {'exports': ['Codex', 'Thread']}})
        elif api == 'shim.platform':
            f.diag('SHIM_SCOPE', {'step': n, 'action': 'apply', 'platform': s['platform'], 'arch': s['arch'], 'observed': [s['platform'], s['arch']]})
        elif api == 'shim.restore':
            f.diag('SHIM_SCOPE', {'step': n, 'action': 'restore', 'observed': ['linux', 'x64']})
        elif api in ('new Codex', 'startThread'):
            label = '%d:%s' % (n, api)
            if n in api_items and 'error' in api_items[n]:
                f.add('API_ERROR', {'api': label, 'name': api_items[n]['error']['name'], 'message': api_items[n]['error']['message'], 'cause': None})
            else:
                f.add('API_RESULT', {'api': label, 'result': None, 'observations': {}})
        elif api == 'probe' or api == 'file.sha256':
            pid = s['id']
            if pid in (exp.get('probes') or {}):
                f.diag('PROBE', {'step': n, 'id': pid, 'present': True, 'value': exp['probes'][pid]})
        elif api == 'child.program':
            f.diag('CHILD_PROGRAM', {'step': n, 'id': s['id']})
        elif api == 'run':
            run += 1
            prog = ACC.program_at(c, n)
            f.diag('CHILD_RUN', {'step': n, 'run': run, 'program_id': prog['id']})
            f.add('API_RESULT', {'api': '%d:Thread.run' % n, 'result': api_items[n]['result'], 'observations': {}})
            want = children.pop(0)
            env = {k: v for k, v in want['env'].items() if v is not None}
            f.blob('child-records:%d' % n, [{'pid': 11, 'exec_path': want['executed_path'], 'argv_tail': want['argv_tail'], 'env': env, 'stdin': want.get('stdin'),
                                             'signals': [], 'program_id': prog['id'], 'ready': False, 'declared_termination': {'exit_code': prog['program'].get('exit_code', 0)}, 'no_signal': False}])
            f.diag('LEFTOVER', {'step': n, 'pids': [], 'states': []})
        elif api == 'wrapper.run':
            run += 1
            prog = ACC.program_at(c, n)
            w = (exp.get('wrappers') or {}).get(s['as'], {})
            f.diag('CHILD_RUN', {'step': n, 'run': run, 'program_id': prog['id']})
            if s.get('send_signal'):
                f.diag('SIGNAL_SENT', {'step': n, 'as': s['as'], 'signal': s['send_signal']['signal'], 'sent': True, 'after': 'CHILD_READY', 'ready_marker': 'ready-9',
                                       'sigcgt_bit_seen': True, 'waited_ms': 0, 'kill_ok': True, 'kill_error': None})
            code = w.get('exit_code', (exp.get('wrappers_exit') or {}).get(s['as'], 0))
            f.diag('WRAPPER_RESULT', {'step': n, 'as': s['as'], 'run': run, 'pid': 9, 'exit_code': code, 'signal': w.get('signal'), 'stdout_bytes': 0,
                                      'stdout_sha256': sha(b''), 'stderr_bytes': 0, 'stderr_sha256': sha(b''), 'records': 0, 'shim': None, 'settled': 'close', 'elapsed_ms': 30})
            if w.get('stdout_contains'):
                f.blob('stdout:%d' % n, ('\n'.join(w['stdout_contains']) + '\n').encode())
            if w.get('stderr_contains'):
                f.blob('stderr:%d' % n, ('\n'.join(w['stderr_contains']) + '\n').encode())
            recs = []
            spawned = w.get('child_spawned') is not False and case != 'DP-REAL01'
            if spawned:
                p = prog['program']
                env = {}
                if isinstance(exp.get('children'), dict):
                    env = {k: v for k, v in exp['children'][s['as']].items() if v is not None}
                env.update({k: v for k, v in (w.get('child_env') or {}).items() if v is not None})
                rec = {'pid': 11, 'exec_path': w.get('child_executed_path', '/x'), 'argv_tail': w.get('child_argv_tail', s['argv']), 'env': env, 'stdin': None,
                       'signals': w.get('child_received', []), 'program_id': prog['id'], 'ready': bool(p.get('ready_barrier')), 'no_signal': False}
                rec['declared_termination'] = ACC.expected_declared_termination(p, rec)
                recs = [rec]
            f.blob('child-records:%d' % n, recs)
            if s.get('preload_shim'):
                f.blob('shim:%d' % n, {'pid': 9, 'platform': s['preload_shim']['platform'], 'arch': s['preload_shim']['arch'], 'real': {'platform': 'linux', 'arch': 'x64'}, 'applied': True})
            f.diag('LEFTOVER', {'step': n, 'pids': [], 'states': []})
        f.diag('PROC_SAMPLE', {'step': n, 'pids': []})
    f.diag('CALLS_DONE', {'source_sdk_claim': False, 'topology': 'driver_only'})
    f.add('END', {'streams': {}, 'child_exit_code': None, 'child_signal': None, 'complete': True})
    logs = f.logs()
    verdict, reasons, _ = OBS.reconcile_driver_only(logs, OS_OK)
    w = witness_for(c)
    if case == 'DP1-CTRL01':
        w['loader_json'] = {'sdk_entries': {}}
    return ACC.evaluate(case, logs, verdict, reasons, w)


# ------------------------------------------------------------------------------------------------ tests
def run():
    node = node_selftest()
    classes = ('client', 'peer_or_capture_sanity', 'capture_order_or_cleanup', 'informational', 'order_unilateral')
    t('EDP-01/R3-12: every case predicate is in the frozen table with a known class',
      lambda: all(p in ACC.TABLE and ACC.TABLE[p]['class'] in classes for c in ACC.CASES_DEF.values() for p in c['predicates']))
    t('EDP-01: the copied predicate keeps its 2B class', lambda: ACC.TABLE['capture.case_input_frozen_bytes']['class'] == 'peer_or_capture_sanity')
    t('composition rule order', lambda: (ACC.compose({'accepted_capture_forms': ['PASS']}, 'INVALID_CAPTURE', [], True, False) == ('INVALID_CAPTURE', 1)
                                         and ACC.compose({'accepted_capture_forms': ['PASS']}, 'REAL_CLI_KEYLESS', [], True, False) == ('MISMATCH', 2)
                                         and ACC.compose({'accepted_capture_forms': ['PASS']}, 'PASS', [], False, False) == ('INVALID_CAPTURE', 3)
                                         and ACC.compose({'accepted_capture_forms': ['PASS']}, 'PASS', [{'ok': False, 'class': 'client'}, {'ok': False, 'class': 'peer_or_capture_sanity'}], True, False) == ('INVALID_CAPTURE', 4)
                                         and ACC.compose({'accepted_capture_forms': ['PASS']}, 'PASS', [{'ok': False, 'class': 'client'}], True, False) == ('MISMATCH', 6)
                                         and ACC.compose({'accepted_capture_forms': ['PASS']}, 'PASS', [{'ok': True, 'class': 'client'}], True, False) == ('PASS_CLIENT_OBSERVATION', 7)))
    t('jeq is strict by type', lambda: not ACC.jeq(1, True) and not ACC.jeq(None, 0) and ACC.jeq([1, 'a'], [1, 'a']) and not ACC.jeq({'a': 1}, {'a': 1, 'b': None}))

    # stage
    tmp = Path(tempfile.mkdtemp(prefix='dp1-stage-', dir=TMP_ROOT))
    try:
        trees = [{'root': '/fixture/s', 'entries': [
            {'path': '/fixture/s/m/package.json', 'kind': 'copy_of_member', 'member': 'A2:package/package.json'},
            {'path': '/fixture/s/m/codex.js', 'kind': 'copy_of_member', 'member': 'A2:package/bin/codex.js', 'mode': '0755'},
            {'path': '/fixture/s/f', 'kind': 'file', 'content': 'x\n', 'mode': '0640'}, {'path': '/fixture/s/j.json', 'kind': 'json', 'value': {'b': 1, 'a': 2}},
            {'path': '/fixture/s/d', 'kind': 'dir'}, {'path': '/fixture/s/l', 'kind': 'symlink', 'target': '/fixture/s/f'},
            {'path': '/fixture/s/c', 'kind': 'synthetic_child', 'mode': '0755'},
            {'path': '/fixture/s/w.mjs', 'kind': 'copy_of_profile', 'from': '/profile/dp-control-wrapper.mjs', 'mode': '0755'}]}]
        root = tmp / 'fixture'
        root.mkdir()
        man = STG.materialize(trees, root)
        t('stage: every fixture kind materialized as declared', lambda: STG.check_fixture(trees, man) == [])
        t('stage: json bytes are compact with a final newline, insertion order kept', lambda: (root / 's' / 'j.json').read_bytes() == b'{"b":1,"a":2}\n')
        t('stage: copy_of_member keeps the member sha and the declared mode', lambda: man['/fixture/s/m/codex.js']['sha256'] == STG.MEMBERS['A2']['package/bin/codex.js']['sha256'] and man['/fixture/s/m/codex.js']['mode'] == '0755')
        os.chmod(root / 's' / 'f', 0o644)
        t('stage: a changed mode is detected', lambda: STG.check_fixture(trees, STG.fixture_manifest(trees, root)) != [])
        os.chmod(root / 's' / 'f', 0o640)
        os.unlink(root / 's' / 'l')
        os.symlink('/fixture/s/d', root / 's' / 'l')
        t('stage: a symlink with another target is detected', lambda: STG.check_fixture(trees, STG.fixture_manifest(trees, root)) != [])
        t('stage: entry outside /fixture refused', lambda: raises(lambda: STG.host_path(root, '/dist/x')))
        t('stage: copy_of_profile only from the listed own files', lambda: raises(lambda: STG.entry_bytes({'path': '/fixture/x', 'kind': 'copy_of_profile', 'from': '/profile/dp-driver.mjs'})))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    dist = Path('/mnt/dados/cvg-work/cvg-codex100-dp1-runtime-20261019/dist')
    t('stage: staged /dist equals artifact-metadata.json (closed manifest, modes kept)', lambda: dist.exists() and STG.dist_manifest(dist) == STG.expected_dist())
    t('stage: the published binary is staged 0755 and the manifests 0644', lambda: STG.expected_dist()['npm/node_modules/@openai/codex-linux-x64/vendor/x86_64-unknown-linux-musl/bin/codex']['mode'] == '0755'
      and STG.expected_dist()['npm/node_modules/@openai/codex/package.json']['mode'] == '0644')

    # observer
    def blob_log(chunks, end):
        f = Frames('DP-PK04A', '0' * 64)
        for c in chunks:
            f.add('BLOB', c)
        f.add('BLOB_END', end)
        d = OBS.RoleLog('driver', {'attempt': f.attempt, 'case': f.case, 'nonce': f.nonce, 'source_sha256': f.src})
        d.feed(bytes(f.buf), 1)
        return d
    good = base64.b64encode(b'abc').decode()
    t('observer: BLOB rebuilt and digest-checked', lambda: blob_log([{'name': 'x', 'offset': 0, 'base64': good, 'sha256': sha(b'abc')}], {'name': 'x', 'bytes': 3, 'sha256': sha(b'abc')}).blobs == {'x': b'abc'})
    t('observer: BLOB offset gap is a violation', lambda: blob_log([{'name': 'x', 'offset': 1, 'base64': good, 'sha256': sha(b'abc')}], {'name': 'x', 'bytes': 3, 'sha256': sha(b'abc')}).violation is not None)
    t('observer: BLOB_END differing from the chunks is a violation', lambda: blob_log([{'name': 'x', 'offset': 0, 'base64': good, 'sha256': sha(b'abc')}], {'name': 'x', 'bytes': 4, 'sha256': sha(b'abcd')}).violation is not None)

    # erratum DP-SPEC/R2-F01
    acc0, v0 = control_capture(0)
    t('R2-F01: complete synthetic driver_only capture -> observer PASS', lambda: v0 == 'PASS')
    t('R2-F01: synthetic DP1-CTRL01 -> MISMATCH by rule 6 only from wrap.exit_mirror_exact',
      lambda: acc0['outcome'] == 'MISMATCH' and acc0['composition_rule'] == 6 and acc0['failed_predicates'] == ['wrap.exit_mirror_exact'])
    acc3, _ = control_capture(3)
    t('R2-F01: synthetic DP1-CTRL01 with the mirrored code -> PASS_CLIENT_OBSERVATION', lambda: acc3['outcome'] == 'PASS_CLIENT_OBSERVATION' and acc3['composition_rule'] == 7)
    accA, vA = control_capture(0, adapter_frame=True)
    t('R2-F01: an adapter frame in driver_only -> INVALID_CAPTURE', lambda: vA == 'INVALID_CAPTURE' and accA['outcome'] == 'INVALID_CAPTURE' and accA['composition_rule'] == 1)
    acc6 = pk06_signal_capture()
    t('EDP-03: wrapper killed by a signal in a PASS_DECLARED_TERMINATION case -> MISMATCH by the predicate (rule 6)',
      lambda: acc6['capture_form'] == 'PASS_DECLARED_TERMINATION' and acc6['outcome'] == 'MISMATCH' and acc6['composition_rule'] == 6
      and acc6['failed_predicates'] == ['wrap.exit_mirror_exact'])
    t('EDP-05: build_link in non-CONTROL acceptance only', lambda: acc6.get('build_link') == 'NO_BUILD_LINK_DECLARED' and 'build_link' not in acc0)
    for case in [c for c in ACC.CASES_DEF if ACC.CASES_DEF[c]['kind'] == 'SDK']:
        acc = golden_capture(case)
        t('golden synthetic capture of %s -> PASS_CLIENT_OBSERVATION (driver lane conventions aligned with the evaluator)' % case,
          lambda acc=acc: acc['outcome'] == 'PASS_CLIENT_OBSERVATION' or print(case, acc['outcome'], acc['failed_predicates'], [x['detail'] for x in acc['predicates'] if not x['ok']][:2], acc['capture_reasons']))
    t('artifact evaluator: final export statement parser', lambda: ACC.final_exports('x\nexport {\n  Codex,\n  Thread\n};\n') == ['Codex', 'Thread'] and ACC.final_exports('no exports') is None)
    passed = sum(1 for r in results if r['ok'])
    doc = {'kind': 'SELFTEST_RESULTS_DP1', 'task': 'DX100-G02:IMPLEMENT-AND-ADMIT-SDK-DISTRIBUTED-PROFILE-DP-1', 'passed': passed, 'failed': len(results) - passed,
           'node': {'version': node['node'], 'passed': node['passed'], 'failed': node['failed']}, 'results': results,
           'scope': 'offline (no service, no SDK, no cache file executed); the published dist is read only as bytes', 'functional_receipts': 0}
    (UNIT / 'selftests' / 'selftest-results.json').write_text(json.dumps(doc, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'passed': passed, 'failed': len(results) - passed}))
    for r in results:
        if not r['ok']:
            print('FAIL', r['name'], r.get('error', ''))
    return 0 if passed == len(results) else 1


if __name__ == '__main__':
    sys.exit(run())
