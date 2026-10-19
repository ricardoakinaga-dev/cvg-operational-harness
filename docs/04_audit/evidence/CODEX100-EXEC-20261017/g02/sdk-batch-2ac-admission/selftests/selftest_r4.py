"""Offline selftests of the freeze r4 (no SDK, no service, no network). Run: python3 -I -B selftests/selftest_r4.py

Covers: evaluator r4 (R4-09 class map against cases-2a-cont.json; composition and its invariant; jeq; R4-03 frameless forms,
including the negative "exec that opens the file and fails"; R3-F02 for PREFRAME; R4-02 case_input witnesses; R4-10 step 5 of
2A-TS12R; R4-07 api.stdin_error_uncaught; R4-08 api.toml_errors_exact; F4-05 peer v2 replay), the peer v2 strict match (F4-03)
and exit order (F4-04), F4-01 delivery of the frozen bytes (and rejection of a sorted delivery), F4-02 wire check, F4-06
exec witness (window discipline and a real exec that opens and fails), F4-08 driver markers and F4-10 IDs through the pinned
host Node, node --check of the node sources and reevaluate without a service document. Writes selftests/selftest-results.json.
"""
import hashlib
import importlib.util
import itertools
import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

sys.dont_write_bytecode = True
U = Path(__file__).resolve().parent.parent
PY = U / 'python'
NODE = '/home/ricardo/.nvm/versions/node/v24.20.0/bin/node'
NODE_SHA = '89af8424dd53e560b1933f87ba650d8bf57c83ca5a04600eefb31f416aabbae7'
SCRATCH = Path('/mnt/dados/cvg-work/cvg-codex100-batch2ac-runtime-20261019/selftest-scratch')
RESULTS = []


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


ACC = load('st4_acceptance', PY / 'acceptance.py')
OBS = load('st4_observer', PY / 'observer.py')
CH = load('st4_channel', PY / 'channel.py')
RPC = load('st4_fixture_rpc', PY / 'fixture-rpc.py')
RPC.C = CH
SUP = load('st4_supervisor', PY / 'supervisor.py')
DOC = json.loads((U / 'inputs' / 'spec-2ac' / 'cases-2a-cont.json').read_bytes())


def check(test, ok, detail=None):
    RESULTS.append({'test': test, 'ok': bool(ok), 'detail': detail})


def compact(x):
    return json.dumps(x, ensure_ascii=False, separators=(',', ':'))


def sha(b):
    return hashlib.sha256(b).hexdigest()


def log(role, case, events=None, begin_sha=None):
    lg = OBS.RoleLog(role, {'attempt': 'x', 'case': case, 'nonce': 'n', 'source_sha256': '0' * 64})
    lg.events = [dict(e, seq=i, mono_ns=str(1000 + i)) for i, e in enumerate(events or [])]
    lg.recv_ns = [1000 + i for i in range(len(lg.events))]
    lg.case_input_sha256 = begin_sha
    return lg


def logs_for(case, driver_events=None, with_roles=('driver',), sha_value=None):
    want = sha_value if sha_value is not None else ACC.CASES_DEF[case]['case_input_sha256']
    out = {}
    for r in ('driver', 'adapter', 'peer'):
        ev = (driver_events or [{'kind': 'BEGIN', 'data': {}}]) if r == 'driver' else ([{'kind': 'BEGIN', 'data': {}}] if r in with_roles else [])
        out[r] = log(r, case, ev, want if r in with_roles else None)
    return out


# ------------------------------------------------------------------ evaluator r4
def t_class_map():
    bad = [[c['id'], p] for c in DOC['cases'] for p in c['predicates'] if ACC.plan(c['id'])['classes'][p] != DOC['predicate_table'][p]['class']]
    check('R4-09 class map equals the frozen table for every case predicate', not bad, bad)


def items(*classes):
    return [{'id': 'p%d' % i, 'ok': False, 'class': k, 'detail': None} for i, k in enumerate(classes)]


def t_composition():
    c = ACC.CASES_DEF['2A-TS08X']
    cases = [('sanity + client', items('peer_or_capture_sanity', 'client'), True, ('INVALID_CAPTURE', 4)),
             ('capture + client', items('capture_order_or_cleanup', 'client'), True, ('INVALID_CAPTURE', 4)),
             ('evaluation failed', items('client'), False, ('INVALID_CAPTURE', 3)),
             ('only client', items('client'), True, ('MISMATCH', 6)),
             ('client + informational', items('client', 'informational'), True, ('MISMATCH', 6)),
             ('only informational', items('informational'), True, ('PASS_CLIENT_OBSERVATION', 7)),
             ('no failure', [], True, ('PASS_CLIENT_OBSERVATION', 7))]
    for name, its, done, want in cases:
        check('composition: ' + name, ACC.compose(c, 'PASS', its, done, False) == want, ACC.compose(c, 'PASS', its, done, False))
    viol = []
    classes = ['client', 'peer_or_capture_sanity', 'capture_order_or_cleanup', 'order_unilateral', 'informational']
    for case in ACC.CASES_DEF.values():
        for form in ACC.KNOWN_FORMS + ('INVALID_CAPTURE',):
            for r in range(len(classes) + 1):
                for combo in itertools.combinations(classes, r):
                    for done in (True, False):
                        for timeout in (True, False):
                            out, rule = ACC.compose(case, form, items(*combo), done, timeout)
                            if out == 'MISMATCH' and rule not in (2, 6):
                                viol.append([case['id'], form, combo])
    check('invariant: MISMATCH only from rules 2 and 6', not viol, viol[:3])


def t_jeq():
    cases = [(0, False, False), (1, True, False), (0, 0.0, True), (None, None, True), ({'a': [0]}, {'a': [False]}, False), ('1', 1, False)]
    check('jeq strict by type', all(ACC.jeq(a, b) is w for a, b, w in cases))


def t_frameless():
    base = {'state': 'closed', 'failure': None, 'survivors_at_calls_done': {'adapter': 0, 'peer': 0}}
    ew_open = dict(base, in_open_in_window=2, events_in_window=[{'mask': ['IN_OPEN']}, {'mask': ['IN_OPEN']}])
    ew_zero = dict(base, in_open_in_window=0, events_in_window=[])
    sf = [{'api': 'x', 'code': 'ENOENT', 'syscall': 'spawn /x'}]
    rows = [('PREFRAME: IN_OPEN, no spawn failure, no survivor', 'NO_CHILD', ew_open, [], 'PREFRAME_TERMINATION'),
            ('NO_CHILD: zero events and spawn failure', 'NO_CHILD', ew_zero, sf, 'NO_CHILD'),
            ('negative: IN_OPEN with spawn failure (exec opened and failed)', 'NO_CHILD', ew_open, sf, 'INVALID_CAPTURE'),
            ('negative: no event and no spawn failure', 'NO_CHILD', ew_zero, [], 'INVALID_CAPTURE'),
            ('negative: survivor at CALLS_DONE', 'NO_CHILD', dict(ew_open, survivors_at_calls_done={'adapter': 1, 'peer': 0}), [], 'INVALID_CAPTURE'),
            ('negative: inotify overflow', 'NO_CHILD', dict(ew_open, failure="inotify ['IN_Q_OVERFLOW']"), [], 'INVALID_CAPTURE'),
            ('negative: window never closed', 'NO_CHILD', dict(ew_open, state='window'), [], 'INVALID_CAPTURE'),
            ('negative: no witness at all', 'NO_CHILD', None, sf, 'INVALID_CAPTURE'),
            ('other verdicts pass through', 'KNOWN_SIGNAL_TERMINATION', None, [], 'KNOWN_SIGNAL_TERMINATION')]
    for name, verdict, ew, failed, want in rows:
        got = ACC.frameless_form(verdict, ew, failed)
        check('R4-03 ' + name, got == want, {'got': got, 'want': want})
    f, notes = ACC.capture_form('2A-TS10E', 'PREFRAME_TERMINATION', [])
    check('R3-F02 PREFRAME in a case that does not declare it -> INVALID_CAPTURE', f == 'INVALID_CAPTURE' and notes, {'form': f})
    f, notes = ACC.capture_form('2A-TS12R', 'PREFRAME_TERMINATION', [])
    check('R4-03 PREFRAME kept in 2A-TS12R', f == 'PREFRAME_TERMINATION' and not notes, {'form': f})


def t_case_input_witness():
    c = ACC.CASES_DEF['2A-TS08X']
    w = {'case_input_sha256_supervisor': c['case_input_sha256'], 'case_input_sha256_recomputed': c['case_input_sha256']}
    ok, det = ACC.case_input_witness(c, logs_for('2A-TS08X', with_roles=('driver', 'adapter', 'peer')), w)
    check('R4-02 all witnesses equal -> pass', ok, det)
    lg = logs_for('2A-TS08X', with_roles=('driver', 'adapter', 'peer'))
    lg['peer'].case_input_sha256 = '1' * 64
    ok, _ = ACC.case_input_witness(c, lg, w)
    check('R4-02 one role reports other bytes -> fail', not ok)
    ok, _ = ACC.case_input_witness(c, logs_for('2A-TS08X', with_roles=('driver', 'adapter', 'peer')), dict(w, case_input_sha256_recomputed='2' * 64))
    check('R4-02 recomputed differs -> fail', not ok)
    ok, det = ACC.case_input_witness(ACC.CASES_DEF['2A-TS12R'], logs_for('2A-TS12R', with_roles=('driver',)),
                                     {'case_input_sha256_supervisor': ACC.CASES_DEF['2A-TS12R']['case_input_sha256'],
                                      'case_input_sha256_recomputed': ACC.CASES_DEF['2A-TS12R']['case_input_sha256']})
    check('R4-02 roles without BEGIN are NOT_APPLICABLE (R2-F01 of the spec review)', ok and det['roles']['adapter'].startswith('NOT_APPLICABLE'), det)


def predicate(case, logs, pid, witness, form='PASS'):
    P = ACC.Preds(case)
    ACC.ts_case(P, ACC.CASES_DEF[case], logs, witness, form)
    return P.got[pid]


def t_ts12r():
    ev = [{'kind': 'BEGIN', 'data': {}},
          {'kind': 'API_RESULT', 'data': {'api': '3:new AbortController', 'result': {'aborted': True}, 'observations': {}}},
          {'kind': 'API_ERROR', 'data': {'api': '5:Thread.runStreamed', 'name': 'AbortError', 'message': 'The operation was aborted', 'cause': None}},
          {'kind': 'DIAGNOSTIC', 'data': {'milestone': 'ERROR_DETAIL', 'detail': {'step': 5, 'api': '5:Thread.runStreamed', 'code': 'ABORT_ERR', 'syscall': None, 'ctor': 'AbortError'}}}]
    ew = {'state': 'closed', 'failure': None, 'in_open_in_window': 2, 'events_in_window': [{'mask': ['IN_OPEN']}], 'survivors_at_calls_done': {'adapter': 0, 'peer': 0}}
    w = {'os_checks': {}, 'role_mapped': ['driver'], 'step_witness': [], 'exec_witness': ew}
    lg = logs_for('2A-TS12R', ev)
    check('R4-10 2A-TS12R abort.api_outcome_recorded reads step 5', predicate('2A-TS12R', lg, 'abort.api_outcome_recorded', w)[0] is True)
    check('R4-06 2A-TS12R witness r4 passes with IN_OPEN, no spawn failure, no survivor', predicate('2A-TS12R', lg, 'abort.os_witness_recorded_r4', w)[0] is True)
    ev4 = [dict(e, data=dict(e['data'], api=e['data'].get('api', '').replace('5:', '4:'))) if e['kind'] == 'API_ERROR' else e for e in ev]
    check('R4-10 events of step 4 do not satisfy step 5', predicate('2A-TS12R', logs_for('2A-TS12R', ev4), 'abort.api_outcome_recorded', w)[0] is False)
    ev_sf = ev[:3] + [{'kind': 'DIAGNOSTIC', 'data': {'milestone': 'ERROR_DETAIL', 'detail': {'step': 5, 'api': '5:Thread.runStreamed', 'code': 'ENOENT', 'syscall': 'spawn /x', 'ctor': 'Error'}}}]
    check('R4-06 IN_OPEN with spawn failure is not existence', predicate('2A-TS12R', logs_for('2A-TS12R', ev_sf), 'abort.os_witness_recorded_r4', w)[0] is False)


def t_ts10e():
    good = [{'kind': 'BEGIN', 'data': {}},
            {'kind': 'API_RESULT', 'data': {'api': '3:Thread.run', 'result': ACC.EMPTY_RESULT, 'observations': {}}},
            {'kind': 'DIAGNOSTIC', 'data': {'milestone': 'UNCAUGHT', 'detail': {'name': 'Error', 'code': 'EPIPE', 'syscall': 'write', 'message': 'write EPIPE'}}},
            {'kind': 'DIAGNOSTIC', 'data': {'milestone': 'UNCAUGHT_DRAIN', 'detail': {'count': 1, 'wait_ms': 500}}}]
    w = {'os_checks': {}, 'role_mapped': [], 'step_witness': []}
    check('R4-07 one EPIPE write uncaught -> pass', predicate('2A-TS10E', logs_for('2A-TS10E', good), 'api.stdin_error_uncaught', w)[0] is True)
    two = good[:3] + [good[2], {'kind': 'DIAGNOSTIC', 'data': {'milestone': 'UNCAUGHT_DRAIN', 'detail': {'count': 2, 'wait_ms': 500}}}]
    check('R4-07 two uncaught -> fail', predicate('2A-TS10E', logs_for('2A-TS10E', two), 'api.stdin_error_uncaught', w)[0] is False)
    check('R4-07 run result after the stdin error', predicate('2A-TS10E', logs_for('2A-TS10E', good), 'api.run_result_after_stdin_error', w)[0] is True)


def t_ts07x():
    c = ACC.CASES_DEF['2A-TS07X']
    ev = [{'kind': 'BEGIN', 'data': {}}]
    wit = []
    for e in c['expected']['errors']:
        ev.append({'kind': 'API_ERROR', 'data': {'api': '%d:Thread.run' % e['step'], 'name': e['name'], 'message': e['message'], 'cause': None}})
        wit.append({'step': e['step'], 'kind': 'ZERO_SPAWN', 'adapter_processes': 0, 'peer_processes': 0, 'adapter_frames': 0, 'peer_frames': 0})
    w = {'os_checks': {}, 'role_mapped': [], 'step_witness': wit}
    check('R4-08 every error step exact with zero-spawn witness -> pass', predicate('2A-TS07X', logs_for('2A-TS07X', ev), 'api.toml_errors_exact', w)[0] is True)
    ev2 = list(ev)
    ev2[2] = {'kind': 'API_ERROR', 'data': dict(ev[2]['data'], message='other')}
    check('R4-08 one altered message -> fail', predicate('2A-TS07X', logs_for('2A-TS07X', ev2), 'api.toml_errors_exact', w)[0] is False)


def t_peer_replay():
    c = ACC.CASES_DEF['2AC-CTRL01']
    s = RPC.ScriptV2(c['peer_script'])
    stdin = b''.join((json.dumps(x) + '\n').encode() for x in c['control_client']['lines'])
    want = b''
    for line in stdin.split(b'\n'):
        if not line:
            continue
        msg = json.loads(line)
        if 'id' in msg and 'method' in msg:
            for op in s.plan(msg)[1]:
                want += op[3]
    a = OBS.RoleLog('adapter', {'attempt': 'x', 'case': 'c', 'nonce': 'n', 'source_sha256': '0' * 64})
    a.data['stdin'] = bytearray(stdin)
    a.committed['stdin'] = len(stdin)
    a.data['stdout'] = bytearray(want)
    a.committed['stdout'] = len(want)
    a.terminal = 'END'
    a.events = [{'kind': 'END', 'data': {'complete': True}}]
    check('F4-05 replay equals the frozen-order peer output', ACC.peer_replay_check(c['case_input'], {'adapter': a})['status'] == 'EQUAL')
    sorted_out = b''.join((json.dumps(json.loads(x), sort_keys=True, separators=(',', ':')) + '\n').encode() for x in want.split(b'\n') if x)
    a.data['stdout'] = bytearray(sorted_out)
    a.committed['stdout'] = len(sorted_out)
    check('F4-05 sorted-key peer output is rejected (the 2A defect)', ACC.peer_replay_check(c['case_input'], {'adapter': a})['status'] == 'MISMATCH'
          or sorted_out == want, {'identical_when_sorted': sorted_out == want})


# ------------------------------------------------------------------ peer v2, delivery, wire
def t_peer_strict():
    ps = {'version': 2, 'unscripted_error': {'code': -32601, 'message': 'cvg synthetic: unscripted request', 'data': {'cvg_synthetic': True}},
          'on_request': [{'match': {'method': 'm', 'params': {'k': 1}}, 'reply': {'result': {}}}]}
    rows = [({'k': True}, None), ({'k': 1.0}, 0), ({'k': 1}, 0)]
    got = [RPC.ScriptV2(ps).plan({'id': 'a', 'method': 'm', 'params': p})[0] for p, _ in rows]
    check('F4-03 peer match strict by type ({k:1} vs true no; vs 1.0 yes)', got == [w for _, w in rows], got)
    ps0 = dict(ps, on_request=[{'match': {'method': 'm', 'params': {'k': 0}}, 'reply': {'result': {}}}])
    check('F4-03 {k:0} does not match {k:false}', RPC.ScriptV2(ps0).plan({'id': 'a', 'method': 'm', 'params': {'k': False}})[0] is None)


def t_exit_order():
    src = (PY / 'fixture-rpc.py').read_text().splitlines()
    close = [i for i, l in enumerate(src) if 'os.close(1)' in l]
    mark = [i for i, l in enumerate(src) if "'EXIT_AFTER_SCRIPT'" in l]
    check('F4-04 stdout closed before EXIT_AFTER_SCRIPT', len(close) == 1 and len(mark) == 1 and close[0] < mark[0], {'close_line': close, 'milestone_line': mark})


def t_delivery():
    bad, sorted_differs = [], []
    for c in DOC['cases']:
        row = SUP.delivered_input(c['id'])
        if sha(compact(row).encode()) != c['case_input_sha256'] or row is not SUP.SPEC_CASES[c['id']]['case_input']:
            bad.append(c['id'])
        if sha(json.dumps(row, sort_keys=True, ensure_ascii=False, separators=(',', ':')).encode()) != c['case_input_sha256']:
            sorted_differs.append(c['id'])
    check('F4-01 delivered case_input is the frozen slot bytes', not bad, bad)
    check('F4-01 a sorted delivery would be rejected (sha differs) in the order-sensitive slots', {'2A-TS03R', '2A-TS06R', '2A-TS07R'} <= set(sorted_differs),
          {'slots_where_sorted_differs': sorted_differs})
    fb = json.loads(SUP.fixture_bytes())
    check('F4-01 fixture-cases.json is not the source of case_input', fb['2A-TS06R'] == SUP.delivered_input('2A-TS06R')
          and compact(fb['2A-TS06R']) != compact(SUP.delivered_input('2A-TS06R')))
    w = SUP.frozen_wire(SUP.ts_fixture('DIAG-TS-ABORT'))
    check('F4-02 wire reference keeps the frozen key order', w['stdout'].startswith(b'{"type":"thread.started","thread_id":"diag-abort"}'), w['stdout'][:60].decode())


def t_wire_check():
    exp = {'stdout': b'abc\n', 'stderr': b''}
    rows = [((b'abc\n', b'', True), 'EQUAL'), ((b'abd\n', b'', True), 'MISMATCH'), ((b'ab', b'', False), 'PREFIX'),
            ((b'x', b'', False), 'MISMATCH'), ((b'', b'', False), 'NOT_CHECKED')]
    got = [OBS.wire_check(o, e, exp, c) for (o, e, c), _ in rows]
    check('F4-02 wire_check equality, prefix under signal and NOT_CHECKED', got == [w for _, w in rows], got)


# ------------------------------------------------------------------ exec witness
def t_exec_witness():
    SCRATCH.mkdir(parents=True, exist_ok=True)
    target = SCRATCH / 'witness-target.sh'
    target.write_text('#!/nonexistent/interpreter\n')
    target.chmod(0o755)
    w = SUP.ExecWitness(target, time.monotonic_ns())
    target.read_bytes()  # before the window: drained and discarded at open_window
    w.open_window()
    try:
        subprocess.run([str(target)], capture_output=True, timeout=10)
        spawn_error = None
    except OSError as exc:
        spawn_error = exc.errno
    w.close_window({'adapter': 0, 'peer': 0})
    rec = w.record()
    check('F4-06 events before the window are not counted', rec['events_before'] >= 1, {'before': rec['events_before']})
    check('F4-06 exec that opens the file and fails gives IN_OPEN in the window (unprivileged)', rec['in_open_in_window'] >= 1 and spawn_error is not None,
          {'in_open': rec['in_open_in_window'], 'spawn_errno': spawn_error, 'privilege': rec['privilege']})
    form = ACC.frameless_form('NO_CHILD', rec, [{'api': 'x', 'code': 'ENOENT', 'syscall': 'spawn ' + str(target)}])
    check('R4-03 that real case is classified INVALID_CAPTURE, never PREFRAME', form == 'INVALID_CAPTURE', {'form': form})
    check('F4-06 dev/ino recorded', rec['dev_ino'] == [os.stat(target).st_dev, os.stat(target).st_ino])
    target.unlink()


# ------------------------------------------------------------------ node and channels
def t_node():
    check('host node pinned', sha(Path(NODE).read_bytes()) == NODE_SHA)
    bad = []
    for f in ('ts-driver.mjs', 'fixture-cli.mjs', 'extension-loader.mjs', 'transpile.mjs', 'channel.cjs', 'adapter-typescript'):
        r = subprocess.run([NODE, '--check', str(U / 'node' / f)], capture_output=True, text=True, timeout=60)
        if r.returncode:
            bad.append([f, r.stderr[-200:]])
    check('node --check of the node sources', not bad, bad)
    js = ("import { materialize } from %s;\n"
          "const h = materialize([1, '$HOLE', 3]); const u = materialize([1, '$UNDEFINED', 3]);\n"
          "const d = materialize({ $DATE: 0 }); const i = materialize({ $INSTANCE: { k: 1 } });\n"
          "const out = { hole: !(1 in h) && h.length === 3, undefined_present: (1 in u) && u[1] === undefined,\n"
          "  bigint: typeof materialize({ $BIGINT: '1' }) === 'bigint', date: d instanceof Date && Object.entries(d).length === 0,\n"
          "  instance: Object.getPrototypeOf(i) !== Object.prototype && Object.keys(i).join() === 'k',\n"
          "  nan: Number.isNaN(materialize('$NAN')), inf: materialize('$INFINITY') === Infinity,\n"
          "  repeat: materialize({ $REPEAT: { text: 'x', count: 1048576 } }).length === 1048576,\n"
          "  order: Object.keys(materialize({ b: 1, a: 2 })).join() === 'b,a' };\n"
          "console.log(JSON.stringify(out));\n") % json.dumps('file://' + str(U / 'node' / 'ts-driver.mjs'))
    r = subprocess.run([NODE, '--input-type=module', '-e', js], capture_output=True, text=True, timeout=60, cwd=str(SCRATCH))
    out = json.loads(r.stdout) if r.returncode == 0 and r.stdout.strip() else {}
    check('F4-08 driver markers materialize to the declared JS values', bool(out) and all(out.values()), {'rc': r.returncode, 'out': out, 'stderr': r.stderr[-300:]})
    src = (U / 'node' / 'channel.cjs').read_text()
    rx = src.split("/^(?:2A-TS(?:03R|06R|07R|12R|10E|06X|07X|08X)|TSC-SDK-EMIT|DIAG-TS-[A-Z0-9-]{1,32})$/")
    check('F4-10 TS case-id regex is the continuation one', len(rx) == 2)
    py = (PY / 'channel.py').read_text()
    check('F4-10 Python channel accepts only the continuation CONTROL id', "control_case = case == '2AC-CTRL01'" in py and "sdk_case = case in ()" in py)


def t_reevaluate_no_doc():
    SCRATCH.mkdir(parents=True, exist_ok=True)
    empty = SCRATCH / 'no-acceptance'
    empty.mkdir(exist_ok=True)
    r = subprocess.run([sys.executable, '-I', '-B', str(PY / 'acceptance.py'), 'reevaluate', str(empty)], capture_output=True, text=True, timeout=60)
    check('reevaluate without a service acceptance.json -> exit 1 with message', r.returncode == 1 and 'no service acceptance.json' in r.stderr, r.stderr[-200:])
    empty.rmdir()


def main():
    SCRATCH.mkdir(parents=True, exist_ok=True)
    for t in (t_class_map, t_composition, t_jeq, t_frameless, t_case_input_witness, t_ts12r, t_ts10e, t_ts07x, t_peer_replay,
              t_peer_strict, t_exit_order, t_delivery, t_wire_check, t_exec_witness, t_node, t_reevaluate_no_doc):
        try:
            t()
        except Exception as exc:  # noqa: BLE001
            check(t.__name__ + ' raised', False, '%s: %s' % (type(exc).__name__, exc))
    srcs = {p.relative_to(U).as_posix(): sha(p.read_bytes()) for p in sorted(list(PY.glob('*.py')) + list((U / 'node').glob('*')) + [Path(__file__).resolve()])}
    doc = {'kind': 'BATCH_2A_CONTINUATION_OFFLINE_SELFTESTS_R4', 'evaluator_version': ACC.VERSION, 'sdk_imported': False, 'services': 0, 'network': False,
           'passed': sum(1 for r in RESULTS if r['ok']), 'failed': sum(1 for r in RESULTS if not r['ok']), 'results': RESULTS, 'sources_sha256': srcs,
           'python': sys.version.split()[0]}
    (U / 'selftests' / 'selftest-results.json').write_text(json.dumps(doc, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'passed': doc['passed'], 'failed': doc['failed'], 'failed_tests': [r['test'] for r in RESULTS if not r['ok']]}, ensure_ascii=False, indent=1))
    return 0 if doc['failed'] == 0 else 1


if __name__ == '__main__':
    sys.exit(main())
