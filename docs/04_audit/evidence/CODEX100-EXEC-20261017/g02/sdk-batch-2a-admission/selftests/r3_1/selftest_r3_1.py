"""Offline selftests of evaluator r3.1 (grouped repair 1 after review R1). No SDK, no service, no network.
Run: python3 -I selftests/r3_1/selftest_r3_1.py   -> writes selftests/r3_1/selftest-results.json

Reruns every r3 selftest (selftests/selftest_r3.py, imported, its own results file untouched) against acceptance r3.1
and adds: R1-F03 strict JSON equality (0 != false, 1 != true, null only null) on the 2A-TS14 known-bad "overwrite a present
cache_write" and on the 2A-TS11 usage; R1-F02 abort.os_witness_recorded (ABORT_ERR without a witnessed process fails,
spawn-failure evidence or a mapped adapter with PID and termination passes); R1-F07 reevaluate negative paths on a
scratch copy of a real case directory (perturbed detail -> exit 1, foreign evaluator_version -> exit 1 with message,
unperturbed -> exit 0).
"""
import importlib.util
import json
import shutil
import subprocess
import sys
from pathlib import Path

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
U = HERE.parent.parent
SCRATCH = Path('/mnt/dados/cvg-work/cvg-codex100-batch2a-runtime-20261019/selftest-scratch/r3_1')


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


R3 = load('st_r3', U / 'selftests' / 'selftest_r3.py')
ACC = R3.ACC
OBS = R3.OBS
RESULTS = []


def check(test, ok, detail=None):
    RESULTS.append({'test': test, 'ok': bool(ok), 'detail': detail})


def driver_log(case, events):
    log = OBS.RoleLog('driver', {'attempt': 'x', 'case': case, 'nonce': 'n', 'source_sha256': '0' * 64})
    log.events = [dict(e, seq=i, mono_ns=str(1000 + i)) for i, e in enumerate(events)]
    log.recv_ns = [1000 + i for i in range(len(events))]
    return log


def logs_with(case, events):
    out = R3.empty_logs(case)
    out['driver'] = driver_log(case, events)
    return out


def predicate(case, logs, pid, witness=None, form='PASS'):
    P = ACC.Preds(case)
    ACC.ts_case(P, ACC.CASES_DEF[case], logs, witness or {'role_mapped': [], 'step_witness': [], 'os_checks': {}}, form)
    return P.got[pid]


def t_jeq():
    cases = [(0, False, False), (1, True, False), (False, False, True), (0, 0.0, True), (None, 0, False), (None, None, True),
             ({'a': [0]}, {'a': [False]}, False), ([1, 'two', [True]], [1, 'two', [True]], True), ({'k': 1}, {'k': 1, 'x': None}, False),
             ('1', 1, False), ([], {}, False)]
    bad = [[repr(a), repr(b)] for a, b, want in cases if ACC.jeq(a, b) is not want]
    check('R1-F03 jeq strict by type (bool vs number, null, nesting, keys)', not bad, {'differences': bad, 'cases': len(cases)})


def ts14_events(fifth):
    snaps = [({'type': 'thread.started', 'thread_id': 'first'}, 'first'), ({'type': 'thread.started', 'thread_id': 'second'}, 'second'),
             ({'type': 'turn.completed', 'usage': {'input_tokens': 1, 'cached_input_tokens': 0, 'output_tokens': 1, 'cache_write_input_tokens': 5}}, 'second'),
             ({'type': 'turn.completed', 'usage': {'input_tokens': 2, 'cached_input_tokens': 0, 'output_tokens': 2, 'cache_write_input_tokens': 0}}, 'second'),
             ({'type': 'turn.completed', 'usage': {'input_tokens': 3, 'cached_input_tokens': 0, 'output_tokens': 3, 'cache_write_input_tokens': fifth}}, 'second'),
             ({'type': 'turn.failed', 'error': {'message': 'streamed failure'}}, 'second')]
    ev = [{'kind': 'API_RESULT', 'data': {'api': '3:yield', 'result': r, 'observations': {'thread_id': t, 'index': i}}} for i, (r, t) in enumerate(snaps)]
    ev.append({'kind': 'API_ERROR', 'data': {'api': '3:Thread.runStreamed', 'name': 'TypeError',
                                             'message': "Cannot read properties of undefined (reading 'cache_write_input_tokens')", 'cause': None}})
    return ev


def t_ts14_known_bad():
    ok_false, _ = predicate('2A-TS14', logs_with('2A-TS14', ts14_events(False)), 'api.yield_snapshots_exact')
    ok_zero, _ = predicate('2A-TS14', logs_with('2A-TS14', ts14_events(0)), 'api.yield_snapshots_exact')
    check('R1-F03 2A-TS14: false kept -> api.yield_snapshots_exact passes', ok_false is True)
    check('R1-F03 2A-TS14 known-bad (false overwritten by 0) -> api.yield_snapshots_exact fails', ok_zero is False)


def t_ts11_usage():
    exp = ACC.CASES_DEF['2A-TS11']['expected']['result']
    good = json.loads(json.dumps(exp))
    bad = json.loads(json.dumps(exp))
    bad['usage']['cache_write_input_tokens'] = False
    for name, value, want in (('0 kept', good, True), ('0 replaced by false', bad, False)):
        ev = [{'kind': 'API_RESULT', 'data': {'api': '3:Thread.run', 'result': value, 'observations': {'thread_id': 'crlf'}}}]
        ok, _ = predicate('2A-TS11', logs_with('2A-TS11', ev), 'api.run_result_exact')
        check('R1-F03 2A-TS11 usage %s -> api.run_result_exact %s' % (name, want), ok is want)


def t_ts12_witness():
    def ev(code, syscall):
        return [{'kind': 'API_RESULT', 'data': {'api': '3:new AbortController', 'result': {'aborted': True}, 'observations': {}}},
                {'kind': 'API_ERROR', 'data': {'api': '4:Thread.runStreamed', 'name': 'AbortError', 'message': 'The operation was aborted', 'cause': None}},
                {'kind': 'DIAGNOSTIC', 'data': {'milestone': 'ERROR_DETAIL', 'detail': {'step': 4, 'api': '4:Thread.runStreamed', 'code': code,
                                                                                       'syscall': syscall, 'ctor': 'AbortError'}}}]
    w0 = {'role_mapped': ['driver'], 'step_witness': [], 'os_checks': {'x': True}, 'adapter_pid': None}
    ok, det = predicate('2A-TS12', logs_with('2A-TS12', ev('ABORT_ERR', None)), 'abort.os_witness_recorded', w0, 'NO_CHILD')
    check('R1-F02 2A-TS12 ABORT_ERR with no witnessed process -> abort.os_witness_recorded fails', ok is False, det)
    ok, _ = predicate('2A-TS12', logs_with('2A-TS12', ev('ENOENT', 'spawn /profile/x')), 'abort.os_witness_recorded', w0, 'NO_CHILD')
    check('R1-F02 2A-TS12 positive spawn-failure evidence -> abort.os_witness_recorded passes', ok is True)
    logs = logs_with('2A-TS12', ev('ABORT_ERR', None))
    logs['adapter'].signal = 'SIGTERM'
    w1 = dict(w0, role_mapped=['adapter', 'driver'], adapter_pid=4242)
    ok, _ = predicate('2A-TS12', logs, 'abort.os_witness_recorded', w1, 'KNOWN_SIGNAL_TERMINATION')
    check('R1-F02 2A-TS12 mapped adapter with PID and SIGTERM -> abort.os_witness_recorded passes', ok is True)


def run(args):
    r = subprocess.run([sys.executable, '-I', str(U / 'python' / 'acceptance.py')] + args, capture_output=True, text=True, timeout=120)
    return r.returncode, (r.stderr or '').strip()[-240:]


def t_reevaluate_paths():
    ledger = json.loads((U / 'case-ledger.json').read_text())
    src = U / 'cases' / ('2A-TS02-%s' % ledger['slots']['2A-TS02']['attempt'][:12])
    if SCRATCH.exists():
        shutil.rmtree(SCRATCH)
    SCRATCH.mkdir(parents=True)
    copy = SCRATCH / src.name
    shutil.copytree(src, copy)
    for extra in copy.glob(ACC.R31_DOC):
        extra.unlink()
    rc, _ = run(['reevaluate', str(copy)])
    check('R1-F07 reevaluate on an unperturbed copy -> exit 0', rc == 0, {'returncode': rc})
    doc = json.loads((copy / 'acceptance.json').read_text())
    original = json.dumps(doc)
    doc['predicates'][0]['detail'] = {'perturbed': True}
    (copy / 'acceptance.json').write_text(json.dumps(doc))
    rc, _ = run(['reevaluate', str(copy)])
    check('R1-F07 reevaluate with a perturbed predicate detail -> exit 1', rc == 1, {'returncode': rc})
    doc = json.loads(original)
    doc['evaluator_version'] = 'acceptance-r2'
    (copy / 'acceptance.json').write_text(json.dumps(doc))
    rc, err = run(['reevaluate', str(copy)])
    check('R1-F07 reevaluate with a foreign service evaluator_version -> exit 1 with message', rc == 1 and 'evaluator_version' in err, {'returncode': rc, 'stderr': err})
    (copy / 'acceptance.json').write_text(original)
    (copy / ACC.R31_DOC).write_text(json.dumps(dict(json.loads(original), evaluator_version='acceptance-r9')))
    rc, err = run(['reevaluate', str(copy)])
    check('R1-F07 reevaluate with a foreign acceptance-r3_1.json version -> exit 1 with message', rc == 1 and 'evaluator_version' in err, {'returncode': rc, 'stderr': err})
    shutil.rmtree(SCRATCH)


def main():
    for t in (R3.t_class_map, R3.t_composition, R3.t_r3f02_and_robustness, R3.t_reevaluate_no_doc, R3.t_peer_v2, R3.t_node):
        try:
            t()
        except Exception as exc:  # noqa: BLE001
            R3.check(t.__name__ + ' raised', False, '%s: %s' % (type(exc).__name__, exc))
    for t in (t_jeq, t_ts14_known_bad, t_ts11_usage, t_ts12_witness, t_reevaluate_paths):
        try:
            t()
        except Exception as exc:  # noqa: BLE001
            check(t.__name__ + ' raised', False, '%s: %s' % (type(exc).__name__, exc))
    allr = [dict(r, origin='r3') for r in R3.RESULTS] + [dict(r, origin='r3.1') for r in RESULTS]
    import hashlib
    srcs = {p: hashlib.sha256((U / p).read_bytes()).hexdigest() for p in ('python/acceptance.py', 'python/observer.py', 'python/fixture-rpc.py',
                                                                         'selftests/selftest_r3.py', 'selftests/r3_1/selftest_r3_1.py')}
    doc = {'kind': 'BATCH_2A_OFFLINE_SELFTESTS_R3_1', 'evaluator_version': ACC.VERSION, 'sdk_imported': False, 'services': 0, 'network': False,
           'passed': sum(1 for r in allr if r['ok']), 'failed': sum(1 for r in allr if not r['ok']), 'results': allr, 'sources_sha256': srcs,
           'python': sys.version.split()[0]}
    (HERE / 'selftest-results.json').write_text(json.dumps(doc, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'passed': doc['passed'], 'failed': doc['failed'], 'failed_tests': [r['test'] for r in allr if not r['ok']]}, ensure_ascii=False, indent=1))
    return 0 if doc['failed'] == 0 else 1


if __name__ == '__main__':
    sys.exit(main())
