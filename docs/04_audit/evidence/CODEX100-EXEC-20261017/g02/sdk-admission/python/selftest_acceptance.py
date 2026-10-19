"""Pure-data selftest of the acceptance predicates and the new supervisor helpers (host python3.12 -I).

Synthetic captures for the 19 SDK cases are encoded with channel.py, decoded and reconciled by the
independent observer.py and judged by acceptance.py: one positive capture per case plus known-bad and
invalid variants. Also covers EOF barrier, /proc maps classification, staging closure and freeze gates.
No SDK, Pydantic or compiler import; no service; temporary files only under the unit runtime root.
Usage: python3 -I selftest_acceptance.py [<output-dir>]
"""
import sys

sys.dont_write_bytecode = True
import base64  # noqa: E402
import copy  # noqa: E402
import hashlib  # noqa: E402
import importlib.util  # noqa: E402
import json  # noqa: E402
import os  # noqa: E402
import secrets  # noqa: E402
import shutil  # noqa: E402
from pathlib import Path  # noqa: E402

HERE = Path(__file__).resolve().parent
UNIT = HERE.parent


def load(name, mod):
    spec = importlib.util.spec_from_file_location(mod, HERE / name)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


CH = load('channel.py', 'cvg_channel')
OBS = load('observer.py', 'cvg_observer')
ACC = load('acceptance.py', 'cvg_acceptance')
SUP = load('supervisor.py', 'cvg_supervisor')
DRV = load('python-driver.py', 'cvg_python_driver')
RPC = load('fixture-rpc.py', 'cvg_fixture_rpc')
results = []


def check(cid, fn):
    try:
        ok = fn()
        results.append({'id': cid, 'status': 'PASS' if ok is True else 'FAIL', **({} if ok is True else {'got': repr(ok)[:300]})})
    except Exception as exc:  # noqa: BLE001
        results.append({'id': cid, 'status': 'FAIL', 'error': ('%s: %s' % (type(exc).__name__, exc))[:300]})


def rejects(cid, fn):
    try:
        fn()
    except Exception as exc:  # noqa: BLE001
        results.append({'id': cid, 'status': 'PASS', 'rejected': ('%s: %s' % (type(exc).__name__, exc))[:160]})
    else:
        results.append({'id': cid, 'status': 'FAIL', 'error': 'accepted known-bad input'})


A, N = 'a' * 40, 'b' * 40
SRC = {'driver': 'd' * 64, 'adapter': 'e' * 64, 'peer': 'f' * 64}
PID = {'driver': 2, 'adapter': 3, 'peer': 4}
ROWS = json.loads(SUP.fixture_bytes())
U1, U2, U3, U4 = ('1b4e28ba-2fa1-41d2-883f-0016d3cca427', '6ecd8c99-4036-403d-bf84-cf8400f67836',
                  '3f333df6-90a4-4fda-8dd3-9485d27cee36', '9b2e6c4c-4b1a-4e5b-9c1d-2d6f3a1b0c7e')


def sha(b):
    return hashlib.sha256(b).hexdigest()


class Cap:
    """Synthetic but contract-valid capture: frames are encoded by channel.py, judged by observer.py."""

    def __init__(self, case):
        self.case, self.t = case, 1_000_000
        self.frames = {r: [] for r in ('driver', 'adapter', 'peer')}
        self.seq = {r: 0 for r in self.frames}
        self.read = {s: 0 for s in ('stdin', 'stdout', 'stderr')}
        self.hash = {s: hashlib.sha256() for s in self.read}
        self.actions = []
        for r in self.frames:
            self.emit(r, 'BEGIN', {'nonce': N, 'source_sha256': SRC[r], 'pid_namespace': 'pid:[4026532000]'})
            self.emit(r, 'READY', {})
            self.control(r, 'READY')

    def emit(self, role, kind, data):
        self.t += 1000
        e = {'v': 1, 'attempt': A, 'case': self.case, 'role': role, 'seq': self.seq[role], 'kind': kind, 'pid': PID[role],
             'mono_ns': str(self.t), 'data': data}
        self.seq[role] += 1
        self.frames[role].append((CH.encode_frame(e), self.t))

    def control(self, role, command):
        self.t += 1000
        self.actions.append({'t_ns': self.t, 'action': 'CONTROL', 'detail': {'role': role, 'command': command, 'seq': 0}})

    def relay(self, stream, b):
        for off in range(0, len(b), 2048):
            chunk = b[off:off + 2048]
            self.emit('adapter', 'RAW_READ', {'stream': stream, 'offset': self.read[stream], 'base64': base64.b64encode(chunk).decode(), 'sha256': sha(chunk)})
            self.emit('adapter', 'FORWARD_COMMIT', {'stream': stream, 'offset': self.read[stream], 'bytes': len(chunk)})
            self.read[stream] += len(chunk)
            self.hash[stream].update(chunk)

    def summary(self, s):
        return {'read_bytes': self.read[s], 'committed_bytes': self.read[s], 'read_sha256': self.hash[s].hexdigest()}

    def stream_end(self, s):
        self.emit('adapter', 'STREAM_END', dict({'stream': s}, **self.summary(s)))

    def adapter_end(self, code=0, sig=None, complete=True):
        self.emit('adapter', 'END', {'streams': {s: self.summary(s) for s in self.read}, 'child_exit_code': code, 'child_signal': sig, 'complete': complete})

    def logs(self):
        out = {}
        for r, frames in self.frames.items():
            log = OBS.RoleLog(r, {'attempt': A, 'case': self.case, 'nonce': N, 'source_sha256': SRC[r]})
            for fr, t in frames:
                log.feed(fr, t)
            log.finish()
            out[r] = log
        return out


def sdk_line(o):
    return (json.dumps(o) + '\n').encode()


def peer_line(o):
    return (json.dumps(o, separators=(',', ':'), ensure_ascii=False) + '\n').encode()


def client(cap, o, held=False):
    b = sdk_line(o)
    cap.relay('stdin', b)
    method = o.get('method')
    kind = 'request' if method and 'id' in o else 'notification' if method else 'response'
    cap.emit('peer', 'PEER_MILESTONE', {'milestone': 'RECEIVED', 'detail': {'kind': kind, 'method': method, 'bytes': len(b), 'sha256': sha(b)}})
    if held:
        cap.emit('peer', 'REQUEST_HELD', {'bytes': len(b), 'sha256': sha(b)})


def server(cap, o, method):
    b = peer_line(o)
    cap.emit('peer', 'PEER_MILESTONE', {'milestone': 'REPLY_WRITTEN', 'detail': {'method': method, 'bytes': len(b), 'sha256': sha(b)}})
    cap.relay('stdout', b)


def init_req(uid=U1):
    return {'id': uid, 'method': 'initialize', 'params': {'clientInfo': {'name': 'codex_python_sdk', 'title': 'Codex Python SDK', 'version': '0+unknown'},
                                                         'capabilities': {'experimentalApi': True}}}


def init_dump(fx):
    return {'serverInfo': fx['initialize_result']['serverInfo'], 'userAgent': fx['initialize_result'].get('userAgent'), 'platformFamily': None, 'platformOs': None}


def py_finish(cap, eof=True, rc=0, adapter_code=0):
    if eof:
        cap.emit('driver', 'DIAGNOSTIC', {'milestone': 'CLIENT_STDIN_CLOSED', 'detail': {'source_sdk_claim': False}})
        cap.stream_end('stdin')
        cap.emit('peer', 'PEER_MILESTONE', {'milestone': 'STDIN_EOF', 'detail': None})
    cap.emit('driver', 'DIAGNOSTIC', {'milestone': 'CALLS_DONE', 'detail': {'source_sdk_claim': False}})
    cap.control('peer', 'FINISH_PEER')
    cap.emit('peer', 'END', {'streams': {}, 'child_exit_code': 0, 'child_signal': None, 'complete': True})
    cap.stream_end('stdout')
    cap.stream_end('stderr')
    if not eof:
        cap.stream_end('stdin')
    cap.adapter_end(adapter_code)
    cap.control('driver', 'RELEASE_EXIT')
    cap.emit('driver', 'DIAGNOSTIC', {'milestone': 'SDK_CLIENT_CLOSED', 'detail': {'returncode': rc, 'source_sdk_claim': False}})
    cap.emit('driver', 'END', {'streams': {}, 'child_exit_code': None, 'child_signal': None, 'complete': True})


def py_start(case, fx):
    cap = Cap(case)
    client(cap, init_req())
    server(cap, {'id': U1, 'result': fx['initialize_result']}, 'initialize')
    client(cap, {'method': 'initialized'})
    api = 'AsyncCodexClient.initialize' if case == 'SDKPY07' else 'CodexClient.initialize'
    cap.emit('driver', 'API_RESULT', {'api': api, 'result': init_dump(fx), 'observations': {}})
    return cap


def py_case(case, variant=None):
    fx = ROWS[case]
    cap = py_start(case, fx)
    eof = case != 'SDKPY06'
    rc = 0
    if case in ('SDKPY02', 'SDKPY04'):
        if variant == 'request_sent':
            client(cap, {'id': U2, 'method': 'turn/start', 'params': fx['request']['params']})
        msg = ("turn/start with toolOutput: Codex CLI 0.151.0 or newer is required; reported version is '0.150.0'. Configure CodexConfig.codex_bin with a supported CLI."
               if case == 'SDKPY02' else 'turn/start with toolOutput: Cannot verify an unversioned CLI with a custom launch command. Configure CodexConfig.codex_bin with a supported CLI.')
        cap.emit('driver', 'API_ERROR', {'api': 'CodexClient.request', 'name': 'CodexError', 'message': msg,
                                          'cause': {'name': 'TypeError' if variant == 'wrong_cause' else 'ValueError', 'message': 'x'}})
    elif case in ('SDKPY03', 'SDKPY05'):
        if variant in ('not_written', 'none_blocked'):
            cap.emit('driver', 'API_ERROR', {'api': 'CodexClient.request', 'name': 'CodexError', 'message': 'blocked', 'cause': {'name': 'ValueError', 'message': 'x'}})
        else:
            client(cap, {'id': U2, 'method': 'turn/start', 'params': fx['request']['params']})
            server(cap, {'id': U2, 'result': fx['success_result']}, 'turn/start')
            res = {} if variant == 'empty_result' else {'serverInfo': None, 'userAgent': None, 'platformFamily': None, 'platformOs': None}
            cap.emit('driver', 'API_RESULT', {'api': 'CodexClient.request', 'result': res, 'observations': {'method': 'turn/start'}})
    elif case == 'SDKPY06':
        reqs = fx['peer_requests']
        replies = [{'decision': 'accept'}, {'decision': 'accept'}, {}]
        if variant == 'deny_command':
            replies[0] = {'decision': 'decline'}
        for req, res in zip(reqs, replies):
            server(cap, req, req['method'])
            client(cap, {'id': req['id'], 'result': res})
            cap.emit('peer', 'PEER_MILESTONE', {'milestone': 'PEER_REQUEST_ANSWERED', 'detail': {'id': req['id'], 'sha256': 'a' * 64}})
        cap.emit('peer', 'PEER_MILESTONE', {'milestone': 'PEER_REQUESTS_DONE', 'detail': {'count': 3}})
    elif case == 'SDKPY07':
        client(cap, {'id': U2, 'method': 'turn/start', 'params': {'threadId': 't-synthetic', 'input': [{'type': 'text', 'text': 'synthetic text'}]}}, held=True)
        cap.control('driver', 'ABORT_NOW')
        cap.emit('driver', 'API_CANCELLED', {'name': 'CancelledError', 'message': ''})
        cap.control('peer', 'RELEASE_REPLY')
        server(cap, dict({'id': U2}, **fx['turn_start_reply']), 'turn/start')
        if variant == 'interrupt_sent':
            client(cap, {'id': U3, 'method': 'turn/interrupt', 'params': {'threadId': 't-synthetic', 'turnId': 'A'}})
            cap.emit('peer', 'PEER_MILESTONE', {'milestone': 'UNSCRIPTED', 'detail': {'method': 'turn/interrupt'}})
        cap.emit('driver', 'HOOK_CLOSED', {'turn_id': 'A', 'closed': variant != 'closed_false'})
    elif case in ('SDKPY08', 'SDKPY09'):
        client(cap, {'id': U2, 'method': 'thread/goal/set', 'params': {'threadId': 't-synthetic', 'status': 'paused'}})
        server(cap, dict({'id': U2}, **fx['pause_reply']), 'thread/goal/set')
        if variant != 'no_first_interrupt':
            client(cap, {'id': U3, 'method': 'turn/interrupt', 'params': {'threadId': 't-synthetic', 'turnId': 'A'}})
            server(cap, dict({'id': U3}, **fx['interrupt_A_reply']), 'turn/interrupt')
        if case == 'SDKPY08' or variant == 'retry_same':
            turn = 'B' if case == 'SDKPY08' else 'A'
            client(cap, {'id': U4, 'method': 'turn/interrupt', 'params': {'threadId': 't-synthetic', 'turnId': turn}})
            if case == 'SDKPY08':
                server(cap, dict({'id': U4}, **fx['interrupt_B_reply']), 'turn/interrupt')
            else:
                cap.emit('peer', 'PEER_MILESTONE', {'milestone': 'UNSCRIPTED', 'detail': {'method': 'turn/interrupt'}})
        if variant == 'third_interrupt':
            client(cap, {'id': 'cf1a3e56-0b6a-4f0e-9e23-6c3a8b8e0d11', 'method': 'turn/interrupt', 'params': {'threadId': 't-synthetic', 'turnId': 'B'}})
            cap.emit('peer', 'PEER_MILESTONE', {'milestone': 'UNSCRIPTED', 'detail': {'method': 'turn/interrupt'}})
        cap.emit('driver', 'API_RESULT', {'api': 'CodexClient.cancel_goal_operation', 'result': None, 'observations': {'current_turn_id': 'A'}})
    if variant == 'rc_mismatch':
        rc = -15
    py_finish(cap, eof=eof, rc=rc)
    return cap


def judge(cap, case, lang, witness_patch=None, os_ok=True, wire=None, sent=None):
    logs = cap.logs()
    verdict, reasons, _ = OBS.reconcile(logs, lang, {'checks': {'synthetic_os_witness': os_ok}}, wire, sent)
    w = {'os_checks': {}, 'maps': {'ok': True, 'entries': [{}], 'unknown': []},
         'adapter_environ': dict(ACC.FIXED_ENV if lang == 'python' else ACC.TS_SDK_ENV),
         'adapter_cmdline': None if lang == 'python' else list(ACC.TS_ADAPTER_CMDLINE), 'control_actions': cap.actions,
         'signal_sent_ns': None, 'timed_out': False}
    w.update(witness_patch or {})
    return ACC.evaluate(case, logs, verdict, reasons, w, ROWS[case])


def outcome(a):
    return a['outcome'] if (a['outcome'] != 'PASS_CLIENT_OBSERVATION' or a['predicate_ids_match_plan']) else 'PLAN_DRIFT'


for case in SUP.SDK_CASES_PY:
    check('acceptance.%s.positive_pass' % case, lambda case=case: (lambda a: outcome(a) == 'PASS_CLIENT_OBSERVATION' or a)(judge(py_case(case), case, 'python')))
    check('acceptance.%s.invalid_capture_os_witness' % case, lambda case=case: judge(py_case(case), case, 'python', os_ok=False)['outcome'] == 'INVALID_CAPTURE')
    check('acceptance.%s.invalid_without_maps_witness' % case,
          lambda case=case: judge(py_case(case), case, 'python', {'maps': {'ok': False, 'unknown': [{}]}})['outcome'] == 'INVALID_CAPTURE')
    check('acceptance.%s.mismatch_host_env_leak' % case,
          lambda case=case: judge(py_case(case), case, 'python', {'adapter_environ': dict(ACC.FIXED_ENV, OPENAI_API_KEY='x')})['outcome'] == 'MISMATCH')
KNOWN_BAD_PY = [('SDKPY02', 'request_sent'), ('SDKPY02', 'wrong_cause'), ('SDKPY04', 'request_sent'), ('SDKPY06', 'deny_command'),
                ('SDKPY07', 'closed_false'), ('SDKPY08', 'no_first_interrupt'), ('SDKPY03', 'not_written'), ('SDKPY05', 'none_blocked'),
                ('SDKPY03', 'empty_result')]
for case, variant in KNOWN_BAD_PY:
    check('acceptance.%s.known_bad_%s_mismatch' % (case, variant),
          lambda case=case, variant=variant: (lambda a: a['outcome'] == 'MISMATCH' or a)(judge(py_case(case, variant), case, 'python')))
# R1-F01: these three captures cannot be produced with the frozen peer (an unscripted request gets no reply and the SDK
# blocks); they prove the predicate only. The reachable form is the blocking capture below, judged INVALID_CAPTURE.
for case, variant in (('SDKPY07', 'interrupt_sent'), ('SDKPY08', 'third_interrupt'), ('SDKPY09', 'retry_same')):
    check('acceptance.%s.known_bad_%s_predicate_level_unreachable_with_frozen_peer' % (case, variant),
          lambda case=case, variant=variant: (lambda a: a['outcome'] == 'MISMATCH' or a)(judge(py_case(case, variant), case, 'python')))


def blocking(case):
    """Reachable form of the unscripted-request known-bad: the SDK blocks, the driver watchdog declares INVALID."""
    fx = ROWS[case]
    cap = py_start(case, fx)
    if case == 'SDKPY07':
        client(cap, {'id': U2, 'method': 'turn/start', 'params': {'threadId': 't-synthetic', 'input': [{'type': 'text', 'text': 'synthetic text'}]}}, held=True)
        cap.control('driver', 'ABORT_NOW')
        client(cap, {'id': U3, 'method': 'turn/interrupt', 'params': {'threadId': 't-synthetic', 'turnId': 'A'}})
    else:
        client(cap, {'id': U2, 'method': 'thread/goal/set', 'params': {'threadId': 't-synthetic', 'status': 'paused'}})
        server(cap, dict({'id': U2}, **fx['pause_reply']), 'thread/goal/set')
        client(cap, {'id': U3, 'method': 'turn/interrupt', 'params': {'threadId': 't-synthetic', 'turnId': 'A'}})
        server(cap, dict({'id': U3}, **fx['interrupt_A_reply']), 'turn/interrupt')
        client(cap, {'id': U4, 'method': 'turn/interrupt', 'params': {'threadId': 't-synthetic', 'turnId': 'A' if case == 'SDKPY09' else 'C'}})
    cap.emit('peer', 'PEER_MILESTONE', {'milestone': 'UNSCRIPTED', 'detail': {'method': 'turn/interrupt'}})
    cap.emit('driver', 'INVALID', {'reason': 'driver deadline'})
    cap.stream_end('stdin')
    cap.emit('peer', 'PEER_MILESTONE', {'milestone': 'STDIN_EOF', 'detail': None})
    cap.emit('peer', 'INVALID', {'reason': 'case deadline'})
    cap.stream_end('stdout')
    cap.stream_end('stderr')
    cap.adapter_end(125)
    return judge(cap, case, 'python', {'maps': None})['outcome']


for case in ('SDKPY07', 'SDKPY08', 'SDKPY09'):
    check('acceptance.%s.blocking_unscripted_request_invalid_never_pass' % case, lambda case=case: blocking(case) == 'INVALID_CAPTURE')


def swapped_reply_id():
    fx = ROWS['SDKPY01']
    cap = Cap('SDKPY01')
    client(cap, init_req())
    server(cap, {'id': U2, 'result': fx['initialize_result']}, 'initialize')
    client(cap, {'method': 'initialized'})
    cap.emit('driver', 'API_RESULT', {'api': 'CodexClient.initialize', 'result': init_dump(fx), 'observations': {}})
    py_finish(cap)
    return judge(cap, 'SDKPY01', 'python')['outcome']


check('acceptance.SDKPY01.negative_swapped_reply_id_predicate_level', lambda: swapped_reply_id() == 'MISMATCH')


def false_terminal():
    cap = py_case('SDKPY01')
    cap.frames['adapter'] = [f for f in cap.frames['adapter'] if b'"STREAM_END"' not in f[0] or b'"stdout"' not in f[0]]
    return judge(cap, 'SDKPY01', 'python')['outcome']


check('acceptance.SDKPY01.negative_false_complete_terminal_invalid', lambda: false_terminal() == 'INVALID_CAPTURE')
check('acceptance.SDKPY01.rc_mismatch_invalid', lambda: judge(py_case('SDKPY01', 'rc_mismatch'), 'SDKPY01', 'python')['outcome'] == 'INVALID_CAPTURE')


def omit_initialized():
    fx = ROWS['SDKPY01']
    cap = Cap('SDKPY01')
    client(cap, init_req())
    server(cap, {'id': U1, 'result': fx['initialize_result']}, 'initialize')
    cap.emit('driver', 'API_RESULT', {'api': 'CodexClient.initialize', 'result': init_dump(fx), 'observations': {}})
    py_finish(cap)
    return judge(cap, 'SDKPY01', 'python')['outcome']


check('acceptance.SDKPY01.known_bad_omit_initialized_mismatch', lambda: omit_initialized() == 'MISMATCH')


def eof_after_finish():
    cap = py_case('SDKPY02')
    acts = copy.deepcopy(cap.actions)
    for x in acts:
        if x['detail']['command'] == 'FINISH_PEER':
            x['t_ns'] = 1_000_001
    return judge(cap, 'SDKPY02', 'python', {'control_actions': acts})['outcome']


check('acceptance.SDKPY02.finish_before_eof_mismatch', lambda: eof_after_finish() == 'MISMATCH')


# ---------------------------------------------------------------------------------------- TypeScript

def ts_case(case, variant=None, form='PASS'):
    fx = ROWS[case]
    cap = Cap(case)
    cap.emit('peer', 'PEER_MILESTONE', {'milestone': 'EXEC_ARGV', 'detail': ['exec', '--experimental-json'] + (['--model', 'x'] if variant == 'extra_flag' else [])})
    stdin = b'synthetic'
    cap.relay('stdin', stdin)
    cap.stream_end('stdin')
    cap.emit('peer', 'REQUEST_HELD', {'bytes': len(stdin), 'sha256': sha(stdin)})
    if case == 'SDKTS10':
        cap.control('driver', 'ABORT_NOW')
        cap.emit('driver', 'DIAGNOSTIC', {'milestone': 'ABORT_CALLED', 'detail': {'source_sdk_claim': False}})
        if variant != 'abort_no_kill':
            cap.emit('adapter', 'SIGNAL', {'signal': 'SIGTERM', 'inflight': False})
            cap.emit('peer', 'SIGNAL', {'signal': 'SIGTERM', 'inflight': False})
            cap.adapter_end(None, None, False)
            cap.emit('driver', 'API_ERROR', {'api': 'Thread.runStreamed', 'name': 'AbortError', 'message': 'The operation was aborted', 'cause': None})
        else:
            cap.emit('peer', 'END', {'streams': {}, 'child_exit_code': 0, 'child_signal': None, 'complete': True})
            cap.stream_end('stdout')
            cap.stream_end('stderr')
            cap.adapter_end(0)
            cap.emit('driver', 'API_RESULT', {'api': 'Thread.runStreamed.return', 'result': None, 'observations': {'events': 0, 'thread_id': None, 'abort_called': True}})
        cap.control('driver', 'RELEASE_EXIT')
        cap.emit('driver', 'END', {'streams': {}, 'child_exit_code': None, 'child_signal': None, 'complete': True})
        return cap
    out, err = ACC.ts_fixture_bytes(fx)
    cap.control('peer', 'RELEASE_REPLY')
    cap.emit('peer', 'PEER_MILESTONE', {'milestone': 'REPLY_WRITTEN', 'detail': {'stdout_bytes': len(out), 'stdout_sha256': sha(out),
                                                                                  'stderr_bytes': len(err), 'stderr_sha256': sha(err)}})
    if out:
        cap.relay('stdout', out)
    if err:
        cap.relay('stderr', err)
    if form == 'KNOWN_SIGNAL_TERMINATION':
        cap.emit('adapter', 'SIGNAL', {'signal': 'SIGTERM', 'inflight': False})
        cap.emit('peer', 'SIGNAL', {'signal': 'SIGTERM', 'inflight': False})
        cap.adapter_end(None, None, False)
    else:
        cap.control('peer', 'RELEASE_EXIT')
        cap.emit('peer', 'END', {'streams': {}, 'child_exit_code': fx['exit_code'], 'child_signal': None, 'complete': True})
        cap.stream_end('stdout')
        cap.stream_end('stderr')
        cap.adapter_end(fx['exit_code'])
    for kind, data in TS_API[case](variant):
        cap.emit('driver', kind, data)
    cap.control('driver', 'RELEASE_EXIT')
    cap.emit('driver', 'END', {'streams': {}, 'child_exit_code': None, 'child_signal': None, 'complete': True})
    return cap


def run_ok(result):
    return lambda v: [('API_RESULT', {'api': 'Thread.run', 'result': result(v), 'observations': {'thread_id': None}})]


def run_err(msg, cause=None):
    return lambda v: [('API_ERROR', {'api': 'Thread.run', 'name': 'Error', 'message': msg if v != 'returned' else 'x', 'cause': cause})]


EMPTY = {'items': [], 'finalResponse': '', 'usage': None}
TS05 = {'items': [{'id': 'm', 'type': 'agent_message', 'text': 'first'}, {'id': 'm', 'type': 'agent_message', 'text': 'last'}], 'finalResponse': 'last',
        'usage': {'input_tokens': 3, 'cached_input_tokens': 0, 'output_tokens': 4, 'cache_write_input_tokens': 0}}
TS_API = {
    'SDKTS01': run_ok(lambda v: dict(EMPTY, finalResponse='x') if v == 'nonempty' else EMPTY),
    'SDKTS02': lambda v: ([('API_RESULT', {'api': 'Thread.runStreamed.yield', 'result': {}, 'observations': {'index': 0}})] if v == 'skipped' else [])
    + [('API_ERROR', {'api': 'Thread.runStreamed', 'name': 'Error', 'message': 'Failed to parse item: {broken', 'cause': {'name': 'SyntaxError', 'message': 'x'}})],
    'SDKTS03': lambda v: ([('API_RESULT', {'api': 'Thread.runStreamed.return', 'result': None, 'observations': {'events': 0, 'thread_id': None, 'abort_called': False}})]
                          if v == 'ignored' else [('API_ERROR', {'api': 'Thread.runStreamed', 'name': 'Error', 'message': 'Failed to parse item: ', 'cause': {'name': 'SyntaxError', 'message': 'x'}})]),
    'SDKTS04': lambda v: [('API_RESULT', {'api': 'Thread.runStreamed.yield', 'result': {'type': 'thread.started', 'thread_id': 'synth-thread'},
                                          'observations': {'thread_id': 'synth-thread', 'index': 0}}),
                          ('API_RESULT', {'api': 'Thread.runStreamed.yield', 'result': {'type': 'turn.completed', 'usage': dict(
                              {'input_tokens': 1, 'cached_input_tokens': 0, 'output_tokens': 2}, **({} if v == 'no_default' else {'cache_write_input_tokens': 0}))},
                                          'observations': {'thread_id': 'synth-thread', 'index': 1}}),
                          ('API_RESULT', {'api': 'Thread.runStreamed.return', 'result': None, 'observations': {'events': 2, 'thread_id': 'synth-thread', 'abort_called': False}})],
    'SDKTS05': run_ok(lambda v: dict(TS05, items=TS05['items'][1:]) if v == 'dedupe' else TS05),
    'SDKTS06': lambda v: ([('API_ERROR', {'api': 'Thread.run', 'name': 'Error', 'message': 'synthetic event error', 'cause': None})] if v == 'raised'
                          else run_ok(lambda _v: EMPTY)(v)),
    'SDKTS07': lambda v: ([('API_RESULT', {'api': 'Thread.run', 'result': EMPTY, 'observations': {'thread_id': None}})] if v == 'returned'
                          else run_err('synthetic failure')(v)),
    'SDKTS08': lambda v: ([('API_ERROR', {'api': 'Thread.run', 'name': 'Error', 'message': 'undefined', 'cause': None})] if v == 'throws'
                          else [('API_RESULT', {'api': 'Thread.run', 'result': EMPTY, 'observations': {'thread_id': None}})]),
    'SDKTS09': lambda v: ([('API_RESULT', {'api': 'Thread.run', 'result': {'items': [{'id': 'm', 'type': 'agent_message', 'text': 'before exit'}],
                                                                           'finalResponse': 'before exit', 'usage': None}, 'observations': {'thread_id': None}})]
                          if v == 'returned' else [('API_ERROR', {'api': 'Thread.run', 'name': 'Error', 'message': 'Codex Exec exited with code 7: synthetic detail', 'cause': None})]),
}


def ts_judge(case, variant=None, form='PASS', patch=None):
    cap = ts_case(case, variant, form)
    fx = ROWS[case]
    wire = None
    if 'JSONL' in fx:
        out, err = ACC.ts_fixture_bytes(fx)
        wire = {'stdout': out, 'stderr': err}
    return judge(cap, case, 'typescript', patch, wire=wire)


for case in SUP.SDK_CASES_TS:
    form = 'KNOWN_SIGNAL_TERMINATION' if case == 'SDKTS10' else 'PASS'
    check('acceptance.%s.positive_pass' % case, lambda case=case, form=form: (lambda a: outcome(a) == 'PASS_CLIENT_OBSERVATION' or a)(ts_judge(case, form=form)))
    check('acceptance.%s.mismatch_extra_exec_flag' % case, lambda case=case: ts_judge(case, 'extra_flag')['outcome'] == 'MISMATCH')
    check('acceptance.%s.mismatch_env_leak' % case,
          lambda case=case: ts_judge(case, patch={'adapter_environ': dict(ACC.TS_SDK_ENV, HOME='/home/ricardo')})['outcome'] == 'MISMATCH')
for case in ACC.EARLY_CLOSE_TS:
    check('acceptance.%s.sdk_finally_kill_form_pass' % case,
          lambda case=case: (lambda a: outcome(a) == 'PASS_CLIENT_OBSERVATION' or a)(ts_judge(case, form='KNOWN_SIGNAL_TERMINATION')))
    check('acceptance.%s.supervisor_signal_not_sdk_mismatch' % case,
          lambda case=case: ts_judge(case, form='KNOWN_SIGNAL_TERMINATION', patch={'signal_sent_ns': 5})['outcome'] in ('MISMATCH', 'INVALID_CAPTURE'))
check('acceptance.SDKTS05.signal_form_not_accepted', lambda: ts_judge('SDKTS05', form='KNOWN_SIGNAL_TERMINATION')['outcome'] == 'MISMATCH')
for case, variant in (('SDKTS02', 'skipped'), ('SDKTS04', 'no_default'), ('SDKTS05', 'dedupe'), ('SDKTS08', 'throws'), ('SDKTS09', 'returned'),
                      ('SDKTS01', 'nonempty'), ('SDKTS03', 'ignored'), ('SDKTS06', 'raised'), ('SDKTS07', 'returned')):
    check('acceptance.%s.known_bad_%s_mismatch' % (case, variant), lambda case=case, variant=variant: ts_judge(case, variant)['outcome'] == 'MISMATCH')
check('acceptance.SDKTS10.abort_without_kill_mismatch', lambda: ts_judge('SDKTS10', 'abort_no_kill')['outcome'] == 'MISMATCH')
check('acceptance.SDKTS10.timeout_inconclusive', lambda: ts_judge('SDKTS10', patch={'timed_out': True, 'maps': None})['outcome'] == 'INCONCLUSIVE')
check('acceptance.plan_covers_19', lambda: sorted(ACC.PRED_IDS) == sorted(SUP.SDK_CASES_PY + SUP.SDK_CASES_TS) == sorted(ACC.CASES))
_spec1 = importlib.util.spec_from_file_location('cvg_acceptance_r1', UNIT / 'archives' / 'review-r1-preimages' / 'python' / 'acceptance.py')
ACC1 = importlib.util.module_from_spec(_spec1)
_spec1.loader.exec_module(ACC1)
check('acceptance.frozen_case_plan_equals_r1_evaluator', lambda: all(json.loads((UNIT / 'case-plan.json').read_text())['cases'][c]['acceptance_predicates'] == ACC1.plan(c)
                                                                     for c in SUP.SDK_CASES_PY + SUP.SDK_CASES_TS))
check('acceptance.r2_predicates_additive_over_r1', lambda: all(ACC.PRED_IDS[c][:len(ACC1.PRED_IDS[c])] == ACC1.PRED_IDS[c] for c in ACC.PRED_IDS)
      and {c: ACC.PRED_IDS[c][len(ACC1.PRED_IDS[c]):] for c in ACC.PRED_IDS if ACC.PRED_IDS[c] != ACC1.PRED_IDS[c]}
      == {'SDKPY02': ['wire.initialized_before_guard'], 'SDKPY04': ['wire.initialized_before_guard']})
check('eof.driver_and_supervisor_sets_equal', lambda: set(DRV.EOF_BARRIER) == SUP.EOF_BARRIER and set(ACC.EOF_CASES) == SUP.EOF_BARRIER - {'DIAG-PY-RPC', 'DIAG-PY-STAGE'})


# ---------------------------------------------------------------------------- maps classification
def maps_tests():
    root = SUP.RUNTIME / ('selftest-' + secrets.token_hex(6))
    (root / 'profile' / 'python-deps').mkdir(parents=True, mode=0o700)
    try:
        so = root / 'profile' / 'python-deps' / 'x.so'
        so.write_bytes(b'\x7fELF constant')

        def line(path, st, perms='r-xp', inode=None):
            return '7f00-7f01 %s 00000000 %02x:%02x %d %s' % (perms, os.major(st.st_dev), os.minor(st.st_dev), inode if inode is not None else st.st_ino, path)
        py, libc = os.stat(SUP.HOST['python'][0]), os.stat('/usr/lib/x86_64-linux-gnu/libc.so.6')
        good = '\n'.join([line('/runtime/python', py), line('/usr/lib/x86_64-linux-gnu/libc.so.6', libc), line('/profile/python-deps/x.so', os.stat(so)),
                          '7f02-7f03 rw-p 00000000 00:00 0 [heap]', '7f04-7f05 r--p 00000000 00:00 0 '])
        roots = [('/runtime/python', SUP.HOST['python'][0]), ('/usr/lib/x86_64-linux-gnu/', '/usr/lib/x86_64-linux-gnu/'),
                 ('/profile/', str(root / 'profile') + '/')]
        e, u = SUP.classify_mappings(SUP.parse_maps(good), roots, 'python')
        check('maps.allowed_roots_by_dev_inode', lambda: len(e) == 3 and not u and all(x['class'] == 'ALLOWED_RO_ROOT' for x in e))
        bad_inode = SUP.parse_maps(line('/runtime/python', py, inode=py.st_ino + 1))
        check('maps.wrong_inode_unknown', lambda: len(SUP.classify_mappings(bad_inode, roots, 'python')[1]) == 1)
        check('maps.writable_work_unknown', lambda: len(SUP.classify_mappings(SUP.parse_maps(line('/work/evil.so', libc)), roots, 'python')[1]) == 1)
        check('maps.deleted_unknown', lambda: len(SUP.classify_mappings(SUP.parse_maps(line('/profile/python-deps/x.so (deleted)', os.stat(so))), roots, 'python')[1]) == 1)
        memfd = SUP.parse_maps('7f00-7f01 r-xp 00000000 00:01 77 /memfd:doublemapper (deleted)')
        check('maps.memfd_unknown_for_python', lambda: len(SUP.classify_mappings(memfd, roots, 'python')[1]) == 1)
        check('maps.memfd_jit_class_for_node', lambda: SUP.classify_mappings(memfd, roots, 'typescript')[0][0]['class'] == 'ANONYMOUS_MEMFD_JIT')
        ring = SUP.parse_maps('7f00-7f01 rw-s 00000000 00:11 1933264 anon_inode:[io_uring]')
        check('maps.io_uring_ring_no_exec_allowed', lambda: (lambda r: not r[1] and r[0][0]['class'] == 'ANONYMOUS_KERNEL_OBJECT_NO_EXEC')(SUP.classify_mappings(ring, roots, 'typescript')))
        xring = SUP.parse_maps('7f00-7f01 r-xs 00000000 00:11 1933264 anon_inode:[io_uring]')
        check('maps.anon_inode_exec_unknown', lambda: len(SUP.classify_mappings(xring, roots, 'python')[1]) == 1)
    finally:
        shutil.rmtree(root)


maps_tests()


# --------------------------------------------------------------------- staging closure and freeze gates
def staging_tests():
    root = SUP.RUNTIME / ('selftest-' + secrets.token_hex(6))
    root.mkdir(mode=0o700)
    try:
        src = root / 'src'
        (src / 'pkg' / 'sub').mkdir(parents=True)
        (src / 'pkg' / 'a.py').write_text('a\n')
        (src / 'pkg' / 'sub' / 'b.py').write_text('b\n')
        (src / 'pkg' / 'empty.typed').write_bytes(b'')
        m = SUP.tree_manifest(src)
        check('staging.manifest_recursive', lambda: sorted(m) == ['pkg/a.py', 'pkg/empty.typed', 'pkg/sub/b.py'] and m['pkg/empty.typed']['bytes'] == 0)
        prof = root / 'profile'
        prof.mkdir()
        SUP.stage_tree(src, prof / 'sdk-python')
        (prof / 'admission.json').write_text('{}')
        (prof / 'adapter-typescript').write_text('#!/runtime/node\n')
        os.symlink('a.py', prof / 'sdk-python' / 'pkg' / 'link.py')
        files = SUP.profile_files(prof, ('/profile/sdk-python/pkg/sub/b.py',))
        check('staging.profile_files_skip_admission_symlink_unbound', lambda: sorted(files) == ['/profile/adapter-typescript', '/profile/sdk-python/pkg/a.py',
                                                                                                  '/profile/sdk-python/pkg/empty.typed'])
        SUP.seal_profile(prof)
        check('staging.sealed_modes', lambda: oct(os.stat(prof / 'sdk-python' / 'pkg' / 'a.py').st_mode & 0o777) == '0o444'
              and oct(os.stat(prof / 'adapter-typescript').st_mode & 0o777) == '0o555' and oct(os.stat(prof / 'sdk-python' / 'pkg').st_mode & 0o777) == '0o555')
        rejects('staging.symlink_refused_in_tree', lambda: SUP.tree_manifest(prof / 'sdk-python'))
        os.mkfifo(src / 'pkg' / 'fifo')
        rejects('staging.special_file_refused', lambda: SUP.tree_manifest(src))
    finally:
        for top, dirs, names in os.walk(root):
            for d in dirs:
                p = os.path.join(top, d)
                if not os.path.islink(p):
                    os.chmod(p, 0o700)
        shutil.rmtree(root)


staging_tests()
if not SUP.FREEZE.exists():
    rejects('gates.check_source_freeze_blocks_without_freeze', SUP.check_source_freeze)
if not SUP.IDENTITY.exists():
    rejects('gates.check_identity_freeze_blocks_without_admission', SUP.check_identity_freeze)
if not SUP.EMIT_RECORD.exists():
    rejects('gates.check_emit_record_blocks_without_compiler', SUP.check_emit_record)
rejects('gates.attempt_unknown_case', lambda: SUP.Attempt('SDKPY99'))


def snapshot_rows():
    rows = [x for x in json.loads(SUP.SOURCE_INPUTS.read_text())['inputs'] if x['path_git'].startswith('sdk/python/src/openai_codex/')]
    ok = len(rows) == 22
    for row in rows:
        snap = SUP.REFERENCE / row['snapshot']
        data = b'' if snap.name.endswith('.empty-blob.json') else snap.read_bytes()
        ok = ok and len(data) == row['bytes'] and sha(data) == row['sha256'] and hashlib.sha1(b'blob %d\0' % len(data) + data).hexdigest() == row['git_blob']
    return ok


check('staging.sdk_python_snapshots_match_git_blobs', snapshot_rows)
check('peer.DIAG-PY-STAGE_reply', lambda: len(RPC.Script('DIAG-PY-STAGE', ROWS['DIAG-PY-STAGE']).plan({'method': 'diag/large', 'id': 'x'})[1]['result']['blob']) == 4096)
check('supervisor.unit_prefixes_disjoint_from_previous', lambda: all(p != 'cvg-codex100-sdkdiag-' for p in SUP.UNIT_PREFIX.values()))
check('supervisor.source_set_files_exist', lambda: all((UNIT / rel).is_file() for rel in SUP.SOURCE_SET))
check('supervisor.scan_imports', lambda: SUP.scan_imports('import { spawn } from "node:child_process";\nimport path from "node:path";\nexport { Thread } from "./thread";\n'
                                                          'const r = createRequire(import.meta.url);\nr.resolve("x");\n')
      == {'static': ['./thread', 'node:child_process', 'node:path'], 'dynamic_import_calls': 0, 'require_calls': 0})
check('supervisor.scan_dynamic_import', lambda: SUP.scan_imports('const m = await import("x");\n')['dynamic_import_calls'] == 1)

failed = [r for r in results if r['status'] != 'PASS']
report = {'kind': 'ACCEPTANCE_AND_ADMISSION_HELPERS_PURE_SELFTEST', 'evaluator': ACC.EVALUATOR if hasattr(ACC, 'EVALUATOR') else 'acceptance-r1',
          'note': 'gates.* checks run only while the corresponding freeze/record is absent (R1-F11); predicate_level_unreachable checks prove a predicate only (R1-F01)',
          'python': sys.version.split()[0], 'checks': len(results), 'failed': len(failed),
          'results': results, 'sources': {n: sha((HERE / n).read_bytes()) for n in ('acceptance.py', 'observer.py', 'channel.py', 'supervisor.py', 'selftest_acceptance.py')},
          'SDK_imports': 0, 'compiler_imports': 0}
if len(sys.argv) > 1:
    out = Path(sys.argv[1])
    out.mkdir(exist_ok=True)
    (out / 'acceptance-selftest.json').write_text(json.dumps(report, ensure_ascii=False, indent=1) + '\n')
print(json.dumps({'checks': len(results), 'failed': len(failed), 'failures': failed}, indent=1, ensure_ascii=False)[:6000])
sys.exit(1 if failed else 0)
