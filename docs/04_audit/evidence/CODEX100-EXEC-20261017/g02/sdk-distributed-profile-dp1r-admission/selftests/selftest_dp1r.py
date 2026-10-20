"""Offline self-tests of DX100-G02:IMPLEMENT-AND-ADMIT-SDK-DISTRIBUTED-PROFILE-DP-1R (no service, no SDK, no cache file executed).

Usage: python3 -I -B selftests/selftest_dp1r.py   (cwd = unit folder) -> selftests/selftest-results.json
Runs the Node self-test (selftest_dp1r_driver.mjs) with the pinned Node, then the host-side tests (derived from selftest_dp1.py and
selftest_dp1_caps.py of the DP-1, commit 3ca3fd3b0):
- erratum EDP1R-01: cases-dp-1r.json recomputed from cases-dp-1.json; DP-PK07B differs from DP-PK07A only in the declared fields;
  CONTROL bytes equal to DP1-CTRL01; predicate table and composition copied unchanged;
- module scope (lesson DP1-ADM/PK07A): DP-PK07A flagged on both .exe stand-ins, DP-PK07B and the CONTROL clean, the DIAG row exactly
  its deliberate negative; scope resolution rules;
- stage (DDP-02, DDP-11, R1-F07): every kind materialized; tree root walk; an undeclared file or a non-0755 implicit directory is a
  problem; the Node listing of the tree root agrees with the host view;
- golden synthetic captures: DP-PK07B gives PASS_CLIENT_OBSERVATION; DP1R-CTRL01 gives MISMATCH by rule 6 only from
  wrap.exit_mirror_exact; with the mirrored code PASS; an adapter frame gives INVALID_CAPTURE;
- discrimination of every frozen PK07 arm on DP-PK07B (wrong triple, invalid platform accepted, existence check with another error)
  -> MISMATCH by the client predicates; a client that skips an expected child or runs an unexpected one (win32 without .exe, B03
  fallback) -> INVALID_CAPTURE by the frozen sanity child.program_followed, never PASS; the DP-PK07A defect replayed ->
  INVALID_CAPTURE (rule 4); an extra file in
  the sandbox listing -> INVALID_CAPTURE; LEFTOVER with a pid -> wrap.no_leftover_process fails; driver deadline -> rule 1;
- observer BLOB checks; composition order; jeq; env with absent keys judged as null.
The results record the sha256 of the sources under test (selftest sources of the supervisor), checked by the freeze (DDP1R-09).
"""
import base64
import copy
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
TMP_ROOT = '/mnt/dados/cvg-work/cvg-codex100-dp1r-runtime-20261020/tmp'
results = []


def load(path, mod):
    spec = importlib.util.spec_from_file_location(mod, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


OBS = load(UNIT / 'dplane' / 'observer.py', 'st_obs')
STG = load(UNIT / 'dplane' / 'stage.py', 'st_stage')
ACC = load(UNIT / 'dplane' / 'acceptance.py', 'st_acc')
SUP = load(UNIT / 'dplane' / 'supervisor.py', 'st_sup')
BUILD = load(UNIT / 'tools' / 'build_cases_dp1r.py', 'st_build')


def t(name, fn):
    try:
        ok = fn()
        results.append({'name': name, 'ok': ok is True})
    except Exception as exc:  # noqa: BLE001
        results.append({'name': name, 'ok': False, 'error': ('%s: %s' % (type(exc).__name__, exc))[:300]})


def raises(fn, text=None):
    try:
        fn()
        return False
    except Exception as exc:  # noqa: BLE001
        return text is None or text in str(exc)


def sha(b):
    return hashlib.sha256(b).hexdigest()


def node_selftest():
    os.makedirs(TMP_ROOT, exist_ok=True)
    r = subprocess.run([NODE, str(UNIT / 'selftests' / 'selftest_dp1r_driver.mjs'), str(UNIT)], capture_output=True, text=True, timeout=180,
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

    def logs(self, adapter_frame=False, finish=True):
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


def host_manifest(trees):
    """What the host view looks like for an exact materialization: declared entries plus the implicit 0755 directories."""
    out = {p: {'type': 'dir', 'mode': '0755'} for p in STG.implicit_dirs(trees)}
    out.update({e['path']: STG.expected_entry(e) for tr in trees for e in tr['entries']})
    return out


def listing_rows(trees, extra=()):
    rows = []
    for p, x in sorted(host_manifest(trees).items()):
        row = {'path': p, 'type': x['type']}
        if x['type'] == 'symlink':
            row['target'] = x['target']
        else:
            row['mode'] = x['mode']
        if x['type'] == 'file':
            row.update(bytes=x['bytes'], sha256=x['sha256'])
        rows.append(row)
    rows += list(extra)
    return rows


def witness_for(c):
    trees = c['case_input'].get('trees', [])
    return {'os_checks': OS_OK['checks'], 'maps': {'ok': True, 'entries': [1], 'unknown': []}, 'cgroup_limits': {'memory.max': '1073741824', 'pids.max': '256', 'cpu.max': '100000 100000'},
            'limits_ok': True, 'driver_net_ns': 'net:[1]', 'host_net_ns': 'net:[2]',
            'stage_witness': {'archives': {a: STG.ARCHIVES[a]['observed']['sha256'] for a in STG.LAYOUT}, 'dist_manifest_equal': True},
            'fixture_manifest_host': host_manifest(trees), 'fixture_problems_host': [], 'case_input_sha256_supervisor': c['case_input_sha256'],
            'case_input_sha256_recomputed': c['case_input_sha256'], 'control_actions': [], 'supervisor_kills': [], 'timed_out': False,
            'loader_json': {'sdk_entries': {}}}


def control_capture(wrapper_exit, adapter_frame=False):
    c = ACC.CASES_DEF['DP1R-CTRL01']
    f = Frames('DP1R-CTRL01', c['case_input_sha256'])
    f.diag('KEYLESS_WITNESS', {'net_devices': ['lo'], 'codex_home_present': False, 'home_entries': [], 'credential_vars_in_driver_env': []})
    f.diag('CLEANUP_GUARD', {'pid1_comm': 'bwrap', 'cleanup_allowed': True})
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
    w = witness_for(c)
    w['fixture_manifest_host'] = {e['path']: STG.expected_entry(e) for tr in c['case_input']['trees'] for e in tr['entries']}
    return ACC.evaluate('DP1R-CTRL01', logs, verdict, reasons, w), verdict


TRIPLE_X64_MUSL = '/fixture/pk07/all/node_modules/@openai/codex-responses-api-proxy/vendor/x86_64-unknown-linux-musl/codex-responses-api-proxy/codex-responses-api-proxy'


def pk07_capture(mutate=None, extra_listing=(), leftover_pid=None, invalid_reason=None):
    """Synthetic DP-PK07B capture in the frames dp-driver.mjs emits. mutate(as_) -> dict overriding the behaviour of one wrapper:
    exit_code, stderr (bytes), records (list) or exec_path."""
    case = 'DP-PK07B'
    c = ACC.CASES_DEF[case]
    exp = c['expected']['wrappers']
    f = Frames(case, c['case_input_sha256'])
    f.diag('KEYLESS_WITNESS', {'net_devices': ['lo'], 'codex_home_present': False, 'home_entries': [], 'credential_vars_in_driver_env': []})
    f.diag('CLEANUP_GUARD', {'pid1_comm': 'bwrap', 'cleanup_allowed': True})
    f.blob('fixture-listing', listing_rows(c['case_input']['trees'], extra_listing))
    run = 0
    for s in c['case_input']['sdk_calls']:
        n = s['step']
        run += 1
        w = exp[s['as']]
        prog = ACC.program_at(c, n)
        f.diag('CHILD_RUN', {'step': n, 'run': run, 'program_id': prog['id']})
        m = (mutate or (lambda a: {}))(s['as'])
        code = m.get('exit_code', w['exit_code'])
        f.diag('WRAPPER_RESULT', {'step': n, 'as': s['as'], 'run': run, 'pid': 9, 'exit_code': code, 'signal': None, 'stdout_bytes': 0, 'stdout_sha256': sha(b''),
                                  'stderr_bytes': 0, 'stderr_sha256': sha(b''), 'records': 0, 'shim': True, 'settled': 'close', 'elapsed_ms': 30})
        stderr = m.get('stderr', ('\n'.join(w['stderr_contains']) + '\n').encode() if w.get('stderr_contains') else b'')
        if stderr:
            f.blob('stderr:%d' % n, stderr)
        if 'records' in m:
            recs = m['records']
        elif w.get('child_spawned') is False:
            recs = []
        else:
            recs = [{'pid': 11, 'exec_path': m.get('exec_path', w['child_executed_path']), 'argv_tail': [], 'env': dict(s['env']), 'stdin': None, 'signals': [],
                     'program_id': prog['id'], 'ready': False, 'declared_termination': {'exit_code': 0}, 'no_signal': False}]
        f.blob('child-records:%d' % n, recs)
        f.blob('shim:%d' % n, {'pid': 9, 'platform': s['preload_shim']['platform'], 'arch': s['preload_shim']['arch'], 'real': {'platform': 'linux', 'arch': 'x64'}, 'applied': True})
        f.diag('LEFTOVER', {'step': n, 'pids': [leftover_pid] if (leftover_pid and n == 1) else [], 'states': []})
        f.diag('PROC_SAMPLE', {'step': n, 'pids': []})
    if invalid_reason:
        f.add('INVALID', {'reason': invalid_reason})
    else:
        f.diag('CALLS_DONE', {'source_sdk_claim': False, 'topology': 'driver_only'})
        f.add('END', {'streams': {}, 'child_exit_code': None, 'child_signal': None, 'complete': True})
    logs = f.logs()
    verdict, reasons, _ = OBS.reconcile_driver_only(logs, OS_OK)
    return ACC.evaluate(case, logs, verdict, reasons, witness_for(c))


def outcome(acc):
    return acc['outcome'], acc['composition_rule'], acc['failed_predicates']


# ------------------------------------------------------------------------------------------------ tests
def run():
    node = node_selftest()
    src = json.loads((UNIT / 'inputs' / 'spec-dp' / 'cases-dp-1.json').read_bytes())
    derived = json.loads((UNIT / 'cases-dp-1r.json').read_bytes())
    a = {c['id']: c for c in src['cases']}
    b = {c['id']: c for c in derived['cases']}
    cb, eb = BUILD.build()
    t('EDP1R-01: cases-dp-1r.json and erratum-dp1r.json recomputed byte for byte from cases-dp-1.json', lambda: (UNIT / 'cases-dp-1r.json').read_bytes() == cb and (UNIT / 'erratum-dp1r.json').read_bytes() == eb)
    t('EDP1R-01: DP-PK07B differs from DP-PK07A only in the declared fields', lambda: sorted(k for k in set(a['DP-PK07A']) | set(b['DP-PK07B']) if a['DP-PK07A'].get(k) != b['DP-PK07B'].get(k))
      == sorted(['id', 'sub_lot', 'slot', 'case_input', 'case_input_sha256', 'erratum', 'replaces_observation_of']))
    t('EDP1R-01: the only case_input change is the two package.json {"type":"commonjs"} entries in the win32 leaves', lambda: (
        [e for e in b['DP-PK07B']['case_input']['trees'][0]['entries'] if e not in a['DP-PK07A']['case_input']['trees'][0]['entries']]
        == [{'path': p + '/package.json', 'kind': 'json', 'value': {'type': 'commonjs'}} for p in BUILD.WIN_LEAVES]
        and [e for e in b['DP-PK07B']['case_input']['trees'][0]['entries'] if e['kind'] != 'json' or not e['path'].endswith('codex-responses-api-proxy/package.json')]
        == a['DP-PK07A']['case_input']['trees'][0]['entries']
        and b['DP-PK07B']['case_input']['trees'][1:] == a['DP-PK07A']['case_input']['trees'][1:]
        and {k: v for k, v in b['DP-PK07B']['case_input'].items() if k != 'trees'} == {k: v for k, v in a['DP-PK07A']['case_input'].items() if k != 'trees'}))
    t('EDP1R-01: DP1R-CTRL01 keeps the case_input bytes of DP1-CTRL01', lambda: b['DP1R-CTRL01']['case_input'] == a['DP1-CTRL01']['case_input']
      and b['DP1R-CTRL01']['case_input_sha256'] == a['DP1-CTRL01']['case_input_sha256'] == 'b0234bc95f8ea6d062308d766073488e22af5d487a681379fad9f656a9c1c0bd')
    t('EDP-01: predicate table, composition, capture forms and classes copied unchanged', lambda: all(derived[k] == src[k] for k in ('predicate_table', 'composition', 'capture_forms', 'predicate_classes')))
    t('EDP-01: every DP-1R predicate is in the frozen table with a known class', lambda: all(ACC.TABLE[p]['class'] in ('client', 'peer_or_capture_sanity', 'capture_order_or_cleanup', 'informational', 'order_unilateral')
                                                                                      for c in ACC.CASES_DEF.values() for p in c['predicates']))

    # module scope
    t('DDP1R-07: DP-PK07A (DP-1 fixture) flagged on exactly its two .exe stand-ins', lambda: sorted(x['path'] for x in STG.module_scope_problems(a['DP-PK07A']['case_input']['trees']))
      == sorted(p + '/codex-responses-api-proxy.exe' for p in BUILD.WIN_LEAVES))
    t('DDP1R-07: DP-PK07B and DP1R-CTRL01 clean', lambda: STG.module_scope_problems(b['DP-PK07B']['case_input']['trees']) == [] and STG.module_scope_problems(b['DP1R-CTRL01']['case_input']['trees']) == [])
    t('DDP1R-07: DIAG-DP-SYNTH-CHILD flags exactly its deliberate negative row', lambda: [x['path'] for x in STG.module_scope_problems(SUP.DIAG_ROWS['DIAG-DP-SYNTH-CHILD']['trees'])]
      == SUP.DIAG_ROWS['DIAG-DP-SYNTH-CHILD']['module_scope_expect'] == [SUP.SCOPE_BAD_EXE])
    scope_trees = [{'root': '/fixture/s', 'entries': [
        {'path': '/fixture/s/p/package.json', 'kind': 'json', 'value': {'type': 'module'}},
        {'path': '/fixture/s/p/q/package.json', 'kind': 'json', 'value': {'name': 'no-type'}},
        {'path': '/fixture/s/p/q/x.exe', 'kind': 'synthetic_child', 'mode': '0755'},
        {'path': '/fixture/s/p/y.bin', 'kind': 'synthetic_child', 'mode': '0755'},
        {'path': '/fixture/s/p/z.cjs', 'kind': 'synthetic_child', 'mode': '0755'},
        {'path': '/fixture/s/p/data.exe', 'kind': 'file', 'content': 'not executable\n', 'mode': '0644'},
        {'path': '/fixture/s/other/w.exe', 'kind': 'synthetic_child', 'mode': '0755'}]}]
    t('DDP1R-07: nearest package.json without "type" is commonjs; unknown extension in module scope flagged; .cjs and non-executable ignored; no package.json is commonjs',
      lambda: [x['path'] for x in STG.module_scope_problems(scope_trees)] == ['/fixture/s/p/y.bin'])

    # stage
    tmp = Path(tempfile.mkdtemp(prefix='dp1r-stage-', dir=TMP_ROOT))
    try:
        trees = [{'root': '/fixture/s', 'entries': [
            {'path': '/fixture/s/m/package.json', 'kind': 'copy_of_member', 'member': 'A4:package/package.json'},
            {'path': '/fixture/s/m/bin/w.js', 'kind': 'copy_of_member', 'member': 'A4:package/bin/codex-responses-api-proxy.js', 'mode': '0755'},
            {'path': '/fixture/s/f', 'kind': 'file', 'content': 'x\n', 'mode': '0640'}, {'path': '/fixture/s/j.json', 'kind': 'json', 'value': {'b': 1, 'a': 2}},
            {'path': '/fixture/s/d', 'kind': 'dir'}, {'path': '/fixture/s/l', 'kind': 'symlink', 'target': '/fixture/s/f'},
            {'path': '/fixture/s/m/vendor/t/c', 'kind': 'synthetic_child', 'mode': '0755'},
            {'path': '/fixture/s/w.mjs', 'kind': 'copy_of_profile', 'from': '/profile/dp-control-wrapper.mjs', 'mode': '0755'}]}]
        root = tmp / 'fixture'
        root.mkdir()
        man = STG.materialize(trees, root)
        t('stage: every fixture kind materialized as declared (tree root walked, implicit dirs accepted)', lambda: STG.check_fixture(trees, man) == []
          and {'/fixture/s', '/fixture/s/m', '/fixture/s/m/bin', '/fixture/s/m/vendor', '/fixture/s/m/vendor/t'} <= set(man))
        t('stage: json bytes are compact with a final newline', lambda: (root / 's' / 'j.json').read_bytes() == b'{"b":1,"a":2}\n')
        t('stage: copy_of_member keeps the A4 member sha and the declared mode', lambda: man['/fixture/s/m/bin/w.js']['sha256'] == STG.MEMBERS['A4']['package/bin/codex-responses-api-proxy.js']['sha256'] and man['/fixture/s/m/bin/w.js']['mode'] == '0755')
        (root / 's' / 'm' / 'stray').write_text('undeclared')
        t('R1-F07: an undeclared file under the tree root is a problem', lambda: STG.check_fixture(trees, STG.fixture_manifest(trees, root)) == [{'extra': ['/fixture/s/m/stray']}])
        os.unlink(root / 's' / 'm' / 'stray')
        os.chmod(root / 's' / 'm' / 'vendor', 0o700)
        t('R1-F07: an implicit directory with another mode is a problem', lambda: STG.check_fixture(trees, STG.fixture_manifest(trees, root)) == [{'extra': ['/fixture/s/m/vendor']}])
        os.chmod(root / 's' / 'm' / 'vendor', 0o755)
        os.unlink(root / 's' / 'l')
        os.symlink('/fixture/s/d', root / 's' / 'l')
        t('stage: a symlink with another target is detected', lambda: STG.check_fixture(trees, STG.fixture_manifest(trees, root)) != [])
        t('stage: entry outside /fixture refused', lambda: raises(lambda: STG.host_path(root, '/dist/x')))
        t('stage: copy_of_profile only from the listed own files', lambda: raises(lambda: STG.entry_bytes({'path': '/fixture/x', 'kind': 'copy_of_profile', 'from': '/profile/dp-driver.mjs'})))
        # PK07B fixture materialized on the host: exact, and the module scope as Node would see it
        r2 = tmp / 'fx'
        r2.mkdir()
        tb = b['DP-PK07B']['case_input']['trees']
        m2 = STG.materialize(tb, r2)
        t('DP-PK07B fixture materializes exactly (13 entries plus implicit dirs) with the commonjs scope files in the win32 leaves', lambda: STG.check_fixture(tb, m2) == []
          and all(m2[p + '/package.json']['sha256'] == sha(b'{"type":"commonjs"}\n') for p in BUILD.WIN_LEAVES))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    t('R1-F07: the Node listing of a tree root has the shape the host view expects (rows of every path, error row for a missing entry)',
      lambda: node['info']['listing_paths'] == ['tree', 'tree/a', 'tree/a/b', 'tree/a/b/declared', 'tree/a/extra', 'tree/link', 'tree/missing'])
    dist = Path('/mnt/dados/cvg-work/cvg-codex100-dp1r-runtime-20261020/dist')
    t('stage: staged /dist equals artifact-metadata.json (closed manifest, modes kept)', lambda: dist.exists() and STG.dist_manifest(dist) == STG.expected_dist())

    # observer
    def blob_log(chunks, end):
        f = Frames('DP-PK07B', '0' * 64)
        for c in chunks:
            f.add('BLOB', c)
        f.add('BLOB_END', end)
        d = OBS.RoleLog('driver', {'attempt': f.attempt, 'case': f.case, 'nonce': f.nonce, 'source_sha256': f.src})
        d.feed(bytes(f.buf), 1)
        return d
    good = base64.b64encode(b'abc').decode()
    t('observer: BLOB rebuilt and digest-checked', lambda: blob_log([{'name': 'x', 'offset': 0, 'base64': good, 'sha256': sha(b'abc')}], {'name': 'x', 'bytes': 3, 'sha256': sha(b'abc')}).blobs == {'x': b'abc'})
    t('observer: BLOB offset gap is a violation', lambda: blob_log([{'name': 'x', 'offset': 1, 'base64': good, 'sha256': sha(b'abc')}], {'name': 'x', 'bytes': 3, 'sha256': sha(b'abc')}).violation is not None)

    # CONTROL and golden
    acc0, v0 = control_capture(0)
    t('R2-F01: complete synthetic driver_only capture -> observer PASS', lambda: v0 == 'PASS')
    t('R2-F01: synthetic DP1R-CTRL01 -> MISMATCH by rule 6 only from wrap.exit_mirror_exact', lambda: outcome(acc0) == ('MISMATCH', 6, ['wrap.exit_mirror_exact']))
    acc3, _ = control_capture(3)
    t('R2-F01: synthetic DP1R-CTRL01 with the mirrored code -> PASS_CLIENT_OBSERVATION', lambda: outcome(acc3) == ('PASS_CLIENT_OBSERVATION', 7, []))
    accA, vA = control_capture(0, adapter_frame=True)
    t('R2-F01: an adapter frame in driver_only -> INVALID_CAPTURE', lambda: vA == 'INVALID_CAPTURE' and accA['outcome'] == 'INVALID_CAPTURE' and accA['composition_rule'] == 1)
    gold = pk07_capture()
    t('golden synthetic capture of DP-PK07B -> PASS_CLIENT_OBSERVATION (lane conventions aligned with the evaluator)', lambda: outcome(gold) == ('PASS_CLIENT_OBSERVATION', 7, []) or print(outcome(gold), [x['detail'] for x in gold['predicates'] if not x['ok']][:2]))
    t('EDP-05: build_link in the DP-PK07B acceptance, not in the CONTROL', lambda: gold.get('build_link') == 'NO_BUILD_LINK_DECLARED' and 'build_link' not in acc0)

    # discrimination of the PK07 arms on DP-PK07B
    wrong = pk07_capture(lambda as_: {'exec_path': TRIPLE_X64_MUSL} if as_ == 'p_win32_x64' else {})
    t('PK07.B01 contrary (wrong triple in win32): MISMATCH by child.executed_path_exact', lambda: outcome(wrong) == ('MISMATCH', 6, ['child.executed_path_exact']))
    exist = pk07_capture(lambda as_: {'exit_code': 1, 'stderr': b'Error: vendor binary not found\n'} if as_ == 'p_missing' else {})
    t('PK07.B03 contrary of the frozen arm (existence check, error other than ENOENT, no spawn): MISMATCH by wrap.stderr_contains', lambda: outcome(exist) == ('MISMATCH', 6, ['wrap.stderr_contains']))
    noexe = pk07_capture(lambda as_: {'exit_code': 1, 'records': [], 'stderr': b'Error: spawn ...codex-responses-api-proxy ENOENT\n'} if as_ == 'p_win32_arm64' else {})
    t('win32 without .exe (spawn ENOENT, no child where one is expected): INVALID_CAPTURE by rule 4 through child.program_followed (frozen sanity class), never PASS',
      lambda: outcome(noexe) == ('INVALID_CAPTURE', 4, ['child.program_followed', 'wrap.exit_mirror_exact', 'child.executed_path_exact']))
    inval = pk07_capture(lambda as_: {'exit_code': 0, 'stderr': b''} if as_ == 'p_invalid' else {})
    t('PK07.B02 contrary (invalid platform accepted, exit 0): MISMATCH by wrap.exit_mirror_exact and wrap.stderr_contains',
      lambda: outcome(inval) == ('MISMATCH', 6, ['wrap.exit_mirror_exact', 'wrap.stderr_contains']))
    fallback = pk07_capture(lambda as_: {'exit_code': 0, 'stderr': b'', 'records': [{'pid': 11, 'exec_path': TRIPLE_X64_MUSL, 'argv_tail': [], 'env': {}, 'stdin': None, 'signals': [],
                                                                                     'program_id': 'child_script', 'ready': False, 'declared_termination': {'exit_code': 0}, 'no_signal': False}]}
                            if as_ == 'p_missing' else {})
    t('PK07.B03 with a fallback that runs another child: INVALID_CAPTURE by rule 4 through child.program_followed, never PASS',
      lambda: outcome(fallback) == ('INVALID_CAPTURE', 4, ['child.program_followed', 'wrap.exit_mirror_exact', 'wrap.stderr_contains', 'child.executed_path_exact']))
    defect = pk07_capture(lambda as_: {'exit_code': 1, 'records': [], 'stderr': (UNIT / 'inputs' / 'dp1' / 'pk07a' / 'blob-stderr-7.txt').read_bytes()} if as_ in ('p_win32_x64', 'p_win32_arm64') else {})
    t('DP-PK07A defect replayed on DP-PK07B (no child record in win32): INVALID_CAPTURE by rule 4 (child.program_followed), not a client fact',
      lambda: outcome(defect)[:2] == ('INVALID_CAPTURE', 4) and 'child.program_followed' in defect['failed_predicates'])
    extra = pk07_capture(extra_listing=[{'path': '/fixture/pk07/all/stray', 'type': 'file', 'mode': '0644', 'bytes': 1, 'sha256': sha(b'x')}])
    t('R1-F07: an undeclared file in the sandbox listing -> INVALID_CAPTURE by fixture.tree_exact', lambda: outcome(extra) == ('INVALID_CAPTURE', 4, ['fixture.tree_exact']))
    left = pk07_capture(leftover_pid=77)
    t('LEFTOVER negative (evaluator): a remaining pid fails wrap.no_leftover_process', lambda: outcome(left) == ('MISMATCH', 6, ['wrap.no_leftover_process']))
    dl = pk07_capture(lambda as_: {}, invalid_reason='wrapper.run deadline (step 4)')
    t('deadline of the close (driver INVALID) -> INVALID_CAPTURE by rule 1 (EDP-07)', lambda: dl['outcome'] == 'INVALID_CAPTURE' and dl['composition_rule'] == 1)

    # composition and helpers
    t('composition rule order', lambda: (ACC.compose({'accepted_capture_forms': ['PASS']}, 'INVALID_CAPTURE', [], True, False) == ('INVALID_CAPTURE', 1)
                                         and ACC.compose({'accepted_capture_forms': ['PASS']}, 'REAL_CLI_KEYLESS', [], True, False) == ('MISMATCH', 2)
                                         and ACC.compose({'accepted_capture_forms': ['PASS']}, 'PASS', [], False, False) == ('INVALID_CAPTURE', 3)
                                         and ACC.compose({'accepted_capture_forms': ['PASS']}, 'PASS', [{'ok': False, 'class': 'client'}, {'ok': False, 'class': 'peer_or_capture_sanity'}], True, False) == ('INVALID_CAPTURE', 4)
                                         and ACC.compose({'accepted_capture_forms': ['PASS']}, 'PASS', [{'ok': False, 'class': 'client'}], True, False) == ('MISMATCH', 6)
                                         and ACC.compose({'accepted_capture_forms': ['PASS']}, 'PASS', [{'ok': True, 'class': 'client'}], True, False) == ('PASS_CLIENT_OBSERVATION', 7)))
    t('jeq is strict by type', lambda: not ACC.jeq(1, True) and not ACC.jeq(None, 0) and ACC.jeq([1, 'a'], [1, 'a']) and not ACC.jeq({'a': 1}, {'a': 1, 'b': None}))
    t('env judged by declared keys, an absent key read as null', lambda: ACC.env_matches({'A': '1'}, {'A': '1', 'B': None}) == {} and ACC.env_matches({'A': '1'}, {'B': 'x'}) == {'B': {'want': 'x', 'got': None}})
    t('supervisor: service properties equal the DP-1 identity freeze (DV3 accepted), none declared anew', lambda: SUP.PROPS == SUP.inherited_props())

    passed = sum(1 for r in results if r['ok'])
    doc = {'kind': 'SELFTEST_RESULTS_DP1R', 'task': 'DX100-G02:IMPLEMENT-AND-ADMIT-SDK-DISTRIBUTED-PROFILE-DP-1R', 'passed': passed, 'failed': len(results) - passed,
           'node': {'version': node['node'], 'passed': node['passed'], 'failed': node['failed'], 'info': node['info']}, 'results': results,
           'sources_sha256': {rel: sha((UNIT / rel).read_bytes()) for rel in SUP.SELFTEST_SOURCES},
           'scope': 'offline (no service, no SDK, no cache file executed); the published dist and A4 members are read only as bytes', 'functional_receipts': 0}
    (UNIT / 'selftests' / 'selftest-results.json').write_text(json.dumps(doc, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'passed': passed, 'failed': len(results) - passed}))
    for r in results:
        if not r['ok']:
            print('FAIL', r['name'], r.get('error', ''))
    return 0 if passed == len(results) else 1


if __name__ == '__main__':
    sys.exit(run())
