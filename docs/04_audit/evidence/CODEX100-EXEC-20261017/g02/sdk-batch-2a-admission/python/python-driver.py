"""Contained Python driver for the SDK reference profile.

argv (frozen): ["/runtime/python", "-I", "-S", "/profile/python-driver.py", "--case", CASE_ID]
SDK/Pydantic imports happen only inside run_sdk() after a current admission with
sdk_admitted=true and closed, hash-bound /profile/sdk-python and /profile/python-deps
trees. Diagnostic mode drives the same adapter/peer topology with this file's own
constant client code and never imports a target.

DX100-G02:IMPLEMENT-AND-ADMIT-SDK-SOURCE-BATCH-2A (new identity): run_sdk interprets the frozen 2A sdk_calls;
2A-PY10R reuses the SDKPY07 instrumented flow; DIAG-PY-UNSCRIPTED checks the peer v2 unscripted error.

DX100-G02:ADMIT-SDK-PROFILE-AND-ACCEPTANCE additions (previous identity):
- EOF barrier (HOW cutpoint "close driver stdin and drain all raw frames before absence
  judgment"): for every Python case except SDKPY06 the driver closes the client transport
  stdin after the API calls and before CALLS_DONE; the supervisor releases the peer only
  after the peer reports STDIN_EOF, so absences are judged over an EOF-bounded interval.
- SDK_CLIENT_CLOSED reports the adapter returncode seen by the SDK Popen after close().
- DIAG-PY-STAGE: constant admission diagnostic over the sealed staged trees (no import).
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
SDK_CASES = ('2A-PY03', '2A-PY04', '2A-PY08', '2A-PY15', '2A-PY16', '2A-PY07R', '2A-PY10R')
# SDKPY06 keeps stdin open: the peer-originated approval requests are answered by the SDK reader.
EOF_BARRIER = ('DIAG-PY-RPC', 'DIAG-PY-STAGE', 'DIAG-PY-UNSCRIPTED')
DIAG_PLAN = {
    # case: (request method, cancel barrier, containment selfcheck)
    'DIAG-PY-RPC': ('turn/start', True, True),
    'DIAG-PY-LARGE': ('diag/large', False, False),
    'DIAG-PY-TERM': ('diag/large', False, False),
    'DIAG-PY-STALL': ('diag/large', False, False),
    'DIAG-PY-KILL': ('turn/start', False, False),
    'DIAG-PY-STAGE': ('diag/large', False, False),
    'DIAG-PY-UNSCRIPTED': ('diag/unscripted', False, False),  # batch 2A: peer v2 answers the unscripted request
}


def error_data(api, exc):
    cause = exc.__cause__
    return {'api': api, 'name': C.clip(type(exc).__name__, 120), 'message': C.clip(exc, 360),
            'cause': None if cause is None else {'name': C.clip(type(cause).__name__, 120), 'message': C.clip(cause, 200)}}


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


def close_client_stdin(ch, stdin):
    """EOF barrier: close the client transport stdin so adapter and peer drain to EOF (no SDK patch)."""
    C.check(stdin is not None and not stdin.closed, 'client transport stdin missing')
    stdin.close()
    ch.emit('DIAGNOSTIC', {'milestone': 'CLIENT_STDIN_CLOSED', 'detail': {'source_sdk_claim': False}})


# ---------------------------------------------------------------- SDK mode (future admission only)

def run_sdk(config, ch):
    """Batch 2A: interpret the frozen sdk_calls of inputs/spec-2a/cases-2a.json against the real Python client."""
    a = C.admission(config, 'sdk')
    for root in ('/profile/sdk-python/', '/profile/python-deps/'):
        C.verify_tree(root, a['files'])
    sys.dont_write_bytecode = True  # /profile is read-only; never attempt bytecode next to the sealed trees
    sys.path[:0] = ['/profile/sdk-python', '/profile/python-deps']
    case, fx = config['case'], config['case_input']
    C.check(case in SDK_CASES, 'unsupported SDK case')
    from openai_codex.client import CodexClient, CodexConfig  # noqa: E402 - gated SDK import
    cfg = CodexConfig(launch_args_override=LAUNCH, cwd='/work', experimental_api=True)
    if case == '2A-PY10R':
        asyncio.run(sdk_py07(cfg, ch))  # same instrumented flow as SDKPY07 (peer v2 + pause_reply in the frozen script)
        return
    import openai_codex  # noqa: E402
    from openai_codex.api import Thread  # noqa: E402
    from openai_codex.generated import v2_all  # noqa: E402
    from openai_codex.models import InitializeResponse  # noqa: E402
    calls = fx['sdk_calls']
    first = calls[0]
    C.check(first['api'] == 'CodexClient.start+initialize', 'first step must start and initialize')
    handler_calls, handler_exc = [], []
    handler = None
    if (first.get('client') or {}).get('approval_handler') == 'record_then_raise':
        spec = first['client']['handler_raises']
        C.check(spec['class'] == 'RuntimeError', 'handler exception class')

        def handler(method, params):  # CAP-CUSTOM-HANDLER: records the call, then raises the declared exception
            handler_calls.append({'method': method, 'params': params})
            exc = RuntimeError(spec['message'])
            handler_exc.append(exc)
            raise exc
    client = CodexClient(config=cfg, approval_handler=handler)
    ok, value = settle(client.start)
    if not ok:
        ch.emit('API_ERROR', error_data('1:CodexClient.start', value))
        return
    proc = client._proc  # read-only handle: only its stdin (EOF barrier) and final returncode are used
    threads = {}

    def build_input(x):
        if isinstance(x, str):
            return x
        if isinstance(x, list):
            return [build_input(i) for i in x]
        C.check(isinstance(x, dict) and len(x) == 1, 'input marker')
        (k, v), = x.items()
        cls = {'$TextInput': openai_codex.TextInput, '$ImageInput': openai_codex.ImageInput, '$LocalImageInput': openai_codex.LocalImageInput,
               '$SkillInput': openai_codex.SkillInput, '$MentionInput': openai_codex.MentionInput,
               '$ExternalMessage': openai_codex.ExternalMessage}[k]
        return cls(**v)

    def build_params(p):
        if isinstance(p, dict) and '$model' in p:
            return getattr(v2_all, p['$model'])(**p['fields'])
        return p

    def thread_of(text):
        import re
        m = re.fullmatch(r"Thread\(client, '([^']+)'\)", text)
        C.check(m is not None, 'thread constructor')
        tid = m.group(1)
        if tid not in threads:
            threads[tid] = Thread(client, tid)  # as Codex.thread_start does after the thread/start reply
        return threads[tid]

    def summary(v):
        if v is None:
            return None
        if isinstance(v, InitializeResponse) or hasattr(v, 'model_dump') and not hasattr(v, 'turn'):
            return dump(v)
        if hasattr(v, 'turn') and hasattr(v.turn, 'id'):  # TurnStartResponse
            return {'turn.id': v.turn.id, 'turn.status': getattr(v.turn.status, 'value', v.turn.status)}
        if type(v).__name__ == 'Notification':
            pl = v.payload
            out = {'method': v.method, 'payload_class': type(pl).__name__}
            if type(pl).__name__ == 'UnknownNotification':
                out['params'] = pl.params
            else:
                out['turn_id'] = getattr(pl, 'turn_id', None)
                tu = getattr(pl, 'token_usage', None)
                if tu is not None:
                    out['token_usage.total.total_tokens'] = tu.total.total_tokens
            return out
        if type(v).__name__ == 'TurnResult':
            items = []
            for it in v.items:
                root = it.root if hasattr(it, 'root') else it
                items.append(getattr(root, 'id', None))
            return {'id': v.id, 'status': getattr(v.status, 'value', v.status), 'final_response': v.final_response, 'item_ids': items,
                    'usage.total.total_tokens': v.usage.total.total_tokens if v.usage is not None else None,
                    'usage.last.total_tokens': v.usage.last.total_tokens if v.usage is not None else None,
                    'error': None if v.error is None else {'message': v.error.message}}
        if type(v).__name__ == 'TurnHandle':
            return {'turn_handle.id': v.id, 'thread_id': v.thread_id}
        return v

    def error_detail(step, api, exc):
        detail = {'step': step, 'api': api, 'class': '%s.%s' % (type(exc).__module__, type(exc).__qualname__),
                  'code': getattr(exc, 'code', None) if isinstance(getattr(exc, 'code', None), int) else None, 'object_id': id(exc)}
        if hasattr(exc, 'errors') and callable(exc.errors):
            try:
                errs = exc.errors()
                detail['first_loc'] = [str(x) for x in errs[0]['loc']] if errs else None
            except Exception:  # noqa: BLE001 - detail only
                detail['first_loc'] = None
        ch.emit('DIAGNOSTIC', {'milestone': 'ERROR_DETAIL', 'detail': detail})

    try:
        ok, value = settle(client.initialize)
        if not ok:
            ch.emit('API_ERROR', error_data('1:CodexClient.initialize', value))
            raise C.ChannelError('initialize failed')
        ch.emit('API_RESULT', {'api': 'CodexClient.initialize', 'result': dump(value), 'observations': {}})
        for step in calls[1:]:
            n, api = step['step'], step['api']
            label = '%d:%s' % (n, api)
            if api == 'CodexClient.request':
                fn = lambda st=step: client.request(st['method'], st['params'], response_model=InitializeResponse)
            elif api in ('CodexClient.thread_resume', 'CodexClient.thread_fork'):
                meth = getattr(client, api.split('.')[1])
                fn = lambda st=step, m=meth: m(st['thread_id'], build_params(st['params']))
            elif api == 'CodexClient.turn_start':
                fn = lambda st=step: client.turn_start(st['thread_id'], st['input_items'], st['params'])
            elif api == 'CodexClient.register_turn_notifications':
                fn = lambda st=step: client.register_turn_notifications(st['turn_id'])
            elif api == 'CodexClient.next_notification':
                fn = client.next_notification
            elif api == 'CodexClient.next_turn_notification':
                fn = lambda st=step: client.next_turn_notification(st['turn_id'])
            elif api in ('Thread.run', 'Thread.turn'):
                th = thread_of(step['thread'])
                fn = lambda st=step, t=th, a_=api: getattr(t, a_.split('.')[1])(build_input(st['input']))
            else:
                raise C.ChannelError('unknown 2A Python step api %s' % api)
            ok, value = settle(fn)
            if ok:
                ch.emit('API_RESULT', {'api': label, 'result': summary(value), 'observations': {}})
            else:
                ch.emit('API_ERROR', error_data(label, value))
                error_detail(n, label, value)
        if handler is not None:
            ch.emit('DIAGNOSTIC', {'milestone': 'HANDLER_CALLS', 'detail': {'calls': handler_calls,
                                                                            'exception_object_ids': [id(e) for e in handler_exc]}})
        if case != '2A-PY08':
            close_client_stdin(ch, proc.stdin)  # absences are judged over an EOF-bounded interval
        ch.emit('DIAGNOSTIC', {'milestone': 'CALLS_DONE', 'detail': {'source_sdk_claim': False}})
        ch.control('RELEASE_EXIT')  # supervisor: peer FINISH_PEER (or its own exit), adapter and peer exits witnessed by the OS
    finally:
        client.close()
    ch.emit('DIAGNOSTIC', {'milestone': 'SDK_CLIENT_CLOSED', 'detail': {'returncode': proc.returncode, 'source_sdk_claim': False}})


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
    proc = client._sync._proc  # read-only handle: only its stdin (EOF barrier) and final returncode are used
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
            ch.emit('API_CANCELLED', {'name': C.clip(type(value).__name__, 120), 'message': C.clip(value, 400)})
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
        close_client_stdin(ch, proc.stdin)  # absence of turn/interrupt is judged over the EOF-bounded interval
        ch.emit('DIAGNOSTIC', {'milestone': 'CALLS_DONE', 'detail': {'hook_events': len(seen), 'source_sdk_claim': False}})
        await asyncio.to_thread(ch.control, 'RELEASE_EXIT')
    finally:
        await client.close()
    ch.emit('DIAGNOSTIC', {'milestone': 'SDK_CLIENT_CLOSED', 'detail': {'returncode': proc.returncode, 'source_sdk_claim': False}})


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


def stage_admission(config, ch):
    """DIAG-PY-STAGE: sealed staged trees admitted and the SDK gate refused, all with constant code (no target import)."""
    a = ch.admission
    out = {}
    for root in ('/profile/sdk-python/', '/profile/python-deps/'):
        C.verify_tree(root, a['files'])
        out[root.split('/')[2]] = sum(1 for p in a['files'] if p.startswith(root))

    def refused(label, fn, needle):
        try:
            fn()
        except C.ChannelError as exc:
            C.check(needle in str(exc), '%s refused for another reason: %s' % (label, C.clip(exc, 120)))
            out[label] = 'REFUSED'
        else:
            raise C.ChannelError(label + ' unexpectedly accepted')

    any_staged = next(p for p in sorted(a['files']) if p.startswith('/profile/sdk-python/'))
    refused('hash_drift', lambda: C.verify_files({any_staged: '0' * 64}), 'file identity')
    refused('unbound_extra_file', lambda: C.verify_tree('/profile/sdk-drift-extra/', a['files']), 'sealed tree closure')
    refused('symlink', lambda: C.verify_tree('/profile/sdk-drift-link/', a['files']), 'symlink in sealed tree')
    refused('sdk_gate_closed', lambda: C.admission(config, 'sdk'), 'SDK not admitted')
    out['target_modules_loaded'] = sorted(m for m in sys.modules if m.split('.')[0] in ('openai_codex', 'pydantic', 'pydantic_core', 'typing_extensions', 'annotated_types', 'typing_inspection', 'packaging'))
    C.check(out['target_modules_loaded'] == [], 'a target module is loaded')
    ch.emit('DIAGNOSTIC', {'milestone': 'STAGE_ADMISSION', 'detail': out})


def run_diag(config, ch):
    method, cancel_barrier, selfcheck = DIAG_PLAN[config['case']]
    if selfcheck:
        ch.emit('DIAGNOSTIC', {'milestone': 'CONTAINMENT', 'detail': containment()})
    if config['case'] == 'DIAG-PY-STAGE':
        stage_admission(config, ch)
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
            pool.shutdown(wait=True)
            close_client_stdin(ch, client.proc.stdin)
            ch.emit('DIAGNOSTIC', {'milestone': 'LATE_REPLY_OBSERVED', 'detail': {'bytes': len(late['line']), 'sha256': C.sha(late['line'])}})
        else:
            client.send({'id': req_id, 'method': method, 'params': params})
            line = client.wait_reply(req_id, timeout=max(0.1, ch.remaining()))
            detail = {'transport_closed': line is None}
            if line is not None:
                detail.update({'bytes': len(line), 'sha256': C.sha(line)})
            if config['case'] in EOF_BARRIER:
                close_client_stdin(ch, client.proc.stdin)
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
        ch.finish_controls()  # an extra, late or truncated control invalidates BEFORE the END
        timer.cancel()
        ch.emit('END', {'streams': {}, 'child_exit_code': None, 'child_signal': None, 'complete': True})
        ch.close_fds()
        os._exit(0)
    except BaseException as exc:  # noqa: BLE001 - every failure is terminal INVALID
        timer.cancel()
        C.invalid(ch, exc)
        os._exit(125)


if __name__ == '__main__':
    main()
