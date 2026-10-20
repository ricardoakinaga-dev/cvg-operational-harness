"""Host-side independent observer for the distributed profile, sub-lot DP-1 (derived from the C3-1 TypeScript-lane observer).

Deltas (declared in the unit freeze, erratum DP-SPEC/R2-F01 and DDP-03): driver kinds BLOB/BLOB_END (chunked relays rebuilt and
digest-checked here) and reconcile_driver_only(): in the topology driver_only the adapter and peer FIFOs stay bound but MISSING
is expected; any adapter or peer frame (or raw byte) is INVALID_CAPTURE; PASS needs the driver END(complete), FIFO EOF, the OS
checks, every BLOB closed and every wrapper.run settled (WRAPPER_RESULT) and followed by its LEFTOVER witness. The termination of
wrappers, synthetic children and the published binary is not part of the form: the predicates judge it.

Runs outside the target cgroup inside the supervisor process. Its decoder and
validators are a separate implementation from the role-side encoders
(channel.py / channel.cjs) and from the SDK and fixtures. It never trusts a
self-reported value alone: byte counters are rebuilt from the raw chunks and
PIDs are joined with independently observed /proc witnesses by the supervisor.
"""
import base64
import hashlib
import json
import signal

ROLES = ('driver', 'adapter', 'peer')
STREAMS = ('stdin', 'stdout', 'stderr')
CAP = {'stdin': 262144, 'stdout': 262144, 'stderr': 65536}
MAX_PAYLOAD = 4092
MAX_META = 1024
MAX_CHUNK = 2048
MAX_SEQ = 100000
SIGNAL_COMMIT_NS = 100_000_000
ENVELOPE = ('v', 'attempt', 'case', 'role', 'seq', 'kind', 'pid', 'mono_ns', 'data')
KIND_FIELDS = {
    'BEGIN': {'nonce', 'source_sha256', 'pid_namespace', 'case_input_sha256'}, 'READY': set(), 'FAULT': {'fault'},
    'RAW_READ': {'stream', 'offset', 'base64', 'sha256'}, 'FORWARD_COMMIT': {'stream', 'offset', 'bytes'},
    'STREAM_END': {'stream', 'read_bytes', 'committed_bytes', 'read_sha256'},
    'END': {'streams', 'child_exit_code', 'child_signal', 'complete'},
    'REQUEST_HELD': {'bytes', 'sha256'}, 'API_CANCELLED': {'name', 'message'}, 'HOOK_CLOSED': {'turn_id', 'closed'},
    'API_RESULT': {'api', 'result', 'observations'}, 'API_ERROR': {'api', 'name', 'message', 'cause'},
    'SIGNAL': {'signal', 'inflight'}, 'INVALID': {'reason'}, 'PEER_MILESTONE': {'milestone', 'detail'},
    'DIAGNOSTIC': {'milestone', 'detail'}, 'BLOB': {'name', 'offset', 'base64', 'sha256'}, 'BLOB_END': {'name', 'bytes', 'sha256'},
}
ALLOWED = {
    'driver': {'BEGIN', 'READY', 'API_RESULT', 'API_ERROR', 'DIAGNOSTIC', 'BLOB', 'BLOB_END', 'END', 'INVALID'},
    'adapter': {'BEGIN', 'READY', 'RAW_READ', 'FORWARD_COMMIT', 'STREAM_END', 'FAULT', 'SIGNAL', 'END', 'INVALID'},
    'peer': {'BEGIN', 'READY', 'REQUEST_HELD', 'PEER_MILESTONE', 'DIAGNOSTIC', 'SIGNAL', 'END', 'INVALID'},
}


class Violation(Exception):
    """A capture defect. Any Violation makes the capture INVALID; nothing is repaired."""


def need(ok, why):
    if not ok:
        raise Violation(why)


def h(b):
    return hashlib.sha256(b).hexdigest()


def nat(x, hi=2 ** 53 - 1):
    return type(x) is int and 0 <= x <= hi


def hex_(x, n=64):
    return type(x) is str and len(x) == n and all(c in '0123456789abcdef' for c in x)


def text(x, hi):
    return type(x) is str and len(x.encode('utf-8', 'surrogatepass')) <= hi


def _pairs(pairs):
    seen = {}
    for k, v in pairs:
        need(k not in seen, 'duplicate JSON key %r' % k[:40])
        seen[k] = v
    return seen


def _const(name):
    raise Violation('non-finite JSON constant ' + name)


def parse_payload(payload):
    """Independent strict parse: UTF-8, compact (no whitespace outside strings), unique keys, finite numbers, depth<=32."""
    try:
        s = payload.decode('utf-8', 'strict')
    except UnicodeDecodeError:
        raise Violation('invalid UTF-8 payload') from None
    in_str = esc = False
    depth = 0
    for c in s:
        if in_str:
            if esc:
                esc = False
            elif c == '\\':
                esc = True
            elif c == '"':
                in_str = False
            continue
        if c == '"':
            in_str = True
        elif c in '{[':
            depth += 1
            need(depth <= 33, 'JSON nesting cap')
        elif c in '}]':
            depth -= 1
        elif c in ' \t\r\n\x0b\x0c':
            raise Violation('non-compact JSON whitespace')
    try:
        obj = json.loads(s, object_pairs_hook=_pairs, parse_constant=_const)
    except ValueError as exc:
        raise Violation('invalid JSON: %s' % str(exc)[:160]) from None
    need(type(obj) is dict, 'frame payload is not an object')
    return obj


def split_frames(buf):
    """Return (list of payload bytes, remainder). Raises Violation on a bad length prefix."""
    out = []
    i = 0
    while len(buf) - i >= 4:
        n = int.from_bytes(buf[i:i + 4], 'big')
        need(0 < n <= MAX_PAYLOAD, 'frame length %d' % n)
        if len(buf) - i < 4 + n:
            break
        out.append(buf[i + 4:i + 4 + n])
        i += 4 + n
    return out, buf[i:]


def meta_bytes(obj, n):
    if obj.get('kind') in ('RAW_READ', 'BLOB') and type(obj.get('data')) is dict and type(obj['data'].get('base64')) is str:
        return n - len(obj['data']['base64'].encode('ascii', 'replace'))
    return n


class RoleLog:
    def __init__(self, role, expect):
        self.role = role
        self.expect = expect  # dict: attempt, case, nonce, source_sha256
        self.events = []
        self.recv_ns = []
        self.buf = b''
        self.raw = bytearray()
        self.raw_bytes = 0
        self.seq = 0
        self.pid = None
        self.last_mono = -1
        self.terminal = None
        self.signal = None
        self.signal_mono = None
        self.fault = None
        self.case_input_sha256 = None
        self.eof = False
        self.violation = None
        self.data = {s: bytearray() for s in STREAMS}
        self.committed = {s: 0 for s in STREAMS}
        self.stream_end = {}
        self.blob_parts = {}
        self.blobs = {}

    # -- live feed --------------------------------------------------------
    def feed(self, chunk, recv_ns):
        if self.violation:
            return []
        self.raw_bytes += len(chunk)
        self.raw += chunk[:max(0, 2097152 + 4096 - len(self.raw))]
        try:
            need(self.raw_bytes <= 2097152, 'role artifact cap')
            payloads, self.buf = split_frames(self.buf + chunk)
            need(len(self.buf) < 4096, 'partial frame cap')
            out = []
            for p in payloads:
                ev = parse_payload(p)
                need(meta_bytes(ev, len(p)) <= MAX_META, 'metadata cap')
                self._accept(ev)
                self.events.append(ev)
                self.recv_ns.append(recv_ns)
                out.append(ev)
            return out
        except Violation as exc:
            self.violation = str(exc)
            return []

    def finish(self):
        """Called at actual FIFO EOF (after keepers closed)."""
        self.eof = True
        if not self.violation and self.buf:
            self.violation = 'truncated frame at EOF (%d bytes)' % len(self.buf)

    # -- per-event rules --------------------------------------------------
    def _accept(self, e):
        need(tuple(sorted(e)) == tuple(sorted(ENVELOPE)), 'envelope fields')
        need(e['v'] == 1 and type(e['v']) is int, 'version')
        need(e['attempt'] == self.expect['attempt'] and e['case'] == self.expect['case'], 'attempt/case binding')
        need(e['role'] == self.role, 'role %r on %s FIFO' % (e['role'], self.role))
        need(nat(e['seq'], MAX_SEQ) and e['seq'] == self.seq, 'sequence %r expected %d' % (e['seq'], self.seq))
        need(self.terminal is None, 'frame after terminal %s' % self.terminal)
        need(nat(e['pid']) and e['pid'] > 0, 'pid')
        need(self.pid is None or e['pid'] == self.pid, 'pid changed within role')
        need(type(e['mono_ns']) is str and e['mono_ns'].isdigit() and len(e['mono_ns']) <= 20, 'mono_ns')
        mono = int(e['mono_ns'])
        need(mono >= self.last_mono, 'non-monotonic mono_ns')
        k = e['kind']
        need(k in KIND_FIELDS and k in ALLOWED[self.role], 'kind %r for %s' % (k, self.role))
        d = e['data']
        need(type(d) is dict and set(d) == KIND_FIELDS[k], 'data fields for %s' % k)
        if self.seq == 0:
            need(k == 'BEGIN', 'first frame must be BEGIN')
        elif self.seq == 1:
            need(k == 'READY', 'second frame must be READY')
        else:
            need(k not in ('BEGIN', 'READY'), 'repeated %s' % k)
        getattr(self, '_k_' + k)(d, mono)
        self.seq += 1
        self.pid = e['pid']
        self.last_mono = mono

    def _k_BEGIN(self, d, _m):
        ns = d['pid_namespace']
        need(d['nonce'] == self.expect['nonce'], 'BEGIN nonce')
        need(d['source_sha256'] == self.expect['source_sha256'], 'BEGIN source identity')
        need(type(ns) is str and ns.startswith('pid:[') and ns.endswith(']') and ns[5:-1].isdigit(), 'BEGIN pid namespace')
        need(type(d['case_input_sha256']) is str and len(d['case_input_sha256']) == 64, 'BEGIN case_input witness')
        self.case_input_sha256 = d['case_input_sha256']

    def _k_FAULT(self, d, _m):
        # F4-07: adapter fault declared before any stdin read; only stdin_closed_at_start exists.
        need(self.role == 'adapter' and d['fault'] == 'stdin_closed_at_start', 'FAULT kind')
        need(self.data['stdin'] == bytearray() and 'stdin' not in self.stream_end, 'FAULT after stdin activity')
        self.fault = d['fault']

    def _k_READY(self, d, _m):
        pass

    def _stream(self, s):
        need(s in STREAMS, 'stream name')
        need(s not in self.stream_end, 'frame after STREAM_END for %s' % s)

    def _k_RAW_READ(self, d, _m):
        s = d['stream']
        self._stream(s)
        need(self.signal is None, 'new RAW_READ after SIGNAL')
        need(nat(d['offset']) and d['offset'] == len(self.data[s]), 'RAW_READ offset gap/overlap on %s' % s)
        need(self.committed[s] == len(self.data[s]), 'RAW_READ before previous chunk was committed on %s' % s)
        need(type(d['base64']) is str and hex_(d['sha256']), 'RAW_READ fields')
        try:
            b = base64.b64decode(d['base64'], validate=True)
        except ValueError:
            raise Violation('RAW_READ base64') from None
        need(base64.b64encode(b).decode() == d['base64'], 'non-canonical base64')
        need(0 < len(b) <= MAX_CHUNK, 'RAW_READ chunk size')
        need(h(b) == d['sha256'], 'RAW_READ digest mismatch')
        need(len(self.data[s]) + len(b) <= CAP[s], 'stream cap %s' % s)
        self.data[s] += b

    def _k_FORWARD_COMMIT(self, d, _m):
        s = d['stream']
        self._stream(s)
        need(nat(d['offset']) and d['offset'] == self.committed[s], 'FORWARD_COMMIT offset on %s' % s)
        need(nat(d['bytes'], MAX_CHUNK) and d['bytes'] > 0, 'FORWARD_COMMIT size')
        need(self.committed[s] + d['bytes'] <= len(self.data[s]), 'false FORWARD_COMMIT beyond raw read on %s' % s)
        self.committed[s] += d['bytes']

    def _counters(self, s, c):
        need(type(c) is dict and set(c) == {'read_bytes', 'committed_bytes', 'read_sha256'}, 'counter fields')
        need(c['read_bytes'] == len(self.data[s]) and c['committed_bytes'] == self.committed[s]
             and c['read_sha256'] == h(bytes(self.data[s])), 'counters differ from raw ledger on %s' % s)

    def _k_STREAM_END(self, d, _m):
        s = d['stream']
        self._stream(s)
        self._counters(s, {k: d[k] for k in ('read_bytes', 'committed_bytes', 'read_sha256')})
        need(self.committed[s] == len(self.data[s]), 'STREAM_END with uncommitted bytes on %s' % s)
        self.stream_end[s] = dict(d)

    def _k_END(self, d, mono):
        streams = d['streams']
        need(type(streams) is dict, 'END streams')
        if self.role == 'adapter':
            need(set(streams) == set(STREAMS), 'adapter END streams')
            for s in STREAMS:
                self._counters(s, streams[s])
        else:
            need(streams == {}, 'non-adapter END streams')
        code, sig = d['child_exit_code'], d['child_signal']
        need(code is None or nat(code, 255), 'END exit code')
        need(sig is None or (type(sig) is str and sig.startswith('SIG') and sig[3:].isalnum() and sig[3:].isupper() and len(sig) <= 15), 'END signal')
        need(type(d['complete']) is bool, 'END complete flag')
        if d['complete']:
            need(self.signal is None, 'complete END after SIGNAL')
            if self.role == 'adapter':
                need(all(self.committed[s] == len(self.data[s]) for s in STREAMS), 'complete END with uncommitted bytes')
                need(set(self.stream_end) == set(STREAMS), 'complete END without all STREAM_END')
                need((code is None) != (sig is None), 'complete END needs exactly one child status')
        if self.signal is not None:
            need(not d['complete'], 'END after SIGNAL must declare incomplete')
            need(mono - self.signal_mono <= SIGNAL_COMMIT_NS, 'signal commit window exceeded (%d ns)' % (mono - self.signal_mono))
        self.terminal = 'END'

    def _k_INVALID(self, d, _m):
        need(text(d['reason'], 400), 'INVALID reason')
        self.terminal = 'INVALID'

    def _k_SIGNAL(self, d, mono):
        need(d['signal'] in ('SIGTERM', 'SIGINT') and type(d['inflight']) is bool, 'SIGNAL fields')
        need(self.signal is None, 'repeated SIGNAL')
        self.signal = d['signal']
        self.signal_mono = mono

    def _k_REQUEST_HELD(self, d, _m):
        need(nat(d['bytes'], CAP['stdin']) and d['bytes'] > 0 and hex_(d['sha256']), 'REQUEST_HELD fields')

    def _k_API_CANCELLED(self, d, _m):
        need(text(d['name'], 120) and text(d['message'], 400), 'API_CANCELLED fields')

    def _k_HOOK_CLOSED(self, d, _m):
        need(text(d['turn_id'], 120) and type(d['closed']) is bool, 'HOOK_CLOSED fields')

    def _k_API_RESULT(self, d, _m):
        need(text(d['api'], 120) and type(d['observations']) is dict, 'API_RESULT fields')

    def _k_API_ERROR(self, d, _m):
        need(text(d['api'], 120) and text(d['name'], 120) and text(d['message'], 400), 'API_ERROR fields')
        c = d['cause']
        need(c is None or (type(c) is dict and set(c) == {'name', 'message'} and text(c['name'], 120) and text(c['message'], 200)), 'API_ERROR cause')

    def _milestone(self, d):
        m = d['milestone']
        need(text(m, 80) and m != '' and all(ch.isupper() or ch.isdigit() or ch == '_' for ch in m), 'milestone name')

    def _k_BLOB(self, d, _m):
        name = d['name']
        need(type(name) is str and 0 < len(name) <= 80 and name not in self.blobs, 'BLOB name or BLOB after its BLOB_END')
        part = self.blob_parts.setdefault(name, bytearray())
        need(nat(d['offset']) and d['offset'] == len(part), 'BLOB offset gap/overlap on %s' % name)
        try:
            b = base64.b64decode(d['base64'], validate=True)
        except ValueError:
            raise Violation('BLOB base64') from None
        need(base64.b64encode(b).decode() == d['base64'] and 0 < len(b) <= MAX_CHUNK and h(b) == d['sha256'], 'BLOB chunk')
        need(len(part) + len(b) <= 1048576, 'BLOB cap')
        part += b

    def _k_BLOB_END(self, d, _m):
        name = d['name']
        need(type(name) is str and name not in self.blobs, 'BLOB_END name')
        data = bytes(self.blob_parts.pop(name, bytearray()))
        need(nat(d['bytes']) and d['bytes'] == len(data) and d['sha256'] == h(data), 'BLOB_END differs from the chunks of %s' % name)
        self.blobs[name] = data

    def blob_json(self, name, default=None):
        if name not in self.blobs:
            return default
        return json.loads(self.blobs[name].decode('utf-8'))

    def _k_PEER_MILESTONE(self, d, _m):
        self._milestone(d)

    def _k_DIAGNOSTIC(self, d, _m):
        self._milestone(d)

    # -- queries ------------------------------------------------------------
    def kinds(self, kind):
        return [e for e in self.events if e['kind'] == kind]

    def milestones(self, name):
        return [e['data'] for e in self.events if e['kind'] in ('PEER_MILESTONE', 'DIAGNOSTIC') and e['data']['milestone'] == name]

    def committed_bytes(self, s):
        return bytes(self.data[s][:self.committed[s]])

    def status(self):
        if self.violation:
            return 'VIOLATION'
        if not self.events:
            return 'MISSING'
        if self.terminal == 'END':
            return 'END'
        if self.terminal == 'INVALID':
            return 'INVALID'
        if self.signal:
            return 'SIGNAL_WITHOUT_END'
        return 'NO_TERMINAL'


def lines_of(b):
    out, i = [], 0
    while True:
        j = b.find(b'\n', i)
        if j < 0:
            return out, b[i:]
        out.append(b[i:j + 1])
        i = j + 1


def _signum(name):
    return signal.Signals[name].value


def _mono_of(log, kind, milestone=None):
    for e in log.events:
        if e['kind'] == kind and (milestone is None or e['data'].get('milestone') == milestone):
            return int(e['mono_ns'])
    return None


def wire_check(got_o, got_e, expected, complete_unsignalled):
    """F4-02: EQUAL/MISMATCH with a complete END and no signal; otherwise PREFIX/MISMATCH, or NOT_CHECKED when nothing was committed."""
    if complete_unsignalled:
        return 'EQUAL' if (got_o == expected['stdout'] and got_e == expected['stderr']) else 'MISMATCH'
    if not got_o and not got_e:
        return 'NOT_CHECKED'
    return 'PREFIX' if expected['stdout'].startswith(got_o) and expected['stderr'].startswith(got_e) else 'MISMATCH'


def reconcile(logs, language, os_witness, expected_wire=None, signal_sent_ns=None):
    """Cross-role and OS reconciliation. Returns (verdict, reasons, facts). Nothing is repaired.

    PASS: every role END(complete) and all cross-checks hold. KNOWN_SIGNAL_TERMINATION: adapter SIGNAL then
    END(complete=false) within 100ms, driver END(complete), peer END or SIGNAL (its exit witnessed by the OS
    checks), and no unknown commit. Batch 2A adds NO_CHILD and PREREADY_SIGNAL_TERMINATION (see below).
    Anything else is INVALID_CAPTURE.
    """
    reasons, facts = [], {}
    d, a, p = logs['driver'], logs['adapter'], logs['peer']
    statuses = {r: logs[r].status() for r in ROLES}
    # Batch 2A forms (evaluator-r3-contract.json R3-10): NO_CHILD = no adapter and no peer frame at all (spawn failed
    # or the child died before its first frame; a short-lived process is not witnessed); PREREADY_SIGNAL_TERMINATION =
    # adapter declared a signal (SIGNAL + incomplete END) before launching the peer. Validity per case is decided by
    # the evaluator (undeclared forms are INVALID_CAPTURE, R3-F02).
    no_child = language == 'typescript' and not a.events and not p.events and not a.raw_bytes and not p.raw_bytes
    preready = (language == 'typescript' and bool(a.events) and not p.events and not p.raw_bytes and a.signal is not None
                and statuses['adapter'] == 'END' and not a.kinds('END')[0]['data']['complete'])
    missing_ok = {'adapter', 'peer'} if no_child else ({'peer'} if preready else set())
    facts['no_child_candidate'] = no_child
    facts['preready_candidate'] = preready
    for role, log in logs.items():
        facts[role + '_status'] = statuses[role]
        if log.violation:
            reasons.append('%s: %s' % (role, log.violation))
        if not log.eof:
            reasons.append('%s: FIFO EOF not observed' % role)
        if statuses[role] in ('INVALID', 'MISSING', 'NO_TERMINAL') and not (role in missing_ok and statuses[role] == 'MISSING'):
            reasons.append('%s terminal status %s' % (role, statuses[role]))
    for name, ok in os_witness.get('checks', {}).items():
        if not ok:
            reasons.append('os: ' + name)
    signalled = a.signal is not None
    a_end, p_end, d_end = a.kinds('END'), p.kinds('END'), d.kinds('END')
    if statuses['adapter'] == 'SIGNAL_WITHOUT_END':
        reasons.append('adapter signalled without a terminal declaration')
    if statuses['driver'] == 'SIGNAL_WITHOUT_END':
        reasons.append('driver signalled without a terminal declaration')
    if statuses['peer'] == 'SIGNAL_WITHOUT_END' and not signalled:
        reasons.append('peer signalled although the adapter declared no signal')
    for role, ends in (('driver', d_end), ('peer', p_end)):
        if ends and not ends[0]['data']['complete']:
            reasons.append('%s END declared incomplete' % role)
    if language == 'typescript' and signalled and a_end:
        for s in STREAMS:
            if a.committed[s] != len(a.data[s]):
                reasons.append('adapter END after SIGNAL with uncommitted %s bytes: unknown OS completion' % s)
    if d_end:
        dm = int(d_end[0]['mono_ns'])
        for role, log in (('adapter', a), ('peer', p)):
            if any(int(e['mono_ns']) > dm for e in log.events):
                reasons.append('%s frame after the driver END (final barrier broken)' % role)
    if signal_sent_ns is not None:
        for kind in ('SIGNAL', 'END'):
            got = [rn for e, rn in zip(a.events, a.recv_ns) if e['kind'] == kind]
            if not got or got[0] - signal_sent_ns > SIGNAL_COMMIT_NS:
                reasons.append('adapter %s not received within 100ms of the supervisor signal delivery' % kind)
    abort_mono = _mono_of(d, 'DIAGNOSTIC', 'ABORT_CALLED')
    if abort_mono is not None and signalled:
        term = _mono_of(a, 'END') or _mono_of(a, 'INVALID')
        if term is None or term - abort_mono > SIGNAL_COMMIT_NS:
            reasons.append('adapter terminal declaration not within 100ms of ABORT_CALLED')
    # Raw ledgers rebuilt by the observer.
    facts['adapter_fault'] = a.fault
    facts['case_input_sha256_by_role'] = {r: logs[r].case_input_sha256 for r in ROLES}
    for s in STREAMS:
        facts['adapter_%s_read' % s] = len(a.data[s])
        facts['adapter_%s_committed' % s] = a.committed[s]
        facts['adapter_%s_sha256' % s] = h(a.committed_bytes(s))
    if language == 'typescript':
        held = p.kinds('REQUEST_HELD')
        if held and a.terminal == 'END':
            stdin = a.committed_bytes('stdin')
            if not (held[0]['data']['bytes'] == len(stdin) and held[0]['data']['sha256'] == h(stdin)):
                reasons.append('peer REQUEST_HELD differs from adapter-forwarded stdin')
        wrote = p.milestones('REPLY_WRITTEN')
        if wrote and a.terminal == 'END' and not signalled:
            w = wrote[0]['detail']
            if not (w['stdout_bytes'] == a.committed['stdout'] and w['stdout_sha256'] == h(a.committed_bytes('stdout'))):
                reasons.append('peer stdout write differs from adapter capture')
            if not (w['stderr_bytes'] == a.committed['stderr'] and w['stderr_sha256'] == h(a.committed_bytes('stderr'))):
                reasons.append('peer stderr write differs from adapter capture')
        if expected_wire is not None:
            # F4-02: the reference is the frozen fixture (insertion order). Complete END without signal: equality; under a
            # signal (or without a complete adapter END): the committed bytes must be a prefix; nothing committed: NOT_CHECKED.
            facts['wire_check'] = wire_check(a.committed_bytes('stdout'), a.committed_bytes('stderr'), expected_wire,
                                             a.terminal == 'END' and not signalled)
            if facts['wire_check'] == 'NOT_CHECKED':
                facts['wire_check_reason'] = 'nothing committed by the adapter'
            if facts['wire_check'] == 'MISMATCH':
                reasons.append('adapter capture differs from frozen fixture wire bytes')
        own = d.milestones('OWN_FIXTURE_CHILD_CLOSED')
        if own:
            o = own[0]['detail']
            if not (o['stdout_bytes'] == a.committed['stdout'] and o['stdout_sha256'] == h(a.committed_bytes('stdout'))):
                reasons.append('driver-received stdout differs from adapter commits')
            if not (o['stderr_bytes'] == a.committed['stderr'] and o['stderr_sha256'] == h(a.committed_bytes('stderr'))):
                reasons.append('driver-received stderr differs from adapter commits')
            if not (o['stdin_bytes'] == len(a.data['stdin']) and o['stdin_sha256'] == h(bytes(a.data['stdin']))):
                reasons.append('driver-sent stdin differs from adapter raw read')
            if a_end and a_end[0]['data']['complete']:
                ec = a_end[0]['data']
                if not (o['code'] == ec['child_exit_code'] and o['signal'] == ec['child_signal']):
                    reasons.append('adapter exit status does not mirror peer status')
            elif signalled and not (o['code'] is None and o['signal'] == a.signal):
                reasons.append('adapter did not terminate by the signal it declared')
    else:
        received = [m['detail'] for m in p.milestones('RECEIVED')]
        lines, rest = lines_of(a.committed_bytes('stdin'))
        seen = [{'bytes': len(x), 'sha256': h(x)} for x in lines]
        got = [{'bytes': r['bytes'], 'sha256': r['sha256']} for r in received]
        if p.terminal == 'END' and a.terminal == 'END':
            if got != seen or rest:
                reasons.append('peer-received lines differ from adapter-forwarded stdin lines')
        elif got != seen[:len(got)]:
            reasons.append('peer-received lines are not a prefix of adapter-forwarded stdin')
        written = [m['detail'] for m in p.milestones('REPLY_WRITTEN')]
        out = a.committed_bytes('stdout')
        off = 0
        for w in written:
            seg = out[off:off + w['bytes']]
            if len(seg) < w['bytes']:
                if not signalled and a.terminal == 'END':
                    reasons.append('peer reply %s not fully captured' % w['method'])
                break
            if h(seg) != w['sha256']:
                reasons.append('peer reply %s differs from adapter capture' % w['method'])
                break
            off += w['bytes']
        if a.terminal == 'END' and not signalled and off != len(out):
            reasons.append('adapter stdout has bytes not written by the peer')
        if a.data['stderr']:
            reasons.append('unexpected stderr bytes in the python topology (the synthetic peer never writes stderr)')
        own = d.milestones('OWN_CLIENT_CLOSED')
        if own:
            o = own[0]['detail']
            if not (o['recv_bytes'] == a.committed['stdout'] and o['recv_sha256'] == h(a.committed_bytes('stdout'))):
                reasons.append('driver-received stdout differs from adapter commits')
            if not (o['sent_bytes'] == len(a.data['stdin']) and o['sent_sha256'] == h(bytes(a.data['stdin']))):
                reasons.append('driver-sent stdin differs from adapter raw read')
            if not (o['stderr_bytes'] == a.committed['stderr'] and o['stderr_sha256'] == h(a.committed_bytes('stderr'))):
                reasons.append('driver-received stderr differs from adapter commits')
            want = None
            if a_end and a_end[0]['data']['complete']:
                ec = a_end[0]['data']
                want = ec['child_exit_code'] if ec['child_exit_code'] is not None else -_signum(ec['child_signal'])
            elif signalled:
                want = -_signum(a.signal)
            if want is not None and o['returncode'] != want:
                reasons.append('adapter returncode %r differs from its declared status %r' % (o['returncode'], want))
    if p_end and a_end and a_end[0]['data']['complete']:
        if p_end[0]['data']['child_exit_code'] != a_end[0]['data']['child_exit_code']:
            reasons.append('peer declared exit code differs from adapter-observed exit code')
    complete = (all(s == 'END' for s in statuses.values()) and all(x and x[0]['data']['complete'] for x in (a_end, p_end, d_end)))
    d_complete = bool(d_end) and d_end[0]['data']['complete']
    if reasons:
        verdict = 'INVALID_CAPTURE'
    elif no_child and d_complete:
        verdict = 'NO_CHILD'
    elif preready and d_complete:
        verdict = 'PREREADY_SIGNAL_TERMINATION'
    elif complete:
        verdict = 'PASS'
    elif (signalled and a_end and not a_end[0]['data']['complete'] and d_end and d_end[0]['data']['complete']
          and statuses['peer'] in ('END', 'SIGNAL_WITHOUT_END')):
        verdict = 'KNOWN_SIGNAL_TERMINATION'
    else:
        verdict = 'INVALID_CAPTURE'
        reasons.append('incomplete capture: %s' % statuses)
    return verdict, reasons, facts


def reconcile_driver_only(logs, os_witness):
    """Erratum DP-SPEC/R2-F01: form of a driver_only capture. Returns (verdict, reasons, facts); verdict PASS or INVALID_CAPTURE."""
    reasons, facts = [], {'topology': 'driver_only'}
    d = logs['driver']
    for role in ('adapter', 'peer'):
        log = logs.get(role)
        if log is not None and (log.events or log.raw_bytes):
            reasons.append('%s frame in a driver_only capture' % role)
        if log is not None and not log.eof:
            reasons.append('%s: FIFO EOF not observed' % role)
    st = d.status()
    facts['driver_status'] = st
    if d.violation:
        reasons.append('driver: %s' % d.violation)
    if not d.eof:
        reasons.append('driver: FIFO EOF not observed')
    ends = d.kinds('END')
    if st != 'END' or not ends or not ends[0]['data']['complete']:
        reasons.append('driver terminal status %s' % st)
    for name, ok in os_witness.get('checks', {}).items():
        if not ok:
            reasons.append('os: ' + name)
    if d.blob_parts:
        reasons.append('BLOB without BLOB_END: %s' % sorted(d.blob_parts)[:5])
    results = [m['detail'] for m in d.milestones('WRAPPER_RESULT')]
    left = {str(m['detail']['step']) for m in d.milestones('LEFTOVER')}
    for r in results:
        if r.get('settled') != 'close':
            reasons.append('wrapper.run of step %s not settled on close' % r.get('step'))
        if str(r.get('step')) not in left:
            reasons.append('wrapper.run of step %s without its LEFTOVER witness' % r.get('step'))
    facts['wrapper_runs'] = len(results)
    facts['blobs'] = sorted(d.blobs)
    if not d.milestones('CALLS_DONE'):
        reasons.append('driver without CALLS_DONE')
    verdict = 'INVALID_CAPTURE' if reasons else 'PASS'
    return verdict, reasons, facts
