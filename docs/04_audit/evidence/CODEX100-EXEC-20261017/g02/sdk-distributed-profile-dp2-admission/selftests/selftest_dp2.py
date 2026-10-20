"""Offline selftests of DX100-G02:IMPLEMENT-AND-ADMIT-SDK-DISTRIBUTED-PROFILE-DP-2 (no SDK, no Pydantic, no service, no network).

Run: python3 -I -B selftests/selftest_dp2.py   -> writes selftests/selftest-results.json (exit 0 only when all pass).

Covers, before the source freeze:
- DDP-01 IDs and slots, the budget rows, DDP-09 CONTROL by copy, the R3-12 checks over the DP-2 table (EDP-01) and the predicates
  copied from the 2B bases (class and oracle kept);
- erratum DP-SPEC/R2-F01 (6), DP-2 part: synthetic driver_only capture of DP-PY19A gives PASS; the same with one adapter frame gives
  INVALID_CAPTURE; with an adapter process in the cgroup scan it gives MISMATCH by proc.spawn_count_exact; the topology table of the
  supervisor equals the channel table and matches the steps;
- DP1-ADM/R2-F06: every selftests_offline item of the capabilities used in the DP-2, positive and negative: CAP-DP-STAGE (own tar.gz and
  own zip with modes, member, archive and fixture-copy divergence refused, exact symlink, EROFS under a read-only bind in an own bwrap
  run, nothing written under docs/, root scan of DP1-ADM/R1-F07), CAP-DP-PY-RUNTIME (purge, SYS_PATH per swap, import from the new site),
  CAP-DP-REAL-CLI-KEYLESS (closed credential list, CODEX_HOME not empty, limits only in the declared cases, REALCLI_WITNESS of an own
  long-running process read after the PROC_RETAIN and refused before it; own JSON-RPC client against an own server), and
  CAP-DP-ARTIFACT-CHECK over an own stand-in of the cache (field divergence MISMATCH, cache divergence INVALID_CAPTURE, name absent from
  the listing MISMATCH; the final-export item belongs to the DP-1 only);
- DP1-ADM/R2-F05: the service property table of every case against the inherited one (only the DDP-05 limits may differ), negative;
- C3-2 carry-overs: C32-ADM/R1-F01 (two own threads in sequence with a reused ident both registered; zero calls refused with the thread
  in the registry union or in a frame), C32-ADM/R1-F03 (wait_class refused on worker.parked), C32-ADM/DV-C32-02 (plan_binding over a
  profile-manifest written by the real supervisor in a pre-freeze dry run).
"""
import copy
import hashlib
import importlib.util
import io
import json
import os
import shutil
import subprocess
import sys
import tarfile
import threading
import time
import traceback
import types
from pathlib import Path

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
UNIT = HERE.parent
G02 = UNIT.parent
PY = UNIT / 'python'
RUNTIME = Path('/mnt/dados/cvg-work/cvg-codex100-dp2-runtime-20261020')
SCRATCH = RUNTIME / 'selftest-scratch'
RESULTS = []


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    sys.modules[name] = m
    spec.loader.exec_module(m)
    return m


CH = load('stdp2_channel', PY / 'channel.py')
OBS = load('stdp2_observer', PY / 'observer.py')
ACC = load('stdp2_acceptance', PY / 'acceptance.py')
H = load('harness2b', PY / 'harness2b.py')
OWN = load('own2b', PY / 'own2b.py')
STG = load('stdp2_stage', PY / 'stage_dp.py')
RPC = load('stdp2_fixture_rpc', PY / 'fixture-rpc.py')
RPC.C = CH
SUP = load('stdp2_supervisor', PY / 'supervisor.py')
DRV = load('stdp2_driver', PY / 'python-driver.py')
DRV.C, DRV.H = CH, H
DOC = ACC._DOC
CASES = {c['id']: c for c in DOC['cases']}
BASE2B2 = {c['id']: c for c in ACC.cases1()['cases']}


def check(test, ok, detail=None):
    RESULTS.append({'test': test, 'ok': bool(ok), 'detail': detail})


def sha(b):
    return hashlib.sha256(b).hexdigest()


def compact(x):
    return json.dumps(x, ensure_ascii=False, separators=(',', ':'))


class FakeCh:
    """Validates every frame with the role-side encoder and records it; controls return at once (take answers True)."""

    def __init__(self, role='driver'):
        self.role, self.frames, self.controls = role, [], []
        self.seq = 0
        self.begin = {}
        self.lock = threading.Lock()
        self.control_fd = None

    def emit(self, kind, data):
        with self.lock:
            ev = {'v': 1, 'attempt': 'a' * 40, 'case': 'SELFTEST', 'role': self.role, 'seq': self.seq, 'kind': kind, 'pid': 1,
                  'mono_ns': str(time.monotonic_ns()), 'data': data}
            CH.encode_frame(ev)
            self.frames.append(ev)
            self.seq += 1

    def control(self, cmd):
        self.controls.append(cmd)

    def take(self, cmd):
        self.controls.append(cmd)
        return True

    def remaining(self):
        return 20.0

    def ms(self, name):
        return [f['data']['detail'] for f in self.frames if f['kind'] == 'DIAGNOSTIC' and f['data']['milestone'] == name]


def tlog(role, events, case_sha=None):
    lg = OBS.RoleLog(role, {'attempt': 'a' * 40, 'case': 'X', 'nonce': 'n' * 40, 'source_sha256': '0' * 64})
    lg.events = [{'kind': e['kind'], 'data': e['data'], 'seq': i, 'mono_ns': str(1000 + i)} for i, e in enumerate(events)]
    lg.recv_ns = [1000 + i for i in range(len(events))]
    lg.case_input_sha256 = case_sha
    lg.eof = True
    return lg


# ================================================================================================ DDP-01 / tables / budget
def t_ids_tables():
    acc = ['DP-PY19A', 'DP-PY19B', 'DP-PY19C', 'DP-PY02P', 'C3-PY02', '2B-PY01A']
    rej = ['DP-PY19D', 'DP-PY20A', 'DP-PK01A', 'DP2-CTRL01', 'DP-PY02Q']
    check('DDP-01 SDK IDs accepted and rejected by channel.py (DP-PY20A raises no service)', all(CH.SDK_CASE_RE.match(x) for x in acc)
          and not any(CH.SDK_CASE_RE.match(x) for x in rej))
    check('DDP-01 CONTROL DP2-CTRL01 in channel.py and control-client.py', 'DP2-CTRL01' in CH.CONTROL_CASES
          and "'DP2-CTRL01')" in (PY / 'control-client.py').read_text())
    check('DDP-01 slots of the DP-2: 6 (DP-PY19A, DP-PY19B, DP-PY19C, DP-PY02P conditional, DP-PY20A without service, DP2-CTRL01 first)',
          len(DOC['cases']) == 6 and DOC['counts']['slots'] == 6 and SUP.SLOT_CASES == ['DP-PY19A', 'DP-PY19B', 'DP-PY19C', 'DP-PY02P', 'DP-PY20A']
          and SUP.CONTROL_CASE == 'DP2-CTRL01' and SUP.CONDITIONAL == {'DP-PY02P': 'DIAG-DP-REAL-CLI-APPSERVER'}
          and CASES['DP2-CTRL01']['execution_order'] == 1)
    check('DDP-01 supervisor and evaluator bind cases-dp-2.json by sha', SUP.CASES_SHA == ACC.CASES_SHA == sha((UNIT / 'inputs/spec-dp/cases-dp-2.json').read_bytes()))
    budget = json.loads((UNIT / 'inputs/spec-dp/execution-budget-dp-2.json').read_text())
    check('budget: the 10 qualification services of execution-budget-dp-2.json are the DIAG rows; only DIAG-DP-REAL-CLI-APPSERVER is conditional',
          SUP.ADMISSION_DIAGS == budget['planned']['qualification_services'] and set(SUP.DIAG) == set(SUP.ADMISSION_DIAGS)
          and SUP.CONDITIONAL_DIAGS == {'DIAG-DP-REAL-CLI-APPSERVER': ['DP-PY02P']} and budget['max']['services'] == 12
          and budget['planned']['case_slots'] == 6)
    check('spec inputs of the freeze equal ../sdk-distributed-profile-dp1-admission/next-task.json#/spec', all(
        SUP.SPEC_SHA[n] == sha((UNIT / 'inputs/spec-dp' / n).read_bytes()) for n in SUP.SPEC_SHA))
    check('barrier plan covers exactly the barrier steps (DP-PY19B 12, DP-PY19C 6, DIAG rows); no barrier in driver_only', SUP.plan_check() == [],
          SUP.plan_check())
    table = DOC['predicate_table']
    unused = [p for c in DOC['cases'] for p in c['predicates'] if p not in table]
    check('EDP-01 every predicate of every DP-2 case is in the frozen table', not unused, unused)
    capture = sorted(k for k, v in DOC['predicate_classes'].items() if 'INVALID_CAPTURE' in v)
    check('EDP-01 R3-12: CAPTURE_CLASSES and composition of the evaluator equal the frozen ones', sorted(ACC.CAPTURE_CLASSES) == capture
          and ACC.COMPOSITION == DOC['composition'] and all(ACC.class_of(p) == table[p]['class'] for p in table), capture)
    src = (PY / 'acceptance.py').read_text()
    missing = sorted({p for c in DOC['cases'] for p in c['predicates'] if ("'%s'" % p) not in src})
    check('EDP-01 every predicate of the DP-2 cases has an implementation in the evaluator (P.add of its id)', not missing, missing)
    bases = {'../sdk-source-batch-2b-spec/cases-2b-2.json': UNIT / 'inputs/spec-2b/cases-2b-2.json',
             '../sdk-source-batch-2b-spec/cases-2b-1.json': UNIT / 'inputs/spec-2b/cases-2b-1.json'}
    diff, new = [], []
    for pid, v in table.items():
        if v['source'].startswith('NEW'):
            new.append(pid)
            continue
        b = json.loads(bases[v['source'].split('#')[0]].read_bytes())['predicate_table'][pid]
        if b['class'] != v['class'] or b['oracle'] != v['oracle']:
            diff.append(pid)
    check('EDP-01 a predicate copied from a 2B base keeps the class and the oracle of the base', not diff, {'differ': diff, 'new': sorted(new)})
    c, b = CASES['DP2-CTRL01'], BASE2B2['2B2-CTRL01']
    ci, bi = copy.deepcopy(c['case_input']), copy.deepcopy(b['case_input'])
    last = (ci['control_client']['argv'].pop(), bi['control_client']['argv'].pop())
    check('DDP-09 DP2-CTRL01 case_input equals 2B2-CTRL01 except the last argv element; base case object sha', ci == bi and last == ('DP2-CTRL01', '2B2-CTRL01')
          and sha(compact(b).encode()) == c['copy_of']['case_object_sha256'] and RPC.login_problems(c['case_input']['peer_script']) == [])
    check('EDP-05 every non-CONTROL case of the DP-2 carries build_link NO_BUILD_LINK_DECLARED', all(
        x.get('build_link') == 'NO_BUILD_LINK_DECLARED' for x in DOC['cases'] if x['kind'] != 'CONTROL') and 'build_link' not in CASES['DP2-CTRL01'])


# ================================================================================================ topology (erratum R2-F01)
def t_topology():
    sup = {c: SUP.topology(c) for c in list(SUP.SPEC_CASES) + list(SUP.DIAG_ROWS) if c not in SUP.ARTIFACT_CASES}
    chn = {c: CH.declared_topology(c) for c in sup}
    check('DDP-12 topology table of the supervisor equals the channel table; driver_only = DP-PY19A, DP-PY02P and the DIAG-DP rows',
          sup == chn and sorted(c for c, t in sup.items() if t == 'driver_only') == sorted(SUP.DRIVER_ONLY), sup)
    bad = []
    for c, t in sup.items():
        steps = SUP.steps_of(c)
        uses_adapter = any(s.get('api') in ('barrier',) for s in steps) or 'peer_script' in SUP.delivered_input(c) or c in SUP.DIAG_ROWS and c.startswith('DIAG-PY-')
        if (t == 'driver_only') == uses_adapter:
            bad.append(c)
    check('DDP-12 the topology of every case matches its steps (driver_only: no barrier, no peer_script)', not bad, bad)


def driver_only_19a(adapter_frame=False, adapter_proc=False):
    c = CASES['DP-PY19A']
    cs = c['case_input_sha256']
    f = [{'kind': 'BEGIN', 'data': {'nonce': 'n', 'source_sha256': '0' * 64, 'pid_namespace': 'pid:[1]', 'case_input_sha256': cs,
                                     'dependency_identity': {'pydantic': '2.13.4', 'pydantic_core': '2.46.4'}}},
         {'kind': 'DIAGNOSTIC', 'data': {'milestone': 'KEYLESS_START', 'detail': {'credential_keys': [], 'codex_home_env': False}}},
         {'kind': 'DIAGNOSTIC', 'data': {'milestone': 'SYS_PATH', 'detail': {'step': 0, 'reason': 'driver_runtime', 'inserted': None, 'removed': None,
                                                                             'purged': [], 'sys_path_head': ['/profile/sdk-python'], 'runtime_entries': [],
                                                                             'codex_cli_bin_loaded': False}}}]
    for st, msg, cause in ((2, 'Codex binary not found at /work/missing-codex. Set CodexConfig.codex_bin to a valid binary path.', None),
                           (4, 'Unable to locate the pinned Codex runtime. Install the published SDK build with its openai-codex-cli-bin dependency, '
                               'or set CodexConfig.codex_bin explicitly.', {'class': 'builtins.ModuleNotFoundError', 'str': "No module named 'codex_cli_bin'"})):
        f.append({'kind': 'DIAGNOSTIC', 'data': {'milestone': 'STEP_BEGIN', 'detail': {'step': st, 'api': 'call'}}})
        f.append({'kind': 'API_ERROR', 'data': {'api': '%d:call:start' % st, 'name': 'builtins.FileNotFoundError', 'message': msg,
                                                'cause': None if cause is None else {'name': cause['class'], 'message': cause['str']}}})
        det = {'label': '%d:call:start' % st, 'class': 'builtins.FileNotFoundError', 'str': msg}
        if cause:
            det['cause'] = cause
        f.append({'kind': 'DIAGNOSTIC', 'data': {'milestone': 'ERROR_DETAIL', 'detail': det}})
    f += [{'kind': 'DIAGNOSTIC', 'data': {'milestone': 'CALLS_DONE', 'detail': {}}},
          {'kind': 'DIAGNOSTIC', 'data': {'milestone': 'SDK_CLIENT_CLOSED', 'detail': {}}},
          {'kind': 'END', 'data': {'streams': {}, 'child_exit_code': None, 'child_signal': None, 'complete': True}}]
    d = tlog('driver', f, cs)
    d.begin = f[0]['data']
    d.terminal = 'END'
    a = tlog('adapter', [{'kind': 'BEGIN', 'data': {}}] if adapter_frame else [])
    if adapter_frame:
        a.raw_bytes = 64
    logs = {'driver': d, 'adapter': a, 'peer': tlog('peer', [])}
    checks = {k: True for k in ('admission_witness_ok', 'cgroup_limits_match', 'fifo_eof_all')}
    verdict, reasons, _ = OBS.reconcile_driver_only(logs, {'checks': checks})
    w = {'topology': 'driver_only', 'maps': {'ok': True}, 'case_input_sha256_supervisor': cs, 'case_input_sha256_recomputed': cs,
         'frame_gidx': {'driver': list(range(1, len(f) + 1)), 'adapter': [], 'peer': []}, 'actions': [],
         'scan': {'adapter_pids': [[999, '1']] if adapter_proc else [], 'extra': [], 'samples': 3}, 'zero_checks': []}
    return ACC.evaluate('DP-PY19A', logs, verdict, reasons, w)


def t_errata_r2_f01():
    a = driver_only_19a()
    check('erratum R2-F01 (6): synthetic driver_only capture of DP-PY19A gives PASS_CLIENT_OBSERVATION (form PASS)',
          a['outcome'] == 'PASS_CLIENT_OBSERVATION' and a['capture_form'] == 'PASS' and a['build_link'] == 'NO_BUILD_LINK_DECLARED',
          {'outcome': a['outcome'], 'failed': a['failed_predicates'], 'reasons': a['capture_reasons']})
    b = driver_only_19a(adapter_frame=True)
    check('erratum R2-F01 (6): the same capture with one adapter frame gives INVALID_CAPTURE (rule 1)', b['outcome'] == 'INVALID_CAPTURE'
          and b['composition_rule'] == 1, b['capture_reasons'])
    m = driver_only_19a(adapter_proc=True)
    check('erratum R2-F01 (6): DP-PY19A driver_only with an adapter process in the cgroup gives MISMATCH by proc.spawn_count_exact',
          m['outcome'] == 'MISMATCH' and m['composition_rule'] == 6 and m['failed_predicates'] == ['proc.spawn_count_exact'], m['failed_predicates'])
    keep = ACC.CASES_DEF['DP-PY19A']
    try:
        ACC.CASES_DEF['DP-PY19A'] = dict(keep, build_link=None)
        x = driver_only_19a()
    finally:
        ACC.CASES_DEF['DP-PY19A'] = keep
    check('EDP-05: a non-CONTROL case without build_link is an evaluator failure (rule 3)', x['outcome'] == 'INVALID_CAPTURE' and x['composition_rule'] == 3)


# ================================================================================================ DP-PY02P and DP-PY19B/C evaluator (synthetic)
def py02p_capture(edit=None):
    """Synthetic driver_only capture of DP-PY02P with the frames and witnesses the DP-2 stack writes; edit(frames, w) perturbs it."""
    c = CASES['DP-PY02P']
    cs = c['case_input_sha256']
    exp = c['expected']
    f = [{'kind': 'BEGIN', 'data': {'nonce': 'n', 'source_sha256': '0' * 64, 'pid_namespace': 'pid:[1]', 'case_input_sha256': cs,
                                     'dependency_identity': {'pydantic': '2.13.4', 'pydantic_core': '2.46.4'}}},
         {'kind': 'DIAGNOSTIC', 'data': {'milestone': 'KEYLESS_START', 'detail': {'credential_keys': [], 'codex_home_env': False, 'codex_home_dir_exists': False,
                                                                                 'codex_home_entries': []}}},
         {'kind': 'DIAGNOSTIC', 'data': {'milestone': 'SYS_PATH', 'detail': {'step': 0, 'reason': 'driver_runtime', 'inserted': '/dist/py/site', 'removed': None,
                                                                             'purged': [], 'sys_path_head': ['/dist/py/site', '/profile/sdk-python'],
                                                                             'runtime_entries': ['/dist/py/site'], 'codex_cli_bin_loaded': False}}},
         {'kind': 'PROC_RETAIN', 'data': {'as': 'p', 'pid': 7, 'args': exp['process']['popen_args']}},
         {'kind': 'PROBE', 'data': {'id': 'popen_args', 'value': exp['probes']['popen_args']}},
         {'kind': 'PROBE', 'data': {'id': 'checkout_command', 'value': exp['probes']['checkout_command']}},
         {'kind': 'DIAGNOSTIC', 'data': {'milestone': 'WITNESS_REQUEST', 'detail': {'step': 6, 'id': 'realcli_witness', 'pid': 7, 'negative': False}}},
         {'kind': 'DIAGNOSTIC', 'data': {'milestone': 'WITNESS_DONE_SEEN', 'detail': {'step': 6, 'id': 'realcli_witness', 'elapsed_ms': 3.0}}},
         {'kind': 'DIAGNOSTIC', 'data': {'milestone': 'STEP_BEGIN', 'detail': {'step': 7, 'api': 'call'}}},
         {'kind': 'API_RESULT', 'data': {'api': '7:call:initialize', 'result': {'class': 'InitializeResponse'}, 'observations': {}}},
         {'kind': 'PROBE', 'data': {'id': 'runtime_version', 'value': exp['probes']['runtime_version']}},
         {'kind': 'DIAGNOSTIC', 'data': {'milestone': 'CALLS_DONE', 'detail': {}}},
         {'kind': 'DIAGNOSTIC', 'data': {'milestone': 'SDK_CLIENT_CLOSED', 'detail': {}}},
         {'kind': 'END', 'data': {'streams': {}, 'child_exit_code': None, 'child_signal': None, 'complete': True}}]
    gidx = list(range(1, len(f) + 1))
    staging = [11, 22]
    want_dist = hashlib.sha256(json.dumps(STG.expected_dist(), separators=(',', ':'), ensure_ascii=False, allow_nan=False).encode('utf-8')).hexdigest()
    w = {'topology': 'driver_only', 'maps': {'ok': True}, 'case_input_sha256_supervisor': cs, 'case_input_sha256_recomputed': cs,
         'frame_gidx': {'driver': gidx, 'adapter': [], 'peer': []},
         'actions': [{'action': 'REALCLI_WITNESS', 'gidx': 7.5, 'detail': {}}],
         'keyless': {'ok': True}, 'cgroup_limits': {'memory.max': '1073741824', 'pids.max': '256', 'cpu.max': '100000 100000'},
         'declared_limits': {'MemoryMax': '1073741824', 'TasksMax': '256'}, 'limits_ok': True,
         'realcli_witnesses': [{'request': 1, 'step': 6, 'id': 'realcli_witness', 'pid': 7, 'read': True, 'ok': True, 'alive_after': True,
                                'cmdline': exp['process']['proc_cmdline'], 'environ': dict(SUP.FIXED_ENV, PATH=exp['process']['env_path']),
                                'exe_dev_ino': staging, 'staging_dev_ino': staging, 'driver_children': [[4242, 7, ['/dist/py/site/codex_cli_bin/bin/codex']]]}],
         'stage_witness': {'archives': {a: STG.ARCHIVES[a]['observed']['sha256'] for a, _p, _t in STG.LAYOUT}, 'archives_ok': True,
                           'dist': {'files': 36, 'manifest_sha256': want_dist}, 'dist_ok': True, 'real_binary': {'dev_ino': staging}},
         'scan': {'adapter_pids': [], 'extra': [], 'samples': 3}, 'zero_checks': []}
    if edit is not None:
        edit(f, w)
    d = tlog('driver', f, cs)
    d.begin = f[0]['data']
    d.terminal = 'END'
    logs = {'driver': d, 'adapter': tlog('adapter', []), 'peer': tlog('peer', [])}
    verdict, reasons, _ = OBS.reconcile_driver_only(logs, {'checks': {'admission_witness_ok': True}})
    return ACC.evaluate('DP-PY02P', logs, verdict, reasons, w)


def t_py02p():
    a = py02p_capture()
    check('DP-PY02P synthetic: the frames and witnesses of the DP-2 stack give PASS_CLIENT_OBSERVATION in the form REAL_CLI_KEYLESS',
          a['outcome'] == 'PASS_CLIENT_OBSERVATION' and a['capture_form'] == 'REAL_CLI_KEYLESS', {'failed': a['failed_predicates'], 'impl': a['implicit_predicates']})
    cases = {
        'witness after the initialize': (lambda f, w: w['actions'][0].update(gidx=9.5), 'INVALID_CAPTURE', ['realcli.witness_read']),
        'cmdline without --config': (lambda f, w: w['realcli_witnesses'][0].update(cmdline=['/dist/py/site/codex_cli_bin/bin/codex', 'app-server', '--listen', 'stdio://']),
                                     'MISMATCH', ['realcli.argv_exact']),
        'codex-path out of PATH': (lambda f, w: w['realcli_witnesses'][0]['environ'].update(PATH='/runtime'), 'MISMATCH', ['realcli.env_path_exact']),
        'two children': (lambda f, w: w['realcli_witnesses'][0]['driver_children'].append([4243, 8, ['x']]), 'MISMATCH', ['realcli.children_exact']),
        'exe not the staged member': (lambda f, w: w['realcli_witnesses'][0].update(exe_dev_ino=[1, 2]), 'INVALID_CAPTURE', ['realcli.exe_identity']),
        'cgroup with the inherited 512 MiB': (lambda f, w: w['cgroup_limits'].update({'memory.max': '536870912'}), 'INVALID_CAPTURE', ['service.limits_declared']),
        'credential in the real process env': (lambda f, w: w['realcli_witnesses'][0]['environ'].update(OPENAI_API_KEY='x'), 'INVALID_CAPTURE',
                                               ['keyless.no_network_no_credential']),
        'other runtime version': (lambda f, w: f[10]['data'].update(value='0.0.0'), 'MISMATCH', ['probe.values_exact']),
        'runtime not inserted': (lambda f, w: f[2]['data']['detail'].update(inserted=None, runtime_entries=[]), 'INVALID_CAPTURE', ['runtime.sys_path_exact']),
        '/dist manifest drift': (lambda f, w: w['stage_witness']['dist'].update(manifest_sha256='0' * 64), 'INVALID_CAPTURE', ['stage.bound_to_cache']),
    }
    got = {}
    for name, (edit, outcome, failed) in cases.items():
        r = py02p_capture(edit)
        got[name] = [r['outcome'], r['failed_predicates'], r['outcome'] == outcome and r['failed_predicates'] == failed]
    check('DP-PY02P synthetic negatives: each perturbation fails only its predicate with the class outcome (realcli.*, limits, keyless, probe, sys_path, stage)',
          all(v[2] for v in got.values()), got)


def t_py19_units():
    root = SCRATCH / 'py19'
    if root.exists():
        shutil.rmtree(root)
    root.mkdir(parents=True)
    out = {}
    for case in ('DP-PY19B', 'DP-PY19C'):
        c = CASES[case]
        trees = c['case_input']['trees']
        fx = root / case
        fx.mkdir()
        host = STG.materialize(trees, fx)
        sand = {k: dict(v) for k, v in host.items()}
        d = tlog('driver', [{'kind': 'DIAGNOSTIC', 'data': {'milestone': 'FIXTURE_READBACK', 'detail': {
            'roots': {t['root']: {k: v for k, v in sand.items() if k.startswith(t['root'] + '/')} for t in trees},
            'write_probe': {t['root']: 'EROFS' for t in trees}}}}])
        w = {'fixture_manifest_host': host, 'stage_witness': {'archives': {a: STG.ARCHIVES[a]['observed']['sha256'] for a, _p, _t in STG.LAYOUT},
                                                              'archives_ok': True, 'dist': {'manifest_sha256': hashlib.sha256(json.dumps(
                                                                  STG.expected_dist(), separators=(',', ':'), ensure_ascii=False).encode()).hexdigest()}}}
        pos = ACC.fixture_exact(c, d, w)[0] and ACC.stage_bound(c, w)[0]
        d2 = tlog('driver', [{'kind': 'DIAGNOSTIC', 'data': {'milestone': 'FIXTURE_READBACK', 'detail': {
            'roots': {t['root']: {k: v for k, v in sand.items() if k.startswith(t['root'] + '/')} for t in trees},
            'write_probe': {t['root']: 'ok' for t in trees}}}}])
        writable = ACC.fixture_exact(c, d2, w)[0]
        envp = ACC.env_path_exact({'proc_witnesses': [{'read': True, 'ok': True, 'environ': {'PATH': c['expected']['process']['env_path']}}]},
                                  c['expected']['process']['env_path'])[0]
        envn = ACC.env_path_exact({'proc_witnesses': [{'read': True, 'ok': True, 'environ': {'PATH': '/x:/runtime'}}]}, c['expected']['process']['env_path'])[0]
        out[case] = {'positive': pos, 'writable_fixture_refused': not writable, 'env_path_positive': envp, 'env_path_negative': not envn}
    shutil.rmtree(root)
    check('DP-PY19B/DP-PY19C units: fixture.tree_exact and stage.bound_to_cache over their trees (positive; a writable fixture refused) and '
          'proc.env_path_exact (positive and negative)', all(all(v.values()) for v in out.values()), out)


# ================================================================================================ CAP-DP-STAGE
def bwrap_probe(ro_dir, rw_note):
    """Own script inside an own bwrap (no systemd, no cache code): write under a read-only bind and under a tmpfs."""
    script = ('import os,errno\nout={}\nfor p in ("/ro/x","/work/x"):\n    try:\n        fd=os.open(p,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o644)\n'
              '        os.close(fd); out[p]="ok"\n    except OSError as e:\n        out[p]=errno.errorcode[e.errno]\nprint(out)\n')
    cmd = ['/usr/bin/bwrap', '--unshare-all', '--die-with-parent', '--clearenv', '--ro-bind', '/usr', '/usr', '--symlink', 'usr/lib', '/lib',
           '--symlink', 'usr/lib64', '/lib64', '--symlink', 'usr/bin', '/bin', '--proc', '/proc', '--dev', '/dev', '--ro-bind', str(ro_dir), '/ro',
           '--tmpfs', '/work', '--remount-ro', '/', '/usr/bin/python3.12', '-I', '-S', '-c', script]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    return r.stdout.strip(), r.returncode


def t_stage():
    root = SCRATCH / 'stage'
    if root.exists():
        shutil.rmtree(root)
    root.mkdir(parents=True)
    got = STG.stage_own(root / 'own')
    want = dict(sorted({**STG.expected_own('tgz/'), **STG.expected_own('whl/')}.items()))
    check('CAP-DP-STAGE: modes preserved (0755 for the script, 0644 for the rest) in an own tar.gz and an own zip (wheel)', got == want
          and got['tgz/own/bin/tool']['mode'] == '0755' and got['whl/own/bin/tool']['mode'] == '0755' and got['whl/own/README.txt']['mode'] == '0644', got)
    try:
        STG.stage_own(root / 'bad', tamper='member')
        refused = False
    except AssertionError:
        refused = True
    check('CAP-DP-STAGE: own member with a divergent sha refused', refused)
    keep = STG.MEMBERS['A1']['codex_cli_bin/codex-package.json']
    STG.MEMBERS['A1']['codex_cli_bin/codex-package.json'] = dict(keep, sha256='0' * 64)
    try:
        STG.member_bytes('A1', 'codex_cli_bin/codex-package.json')
        refused = False
    except AssertionError:
        refused = True
    finally:
        STG.MEMBERS['A1']['codex_cli_bin/codex-package.json'] = keep
    check('CAP-DP-STAGE: cache member with a divergent sha refused (artifact-metadata.json)', refused)
    keep = STG.ARCHIVES['A4']['observed']['sha256']
    STG._ARCHIVE_OK.clear()
    STG.ARCHIVES['A4']['observed']['sha256'] = '0' * 64
    try:
        STG.check_archive('A4')
        refused = False
    except AssertionError:
        refused = True
    finally:
        STG.ARCHIVES['A4']['observed']['sha256'] = keep
        STG._ARCHIVE_OK.clear()
    check('CAP-DP-STAGE: cache archive with a divergent sha refused (acquisition-ledger.json)', refused)
    trees = [{'root': '/fixture/t', 'entries': [{'path': '/fixture/t/a/__init__.py', 'kind': 'copy_of_member', 'member': 'A1:codex_cli_bin/__init__.py'},
                                                {'path': '/fixture/t/launcher', 'kind': 'copy_of_profile', 'from': '/profile/adapter-python-exec', 'mode': '0755'},
                                                {'path': '/fixture/t/d', 'kind': 'dir'},
                                                {'path': '/fixture/t/j.json', 'kind': 'json', 'value': {'k': 1}},
                                                {'path': '/fixture/t/link', 'kind': 'symlink', 'target': '/fixture/t/a/__init__.py'}]}]
    fx = root / 'fixture'
    fx.mkdir()
    man = STG.materialize(trees, fx)
    check('CAP-DP-STAGE (DDP-11): fixture tree materialized exactly (copy by sha, profile launcher 0755, dir, json, exact symlink target)',
          STG.check_fixture(trees, man) == [] and os.readlink(fx / 't' / 'link') == '/fixture/t/a/__init__.py'
          and man['/fixture/t/launcher']['mode'] == '0755', STG.check_fixture(trees, man))
    bad = dict(man)
    bad['/fixture/t/a/__init__.py'] = dict(bad['/fixture/t/a/__init__.py'], sha256='0' * 64)
    check('CAP-DP-STAGE: fixture tree with a divergent copy refused (fixture.tree_exact)', STG.check_fixture(trees, bad) != [])
    (fx / 't' / 'extra.txt').write_text('undeclared\n')
    rescan = STG.fixture_manifest(trees, fx)
    check('DP1-ADM/R1-F07: fixture.tree_exact scans the root of each tree (an undeclared file under the root is a problem)',
          any('extra' in p for p in STG.check_fixture(trees, rescan)), STG.check_fixture(trees, rescan))
    out, rc = bwrap_probe(root / 'own', 'tmpfs')
    check('CAP-DP-STAGE: a write under a read-only bind gives EROFS and under the tmpfs /work it works (own bwrap run, own code)',
          rc == 0 and out == "{'/ro/x': 'EROFS', '/work/x': 'ok'}", [out, rc])
    check('CAP-DP-STAGE: staging and attempts live outside docs/ (nothing written under docs/)', not str(SUP.DIST).startswith(str(UNIT.parents[3]))
          and not str(SUP.ATTEMPTS).startswith(str(UNIT.parents[3])) and str(SUP.DIST).startswith('/mnt/dados/cvg-work/'))
    shutil.rmtree(root)


# ================================================================================================ CAP-DP-PY-RUNTIME
def t_pyruntime():
    root = SCRATCH / 'pyrt'
    if root.exists():
        shutil.rmtree(root)
    for site, val in (('siteA', 'A'), ('siteB', 'B')):
        (root / site / 'cvg_st_mod').mkdir(parents=True)
        (root / site / 'cvg_st_mod' / '__init__.py').write_text("SITE = '%s'\n" % val)
    keep_roots, keep_path = DRV.RUNTIME_ROOTS, list(sys.path)
    DRV.RUNTIME_ROOTS = (str(root) + '/',)
    fch = FakeCh()
    try:
        it = DRV.Interp({'case': 'DIAG-DP-PYRUNTIME', 'case_input': {'diag_calls': [], 'driver_runtime': {'sys_path_runtime': str(root / 'siteA')}}}, fch, 'diag2b')
        it.dp_start()
        a = __import__('cvg_st_mod').SITE
        it.runtime_path({'step': 2, 'api': 'runtime.path', 'insert': str(root / 'siteB'), 'purge_modules': ['cvg_st_mod']})
        b = __import__('cvg_st_mod').SITE
        it.runtime_path({'step': 3, 'api': 'runtime.path', 'insert': str(root / 'siteA'), 'purge_modules': []})
        cached = __import__('cvg_st_mod').SITE
        it.runtime_path({'step': 4, 'api': 'runtime.path', 'insert': str(root / 'siteA'), 'purge_modules': ['cvg_st_mod']})
        a2 = __import__('cvg_st_mod').SITE
        recs = fch.ms('SYS_PATH')
    finally:
        DRV.RUNTIME_ROOTS = keep_roots
        sys.path[:] = keep_path
        sys.modules.pop('cvg_st_mod', None)
    check('CAP-DP-PY-RUNTIME: purge of an own module (without purge the cached module stays)', cached == 'B' and a2 == 'A', [a, b, cached, a2])
    check('CAP-DP-PY-RUNTIME: sys.path recorded at the start and at every swap (SYS_PATH, previous runtime removed)', len(recs) == 4
          and [r['step'] for r in recs] == [0, 2, 3, 4] and recs[1]['removed'] == str(root / 'siteA') and recs[1]['runtime_entries'] == [str(root / 'siteB')]
          and recs[0]['inserted'] == str(root / 'siteA'), recs)
    check('CAP-DP-PY-RUNTIME: the import after a swap with purge comes from the new site', a == 'A' and b == 'B')
    ok_sp, det = ACC.sys_path_exact({'case_input': {'driver_runtime': {'sys_path_runtime': str(root / 'siteA')}, 'diag_calls': [
        {'step': 2, 'api': 'runtime.path', 'insert': str(root / 'siteB'), 'purge_modules': ['cvg_st_mod']},
        {'step': 3, 'api': 'runtime.path', 'insert': str(root / 'siteA'), 'purge_modules': []},
        {'step': 4, 'api': 'runtime.path', 'insert': str(root / 'siteA'), 'purge_modules': ['cvg_st_mod']}]}},
        tlog('driver', [{'kind': 'DIAGNOSTIC', 'data': {'milestone': 'SYS_PATH', 'detail': r}} for r in recs]))
    bad = copy.deepcopy(recs)
    bad[1]['removed'] = None
    ok_bad, _ = ACC.sys_path_exact({'case_input': {'driver_runtime': {'sys_path_runtime': str(root / 'siteA')}, 'diag_calls': [
        {'step': 2, 'api': 'runtime.path', 'insert': str(root / 'siteB'), 'purge_modules': ['cvg_st_mod']},
        {'step': 3, 'api': 'runtime.path', 'insert': str(root / 'siteA'), 'purge_modules': []},
        {'step': 4, 'api': 'runtime.path', 'insert': str(root / 'siteA'), 'purge_modules': ['cvg_st_mod']}]}},
        tlog('driver', [{'kind': 'DIAGNOSTIC', 'data': {'milestone': 'SYS_PATH', 'detail': r}} for r in bad]))
    check('runtime.sys_path_exact: positive over the recorded swaps and negative with the previous runtime kept', ok_sp and not ok_bad, det)
    shutil.rmtree(root)


# ================================================================================================ CAP-DP-REAL-CLI-KEYLESS
def keyless_case(ks, env, kw_ok=True):
    d = tlog('driver', [{'kind': 'DIAGNOSTIC', 'data': {'milestone': 'KEYLESS_START', 'detail': ks}}])
    w = {'keyless': {'ok': kw_ok}, 'realcli_witnesses': [{'read': True, 'ok': True, 'environ': env}]}
    return ACC.keyless_ok({'id': 'DP-PY02P'}, d, w)[0]


def t_realcli():
    clean = {'credential_keys': [], 'codex_home_env': False, 'codex_home_dir_exists': False, 'codex_home_entries': []}
    env = dict(SUP.FIXED_ENV, PATH='/dist/py/site/codex_cli_bin/codex-path:/runtime')
    check('CAP-DP-REAL-CLI-KEYLESS: keyless positive (no credential, CODEX_HOME unset and absent, netns only lo)', keyless_case(clean, env))
    check('CAP-DP-REAL-CLI-KEYLESS: closed list of credential variables refused (OPENAI_API_KEY in the real process env)',
          not keyless_case(clean, dict(env, OPENAI_API_KEY='x')) and not keyless_case(dict(clean, credential_keys=['GH_TOKEN']), env))
    check('CAP-DP-REAL-CLI-KEYLESS: CODEX_HOME not empty refused', not keyless_case(dict(clean, codex_home_dir_exists=True, codex_home_entries=['auth.json']), env)
          and not keyless_case(clean, dict(env, CODEX_HOME='/work/home/.codex')))
    lim = {c: SUP.props_of(c) for c in [SUP.CONTROL_CASE] + SUP.SDK_CASES + SUP.ADMISSION_DIAGS}
    check('CAP-DP-REAL-CLI-KEYLESS: limits 1 GiB and 256 only in the declared cases (DP-PY02P, DIAG-DP-REAL-CLI-APPSERVER); 512 MiB and 32 elsewhere',
          sorted(c for c, p in lim.items() if p['MemoryMax'] == '1073741824' and p['TasksMax'] == '256') == sorted(SUP.LIMITS_1G)
          and all(p['MemoryMax'] == '536870912' and p['TasksMax'] == '32' for c, p in lim.items() if c not in SUP.LIMITS_1G))
    good = {'cgroup_limits': {'memory.max': '1073741824', 'pids.max': '256'}, 'declared_limits': {'MemoryMax': '1073741824', 'TasksMax': '256'}, 'limits_ok': True}
    check('service.limits_declared: positive for DP-PY02P and negative with the inherited 512 MiB in its cgroup',
          ACC.limits_declared({'id': 'DP-PY02P'}, good)[0]
          and not ACC.limits_declared({'id': 'DP-PY02P'}, dict(good, cgroup_limits={'memory.max': '536870912', 'pids.max': '256'}))[0])
    # REALCLI_WITNESS of an own long-running process, refused before its PROC_RETAIN and read after it (supervisor code).
    child = subprocess.Popen(['/usr/bin/python3.12', '-I', '-S', '-c', 'import time; time.sleep(30)'], env={'PATH': '/cvg/st', 'CVG_ST': '1'})
    try:
        att = SUP.Attempt('DIAG-DP-REAL-CLI-APPSERVER')
        me = SUP.proc_info(os.getpid())
        att.role_host = {'driver': me}
        att.members = lambda: [i for i in (SUP.proc_info(child.pid),) if i]
        sent = []
        att.send = lambda role, cmd, tag=None, **kw: sent.append((role, cmd, tag))
        att.act = lambda name, **kw: None
        ev = []

        def add(kind, data):
            ev.append({'kind': kind, 'data': data, 'seq': len(ev), 'mono_ns': str(1000 + len(ev))})
        add('DIAGNOSTIC', {'milestone': 'WITNESS_REQUEST', 'detail': {'step': 2, 'id': 'neg', 'pid': None, 'negative': True}})
        add('PROC_RETAIN', {'as': 'rp', 'pid': child.pid, 'args': ['x']})
        add('DIAGNOSTIC', {'milestone': 'WITNESS_REQUEST', 'detail': {'step': 4, 'id': 'w', 'pid': child.pid, 'negative': False}})
        att.logs = {'driver': tlog('driver', [])}
        att.logs['driver'].events = ev
        time.sleep(0.2)
        att.realcli_requests()
        r = att.realcli
    finally:
        child.kill()
        child.wait()
    check('CAP-DP-REAL-CLI-KEYLESS: REALCLI_WITNESS refused before the PROC_RETAIN (negative) and read after it for an own long-running process',
          len(r) == 2 and r[0]['read'] is False and 'refused' in r[0]['failure'] and r[1]['read'] is True and r[1]['ok'] is True
          and r[1]['environ'] == {'PATH': '/cvg/st', 'CVG_ST': '1'} and r[1]['ppid_is_driver'] is True
          and child.pid in [k[0] for k in r[1]['driver_children']] and [x[1] for x in sent] == ['WITNESS_DONE', 'WITNESS_DONE'],
          {'records': [{k: v for k, v in x.items() if k != 'environ'} for x in r], 'sent': sent})
    # own JSON-RPC client of DIAG-DP-REAL-CLI-APPSERVER against two own servers (no published binary, no SDK): one ends at stdin EOF,
    # one ignores SIGTERM and stays (the client kills and reaps it after the 2 s bound).
    SCRATCH.mkdir(parents=True, exist_ok=True)
    body = ('import sys,json,signal,time\n%s\nfor line in sys.stdin:\n    o=json.loads(line)\n    if o.get("method")=="initialize":\n'
            '        sys.stdout.write(json.dumps({"method":"note"})+"\\n")\n'
            '        sys.stdout.write(json.dumps({"id":o["id"],"result":{"userAgent":"own/0.0.1"}})+"\\n"); sys.stdout.flush()\n%s\n')
    runs = {}
    for name, pre, post in (('ends_at_eof', '', ''), ('ignores_sigterm', 'signal.signal(signal.SIGTERM, signal.SIG_IGN)', 'time.sleep(60)')):
        srv = SCRATCH / ('own_server_%s.py' % name)
        srv.write_text(body % (pre, post))
        own = DRV.OwnRealClient(['/usr/bin/python3.12', '-I', '-S', str(srv)], {'PATH': '/usr/bin'}, str(SCRATCH))
        runs[name] = [own.initialize(10), own.stop(2)]
        srv.unlink()
    a, b = runs['ends_at_eof'], runs['ignores_sigterm']
    check('own real-binary client (DIAG-DP-REAL-CLI-APPSERVER): initialize reply with the notification counted; stop by stdin close + SIGTERM '
          '(ended in time) and kill + reap after the 2 s bound (SIGTERM ignored)',
          all(r[0]['reply'] is True and r[0]['has_result'] is True and r[0]['other_lines'] == 1 and r[0]['result'] == {'userAgent': 'own/0.0.1'} for r in (a, b))
          and a[1]['exited_within_s'] is True and a[1]['killed'] is False and a[1]['returncode'] in (0, -15)
          and b[1]['killed'] is True and b[1]['returncode'] == -9 and b[1]['exited_within_s'] is False, runs)


# ================================================================================================ CAP-DP-ARTIFACT-CHECK (own stand-in)
def fake_stage(edit=None):
    exp = CASES['DP-PY20A']['expected']['artifacts']
    S = types.SimpleNamespace()
    S._ARCHIVE_OK = {}
    S.ARCHIVES = {'A1': {'observed': {'sha256': 'a1'}}, 'A5': {'observed': {'sha256': 'a5'}}}
    S.REQUESTS = {'M7': {'sha256': 'm7'}}
    S.member_ref = STG.member_ref
    S.sha_bytes = STG.sha_bytes
    S.check_archive = lambda aid: S.ARCHIVES[aid]['observed']['sha256'] if not (edit == 'archive' and aid == 'A5') else (_ for _ in ()).throw(
        AssertionError('cache archive A5 differs from acquisition-ledger.json'))
    wheel = ''.join('%s: %s\n' % (k, v) for k, v in exp['wheel_tag'].items()).encode() if edit != 'field' else b'Tag: py3-none-any\nRoot-Is-Purelib: true\n'
    S.member_bytes = lambda aid, name: (wheel, 0o644)
    S.wheel_fields = STG.wheel_fields
    S.ledger_item = lambda aid: dict(exp['asset_binding'])
    S.compare_members = lambda a, b: (dict(exp['payload_identity']), [])
    listing = copy.deepcopy(exp['asset_listing'])
    assets = [{'name': n, **v} for n, v in listing['assets'].items()]
    if edit == 'name':
        assets = assets[1:]
    S.m7_metadata = lambda: ({'tag_name': listing['tag_name'], 'assets': assets}, 'm7')
    return S


def t_artifact():
    ok = ACC.evaluate_artifact('DP-PY20A', fake_stage())
    check('CAP-DP-ARTIFACT-CHECK (own stand-in of the cache): every frozen field equal gives PASS_CLIENT_OBSERVATION', ok['outcome'] == 'PASS_CLIENT_OBSERVATION'
          and ok['build_link'] == 'NO_BUILD_LINK_DECLARED', ok['failed_predicates'])
    f = ACC.evaluate_artifact('DP-PY20A', fake_stage('field'))
    check('CAP-DP-ARTIFACT-CHECK: divergent field (wheel Tag/Root-Is-Purelib) gives MISMATCH', f['outcome'] == 'MISMATCH' and f['failed_predicates'] == ['artifact.manifest_fields_exact'])
    a = ACC.evaluate_artifact('DP-PY20A', fake_stage('archive'))
    check('CAP-DP-ARTIFACT-CHECK: divergent cache archive gives INVALID_CAPTURE', a['outcome'] == 'INVALID_CAPTURE', a['implicit_predicates'])
    n = ACC.evaluate_artifact('DP-PY20A', fake_stage('name'))
    check('CAP-DP-ARTIFACT-CHECK: a declared name absent from the release listing gives MISMATCH', n['outcome'] == 'MISMATCH'
          and n['failed_predicates'] == ['artifact.manifest_fields_exact'])
    check('CAP-DP-ARTIFACT-CHECK: the final-export item of the contract is DP-1 only (DP-PK09A); DP-PY20A has no dist export to read',
          all('final export' not in json.dumps(s_) for s_ in CASES['DP-PY20A']['case_input']['sdk_calls']))


# ================================================================================================ DP1-ADM/R2-F05 service properties
def t_props():
    allc = [SUP.CONTROL_CASE] + SUP.SDK_CASES + SUP.ADMISSION_DIAGS
    check('DP1-ADM/R2-F05: every service property equals the inherited 2B-2 table, except MemoryMax/TasksMax in the declared cases; RuntimeMaxSec 45',
          all(SUP.props_ok(c, SUP.props_of(c)) for c in allc) and all(SUP.props_of(c)['RuntimeMaxSec'] == '45' for c in allc)
          and SUP.INHERITED_PROPS == {'MemoryMax': '536870912', 'TasksMax': '32', 'CPUQuota': '100%', 'RuntimeMaxSec': '45', 'KillMode': 'control-group',
                                      'TimeoutStopSec': '3', 'NoNewPrivileges': 'yes', 'LimitNOFILE': '128', 'LimitFSIZE': '8388608', 'LimitCORE': '0'})
    neg = {}
    for k, v in (('KillMode', 'process'), ('TimeoutStopSec', '30'), ('NoNewPrivileges', 'no'), ('LimitNOFILE', '1024'), ('RuntimeMaxSec', '90')):
        neg[k] = SUP.props_ok('DP-PY02P', dict(SUP.props_of('DP-PY02P'), **{k: v}))
    neg['MemoryMax on DP-PY19A'] = SUP.props_ok('DP-PY19A', dict(SUP.props_of('DP-PY19A'), MemoryMax='1073741824'))
    check('DP1-ADM/R2-F05 negative: KillMode, TimeoutStopSec, NoNewPrivileges, Limit*, RuntimeMaxSec or an undeclared limit differing is refused',
          not any(neg.values()), neg)


# ================================================================================================ C3-2 carry-overs
def t_c32():
    hs = H.HookSet()
    hs.install([], None)
    idents = []
    try:
        for name in ('cvg-first', 'cvg-second'):
            t = threading.Thread(target=lambda: sum(range(10)), name=name)
            t.start()
            t.join()
            idents.append(t.ident)
    finally:
        hs.stop()
    check('C32-ADM/R1-F01 (1): two own threads in sequence with a reused ident are both registered (threading.local registry)',
          {'cvg-first', 'cvg-second'} <= hs.seen_threads, {'idents_equal': idents[0] == idents[1], 'registry': sorted(hs.seen_threads)})
    c = {'case_input': {'sdk_calls': [{'step': 1, 'api': 'fault.install', 'on': 'x', 'attr': 'cleanup'}, {'step': 2, 'api': 'fault.remove', 'on': 'x', 'attr': 'cleanup'}]},
         'expected': {'fault': {'fired': [{'attr': 'cleanup', 'count': 1, 'zero_calls_client_effect_unless_started': 'cvg-watched'}]}}}

    def dlog(started, frames=()):
        f = [{'kind': 'DIAGNOSTIC', 'data': {'milestone': 'FAULT_SCOPE', 'detail': {'target': 'x.cleanup', 'state': 'installed', 'ok': True}}},
             {'kind': 'DIAGNOSTIC', 'data': {'milestone': 'FAULT_SCOPE', 'detail': {'target': 'x.cleanup', 'state': 'removed', 'calls': 0, 'count': 0, 'ok': True}}}]
        f += list(frames)
        f += [{'kind': 'DIAGNOSTIC', 'data': {'milestone': 'THREAD_REGISTRY', 'detail': {'installed': True, 'started': started, 'alive': [],
                                                                                         'union': started}}},
              {'kind': 'DIAGNOSTIC', 'data': {'milestone': 'SCOPES_AT_CALLS_DONE', 'detail': {'faults_active': [], 'shims_active': []}}}]
        return tlog('driver', f)
    never = ACC.fault_fired(c, dlog(['MainThread']))[0]
    in_reg = ACC.fault_fired(c, dlog(['MainThread', 'cvg-watched']))[0]
    in_frame = ACC.fault_fired(c, dlog(['MainThread'], [{'kind': 'HOOK_EVENT', 'data': {'id': 'h', 'event': 'call', 'occurrence': 1, 'thread_name': 'cvg-watched',
                                                                                          'record': {}}}]))[0]
    items = [{'id': 'fault.fired_as_declared', 'ok': in_reg, 'class': 'capture_order_or_cleanup'}]
    rule = ACC.compose({'accepted_capture_forms': ['PASS'], 'inconclusive_on_deadline': False}, 'PASS', items, True, False)
    check('C32-ADM/R1-F01 (2)-(3): zero calls accepted only with the watched thread out of the registry union and of every frame; '
          'in the registry or in a frame it is refused (INVALID_CAPTURE by rule 4)', never and not in_reg and not in_frame and rule == ('INVALID_CAPTURE', 4),
          {'never_started': never, 'in_registry': in_reg, 'in_frame': in_frame, 'rule': rule})
    it = DRV.Interp({'case': 'X', 'case_input': {'diag_calls': []}}, FakeCh(), 'diag2b')
    try:
        it.wait_class({'step': 1, 'api': 'worker.parked', 'wait_class': 'CLIENT_EFFECT'})
        refused = False
    except Exception:  # noqa: BLE001
        refused = True
    accepted = it.wait_class({'step': 2, 'api': 'worker.join', 'wait_class': 'CLIENT_EFFECT'}) == 'CLIENT_EFFECT'
    check('C32-ADM/R1-F03: wait_class refused on worker.parked (outside the D3-05 list) and accepted on worker.join', refused and accepted
          and DRV.WAIT_APIS == ('thread.join', 'hook.wait', 'excepthook.wait', 'worker.join', 'probe.until') == ACC.WAIT_APIS)
    dry = sorted(RUNTIME.glob('dry/evidence-*-DIAG-DP-PYRUNTIME'))
    if not dry:
        check('C32-ADM/DV-C32-02: plan_binding over a profile-manifest written by the real supervisor (dry run)', False, 'no dry run folder')
        return
    ev = dry[-1]
    man = json.loads((ev / 'profile-manifest.json').read_text())
    root = SCRATCH / 'plan'
    if root.exists():
        shutil.rmtree(root)
    root.mkdir(parents=True)
    pp = root / 'case-plan.json'
    shutil.copyfile(SUP.PLAN_FILE, pp)
    fz = root / 'source-freeze.json'
    fz.write_text(json.dumps({'files': {'case-plan.json': {'sha256': sha(pp.read_bytes())}}}))
    ok_real = man.get('case_plan_file', {}).get('sha256') == sha(pp.read_bytes()) and ACC.plan_binding(ev, 'DIAG-DP-PYRUNTIME', pp, fz)[0]
    fz.write_text(json.dumps({'files': {'case-plan.json': {'sha256': '0' * 64}}}))
    ok_neg = ACC.plan_binding(ev, 'DIAG-DP-PYRUNTIME', pp, fz)[0]
    check('C32-ADM/DV-C32-02: the real supervisor writes case_plan_file in profile-manifest.json; plan_binding holds over it and fails with another plan sha',
          ok_real and not ok_neg, {'manifest_case_plan_file': man.get('case_plan_file'), 'dry_folder': ev.name})
    shutil.rmtree(root)


def t_compile():
    bad = []
    for p in sorted(list(PY.glob('*.py')) + list((UNIT / 'tools').glob('*.py')) + [Path(__file__)]):
        try:
            compile(p.read_text(), str(p), 'exec')
        except SyntaxError as exc:
            bad.append([str(p.relative_to(UNIT)), str(exc)])
    check('compile of every Python source of the unit (no bytecode written)', not bad, bad)
    for f in ('fixture-rpc.py', 'adapter-python.py', 'adapter-python-exec', 'ownmodels.py', 'bootstrap.py'):
        check('python/%s byte-equal to the admitted C3-2 source' % f, (PY / f).read_bytes() == (G02 / 'sdk-continuation-3-2-admission/python' / f).read_bytes())


def main():
    SCRATCH.mkdir(parents=True, exist_ok=True)
    for t in (t_ids_tables, t_topology, t_errata_r2_f01, t_py02p, t_py19_units, t_stage, t_pyruntime, t_realcli, t_artifact, t_props, t_c32, t_compile):
        try:
            t()
        except Exception as exc:  # noqa: BLE001
            check(t.__name__ + ' raised', False, '%s: %s\n%s' % (type(exc).__name__, exc, traceback.format_exc()[-1500:]))
        finally:
            threading.setprofile(None)
            sys.setprofile(None)
    srcs = {p.relative_to(UNIT).as_posix(): sha(p.read_bytes()) for p in sorted(list(PY.iterdir()) + [Path(__file__)]) if p.is_file()}
    doc = {'kind': 'DP2_OFFLINE_SELFTESTS', 'task': 'DX100-G02:IMPLEMENT-AND-ADMIT-SDK-DISTRIBUTED-PROFILE-DP-2', 'evaluator_version': ACC.VERSION,
           'sdk_imported': 'openai_codex' in sys.modules, 'services': 0, 'network': False, 'cache_written': False,
           'passed': sum(1 for r in RESULTS if r['ok']), 'failed': sum(1 for r in RESULTS if not r['ok']), 'results': RESULTS, 'sources_sha256': srcs,
           'python': sys.version.split()[0]}
    (HERE / 'selftest-results.json').write_text(json.dumps(doc, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'passed': doc['passed'], 'failed': doc['failed'], 'failed_tests': [r['test'] for r in RESULTS if not r['ok']]}, ensure_ascii=False, indent=1))
    return 0 if doc['failed'] == 0 and not doc['sdk_imported'] else 1


if __name__ == '__main__':
    sys.exit(main())
