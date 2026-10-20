"""Synthetic Python JSON-RPC peer behind the Python stdio adapter. Not a Codex app-server.

DX100-G02 batch 2A, peer v2 (inputs/spec-2a/peer-v2-contract.json): a case whose frozen input carries
peer_script.version == 2 is served by ordered single-use rules; every unscripted request is answered
with the declared synthetic JSON-RPC error (data merged with {"method": <received method>}), never
left unanswered. Rows without peer_script (constant diagnostics) keep the v1 behavior below.

DX100-G02 batch 2B-1 (D2B-09, CAP-2B-PEER-BEFORE-REPLY): the before_reply frames of a rule are queued before the reply bytes
(with hold: queued at receipt and the reply held); right after queueing them, and before queueing the reply, the peer emits
PEER_MILESTONE BEFORE_REPLY_WRITTEN {rule, frames, bytes}. The adapter FORWARD_COMMIT ledger proves the delivery order to the SDK.

DX100-G02 batch 2B-2 (D2B-08, CAP-2B-PEER-LOGIN): rules for account/login/start and account/login/cancel and account/login/completed
notifications. login_admission(peer_script) runs in ScriptV2 (before BEGIN/READY): (1) every string value that is a URL starts with
https://login.invalid/; (2) no key of FORBIDDEN_LOGIN_KEYS at any depth; (3) a rule for account/login/start only matches params
(match.params or match.params_subset) with type chatgpt or chatgptDeviceCode ('apiKey' as result.type of a reply, without any
credential field, is allowed). A violation is a capture failure (INVALID before READY). Every login frame queued to the client
(reply to account/login/* and account/login/completed notification) is announced by PEER_MILESTONE LOGIN_FRAME {method, frame,
login_id_sha256, bytes, sha256}; nothing is opened or resolved (no login, credential, network or session).

argv (frozen): ["/runtime/python", "-I", "-S", "/profile/fixture-rpc.py", "--case", CASE_ID]
Replies are the frozen cases.json fixture values wrapped with the actually captured
request id (no hardcoded UUID). Each scripted reply is single-use; anything else is
recorded as UNSCRIPTED and gets no reply. The peer reports only receipt/write
milestones; the adapter RAW_READ frames remain the authoritative capture.
"""
import hashlib
import importlib.util
import json
import os
import select
import signal
import sys
import time


def _load_channel():
    spec = importlib.util.spec_from_file_location('cvg_channel', '/profile/channel.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


C = None  # loaded by main(): importing this file performs no I/O
SOURCE = '/profile/fixture-rpc.py'
LINE_CAP = 262144  # == channel.CAPS['stdin']
# The single list used by CAP-2B-PEER-LOGIN, peer.login_frames_synthetic and the validators (spec R2-F05).
FORBIDDEN_LOGIN_KEYS = ('apiKey', 'api_key', 'accessToken', 'refreshToken', 'idToken', 'authToken', 'chatgptAuthTokens', 'password', 'secret')
LOGIN_URL_PREFIX = 'https://login.invalid/'
LOGIN_START_TYPES = ('chatgpt', 'chatgptDeviceCode')


def login_problems(ps):
    """CAP-2B-PEER-LOGIN admission rule over a peer_script v2 (also used by the evaluator and the unit validator)."""
    problems = []

    def walk(x, path):
        if isinstance(x, dict):
            for k, v in x.items():
                if k in FORBIDDEN_LOGIN_KEYS:
                    problems.append('forbidden key %s at %s' % (k, path))
                walk(v, path + '/' + str(k))
        elif isinstance(x, list):
            for i, v in enumerate(x):
                walk(v, '%s/%d' % (path, i))
        elif isinstance(x, str) and (x.startswith('http://') or x.startswith('https://')) and not x.startswith(LOGIN_URL_PREFIX):
            problems.append('non-synthetic URL at %s' % path)

    walk(ps, '')
    for i, rule in enumerate(ps.get('on_request', []) if isinstance(ps, dict) else []):
        m = rule.get('match', {})
        if m.get('method') == 'account/login/start':
            t = (m.get('params') or m.get('params_subset') or {}).get('type')
            if t not in LOGIN_START_TYPES:
                problems.append('rule %d: account/login/start matches type %r' % (i, t))
    return problems


def login_frame_info(label, frame, raw):
    """(method, login_id or None) when the queued frame is a login frame, else None."""
    if frame == 'notification' and label == 'notification:account/login/completed':
        method = 'account/login/completed'
    elif frame == 'reply' and label.startswith('account/login/'):
        method = label
    else:
        return None
    try:
        obj = json.loads(raw.decode('utf-8'))
    except ValueError:
        return method, None
    body = (obj.get('params') if frame == 'notification' else obj.get('result')) if isinstance(obj, dict) else None
    lid = body.get('loginId') if isinstance(body, dict) else None
    return method, lid if isinstance(lid, str) else None


def wire(obj):
    return (json.dumps(obj, separators=(',', ':'), ensure_ascii=False) + '\n').encode('utf-8')


def _has_overloaded(x):
    if isinstance(x, str):
        return 'server_overloaded' in x.lower()
    if isinstance(x, dict):
        return any(_has_overloaded(k) or _has_overloaded(v) for k, v in x.items())
    if isinstance(x, list):
        return any(_has_overloaded(v) for v in x)
    return False


def jeq(a, b):
    """F4-03: JSON value equality strict by type (bool never equals a number, null only null), as the evaluator r3.1."""
    if isinstance(a, bool) or isinstance(b, bool):
        return isinstance(a, bool) and isinstance(b, bool) and a == b
    if a is None or b is None:
        return a is None and b is None
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        return a == b
    if isinstance(a, str) or isinstance(b, str):
        return isinstance(a, str) and isinstance(b, str) and a == b
    if isinstance(a, list) and isinstance(b, list):
        return len(a) == len(b) and all(jeq(x, y) for x, y in zip(a, b))
    if isinstance(a, dict) and isinstance(b, dict):
        return set(a) == set(b) and all(jeq(a[k], b[k]) for k in a)
    return False


def _params_match(match, msg):
    params = msg.get('params')
    if 'method' in match and not jeq(msg.get('method'), match['method']):
        return False
    if match.get('params_absent') and 'params' in msg:
        return False
    if 'params' in match and not jeq(params, match['params']):
        return False
    if 'params_subset' in match:
        if not isinstance(params, dict) or any(k not in params or not jeq(params[k], v) for k, v in match['params_subset'].items()):
            return False
    return True


class ScriptV2:
    """peer-v2-contract.json: ordered single-use rules; unscripted requests get the declared error."""

    def __init__(self, ps):
        C.check(ps.get('version') == 2 and isinstance(ps.get('on_request'), list), 'peer script v2')
        ue = ps['unscripted_error']
        C.check(type(ue.get('code')) is int and not (-32099 <= ue['code'] <= -32000), 'unscripted code outside the allowed range')
        C.check(not _has_overloaded(ue) and 'retry limit' not in str(ue.get('message', '')).lower()
                and 'too many failed attempts' not in str(ue.get('message', '')).lower(), 'unscripted error would be retryable')
        bad = login_problems(ps)
        C.check(not bad, 'peer_script login admission (CAP-2B-PEER-LOGIN): %s' % '; '.join(bad)[:300])
        self.rules = ps['on_request']
        self.used = [False] * len(self.rules)
        self.unscripted = ue

    def plan(self, msg):
        """Return (rule_index or None, ops). ops: ('write', label, frame, raw) | ('hold', label, raw) | ('forever',) | ('exit',)."""
        method = msg.get('method')
        for i, rule in enumerate(self.rules):
            if self.used[i] or not _params_match(rule['match'], msg):
                continue
            self.used[i] = True
            ops = []
            for f in rule.get('before_reply', []):
                ops.append(self.frame_op(f))
            if rule.get('before_reply'):
                frames = [op for op in ops if op[0] == 'write']
                ops.append(('before_reply_done', i, len(frames), sum(len(op[3]) for op in frames)))
            if rule.get('hold') == 'forever':
                for f in rule.get('after_receipt', []):
                    ops.append(self.frame_op(f))
                ops.append(('forever',))
                return i, ops
            reply = wire(dict({'id': msg['id']}, **rule['reply']))
            if rule.get('hold') == 'until_RELEASE_REPLY':
                ops.append(('hold', method, reply))
            else:
                ops.append(('write', method, 'reply', reply))
            for f in rule.get('after_reply', []):
                ops.append(self.frame_op(f))
            return i, ops
        data = dict(self.unscripted.get('data') or {})
        data['method'] = method
        err = {'code': self.unscripted['code'], 'message': self.unscripted['message'], 'data': data}
        return None, [('write', 'unscripted:%s' % method, 'unscripted_error', wire({'id': msg['id'], 'error': err}))]

    @staticmethod
    def frame_op(f):
        if 'notification' in f:
            n = f['notification']
            return ('write', 'notification:%s' % n['method'], 'notification', wire({'method': n['method'], 'params': n['params']}))
        if 'server_request' in f:
            r = f['server_request']
            return ('write', 'server_request:%s' % r['method'], 'server_request', wire({'id': r['id'], 'method': r['method'], 'params': r['params']}))
        if 'response' in f:
            return ('write', 'response:%s' % str(f['response'].get('id'))[:60], 'response', wire(f['response']))
        if f.get('exit') == 'close_stdout_then_exit_0':
            return ('exit',)
        raise C.ChannelError('unknown peer v2 frame')


class Script:
    """Per-case reply plan derived only from the frozen fixture_input."""

    def __init__(self, case, fx):
        self.case, self.fx = case, fx
        self.used = set()
        self.peer_requests = list(fx.get('peer_requests', []))
        self.awaiting = None  # id of the peer-originated request awaiting a client reply

    def plan(self, msg):
        """Return ('reply', body) | ('hold', body) | ('none', None) for a client request."""
        method, fx = msg.get('method'), self.fx
        params = msg.get('params') if isinstance(msg.get('params'), dict) else {}
        key = method
        if method == 'turn/interrupt':
            key = 'turn/interrupt:' + str(params.get('turnId'))
        if key in self.used:
            return 'none', None
        body = None
        hold = False
        if method == 'initialize' and 'initialize_result' in fx:
            body = {'result': fx['initialize_result']}
        elif method == 'turn/start' and 'turn_start_reply' in fx:
            body, hold = fx['turn_start_reply'], True
        elif method == 'turn/start' and 'success_result' in fx:
            body = {'result': fx['success_result']}
        elif method == 'thread/goal/set' and 'pause_reply' in fx:
            body = fx['pause_reply']
        elif key == 'turn/interrupt:A' and 'interrupt_A_reply' in fx:
            body = fx['interrupt_A_reply']
        elif key == 'turn/interrupt:B' and 'interrupt_B_reply' in fx:
            body = fx['interrupt_B_reply']
        elif method == 'diag/large' and 'large_bytes' in fx:
            body = {'result': {'blob': 'y' * fx['large_bytes']}}
        if body is None:
            return 'none', None
        self.used.add(key)
        return ('hold' if hold else 'reply'), body


def main():
    global C
    C = _load_channel()
    state = {'signal': None, 't': None}
    wake_r, wake_w = os.pipe2(os.O_NONBLOCK | os.O_CLOEXEC)

    def on_signal(signum, _frame):
        if state['signal'] is None:
            state['t'] = time.monotonic()
            state['signal'] = signum

    signal.set_wakeup_fd(wake_w, warn_on_full_buffer=False)
    for s in (signal.SIGTERM, signal.SIGINT):
        signal.signal(s, on_signal)
    ch = None
    try:
        config = C.load_config('python')
        ch = C.Channel(config, 'peer', SOURCE)
    except BaseException:  # noqa: BLE001
        os._exit(125)
    ch.interrupt = lambda: state['signal'] is not None  # a pending signal aborts telemetry backpressure waits

    def die_by_signal():
        signum = state['signal']
        try:
            if time.monotonic() > state['t'] + 0.1:
                C.invalid(ch, C.ChannelError('signal handling exceeded the 100ms window'))
            else:
                ch.emit('SIGNAL', {'signal': signal.Signals(signum).name, 'inflight': bool(out)}, until=state['t'] + 0.09)
        except BaseException:
            pass
        signal.signal(signum, signal.SIG_DFL)
        os.kill(os.getpid(), signum)
        time.sleep(1)
        os._exit(125)

    out = bytearray()
    try:
        C.check(sys.argv == [SOURCE, '--case', config['case']], 'peer argv')
        C.check(ch.admission['files'].get('/profile/fixture-cases.json') == C.sha(C.read_file('/profile/fixture-cases.json')),
                'unbound fixtures')
        fx = C.selected_fixture(config)
        v2 = ScriptV2(fx['peer_script']) if 'peer_script' in fx else None
        script = Script(config['case'], fx if v2 is None else {})
        ch.emit('BEGIN', ch.begin)
        ch.emit('READY', {})
        while not ch.take('READY'):
            if state['signal'] is not None:
                die_by_signal()
            ch.check_deadline()
            select.select([ch.control_fd, wake_r], [], [], max(0.0, min(0.05, ch.remaining())))
        for fd in (0, 1):
            os.set_blocking(fd, False)
        buf = b''
        held = None
        forever = False
        exiting = False
        stdin_eof = False
        finishing = False
        writes = []  # (milestone detail, end offset in the cumulative output)
        written = 0
        queued = 0

        def queue_reply(method, raw, frame='reply'):
            nonlocal queued
            out.extend(raw)
            queued += len(raw)
            writes.append(({'method': method, 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest(), 'frame': frame}, queued))
            info = login_frame_info(method or '', frame, raw) if v2 is not None else None
            if info is not None:  # D2B-08: one LOGIN_FRAME per login frame, announced when queued (before it is written)
                lid = info[1]
                ch.emit('PEER_MILESTONE', {'milestone': 'LOGIN_FRAME', 'detail': {
                    'method': info[0], 'frame': frame, 'login_id_sha256': None if lid is None else hashlib.sha256(lid.encode('utf-8')).hexdigest(),
                    'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()}})

        def send_next_peer_request():
            if script.peer_requests:
                req = script.peer_requests.pop(0)
                script.awaiting = req['id']
                queue_reply(req['method'], wire(req))
            elif script.awaiting is None and 'peer_requests' in fx:
                ch.emit('PEER_MILESTONE', {'milestone': 'PEER_REQUESTS_DONE', 'detail': {'count': len(fx['peer_requests'])}})
                script.awaiting = False

        def handle(line):
            nonlocal held, forever, exiting
            digest = hashlib.sha256(line).hexdigest()
            try:
                msg = json.loads(line.decode('utf-8'))
            except ValueError:
                ch.emit('PEER_MILESTONE', {'milestone': 'UNPARSEABLE_LINE', 'detail': {'bytes': len(line), 'sha256': digest}})
                return
            if not isinstance(msg, dict):
                ch.emit('PEER_MILESTONE', {'milestone': 'NON_OBJECT_LINE', 'detail': {'bytes': len(line), 'sha256': digest}})
                return
            method = msg.get('method') if isinstance(msg.get('method'), str) else None
            kind = 'request' if method and 'id' in msg else 'notification' if method else 'response'
            ch.emit('PEER_MILESTONE', {'milestone': 'RECEIVED', 'detail': {'kind': kind, 'method': method, 'bytes': len(line), 'sha256': digest}})
            if kind == 'request' and v2 is not None:
                rule, ops = v2.plan(msg)
                if rule is None:
                    ch.emit('PEER_MILESTONE', {'milestone': 'UNSCRIPTED', 'detail': {'method': method, 'id_sha256': C.sha(str(msg['id']).encode())}})
                for op in ops:
                    if op[0] == 'write':
                        queue_reply(op[1], op[3], op[2])
                    elif op[0] == 'hold':
                        C.check(held is None, 'second held request')
                        held = (op[1], op[2])
                        ch.emit('REQUEST_HELD', {'bytes': len(line), 'sha256': digest})
                    elif op[0] == 'forever':
                        forever = True
                        ch.emit('PEER_MILESTONE', {'milestone': 'HELD_FOREVER', 'detail': {'method': method, 'sha256': digest}})
                    elif op[0] == 'exit':
                        exiting = True
                    elif op[0] == 'before_reply_done':
                        ch.emit('PEER_MILESTONE', {'milestone': 'BEFORE_REPLY_WRITTEN', 'detail': {'rule': op[1], 'frames': op[2], 'bytes': op[3]}})
            elif kind == 'request':
                action, body = script.plan(msg)
                if action == 'none':
                    ch.emit('PEER_MILESTONE', {'milestone': 'UNSCRIPTED', 'detail': {'method': method}})
                    return
                reply = wire(dict({'id': msg['id']}, **body))
                if action == 'hold':
                    C.check(held is None, 'second held request')
                    held = (method, reply)
                    ch.emit('REQUEST_HELD', {'bytes': len(line), 'sha256': digest})
                else:
                    queue_reply(method, reply)
            elif kind == 'notification':
                if method == 'initialized' and 'peer_requests' in fx and script.awaiting is None:
                    send_next_peer_request()
            else:
                if script.awaiting not in (None, False) and msg.get('id') == script.awaiting:
                    ch.emit('PEER_MILESTONE', {'milestone': 'PEER_REQUEST_ANSWERED', 'detail': {'id': str(msg['id'])[:80], 'sha256': digest}})
                    script.awaiting = None
                    send_next_peer_request()
                else:
                    ch.emit('PEER_MILESTONE', {'milestone': 'UNMATCHED_RESPONSE', 'detail': {'sha256': digest}})

        while True:
            if state['signal'] is not None:
                die_by_signal()
            ch.check_deadline()
            ch.read_controls()
            while ch.queue:
                cmd = ch.queue.pop(0)['command']
                if cmd == 'RELEASE_REPLY' and held is not None:
                    queue_reply(held[0], held[1])
                    held = None
                elif cmd == 'FINISH_PEER' and held is None:
                    finishing = True  # a hold=forever request is discarded here by contract
                else:
                    raise C.ChannelError('unexpected control %s in peer state' % cmd)
            if exiting and not out:
                # peer v2 exit frame: everything queued is written; close stdout and exit 0 with a complete END.
                os.close(1)  # F4-04: stdout closed before the milestone
                ch.emit('PEER_MILESTONE', {'milestone': 'EXIT_AFTER_SCRIPT', 'detail': {'written': written, 'stdout_closed': True}})
                ch.finish_controls()
                ch.emit('END', {'streams': {}, 'child_exit_code': 0, 'child_signal': None, 'complete': True})
                ch.close_fds()
                os._exit(0)
            if finishing and not out:
                ch.finish_controls()  # an extra, late or truncated control invalidates BEFORE the END
                ch.emit('END', {'streams': {}, 'child_exit_code': 0, 'child_signal': None, 'complete': True})
                ch.close_fds()
                for s_ in (signal.SIGTERM, signal.SIGINT):
                    signal.signal(s_, signal.SIG_DFL)
                if state['signal'] is not None:
                    os.kill(os.getpid(), state['signal'])
                    time.sleep(1)
                os._exit(0)
            rl = [ch.control_fd, wake_r] + ([] if stdin_eof else [0])
            wl = [1] if out else []
            r, w, _ = select.select(rl, wl, [], max(0.0, min(0.05, ch.remaining())))
            if wake_r in r:
                try:
                    os.read(wake_r, 64)
                except BlockingIOError:
                    pass
            if state['signal'] is not None:
                die_by_signal()  # checked right after select, before any new read or write
            if 0 in r and not stdin_eof:
                try:
                    b = os.read(0, 65536)
                except BlockingIOError:
                    b = None
                if b == b'':
                    stdin_eof = True
                    if buf:
                        ch.emit('PEER_MILESTONE', {'milestone': 'PARTIAL_LINE_AT_EOF', 'detail': {'bytes': len(buf)}})
                    ch.emit('PEER_MILESTONE', {'milestone': 'STDIN_EOF', 'detail': None})
                elif b:
                    buf += b
                    C.check(len(buf) <= LINE_CAP, 'peer line cap')
                    while b'\n' in buf:
                        line, buf = buf.split(b'\n', 1)
                        handle(line + b'\n')
            if 1 in w and out:
                try:
                    n = os.write(1, out)
                except BlockingIOError:
                    n = 0
                del out[:n]
                written += n
                while writes and writes[0][1] <= written:
                    detail, _end = writes.pop(0)
                    ch.emit('PEER_MILESTONE', {'milestone': 'REPLY_WRITTEN', 'detail': detail})
                    if detail.get('frame') == 'unscripted_error':
                        ch.emit('PEER_MILESTONE', {'milestone': 'UNSCRIPTED_ERROR_WRITTEN', 'detail': {'bytes': detail['bytes'], 'sha256': detail['sha256']}})
    except BaseException as exc:  # noqa: BLE001 - every failure is terminal INVALID
        C.invalid(ch, exc)
        if state['signal'] is not None:
            signal.signal(state['signal'], signal.SIG_DFL)
            os.kill(os.getpid(), state['signal'])
            time.sleep(1)
        os._exit(125)


if __name__ == '__main__':
    main()
