"""Role-side harness of the batch 2B driver (capability-contracts-2b.json). Standard library only.

Importing this module performs no I/O and imports neither the SDK nor Pydantic; the driver passes the objects it built.
It holds the observation machinery shared by the SDK interpreter and by the own-code diagnostics:

- StaticReader (CAP-2B-CONC-BARRIER, E2B-08): probe paths read only instance __dict__ entries, slot member descriptors,
  dict keys and list/tuple/deque indexes; a property, another descriptor, a method or a missing name is refused (ProbeRefused,
  INVALID_CAPTURE). fn: value, len, keys (sorted), is_none, type_name, enum_value, hasattr:<n>, vars_has:<n>, is_ref:<name>,
  equals_driver_environ, done (driver tasks only).
- HookSet: sys.setprofile (current thread) + threading.setprofile (new threads) collectors matching code objects by identity;
  events 'call' and 'return' (return also on unwind, call/return on every generator resumption, as CPython 3.12 emits them);
  occurrence counted per (id, event) (R2-F01, binding lead decision); records only the declared attributes; retain:<expr>
  keeps a reference without touching arguments, return value or state.
- park_witness: stack of sys._current_frames() of the driver's own process.
- ExcepthookRecorder: threading.excepthook replaced by a recorder (thread, class, str) that never prints.
- summary_v2 / error_v2 (CAP-PY-SDKCALLS-2B result_summary_v2 / error_detail_v2) with Pydantic serialization warnings
  captured and returned separately (they never decide).

Continuation 3-2 (freeze-r4-c3-delta.json D3-05): HookSet.seen_threads registers the name of every thread whose first profile event
is seen while the hooks are active (threads started after hook.install and the installing thread); the driver uses it as the thread
registry of the wait classes and of zero_calls_client_effect_unless_started.

Batch 2B-2 (DX100-G02:IMPLEMENT-AND-ADMIT-SDK-SOURCE-BATCH-2B-2, freeze-r4-2b-delta.json D2B-05..08):
- ShimSet (CAP-2B-CLOCK-RANDOM, D2B-05): module attributes random/time of a declared target replaced by shim objects that
  expose only the declared callables (uniform(a, b) -> a or b by the case script; sleep(s) recorded without sleeping;
  monotonic() -> scripted values); any other attribute or an exhausted script is a violation (INVALID_CAPTURE); remove
  restores the original objects by identity and re-checks that the stdlib random/time objects and sys.modules are untouched.
- FaultSet (CAP-2B-FAULT-CUT, D2B-06): instance-attribute wrappers (call_through_then_raise, raise_before_call) and the
  raise_on_call wrapper of a composed stream callable; closed exception list RuntimeError(message) and KeyboardInterrupt();
  every firing emits FAULT {target, call, count}; remove deletes the instance attribute so lookup goes back to the class.
- summary_v2: login handles {class, login_id, auth_url | verification_url, user_code}; start_goal_operation {state_class,
  turn_id}; error_v2 keeps the full errors() list (type, loc, msg) of a ValidationError (model.errors_recorded).
- parts_of: a frame field above the metadata budget of the channel (META 1024) travels as base64 PART milestones keyed by the
  sha256 of its compact JSON; the evaluator reassembles them (independent implementation in acceptance.py).
"""
import base64
import enum
import hashlib
import json
import os
import random
import sys
import threading
import time
import types
import warnings

DUMP_LOCK = threading.Lock()  # warnings.catch_warnings is process-global: one dump at a time


class ProbeRefused(Exception):
    """A probe that is not a static read (property, descriptor, method call, unknown name): INVALID_CAPTURE."""


class CaptureFailure(Exception):
    """A harness precondition did not hold (deadline of a harness wait, missing hook, ...): INVALID_CAPTURE."""


def qualified(cls):
    return '%s.%s' % (cls.__module__, cls.__qualname__)


def to_json(x, depth=0):
    """E2B-08: keys ordered, tuple -> list, enum -> .value; anything else that is not plain JSON is refused."""
    if depth > 12:
        raise ProbeRefused('value nesting')
    if x is None or isinstance(x, (bool, str)):
        return x
    if isinstance(x, enum.Enum):
        return to_json(x._value_, depth + 1)
    if isinstance(x, int):
        return int(x)
    if isinstance(x, float):
        if x != x or x in (float('inf'), float('-inf')):
            raise ProbeRefused('non-finite float')
        return x
    if isinstance(x, (list, tuple)):
        return [to_json(v, depth + 1) for v in x]
    if isinstance(x, dict):
        out = {}
        for k in sorted(x, key=lambda k: (str(type(k)), k)):
            if not isinstance(k, (str, int)) or isinstance(k, bool):
                raise ProbeRefused('dict key type %s' % type(k).__name__)
            out[str(k)] = to_json(x[k], depth + 1)
        return out
    raise ProbeRefused('not a JSON value: %s' % type(x).__name__)


# ------------------------------------------------------------------------------------------------ static reads

def static_attr(obj, name):
    """Instance attribute without running user code: slot member descriptor or instance __dict__ entry."""
    for klass in type(obj).__mro__:
        if name in klass.__dict__:
            d = klass.__dict__[name]
            if isinstance(d, types.MemberDescriptorType):
                try:
                    return d.__get__(obj, type(obj))
                except AttributeError:
                    raise ProbeRefused('empty slot %s' % name) from None
            if hasattr(type(d), '__set__') or hasattr(type(d), '__delete__'):
                raise ProbeRefused('data descriptor %s.%s (property or similar)' % (klass.__qualname__, name))
            break  # a non-data class attribute (method, cached_property, constant): only an instance entry may shadow it
    try:
        inst = object.__getattribute__(obj, '__dict__')
    except AttributeError:
        raise ProbeRefused('no instance attribute %s' % name) from None
    if name in inst:
        return inst[name]
    raise ProbeRefused('no instance attribute %s (class attribute, method or missing)' % name)


def static_has(obj, name):
    try:
        static_attr(obj, name)
        return True
    except ProbeRefused:
        return False


def static_key(obj, key):
    if type(obj) is dict:
        if key in obj:
            return dict.__getitem__(obj, key)
        if key.lstrip('-').isdigit() and int(key) in obj:
            return dict.__getitem__(obj, int(key))
        raise ProbeRefused('missing key [%s]' % key)
    if (type(obj) in (list, tuple) or type(obj).__name__ == 'deque') and key.lstrip('-').isdigit():
        i = int(key)
        if -len(obj) <= i < len(obj):
            return obj[i]
        raise ProbeRefused('index out of range [%s]' % key)
    raise ProbeRefused('key read on %s' % type(obj).__name__)


class StaticReader:
    """Resolve probe paths: first item a case name, $hook:<id>:<expr> or $task:<name>; then .attr or [key]."""

    def __init__(self, names, hooks=None, tasks=None):
        self.names, self.hooks, self.tasks = names, hooks, tasks if tasks is not None else {}

    def root(self, head):
        if head.startswith('$hook:'):
            _, hid, expr = head.split(':', 2)
            if self.hooks is None:
                raise ProbeRefused('no hook set')
            return self.hooks.retained(hid, expr)
        if head.startswith('$task:'):
            name = head[len('$task:'):]
            if name not in self.tasks:
                raise ProbeRefused('unknown task %s' % name)
            return self.tasks[name]
        if head not in self.names:
            raise ProbeRefused('unknown name %s' % head)
        return self.names[head]

    def resolve(self, path):
        if not isinstance(path, list) or not path or not isinstance(path[0], str):
            raise ProbeRefused('probe path')
        obj = self.root(path[0])
        for item in path[1:]:
            if not isinstance(item, str):
                raise ProbeRefused('path item')
            if item.startswith('.') and len(item) > 1:
                obj = static_attr(obj, item[1:])
            elif item.startswith('[') and item.endswith(']'):
                obj = static_key(obj, item[1:-1])
            else:
                raise ProbeRefused('path item %r' % item)
        return obj

    def apply(self, fn, obj, path=None):
        if fn == 'value':
            return to_json(obj)
        if fn == 'len':
            if type(obj) in (dict, list, tuple, str, set, frozenset) or type(obj).__name__ == 'deque':
                return len(obj)
            raise ProbeRefused('len of %s' % type(obj).__name__)  # e.g. None before the first waiter: 'not yet' in yield_until
        if fn == 'keys':
            if type(obj) is not dict:
                raise ProbeRefused('keys of %s' % type(obj).__name__)
            return to_json(sorted(obj, key=lambda k: (str(type(k)), k)))
        if fn == 'is_none':
            return obj is None
        if fn == 'type_name':
            return type(obj).__name__
        if fn == 'enum_value':
            if not isinstance(obj, enum.Enum):
                raise ProbeRefused('enum_value of %s' % type(obj).__name__)
            return to_json(obj._value_)
        if fn.startswith('hasattr:'):
            return static_has(obj, fn.split(':', 1)[1])
        if fn.startswith('vars_has:'):
            try:
                inst = object.__getattribute__(obj, '__dict__')
            except AttributeError:
                return False
            return fn.split(':', 1)[1] in inst
        if fn.startswith('is_ref:'):
            name = fn.split(':', 1)[1]
            return name in self.names and obj is self.names[name]
        if fn == 'equals_driver_environ':
            return type(obj) is dict and obj == dict(os.environ)
        if fn == 'done':
            if not (path and isinstance(path[0], str) and path[0].startswith('$task:') and len(path) == 1):
                raise ProbeRefused('done only for driver tasks')
            return obj.done()
        raise ProbeRefused('probe fn %s' % fn)

    def probe(self, path, fn):
        return self.apply(fn, self.resolve(path), path)


# ------------------------------------------------------------------------------------------------ hooks

def expr_read(frame, expr):
    """Hook record expression over frame locals: 'self', 'self._proc', 'self._state.id' (static reads only)."""
    parts = expr.split('.')
    loc = frame.f_locals
    if parts[0] not in loc:
        raise ProbeRefused('no local %s' % parts[0])
    obj = loc[parts[0]]
    for p in parts[1:]:
        obj = static_attr(obj, p)
    return obj


class Hook:
    def __init__(self, spec, code):
        self.id = spec['id']
        ev = spec['event']
        self.events = ('call', 'return') if ev == 'call+return' else (ev,)
        if any(e not in ('call', 'return') for e in self.events):
            raise CaptureFailure('hook event %r' % ev)
        self.record = list(spec.get('record', []))
        self.code = code
        self.identity = {'file': code.co_filename, 'qualname': code.co_qualname, 'first_line': code.co_firstlineno}


class HookSet:
    """Profile collectors matching code objects by identity. emit(kind, data) sends the HOOK_EVENT frame."""

    def __init__(self, emit=None):
        self.emit = emit
        self.by_code = {}
        self.hooks = {}
        self.counts = {}
        self.events = []
        self.retained_objs = {}
        self.cond = threading.Condition()
        self.active = False
        self.errors = []
        self.seen_threads = set()  # C3-2 (D3-05, R2-F03): names of the threads seen by the profile while active
        self._seen_idents = set()

    def install(self, specs, resolve_code):
        for spec in specs:
            code = resolve_code(spec['code'])
            if not isinstance(code, types.CodeType):
                raise CaptureFailure('hook %s: code object not resolved' % spec['id'])
            h = Hook(spec, code)
            if h.id in self.hooks:
                raise CaptureFailure('duplicate hook id %s' % h.id)
            self.hooks[h.id] = h
            self.by_code.setdefault(code, []).append(h)
        self.active = True
        threading.setprofile(self._profile)  # threads started after this point (SDK reader, executors)
        sys.setprofile(self._profile)  # the current thread (the loop thread in async mode)

    def stop(self):
        """CALLS_DONE: no further events are recorded (references stay retained until the driver exits)."""
        self.active = False
        threading.setprofile(None)
        sys.setprofile(None)

    def _profile(self, frame, event, arg):
        if event != 'call' and event != 'return':
            return
        if self.active:
            ident = threading.get_ident()
            if ident not in self._seen_idents:  # first event of this thread: register its name (thread registry, D3-05)
                self._seen_idents.add(ident)
                self.seen_threads.add(threading.current_thread().name)
        hs = self.by_code.get(frame.f_code)
        if hs is None or not self.active:
            return
        for h in hs:
            if event in h.events:
                try:
                    self._record(h, frame, event)
                except BaseException as exc:  # noqa: BLE001 - a hook must never change the observed code
                    self.errors.append('%s: %s' % (h.id, exc))

    def _record(self, h, frame, event):
        """Declared attributes only. A value that is not plain JSON or not readable statically is recorded as such
        ({'unrecorded': reason}); the event itself is never dropped."""
        rec, retained = {}, {}
        tname = threading.current_thread().name
        for r in h.record:
            try:
                if r == 'thread_name':
                    rec['thread_name'] = tname
                elif r.startswith('arg:'):
                    rec[r] = to_json(frame.f_locals.get(r[4:]))
                elif r.startswith('retain:'):
                    obj = expr_read(frame, r[7:])
                    retained[r[7:]] = obj
                    rec[r] = {'retained': True, 'type': type(obj).__name__, 'is_none': obj is None}
                else:
                    rec[r] = to_json(expr_read(frame, r))
            except ProbeRefused as exc:
                rec[r] = {'unrecorded': str(exc)[:120]}
                self.errors.append('%s %s: %s' % (h.id, r, exc))
        with self.cond:
            key = (h.id, event)
            occ = self.counts.get(key, 0) + 1  # R2-F01: occurrence per (id, event)
            self.counts[key] = occ
            if retained:
                self.retained_objs.setdefault(h.id, []).append(retained)
            ev = {'id': h.id, 'event': event, 'occurrence': occ, 'thread_name': tname, 'record': rec, 'mono_ns': time.monotonic_ns()}
            self.events.append(ev)
            self.cond.notify_all()
        if self.emit is not None:
            self.emit('HOOK_EVENT', {'id': h.id, 'event': event, 'occurrence': occ, 'thread_name': tname, 'record': rec})

    def retained(self, hid, expr, index=0):
        rows = self.retained_objs.get(hid) or []
        if len(rows) <= index or expr not in rows[index]:
            raise ProbeRefused('no retained %s of hook %s' % (expr, hid))
        return rows[index][expr]

    @staticmethod
    def _thread_ok(e, thread_prefix, thread_name):
        return ((thread_prefix is None or e['thread_name'].startswith(thread_prefix))
                and (thread_name is None or e['thread_name'] == thread_name))

    def count(self, hid, event=None, thread_prefix=None, thread_name=None):
        with self.cond:
            return sum(1 for e in self.events if e['id'] == hid and (event is None or e['event'] == event)
                       and self._thread_ok(e, thread_prefix, thread_name))

    def single_event(self, hid):
        """The event of a hook declared with one event; None for call+return (the step must name the event)."""
        h = self.hooks.get(hid)
        if h is None:
            raise CaptureFailure('unknown hook %s' % hid)
        return h.events[0] if len(h.events) == 1 else None

    def wait(self, hid, event, count, timeout, thread_prefix=None, thread_name=None):
        """Wait until `count` matching events exist; False on timeout (the caller classifies the wait)."""
        end = time.monotonic() + timeout
        with self.cond:
            while True:
                n = sum(1 for e in self.events if e['id'] == hid and e['event'] == event and self._thread_ok(e, thread_prefix, thread_name))
                if n >= count:
                    return True
                left = end - time.monotonic()
                if left <= 0:
                    return False
                self.cond.wait(left)

    def identities(self):
        return {hid: h.identity for hid, h in self.hooks.items()}


# ------------------------------------------------------------------------------------------------ park witness

COND_WAIT = threading.Condition.wait.__code__


def stack_of(thread):
    frame = sys._current_frames().get(thread.ident)
    out = []
    while frame is not None and len(out) < 24:
        out.append((frame.f_code, frame.f_lineno))
        frame = frame.f_back
    return out


def park_witness(thread, spec):
    """spec: None (top frame threading.Condition.wait) | {'code': code, 'line': n} | {'code': code, 'caller': code}
    | {'code': code, 'caller': code, 'above': [codes]} (2B-2: the frame of `code` is in the stack, every frame above it is one
    of `above` (the blocking wait inside it) and its immediate caller is `caller`)."""
    st = stack_of(thread)
    names = [[c.co_qualname, ln] for c, ln in st[:8]]
    if not thread.is_alive() or not st:
        return False, {'alive': thread.is_alive(), 'stack': names}
    top, line = st[0]
    if spec is None:
        ok = top is COND_WAIT
    elif 'line' in spec:
        ok = top is spec['code'] and line == spec['line']
    elif 'above' in spec:
        idx = [i for i, (c, _) in enumerate(st) if c is spec['code']]
        ok = (bool(idx) and all(any(c is a for a in spec['above']) for c, _ in st[:idx[0]]) and idx[0] + 1 < len(st)
              and st[idx[0] + 1][0] is spec['caller'])
    else:
        ok = top is spec['code'] and any(c is spec['caller'] for c, _ in st[1:])
    return ok, {'alive': True, 'top': [top.co_qualname, line], 'stack': names}


def executor_thread_of(prefix, spec):
    """$executor-thread-of: the single executor thread (name prefix) whose stack has the parking point; else CaptureFailure."""
    cands = [t for t in threading.enumerate() if t.name.startswith(prefix) and park_witness(t, spec)[0]]
    if len(cands) != 1:
        raise CaptureFailure('$executor-thread-of: %d candidates' % len(cands))
    return cands[0]


# ------------------------------------------------------------------------------------------------ excepthook

class ExcepthookRecorder:
    def __init__(self, emit=None):
        self.emit = emit
        self.records = []
        self.cond = threading.Condition()
        self.orig = None

    def install(self):
        self.orig = threading.excepthook
        threading.excepthook = self._hook

    def _hook(self, args):
        rec = {'thread_name': args.thread.name if args.thread is not None else None,
               'class': qualified(args.exc_type), 'str': str(args.exc_value)[:300]}
        with self.cond:
            self.records.append(rec)
            self.cond.notify_all()
        if self.emit is not None:
            self.emit('EXCEPTHOOK_RECORD', rec)

    def wait(self, count, timeout):
        end = time.monotonic() + timeout
        with self.cond:
            while len(self.records) < count:
                left = end - time.monotonic()
                if left <= 0:
                    return False
                self.cond.wait(left)
            return True

    def snapshot(self):
        with self.cond:
            return [dict(r) for r in self.records]


# ------------------------------------------------------------------------------------------------ workers

class Worker:
    def __init__(self, name, fn, on_done):
        self.name, self.fn, self.on_done = name, fn, on_done
        self.done = threading.Event()
        self.outcome = None
        self.thread = threading.Thread(target=self._run, name=name, daemon=True)

    def _run(self):
        try:
            value = self.fn()
            self.outcome = ('result', value)
        except BaseException as exc:  # noqa: BLE001 - the worker result is the observation
            self.outcome = ('error', exc)
        try:
            self.on_done(self)
        finally:
            self.done.set()

    def start(self):
        self.thread.start()


# ------------------------------------------------------------------------------------------------ summaries

def model_dump(value, **kw):
    """model_dump(by_alias=True, mode='json' or the declared arguments) with serialization warnings captured:
    (dump, [(category, message)])."""
    args = {'by_alias': True, 'mode': 'json'}
    args.update(kw)
    with DUMP_LOCK:
        with warnings.catch_warnings(record=True) as w:
            warnings.simplefilter('always')
            dump = value.model_dump(**args)
        return dump, [(qualified(x.category), str(x.message)[:200]) for x in w]


LOGIN_HANDLES = ('ChatgptLoginHandle', 'DeviceCodeLoginHandle', 'AsyncChatgptLoginHandle', 'AsyncDeviceCodeLoginHandle')


def summary_v2(value):
    """CAP-PY-SDKCALLS-2B result_summary_v2 -> (summary, warnings)."""
    if value is None:
        return None, []
    tname = type(value).__name__
    if tname == 'Notification' and hasattr(value, 'method') and hasattr(value, 'payload'):
        pl = value.payload
        out = {'NOTE': True, 'method': value.method, 'payload_class': type(pl).__name__}
        if type(pl).__name__ == 'UnknownNotification':
            out['params'] = to_json(pl.params)
            return out, []
        dump, warns = model_dump(pl)
        out['dump'] = dump
        return out, warns
    if tname in ('TurnHandle', 'AsyncTurnHandle'):
        return {'turn_handle.id': value.id, 'thread_id': value.thread_id}, []
    if tname in LOGIN_HANDLES:  # 2B-2: handles de login {class, login_id, auth_url | verification_url, user_code}
        out = {'class': tname, 'login_id': to_json(static_attr(value, 'login_id'))}
        for k in ('auth_url', 'verification_url', 'user_code'):
            if static_has(value, k):
                out[k] = to_json(static_attr(value, k))
        return out, []
    if type(value) is tuple and len(value) == 2 and type(value[0]).__name__ == '_GoalOperationState' and isinstance(value[1], str):
        return {'state_class': '_GoalOperationState', 'turn_id': value[1]}, []  # start_goal_operation
    if hasattr(value, 'model_dump') and callable(value.model_dump):
        dump, warns = model_dump(value)
        return dump, warns
    if isinstance(value, (list, tuple)):
        out, warns = [], []
        for x in value:
            s_, w_ = summary_v2(x)
            out.append(s_)
            warns += w_
        return out, warns
    if isinstance(value, (bool, int, float, str, dict)) and not isinstance(value, enum.Enum):
        try:
            return to_json(value), []
        except ProbeRefused:
            return {'class': tname, 'unserializable': True}, []
    return {'class': tname}, []


def error_v2(exc, keep):
    """CAP-PY-SDKCALLS-2B error_detail_v2; keep(obj) retains the exception until CALLS_DONE (identity token)."""
    keep(exc)
    d = {'class': qualified(type(exc)), 'str': str(exc)[:400], 'identity': id(exc),
         'mro': [qualified(k) for k in type(exc).__mro__][:8]}
    code = getattr(exc, 'code', None)
    if isinstance(code, int) and not isinstance(code, bool):
        d['code'] = code
    msg = exc.__dict__.get('message') if hasattr(exc, '__dict__') else None
    if isinstance(msg, str):
        d['message_attr'] = msg[:300]
    data = exc.__dict__.get('data') if hasattr(exc, '__dict__') else None
    if data is not None:
        try:
            d['data'] = to_json(data)
        except ProbeRefused:
            d['data'] = {'unserializable': type(data).__name__}
    cause = exc.__cause__
    if cause is not None:
        d['cause'] = {'class': qualified(type(cause)), 'str': str(cause)[:300]}
    if type(exc).__name__ == 'ValidationError' and callable(getattr(exc, 'errors', None)):
        try:
            errs = exc.errors()
            d['error_count'] = exc.error_count()
            d['errors'] = [{'type': e.get('type'), 'loc': [x if isinstance(x, (int, str)) else str(x) for x in e.get('loc', ())],
                            'msg': str(e.get('msg'))[:160]} for e in errs][:32]  # model.errors_recorded: the full list (cap 32)
            d['errors_truncated'] = len(errs) > 32
        except Exception:  # noqa: BLE001 - detail only
            d['errors'] = None
    return d


# ------------------------------------------------------------------------------------------------ big fields (PART)

PART_THRESHOLD = 600  # compact JSON bytes of one frame field; above it the field travels as PART milestones
PART_BYTES = 480  # raw bytes per PART (base64 640 chars: frame below the channel META cap of 1024 bytes)


def parts_of(value):
    """None when the field fits; else (sha256, total bytes, [base64 pieces]) of its compact UTF-8 JSON."""
    raw = json.dumps(value, separators=(',', ':'), ensure_ascii=False, allow_nan=False).encode('utf-8')
    if len(raw) <= PART_THRESHOLD:
        return None
    pieces = [base64.b64encode(raw[i:i + PART_BYTES]).decode('ascii') for i in range(0, len(raw), PART_BYTES)]
    return hashlib.sha256(raw).hexdigest(), len(raw), pieces


# ------------------------------------------------------------------------------------------------ clock and random (D2B-05)

class ShimViolation(Exception):
    """A shim attribute outside the declared callables or an exhausted script: recorded, judged by shim.scope_exact."""


SHIM_SHAPES = {'retry': {'random': ('uniform',), 'time': ('sleep',)}, 'goal': {'time': ('monotonic',)}}


class _ShimObject:
    """Replacement of one module attribute: only the declared callables exist; anything else is a violation."""

    def __init__(self, owner, target, attr, allowed):
        object.__setattr__(self, '_cvg_shim', (owner, target, attr, tuple(allowed)))

    def __getattr__(self, name):
        owner, target, attr, allowed = object.__getattribute__(self, '_cvg_shim')
        if name in allowed:
            def call(*args, **kwargs):
                return owner.call(target, name, args, kwargs)
            return call
        raise owner.violation(target, 'attribute %s.%s outside the declared shim' % (attr, name))

    def __setattr__(self, name, value):
        owner, target, attr, _ = object.__getattribute__(self, '_cvg_shim')
        raise owner.violation(target, 'write of %s.%s' % (attr, name))


class ShimSet:
    """Shims installed on module attributes of a declared target; every call is recorded (SHIM_RECORD)."""

    def __init__(self, emit=None, milestone=None):
        self.emit, self.milestone = emit, milestone
        self.active = {}
        self.violations = []
        self.lock = threading.Lock()

    @staticmethod
    def stdlib_identity():
        return {'random.uniform': random.uniform, 'time.sleep': time.sleep, 'time.monotonic': time.monotonic,
                'sys.modules.random': sys.modules.get('random'), 'sys.modules.time': sys.modules.get('time')}

    def install(self, target, module, shape, script):
        if target in self.active:
            raise CaptureFailure('shim %s already installed' % target)
        saved = {}
        for attr in shape:
            if attr not in module.__dict__:
                raise CaptureFailure('shim %s: module has no attribute %s' % (target, attr))
            saved[attr] = module.__dict__[attr]
        objs = {attr: _ShimObject(self, target, attr, calls) for attr, calls in shape.items()}
        st = {'module': module, 'saved': saved, 'objs': objs, 'stdlib': self.stdlib_identity(),
              'uniform': list(script.get('uniform', [])), 'monotonic': list(script.get('monotonic', []))}
        with self.lock:
            self.active[target] = st
        for attr, obj in objs.items():
            setattr(module, attr, obj)
        ok = all(module.__dict__[a] is o for a, o in objs.items())
        self.emit('SHIM_SCOPE', {'target': target, 'state': 'installed', 'identity_ok': ok})
        return ok

    def remove(self, target):
        with self.lock:
            st = self.active.pop(target, None)
        if st is None:
            raise CaptureFailure('shim %s not installed' % target)
        for attr, orig in st['saved'].items():
            setattr(st['module'], attr, orig)
        restored = all(st['module'].__dict__[a] is o for a, o in st['saved'].items())
        now = self.stdlib_identity()
        stdlib_ok = all(now[k] is v for k, v in st['stdlib'].items())
        self.emit('SHIM_SCOPE', {'target': target, 'state': 'restored', 'identity_ok': restored and stdlib_ok})
        self.milestone('SHIM_STDLIB', {'target': target, 'module_attrs_restored': restored, 'stdlib_intact': stdlib_ok,
                                       'script_left': {'uniform': list(st['uniform']), 'monotonic': to_json(st['monotonic'])}})
        return restored and stdlib_ok

    def violation(self, target, why):
        self.violations.append([target, why])
        self.milestone('SHIM_VIOLATION', {'target': target, 'why': str(why)[:200]})
        return ShimViolation('shim %s: %s' % (target, why))

    def call(self, target, name, args, kwargs):
        with self.lock:
            st = self.active.get(target)
        if st is None:
            raise self.violation(target, '%s called outside install/remove' % name)
        if kwargs:
            raise self.violation(target, '%s with keyword arguments' % name)
        if name == 'uniform':
            if len(args) != 2 or not st['uniform']:
                raise self.violation(target, 'uniform: %s' % ('script exhausted' if len(args) == 2 else 'arity'))
            choice = st['uniform'].pop(0)
            a, b = args
            ret = a if choice == 'a' else b
            self.emit('SHIM_RECORD', {'target': target, 'call': 'uniform', 'args': [to_json(a), to_json(b)], 'returned': to_json(ret)})
            return ret
        if name == 'sleep':
            if len(args) != 1:
                raise self.violation(target, 'sleep arity')
            self.emit('SHIM_RECORD', {'target': target, 'call': 'sleep', 'args': [to_json(args[0])], 'returned': None})
            return None  # virtual clock: never sleeps
        if name == 'monotonic':
            if args or not st['monotonic']:
                raise self.violation(target, 'monotonic: %s' % ('arity' if args else 'script exhausted'))
            v = st['monotonic'].pop(0)
            self.emit('SHIM_RECORD', {'target': target, 'call': 'monotonic', 'args': [], 'returned': to_json(v)})
            return v
        raise self.violation(target, 'callable %s' % name)

    def active_targets(self):
        with self.lock:
            return sorted(self.active)


# ------------------------------------------------------------------------------------------------ fault by cut (D2B-06)

FAULT_EXCEPTIONS = ('RuntimeError', 'KeyboardInterrupt')
FAULT_MODES = ('call_through_then_raise', 'raise_before_call')


class FaultSet:
    """Declared faults; the raised exception instances are retained so the driver can tell an injected BaseException."""

    def __init__(self, emit=None, milestone=None):
        self.emit, self.milestone = emit, milestone
        self.installed = {}
        self.raised = set()
        self.keep = []
        self.lock = threading.Lock()

    @staticmethod
    def make(spec):
        cls = spec.get('class')
        if cls not in FAULT_EXCEPTIONS or set(spec) - {'class', 'message'}:
            raise CaptureFailure('fault exception outside the closed list: %r' % (spec,))
        if cls == 'RuntimeError':
            if not isinstance(spec.get('message'), str):
                raise CaptureFailure('RuntimeError fault without message')
            return RuntimeError(spec['message'])
        if 'message' in spec:
            raise CaptureFailure('KeyboardInterrupt fault takes no message')
        return KeyboardInterrupt()

    def _fire(self, target, rec, exc):
        with self.lock:
            rec['count'] += 1
            self.raised.add(id(exc))
            self.keep.append(exc)
            count = rec['count']
        self.emit('FAULT', {'target': target, 'call': str(rec['calls']), 'count': count})

    def is_injected(self, exc):
        with self.lock:
            return id(exc) in self.raised

    def install(self, obj, on, attr, mode, exc_spec):
        target = '%s.%s' % (on, attr)
        if mode not in FAULT_MODES or target in self.installed:
            raise CaptureFailure('fault mode %r or duplicate target %s' % (mode, target))
        self.make(exc_spec)  # closed list checked before installing
        klass_attr = None
        for klass in type(obj).__mro__:
            if attr in klass.__dict__:
                klass_attr = klass.__dict__[attr]
                break
        if not isinstance(klass_attr, types.FunctionType):
            raise CaptureFailure('fault %s: not a plain method of the class' % target)
        inst = object.__getattribute__(obj, '__dict__')
        if attr in inst:
            raise CaptureFailure('fault %s: instance attribute already present' % target)
        original = getattr(obj, attr)
        rec = {'calls': 0, 'count': 0, 'mode': mode}
        fset = self

        def wrapper(*args, **kwargs):
            rec['calls'] += 1
            if mode == 'call_through_then_raise':
                original(*args, **kwargs)
            exc = fset.make(exc_spec)
            fset._fire(target, rec, exc)
            raise exc

        setattr(obj, attr, wrapper)
        self.installed[target] = {'obj': obj, 'attr': attr, 'rec': rec, 'klass_attr': klass_attr}
        self.milestone('FAULT_SCOPE', {'target': target, 'state': 'installed', 'mode': mode, 'exception': exc_spec.get('class'),
                                       'ok': inst.get(attr) is wrapper})

    def remove(self, obj, on, attr):
        target = '%s.%s' % (on, attr)
        ent = self.installed.pop(target, None)
        if ent is None or ent['obj'] is not obj:
            raise CaptureFailure('fault %s not installed on this object' % target)
        delattr(obj, attr)
        inst = object.__getattribute__(obj, '__dict__')
        bound = getattr(obj, attr)
        ok = attr not in inst and getattr(bound, '__func__', None) is ent['klass_attr']
        self.milestone('FAULT_SCOPE', {'target': target, 'state': 'removed', 'calls': ent['rec']['calls'], 'count': ent['rec']['count'], 'ok': ok})

    def stream_wrap(self, stream, attr, fn, spec):
        """GoalStream.new fault: the composed callable raises the declared exception on call N instead of calling."""
        target = '%s.%s' % (stream, attr)
        n = spec.get('raise_on_call')
        if type(n) is not int or n < 1 or set(spec) - {'raise_on_call', 'exception'}:
            raise CaptureFailure('stream fault %r' % (spec,))
        exc_spec = spec['exception']
        self.make(exc_spec)
        rec = {'calls': 0, 'count': 0, 'mode': 'raise_on_call'}
        fset = self

        def wrapper():
            rec['calls'] += 1
            if rec['calls'] == n:
                exc = fset.make(exc_spec)
                fset._fire(target, rec, exc)
                raise exc
            return fn()

        self.installed[target] = {'obj': None, 'attr': attr, 'rec': rec, 'klass_attr': None, 'stream': True}
        self.milestone('FAULT_SCOPE', {'target': target, 'state': 'installed', 'mode': 'raise_on_call', 'call': n,
                                       'exception': exc_spec.get('class'), 'ok': True})
        return wrapper

    def active_targets(self):
        return sorted(t for t, e in self.installed.items() if not e.get('stream'))
