"""Role-side harness of the batch 2B-1 driver (capability-contracts-2b.json). Standard library only.

Importing this module performs no I/O and imports neither the SDK nor Pydantic; the driver passes the objects it built.
It holds the observation machinery shared by the SDK interpreter and by the own-code diagnostics:

- StaticReader (CAP-2B-CONC-BARRIER, E2B-08): probe paths read only instance __dict__ entries, slot member descriptors,
  dict keys and list/tuple indexes; a property, another descriptor, a method or a missing name is refused (ProbeRefused,
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
"""
import enum
import os
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
    if type(obj) in (list, tuple) and key.lstrip('-').isdigit():
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

    def count(self, hid, event=None, thread_prefix=None):
        with self.cond:
            return sum(1 for e in self.events if e['id'] == hid and (event is None or e['event'] == event)
                       and (thread_prefix is None or e['thread_name'].startswith(thread_prefix)))

    def wait(self, hid, event, count, timeout, thread_prefix=None):
        """Wait until `count` matching events exist; False on timeout (the caller classifies the wait)."""
        end = time.monotonic() + timeout
        with self.cond:
            while True:
                n = sum(1 for e in self.events if e['id'] == hid and e['event'] == event
                        and (thread_prefix is None or e['thread_name'].startswith(thread_prefix)))
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
    """spec: None (top frame threading.Condition.wait) | {'code': code, 'line': n} | {'code': code, 'caller': code}."""
    st = stack_of(thread)
    names = [[c.co_qualname, ln] for c, ln in st[:8]]
    if not thread.is_alive() or not st:
        return False, {'alive': thread.is_alive(), 'stack': names}
    top, line = st[0]
    if spec is None:
        ok = top is COND_WAIT
    elif 'line' in spec:
        ok = top is spec['code'] and line == spec['line']
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

def model_dump(value):
    """model_dump(by_alias=True, mode='json') with serialization warnings captured: (dump, [(category, message)])."""
    with DUMP_LOCK:
        with warnings.catch_warnings(record=True) as w:
            warnings.simplefilter('always')
            dump = value.model_dump(by_alias=True, mode='json')
        return dump, [(qualified(x.category), str(x.message)[:200]) for x in w]


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
                            'msg': str(e.get('msg'))[:120]} for e in errs][:6]
        except Exception:  # noqa: BLE001 - detail only
            d['errors'] = None
    return d
