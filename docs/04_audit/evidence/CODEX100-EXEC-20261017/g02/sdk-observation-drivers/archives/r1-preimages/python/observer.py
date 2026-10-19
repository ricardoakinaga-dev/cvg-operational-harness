"""Host-side independent observer for the SDK reference profile.

Runs outside the target cgroup inside the supervisor process. Its decoder and
validators are a separate implementation from the role-side encoders
(channel.py / channel.cjs) and from the SDK and fixtures. It never trusts a
self-reported value alone: byte counters are rebuilt from the raw chunks and
PIDs are joined with independently observed /proc witnesses by the supervisor.
"""
import base64
import hashlib
import json

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
    'BEGIN': {'nonce', 'source_sha256', 'pid_namespace'}, 'READY': set(),
    'RAW_READ': {'stream', 'offset', 'base64', 'sha256'}, 'FORWARD_COMMIT': {'stream', 'offset', 'bytes'},
    'STREAM_END': {'stream', 'read_bytes', 'committed_bytes', 'read_sha256'},
    'END': {'streams', 'child_exit_code', 'child_signal', 'complete'},
    'REQUEST_HELD': {'bytes', 'sha256'}, 'API_CANCELLED': {'name', 'message'}, 'HOOK_CLOSED': {'turn_id', 'closed'},
    'API_RESULT': {'api', 'result', 'observations'}, 'API_ERROR': {'api', 'name', 'message', 'cause'},
    'SIGNAL': {'signal', 'inflight'}, 'INVALID': {'reason'}, 'PEER_MILESTONE': {'milestone', 'detail'},
    'DIAGNOSTIC': {'milestone', 'detail'},
}
ALLOWED = {
    'driver': {'BEGIN', 'READY', 'API_RESULT', 'API_ERROR', 'API_CANCELLED', 'HOOK_CLOSED', 'DIAGNOSTIC', 'SIGNAL', 'END', 'INVALID'},
    'adapter': {'BEGIN', 'READY', 'RAW_READ', 'FORWARD_COMMIT', 'STREAM_END', 'SIGNAL', 'END', 'INVALID'},
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
    if obj.get('kind') == 'RAW_READ' and type(obj.get('data')) is dict and type(obj['data'].get('base64')) is str:
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
        self.eof = False
        self.violation = None
        self.data = {s: bytearray() for s in STREAMS}
        self.committed = {s: 0 for s in STREAMS}
        self.stream_end = {}

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


def reconcile(logs, language, os_witness, expected_wire=None):
    """Cross-role and OS reconciliation. Returns (verdict, reasons, facts). Nothing is repaired."""
    reasons, facts = [], {}
    d, a, p = logs['driver'], logs['adapter'], logs['peer']
    for role, log in logs.items():
        facts[role + '_status'] = log.status()
        if log.violation:
            reasons.append('%s: %s' % (role, log.violation))
        if not log.eof:
            reasons.append('%s: FIFO EOF not observed' % role)
    for name, ok in os_witness.get('checks', {}).items():
        if not ok:
            reasons.append('os: ' + name)
    signalled = a.signal is not None
    # Raw ledgers rebuilt by the observer.
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
        if expected_wire is not None and a.terminal == 'END' and not signalled:
            if a.committed_bytes('stdout') != expected_wire['stdout'] or a.committed_bytes('stderr') != expected_wire['stderr']:
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
            ends = a.kinds('END')
            if ends and ends[0]['data']['complete']:
                ec = ends[0]['data']
                if not (o['code'] == ec['child_exit_code'] and o['signal'] == ec['child_signal']):
                    reasons.append('adapter exit status does not mirror peer status')
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
        own = d.milestones('OWN_CLIENT_CLOSED')
        if own:
            o = own[0]['detail']
            if not (o['recv_bytes'] == a.committed['stdout'] and o['recv_sha256'] == h(a.committed_bytes('stdout'))):
                reasons.append('driver-received stdout differs from adapter commits')
            if not (o['sent_bytes'] == len(a.data['stdin']) and o['sent_sha256'] == h(bytes(a.data['stdin']))):
                reasons.append('driver-sent stdin differs from adapter raw read')
            if not (o['stderr_bytes'] == a.committed['stderr'] and o['stderr_sha256'] == h(a.committed_bytes('stderr'))):
                reasons.append('driver-received stderr differs from adapter commits')
    peer_end = p.kinds('END')
    adapter_end = a.kinds('END')
    if peer_end and adapter_end and adapter_end[0]['data']['complete']:
        if peer_end[0]['data']['child_exit_code'] != adapter_end[0]['data']['child_exit_code']:
            reasons.append('peer declared exit code differs from adapter-observed exit code')
    statuses = {r: logs[r].status() for r in ROLES}
    complete = (all(s == 'END' for s in statuses.values()) and adapter_end and adapter_end[0]['data']['complete'])
    if reasons:
        verdict = 'INVALID_CAPTURE'
    elif complete:
        verdict = 'PASS'
    elif signalled and adapter_end and not adapter_end[0]['data']['complete'] and statuses['driver'] == 'END':
        verdict = 'KNOWN_SIGNAL_TERMINATION'
    else:
        verdict = 'INVALID_CAPTURE'
        reasons.append('incomplete capture: %s' % statuses)
    return verdict, reasons, facts
