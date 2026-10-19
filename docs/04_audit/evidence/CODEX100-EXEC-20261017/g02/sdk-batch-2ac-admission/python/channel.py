"""Role-side observer channel for the Python SDK reference profile (DX100-G02 batch 2A: STEP_RELEASE/CHUNK_RELEASE, 2A case IDs).

Private reference helper. Importing this module performs no I/O and imports
only the standard library; it never imports SDK, Pydantic or acquired code.
Roles reopen their own named FIFOs after exec (NOFOLLOW+CLOEXEC+NONBLOCK),
write one atomic frame per event and read bounded control frames.
"""
import base64
import hashlib
import json
import os
import select
import stat
import threading
import time

CONFIG = '/profile/adapter-config.json'
ADMISSION = '/profile/admission.json'
PYTHON_SHA256 = 'e50d468e8b0adfb05733f5b87b3cff34829c4a8c1aea50c865aa8bdfe4bb150f'
ROLES = ('driver', 'adapter', 'peer')
COMMANDS = ('READY', 'RELEASE_REPLY', 'RELEASE_EXIT', 'ABORT_NOW', 'FINISH_PEER', 'STEP_RELEASE', 'CHUNK_RELEASE')
CAPS = {'stdin': 262144, 'stdout': 262144, 'stderr': 65536}
RAW_CHUNK = 2048
FRAME = 4096
PAYLOAD = FRAME - 4
META = 1024
ROLE_BYTES = 2097152
MAX_SEQ = 100000
FIXED_ENV = {'HOME': '/work/home', 'TMPDIR': '/work/tmp', 'PATH': '/runtime', 'LANG': 'C.UTF-8',
             'LC_ALL': 'C.UTF-8', 'TZ': 'UTC', 'PYTHONDONTWRITEBYTECODE': '1', 'UV_THREADPOOL_SIZE': '2'}
ROLE_KINDS = {
    'driver': ('BEGIN', 'READY', 'API_RESULT', 'API_ERROR', 'API_CANCELLED', 'HOOK_CLOSED', 'DIAGNOSTIC', 'SIGNAL', 'END', 'INVALID'),
    'adapter': ('BEGIN', 'READY', 'RAW_READ', 'FORWARD_COMMIT', 'STREAM_END', 'FAULT', 'SIGNAL', 'END', 'INVALID'),
    'peer': ('BEGIN', 'READY', 'REQUEST_HELD', 'PEER_MILESTONE', 'DIAGNOSTIC', 'SIGNAL', 'END', 'INVALID'),
}
DATA_FIELDS = {
    'BEGIN': ('nonce', 'source_sha256', 'pid_namespace', 'case_input_sha256'), 'READY': (), 'FAULT': ('fault',),
    'RAW_READ': ('stream', 'offset', 'base64', 'sha256'), 'FORWARD_COMMIT': ('stream', 'offset', 'bytes'),
    'STREAM_END': ('stream', 'read_bytes', 'committed_bytes', 'read_sha256'),
    'END': ('streams', 'child_exit_code', 'child_signal', 'complete'),
    'REQUEST_HELD': ('bytes', 'sha256'), 'API_CANCELLED': ('name', 'message'), 'HOOK_CLOSED': ('turn_id', 'closed'),
    'API_RESULT': ('api', 'result', 'observations'), 'API_ERROR': ('api', 'name', 'message', 'cause'),
    'SIGNAL': ('signal', 'inflight'), 'INVALID': ('reason',), 'PEER_MILESTONE': ('milestone', 'detail'),
    'DIAGNOSTIC': ('milestone', 'detail'),
}
TERMINAL = ('END', 'INVALID')


class ChannelError(Exception):
    pass


def check(ok, why):
    if not ok:
        raise ChannelError(why)


def sha(b):
    return hashlib.sha256(b).hexdigest()


def is_int(x, hi=2 ** 53 - 1):
    return type(x) is int and 0 <= x <= hi


def is_hex(x, n=64):
    return type(x) is str and len(x) == n and all(c in '0123456789abcdef' for c in x)


def short(x, hi=400):
    return type(x) is str and len(x.encode('utf-8', 'surrogatepass')) <= hi


def clip(x, limit):
    """Truncate to at most `limit` UTF-8 bytes without splitting a character (validators count bytes)."""
    b = str(x).encode('utf-8', 'surrogatepass')
    if len(b) <= limit:
        return str(x)
    return b[:limit].decode('utf-8', 'ignore')


def fields(x, names):
    check(type(x) is dict and sorted(x) == sorted(names), 'unknown/missing fields')


def _no_dupes(pairs):
    out = {}
    for k, v in pairs:
        check(k not in out, 'duplicate JSON key')
        out[k] = v
    return out


def _reject_constant(name):
    raise ChannelError('nonfinite JSON constant ' + name)


def _depth_ok(x, d=0):
    check(d <= 32, 'JSON nesting cap')
    if type(x) is dict:
        for v in x.values():
            _depth_ok(v, d + 1)
    elif type(x) is list:
        for v in x:
            _depth_ok(v, d + 1)
    elif type(x) is float:
        check(x == x and x not in (float('inf'), float('-inf')), 'nonfinite JSON')


def strict_json(data, compact=False):
    """Strict UTF-8 JSON: no duplicate keys, NaN/Infinity, trailing data; compact forbids whitespace outside strings."""
    text = data.decode('utf-8', 'strict') if isinstance(data, (bytes, bytearray)) else data
    if compact:
        inside = esc = False
        for c in text:
            if inside:
                if esc:
                    esc = False
                elif c == '\\':
                    esc = True
                elif c == '"':
                    inside = False
            elif c == '"':
                inside = True
            else:
                check(c not in ' \t\r\n\x0b\x0c', 'whitespace in compact JSON')
    try:
        value = json.loads(text, object_pairs_hook=_no_dupes, parse_constant=_reject_constant)
    except ValueError as exc:
        raise ChannelError('invalid JSON: ' + str(exc)[:200]) from None
    _depth_ok(value)
    return value


def dumps(obj):
    return json.dumps(obj, separators=(',', ':'), ensure_ascii=False, allow_nan=False)


def _counters(x):
    fields(x, ('read_bytes', 'committed_bytes', 'read_sha256'))
    check(is_int(x['read_bytes']) and is_int(x['committed_bytes']) and x['committed_bytes'] <= x['read_bytes']
          and is_hex(x['read_sha256']), 'stream counters')


def validate_event(e):
    fields(e, ('v', 'attempt', 'case', 'role', 'seq', 'kind', 'pid', 'mono_ns', 'data'))
    check(e['v'] == 1 and type(e['v']) is int and is_hex(e['attempt'], 40) and type(e['case']) is str
          and e['role'] in ROLES and is_int(e['seq'], MAX_SEQ), 'event identity')
    check(is_int(e['pid']) and e['pid'] > 0 and type(e['mono_ns']) is str and e['mono_ns'].isdigit()
          and len(e['mono_ns']) <= 20, 'event process')
    check(e['kind'] in DATA_FIELDS and e['kind'] in ROLE_KINDS[e['role']], 'event kind for role')
    d = e['data']
    fields(d, DATA_FIELDS[e['kind']])
    k = e['kind']
    if k == 'BEGIN':
        ns = d['pid_namespace']
        check(is_hex(d['nonce'], 40) and is_hex(d['source_sha256']) and type(ns) is str and ns.startswith('pid:[')
              and ns.endswith(']') and ns[5:-1].isdigit() and is_hex(d['case_input_sha256']), 'BEGIN identity')
    elif k == 'FAULT':
        check(d['fault'] == 'stdin_closed_at_start', 'FAULT kind')
    elif k == 'RAW_READ':
        check(d['stream'] in CAPS and is_int(d['offset']) and type(d['base64']) is str and is_hex(d['sha256']), 'raw data')
        try:
            b = base64.b64decode(d['base64'], validate=True)
        except ValueError:
            raise ChannelError('raw base64') from None
        check(0 < len(b) <= RAW_CHUNK and base64.b64encode(b).decode() == d['base64'] and sha(b) == d['sha256']
              and d['offset'] + len(b) <= CAPS[d['stream']], 'raw bounds/digest')
    elif k == 'FORWARD_COMMIT':
        check(d['stream'] in CAPS and is_int(d['offset']) and is_int(d['bytes'], RAW_CHUNK) and d['bytes'] > 0
              and d['offset'] + d['bytes'] <= CAPS[d['stream']], 'commit bounds')
    elif k == 'STREAM_END':
        check(d['stream'] in CAPS, 'stream name')
        _counters({x: d[x] for x in ('read_bytes', 'committed_bytes', 'read_sha256')})
        check(d['read_bytes'] <= CAPS[d['stream']], 'stream cap')
    elif k == 'END':
        check(type(d['streams']) is dict, 'END streams')
        fields(d['streams'], tuple(CAPS) if e['role'] == 'adapter' else ())
        for s, c in d['streams'].items():
            _counters(c)
            check(c['read_bytes'] <= CAPS[s], 'END cap')
            if d['complete'] is True:
                check(c['read_bytes'] == c['committed_bytes'], 'complete END with uncommitted bytes')
        code, sig = d['child_exit_code'], d['child_signal']
        check((code is None or is_int(code, 255)) and (sig is None or (type(sig) is str and sig.startswith('SIG')
              and 3 < len(sig) <= 15 and sig[3:].isalnum() and sig[3:].upper() == sig[3:])) and type(d['complete']) is bool,
              'END result')
    elif k == 'REQUEST_HELD':
        check(is_int(d['bytes'], CAPS['stdin']) and d['bytes'] > 0 and is_hex(d['sha256']), 'REQUEST_HELD')
    elif k == 'API_CANCELLED':
        check(short(d['name'], 120) and short(d['message']), 'API_CANCELLED')
    elif k == 'HOOK_CLOSED':
        check(short(d['turn_id'], 120) and type(d['closed']) is bool, 'HOOK_CLOSED')
    elif k == 'API_RESULT':
        check(short(d['api'], 120) and type(d['observations']) is dict, 'API_RESULT')
    elif k == 'API_ERROR':
        check(short(d['api'], 120) and short(d['name'], 120) and short(d['message']) and (d['cause'] is None or type(d['cause']) is dict), 'API_ERROR')
        if d['cause'] is not None:
            fields(d['cause'], ('name', 'message'))
            check(short(d['cause']['name'], 120) and short(d['cause']['message'], 200), 'API_ERROR cause')
    elif k == 'SIGNAL':
        check(d['signal'] in ('SIGTERM', 'SIGINT') and type(d['inflight']) is bool, 'SIGNAL')
    elif k == 'INVALID':
        check(short(d['reason']), 'INVALID')
    elif k in ('PEER_MILESTONE', 'DIAGNOSTIC'):
        m = d['milestone']
        check(short(m, 80) and m != '' and all(c.isupper() or c.isdigit() or c == '_' for c in m), 'milestone')


def validate_control(c):
    fields(c, ('v', 'attempt', 'case', 'role', 'seq', 'command'))
    check(type(c['v']) is int and c['v'] == 1 and is_hex(c['attempt'], 40) and type(c['case']) is str
          and c['role'] in ROLES and is_int(c['seq'], MAX_SEQ) and c['command'] in COMMANDS, 'control identity/command')


def metadata_bytes(e, payload_len):
    if e is not None and e.get('kind') == 'RAW_READ':
        return payload_len - len(e['data']['base64'].encode())
    return payload_len


def encode_frame(obj, control=False):
    if control:
        validate_control(obj)
    else:
        validate_event(obj)
    payload = dumps(obj).encode('utf-8')
    check(0 < len(payload) <= PAYLOAD and metadata_bytes(None if control else obj, len(payload)) <= META, 'frame/metadata cap')
    return len(payload).to_bytes(4, 'big') + payload


class FrameDecoder:
    def __init__(self, validate=validate_control):
        self.pending = b''
        self.validate = validate

    def push(self, data):
        check(len(data) <= FRAME, 'read frame cap')
        self.pending += data
        out = []
        while len(self.pending) >= 4:
            n = int.from_bytes(self.pending[:4], 'big')
            check(0 < n <= PAYLOAD, 'frame length')
            if len(self.pending) < n + 4:
                break
            obj = strict_json(self.pending[4:n + 4], compact=True)
            check(type(obj) is dict, 'frame object')
            self.validate(obj)
            check(metadata_bytes(obj if self.validate is validate_event else None, n) <= META, 'metadata cap')
            out.append(obj)
            self.pending = self.pending[n + 4:]
        check(len(self.pending) < FRAME, 'partial frame cap')
        return out

    def finish(self):
        check(self.pending == b'', 'truncated frame')


def read_file(path, cap=2097152):
    before = os.lstat(path)
    check(stat.S_ISREG(before.st_mode) and before.st_size <= cap, 'regular bounded file required: ' + path)
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
    try:
        after = os.fstat(fd)
        check(after.st_ino == before.st_ino and after.st_dev == before.st_dev, 'file replacement')
        chunks, total = [], 0
        while True:
            b = os.read(fd, 1048576)
            if not b:
                break
            total += len(b)
            check(total <= cap, 'file read cap')
            chunks.append(b)
        return b''.join(chunks)
    finally:
        os.close(fd)


def sha_file(path, cap=268435456):
    fd = os.open(path, os.O_RDONLY | os.O_CLOEXEC)
    try:
        st = os.fstat(fd)
        check(stat.S_ISREG(st.st_mode) and st.st_size <= cap, 'digest file cap')
        h, total = hashlib.sha256(), 0
        while True:
            b = os.read(fd, 1048576)
            if not b:
                break
            total += len(b)
            check(total <= cap, 'digest read cap')
            h.update(b)
        return h.hexdigest()
    finally:
        os.close(fd)


def _profile_path(p):
    parts = p.split('/')
    return type(p) is str and p.startswith('/profile/') and '..' not in parts and '.' not in parts and '' not in parts[1:]


def verify_files(files):
    check(type(files) is dict and files, 'missing file manifest')
    for path, digest in files.items():
        check(_profile_path(path) and is_hex(digest), 'manifest path/hash')
        check(sha(read_file(path, 16 * 1024 * 1024)) == digest, 'file identity: ' + path)


def verify_tree(root, files):
    """Closed tree: every regular file under root is bound and no symlink/special file exists."""
    check(root.startswith('/profile/') and root.endswith('/'), 'tree root')
    seen = set()
    for top, dirs, names in os.walk(root, followlinks=False):
        for name in dirs + names:
            p = os.path.join(top, name)
            st = os.lstat(p)
            check(not stat.S_ISLNK(st.st_mode), 'symlink in sealed tree: ' + p)
            if stat.S_ISREG(st.st_mode):
                seen.add(p)
            else:
                check(stat.S_ISDIR(st.st_mode), 'special file in sealed tree: ' + p)
    bound = {p for p in files if p.startswith(root)}
    check(seen == bound and seen, 'sealed tree closure: %d files vs %d bound' % (len(seen), len(bound)))


def fifo_names():
    return [r + '.' + k for r in ROLES for k in ('events', 'control')]


def load_config(language='python'):
    import sys
    check(sys.platform == 'linux' and sys.version_info[:3] == (3, 12, 3) and sys.executable == '/runtime/python', 'pinned Python 3.12.3 runtime')
    check(sys.flags.isolated == 1 and sys.flags.no_site == 1, 'python -I -S required')
    c = strict_json(read_file(CONFIG))
    fields(c, ('attempt', 'case', 'nonce', 'language', 'deadline_seconds', 'fifo_root', 'fifo_nodes', 'fifo_stat',
               'peer_argv', 'case_input', 'mode'))
    check(is_hex(c['attempt'], 40) and is_hex(c['nonce'], 40) and c['language'] == language
          and c['mode'] in ('diagnostic', 'sdk', 'control'), 'config identity')
    case = c['case']
    # F4-10: the 2A continuation has no Python SDK slot; the Python lane serves the CONTROL slot and the DIAG-PY rows.
    sdk_case = case in ()
    control_case = case == '2AC-CTRL01'
    diag_case = type(case) is str and case.startswith('DIAG-PY-') and 0 < len(case) - 8 <= 32 and all(
        ch.isupper() or ch.isdigit() or ch == '-' for ch in case[8:])
    check(sdk_case or diag_case or control_case, 'case ID')
    check((c['mode'] == 'diagnostic') == diag_case and (c['mode'] == 'control') == control_case, 'mode/case mismatch')
    check(is_int(c['deadline_seconds'], 30) and c['deadline_seconds'] > 0 and c['fifo_root'] == '/observer', 'deadline/root')
    names = fifo_names()
    check(type(c['fifo_nodes']) is list and len(c['fifo_nodes']) == 6 and sorted(c['fifo_nodes']) == sorted(names), 'six fixed FIFO names')
    fields(c['fifo_stat'], tuple('/observer/' + n for n in names))
    for v in c['fifo_stat'].values():
        check(type(v) is list and len(v) == 4 and type(v[0]) is str and v[0].isdigit() and type(v[1]) is str
              and v[1].isdigit() and v[2] == '0600' and type(v[3]) is int and v[3] == 0, 'FIFO stat contract')
    check(c['peer_argv'] == ['/runtime/python', '-I', '-S', '/profile/fixture-rpc.py', '--case', case], 'frozen peer argv')
    check(type(c['case_input']) is dict, 'fixture input')
    return c


def admission(c, stage='helpers'):
    a = strict_json(read_file(ADMISSION))
    fields(a, ('v', 'attempt', 'case', 'nonce', 'language', 'runtime_sha256', 'files', 'fifo_pipe_buf',
               'containment_admitted', 'sdk_admitted', 'compiler_admitted'))
    check(a['v'] == 1 and a['attempt'] == c['attempt'] and a['case'] == c['case'] and a['nonce'] == c['nonce']
          and a['language'] == c['language'], 'admission binding')
    check(a['containment_admitted'] is True and type(a['sdk_admitted']) is bool and type(a['compiler_admitted']) is bool,
          'missing current containment admission')
    check(a['runtime_sha256'] == PYTHON_SHA256 and sha_file('/runtime/python') == PYTHON_SHA256, 'Python identity')
    fields(a['fifo_pipe_buf'], tuple(c['fifo_stat']))
    for n in a['fifo_pipe_buf'].values():
        check(is_int(n) and n >= FRAME, 'external fpathconf PIPE_BUF witness required')
    check(ADMISSION not in a['files'], 'admission cannot bind itself')
    verify_files(a['files'])
    check(a['files'].get(CONFIG) == sha(read_file(CONFIG)), 'unbound config')
    if stage == 'sdk':
        check(c['mode'] == 'sdk' and a['sdk_admitted'] is True, 'SDK not admitted')
    return a


def check_fifo(st, expected):
    check(stat.S_ISFIFO(st.st_mode) and str(st.st_dev) == expected[0] and str(st.st_ino) == expected[1]
          and stat.S_IMODE(st.st_mode) == 0o600 and st.st_uid == expected[3], 'FIFO identity/type/owner/mode')


def open_fifo_at(path, kind, expected):
    """Reopen own named FIFO after exec; stat before/after; observe PIPE_BUF directly."""
    check_fifo(os.lstat(path), expected)
    flags = (os.O_WRONLY if kind == 'events' else os.O_RDONLY) | os.O_NOFOLLOW | os.O_NONBLOCK | os.O_CLOEXEC
    fd = os.open(path, flags)
    try:
        check_fifo(os.fstat(fd), expected)
        check_fifo(os.lstat(path), expected)
        check(not os.get_blocking(fd) and not os.get_inheritable(fd), 'FIFO flags')
        check(os.fpathconf(fd, 'PC_PIPE_BUF') >= FRAME, 'PIPE_BUF below frame size')
        return fd
    except BaseException:
        os.close(fd)
        raise


class Channel:
    def __init__(self, config, role, source_path):
        check(role in ROLES, 'role')
        self.config, self.role = config, role
        a = admission(config)
        self.admission = a
        check(a['files'].get(source_path) == sha(read_file(source_path)), 'unbound role source')
        check(a['files'].get('/profile/channel.py') == sha(read_file('/profile/channel.py')), 'unbound channel')
        self.deadline = time.monotonic() + config['deadline_seconds']
        self.event_fd = open_fifo_at('/observer/%s.events' % role, 'events', config['fifo_stat']['/observer/%s.events' % role])
        try:
            self.control_fd = open_fifo_at('/observer/%s.control' % role, 'control', config['fifo_stat']['/observer/%s.control' % role])
        except BaseException:
            os.close(self.event_fd)
            raise
        self.seq = 0
        self.control_seq = 0
        self.bytes = 0
        self.terminal = False
        self.queue = []
        self.decoder = FrameDecoder(validate_control)
        self._elock = threading.Lock()
        self._clock = threading.Lock()
        self.interrupt = None  # optional callable: a pending signal aborts telemetry backpressure waits
        # F4-01: role-side witness of the delivered case_input bytes (compact reserialization, insertion order).
        self.begin = {'nonce': config['nonce'], 'source_sha256': a['files'][source_path],
                      'pid_namespace': os.readlink('/proc/self/ns/pid'),
                      'case_input_sha256': sha(json.dumps(config['case_input'], ensure_ascii=False, separators=(',', ':')).encode('utf-8'))}

    def remaining(self):
        return self.deadline - time.monotonic()

    def check_deadline(self):
        check(time.monotonic() < self.deadline, 'case deadline')

    def _frame(self, kind, data):
        return encode_frame({'v': 1, 'attempt': self.config['attempt'], 'case': self.config['case'], 'role': self.role,
                             'seq': self.seq, 'kind': kind, 'pid': os.getpid(), 'mono_ns': str(time.monotonic_ns()),
                             'data': data})

    def emit(self, kind, data, until=None):
        """One atomic write per frame; EAGAIN waits only until the case deadline (or `until`)."""
        with self._elock:
            check(not self.terminal, 'frame after terminal frame')
            frame = self._frame(kind, data)
            check(self.bytes + len(frame) <= ROLE_BYTES, 'role artifact cap')
            # A terminal/SIGNAL declaration carries its own short bound (`until`) so it can still be
            # written after the case deadline; ordinary events never outlive the case deadline.
            limit = self.deadline if until is None else until
            while True:
                check(time.monotonic() < limit, 'case deadline (event backpressure)')
                try:
                    n = os.write(self.event_fd, frame)
                except BlockingIOError:
                    if until is None and self.interrupt is not None and self.interrupt():
                        raise ChannelError('signal during telemetry backpressure') from None
                    select.select([], [self.event_fd], [], 0.002)
                    time.sleep(0.001)
                    continue
                check(n == len(frame), 'short/ambiguous atomic frame write')
                break
            self.seq += 1
            self.bytes += n
            if kind in TERMINAL:
                self.terminal = True

    def start(self):
        self.emit('BEGIN', self.begin)
        self.emit('READY', {})
        self.control('READY')

    def read_controls(self):
        with self._clock:
            while True:
                try:
                    b = os.read(self.control_fd, FRAME)
                except BlockingIOError:
                    return
                check(len(b) > 0, 'control EOF/missing keeper')
                self.bytes += len(b)
                check(self.bytes <= ROLE_BYTES, 'artifact cap')
                for c in self.decoder.push(b):
                    check(c['attempt'] == self.config['attempt'] and c['case'] == self.config['case']
                          and c['role'] == self.role and c['seq'] == self.control_seq, 'control binding/sequence')
                    self.control_seq += 1
                    self.queue.append(c)

    def take(self, command):
        """Non-blocking: return True if the next queued control is `command`; reject any other command."""
        self.read_controls()
        if not self.queue:
            return False
        c = self.queue.pop(0)
        check(c['command'] == command, 'unexpected control %s; need %s' % (c['command'], command))
        return True

    def control(self, command):
        check(command in COMMANDS, 'wait command')
        while True:
            self.check_deadline()
            if self.take(command):
                return
            select.select([self.control_fd], [], [], max(0.0, min(0.05, self.remaining())))

    def finish_controls(self):
        """Run BEFORE the terminal END: an extra, late or truncated control invalidates instead of hiding behind END."""
        self.read_controls()
        self.decoder.finish()
        check(not self.queue, 'unconsumed control')

    def close_fds(self):
        os.close(self.control_fd)
        os.close(self.event_fd)

    def close(self):
        self.finish_controls()
        self.close_fds()


class StreamLedger:
    def __init__(self, stream):
        check(stream in CAPS, 'ledger stream')
        self.stream, self.read, self.committed, self.hash = stream, 0, 0, hashlib.sha256()

    def raw(self, b):
        check(0 < len(b) <= RAW_CHUNK and self.read + len(b) <= CAPS[self.stream], 'read cap')
        data = {'stream': self.stream, 'offset': self.read, 'base64': base64.b64encode(b).decode(), 'sha256': sha(b)}
        self.read += len(b)
        self.hash.update(b)
        return data

    def commit(self, n):
        check(is_int(n, RAW_CHUNK) and n > 0 and self.committed + n <= self.read, 'zero/false commit')
        d = {'stream': self.stream, 'offset': self.committed, 'bytes': n}
        self.committed += n
        return d

    def summary(self):
        return {'read_bytes': self.read, 'committed_bytes': self.committed, 'read_sha256': self.hash.copy().hexdigest()}


def invalid(ch, exc):
    try:
        if ch is not None and not ch.terminal:
            ch.emit('INVALID', {'reason': clip(str(exc) or type(exc).__name__, 400)}, until=time.monotonic() + 0.05)
    except BaseException:
        pass


def selected_fixture(config):
    rows = strict_json(read_file('/profile/fixture-cases.json'))
    check(type(rows) is dict and config['case'] in rows, 'unsupported fixture case')
    check(dumps(_stable(config['case_input'])) == dumps(_stable(rows[config['case']])), 'fixture differs from frozen case')
    return config['case_input']


def _stable(x):
    if type(x) is dict:
        return {k: _stable(x[k]) for k in sorted(x)}
    if type(x) is list:
        return [_stable(v) for v in x]
    return x


def load_role(role, source_path):
    """Common role prologue: pinned config + admission + own FIFOs. Returns (config, channel)."""
    config = load_config('python')
    return config, Channel(config, role, source_path)
