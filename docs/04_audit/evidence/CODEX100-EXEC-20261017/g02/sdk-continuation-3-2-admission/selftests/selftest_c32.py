"""Offline selftests of DX100-G02:IMPLEMENT-AND-ADMIT-SDK-SOURCE-CONTINUATION-3-2 (no SDK, no Pydantic, no service, no network).

Run: python3 -I -B selftests/selftest_c32.py   -> writes selftests/selftest-results.json (exit 0 only when all pass).

Covers the proofs of freeze-r4-c3-delta.json for the sub-lot C3-2 (D3-01 IDs and slot counts; D3-04 markers, closed fault targets,
hooks by identity and slot probes with own objects; D3-05 wait classes and the thread registry, also through an offline run of the
own-code DIAG-PY-C3VOCAB and of the inherited own-code DIAG rows against a local fake JSON-RPC server; D3-07 CONTROL by copy; D3-08
carry-overs R1-F02, R1-F03 and R1-F04), the clauses of evaluator-r4-c3-delta.json (E3-01 R3-12 over the C3-2 table; E3-07 with the
three known_bad selftests of C3-PY13ER over a relabelled copy of the admitted 2B-PY13E capture of the 2B-2 (read only, bound by sha)
and the C3-PY08 W1-parked selftest; E3-08 TurnResult summary), the carry-over C31-ADM/R1-F01 (OS witness of SIGTERM, negative
selftest) and compile checks.
"""
import copy
import hashlib
import importlib.util
import json
import shutil
import sys
import threading
import time
import traceback
from pathlib import Path

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
UNIT = HERE.parent
G02 = UNIT.parent
PY = UNIT / 'python'
SCRATCH = Path('/mnt/dados/cvg-work/cvg-codex100-c32-runtime-20261019/selftest-scratch')
BASE_13E = G02 / 'sdk-batch-2b2-admission' / 'cases' / '2B-PY13E-48a49c0ee912'
BASE_13E_SHA = {'events-driver.bin': None, 'events-adapter.bin': None, 'events-peer.bin': None}  # recorded at run time (read only)
IDENT_2B2 = G02 / 'sdk-batch-2b2-admission' / 'identity-freeze-r4-2b2.json'
RESULTS = []


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    sys.modules[name] = m
    spec.loader.exec_module(m)
    return m


CH = load('st32_channel', PY / 'channel.py')
OBS = load('st32_observer', PY / 'observer.py')
ACC = load('st32_acceptance', PY / 'acceptance.py')
H = load('harness2b', PY / 'harness2b.py')
OWN = load('own2b', PY / 'own2b.py')
RPC = load('st32_fixture_rpc', PY / 'fixture-rpc.py')
RPC.C = CH
SUP = load('st32_supervisor', PY / 'supervisor.py')
DRV = load('st32_driver', PY / 'python-driver.py')
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
    """Validates every frame with the role-side encoder (caps, kinds, fields) and records it; controls return at once."""

    def __init__(self, role='driver'):
        self.role, self.frames, self.controls = role, [], []
        self.seq = 0
        self.begin = {}
        self.lock = threading.Lock()

    def emit(self, kind, data):
        with self.lock:
            ev = {'v': 1, 'attempt': 'a' * 40, 'case': 'SELFTEST', 'role': self.role, 'seq': self.seq, 'kind': kind, 'pid': 1,
                  'mono_ns': str(time.monotonic_ns()), 'data': data}
            CH.encode_frame(ev)
            self.frames.append(ev)
            self.seq += 1

    def control(self, cmd):
        self.controls.append(cmd)

    def remaining(self):
        return 20.0

    def kinds(self, k):
        return [f['data'] for f in self.frames if f['kind'] == k]

    def ms(self, name):
        return [f['data']['detail'] for f in self.frames if f['kind'] == 'DIAGNOSTIC' and f['data']['milestone'] == name]


# ================================================================================================ D3-01 / tables
def t_ids_counts():
    acc = ['C3-PY02', 'C3-PY18', 'C3-PY13H', 'C3-PY13F', 'C3-PY13ER', 'C3-PY15A', 'C3-PY16S', '2B-PY01A']
    rej = ['C3-PY01', 'C3-PY19', 'C3-PY13X', 'C3-PY15B', 'C3-TS01', 'C32-CTRL01']
    check('D3-01 Python SDK IDs accepted and rejected by channel.py', all(CH.SDK_CASE_RE.match(x) for x in acc) and not any(CH.SDK_CASE_RE.match(x) for x in rej))
    check('D3-01 CONTROL IDs of both sub-lots (channel.py, control-client.py)', 'C32-CTRL01' in CH.CONTROL_CASES
          and "'C32-CTRL01')" in (PY / 'control-client.py').read_text())
    check('D3-01 slot count of C3-2: 14 (13 SDK + C32-CTRL01), C3-PY02 conditional on DIAG-PY-PROCWITNESS', len(DOC['cases']) == 14 and DOC['counts']['slots'] == 14
          and len(SUP.SDK_CASES) == 13 and SUP.CONTROL_CASE == 'C32-CTRL01' and SUP.CONDITIONAL == {'C3-PY02': 'DIAG-PY-PROCWITNESS'}
          and SUP.SDK_CASES == [c['id'] for c in sorted(DOC['cases'], key=lambda c: c['slot']) if c['kind'] == 'SDK'])
    check('D3-01 supervisor and evaluator bind cases-c3-2.json by sha', SUP.CASES_SHA == ACC.CASES_SHA == sha((UNIT / 'inputs/spec-c3/cases-c3-2.json').read_bytes()))
    budget = json.loads((UNIT / 'inputs/spec-c3/execution-budget-c3-2.json').read_text())
    check('budget: the 10 qualification services of execution-budget-c3-2.json are the DIAG rows of the supervisor; PROCWITNESS conditional',
          SUP.ADMISSION_DIAGS == budget['planned']['qualification_services'] and set(SUP.DIAG) == set(SUP.ADMISSION_DIAGS)
          and all(d in SUP.DIAG_ROWS for d in SUP.ADMISSION_DIAGS) and SUP.CONDITIONAL_DIAGS == {'DIAG-PY-PROCWITNESS': ['C3-PY02']}
          and budget['planned']['conditional_slots'] == ['C3-PY02'] and budget['max']['services'] == 12)
    check('D3-06 spec inputs of the freeze equal next-task.json#/spec of the continuation-3 spec', all(SUP.SPEC_SHA[n] == sha((UNIT / 'inputs/spec-c3' / n).read_bytes())
                                                                                                       for n in SUP.SPEC_SHA))
    check('D2B-11 barrier plan covers exactly the barrier steps (C3-PY02, C3-PY13F, C3-PY13ER and the DIAG rows)', SUP.plan_check() == []
          and SUP.BARRIER_PLAN['C3-PY13F'][10]['actions'][1][1] == [('hook', 'h_stop', 'return', 1, {})]
          and SUP.BARRIER_PLAN['C3-PY13F'][16]['actions'][1][1] == [('hook', 'h_cleanup_cb', 'return', 2, {})], SUP.plan_check())


# ================================================================================================ E3-01 / R3-12
def t_r3_12():
    table = DOC['predicate_table']
    unused = [p for c in DOC['cases'] for p in c['predicates'] if p not in table]
    check('E3-01 every predicate of every C3-2 case is in the frozen table', not unused, unused)
    frozen = DOC['predicate_classes']
    capture = sorted(k for k, v in frozen.items() if 'INVALID_CAPTURE' in v)
    check('E3-01 R3-12: CAPTURE_CLASSES and composition of the evaluator equal the frozen ones', sorted(ACC.CAPTURE_CLASSES) == capture
          and ACC.COMPOSITION == DOC['composition'] and all(ACC.class_of(p) == table[p]['class'] for p in table), capture)
    src = (PY / 'acceptance.py').read_text()
    missing = sorted({p for c in DOC['cases'] for p in c['predicates'] if ("'%s'" % p) not in src})
    check('E3-01 every predicate of the C3-2 cases has an implementation in the evaluator (P.add of its id)', not missing, missing)
    bases = {'../sdk-source-batch-2b-spec/cases-2b-2.json': UNIT / 'inputs/spec-2b/cases-2b-2.json',
             '../sdk-source-batch-2b-spec/cases-2b-1.json': UNIT / 'inputs/spec-2b/cases-2b-1.json',
             '../sdk-source-batch-2a-spec/cases-2a.json': G02 / 'sdk-batch-2a-admission/inputs/spec-2a/cases-2a.json'}
    diff, new = [], []
    for pid, v in table.items():
        if v['source'].startswith('NEW'):
            new.append(pid)
            continue
        b = json.loads(bases[v['source'].split('#')[0]].read_bytes())['predicate_table'][pid]
        if b['class'] != v['class'] or b['oracle'] != v['oracle']:
            diff.append(pid)
    check('E3-01 a predicate copied from a base keeps the class and the oracle of the base', not diff and new == ['wait.client_effect_recorded'], {'differ': diff, 'new': new})


# ================================================================================================ D3-04
def t_d3_04():
    class _Rec:
        def __init__(self, **kw):
            self.kw = kw
    fake = type('openai_codex_fake', (), {k[1:]: type(k[1:], (_Rec,), {}) for k in DRV.INPUT_MARKERS})
    fch = FakeCh()
    it = DRV.Interp({'case': 'X', 'case_input': {'diag_calls': []}}, fch, 'diag2b')
    it.mode, it.oc = 'sdk', fake  # value() markers need sdk mode; the classes are own stand-ins (no SDK import)
    built = {k: it.value({k: {'tool_name': 't', 'content': [{'type': 'input_text', 'text': 'x', 'cvgExtra': 1}]}}) for k in DRV.INPUT_MARKERS}
    ok_m = all(type(v).__name__ == k[1:] and v.kw == {'tool_name': 't', 'content': [{'type': 'input_text', 'text': 'x', 'cvgExtra': 1}]} for k, v in built.items())
    it.mode = 'diag2b'
    try:
        it.value({'$TextInput': {'text': 'x'}})
        refused_diag = False
    except CH.ChannelError:
        refused_diag = True
    try:
        it.value({'$AudioInput': {}})
        refused_unknown = False
    except CH.ChannelError:
        refused_unknown = True
    check('D3-04 (a) the six 2A input markers are rebuilt as the public classes with the given fields (sdk mode); in a diagnostic and outside the list they are refused',
          ok_m and refused_diag and refused_unknown and DRV.INPUT_MARKERS == ('$TextInput', '$ImageInput', '$LocalImageInput', '$SkillInput', '$MentionInput', '$ExternalMessage'))
    o3 = OWN.OwnC3Client()
    it.names['o3'] = o3
    it.fault_install({'step': 1, 'api': 'fault.install', 'on': 'o3', 'attr': '_write_message', 'mode': 'raise_before_call',
                      'exception': {'class': 'RuntimeError', 'message': 'w'}})
    try:
        o3.request('own/x')
        raised = False
    except RuntimeError:
        raised = True
    waiters_clean = o3._waiters == {}
    it.faults.remove(o3, 'o3', '_write_message')
    it.fault_install({'step': 2, 'api': 'fault.install', 'on': 'o3', 'attr': 'next_login_notification', 'mode': 'raise_before_call',
                      'exception': {'class': 'RuntimeError', 'message': 'l'}})
    try:
        o3.wait_login('L-own-a')
        raised2 = False
    except RuntimeError:
        raised2 = True
    unregistered = o3._login_notifications == {}
    it.faults.remove(o3, 'o3', 'next_login_notification')
    try:
        it.fault_install({'step': 3, 'api': 'fault.install', 'on': 'o3', 'attr': 'request', 'mode': 'raise_before_call', 'exception': {'class': 'RuntimeError', 'message': 'x'}})
        refused_target = False
    except CH.ChannelError:
        refused_target = True
    check('D3-04 (b) fault.install on the new targets (_write_message, next_login_notification) with own objects: raise before call, waiter discarded, login queue unregistered; a target outside the closed list is refused',
          raised and waiters_clean and raised2 and unregistered and refused_target and o3._written == []
          and ('CodexClient', '_write_message') in DRV.FAULT_TARGETS['sdk'] and ('CodexClient', 'next_login_notification') in DRV.FAULT_TARGETS['sdk']
          and [f['target'] for f in fch.kinds('FAULT')] == ['o3._write_message', 'o3.next_login_notification'])
    code = DRV.resolve_code('own2b.OwnC3Client.next_login_notification')
    check('D3-04 (c) hooks resolve own code objects by identity (resolve_code); the SDK targets are checked by the validator over the pin sources (ast)',
          code is OWN.OwnC3Client.next_login_notification.__code__ and json.loads((UNIT / 'validation-unit.json').read_text())['ok'] is True)
    import dataclasses

    @dataclasses.dataclass(slots=True)
    class TurnResult:
        id: str
        status: str
    r = TurnResult('T', 'completed')
    reader = H.StaticReader({'r': r})
    summ, _ = H.summary_v2(r)
    check('D3-04 (d) / E3-08 slot probes by the static reader and the TurnResult summary {class: TurnResult}', reader.probe(['r', '.id'], 'value') == 'T'
          and reader.probe(['r', '.status'], 'value') == 'completed' and summ == {'class': 'TurnResult'})


# ================================================================================================ D3-05 (driver, own objects)
def t_d3_05_unit():
    fch = FakeCh()
    it = DRV.Interp({'case': 'X', 'case_input': {'diag_calls': []}}, fch, 'diag2b')
    it.hook_install({'step': 1, 'api': 'hook.install', 'hooks': [{'id': 'h', 'code': 'own2b.OwnC3Client.cleanup', 'event': 'call', 'record': ['thread_name']}]})
    try:
        t0 = time.monotonic()
        it.wait_result({'step': 2, 'api': 'probe.until', 'wait_class': 'CLIENT_EFFECT'}, False, t0)
        ce = True
        it.wait_result({'step': 3, 'api': 'thread.join', 'wait_class': 'CLIENT_EFFECT_UNLESS_ALIVE', 'thread_name': 'cvg-st-never'}, False, t0)
        never = True
        ev = threading.Event()
        th = threading.Thread(target=ev.wait, args=(5,), name='cvg-st-alive', daemon=True)
        th.start()
        try:
            it.wait_result({'step': 4, 'api': 'thread.join', 'wait_class': 'CLIENT_EFFECT_UNLESS_ALIVE', 'thread_name': 'cvg-st-alive'}, False, t0)
            alive_inval = False
        except H.CaptureFailure:
            alive_inval = True
        ev.set()
        th.join(2)
        it.wait_result({'step': 5, 'api': 'thread.join', 'wait_class': 'CLIENT_EFFECT_UNLESS_ALIVE', 'thread_name': 'cvg-st-alive'}, False, t0)
        ended = True
        try:
            it.wait_result({'step': 6, 'api': 'hook.wait'}, False, t0)
            harness_inval = False
        except H.CaptureFailure:
            harness_inval = True
    finally:
        it.hooks.stop()
    wr = {x['step']: x for x in fch.ms('WAIT_RESULT')}
    check('D3-05 CLIENT_EFFECT timeout goes on (thread fields null without thread_name)', ce and wr[2]['thread_started'] is None and wr[2]['thread_alive'] is None)
    check('D3-05 CLIENT_EFFECT_UNLESS_ALIVE goes on with the named thread never started and with it already ended; alive at the timeout raises CaptureFailure',
          never and wr[3]['thread_started'] is False and alive_inval and wr[4]['thread_alive'] is True and wr[4]['thread_started'] is True
          and ended and wr[5]['thread_started'] is True and wr[5]['thread_alive'] is False, wr)
    check('D3-05 a wait without wait_class that times out is a harness precondition (CaptureFailure, E2B-14)', harness_inval and wr[6]['class'] == 'HARNESS_PRECONDITION')
    try:
        it.wait_class({'step': 7, 'api': 'probe', 'wait_class': 'CLIENT_EFFECT'})
        bad_api = False
    except CH.ChannelError:
        bad_api = True
    it2 = DRV.Interp({'case': 'X', 'case_input': {'diag_calls': []}}, FakeCh(), 'diag2b')
    try:
        it2.wait_class({'step': 8, 'api': 'thread.join', 'wait_class': 'CLIENT_EFFECT_UNLESS_ALIVE', 'thread_name': 'x'})
        no_registry = False
    except CH.ChannelError:
        no_registry = True
    check('D3-05 wait_class outside the wait steps and CLIENT_EFFECT_UNLESS_ALIVE without the thread registry of hook.install are refused', bad_api and no_registry)


# ================================================================================================ offline own-code flows
def fake_server_script():
    SCRATCH.mkdir(parents=True, exist_ok=True)
    p = SCRATCH / 'fake_server.py'
    p.write_text('''import json, signal, sys, threading, time
cfg = json.loads(sys.argv[1])
lock = threading.Lock()
def out(obj):
    with lock:
        sys.stdout.write(json.dumps(obj) + "\\n"); sys.stdout.flush()
def answer(msg, rule):
    time.sleep(rule.get('delay', 0))
    out({'id': msg['id'], 'result': rule.get('result', {})})
    for n in rule.get('after', []):
        out({'method': n, 'params': {}})
for line in sys.stdin:
    msg = json.loads(line)
    if 'id' not in msg:
        continue
    rule = cfg['rules'].get(msg['method'], {'result': {}})
    if isinstance(rule, list):
        rule = rule.pop(0) if rule else {'result': {}}
    for n in rule.get('before', []):
        out({'method': n, 'params': {}})
    threading.Thread(target=answer, args=(msg, rule), daemon=True).start()
time.sleep(10)
''')
    return p


def run_offline(row, server_cfg):
    script = fake_server_script()
    launch = (sys.executable, '-I', '-B', str(script), json.dumps(server_cfg))
    old = DRV.LAUNCH
    DRV.LAUNCH = launch
    fch = FakeCh()
    cfg = {'case': 'SELFTEST', 'case_input': copy.deepcopy(row)}
    for s in cfg['case_input']['diag_calls']:
        kw = s.get('kwargs') or {}
        if 'cwd' in kw:
            kw['cwd'] = str(SCRATCH)
    try:
        DRV.run_2b(cfg, fch, 'diag2b')
        err = None
    except BaseException as exc:  # noqa: BLE001
        err = '%s: %s\n%s' % (type(exc).__name__, exc, traceback.format_exc()[-800:])
    finally:
        DRV.LAUNCH = old
        threading.setprofile(None)
        sys.setprofile(None)
    return fch, err


def t_offline_c3vocab():
    row = SUP.DIAG_ROWS['DIAG-PY-C3VOCAB']
    fch, err = run_offline(row, {'rules': {'initialize': {}}})
    wr = {x['step']: x for x in fch.ms('WAIT_RESULT')}
    ecf = {x['step']: x for x in fch.ms('EXPECTED_CAPTURE_FAILURE')}
    res = {e['api']: e['result'] for e in fch.kinds('API_RESULT')}
    reg = (fch.ms('THREAD_REGISTRY') or [{}])[0]
    check('OFFLINE DIAG-PY-C3VOCAB: own fault targets, hook by identity, CLIENT_EFFECT and UNLESS_ALIVE waits, expected capture failures, registry',
          err is None and wr.get(18, {}).get('ok') is False and wr.get(19, {}).get('thread_started') is False and ecf.get(21, {}).get('raised') is True
          and ecf.get(22, {}).get('raised') is True and wr.get(24, {}).get('ok') is True and res.get('16:hook.count') == 1
          and reg.get('installed') is True and 'cvg-c3-held' in reg.get('started', []) and 'cvg-c3-never-started' not in reg.get('started', [])
          and [f['target'] for f in fch.kinds('FAULT')] == ['o3._write_message', 'o3.next_login_notification'],
          {'err': err, 'wait_results': wr, 'expected_failures': ecf, 'registry': reg})
    # the same capture through the DIAG checks of the evaluator (frames rebuilt into a RoleLog)
    logs = synth_from_frames(fch.frames)
    w = {'control_actions': [{'detail': {'command': 'RELEASE_EXIT', 'role': 'driver'}}], 'maps': {'ok': True}, 'frame_gidx': {'driver': list(range(len(fch.frames)))},
         'actions': [], 'plan': {}}
    c = ACC.diag_checks('DIAG-PY-C3VOCAB', logs, 'PASS', w, row, logs['driver'].case_input_sha256)
    keys = ['fault_write_message_target', 'fault_next_login_notification_target', 'hook_by_identity_next_login_notification',
            'fault_zero_calls_with_thread_never_started_is_sane', 'client_effect_timeout_goes_on', 'unless_alive_never_started_goes_on',
            'unless_alive_with_thread_alive_invalidates', 'wait_without_class_invalidates', 'unless_alive_ended_ok', 'thread_registry',
            'wait_client_effect_recorded_rule']
    check('DIAG-PY-C3VOCAB checks of the evaluator pass on the offline capture', all(c.get(k) is True for k in keys), {k: c.get(k) for k in keys})


def t_offline_inherited():
    rows = SUP.DIAG_ROWS
    fch, err = run_offline(rows['DIAG-PY-BARRIER'], {'rules': {'initialize': {}, 'own/held': {'result': {'held': True}, 'delay': 0.2}}})
    res = {e['api']: e['result'] for e in fch.kinds('API_RESULT')}
    check('OFFLINE DIAG-PY-BARRIER flow (requalification with the C3-2 driver)', err is None and fch.ms('CALLS_DONE')
          and res.get('21:excepthook.snapshot') == [{'thread_name': 'cvg-own-raiser', 'class': 'builtins.RuntimeError', 'str': 'own raise t'}], {'err': err})
    fch, err = run_offline(rows['DIAG-PY-ASYNC'], {'rules': {'initialize': {'delay': 0.3}, 'own/a': {'result': {'a': 1}},
                                                             'own/slow': {'result': {'slow': True}, 'delay': 0.4}, 'own/start': {'result': {'started': 'L'}, 'delay': 0.3}}})
    canc = [e['message'] for e in fch.kinds('API_CANCELLED')]
    check('OFFLINE DIAG-PY-ASYNC flow', err is None and fch.ms('CALLS_DONE') and canc == ['12:task.await', '17:task.await'], {'err': err, 'cancelled': canc})
    fch, err = run_offline(rows['DIAG-PY-BEFOREREPLY'], {'rules': {'initialize': {}, 'own/early': {'before': ['own/n1', 'own/n2'], 'result': {'early': True}},
                                                                   'own/heldearly': {'before': ['own/n3'], 'result': {'held': True}, 'delay': 0.2}}})
    pr = {e['id']: e['value'] for e in fch.kinds('PROBE')}
    check('OFFLINE DIAG-PY-BEFOREREPLY flow', err is None and pr.get('reader_order') == [['r', 'initialize'], ['n', 'own/n1'], ['n', 'own/n2'],
                                                                                        ['r', 'own/early'], ['n', 'own/n3'], ['r', 'own/heldearly']], {'err': err})
    fch, err = run_offline(rows['DIAG-PY-FAULTCUT'], {'rules': {'initialize': {}}})
    faults = fch.kinds('FAULT')
    check('OFFLINE DIAG-PY-FAULTCUT flow (thread.join without registry keeps the 2B-2 meaning)', err is None and faults == [
        {'target': 'of.work', 'call': '1', 'count': 1}, {'target': 'of.work', 'call': '1', 'count': 1},
        {'target': 'gs.next_notification', 'call': '2', 'count': 1}, {'target': 'of.cleanup', 'call': '1', 'count': 1}], {'err': err, 'faults': faults})
    fch, err = run_offline(rows['DIAG-PY-LOGIN'], {'rules': {'initialize': {}, 'account/login/start': [
        {'before': ['account/login/completed'], 'result': {'type': 'chatgpt'}}, {'result': {'type': 'chatgptDeviceCode'}, 'after': ['account/login/completed']}],
        'account/login/cancel': {'result': {'status': 'canceled'}, 'after': ['account/login/completed']}}})
    check('OFFLINE DIAG-PY-LOGIN flow', err is None and bool(fch.ms('CALLS_DONE')), {'err': err})


# ================================================================================================ synthetic captures
def tlog(role, events, case_sha='0' * 64):
    lg = OBS.RoleLog(role, {'attempt': 'a' * 40, 'case': 'X', 'nonce': 'n' * 40, 'source_sha256': '0' * 64})
    lg.events = [{'kind': e['kind'], 'data': e['data'], 'seq': i, 'mono_ns': str(1000 + i)} for i, e in enumerate(events)]
    lg.recv_ns = [1000 + i for i in range(len(events))]
    lg.case_input_sha256 = case_sha
    return lg


def synth_from_frames(frames):
    logs = {'driver': tlog('driver', frames), 'adapter': tlog('adapter', []), 'peer': tlog('peer', [])}
    logs['adapter'].case_input_sha256 = None
    logs['peer'].case_input_sha256 = None
    return logs


def relabel_13e(edit=None):
    """The admitted 2B-PY13E capture of the 2B-2 (read only) relabelled as C3-PY13ER: same flow; the C3-2 driver frames WAIT_RESULT
    (steps 11-13) and THREAD_REGISTRY are added as the C3-2 driver emits them; edit(events) applies a perturbation."""
    cfg, _result, logs, verdict, reasons, w = ACC.rebuild(BASE_13E)
    c = CASES['C3-PY13ER']
    d = logs['driver']
    rows = list(zip(d.events, d.recv_ns, w['frame_gidx']['driver']))
    out = []
    for e, rn, g in rows:
        out.append([e, rn, g])
        if e['kind'] == 'DIAGNOSTIC' and e['data']['milestone'] in ('HOOK_WAIT', 'THREAD_JOIN', 'EXCEPTHOOK_WAIT'):
            st = e['data']['detail']['step']
            out.append([{'kind': 'DIAGNOSTIC', 'data': {'milestone': 'WAIT_RESULT', 'detail': {
                'step': st, 'api': {11: 'hook.wait', 12: 'thread.join', 13: 'excepthook.wait'}[st], 'ok': True, 'class': 'CLIENT_EFFECT_UNLESS_ALIVE',
                'elapsed_ms': 1.0, 'thread_name': 'codex-goal-start-cleanup', 'thread_started': True, 'thread_alive': False}}}, rn, g + 0.5])
        if e['kind'] == 'DIAGNOSTIC' and e['data']['milestone'] == 'SCOPES_AT_CALLS_DONE':
            out.append([{'kind': 'DIAGNOSTIC', 'data': {'milestone': 'THREAD_REGISTRY', 'detail': {
                'installed': True, 'started': ['MainThread', 'asyncio_0', 'codex-goal-start', 'codex-goal-start-cleanup']}}}, rn, g + 0.5])
    if edit is not None:
        out = edit(out)
    d.events = [dict(e, seq=i) for i, (e, _rn, _g) in enumerate(out)]
    d.recv_ns = [rn for _e, rn, _g in out]
    w['frame_gidx']['driver'] = [g for _e, _rn, g in out]
    for r in ('driver', 'adapter', 'peer'):
        logs[r].case_input_sha256 = c['case_input_sha256']
    w['case_input_sha256_supervisor'] = c['case_input_sha256']
    w['case_input_sha256_recomputed'] = c['case_input_sha256']
    return logs, verdict, reasons, w


def truncate_wire(logs, stdin_lines, stdout_lines):
    """Keep only the first stdin_lines client lines and stdout_lines server lines (the cleanup requests and their replies are the last)."""
    a = logs['adapter']
    for stream, n in (('stdin', stdin_lines), ('stdout', stdout_lines)):
        raw = a.committed_bytes(stream)
        parts = raw.split(b'\n')
        keep = b'\n'.join(parts[:n]) + b'\n'
        a.data[stream] = bytearray(keep)
        a.committed[stream] = len(keep)
        if stream in a.stream_end:
            a.stream_end[stream] = dict(a.stream_end[stream], committed_bytes=len(keep), read_bytes=len(keep))


def evaluate_13er(edit=None, wire=None):
    old = ACC.IDENTITY_FREEZE
    ACC.IDENTITY_FREEZE = IDENT_2B2  # before the C3-2 freeze: the same sdk-python tree bound by the 2B-2 identity freeze
    try:
        logs, verdict, reasons, w = relabel_13e(edit)
        if wire is not None:
            truncate_wire(logs, *wire)
        return ACC.evaluate('C3-PY13ER', logs, verdict, reasons, w)
    finally:
        ACC.IDENTITY_FREEZE = old


def t_e3_07():
    for f in BASE_13E_SHA:
        BASE_13E_SHA[f] = sha((BASE_13E / f).read_bytes())
    base = evaluate_13er()
    check('E3-07 positive: the admitted 2B-PY13E flow relabelled as C3-PY13ER (with WAIT_RESULT and THREAD_REGISTRY) is PASS_CLIENT_OBSERVATION',
          base['outcome'] == 'PASS_CLIENT_OBSERVATION' and base['composition_rule'] == 7, {'outcome': base['outcome'], 'failed': base['failed_predicates'],
                                                                                         'error': base['implicit_predicates']['evaluation_completed']['error'],
                                                                                         'base_sha256': BASE_13E_SHA})

    def skip_cleanup(rows):
        out = []
        for e, rn, g in rows:
            k, dt = e['kind'], e['data']
            if k in ('FAULT', 'EXCEPTHOOK_RECORD') or (k == 'HOOK_EVENT' and dt['id'] == 'h_stop'):
                continue
            if k == 'PROBE' and dt['id'] == 'routes':
                e = dict(e, data=dict(dt, value=['t13e']))
            if k == 'API_RESULT' and dt['api'] == '15:excepthook.snapshot':
                e = dict(e, data=dict(dt, result=[]))
            if k == 'DIAGNOSTIC' and dt['milestone'] == 'FAULT_SCOPE' and dt['detail'].get('state') == 'removed':
                e = dict(e, data=dict(dt, detail=dict(dt['detail'], calls=0, count=0)))
            if k == 'DIAGNOSTIC' and dt['milestone'] == 'WAIT_RESULT':
                e = dict(e, data=dict(dt, detail=dict(dt['detail'], ok=False, thread_started=False, thread_alive=False)))
            if k == 'DIAGNOSTIC' and dt['milestone'] == 'THREAD_REGISTRY':
                e = dict(e, data=dict(dt, detail=dict(dt['detail'], started=['MainThread', 'asyncio_0', 'codex-goal-start'])))
            out.append([e, rn, g])
        return out
    a = evaluate_13er(skip_cleanup, wire=(5, 5))
    want_failed = ['api.steps_exact', 'wire.requests_exact', 'probe.values_exact', 'hook.events_exact', 'excepthook.records_exact']
    check('E3-07 (a) cleanup skipped (thread never started, target never called): the waits go on, zero calls is no sanity failure, MISMATCH by rule 6 with the five client predicates failing',
          a['outcome'] == 'MISMATCH' and a['composition_rule'] == 6 and sorted(a['failed_predicates']) == sorted(want_failed),
          {'outcome': a['outcome'], 'rule': a['composition_rule'], 'failed': a['failed_predicates'], 'reasons': a['capture_reasons'][:3]})

    def twice(rows):
        out = []
        for e, rn, g in rows:
            out.append([e, rn, g])
            if e['kind'] == 'FAULT':
                out.append([dict(e, data=dict(e['data'], call='2', count=2)), rn, g + 0.25])
        return out
    b = evaluate_13er(twice)
    check('E3-07 (b) fault target called twice: INVALID_CAPTURE by rule 4 (fault.fired_as_declared)', b['outcome'] == 'INVALID_CAPTURE' and b['composition_rule'] == 4
          and 'fault.fired_as_declared' in b['failed_predicates'], {'outcome': b['outcome'], 'failed': b['failed_predicates']})

    def alive12(rows):
        out = []
        for e, rn, g in rows:
            dt = e['data']
            if e['kind'] == 'DIAGNOSTIC' and dt['milestone'] == 'WAIT_RESULT' and dt['detail']['step'] == 12:
                e = dict(e, data=dict(dt, detail=dict(dt['detail'], ok=False, thread_started=True, thread_alive=True)))
            out.append([e, rn, g])
        return out
    cc = evaluate_13er(alive12)
    check('E3-07 (c) cleanup thread alive at the timeout of step 12: INVALID_CAPTURE (rule 4 in the evaluator; the real driver ends INVALID, rule 1, R2-F03 (2))',
          cc['outcome'] == 'INVALID_CAPTURE' and 'wait.client_effect_recorded' in cc['failed_predicates'], {'outcome': cc['outcome'], 'failed': cc['failed_predicates']})
    # C3-PY08: W1 parked at CALLS_DONE (goal outside fail_all) -> MISMATCH by consumer.results_exact; the CLIENT_EFFECT wait is recorded
    c8 = CASES['C3-PY08']
    ev = [{'kind': 'WORKER_RESULT', 'data': {'name': 'W2', 'kind': 'error', 'value': {'class': 'openai_codex.errors.TransportClosedError',
                                                                                       'str': 'Codex process closed stdout.', 'identity': 7}}},
          {'kind': 'DIAGNOSTIC', 'data': {'milestone': 'WAIT_RESULT', 'detail': {'step': 9, 'api': 'worker.join', 'ok': False, 'class': 'CLIENT_EFFECT', 'elapsed_ms': 3000.0,
                                                                                 'thread_name': None, 'thread_started': None, 'thread_alive': None}}},
          {'kind': 'WORKER_PARKED', 'data': {'name': 'W1', 'parked': True, 'witness': {'at_calls_done': True}}},
          {'kind': 'DIAGNOSTIC', 'data': {'milestone': 'CALLS_DONE', 'detail': {}}}]
    d = tlog('driver', ev)
    ok_c, det_c = ACC.consumer_results(d, c8['expected']['workers'])
    ok_w, det_w = ACC.wait_client_effect_recorded(c8, d)
    items = [{'id': p, 'ok': {'consumer.results_exact': ok_c, 'wait.client_effect_recorded': ok_w}.get(p, True), 'class': ACC.class_of(p)} for p in c8['predicates']]
    check('E3-07 C3-PY08 with W1 parked: the CLIENT_EFFECT wait is recorded (sanity passes) and consumer.results_exact gives MISMATCH by rule 6',
          not ok_c and ok_w and ACC.compose(c8, 'PASS', items, True, False) == ('MISMATCH', 6), {'consumer': det_c, 'wait': det_w})
    d2 = tlog('driver', [x for x in ev if not (x['kind'] == 'DIAGNOSTIC' and x['data']['milestone'] == 'WAIT_RESULT')])
    check('E3-07 a client-effect wait without its WAIT_RESULT fails wait.client_effect_recorded (INVALID_CAPTURE)', not ACC.wait_client_effect_recorded(c8, d2)[0])


# ================================================================================================ D3-07 / D3-08 / C31 R1-F01
def t_d3_07():
    c = CASES['C32-CTRL01']
    b = BASE2B2['2B2-CTRL01']
    ci, bi = copy.deepcopy(c['case_input']), copy.deepcopy(b['case_input'])
    last = (ci['control_client']['argv'].pop(), bi['control_client']['argv'].pop())
    contract = json.loads((UNIT / 'inputs/spec-c3/control-slot-contract-c3.json').read_text())
    slot = [s for s in contract['slots'] if s['case'] == 'C32-CTRL01'][0]
    check('D3-07 C32-CTRL01 case_input equals 2B2-CTRL01 except the last argv element; frozen sha; unchanged fields equal',
          ci == bi and last == ('C32-CTRL01', '2B2-CTRL01') and sha(compact(c['case_input']).encode()) == slot['case_input_sha256'] == c['case_input_sha256']
          and all(c[f] == b[f] for f in slot['copy_of']['unchanged_fields']) and RPC.login_problems(c['case_input']['peer_script']) == [])


def plogs():
    return {r: OBS.RoleLog(r, {'attempt': 'a' * 40, 'case': 'C32-CTRL01', 'nonce': 'n' * 40, 'source_sha256': '0' * 64}) for r in ('driver', 'adapter', 'peer')}


def t_d3_08():
    for target in ('expand_parts', 'Seq', 'capture_extra'):
        orig = getattr(ACC, target)

        def boom(*_a, _t=target, **_k):
            raise RuntimeError('selftest %s failure' % _t)
        setattr(ACC, target, boom)
        try:
            acc = ACC.evaluate('C32-CTRL01', plogs(), 'PASS', [], {'maps': {'ok': True}})
        finally:
            setattr(ACC, target, orig)
        check('D3-08 R1-F02: %s raising inside evaluate -> INVALID_CAPTURE by rule 3' % target, acc['outcome'] == 'INVALID_CAPTURE' and acc['composition_rule'] == 3)
    root = SCRATCH / 'r1f03'
    jp = lambda x: json.loads(json.dumps(x))
    res = {}
    for case, tamper in (('C3-PY13ER', None), ('C3-PY13ER', 'drop'), ('C32-CTRL01', None), ('C32-CTRL01', 'extra')):
        plan = jp(SUP.case_plan(case))
        folder = copy.deepcopy(plan)
        if tamper == 'drop':
            folder['barrier_plan'].pop('9')
        if tamper == 'extra':
            folder['barrier_plan'] = {'3': {'gate': [], 'actions': []}}
        if root.exists():
            shutil.rmtree(root)
        (root / 'case' / 'profile').mkdir(parents=True)
        pp = root / 'case-plan.json'
        pp.write_text(json.dumps({'cases': {case: folder if tamper is None else plan}}) + '\n')
        fz = root / 'source-freeze.json'
        fz.write_text(json.dumps({'files': {'case-plan.json': {'sha256': sha(pp.read_bytes())}}}))
        (root / 'case' / 'profile-manifest.json').write_text(json.dumps({'case_plan': folder, 'case_plan_file': {'sha256': sha(pp.read_bytes())}}))
        (root / 'case' / 'profile' / 'adapter-config.json').write_text(json.dumps({'case_input': SUP.delivered_input(case)}))
        res['%s/%s' % (case, tamper)] = ACC.plan_binding(root / 'case', case, pp, fz)[0]
    shutil.rmtree(root)
    check('D3-08 R1-F03: plan binding positive and negative (missing barrier step, extra barrier entry)', res == {'C3-PY13ER/None': True, 'C3-PY13ER/drop': False,
                                                                                                             'C32-CTRL01/None': True, 'C32-CTRL01/extra': False}, res)

    class FakeSeq:
        tokens = {}

        def gidx(self, role, i):
            return {'driver': 100, 'adapter': 200, 'peer': 300}[role] + i
    c = {'expected': {'process': {'no_termination_before': 'CALLS_DONE'}}, 'predicates': [], 'case_input': {'sdk_calls': []}}
    out = {}
    for name, zt, want in (('zombie after CALLS_DONE', 9000, True), ('zombie before CALLS_DONE', 4000, False)):
        logs = plogs()
        logs['driver'].events = [{'kind': 'DIAGNOSTIC', 'data': {'milestone': 'CALLS_DONE', 'detail': {}}, 'seq': 0, 'mono_ns': '1'}]
        logs['driver'].recv_ns = [5000]
        ok, _ = ACC.termination_exact(c, logs, {'termination': {'adapter': {'zombie_exit_code': 0, 'zombie_t_ns': zt, 'absent': False}}}, FakeSeq())
        out[name] = [ok, want]
    check('D3-08 R1-F04: zombie_t_ns in no_termination_before (positive and negative)', all(a == b for a, b in out.values()), out)


def t_c31_r1_f01():
    def form(term):
        logs = plogs()
        a = logs['adapter']
        a.events = [{'kind': 'SIGNAL', 'data': {'signal': 'SIGTERM', 'inflight': False}, 'seq': 0, 'mono_ns': '1'},
                    {'kind': 'END', 'data': {'streams': {}, 'child_exit_code': None, 'child_signal': None, 'complete': False}, 'seq': 1, 'mono_ns': '2'}]
        a.signal, a.terminal = 'SIGTERM', 'END'
        logs['peer'].signal = 'SIGTERM'
        return ACC.termination_form(logs, {'termination': {'adapter': term}})[0]
    got = {'zombie15': form({'zombie_exit_code': 15, 'absent': True}), 'absent_only': form({'zombie_exit_code': None, 'absent': True}),
           'zombie9_then_absent': form({'zombie_exit_code': 9, 'absent': True}), 'nothing': form({'zombie_exit_code': None, 'absent': False})}
    check('C31-ADM/R1-F01: OS witness of SIGTERM = zombie 15, or absent with no zombie observed; zombie 9 then absent is refused (negative selftest)',
          got == {'zombie15': 'CLIENT_TERMINATED_SIGTERM', 'absent_only': 'CLIENT_TERMINATED_SIGTERM', 'zombie9_then_absent': None, 'nothing': None}, got)


def t_compile():
    bad = []
    for p in sorted(list(PY.glob('*.py')) + list((UNIT / 'tools').glob('*.py')) + [Path(__file__)]):
        try:
            compile(p.read_text(), str(p), 'exec')
        except SyntaxError as exc:
            bad.append([str(p.relative_to(UNIT)), str(exc)])
    check('compile of every Python source of the unit (no bytecode written)', not bad, bad)
    for f in ('fixture-rpc.py', 'adapter-python.py', 'adapter-python-exec', 'observer.py', 'ownmodels.py', 'bootstrap.py'):
        check('python/%s byte-equal to the admitted 2B-2 source' % f, (PY / f).read_bytes() == (G02 / 'sdk-batch-2b2-admission/python' / f).read_bytes())


def main():
    SCRATCH.mkdir(parents=True, exist_ok=True)
    for t in (t_ids_counts, t_r3_12, t_d3_04, t_d3_05_unit, t_offline_c3vocab, t_offline_inherited, t_e3_07, t_d3_07, t_d3_08, t_c31_r1_f01, t_compile):
        try:
            t()
        except Exception as exc:  # noqa: BLE001
            check(t.__name__ + ' raised', False, '%s: %s\n%s' % (type(exc).__name__, exc, traceback.format_exc()[-1500:]))
        finally:
            threading.setprofile(None)
            sys.setprofile(None)
    srcs = {p.relative_to(UNIT).as_posix(): sha(p.read_bytes()) for p in sorted(list(PY.iterdir()) + [Path(__file__)])}
    doc = {'kind': 'C32_OFFLINE_SELFTESTS', 'task': 'DX100-G02:IMPLEMENT-AND-ADMIT-SDK-SOURCE-CONTINUATION-3-2', 'evaluator_version': ACC.VERSION,
           'sdk_imported': 'openai_codex' in sys.modules, 'services': 0, 'network': False, 'passed': sum(1 for r in RESULTS if r['ok']),
           'failed': sum(1 for r in RESULTS if not r['ok']), 'results': RESULTS, 'sources_sha256': srcs, 'base_2b_py13e_sha256': BASE_13E_SHA,
           'python': sys.version.split()[0]}
    (HERE / 'selftest-results.json').write_text(json.dumps(doc, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'passed': doc['passed'], 'failed': doc['failed'], 'failed_tests': [r['test'] for r in RESULTS if not r['ok']]}, ensure_ascii=False, indent=1))
    return 0 if doc['failed'] == 0 and not doc['sdk_imported'] else 1


if __name__ == '__main__':
    sys.exit(main())
