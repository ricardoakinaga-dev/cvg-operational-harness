"""Contained Python driver for the SDK reference profile.

argv (frozen): ["/runtime/python", "-I", "-S", "/profile/python-driver.py", "--case", CASE_ID]
SDK/Pydantic imports happen only inside run_sdk() after a current admission with
sdk_admitted=true and closed, hash-bound /profile/sdk-python and /profile/python-deps
trees. Diagnostic mode drives the same adapter/peer topology with this file's own
constant client code and never imports a target.
"""
import asyncio
import concurrent.futures
import errno
import hashlib
import importlib.util
import json
import os
import queue
import resource
import socket
import subprocess
import sys
import threading
import uuid


def _load_channel():
    spec = importlib.util.spec_from_file_location('cvg_channel', '/profile/channel.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


C = None  # loaded by main(): importing this file performs no I/O
SOURCE = '/profile/python-driver.py'
LAUNCH = ('/runtime/python', '-I', '-S', '/profile/adapter-python.py')
SDK_CASES = ('SDKPY01', 'SDKPY02', 'SDKPY03', 'SDKPY04', 'SDKPY05', 'SDKPY06', 'SDKPY07', 'SDKPY08', 'SDKPY09')
GUARD_CASES = ('SDKPY02', 'SDKPY03', 'SDKPY04', 'SDKPY05')
GOAL_CASES = ('SDKPY08', 'SDKPY09')
DIAG_PLAN = {
    # case: (request method, cancel barrier, containment selfcheck)
    'DIAG-PY-RPC': ('turn/start', True, True),
    'DIAG-PY-LARGE': ('diag/large', False, False),
    'DIAG-PY-TERM': ('diag/large', False, False),
    'DIAG-PY-STALL': ('diag/large', False, False),
    'DIAG-PY-KILL': ('turn/start', False, False),
}


def error_data(api, exc):
    cause = exc.__cause__
    return {'api': api, 'name': type(exc).__name__[:120], 'message': str(exc)[:360],
            'cause': None if cause is None else {'name': type(cause).__name__[:120], 'message': str(cause)[:200]}}


def settle(fn):
    """The API call alone is inside this try; telemetry is emitted by the caller afterwards."""
    try:
        return True, fn()
    except Exception as exc:  # noqa: BLE001 - recorded as the API lane, never swallowed
        return False, exc


async def settle_async(awaitable):
    try:
        return True, await awaitable
    except BaseException as exc:  # noqa: BLE001 - CancelledError is the expected SDKPY07 witness
        return False, exc


def dump(value):
    if hasattr(value, 'model_dump'):
        return value.model_dump(mode='json', by_alias=True)
    return value


# ---------------------------------------------------------------- SDK mode (future admission only)

def run_sdk(config, ch):
    a = C.admission(config, 'sdk')
    for root in ('/profile/sdk-python/', '/profile/python-deps/'):
        C.verify_tree(root, a['files'])
    sys.path[:0] = ['/profile/sdk-python', '/profile/python-deps']
    case, fx = config['case'], config['case_input']
    C.check(case in SDK_CASES, 'unsupported SDK case')
    from openai_codex.client import CodexClient, CodexConfig  # noqa: E402 - gated SDK import
    from openai_codex.models import InitializeResponse
    cfg = CodexConfig(launch_args_override=LAUNCH, cwd='/work', experimental_api=True)
    if case == 'SDKPY07':
        asyncio.run(sdk_py07(cfg, ch))
        return
    client = CodexClient(config=cfg)
    ok, value = settle(client.start)
    if not ok:
        ch.emit('API_ERROR', error_data('CodexClient.start', value))
        return
    try:
        ok, value = settle(client.initialize)
        if ok:
            ch.emit('API_RESULT', {'api': 'CodexClient.initialize', 'result': dump(value), 'observations': {}})
        else:
            ch.emit('API_ERROR', error_data('CodexClient.initialize', value))
        if ok and case in GUARD_CASES:
            req = fx['request']
            ok2, v2 = settle(lambda: client.request(req['method'], req['params'], response_model=InitializeResponse))
            if ok2:
                ch.emit('API_RESULT', {'api': 'CodexClient.request', 'result': dump(v2), 'observations': {'method': req['method']}})
            else:
                ch.emit('API_ERROR', error_data('CodexClient.request', v2))
        elif ok and case in GOAL_CASES:
            ctor = fx['state_constructor']
            C.check(ctor['class'] == 'openai_codex._goal._GoalOperationState', 'goal state class')
            from openai_codex._goal import _GoalOperationState
            state = _GoalOperationState(**ctor['kwargs'])
            ok2, v2 = settle(lambda: client.cancel_goal_operation(state))
            obs = {'current_turn_id': state.current_turn_id}
            if ok2:
                ch.emit('API_RESULT', {'api': 'CodexClient.cancel_goal_operation', 'result': v2, 'observations': obs})
            else:
                ch.emit('API_ERROR', error_data('CodexClient.cancel_goal_operation', v2))
        # SDKPY01/SDKPY06: initialize only; SDKPY06 server requests are answered by the real default handler.
        ch.emit('DIAGNOSTIC', {'milestone': 'CALLS_DONE', 'detail': {'source_sdk_claim': False}})
        ch.control('RELEASE_EXIT')  # supervisor: peer FINISH_PEER, peer exit, adapter drain/END observed
    finally:
        client.close()


async def sdk_py07(cfg, ch):
    from openai_codex import async_client
    from openai_codex._message_router import _TurnSubscription
    close_code = _TurnSubscription.close.__code__
    C.check(close_code.co_filename == '/profile/sdk-python/openai_codex/_message_router.py', 'hook code identity')
    C.check(len(async_client._TURN_START_EXECUTOR._threads) == 0, 'executor workers already exist')
    cond = threading.Condition()
    seen = []

    def collector(frame, event, _arg):
        # Observation only: reads two attributes at the return of the exact code object.
        if event == 'return' and frame.f_code is close_code:
            sub = frame.f_locals.get('self')
            rec = (getattr(getattr(sub, '_state', None), 'id', None), getattr(sub, '_closed', None))
            with cond:
                seen.append(rec)
                cond.notify_all()

    threading.setprofile(collector)  # before any executor worker thread is created
    client = async_client.AsyncCodexClient(config=cfg)
    ok, value = await settle_async(client.start())
    if not ok:
        ch.emit('API_ERROR', error_data('AsyncCodexClient.start', value))
        return
    try:
        ok, value = await settle_async(client.initialize())
        if not ok:
            ch.emit('API_ERROR', error_data('AsyncCodexClient.initialize', value))
            return
        ch.emit('API_RESULT', {'api': 'AsyncCodexClient.initialize', 'result': dump(value), 'observations': {}})
        task = asyncio.ensure_future(client._start_turn('t-synthetic', 'synthetic text', None, True))
        await asyncio.to_thread(ch.control, 'ABORT_NOW')  # after adapter RAW_READ+FORWARD_COMMIT and peer REQUEST_HELD
        task.cancel()
        ok, value = await settle_async(task)
        if not ok and isinstance(value, asyncio.CancelledError):
            ch.emit('API_CANCELLED', {'name': type(value).__name__, 'message': str(value)[:400]})
        elif ok:
            ch.emit('API_RESULT', {'api': 'AsyncCodexClient._start_turn', 'result': dump(value[0]), 'observations': {}})
            raise C.ChannelError('turn start completed before the cancel barrier')
        else:
            ch.emit('API_ERROR', error_data('AsyncCodexClient._start_turn', value))
            raise C.ChannelError('turn start failed instead of cancelling')
        with cond:  # supervisor releases the held reply only after API_CANCELLED
            got = cond.wait_for(lambda: any(t == 'A' for t, _ in seen), timeout=max(0.0, ch.remaining()))
        C.check(got, 'missing _TurnSubscription.close return event for turn A')
        closed = [c for t, c in seen if t == 'A'][0]
        ch.emit('HOOK_CLOSED', {'turn_id': 'A', 'closed': closed is True})
        threading.setprofile(None)
        ch.emit('DIAGNOSTIC', {'milestone': 'CALLS_DONE', 'detail': {'hook_events': len(seen), 'source_sdk_claim': False}})
        await asyncio.to_thread(ch.control, 'RELEASE_EXIT')
    finally:
        await client.close()


# ---------------------------------------------------------------- diagnostic mode (own constant code)

class OwnClient:
    """Own constant JSON-RPC client mirroring the SDK transport (Popen pipes, close_fds, JSON+LF)."""

    def __init__(self):
        self.proc = subprocess.Popen(list(LAUNCH), stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                     cwd='/work', env=os.environ.copy(), bufsize=0)
        self.sent, self.sent_bytes = hashlib.sha256(), 0
        self.recv, self.recv_bytes = hashlib.sha256(), 0
        self.err, self.err_bytes = hashlib.sha256(), 0
        self.lines = queue.Queue()
        self.reader = threading.Thread(target=self._read, daemon=True)
        self.drain = threading.Thread(target=self._drain, daemon=True)
        self.reader.start()
        self.drain.start()

    def _read(self):
        buf = b''
        while True:
            b = os.read(self.proc.stdout.fileno(), 65536)
            if not b:
                self.lines.put(None)
                return
            self.recv.update(b)
            self.recv_bytes += len(b)
            buf += b
            while b'\n' in buf:
                line, buf = buf.split(b'\n', 1)
                self.lines.put(line + b'\n')

    def _drain(self):
        while True:
            b = os.read(self.proc.stderr.fileno(), 65536)
            if not b:
                return
            self.err.update(b)
            self.err_bytes += len(b)

    def send(self, obj):
        raw = (json.dumps(obj) + '\n').encode('utf-8')
        self.proc.stdin.write(raw)
        self.proc.stdin.flush()
        self.sent.update(raw)
        self.sent_bytes += len(raw)

    def wait_reply(self, request_id, timeout):
        while True:
            line = self.lines.get(timeout=timeout)
            if line is None:
                return None
            msg = json.loads(line.decode('utf-8'))
            if isinstance(msg, dict) and msg.get('id') == request_id and 'method' not in msg:
                return line

    def close(self, timeout):
        self.proc.stdin.close()
        rc = self.proc.wait(timeout=timeout)
        self.reader.join(timeout=timeout)
        self.drain.join(timeout=timeout)
        return rc

    def summary(self):
        return {'sent_bytes': self.sent_bytes, 'sent_sha256': self.sent.hexdigest(), 'recv_bytes': self.recv_bytes,
                'recv_sha256': self.recv.hexdigest(), 'stderr_bytes': self.err_bytes, 'stderr_sha256': self.err.hexdigest()}


def containment():
    out = {}

    def denied(label, fn):
        try:
            fn()
        except OSError as exc:
            out[label] = errno.errorcode.get(exc.errno, str(exc.errno))
        else:
            raise C.ChannelError(label + ' unexpectedly allowed')

    def tcp():
        s = socket.socket()
        s.settimeout(0.5)
        try:
            s.connect(('198.51.100.1', 9))
        finally:
            s.close()

    def abstract():
        s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        try:
            s.connect('\0cvg-host-abstract-probe')
        finally:
            s.close()

    def write_outside():
        with open('/must-not-write', 'wb') as f:
            f.write(b'constant')

    denied('tcp_198_51_100_1', tcp)
    denied('abstract_unix', abstract)
    denied('host_bus', lambda: open('/run/user/1000/bus', 'rb').close())
    denied('outside_write', write_outside)
    denied('profile_write', lambda: open('/profile/x', 'wb').close())
    with open('/work/home/private-write', 'w') as f:
        f.write('constant-private-write')
    out['private_write'] = 'PASS'
    C.check(sorted(os.environ) == sorted(C.FIXED_ENV) and all(os.environ[k] == v for k, v in C.FIXED_ENV.items()), 'exact environment')
    out['env_exact'] = True
    out['uid'] = os.geteuid()
    out['rlimits'] = [resource.getrlimit(r)[0] for r in (resource.RLIMIT_NOFILE, resource.RLIMIT_FSIZE, resource.RLIMIT_CORE)]
    C.check(out['rlimits'] == [128, 8388608, 0], 'rlimits')
    with open('/proc/self/status') as f:
        out['no_new_privs'] = [ln.split()[1] for ln in f if ln.startswith('NoNewPrivs:')][0]
    C.check(out['no_new_privs'] == '1', 'NoNewPrivs')
    out['netns'] = os.readlink('/proc/self/ns/net')
    return out


def run_diag(config, ch):
    method, cancel_barrier, selfcheck = DIAG_PLAN[config['case']]
    if selfcheck:
        ch.emit('DIAGNOSTIC', {'milestone': 'CONTAINMENT', 'detail': containment()})
    client = OwnClient()
    try:
        init_id = str(uuid.uuid4())
        client.send({'id': init_id, 'method': 'initialize', 'params': {'clientInfo': {'name': 'cvg_own_diagnostic', 'title': 'constant', 'version': '0'}, 'capabilities': {'experimentalApi': True}}})
        line = client.wait_reply(init_id, timeout=max(0.1, ch.remaining()))
        C.check(line is not None, 'initialize reply missing')
        ch.emit('DIAGNOSTIC', {'milestone': 'INITIALIZE_REPLY', 'detail': {'bytes': len(line), 'sha256': C.sha(line)}})
        client.send({'method': 'initialized'})
        req_id = str(uuid.uuid4())
        params = {'threadId': 't-synthetic', 'input': [{'type': 'text', 'text': 'synthetic text'}]} if method == 'turn/start' else {}
        if cancel_barrier:
            late = {}
            cond = threading.Condition()
            pool = concurrent.futures.ThreadPoolExecutor(max_workers=1, thread_name_prefix='cvg-diag')

            def wait():
                return client.wait_reply(req_id, timeout=max(0.1, ch.remaining()))

            def on_late(fut):
                with cond:
                    late['line'] = fut.result() if not fut.cancelled() and fut.exception() is None else None
                    late['done'] = True
                    cond.notify_all()

            async def flow():
                client.send({'id': req_id, 'method': method, 'params': params})
                cf = pool.submit(wait)
                task = asyncio.ensure_future(asyncio.wrap_future(cf))
                await asyncio.to_thread(ch.control, 'ABORT_NOW')
                task.cancel()
                ok, value = await settle_async(task)
                C.check(not ok and isinstance(value, asyncio.CancelledError), 'own task did not cancel')
                cf.add_done_callback(on_late)  # analog of the SDK discard-cancelled-result callback
                ch.emit('API_CANCELLED', {'name': type(value).__name__, 'message': 'own constant diagnostic task'})

            asyncio.run(flow())
            with cond:
                got = cond.wait_for(lambda: late.get('done'), timeout=max(0.0, ch.remaining()))
            C.check(got and late.get('line') is not None, 'late reply not observed')
            ch.emit('DIAGNOSTIC', {'milestone': 'LATE_REPLY_OBSERVED', 'detail': {'bytes': len(late['line']), 'sha256': C.sha(late['line'])}})
            pool.shutdown(wait=True)
        else:
            client.send({'id': req_id, 'method': method, 'params': params})
            line = client.wait_reply(req_id, timeout=max(0.1, ch.remaining()))
            detail = {'transport_closed': line is None}
            if line is not None:
                detail.update({'bytes': len(line), 'sha256': C.sha(line)})
            ch.emit('DIAGNOSTIC', {'milestone': 'CALLS_DONE', 'detail': detail})
        ch.control('RELEASE_EXIT')
    finally:
        rc = client.close(timeout=max(0.1, min(5.0, ch.remaining())))
    detail = client.summary()
    detail.update({'returncode': rc, 'source_sdk_claim': False})
    ch.emit('DIAGNOSTIC', {'milestone': 'OWN_CLIENT_CLOSED', 'detail': detail})


def main():
    global C
    C = _load_channel()
    ch = None
    try:
        config = C.load_config('python')
        ch = C.Channel(config, 'driver', SOURCE)
    except BaseException:  # noqa: BLE001
        os._exit(125)

    def watchdog():
        C.invalid(ch, C.ChannelError('driver deadline'))
        os._exit(125)

    timer = threading.Timer(max(0.01, ch.remaining()), watchdog)
    timer.daemon = True
    try:
        C.check(sys.argv == [SOURCE, '--case', config['case']], 'driver argv')
        for p in ('/profile/fixture-cases.json', '/profile/adapter-python.py', '/profile/fixture-rpc.py'):
            C.check(C.is_hex(ch.admission['files'].get(p, '')), 'unbound ' + p)
        C.selected_fixture(config)
        timer.start()
        ch.start()
        if config['mode'] == 'diagnostic':
            run_diag(config, ch)
        else:
            run_sdk(config, ch)
        timer.cancel()
        ch.emit('END', {'streams': {}, 'child_exit_code': None, 'child_signal': None, 'complete': True})
        ch.close()
        os._exit(0)
    except BaseException as exc:  # noqa: BLE001 - every failure is terminal INVALID
        timer.cancel()
        C.invalid(ch, exc)
        os._exit(125)


if __name__ == '__main__':
    main()
