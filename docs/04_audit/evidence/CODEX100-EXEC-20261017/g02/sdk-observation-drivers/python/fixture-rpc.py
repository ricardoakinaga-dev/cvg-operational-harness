"""Synthetic Python JSON-RPC peer behind the Python stdio adapter. Not a Codex app-server.

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


def wire(obj):
    return (json.dumps(obj, separators=(',', ':'), ensure_ascii=False) + '\n').encode('utf-8')


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
        script = Script(config['case'], fx)
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
        stdin_eof = False
        finishing = False
        writes = []  # (milestone detail, end offset in the cumulative output)
        written = 0
        queued = 0

        def queue_reply(method, raw):
            nonlocal queued
            out.extend(raw)
            queued += len(raw)
            writes.append(({'method': method, 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()}, queued))

        def send_next_peer_request():
            if script.peer_requests:
                req = script.peer_requests.pop(0)
                script.awaiting = req['id']
                queue_reply(req['method'], wire(req))
            elif script.awaiting is None and 'peer_requests' in fx:
                ch.emit('PEER_MILESTONE', {'milestone': 'PEER_REQUESTS_DONE', 'detail': {'count': len(fx['peer_requests'])}})
                script.awaiting = False

        def handle(line):
            nonlocal held
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
            if kind == 'request':
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
                    finishing = True
                else:
                    raise C.ChannelError('unexpected control %s in peer state' % cmd)
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
    except BaseException as exc:  # noqa: BLE001 - every failure is terminal INVALID
        C.invalid(ch, exc)
        if state['signal'] is not None:
            signal.signal(state['signal'], signal.SIG_DFL)
            os.kill(os.getpid(), state['signal'])
            time.sleep(1)
        os._exit(125)


if __name__ == '__main__':
    main()
