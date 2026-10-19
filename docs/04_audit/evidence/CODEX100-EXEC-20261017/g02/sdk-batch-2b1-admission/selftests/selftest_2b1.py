"""Offline selftests of DX100-G02:IMPLEMENT-AND-ADMIT-SDK-SOURCE-BATCH-2B-1 (no SDK, no Pydantic, no service, no network).

Run: python3 -I -B selftests/selftest_2b1.py   -> writes selftests/selftest-results.json (exit 0 only when all pass).

Covers the proofs of freeze-r4-2b-delta.json (D2B-01..04, 09..13, 15), the selftests_offline of the 2B-1 capabilities
(capability-contracts-2b.json), the E2B clauses of evaluator-r4-2b-delta.json, the binding R2-F01 (occurrence per (id, event),
positive and negative, against the frozen expected.hooks of 2B-PY13D) and the carry-overs R2-F02/F03/F04/F06, plus an offline
run of the driver interpreter over the own-code diagnostic flows against a local fake JSON-RPC server (the sandbox, the adapter
and the peer are replaced; the interpreter, harness2b and own2b are the frozen sources).
"""
import asyncio
import base64
import concurrent.futures
import contextlib
import copy
import dataclasses
import hashlib
import importlib.util
import json
import os
import queue
import shutil
import signal
import subprocess
import sys
import threading
import time
import traceback
from pathlib import Path

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
UNIT = HERE.parent
PY = UNIT / 'python'
SCRATCH = Path('/mnt/dados/cvg-work/cvg-codex100-batch2b1-runtime-20261019/selftest-scratch')
RESULTS = []


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    sys.modules[name] = m
    spec.loader.exec_module(m)
    return m


CH = load('st_channel', PY / 'channel.py')
OBS = load('st_observer', PY / 'observer.py')
ACC = load('st_acceptance', PY / 'acceptance.py')
H = load('harness2b', PY / 'harness2b.py')
OWN = load('own2b', PY / 'own2b.py')
RPC = load('st_fixture_rpc', PY / 'fixture-rpc.py')
RPC.C = CH
SUP = load('st_supervisor', PY / 'supervisor.py')
ADP = load('st_adapter', PY / 'adapter-python.py')
DRV = load('st_driver', PY / 'python-driver.py')
DRV.C, DRV.H = CH, H
CC = load('st_control_client', PY / 'control-client.py')
CC.C = CH
DOC1 = ACC._DOC
DOC2 = ACC.cases2()


def check(test, ok, detail=None):
    RESULTS.append({'test': test, 'ok': bool(ok), 'detail': detail})


def case1(cid):
    return [c for c in DOC1['cases'] if c['id'] == cid][0]


# ================================================================================================ D2B-01
def t_ids_and_counts():
    acc = ['2B-PY01A', '2B-PY12B', '2B-PY18D', '2B-PY05X']
    rej = ['2B-PY00A', '2B-PY19A', '2A-PY03', '2B-PY1A', '2B-PY01a', '2AC-CTRL01']
    check('D2B-01 SDK IDs accepted and rejected', all(CH.SDK_CASE_RE.match(x) for x in acc) and not any(CH.SDK_CASE_RE.match(x) for x in rej),
          {'accepted': acc, 'rejected': rej})
    check('D2B-01 CONTROL IDs of the two sub-lots', CH.CONTROL_CASES == ('2B1-CTRL01', '2B2-CTRL01') and '2AC-CTRL01' not in CH.CONTROL_CASES)
    check('D2B-01 slot counts per sub-lot (16 and 18)', len(DOC1['cases']) == 16 and DOC1['counts']['slots'] == 16 and len(DOC2['cases']) == 18
          and len(SUP.SDK_CASES) == 15, {'2b1': len(DOC1['cases']), '2b2': len(DOC2['cases'])})
    check('D2B-01 the supervisor binds cases-2b-1.json by sha', SUP.CASES_SHA == hashlib.sha256((UNIT / 'inputs/spec-2b/cases-2b-1.json').read_bytes()).hexdigest())


# ================================================================================================ D2B-02 / E2B-01
def t_vocabulary_and_r3_12():
    handled = {'hook.install', 'excepthook.install', 'excepthook.wait', 'excepthook.snapshot', 'hook.wait', 'hook.count', 'probe', 'probe.until',
               'proc.retain', 'clock.mark', 'driver.reap', 'thread.join', 'worker.start', 'worker.parked', 'worker.still_parked', 'worker.join',
               'attr', 'call', 'stream.next', 'barrier', 'epilogue', 'task.create', 'task.cancel', 'task.await', 'loop.yield_until',
               'loop.block_release_wait_cancel', 'heartbeat', 'async_with.enter', 'astream.next', 'astream.aclose', 'Codex.new', 'AsyncCodex.new',
               'CodexClient.new', 'Thread.new', 'AsyncThread.new', 'TurnHandle.new', 'own.new'}
    src = (PY / 'python-driver.py').read_text()
    used = {s['api'] for c in DOC1['cases'] for s in c['case_input'].get('sdk_calls', [])}
    used_diag = {s['api'] for r in SUP.DIAG_ROWS.values() for s in r.get('diag_calls', [])}
    check('D2B-02 every step api of cases-2b-1 and of the own DIAG is in the interpreter vocabulary', (used | used_diag) <= handled
          and all(("'%s'" % a) in src for a in handled), sorted((used | used_diag) - handled))
    bad = [p for p, d in DOC1['predicate_table'].items() if ACC.class_of(p) != d['class']]
    unused = [p for c in DOC1['cases'] for p in c['predicates'] if p not in DOC1['predicate_table']]
    check('E2B-01 R3-12: evaluator class == frozen class on every predicate of the table; every case predicate in the table', not bad and not unused, bad + unused)
    check('E2B-01 R3-12 over the 2B-2 table too (shared machinery)', all(DOC2['predicate_table'][p]['class'] in
                                                                         ('client', 'peer_or_capture_sanity', 'capture_order_or_cleanup', 'informational', 'order_unilateral')
                                                                         for p in DOC2['predicate_table']))
    fch = FakeCh()
    cfg = {'case': 'X', 'case_input': {'diag_calls': [{'step': 1, 'api': 'model.validate'}]}}
    try:
        DRV.Interp(cfg, fch, 'diag2b').run_sync()
        refused = False
    except CH.ChannelError:
        refused = True
    check('D2B-02 a step outside the closed vocabulary is refused (INVALID_CAPTURE)', refused)


# ================================================================================================ fake channel
class FakeCh:
    """Validates every frame with the role-side encoder (caps, kinds, fields) and records it; controls return at once."""

    def __init__(self, role='driver'):
        self.role, self.frames, self.controls = role, [], []
        self.seq = 0
        self.begin = {}
        self.lock = threading.Lock()

    def emit(self, kind, data):
        with self.lock:
            ev = {'v': 1, 'attempt': 'a' * 40, 'case': 'SELFTEST', 'role': self.role, 'seq': self.seq, 'kind': kind, 'pid': os.getpid(),
                  'mono_ns': str(time.monotonic_ns()), 'data': data}
            CH.encode_frame(ev)  # same validation and caps as the role channel
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


# ================================================================================================ D2B-15 / R2-F06
def t_kinds_per_role():
    samples = {
        'PROBE': {'id': 'p', 'value': [1, 'a', None]}, 'HOOK_EVENT': {'id': 'h', 'event': 'return', 'occurrence': 1, 'thread_name': 'T', 'record': {}},
        'WORKER_RESULT': {'name': 'W1', 'kind': 'result', 'value': {'summary': None, 'identity': 1}},
        'WORKER_PARKED': {'name': 'W1', 'parked': True, 'witness': {}}, 'TASK_EVENT': {'name': 'T1', 'event': 'created'}, 'CANCEL': {'step': 3},
        'SHIM_RECORD': {'target': 't', 'call': 'c', 'args': [], 'returned': None}, 'SHIM_SCOPE': {'target': 't', 'state': 'installed', 'identity_ok': True},
        'EXCEPTHOOK_RECORD': {'thread_name': 'T', 'class': 'builtins.RuntimeError', 'str': 'x'}, 'MODEL_RESULT': {'step': 1, 'result': None},
        'PROC_RETAIN': {'as': 'p', 'pid': 3, 'args': ['a']}, 'SERIALIZATION_WARNING': {'step': 's', 'category': 'c', 'message': 'm'},
        'PRE_REPLY_NOTIFICATION': {'reply_id': 'ctrl-2', 'method': 'turn/started', 'bytes': 10, 'sha256': '0' * 64},
    }
    ok_all, refused_all = True, True
    for k, d in samples.items():
        for role in ('driver', 'adapter', 'peer'):
            ev = {'v': 1, 'attempt': 'a' * 40, 'case': 'X', 'role': role, 'seq': 0, 'kind': k, 'pid': 1, 'mono_ns': '1', 'data': d}
            try:
                CH.validate_event(ev)
                accepted = True
            except CH.ChannelError:
                accepted = False
            if role == 'driver':
                ok_all = ok_all and accepted
            else:
                refused_all = refused_all and not accepted
    check('D2B-15 each new driver kind accepted in the driver role', ok_all)
    check('D2B-15 each new driver kind refused in the adapter and peer roles', refused_all)
    base = {'nonce': 'b' * 40, 'source_sha256': 'c' * 64, 'pid_namespace': 'pid:[1]', 'case_input_sha256': 'd' * 64}

    def ev(role, kind, data):
        return {'v': 1, 'attempt': 'a' * 40, 'case': 'X', 'role': role, 'seq': 0, 'kind': kind, 'pid': 1, 'mono_ns': '1', 'data': data}

    def accepted(e):
        try:
            CH.validate_event(e)
            return True
        except CH.ChannelError:
            return False
    check('R2-F06 driver BEGIN carries dependency_identity; adapter BEGIN argv_tail/cwd/env; peer BEGIN base only',
          accepted(ev('driver', 'BEGIN', dict(base, dependency_identity={'pydantic': '2.13.4', 'pydantic_core': '2.46.4'})))
          and accepted(ev('adapter', 'BEGIN', dict(base, argv_tail=[], cwd='/work', env={'A': 'b'}))) and accepted(ev('peer', 'BEGIN', base))
          and not accepted(ev('peer', 'BEGIN', dict(base, dependency_identity=None))) and not accepted(ev('driver', 'BEGIN', base)))
    check('D2B-10/D2B-15 adapter FAULT sigterm_ignored accepted; unknown fault refused; driver FAULT has its own fields',
          accepted(ev('adapter', 'FAULT', {'fault': 'sigterm_ignored'})) and not accepted(ev('adapter', 'FAULT', {'fault': 'other'}))
          and accepted(ev('driver', 'FAULT', {'target': 't', 'call': 'c', 'count': 1})) and not accepted(ev('driver', 'FAULT', {'fault': 'sigterm_ignored'})))
    # observer (independent decoder): a driver kind on the peer FIFO is a violation
    log = OBS.RoleLog('peer', {'attempt': 'a' * 40, 'case': 'X', 'nonce': 'b' * 40, 'source_sha256': 'c' * 64})
    frames = [ev('peer', 'BEGIN', base), dict(ev('peer', 'READY', {}), seq=1), dict(ev('peer', 'PROBE', {'id': 'p', 'value': 1}), seq=2)]
    raw = b''.join(len(CH.dumps(f).encode()).to_bytes(4, 'big') + CH.dumps(f).encode() for f in frames)
    log.feed(raw, 0)
    check('D2B-15 observer refuses a driver kind on the peer channel', log.violation is not None and 'kind' in log.violation, log.violation)
    check('R2-F06 STEP_WITNESS is a DIAGNOSTIC milestone and clock.mark is CLOCK_MARK in the driver source',
          "'STEP_WITNESS'" in (PY / 'python-driver.py').read_text() and "'CLOCK_MARK'" in (PY / 'python-driver.py').read_text()
          and 'STEP_WITNESS' not in CH.DATA_FIELDS)


# ================================================================================================ CAP-2B-CONC-BARRIER selftests
def t_conc_barrier():
    # 1. two own threads on a Condition and on a Queue
    box = OWN.OwnBox()
    w1 = threading.Thread(target=box.wait_item, name='sw1', daemon=True)
    w2 = threading.Thread(target=box.wait_item, name='sw2', daemon=True)
    q1 = threading.Thread(target=box.queue_get, name='sq1', daemon=True)
    for t in (w1, w2, q1):
        t.start()
    time.sleep(0.1)
    parked = [H.park_witness(t, None)[0] for t in (w1, w2, q1)]
    box.put_one('x')
    time.sleep(0.1)
    after_one = [t.is_alive() for t in (w1, w2)]
    box.put_all('y', 1)
    box.queue_put('z')
    w1.join(1), w2.join(1), q1.join(1)
    check('CONC 1: Condition and Queue consumers parked; notify wakes the first, notify_all the rest', all(parked) and sorted(after_one) == [False, True]
          and not w1.is_alive() and not w2.is_alive() and not q1.is_alive(), {'parked': parked, 'alive_after_notify': after_one})
    # 2. contextmanager with lock and counter: parking on the with line
    lk = threading.Lock()
    state = {'users': 0}

    @contextlib.contextmanager
    def guarded():
        state['users'] += 1
        with lk:
            yield

    def user():
        with guarded():
            pass
    lk.acquire()
    t = threading.Thread(target=user, name='cm', daemon=True)
    t.start()
    time.sleep(0.1)
    code = guarded.__wrapped__.__code__
    line = [n for n in range(code.co_firstlineno, code.co_firstlineno + 6) if 'with lk:' in Path(__file__).read_text().split('\n')[n - 1]][0]
    ok, wit = H.park_witness(t, {'code': code, 'line': line})
    lk.release()
    t.join(1)
    check('CONC 2: own contextmanager parked on the line of its with', ok and state['users'] == 1, wit)
    # 3. hook on own code: arguments and return unchanged (checksum before/after)
    def own_fn(data, raw):
        return hashlib.sha256(data.encode() + raw).hexdigest()
    hs = H.HookSet()
    hs.install([{'id': 'h_own', 'code': 'x', 'event': 'call+return', 'record': ['arg:data', 'arg:raw', 'thread_name']}], lambda _p: own_fn.__code__)
    before = own_fn('abc', b'x')
    hs.stop()
    recs = [(e['event'], e['occurrence'], e['record']) for e in hs.events]
    check('CONC 3: hook records the declared attributes only (a non-JSON argument is marked unrecorded, never dropped); result unchanged',
          before == hashlib.sha256(b'abcx').hexdigest() and [r[:2] for r in recs] == [('call', 1), ('return', 1)]
          and recs[0][2]['arg:data'] == 'abc' and 'unrecorded' in recs[0][2]['arg:raw'] and set(recs[0][2]) == {'arg:data', 'arg:raw', 'thread_name'}, recs)
    # 4. property refused, dataclass slot accepted
    @dataclasses.dataclass(slots=True)
    class S:
        a: int = 3

    class P:
        @property
        def p(self):
            return 1
    r = H.StaticReader({'s': S(), 'p': P()})
    try:
        r.probe(['p', '.p'], 'value')
        prop_ok = False
    except H.ProbeRefused:
        prop_ok = True
    check('CONC 4: probe on a property refused; on a dataclass slot accepted (E2B-08)', prop_ok and r.probe(['s', '.a'], 'value') == 3)
    # 5. return event on unwind of a raising function (arg None)
    hs = H.HookSet()
    hs.install([{'id': 'h_r', 'code': 'x', 'event': 'return', 'record': ['arg:label']}], lambda _p: OWN.own_raises.__code__)
    try:
        OWN.own_raises('u')
    except RuntimeError:
        pass
    hs.stop()
    check('CONC 5: return event emitted on the unwind of a function that raises', [(e['event'], e['record']) for e in hs.events] == [('return', {'arg:label': 'u'})])
    # 6. generator: call/return on each resumption, occurrences counted per (id, event)
    hs = H.HookSet()
    hs.install([{'id': 'h_g', 'code': 'x', 'event': 'call+return', 'record': []}], lambda _p: OWN.own_generator.__code__)
    OWN.own_generator_drain(2)
    hs.stop()
    check('CONC 6: generator call/return per resumption counted per (id, event) (R2-F01)',
          sorted((e['event'], e['occurrence']) for e in hs.events) == [('call', 1), ('call', 2), ('call', 3), ('return', 1), ('return', 2), ('return', 3)])
    # 7. excepthook: immediate snapshot may be empty; after thread.join it has the record
    rec = H.ExcepthookRecorder()
    rec.install()
    gate = threading.Event()

    def late_raise():
        gate.wait(1)
        raise RuntimeError('late')
    t = threading.Thread(target=late_raise, name='raiser', daemon=True)
    t.start()
    early = rec.snapshot()
    gate.set()
    t.join(2)
    late = rec.snapshot()
    threading.excepthook = rec.orig
    check('CONC 7: excepthook snapshot empty before, record present after thread.join', early == [] and late == [{'thread_name': 'raiser', 'class': 'builtins.RuntimeError', 'str': 'late'}], late)
    # 8. $executor-thread-of: one, none, two candidates
    ev = threading.Event()
    spec = {'code': threading.Event.wait.__code__, 'caller': OWN.OwnBox.wait_item.__code__}  # parking point that no executor thread has
    ex1 = concurrent.futures.ThreadPoolExecutor(thread_name_prefix='stx1')
    ex2 = concurrent.futures.ThreadPoolExecutor(max_workers=2, thread_name_prefix='stx2')
    ex1.submit(ev.wait, 2)
    ex2.submit(ev.wait, 2)
    ex2.submit(ev.wait, 2)
    time.sleep(0.15)
    one = H.executor_thread_of('stx1', None) is not None
    try:
        H.executor_thread_of('stx1', spec)
        none_ok = False
    except H.CaptureFailure:
        none_ok = True
    try:
        H.executor_thread_of('stx2', None)
        two_ok = False
    except H.CaptureFailure:
        two_ok = True
    ev.set()
    ex1.shutdown(), ex2.shutdown()
    check('CONC 8: $executor-thread-of accepts exactly one candidate (none and two refused)', one and none_ok and two_ok)


# ================================================================================================ CAP-2B-ASYNC-DRIVER selftests
def t_async_driver():
    # 1. own module with asyncio.Lock double check: waiters observed and a single initializer
    class Lazy:
        def __init__(self):
            self._initialized = False
            self._init_lock = asyncio.Lock()
            self.inits = 0

        async def use(self):
            if not self._initialized:
                async with self._init_lock:
                    if not self._initialized:
                        self.inits += 1
                        await asyncio.to_thread(time.sleep, 0.2)
                        self._initialized = True
            return 'ok'

    async def flow1():
        x = Lazy()
        r = H.StaticReader({'x': x})
        t1, t2 = asyncio.ensure_future(x.use()), asyncio.ensure_future(x.use())
        seen = None
        for _ in range(10000):
            await asyncio.sleep(0)
            try:
                if r.probe(['x', '._init_lock', '._waiters'], 'len') == 1:
                    seen = 1
                    break
            except H.ProbeRefused:
                continue  # len of None before the first waiter: 'not yet'
        return seen, await t1, await t2, x.inits
    seen, a, b, inits = asyncio.run(flow1())
    check('ASYNC 1: double-checked init under asyncio.Lock: one waiter seen, single initializer', seen == 1 and inits == 1 and a == b == 'ok')

    # 2. to_thread held: cancellation gives CancelledError and the worker finishes later
    async def flow2():
        hold = threading.Event()
        done = []

        def work():
            hold.wait(2)
            done.append(True)
        t = asyncio.ensure_future(asyncio.to_thread(work))
        await asyncio.sleep(0.05)
        t.cancel()
        try:
            await t
            cancelled = False
        except asyncio.CancelledError:
            cancelled = True
        before = list(done)
        hold.set()
        await asyncio.sleep(0.1)
        return cancelled, before, done
    c2, before, after = asyncio.run(flow2())
    check('ASYNC 2: to_thread cancelled while held; the worker completes after the release', c2 and before == [] and after == [True])

    # 3. wrap_future: cancel after set_result with the loop blocked runs the callback on the loop thread
    async def flow3():
        ex = concurrent.futures.ThreadPoolExecutor(thread_name_prefix='st-start')
        release = threading.Event()
        calls = []
        hs = H.HookSet()
        hs.install([{'id': 'h_set', 'code': 'x', 'event': 'return', 'record': ['thread_name']}],
                   lambda _p: concurrent.futures._base.Future.set_result.__code__)

        def job():
            release.wait(2)
            return 'r'

        async def start():
            op = ex.submit(job)
            try:
                return await asyncio.wrap_future(op)
            except asyncio.CancelledError:
                op.add_done_callback(lambda f: calls.append(threading.current_thread().name))
                raise
        t = asyncio.ensure_future(start())
        await asyncio.sleep(0.05)
        before = hs.count('h_set', 'return', 'st-start')
        release.set()  # synchronous release, the loop does not yield
        ok = hs.wait('h_set', 'return', before + 1, 2, 'st-start')
        t.cancel()
        try:
            await t
            cancelled = False
        except asyncio.CancelledError:
            cancelled = True
        hs.stop()
        ex.shutdown()
        return ok, cancelled, calls
    ok3, c3, calls = asyncio.run(flow3())
    check('ASYNC 3: cancel after set_result with the loop blocked: callback on the loop thread, then CancelledError', ok3 and c3 and calls == ['MainThread'], calls)

    # 4. deadline overflow of a harness wait is INVALID_CAPTURE (yield_until max_yields)
    fch = FakeCh()
    cfg = {'case': 'X', 'case_input': {'driver_mode': 'async', 'diag_calls': [
        {'step': 1, 'api': 'own.new', 'class': 'OwnBox', 'as': 'b'},
        {'step': 2, 'api': 'loop.yield_until', 'probe': {'path': ['b', '._items'], 'fn': 'len', 'equals': 5}, 'max_yields': 20}]}}
    interp = DRV.Interp(cfg, fch, 'diag2b')
    try:
        asyncio.run(interp.run_async())
        refused = False
    except H.CaptureFailure:
        refused = True
    check('ASYNC 4 / E2B-14: yield_until past max_yields is a capture failure', refused and fch.ms('YIELD_UNTIL')[-1].get('ok') is False)

    # 5. yield_until with a probe that raises before the first waiter: 'not yet' until the value appears
    class Late:
        def __init__(self):
            self._waiters = None

    async def flow5():
        x = Late()
        fch5 = FakeCh()
        it = DRV.Interp({'case': 'X', 'case_input': {'driver_mode': 'async', 'diag_calls': []}}, fch5, 'diag2b')
        it.names['x'] = x

        async def later():
            await asyncio.sleep(0)
            await asyncio.sleep(0)
            x._waiters = [1]
        asyncio.ensure_future(later())
        await it.yield_until({'step': 1, 'probe': {'path': ['x', '._waiters'], 'fn': 'len', 'equals': 1}, 'max_yields': 100})
        return fch5.ms('YIELD_UNTIL')
    y = asyncio.run(flow5())
    check('ASYNC 5: yield_until counts a raising probe as not yet and ends when the value appears', y and y[-1]['value'] == 1 and y[-1]['yields'] >= 2, y)


# ================================================================================================ CAP-2B-PEER-BEFORE-REPLY
def t_before_reply():
    rules = [{'match': {'method': 'a'}, 'before_reply': [{'notification': {'method': 'n1', 'params': {}}}], 'reply': {'result': {}}},
             {'match': {'method': 'b'}, 'before_reply': [{'notification': {'method': 'n2', 'params': {}}}], 'hold': 'until_RELEASE_REPLY', 'reply': {'result': {}}}]
    s = RPC.ScriptV2({'version': 2, 'unscripted_error': {'code': -32601, 'message': 'x', 'data': {}}, 'on_request': rules})
    _, ops_a = s.plan({'id': '1', 'method': 'a'})
    _, ops_b = s.plan({'id': '2', 'method': 'b'})
    check('BEFORE-REPLY 1: frames queued before the reply, marker between them; with hold the reply is held',
          [o[0] for o in ops_a] == ['write', 'before_reply_done', 'write'] and ops_a[0][2] == 'notification' and ops_a[2][2] == 'reply'
          and [o[0] for o in ops_b] == ['write', 'before_reply_done', 'hold'] and ops_b[1][1:] == (1, 1, len(ops_b[0][3])), [o[:2] for o in ops_a + ops_b])
    # 2. evaluator ledger check: right order passes, inverted order refused (negative control)
    c = {'case_input': {'peer_script': {'version': 2, 'unscripted_error': {'code': -32601, 'message': 'x', 'data': {}}, 'on_request': rules[:1]}}}
    req = b'{"id": "1", "method": "a"}\n'
    note = b'{"method":"n1","params":{}}\n'
    rep = b'{"id":"1","result":{}}\n'
    for order, want in (((note, rep), True), ((rep, note), False)):
        logs = synth_logs(req, b''.join(order), [{'rule': 0, 'frames': 1, 'bytes': len(note)}])
        got, _ = ACC.before_reply_order(c, logs)
        check('BEFORE-REPLY 2: ledger order %s -> %s' % ('frames,reply' if want else 'reply,frames (negative control)', want), got is want)


def synth_logs(stdin, stdout, before_written=()):
    """Minimal RoleLogs built through the observer from synthetic frames (one adapter, one peer)."""
    base = {'nonce': 'b' * 40, 'source_sha256': 'c' * 64, 'pid_namespace': 'pid:[1]', 'case_input_sha256': 'd' * 64}
    logs = {}
    for role in ('driver', 'adapter', 'peer'):
        logs[role] = OBS.RoleLog(role, {'attempt': 'a' * 40, 'case': 'X', 'nonce': 'b' * 40, 'source_sha256': 'c' * 64})
    seqs = {'driver': 0, 'adapter': 0, 'peer': 0}

    def put(role, kind, data):
        f = {'v': 1, 'attempt': 'a' * 40, 'case': 'X', 'role': role, 'seq': seqs[role], 'kind': kind, 'pid': 1, 'mono_ns': str(seqs[role] + 1), 'data': data}
        seqs[role] += 1
        p = CH.dumps(f).encode()
        logs[role].feed(len(p).to_bytes(4, 'big') + p, seqs[role])
    begins = {'driver': dict(base, dependency_identity=None), 'adapter': dict(base, argv_tail=[], cwd='/work', env={}), 'peer': base}
    for role in ('driver', 'adapter', 'peer'):
        put(role, 'BEGIN', begins[role])
        put(role, 'READY', {})
    for stream, data in (('stdin', stdin), ('stdout', stdout)):
        off = 0
        while off < len(data):
            chunk = data[off:off + 2048]
            put('adapter', 'RAW_READ', {'stream': stream, 'offset': off, 'base64': base64.b64encode(chunk).decode(), 'sha256': hashlib.sha256(chunk).hexdigest()})
            put('adapter', 'FORWARD_COMMIT', {'stream': stream, 'offset': off, 'bytes': len(chunk)})
            off += len(chunk)
    for b in before_written:
        put('peer', 'PEER_MILESTONE', {'milestone': 'BEFORE_REPLY_WRITTEN', 'detail': b})
    return logs


# ================================================================================================ CAP-2B-PROC-WITNESS
def t_proc_witness():
    # 1. launcher: argv tail preserved in the execv
    seen = {}
    fake_os = type('fos', (), {'execv': staticmethod(lambda path, argv: seen.update(path=path, argv=argv))})
    src = (PY / 'adapter-python-exec').read_text()
    old_argv = sys.argv
    real = sys.modules['os']
    # The launcher's own `import os` resolves through sys.modules: the real execv is never reachable from this test.
    sys.modules['os'] = fake_os
    sys.argv = ['/profile/adapter-python-exec', '--config', 'k="v"', 'app-server', '--listen', 'stdio://']
    try:
        exec(compile(src, 'adapter-python-exec', 'exec'), {'__name__': '__main__'})
    finally:
        sys.modules['os'] = real
        sys.argv = old_argv
    check('PROC 1: launcher execv of the frozen tuple with sys.argv[1:] preserved; shebang #!/runtime/python -IS',
          src.startswith('#!/runtime/python -IS\n') and seen.get('path') == '/runtime/python'
          and seen.get('argv') == ['/runtime/python', '-I', '-S', '/profile/adapter-python.py', '--config', 'k="v"', 'app-server', '--listen', 'stdio://'], seen)
    # 2. adapter fault: SIGTERM becomes a counted fault and the relay continues; SIGINT is still a signal
    st = {'signal': None, 't': None, 'sigterm_ignored': 0}
    h = ADP.signal_handler(st, True)
    h(signal.SIGTERM, None)
    after_term = dict(st)
    h(signal.SIGINT, None)
    st2 = {'signal': None, 't': None, 'sigterm_ignored': 0}
    ADP.signal_handler(st2, False)(signal.SIGTERM, None)
    check('PROC 2: with ignore_sigterm a SIGTERM is only counted (FAULT later), without it it terminates', after_term['signal'] is None
          and after_term['sigterm_ignored'] == 1 and st['signal'] == signal.SIGINT and st2['signal'] == signal.SIGTERM)
    src_a = (PY / 'adapter-python.py').read_text()
    check('PROC 2b: the adapter emits FAULT sigterm_ignored once from the main loop and the fault is read only from case_input.adapter.fault',
          "ch.emit('FAULT', {'fault': 'sigterm_ignored'})" in src_a and "fault if fault == 'ignore_sigterm' else None" in src_a)

    # 3. classifier of the two forms with negative controls; the Popen returncode never enters it
    def logs_form(sig=None, end_complete=None, fault=None, peer_signal=None):
        logs = synth_logs(b'', b'')
        a, p = logs['adapter'], logs['peer']
        a.signal, a.fault = sig, fault
        if end_complete is not None:
            a.events.append({'kind': 'END', 'data': {'complete': end_complete}})
            a.terminal = 'END'
        p.signal = peer_signal
        return logs
    t15 = {'termination': {'adapter': {'absent': True}}}
    t9 = {'termination': {'adapter': {'zombie_exit_code': 9}}}
    f1, _ = ACC.termination_form(logs_form('SIGTERM', False, None, 'SIGTERM'), t15)
    f2, _ = ACC.termination_form(logs_form(None, None, 'sigterm_ignored'), t9)
    n1, _ = ACC.termination_form(logs_form(None, False, None, 'SIGTERM'), t15)  # SIGTERM without SIGNAL
    n2, _ = ACC.termination_form(logs_form(None, True, 'sigterm_ignored'), t9)  # END present with SIGKILL
    n3, _ = ACC.termination_form(logs_form('SIGTERM', False, None, 'SIGTERM'), {'termination': {'adapter': {'zombie_exit_code': 9}}})
    check('PROC 3: CLIENT_TERMINATED_SIGTERM and CLIENT_KILLED_SIGKILL classified; negative controls refused',
          f1 == 'CLIENT_TERMINATED_SIGTERM' and f2 == 'CLIENT_KILLED_SIGKILL' and n1 is None and n2 is None and n3 is None, [f1, f2, n1, n2, n3])
    import inspect
    body = inspect.getsource(ACC.termination_form).split('"""', 2)[-1]
    check('PROC 3b / E2B-03: termination_form reads no Popen returncode (only OS tracker and channel frames)',
          'returncode' not in ACC.termination_form.__code__.co_names and 'returncode' not in body and 'popen' not in body.lower())
    # 4. a /proc read before the adapter BEGIN is refused and recorded as a capture failure
    att = object.__new__(SUP.Attempt)
    att.logs = synth_logs(b'', b'')
    att.logs['adapter'].begin = None
    att.role_host, att.proc_witnesses, att.actions, att.gidx, att.t0 = {}, [], [], 0, time.monotonic_ns()
    rec = att.proc_witness('selftest', force_before_begin=False)
    check('PROC 4: read before the adapter BEGIN refused and recorded (proc.witness_recorded)', rec['read'] is False and rec['ok'] is False
          and att.actions[-1]['action'] == 'PROC_WITNESS', rec)


# ================================================================================================ D2B-11 barrier plan
def t_barrier_plan():
    check('D2B-11 every barrier step of every slot and own DIAG has exactly one plan entry', SUP.plan_check() == [], SUP.plan_check())
    att = object.__new__(SUP.Attempt)
    att.logs = synth_logs(b'', b'')
    d = att.logs['driver']
    d.events.append({'kind': 'DIAGNOSTIC', 'seq': 99, 'data': {'milestone': 'STEP_WITNESS', 'detail': {'step': 77, 'id': 'x', 'kind': 'BARRIER'}}})
    att.plan, att.barrier_state, att.done, att.admission_fail, att.actions, att.gidx, att.t0 = {}, {}, set(), [], [], 0, time.monotonic_ns()
    att.case, att.unit = 'SELFTEST', 'none.service'
    att.systemctl = lambda *a, **k: type('r', (), {'returncode': 0})()
    att.run_plan()
    check('D2B-11 a STEP_WITNESS outside the plan stops the unit before any release (INVALID)', bool(att.admission_fail)
          and att.actions[-1]['action'] == 'PLAN_STOP', att.admission_fail)
    # release before its gate -> barrier.witnesses_in_order false (capture class -> INVALID_CAPTURE)
    c = case1('2B-PY01C')
    w = {'plan': {'3': {'gate': [], 'actions': [['STEP_RELEASE', []]]}},
         'actions': [{'action': 'CONTROL', 'gidx': 5, 'detail': {'command': 'STEP_RELEASE', 'step': 3}},
                     {'action': 'BARRIER_GATE', 'gidx': 6, 'detail': {'step': 3}}]}
    logs = synth_logs(b'', b'')
    logs['driver'].events.append({'kind': 'DIAGNOSTIC', 'seq': 9, 'data': {'milestone': 'STEP_WITNESS', 'detail': {'step': 3}}})
    w['frame_gidx'] = {'driver': list(range(1, len(logs['driver'].events) + 1)), 'adapter': [], 'peer': []}
    seq = ACC.Seq(logs, w)
    ok, det = ACC.barrier_order(c, logs, w, seq)
    check('D2B-11 a release before its gate fails barrier.witnesses_in_order (class capture_order_or_cleanup)', ok is False
          and ACC.class_of('barrier.witnesses_in_order') == 'capture_order_or_cleanup', det)


# ================================================================================================ D2B-12 / D2B-13
def fake_server_script():
    SCRATCH.mkdir(parents=True, exist_ok=True)
    p = SCRATCH / 'fake_server.py'
    p.write_text('''import json, signal, sys, threading, time
cfg = json.loads(sys.argv[1])
if cfg.get('ignore_sigterm'):
    signal.signal(signal.SIGTERM, signal.SIG_IGN)
lock = threading.Lock()
def out(obj):
    with lock:
        sys.stdout.write(json.dumps(obj) + "\\n"); sys.stdout.flush()
def answer(msg, rule):
    time.sleep(rule.get('delay', 0))
    out({'id': msg['id'], 'result': rule.get('result', {})})
for line in sys.stdin:
    msg = json.loads(line)
    if 'id' not in msg:
        continue
    rule = cfg['rules'].get(msg['method'], {'result': {}})
    for n in rule.get('before', []):
        out({'method': n, 'params': {}})
    threading.Thread(target=answer, args=(msg, rule), daemon=True).start()
time.sleep(10)  # like the adapter waiting for its peer after stdin EOF: only a signal ends it early
''')
    return p


def run_offline(row, server_cfg):
    """Run an own-code DIAG row offline: the interpreter + harness2b + own2b, a local fake server in place of adapter+peer."""
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
        if 'env' in kw:
            kw['env'] = {k: v for k, v in kw['env'].items() if k != 'LANG'}
    try:
        DRV.run_2b(cfg, fch, 'diag2b')
        err = None
    except BaseException as exc:  # noqa: BLE001
        err = '%s: %s\n%s' % (type(exc).__name__, exc, traceback.format_exc()[-600:])
    finally:
        DRV.LAUNCH = old
        threading.setprofile(None)
        sys.setprofile(None)
    return fch, err


def t_offline_flows():
    rows = SUP.DIAG_ROWS
    fch, err = run_offline(rows['DIAG-PY-BARRIER'], {'rules': {'initialize': {}, 'own/held': {'result': {'held': True}, 'delay': 0.2}}})
    res = {e['api']: e['result'] for e in fch.kinds('API_RESULT')}
    gen = sorted((e['event'], e['occurrence']) for e in fch.kinds('HOOK_EVENT') if e['id'] == 'h_gen')
    check('OFFLINE DIAG-PY-BARRIER flow through the interpreter (eof close epilogue, workers, hooks, excepthook)', err is None
          and fch.ms('CALLS_DONE') and res.get('21:excepthook.snapshot') == [{'thread_name': 'cvg-own-raiser', 'class': 'builtins.RuntimeError', 'str': 'own raise t'}]
          and gen == [('call', 1), ('call', 2), ('call', 3), ('return', 1), ('return', 2), ('return', 3)]
          and fch.controls.count('STEP_RELEASE') == 1 and fch.controls[-1] == 'RELEASE_EXIT', {'err': err, 'controls': fch.controls})
    fch, err = run_offline(rows['DIAG-PY-ASYNC'], {'rules': {'initialize': {'delay': 0.3}, 'own/a': {'result': {'a': 1}},
                                                             'own/slow': {'result': {'slow': True}, 'delay': 0.4}, 'own/start': {'result': {'started': 'L'}, 'delay': 0.3}}})
    canc = [e['message'] for e in fch.kinds('API_CANCELLED')]
    sub = [e for e in fch.kinds('HOOK_EVENT') if e['id'] == 'h_sub_close']
    check('OFFLINE DIAG-PY-ASYNC flow (tasks, yield_until, block_release_wait_cancel, aclose epilogue)', err is None and fch.ms('CALLS_DONE')
          and canc == ['12:task.await', '17:task.await'] and len(sub) == 1 and sub[0]['thread_name'] == 'MainThread'
          and sub[0]['record'] == {'self.label': 'L', 'self._closed': True, 'thread_name': 'MainThread'}, {'err': err, 'cancelled': canc, 'sub': sub})
    fch, err = run_offline(rows['DIAG-PY-BEFOREREPLY'], {'rules': {'initialize': {}, 'own/early': {'before': ['own/n1', 'own/n2'], 'result': {'early': True}},
                                                                   'own/heldearly': {'before': ['own/n3'], 'result': {'held': True}, 'delay': 0.2}}})
    pr = {e['id']: e['value'] for e in fch.kinds('PROBE')}
    check('OFFLINE DIAG-PY-BEFOREREPLY flow (reader order probe)', err is None and pr.get('reader_order') == [['r', 'initialize'], ['n', 'own/n1'], ['n', 'own/n2'],
                                                                                                          ['r', 'own/early'], ['n', 'own/n3'], ['r', 'own/heldearly']],
          {'err': err, 'probe': pr})
    fch, err = run_offline(rows['DIAG-PY-CLOSETERM'], {'rules': {'initialize': {}}})
    pr = {e['id']: e['value'] for e in fch.kinds('PROBE')}
    check('OFFLINE DIAG-PY-CLOSETERM flow (SDK close sequence -> -15; close_if_open epilogue)', err is None and pr.get('returncode_after_close') == -15
          and not [e for e in fch.kinds('HOOK_EVENT') if e['id'] == 'h_kill'] and fch.ms('CALLS_DONE'), {'err': err, 'probe': pr})
    fch, err = run_offline(rows['DIAG-PY-KILLWAIT'], {'rules': {'initialize': {}}, 'ignore_sigterm': True})
    pr = {e['id']: e['value'] for e in fch.kinds('PROBE')}
    res = {e['api']: e['result'] for e in fch.kinds('API_RESULT')}
    hk = sorted({e['id'] for e in fch.kinds('HOOK_EVENT')})
    marks = {m['id']: m['mono_ns'] for m in fch.ms('CLOCK_MARK')}
    check('OFFLINE DIAG-PY-KILLWAIT flow (TimeoutExpired, kill without wait, returncode None, reap -9)', err is None
          and pr.get('returncode_right_after_close') is None and 'returncode_right_after_close' in pr and res.get('11:driver.reap') == -9
          and hk == ['h_kill', 'h_timeout'] and marks['after_close'] - marks['before_close'] >= 2_000_000_000, {'err': err, 'probe': pr, 'hooks': hk})
    # D2B-12: the three epilogue forms with an own client
    for kind in DRV.EPILOGUES:
        mode = 'async' if kind.endswith('aclose') else None
        cls = 'OwnAsync' if mode else 'OwnClient'
        calls = [{'step': 1, 'api': 'own.new', 'class': cls, 'kwargs': {'launch': '$LAUNCH', 'cwd': '/work'}, 'as': 'o'}]
        if mode:
            calls.append({'step': 2, 'api': 'call', 'on': 'o', 'method': 'call', 'args': ['own/a'], 'await': True})
        else:
            calls += [{'step': 2, 'api': 'call', 'on': 'o', 'method': 'start'}, {'step': 3, 'api': 'call', 'on': 'o', 'method': 'initialize'}]
        calls.append({'step': len(calls) + 1, 'api': 'epilogue', 'kind': kind})
        row = {'diag_calls': calls}
        if mode:
            row['driver_mode'] = 'async'
        fch, err = run_offline(row, {'rules': {'initialize': {}, 'own/a': {'result': {'a': 1}}}})
        closed = fch.ms('SDK_CLIENT_CLOSED')
        eof = bool(fch.ms('CLIENT_STDIN_CLOSED'))
        check('D2B-12 epilogue %s with an own client' % kind, err is None and closed and eof == kind.startswith('eof_')
              and fch.controls[-1] == 'RELEASE_EXIT' and closed[0]['returncode'] is not None, {'err': err, 'closed': closed})


def t_control_client():
    c = case1('2B1-CTRL01')
    s = RPC.ScriptV2(c['case_input']['peer_script'])
    lines = c['case_input']['control_client']['lines']
    outs = []
    for obj in lines:
        if 'id' in obj:
            rule, ops = s.plan(obj)
            outs.append((obj['id'], rule, [o[0] for o in ops], [o[2] for o in ops if o[0] == 'write']))
    check('D2B-13 CTRL01 script against the own peer plan: ctrl-2 frame before the reply, ctrl-3 unscripted error',
          outs == [('ctrl-1', 0, ['write'], ['reply']), ('ctrl-2', 1, ['write', 'before_reply_done', 'write'], ['notification', 'reply']),
                   ('ctrl-3', None, ['write'], ['unscripted_error'])], outs)
    oc = object.__new__(CC.OwnClient)
    oc.lines = queue.Queue()
    for raw in (b'{"method":"turn/started","params":{}}\n', b'{"id":"ctrl-2","result":{}}\n'):
        oc.lines.put(raw)
    line, before = oc.wait_reply('ctrl-2', 1)
    check('D2B-13 control client records the notifications received before each reply', line == b'{"id":"ctrl-2","result":{}}\n'
          and before == [('turn/started', b'{"method":"turn/started","params":{}}\n')])


# ================================================================================================ E2B clauses
def t_e2b():
    check('E2B-02 jeq: -0.0 == 0.0, 1 == 1.0, True != 1, None only None',
          ACC.jeq(-0.0, 0.0) and ACC.jeq(1, 1.0) and not ACC.jeq(True, 1) and not ACC.jeq(None, 0) and not ACC.jeq('1', 1))
    chains = []
    for doc in (DOC1, DOC2):
        for c in doc['cases']:
            exp = c.get('expected', {})
            chains += list(exp.get('order', [])) + list((exp.get('wire') or {}).get('order', []))
            chains += [[h[k]] for h in exp.get('hooks', []) for k in ('before', 'after', 'during') if k in h]
    check('E2B-04 every frozen chain of the two sub-lots parses with the token grammar', bool(chains) and all(ACC.parse_chain(ch) for ch in chains),
          {'chains': len(chains), 'bad': [ch for ch in chains if not ACC.parse_chain(ch)]})
    # E2B-11: TurnStartResponse subset and NOTE with dump
    dump = {'turn': {'id': 'B11', 'items': [], 'status': 'inProgress', 'error': None}}
    check('E2B-11 TurnStartResponse compared as alias-path subset', ACC.result_matches({'turn.id': 'B11', 'turn.status': 'inProgress'}, dump)
          and not ACC.result_matches({'turn.id': 'X'}, dump))
    note = {'NOTE': True, 'method': 'turn/completed', 'payload_class': 'TurnCompletedNotification', 'dump': {'threadId': 't', 'turn': {'id': 'A'}}}
    check('E2B-11 NOTE: fields by subset and dump by full jeq', ACC.result_matches({'method': 'turn/completed', 'payload_class': 'TurnCompletedNotification',
                                                                                  'fields': {'turn.id': 'A'}, 'dump': {'threadId': 't', 'turn': {'id': 'A'}}}, note)
          and not ACC.result_matches({'method': 'turn/completed', 'payload_class': 'TurnCompletedNotification', 'dump': {'threadId': 't'}}, note))
    # E2B-13 with 2B-PY01A: initialized present, '*' except initialize absent
    c = case1('2B-PY01A')
    cl, _ = ACC.wire_lines(b'{"id": "u", "method": "initialize", "params": {}}\n{"method": "initialized"}\n')
    ok1, _ = ACC.absent_ok(cl, c['expected']['wire']['absent'])
    cl2, _ = ACC.wire_lines(b'{"id": "u", "method": "initialize"}\n{"method": "initialized"}\n{"id": "v", "method": "model/list"}\n')
    ok2, _ = ACC.absent_ok(cl2, c['expected']['wire']['absent'])
    check('E2B-13 R3-12 with 2B-PY01A: the initialized notification does not violate "*" except initialize; a request does', ok1 and not ok2)
    # E2B-07 ValidationError detail (shared with 2B-2)
    det = {'class': 'pydantic_core._pydantic_core.ValidationError', 'error_count': 2, 'errors': [{'type': 'missing', 'loc': ['a', 'b']}, {'type': 'extra_forbidden', 'loc': ['c']}]}
    check('E2B-07 first_error, error_count and errors_contain (loc and loc_suffix)', ACC.error_matches(
        {'class': det['class'], 'first_error': {'type': 'missing', 'loc': ['a', 'b']}, 'error_count': 2,
         'errors_contain': [{'type': 'extra_forbidden', 'loc': ['c']}, {'type': 'missing', 'loc_suffix': ['b']}]}, det))
    # E2B-09 timing minimum and E2B-14 classification table (R2-F04)
    check('R2-F04 classification of the waits recorded per step (CLIENT_EFFECT only for 2B-PY11B step 8 and 2B-PY02A step 12)',
          SUP.wait_classes('2B-PY11B')['8']['class'] == 'CLIENT_EFFECT' and SUP.wait_classes('2B-PY02A')['12']['class'] == 'CLIENT_EFFECT'
          and SUP.wait_classes('2B-PY08X')['12']['class'] == 'HARNESS_PRECONDITION' and SUP.wait_classes('2B-PY12A')['12']['class'] == 'HARNESS_PRECONDITION'
          and DRV.CLIENT_EFFECT_WAITS == ACC.CLIENT_EFFECT_WAITS)
    summ, _ = H.summary_v2((OWN.OwnSubscription('a'), {'k': 1}, [1, (2, 3)], {'bad': object()}))
    check('E2B-11 summary_v2 never raises on composite results (tuples summarized element-wise; unserializable marked)',
          summ == [{'class': 'OwnSubscription'}, {'k': 1}, [1, [2, 3]], {'class': 'dict', 'unserializable': True}], summ)
    check('E2B-05 identity tokens retained until the driver exits (keep list) and emitted with worker results',
          'self.keep.append(val)' in (PY / 'python-driver.py').read_text() and "'identity': id(val)" in (PY / 'python-driver.py').read_text())


# ================================================================================================ R2-F01 (binding)
def t_r2_f01():
    """Own call+return hooks called twice; the frozen expected.hooks of 2B-PY13D must match under (id, event) counting."""
    def cleanup_cancelled_start():
        def stop_cancelled_goal():
            return None
        return stop_cancelled_goal()
    stop_code = [x for x in cleanup_cancelled_start.__code__.co_consts if hasattr(x, 'co_name') and x.co_name == 'stop_cancelled_goal'][0]
    hs = H.HookSet()
    codes = {'a': cleanup_cancelled_start.__code__, 'b': stop_code}
    hs.install([{'id': 'h_cleanup_cb', 'code': 'a', 'event': 'call+return', 'record': ['thread_name']},
                {'id': 'h_stop', 'code': 'b', 'event': 'call+return', 'record': ['thread_name']}], lambda p: codes[p])

    def as_thread(name, fn):
        t = threading.Thread(target=fn, name=name)
        t.start()
        t.join()
    as_thread('codex-goal-start', lambda: None)
    # first call: cleanup in codex-goal-start, stop in codex-goal-start-cleanup; second cleanup call without stop
    as_thread('codex-goal-start', lambda: (hs._record(hs.hooks['h_cleanup_cb'], FakeFrame(), 'call'), hs._record(hs.hooks['h_cleanup_cb'], FakeFrame(), 'return')))
    as_thread('codex-goal-start-cleanup', lambda: (hs._record(hs.hooks['h_stop'], FakeFrame(), 'call'), hs._record(hs.hooks['h_stop'], FakeFrame(), 'return')))
    as_thread('codex-goal-start', lambda: (hs._record(hs.hooks['h_cleanup_cb'], FakeFrame(), 'call'), hs._record(hs.hooks['h_cleanup_cb'], FakeFrame(), 'return')))
    hs.stop()
    rows = hs.events
    gidx = list(range(10, 10 + len(rows)))
    seq = type('Q', (), {})()
    seq.hook_events = [dict(e, gidx=g) for e, g in zip(rows, gidx)]
    seq.tokens = {'RELEASE_REPLY:thread/goal/set@t13d1#1': 1, 'RELEASE_REPLY:thread/goal/set@t13d2#1': 13}
    seq.hook_event_kind = lambda hid, decl: ACC.Seq.hook_event_kind(None, hid, decl)
    seq.lookup = lambda tok, decl: seq.tokens.get(tok)
    c13d = [c for c in DOC2['cases'] if c['id'] == '2B-PY13D'][0]
    decl = ACC.hooks_declared(c13d)
    ok_pos = all(ACC.hook_entry_matches(seq, e, decl) for e in c13d['expected']['hooks'])
    # negative control: global counting per id (call and return mixed) gives occurrence 2 to the first return
    glob = []
    cnt = {}
    for e in rows:
        cnt[e['id']] = cnt.get(e['id'], 0) + 1
        glob.append(dict(e, occurrence=cnt[e['id']]))
    seq.hook_events = [dict(e, gidx=g) for e, g in zip(glob, gidx)]
    ok_neg = all(ACC.hook_entry_matches(seq, e, decl) for e in c13d['expected']['hooks'])
    check('R2-F01 (1)(2): call+return hook called twice matches the frozen expected.hooks of 2B-PY13D counted per (id, event)', ok_pos,
          [(e['id'], e['event'], e['occurrence'], e['thread_name']) for e in rows])
    check('R2-F01 negative control: global per-id counting does not match the frozen expectation', not ok_neg)
    src = (PY / 'harness2b.py').read_text()
    check('R2-F01 (1): the driver harness, the D2B-15 frame and the evaluator token count per (id, event)',
          "key = (h.id, event)" in src and "'HOOK:%s:%s#%d'" in (PY / 'acceptance.py').read_text())
    val = json.loads((UNIT / 'validation-unit.json').read_text()) if (UNIT / 'validation-unit.json').exists() else {}
    check('R2-F01 (3) / R2-F03 / R2-F07: unit validator passes with every negative control refused', val.get('ok') is True
          and all(val.get('negative_controls_refused', {}).values()) and 'occurrence_without_event' in val.get('negative_controls_refused', {}))


class FakeFrame:
    f_locals = {}


# ================================================================================================ R2-F02
def t_r2_f02():
    t = threading.Thread(target=lambda: None, name='cvg-finished-thread')
    t.start()
    t.join()
    fch = FakeCh()
    it = DRV.Interp({'case': 'X', 'case_input': {'diag_calls': []}}, fch, 'diag2b')
    it.thread_join({'step': 1, 'api': 'thread.join', 'thread_name': 'cvg-finished-thread', 'timeout_s': 1})
    tj = fch.ms('THREAD_JOIN')[-1]
    check('R2-F02 thread.join by name: a name with no live thread counts as already finished (no failure, no wait)', tj['found'] is False
          and tj['alive_after'] is False and tj['elapsed_ms'] < 50, tj)


def t_sdk_steps_static():
    """D2B-02 over every SDK slot without the SDK: dispatch, references defined before use, mapped texts and closed lists."""
    problems = []
    for c in DOC1['cases']:
        if c['kind'] != 'SDK':
            continue
        names, handles, tasks, workers = set(), set(), set(), set()
        steps = c['case_input']['sdk_calls']
        mode = c['case_input'].get('driver_mode')
        for i, st in enumerate(steps):
            api = st['api']

            def need(cond, why):
                if not cond:
                    problems.append('%s step %d (%s): %s' % (c['id'], st['step'], api, why))
            need(st['step'] == i + 1, 'step numbering')
            if api.endswith('.new'):
                need(api in ('Codex.new', 'AsyncCodex.new', 'CodexClient.new', 'Thread.new', 'AsyncThread.new', 'TurnHandle.new'), 'constructor')
                if 'config' in st:
                    need(set(st['config']) <= {'launch_args_override', 'cwd', 'env', 'codex_bin', 'config_overrides'}, 'config keys')
                for ref in ('client', 'codex'):
                    if ref in st:
                        need(st[ref] in names, 'unknown %s' % ref)
                if 'as' in st:
                    names.add(st['as'])
            elif api in ('call', 'attr'):
                need(st['on'].split('.')[0] in names, 'unknown on %s' % st['on'])
                need(api == 'attr' or (st.get('await') is True) == (mode == 'async' and st.get('await', False)), 'await only in async slots')
                for k, v in (st.get('kwargs') or {}).items():
                    need(k != 'response_model' or v in DRV.RESPONSE_MODELS, 'response_model %s' % v)
                for a in st.get('args', []):
                    if isinstance(a, dict) and '$ref' in a:
                        need(a['$ref'] in names, 'unknown $ref')
                if st.get('as'):
                    names.add(st['as'])
                    handles.add(st['as'])
            elif api in ('stream.next', 'astream.next', 'astream.aclose'):
                need(st['handle'] in names, 'unknown handle')
                need((api == 'stream.next') == (mode != 'async'), 'stream kind by mode')
            elif api in ('probe', 'probe.until', 'proc.retain'):
                root = st['path'][0]
                need(root in names or root.startswith('$hook:') or root.startswith('$task:'), 'unknown probe root %s' % root)
                if root.startswith('$task:'):
                    need(root[6:] in tasks, 'unknown task')
                if api == 'probe':
                    need(st['fn'] in ('value', 'len', 'keys', 'is_none', 'type_name', 'enum_value', 'equals_driver_environ', 'done')
                         or st['fn'].split(':')[0] in ('hasattr', 'vars_has', 'is_ref'), 'probe fn')
                if api == 'proc.retain':
                    names.add(st['as'])
            elif api == 'worker.start':
                sub = st['call']
                need(sub['api'] in ('call', 'stream.next'), 'worker call api')
                need((sub.get('on') or sub.get('handle', '')).split('.')[0] in names, 'worker target')
                workers.add(st['name'])
                if sub.get('as'):
                    names.add(sub['as'])
            elif api in ('worker.parked', 'worker.join', 'worker.still_parked'):
                need(set(st['names']) <= workers, 'unknown worker')
                need(st.get('park_point') is None or st['park_point'] in DRV.PARK_POINTS, 'park_point not mapped')
            elif api == 'task.create':
                need(mode == 'async' and st['call']['on'].split('.')[0] in names, 'task call')
                tasks.add(st['name'])
            elif api in ('task.cancel', 'task.await'):
                need(st['name'] in tasks, 'unknown task')
            elif api == 'loop.block_release_wait_cancel':
                need(st['cancel'] in tasks, 'cancel task')
            elif api == 'hook.install':
                need(i == 0 or steps[0]['api'] == 'excepthook.install', 'hooks first')
                need(st.get('precondition') is None or st['precondition'] in DRV.HOOK_PRECONDITIONS, 'precondition not mapped')
            elif api == 'driver.reap':
                need(st['of'] in names, 'reap target')
            elif api == 'thread.join':
                need(st['path'][0] in names, 'thread path')
            elif api == 'epilogue':
                need(i == len(steps) - 1 and st['kind'] in DRV.EPILOGUES, 'epilogue last and known')
                need(not st['kind'].endswith('aclose') or mode == 'async', 'aclose only in async')
            elif api == 'async_with.enter':
                need(st['on'] in names and mode == 'async', 'async with target')
    check('D2B-02 static audit of every SDK slot (dispatch, references before use, mapped park points and preconditions, closed lists)',
          not problems, problems[:12])
    ps = []
    for text, (path, rule) in DRV.PARK_POINTS.items():
        ps.append(text.startswith(path) and ('line_text' in rule or 'caller' in rule))
    check('PARK_POINTS: every frozen park_point text of the 2B-1 cases is mapped to a code path and a parking rule',
          all(ps) and {st['park_point'] for c in DOC1['cases'] for st in c['case_input'].get('sdk_calls', []) if st.get('park_point')} == set(DRV.PARK_POINTS))
    src = Path('/mnt/dados/cvg-work/cvg-codex100-batch2b1-runtime-20261019/sdk-python/openai_codex/client.py')
    if src.exists():
        lines = src.read_text().split('\n')
        hits = [n for n, ln in enumerate(lines, 1) if 'with entry.lock:' in ln]
        check('PARK_POINTS: the line text of _thread_start_lock exists once in the staged (admitted) client.py', len(hits) == 1, hits)


def main():
    if SCRATCH.exists():
        shutil.rmtree(SCRATCH)
    SCRATCH.mkdir(parents=True)
    for t in (t_ids_and_counts, t_vocabulary_and_r3_12, t_kinds_per_role, t_conc_barrier, t_async_driver, t_before_reply, t_proc_witness,
              t_barrier_plan, t_offline_flows, t_control_client, t_e2b, t_r2_f01, t_r2_f02, t_sdk_steps_static):
        try:
            t()
        except Exception as exc:  # noqa: BLE001
            check(t.__name__ + ' raised', False, '%s: %s %s' % (type(exc).__name__, exc, traceback.format_exc()[-800:]))
    srcs = {p.relative_to(UNIT).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in sorted(list(PY.glob('*.py')) + [PY / 'adapter-python-exec', Path(__file__).resolve(), UNIT / 'tools' / 'validate_unit.py'])}
    doc = {'kind': 'OFFLINE_SELFTESTS_2B1', 'sdk_imported': any(m.split('.')[0] in ('openai_codex', 'pydantic') for m in sys.modules),
           'services': 0, 'network': False, 'passed': sum(1 for r in RESULTS if r['ok']), 'failed': sum(1 for r in RESULTS if not r['ok']),
           'results': RESULTS, 'sources_sha256': srcs}
    (HERE / 'selftest-results.json').write_text(json.dumps(doc, ensure_ascii=False, indent=2) + '\n')
    shutil.rmtree(SCRATCH, ignore_errors=True)
    print(json.dumps({'passed': doc['passed'], 'failed': doc['failed'], 'sdk_imported': doc['sdk_imported'],
                      'failed_tests': [[r['test'], str(r['detail'])[:400]] for r in RESULTS if not r['ok']]}, ensure_ascii=False, indent=1))
    return 0 if doc['failed'] == 0 and not doc['sdk_imported'] else 1


if __name__ == '__main__':
    sys.exit(main())
