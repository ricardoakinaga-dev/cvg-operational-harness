"""Contained Python driver for the SDK reference profile.

argv (frozen): ["/runtime/python", "-I", "-S", "/profile/python-driver.py", "--case", CASE_ID]
SDK/Pydantic imports happen only in SDK mode, after a current admission with sdk_admitted=true and closed,
hash-bound /profile/sdk-python and /profile/python-deps trees. Diagnostic mode drives the same adapter/peer
topology with own constant code (own2b.py and the inherited OwnClient below) and never imports a target.

DX100-G02:IMPLEMENT-AND-ADMIT-SDK-SOURCE-BATCH-2B-1 (new identity; freeze r4 + freeze-r4-2b-delta.json):
- Interp interprets the frozen sdk_calls of cases-2b-1.json (CAP-PY-SDKCALLS-2B, D2B-02; a step outside the closed
  vocabulary is INVALID_CAPTURE) in sync mode or inside asyncio.run (driver_mode async, D2B-03), with the barrier
  steps of D2B-04/D2B-11, the epilogues of D2B-12 and the frames of D2B-15 (harness2b.py);
- the same interpreter runs the constant diag_calls of the new own-code diagnostics (DIAG-PY-ASYNC, -BARRIER,
  -BEFOREREPLY, -CLOSETERM, -PROCWITNESS, -KILLWAIT) over own2b.py;
- R2-F06: the driver BEGIN carries pydantic.VERSION and pydantic_core.__version__ of the sealed tree (2.13.4/2.46.4,
  anything else is INVALID_CAPTURE); STEP_WITNESS stays a DIAGNOSTIC milestone and clock.mark is CLOCK_MARK.
DIAG-PY-RPC, DIAG-PY-STAGE and DIAG-PY-UNSCRIPTED keep the inherited run_diag below.

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
import time
import uuid


def _load_channel():
    spec = importlib.util.spec_from_file_location('cvg_channel', '/profile/channel.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


C = None  # loaded by main(): importing this file performs no I/O
SOURCE = '/profile/python-driver.py'
LAUNCH = ('/runtime/python', '-I', '-S', '/profile/adapter-python.py')
DIAG_2B = ('DIAG-PY-ASYNC', 'DIAG-PY-BARRIER', 'DIAG-PY-BEFOREREPLY', 'DIAG-PY-CLOSETERM', 'DIAG-PY-PROCWITNESS', 'DIAG-PY-KILLWAIT')
DEPENDENCY = {'pydantic': '2.13.4', 'pydantic_core': '2.46.4'}  # R2-F06: never a silent dependency swap
EOF_BARRIER = ('DIAG-PY-RPC', 'DIAG-PY-STAGE', 'DIAG-PY-UNSCRIPTED')
DIAG_PLAN = {
    # case: (request method, cancel barrier, containment selfcheck)
    'DIAG-PY-RPC': ('turn/start', True, True),
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


# ---------------------------------------------------------------- batch 2B-1 interpreter (SDK slots and own-code DIAG)

def _load_profile_module(name):
    """Profile helper modules bound by the admission (harness2b.py, own2b.py); registered so hook code paths resolve."""
    spec = importlib.util.spec_from_file_location(name, '/profile/%s.py' % name)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


H = None  # harness2b, loaded by main()


def resolve_code(dotted):
    """'pkg.mod.Class.method' (or '<locals>' components) -> code object, unwrapping decorators (__wrapped__)."""
    import importlib
    import types
    parts = dotted.split('.')
    obj, i = None, len(parts)
    while i > 0:
        try:
            obj = importlib.import_module('.'.join(parts[:i]))
            break
        except ImportError:
            i -= 1
    C.check(obj is not None, 'hook module of %s' % dotted)
    rest = parts[i:]
    code = None
    k = 0
    while k < len(rest):
        name = rest[k]
        if name == '<locals>':
            C.check(code is not None and k + 1 < len(rest), 'locals path %s' % dotted)
            inner = rest[k + 1]
            found = [c for c in code.co_consts if isinstance(c, types.CodeType) and c.co_name == inner]
            C.check(len(found) == 1, 'nested code %s in %s' % (inner, dotted))
            code = found[0]
            k += 2
            continue
        C.check(code is None, 'attribute after nested code in %s' % dotted)
        obj = obj.__dict__[name] if isinstance(obj, type) and name in obj.__dict__ else getattr(obj, name)
        while hasattr(obj, '__wrapped__'):
            obj = obj.__wrapped__
        if isinstance(obj, (staticmethod, classmethod)):
            obj = obj.__func__
        if isinstance(obj, types.FunctionType):
            code = obj.__code__
        k += 1
    if code is None and isinstance(obj, types.FunctionType):
        code = obj.__code__
    C.check(isinstance(code, types.CodeType), 'code object of %s' % dotted)
    return code


# R2-F04: waits whose timeout is a client effect (the case continues and the client predicate decides); every other
# declared wait is a harness precondition (timeout -> INVALID_CAPTURE, E2B-14).
CLIENT_EFFECT_WAITS = {('2B-PY11B', 8): 'worker.parked de W2 no lock do thread', ('2B-PY02A', 12): 'thread.join do leitor'}
# Frozen park_point texts of the 2B-1 cases -> (code path, parking rule). Selftest: every frozen text is mapped.
PARK_POINTS = {
    'openai_codex.client.CodexClient._thread_start_lock na linha do with entry.lock':
        ('openai_codex.client.CodexClient._thread_start_lock', {'line_text': 'with entry.lock:'}),
    'threading.Condition.wait dentro de _TurnSubscription.next':
        ('threading.Condition.wait', {'caller': 'openai_codex._message_router._TurnSubscription.next'}),
}
HOOK_PRECONDITIONS = {
    'len(openai_codex.async_client._TURN_START_EXECUTOR._threads) == 0 e executor padrão do loop ainda não criado': 'executors_empty',
}
RESPONSE_MODELS = ('InitializeResponse',)  # closed list of the 2B-1 cases (2B-2 extends it with CAP-2B-MODEL-ORACLE)
EPILOGUES = ('eof_calls_done_release_exit_then_sdk_close', 'eof_calls_done_release_exit_then_sdk_aclose',
             'calls_done_release_exit_then_sdk_close_if_open')
CLIENT_CLASSES = ('Codex', 'AsyncCodex', 'CodexClient', 'OwnClient', 'OwnAsync')


def park_spec(text):
    if text is None:
        return None
    C.check(text in PARK_POINTS, 'unmapped park_point %r' % text)
    path, rule = PARK_POINTS[text]
    code = resolve_code(path)
    if 'line_text' in rule:
        lines = open(code.co_filename, encoding='utf-8').read().split('\n')
        span = sorted({ln for _, _, ln in code.co_lines() if ln is not None})
        hits = [n for n in range(span[0], span[-1] + 1) if rule['line_text'] in lines[n - 1]]
        C.check(len(hits) == 1, 'park line %r in %s' % (rule['line_text'], path))
        return {'code': code, 'line': hits[0]}
    return {'code': code, 'caller': resolve_code(rule['caller'])}


class Interp:
    """Interprets the frozen sdk_calls (mode sdk) or the constant diag_calls (mode diag2b) of one slot."""

    def __init__(self, config, ch, mode):
        self.ch, self.mode, self.case = ch, mode, config['case']
        self.ci = config['case_input']
        self.steps = self.ci['sdk_calls'] if mode == 'sdk' else self.ci['diag_calls']
        self.names, self.tasks, self.workers, self.streams, self.astreams = {}, {}, {}, {}, {}
        self.keep = []  # E2B-05: every identity token's object is retained until the driver exits
        self.hooks = H.HookSet(emit=self.emit)
        self.exc = H.ExcepthookRecorder(emit=self.emit)
        self.reader = H.StaticReader(self.names, self.hooks, self.tasks)
        self.primary = None
        self.closed = set()
        self.done = False
        if mode == 'sdk':
            import openai_codex  # noqa: F401 - gated SDK import (admitted trees only)
            from openai_codex import api, async_client, client, models
            self.api, self.async_client, self.client_mod, self.models = api, async_client, client, models
        else:
            self.own = sys.modules['own2b']
            self.names['own'] = self.own

    # ------------------------------------------------------------------ telemetry
    def emit(self, kind, data):
        self.ch.emit(kind, data)

    def milestone(self, name, detail):
        self.ch.emit('DIAGNOSTIC', {'milestone': name, 'detail': detail})

    def label(self, step):
        if 'step' not in step:  # sub-call of a task or worker: its frame is labelled by the owning step
            return C.clip('%s:%s' % (step['api'], step.get('method', '')), 120)
        lb = '%d:%s' % (step['step'], step['api'])
        if step['api'] == 'call':
            lb += ':' + step['method']
        return C.clip(lb, 120)

    def result(self, label, value, observations=None):
        summ, warns = H.summary_v2(value)
        for cat, msg in warns:
            self.emit('SERIALIZATION_WARNING', {'step': label, 'category': cat, 'message': msg})
        self.emit('API_RESULT', {'api': label, 'result': summ, 'observations': observations or {}})
        return summ

    def error(self, label, exc):
        d = H.error_v2(exc, self.keep.append)
        cause = exc.__cause__
        self.emit('API_ERROR', {'api': label, 'name': C.clip(d['class'], 120), 'message': C.clip(d['str'], 400),
                                'cause': None if cause is None else {'name': C.clip(H.qualified(type(cause)), 120), 'message': C.clip(cause, 200)}})
        self.milestone('ERROR_DETAIL', dict(d, label=label))
        return d

    # ------------------------------------------------------------------ values
    def value(self, v):
        if v == '$LAUNCH':
            return LAUNCH
        if isinstance(v, list):
            return [self.value(x) for x in v]
        if isinstance(v, dict):
            if set(v) == {'$ref'}:
                C.check(v['$ref'] in self.names, 'unknown $ref %s' % v['$ref'])
                return self.names[v['$ref']]
            C.check(not any(k.startswith('$') for k in v), 'marker not in the 2B-1 vocabulary: %s' % sorted(v))
            return {k: self.value(x) for k, x in v.items()}
        return v

    def kwargs(self, kw):
        out = {}
        for k, v in (kw or {}).items():
            if k == 'response_model':
                C.check(v in RESPONSE_MODELS, 'response_model %r outside the closed list' % v)
                out[k] = getattr(self.models, v)
            else:
                out[k] = self.value(v)
        return out

    def config_of(self, cfg):
        from openai_codex.client import CodexConfig
        kw = {}
        for k, v in cfg.items():
            C.check(k in ('launch_args_override', 'cwd', 'env', 'codex_bin', 'config_overrides'), 'config key %s' % k)
            v = self.value(v)
            kw[k] = tuple(v) if k in ('launch_args_override', 'config_overrides') else v
        return CodexConfig(**kw)

    def on(self, path):
        parts = path.split('.')
        C.check(parts[0] in self.names, 'unknown name %s' % parts[0])
        obj = self.names[parts[0]]
        for p in parts[1:]:
            obj = getattr(obj, p)
        return obj

    def store(self, step, value):
        if step.get('as'):
            self.names[step['as']] = value
            self.keep.append(value)
            if self.primary is None and type(value).__name__ in CLIENT_CLASSES:
                self.primary = step['as']

    # ------------------------------------------------------------------ constructors and plain calls
    def construct(self, step):
        api = step['api']
        if api == 'own.new':
            C.check(self.mode == 'diag2b', 'own.new only in diagnostics')
            cls = getattr(self.own, step['class'])
            return cls(**{k: (tuple(self.value(v)) if k == 'launch' else self.value(v)) for k, v in (step.get('kwargs') or {}).items()})
        C.check(self.mode == 'sdk', 'SDK constructor in a diagnostic')
        if api == 'Codex.new':
            return self.api.Codex(config=self.config_of(step['config']))
        if api == 'AsyncCodex.new':
            return self.api.AsyncCodex(config=self.config_of(step['config']))
        if api == 'CodexClient.new':
            return self.client_mod.CodexClient(config=self.config_of(step['config']))
        if api == 'Thread.new':
            return self.api.Thread(self.names[step['client']], step['thread_id'])
        if api == 'AsyncThread.new':
            return self.api.AsyncThread(self.names[step['codex']], step['thread_id'])
        if api == 'TurnHandle.new':
            return self.api.TurnHandle(self.names[step['client']], step['thread_id'], step['turn_id'])
        raise C.ChannelError('unknown constructor %s' % api)

    def sync_callable(self, sub):
        """A worker or sync call: returns a zero-argument callable that performs exactly the declared SDK call."""
        api = sub['api']
        if api == 'call':
            target = self.on(sub['on'])
            fn = getattr(target, sub['method'])
            args, kw = [self.value(a) for a in sub.get('args', [])], self.kwargs(sub.get('kwargs'))
            return lambda: fn(*args, **kw)
        if api == 'stream.next':
            handle = sub['handle']

            def nxt():
                gen = self.streams.get(handle)
                if gen is None:
                    gen = self.streams[handle] = self.names[handle].stream()
                return next(gen)
            return nxt
        raise C.ChannelError('worker/sync call api %s' % api)

    def run_sync_call(self, step, fn):
        label = self.label(step)
        try:
            value = fn()
        except StopIteration:
            self.emit('API_RESULT', {'api': label, 'result': None, 'observations': {'end': 'StopIteration'}})
            return
        except Exception as exc:  # noqa: BLE001 - the API lane; BaseException outside the step is never swallowed
            self.error(label, exc)
            return
        self.store(step, value)
        self.result(label, value)

    # ------------------------------------------------------------------ harness steps (sync)
    def wait_class(self, step):
        return 'CLIENT_EFFECT' if (self.case, step['step']) in CLIENT_EFFECT_WAITS else 'HARNESS_PRECONDITION'

    def hook_install(self, step):
        pre = step.get('precondition')
        if pre is not None:
            C.check(HOOK_PRECONDITIONS.get(pre) == 'executors_empty', 'unmapped hook precondition')
            loop = None
            try:
                loop = asyncio.get_running_loop()
            except RuntimeError:
                pass
            ok = len(self.async_client._TURN_START_EXECUTOR._threads) == 0 and (loop is None or loop._default_executor is None)
            if not ok:
                raise H.CaptureFailure('hook precondition failed: %s' % pre)
        self.hooks.install(step['hooks'], resolve_code)
        self.milestone('HOOKS_INSTALLED', {'step': step['step'], 'identities': self.hooks.identities()})

    def probe(self, step):
        v = self.reader.probe(step['path'], step['fn'])
        self.emit('PROBE', {'id': step['id'], 'value': v})
        return v

    def probe_until(self, step):
        t0 = time.monotonic()
        end = t0 + step['timeout_s']
        last = None
        while True:
            try:
                last = self.reader.probe(step['path'], step.get('fn', 'value'))
                if last == step['equals'] and type(last) is type(step['equals']):
                    break
            except H.ProbeRefused as exc:
                last = {'not_yet': str(exc)[:120]}
            if time.monotonic() > end:
                self.milestone('PROBE_UNTIL', {'step': step['step'], 'ok': False, 'value': last, 'class': self.wait_class(step)})
                if self.wait_class(step) == 'HARNESS_PRECONDITION':
                    raise H.CaptureFailure('probe.until deadline at step %d' % step['step'])
                return
            time.sleep(0.005)
        self.milestone('PROBE_UNTIL', {'step': step['step'], 'ok': True, 'value': last, 'elapsed_ms': round((time.monotonic() - t0) * 1000, 1)})

    def barrier_witness(self, step, kind):
        for pr in (step.get('witness') or {}).get('driver_probes', []):
            self.probe(pr)
        self.milestone('STEP_WITNESS', {'step': step['step'], 'id': step.get('id'), 'kind': kind})

    def worker_start(self, step):
        sub = step['call']
        fn = self.sync_callable(sub)

        def on_done(w):
            kind, val = w.outcome
            if kind == 'result':
                if sub.get('as'):
                    self.names[sub['as']] = val
                self.keep.append(val)
                summ, warns = H.summary_v2(val)
                for cat, msg in warns:
                    self.emit('SERIALIZATION_WARNING', {'step': 'WORKER:' + w.name, 'category': cat, 'message': msg})
                # E2B-05: identity token of the result object, retained until the driver exits.
                self.emit('WORKER_RESULT', {'name': w.name, 'kind': 'result', 'value': {'summary': summ, 'identity': id(val)}})
            elif isinstance(val, StopIteration):
                self.emit('WORKER_RESULT', {'name': w.name, 'kind': 'end', 'value': 'StopIteration'})
            else:
                self.emit('WORKER_RESULT', {'name': w.name, 'kind': 'error', 'value': H.error_v2(val, self.keep.append)})

        C.check(step['name'] not in self.workers, 'duplicate worker')
        w = H.Worker(step['name'], fn, on_done)
        self.workers[step['name']] = w
        w.start()

    def worker_parked(self, step, still=False):
        spec = park_spec(step.get('park_point'))
        timeout = step.get('timeout_s', 0)
        if still:
            time.sleep(step['hold_s'])
        for name in step['names']:
            w = self.workers[name]
            end = time.monotonic() + timeout
            while True:
                ok, wit = H.park_witness(w.thread, spec)
                if ok or still or time.monotonic() > end:
                    break
                time.sleep(0.005)
            wit = dict(wit, step=step['step'], still=still, park_point=step.get('park_point'), wait_class=self.wait_class(step))
            self.emit('WORKER_PARKED', {'name': name, 'parked': ok, 'witness': wit})
            if not ok and not still and self.wait_class(step) == 'HARNESS_PRECONDITION':
                raise H.CaptureFailure('worker %s not parked by step %d' % (name, step['step']))

    def worker_join(self, step):
        for name in step['names']:
            done = self.workers[name].done.wait(step['timeout_s'])
            if not done:
                self.milestone('WORKER_JOIN_TIMEOUT', {'step': step['step'], 'name': name, 'class': 'CLIENT_EFFECT'})

    def proc_retain(self, step):
        obj = self.reader.resolve(step['path'])
        self.names[step['as']] = obj
        self.keep.append(obj)
        self.emit('PROC_RETAIN', {'as': step['as'], 'pid': obj.pid, 'args': H.to_json(list(obj.args))})

    def thread_join(self, step):
        if 'path' in step:
            t = self.reader.resolve(step['path'])
        else:
            # R2-F02: by exact name; a name with no live thread counts as an already finished thread.
            live = [x for x in threading.enumerate() if x.name == step['thread_name']]
            t = live[0] if live else None
        t0 = time.monotonic()
        if t is not None:
            t.join(step['timeout_s'])
        alive = t is not None and t.is_alive()
        self.milestone('THREAD_JOIN', {'step': step['step'], 'found': t is not None, 'alive_after': alive,
                                       'elapsed_ms': round((time.monotonic() - t0) * 1000, 1), 'class': self.wait_class(step)})
        if alive and self.wait_class(step) == 'HARNESS_PRECONDITION':
            raise H.CaptureFailure('thread.join deadline at step %d' % step['step'])

    def driver_reap(self, step):
        label = self.label(step)
        p = self.names[step['of']]
        try:
            rc = p.wait(timeout=step['timeout_s'])
        except Exception as exc:  # noqa: BLE001
            self.error(label, exc)
            return
        self.emit('API_RESULT', {'api': label, 'result': rc, 'observations': {}})

    def excepthook_wait(self, step):
        ok = self.exc.wait(step['count'], step['timeout_s'])
        self.milestone('EXCEPTHOOK_WAIT', {'step': step['step'], 'ok': ok, 'count': len(self.exc.records)})
        if not ok and self.wait_class(step) == 'HARNESS_PRECONDITION':
            raise H.CaptureFailure('excepthook.wait deadline at step %d' % step['step'])

    def hook_wait(self, step):
        ok = self.hooks.wait(step['id'], step['event'], step.get('count', 1), step['timeout_s'], step.get('thread_name_prefix'))
        self.milestone('HOOK_WAIT', {'step': step['step'], 'ok': ok})
        if not ok and self.wait_class(step) == 'HARNESS_PRECONDITION':
            raise H.CaptureFailure('hook.wait deadline at step %d' % step['step'])

    def common_step(self, step):
        """Steps identical in both modes. Returns True when handled."""
        api = step['api']
        if api == 'hook.install':
            self.hook_install(step)
        elif api == 'excepthook.install':
            self.exc.install()
        elif api == 'excepthook.wait':
            self.excepthook_wait(step)
        elif api == 'excepthook.snapshot':
            self.emit('API_RESULT', {'api': self.label(step), 'result': self.exc.snapshot(), 'observations': {}})
        elif api == 'hook.wait':
            self.hook_wait(step)
        elif api == 'hook.count':
            self.emit('API_RESULT', {'api': self.label(step), 'result': self.hooks.count(step['id'], step.get('event')), 'observations': {}})
        elif api == 'probe':
            self.probe(step)
        elif api == 'probe.until':
            self.probe_until(step)
        elif api == 'proc.retain':
            self.proc_retain(step)
        elif api == 'clock.mark':
            self.milestone('CLOCK_MARK', {'id': step['id'], 'mono_ns': time.monotonic_ns()})
        elif api == 'driver.reap':
            self.driver_reap(step)
        elif api == 'thread.join':
            self.thread_join(step)
        elif api == 'worker.start':
            self.worker_start(step)
        elif api == 'worker.parked':
            self.worker_parked(step)
        elif api == 'worker.still_parked':
            self.worker_parked(step, still=True)
        elif api == 'worker.join':
            self.worker_join(step)
        elif api.endswith('.new'):
            label = self.label(step)
            try:
                obj = self.construct(step)
            except Exception as exc:  # noqa: BLE001
                self.error(label, exc)
                return True
            self.store(step, obj)
            self.emit('API_RESULT', {'api': label, 'result': {'class': type(obj).__name__}, 'observations': {}})
        elif api == 'attr':
            target = self.on(step['on'])
            self.run_sync_call(step, lambda: getattr(target, step['attr']))
        else:
            return False
        return True

    # ------------------------------------------------------------------ epilogue (D2B-12)
    def transport(self):
        """The retained Popen of the primary client (CodexClient._proc, through Codex/AsyncCodex wrappers)."""
        obj = self.names.get(self.primary)
        if obj is None:
            return None
        for attr in {'Codex': ('_client', '_proc'), 'AsyncCodex': ('_client', '_sync', '_proc'), 'CodexClient': ('_proc',),
                     'OwnClient': ('_proc',), 'OwnAsync': ('_client', '_proc')}[type(obj).__name__]:
            obj = H.static_attr(obj, attr)
            if obj is None:
                return None
        return obj

    def epilogue_pre(self, step):
        kind = step['kind']
        C.check(kind in EPILOGUES and step is self.steps[-1], 'epilogue form/position')
        proc = self.transport()
        self.keep.append(proc)
        if kind.startswith('eof_'):
            C.check(proc is not None and proc.stdin is not None and not proc.stdin.closed, 'EOF barrier: no live transport stdin')
            proc.stdin.close()
            self.milestone('CLIENT_STDIN_CLOSED', {'source_sdk_claim': False})
        self.hooks.stop()
        self.done = True
        if self.hooks.errors:
            self.milestone('HOOK_RECORD_ERRORS', {'errors': [C.clip(e, 200) for e in self.hooks.errors[:8]], 'count': len(self.hooks.errors)})
        for name, w in self.workers.items():
            if not w.done.is_set():  # consumer.results_exact: parked_at_calls_done needs a frame witness at CALLS_DONE
                ok, wit = H.park_witness(w.thread, None)
                self.emit('WORKER_PARKED', {'name': name, 'parked': ok, 'witness': dict(wit, at_calls_done=True)})
        popens = {}
        for name, obj in list(self.names.items()):
            if type(obj).__name__ == 'Popen':
                popens[name] = obj.returncode
        for hid, rows in self.hooks.retained_objs.items():
            for i, row in enumerate(rows):
                for expr, obj in row.items():
                    if type(obj).__name__ == 'Popen':
                        popens['$hook:%s:%s#%d' % (hid, expr, i + 1)] = obj.returncode
        if proc is not None:
            popens['$transport'] = proc.returncode
        self.milestone('CALLS_DONE', {'epilogue': kind, 'primary': self.primary, 'popen_returncodes': popens, 'source_sdk_claim': False})
        return proc

    def epilogue_post(self, proc):
        self.milestone('SDK_CLIENT_CLOSED', {'returncode': None if proc is None else proc.returncode, 'source_sdk_claim': False})

    def run_sync(self):
        for step in self.steps:
            self.milestone('STEP_BEGIN', {'step': step['step'], 'api': step['api']})
            api = step['api']
            if self.common_step(step):
                continue
            if api == 'call':
                C.check(not step.get('await'), 'await in a sync slot')
                self.run_sync_call(step, self.sync_callable(step))
            elif api == 'stream.next':
                self.run_sync_call(step, self.sync_callable(step))
            elif api == 'barrier':
                self.barrier_witness(step, 'BARRIER')
                self.ch.control('STEP_RELEASE')
            elif api == 'epilogue':
                proc = self.epilogue_pre(step)
                self.ch.control('RELEASE_EXIT')
                self.close_open(step['kind'])
                self.epilogue_post(proc)
            else:
                raise C.ChannelError('step api %s outside the sync vocabulary' % api)

    def close_open(self, kind):
        """SDK close after RELEASE_EXIT (D2B-12); the _if_open form only closes what the case left open (no new step)."""
        obj = self.names.get(self.primary)
        if obj is None or self.primary in self.closed:
            return
        self.closed.add(self.primary)
        if kind == 'calls_done_release_exit_then_sdk_close_if_open' and self.transport() is None:
            return
        obj.close()

    # ------------------------------------------------------------------ async mode (CAP-2B-ASYNC-DRIVER)
    async def await_control(self, command):
        """Barrier wait that leaves the loop free without the default executor (own thread + call_soon_threadsafe)."""
        loop = asyncio.get_running_loop()
        fut = loop.create_future()

        def wait():
            try:
                self.ch.control(command)
                loop.call_soon_threadsafe(lambda: fut.done() or fut.set_result(None))
            except BaseException as exc:  # noqa: BLE001
                loop.call_soon_threadsafe(lambda: fut.done() or fut.set_exception(C.ChannelError(str(exc))))
        threading.Thread(target=wait, name='cvg-barrier-wait', daemon=True).start()
        await fut

    async def async_call(self, step):
        label = self.label(step)
        target = self.on(step['on'])
        fn = getattr(target, step['method'])
        args, kw = [self.value(a) for a in step.get('args', [])], self.kwargs(step.get('kwargs'))
        if step.get('await'):
            value = await fn(*args, **kw)
        else:
            value = fn(*args, **kw)
        return label, value

    async def run_async_call(self, step):
        try:
            label, value = await self.async_call(step)
        except Exception as exc:  # noqa: BLE001 - CancelledError (BaseException) is never swallowed here
            self.error(self.label(step), exc)
            return
        self.store(step, value)
        self.result(label, value)

    async def task_body(self, sub):
        _label, value = await self.async_call(sub)
        return value

    async def run_async(self):
        for step in self.steps:
            self.milestone('STEP_BEGIN', {'step': step['step'], 'api': step['api']})
            api = step['api']
            if self.common_step(step):
                continue
            if api == 'call':
                await self.run_async_call(step)
            elif api == 'barrier':
                self.barrier_witness(step, 'BARRIER')
                await self.await_control('STEP_RELEASE')
            elif api == 'task.create':
                C.check(step['call']['api'] == 'call' and step['call'].get('await') is True, 'task call')
                t = asyncio.ensure_future(self.task_body(step['call']))
                t.set_name(step['name'])
                self.tasks[step['name']] = t
                self.keep.append(t)
                self.emit('TASK_EVENT', {'name': step['name'], 'event': 'created'})
            elif api == 'task.cancel':
                self.emit('CANCEL', {'step': step['step']})
                self.tasks[step['name']].cancel()
            elif api == 'task.await':
                await self.task_await(step)
            elif api == 'loop.yield_until':
                await self.yield_until(step)
            elif api == 'loop.block_release_wait_cancel':
                self.block_release_wait_cancel(step)
            elif api == 'heartbeat':
                for _ in range(step['ticks']):
                    await asyncio.sleep(0)
                self.emit('API_RESULT', {'api': self.label(step), 'result': step['ticks'], 'observations': {}})
            elif api == 'async_with.enter':
                obj = self.on(step['on'])
                try:
                    value = await obj.__aenter__()
                except Exception as exc:  # noqa: BLE001
                    self.error(self.label(step), exc)
                    continue
                self.result(self.label(step), value)
            elif api in ('astream.next', 'astream.aclose'):
                await self.astream(step)
            elif api == 'epilogue':
                proc = self.epilogue_pre(step)
                await self.await_control('RELEASE_EXIT')
                await self.aclose_open(step['kind'])
                self.epilogue_post(proc)
            else:
                raise C.ChannelError('step api %s outside the async vocabulary' % api)

    async def task_await(self, step):
        label = self.label(step)
        task = self.tasks[step['name']]
        try:
            value = await task
        except asyncio.CancelledError as exc:
            if not task.cancelled():
                raise  # the driver's own task is being cancelled: never swallowed
            self.emit('API_CANCELLED', {'name': type(exc).__name__, 'message': C.clip(label, 400)})
            self.emit('TASK_EVENT', {'name': step['name'], 'event': 'cancelled'})
            return
        except Exception as exc:  # noqa: BLE001
            self.error(label, exc)
            self.emit('TASK_EVENT', {'name': step['name'], 'event': 'error'})
            return
        self.store(step, value)
        self.result(label, value)
        self.emit('TASK_EVENT', {'name': step['name'], 'event': 'done'})

    async def yield_until(self, step):
        pr = step['probe']
        n, last = 0, None
        while n < step['max_yields']:
            await asyncio.sleep(0)
            n += 1
            try:
                last = self.reader.probe(pr['path'], pr['fn'])
            except (H.ProbeRefused, TypeError) as exc:
                last = {'not_yet': str(exc)[:120]}  # e.g. len of None before the first waiter exists
                continue
            if last == pr['equals'] and type(last) is type(pr['equals']):
                self.milestone('YIELD_UNTIL', {'step': step['step'], 'yields': n, 'value': last})
                return
        self.milestone('YIELD_UNTIL', {'step': step['step'], 'yields': n, 'value': last, 'ok': False})
        raise H.CaptureFailure('loop.yield_until: max_yields at step %d' % step['step'])

    def block_release_wait_cancel(self, step):
        """No yield to the loop: synchronous release request, wait for the hook event on a Condition, then task.cancel()."""
        wh = step['wait_hook']
        h = self.hooks.hooks[wh['id']]
        event = h.events[-1]
        before = self.hooks.count(wh['id'], event, wh.get('thread_name_prefix'))
        self.milestone('STEP_WITNESS', {'step': step['step'], 'id': 'block_release', 'kind': 'BLOCK_RELEASE'})
        self.ch.control('STEP_RELEASE')  # supervisor: RELEASE_REPLY first, then STEP_RELEASE (barrier plan)
        ok = self.hooks.wait(wh['id'], event, before + 1, max(0.1, min(10.0, self.ch.remaining() - 1)), wh.get('thread_name_prefix'))
        if not ok:
            raise H.CaptureFailure('block_release_wait_cancel: hook %s not seen' % wh['id'])
        self.emit('CANCEL', {'step': step['step']})
        self.tasks[step['cancel']].cancel()

    async def astream(self, step):
        label = self.label(step)
        handle = step['handle']
        agen = self.astreams.get(handle)
        if agen is None:
            agen = self.astreams[handle] = self.names[handle].stream()
        try:
            if step['api'] == 'astream.aclose':
                await agen.aclose()
                self.emit('API_RESULT', {'api': label, 'result': None, 'observations': {}})
                return
            value = await agen.__anext__()
        except StopAsyncIteration:
            self.emit('API_RESULT', {'api': label, 'result': None, 'observations': {'end': 'StopAsyncIteration'}})
            return
        except Exception as exc:  # noqa: BLE001
            self.error(label, exc)
            return
        self.result(label, value)

    async def aclose_open(self, kind):
        obj = self.names.get(self.primary)
        if obj is None or self.primary in self.closed:
            return
        self.closed.add(self.primary)
        if kind == 'calls_done_release_exit_then_sdk_close_if_open' and self.transport() is None:
            return
        if kind == 'eof_calls_done_release_exit_then_sdk_aclose' or asyncio.iscoroutinefunction(getattr(obj, 'close', None)):
            await (obj.close() if hasattr(obj, 'close') else obj.aclose())
        else:
            obj.close()

    async def final_async(self):
        """finally: closes what is still open, with no new observed step."""
        if not self.done:
            return
        obj = self.names.get(self.primary)
        if obj is not None and self.primary not in self.closed:
            self.closed.add(self.primary)
            res = obj.close() if hasattr(obj, 'close') else obj.aclose()
            if asyncio.iscoroutine(res):
                await res


def run_2b(config, ch, mode):
    interp = Interp(config, ch, mode)
    if interp.ci.get('driver_mode') == 'async':
        async def main_async():
            try:
                await interp.run_async()
            finally:
                await interp.final_async()
        asyncio.run(main_async())
    else:
        try:
            interp.run_sync()
        finally:
            if interp.done:
                obj = interp.names.get(interp.primary)
                if obj is not None and interp.primary not in interp.closed:
                    interp.closed.add(interp.primary)
                    obj.close()

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


def sdk_gate(config, ch):
    """SDK mode: current SDK admission, closed sealed trees, then the dependency identity for the driver BEGIN (R2-F06)."""
    a = C.admission(config, 'sdk')
    for root in ('/profile/sdk-python/', '/profile/python-deps/'):
        C.verify_tree(root, a['files'])
    sys.dont_write_bytecode = True  # /profile is read-only; never attempt bytecode next to the sealed trees
    sys.path[:0] = ['/profile/sdk-python', '/profile/python-deps']
    import pydantic  # noqa: E402 - gated import of the sealed dependency
    import pydantic_core  # noqa: E402
    ident = {'pydantic': str(pydantic.VERSION), 'pydantic_core': str(pydantic_core.__version__)}
    C.check(ident == DEPENDENCY, 'dependency identity %r differs from the sealed %r' % (ident, DEPENDENCY))
    C.check(pydantic.__file__.startswith('/profile/python-deps/') and pydantic_core.__file__.startswith('/profile/python-deps/'),
            'dependency loaded outside the sealed tree')
    ch.begin['dependency_identity'] = ident


def main():
    global C, H
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
        for p in ('/profile/fixture-cases.json', '/profile/adapter-python.py', '/profile/fixture-rpc.py', '/profile/harness2b.py',
                  '/profile/own2b.py'):
            C.check(C.is_hex(ch.admission['files'].get(p, '')), 'unbound ' + p)
        C.selected_fixture(config)
        C.check(config['mode'] in ('diagnostic', 'sdk'), 'driver mode')
        H = _load_profile_module('harness2b')
        if config['mode'] == 'sdk':
            sdk_gate(config, ch)
        elif config['case'] in DIAG_2B:
            _load_profile_module('own2b')
        timer.start()
        ch.start()
        if config['mode'] == 'sdk':
            run_2b(config, ch, 'sdk')
        elif config['case'] in DIAG_2B:
            run_2b(config, ch, 'diag2b')
        else:
            run_diag(config, ch)
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
