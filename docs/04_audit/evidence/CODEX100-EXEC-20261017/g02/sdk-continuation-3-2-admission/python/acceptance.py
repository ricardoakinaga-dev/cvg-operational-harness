"""Host-side evaluator of DX100-G02 continuation 3-2 (acceptance-r4-c32), Python sub-lot C3-2.

C3-2 (evaluator-r4-c3-delta.json): predicate table and composition of inputs/spec-c3/cases-c3-2.json (sha bound; R3-12 selftest);
- E3-07: wait.client_effect_recorded (sanity): every wait step with wait_class CLIENT_EFFECT or CLIENT_EFFECT_UNLESS_ALIVE emitted
  WAIT_RESULT {step, ok, class, elapsed_ms, thread_started, thread_alive}; a CLIENT_EFFECT_UNLESS_ALIVE timeout with the named thread
  alive is a harness precondition (the driver ends INVALID, rule 1, R2-F03 (2)); a client-effect timeout never decides alone.
  fault.fired_as_declared: an item with zero_calls_client_effect_unless_started accepts zero calls of the target (FAULT_SCOPE removed
  with calls 0 and no FAULT frame) only when the named thread never started by the THREAD_REGISTRY of the driver (the same registry
  of WAIT_RESULT.thread_started, R2-F03 (3)); a target called a different number of times, an undeclared firing or a scope not
  restored stays INVALID_CAPTURE;
- E3-08: TurnResult (dataclass with slots) has the summary {class: TurnResult} by jeq and is judged by the static probes;
- wire.payloads_exact (2A table): params of every request with declared params equal by jeq and no key of
  expected.wire.must_not_contain_keys at any depth;
- carry-over C31-ADM/R1-F01: the OS witness of a SIGTERM termination is a zombie with wait status 15, or the PID absent without
  any observed zombie (an absence after a zombie with another status is no longer accepted), with a negative selftest.
The C3-1 carry-overs of this stack stay: R1-F02 (capture helpers inside the try of evaluate), R1-F03 (plan_binding), R1-F04.

Text of the C3-1 version (Python CONTROL stack of continuation 3-1, acceptance-r4-c31-py):

C3-1 (evaluator-r4-c3-delta.json, E3-01): the predicate table and composition are those of inputs/spec-c3/cases-c3-1.json (sha bound);
this evaluator judges only the Python slot C31-CTRL01 (D3-07: copy of 2B1-CTRL01) and the 4 Python DIAG; the TypeScript slots are
judged by ../tslane/acceptance.py. Carry-overs of the 2B-2 admission (freeze-r4-c3-delta.json#D3-08), applied before the source
freeze: R1-F02 expand_parts, Seq, capture_extra and capture_form run inside the try of evaluate (a failure there is
evaluation_completed=false -> INVALID_CAPTURE by rule 3, or rule 1 when the form itself is INVALID_CAPTURE); R1-F03 reevaluate checks
the plan of the case folder against case-plan-py.json bound by the source freeze and the barrier steps of the case_input
(plan_binding, negative control in the selftest); R1-F04 positive/negative selftest of zombie_t_ns in no_termination_before.

Inherited text of the 2B-2 evaluator (evaluator r4 + inputs/spec-2b/evaluator-r4-2b-delta.json):

Independent of the SDK, of the synthetic peer and of the role-side encoders: it reads the observer RoleLogs, the observer verdict
and the supervisor witnesses (actions with the global sequence index gidx, cgroup scan). Inherits R4-01..R4-05, R4-07..R4-09
(R4-06 and R4-10 do not apply). Clauses:

- E2B-01 predicate table and composition of cases-2b-2.json (sha bound; classes never reclassified; R3-12 selftest);
- E2B-02 jeq on every JSON value comparison (bool strict, null only null, int/float by value, -0.0 == 0.0);
- E2B-04 order grammar: chains of KIND:REF tokens strictly increasing on the unit sequence (gidx): STEP:n, CANCEL:n,
  API_RESULT:n, API_ERROR:n, API_CANCELLED:n, WORKER:<name>, HOOK:<id>#k (k counted per (id, event): R2-F01, lead decision),
  RAW_READ:<method>[@<threadId>]#k, COMMIT_REPLY:<method>[@<threadId>]#k, RELEASE_REPLY:<method>[@<threadId>]#k;
- E2B-05/E2B-06 identity tokens and hook matching by id, attributes and occurrence (per (id, event), recounted here over the
  HOOK_EVENT frames: a self-reported occurrence that differs from the recount is a capture failure, carry-over R1-F02);
- E2B-07 ValidationError: first_error, error_count, errors_contain (loc or loc_suffix); the full errors() list is recorded
  (model.errors_recorded, informational);
- E2B-11 result matching (vocabulary summaries by jeq; models with dotted keys by alias-path subset; NOTE fields subset + dump);
- E2B-13 wire.absent judges requests only; E2B-14 harness waits that time out are INVALID_CAPTURE (driver side), the R2-F04
  client-effect waits continue;
- 2B-2 predicates: clock.recorder_exact, shim.scope_exact, fault.fired_as_declared, model.oracle_exact, model.errors_recorded,
  peer.login_frames_synthetic (the single rule of fixture-rpc.login_problems, FORBIDDEN_LOGIN_KEYS), wire.emitted_lines_exact;
- carry-over R1-F05: each condition of a barrier-plan action is witnessed before the action (gidx); the peer milestone
  BEFORE_REPLY_WRITTEN precedes the commit of the reply bytes; R1-F08: hook.code_identity checks the sha of the file against the
  identity freeze (sdk-python tree) or the stdlib anchors of the cases before reading the line;
- PART milestones (frame fields above the channel metadata budget) are reassembled and checked by sha before any predicate.
Composition (first rule that applies): 1 form INVALID_CAPTURE; 2 form not accepted -> MISMATCH; 3 evaluator failed;
4 capture failure; 5 order_unilateral (unused); 6 only client failures -> MISMATCH; 7 PASS_CLIENT_OBSERVATION.
0 functional receipts, 0 parity credit.

Usage: python3 -I -B acceptance.py reevaluate <case-dir>   (exit 0 when every predicate and the outcome are equal)
"""
import base64
import hashlib
import importlib.util
import json
import re
import sys
from pathlib import Path

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
SPEC_DIR = HERE.parent / 'inputs' / 'spec-c3'
SPEC = SPEC_DIR / 'cases-c3-2.json'
SPEC1 = HERE.parent / 'inputs' / 'spec-2b' / 'cases-2b-2.json'  # base of the CONTROL copy (D3-07) and of the replays
CASES_SHA = '9881180dff444b9193965a9ae85af0b52bbd07a55e4386118b803b3237a06849'
CASES1_SHA = '382d7b2956717634f95545276020fc47b6328465a5fd81f5a690424d065eaedc'
VERSION = 'acceptance-r4-c32'
EVALUATOR = VERSION + ' (DX100-G02 continuation 3-2; frozen predicate table and composition of cases-c3-2.json; E2B-01..E2B-14, E3-01, E3-07, E3-08)'
UNIT_DIR = HERE.parent
IDENTITY_FREEZE = UNIT_DIR / 'identity-freeze-r4-c32.json'
SOURCE_FREEZE = UNIT_DIR / 'source-freeze-r4-c32.json'
FROZEN_PLAN = UNIT_DIR / 'case-plan.json'
CONTROL_CASES = ('2B1-CTRL01', '2B2-CTRL01', 'C31-CTRL01', 'C32-CTRL01')
RUNTIME_SDK = Path('/mnt/dados/cvg-work/cvg-codex100-c32-runtime-20261019/sdk-python')
UUID4 = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
FIXED_ENV = {'HOME': '/work/home', 'TMPDIR': '/work/tmp', 'PATH': '/runtime', 'LANG': 'C.UTF-8', 'LC_ALL': 'C.UTF-8',
             'TZ': 'UTC', 'PYTHONDONTWRITEBYTECODE': '1', 'UV_THREADPOOL_SIZE': '2'}
CAPTURE_CLASSES = ('peer_or_capture_sanity', 'capture_order_or_cleanup')
CAPTURE_PRED = 'capture.case_input_frozen_bytes'
SIGNAL_FORMS = ('CLIENT_TERMINATED_SIGTERM', 'CLIENT_KILLED_SIGKILL')
# D3-05 (mirror of python-driver.py): the wait classes of a step (wait_class field); without it HARNESS_PRECONDITION.
WAIT_CLASSES = ('CLIENT_EFFECT', 'CLIENT_EFFECT_UNLESS_ALIVE')
WAIT_APIS = ('thread.join', 'hook.wait', 'excepthook.wait', 'worker.join', 'probe.until', 'worker.parked', 'worker.still_parked')
MODEL_APIS = ('model.validate', 'model.construct', 'model.dump')
TOKEN = re.compile(r'^(STEP|CANCEL|API_RESULT|API_ERROR|API_CANCELLED):(\d+)$|^WORKER:([A-Za-z0-9_]+)$|^HOOK:([A-Za-z0-9_]+)#(\d+)$'
                   r'|^(RAW_READ|COMMIT_REPLY|RELEASE_REPLY):([^@#\s]+)(?:@([^#\s]+))?#(\d+)$')


def _load_doc(path, digest):
    raw = path.read_bytes()
    if hashlib.sha256(raw).hexdigest() != digest:
        raise SystemExit('%s drifted from the approved spec' % path.name)
    return json.loads(raw)


_DOC = _load_doc(SPEC, CASES_SHA)
CASES_DEF = {c['id']: c for c in _DOC['cases']}
TABLE = _DOC['predicate_table']
COMPOSITION = _DOC['composition']


def cases1():
    return _load_doc(SPEC1, CASES1_SHA)


def cases2():
    return _DOC


def class_of(pid):
    return TABLE[pid]['class']


def plan(case):
    c = CASES_DEF[case]
    return {'accepted_capture_forms': c['accepted_capture_forms'], 'predicates': c['predicates'],
            'classes': {p: class_of(p) for p in c['predicates']}, 'known_bad': c['known_bad'],
            'inconclusive_on_deadline': c['inconclusive_on_deadline'], 'composition': 'inputs/spec-c3/cases-c3-2.json#/composition',
            'evaluator': EVALUATOR}


class Preds:
    def __init__(self, case):
        self.wanted = set(CASES_DEF[case]['predicates'])
        self.got = {}

    def need(self, pid):
        return pid in self.wanted

    def add(self, pid, ok, detail=None):
        if pid not in TABLE:
            raise KeyError('predicate %s not in the frozen table' % pid)
        if pid in self.wanted:
            self.got[pid] = (bool(ok), detail)


# ------------------------------------------------------------------------------------------------ JSON helpers

def _pairs(ps):
    out = {}
    for k, v in ps:
        if k in out:
            raise ValueError('duplicate key')
        out[k] = v
    return out


def _reject(name):
    raise ValueError('nonfinite ' + name)


def strict_obj(b):
    try:
        x = json.loads(b.decode('utf-8'), object_pairs_hook=_pairs, parse_constant=_reject)
    except (ValueError, UnicodeDecodeError):
        return None
    return x if isinstance(x, dict) else None


def wire_lines(raw):
    out, i = [], 0
    while True:
        j = raw.find(b'\n', i)
        if j < 0:
            return out, raw[i:]
        line = raw[i:j]
        out.append({'raw': line, 'obj': strict_obj(line), 'start': i, 'end': j})  # end = offset of the LF
        i = j + 1


def sha(b):
    return hashlib.sha256(b).hexdigest()


def jeq(a, b):
    """E2B-02: strict by type (bool never a number, null only null); int == float by value; -0.0 == 0.0 by value."""
    if isinstance(a, bool) or isinstance(b, bool):
        return isinstance(a, bool) and isinstance(b, bool) and a == b
    if a is None or b is None:
        return a is None and b is None
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        return a == b
    if isinstance(a, str) or isinstance(b, str):
        return isinstance(a, str) and isinstance(b, str) and a == b
    if isinstance(a, (list, tuple)) and isinstance(b, (list, tuple)):
        return len(a) == len(b) and all(jeq(x, y) for x, y in zip(a, b))
    if isinstance(a, dict) and isinstance(b, dict):
        return set(a) == set(b) and all(jeq(a[k], b[k]) for k in a)
    return False


def path_get(obj, dotted):
    cur = obj
    for part in dotted.split('.'):
        if isinstance(cur, dict) and part in cur:
            cur = cur[part]
        else:
            return ('$missing',)
    return cur


def subset_paths(want, dump):
    """E2B-11: every frozen key is an alias path over the dump; values compared by jeq."""
    return isinstance(dump, dict) and all(jeq(path_get(dump, k), v) for k, v in want.items())


def result_matches(want, got):
    """E2B-11 result matching over the driver summary."""
    if isinstance(got, dict) and got.get('NOTE') is True:
        if not isinstance(want, dict):
            return False
        ok = jeq(want.get('method'), got.get('method')) and jeq(want.get('payload_class'), got.get('payload_class'))
        if 'fields' in want:
            ok = ok and subset_paths(want['fields'], got.get('dump'))
        if 'dump' in want:
            ok = ok and jeq(want['dump'], got.get('dump'))
        if 'params' in want:
            ok = ok and jeq(want['params'], got.get('params'))
        return ok
    if isinstance(want, dict) and want and all('.' in k for k in want) and isinstance(got, dict):
        return subset_paths(want, got)
    return jeq(want, got)


def detail_of(log, name):
    return [m['detail'] for m in log.milestones(name)]


PART_FIELDS = {'API_RESULT': 'result', 'DIAGNOSTIC': 'detail', 'PROBE': 'value', 'WORKER_RESULT': 'value', 'MODEL_RESULT': 'result',
               'WORKER_PARKED': 'witness'}


def strict_value(b):
    return json.loads(b.decode('utf-8'), object_pairs_hook=_pairs, parse_constant=_reject)


def expand_parts(log):
    """Reassemble the PART milestones of the driver (fields above the channel metadata budget) in place; returns problems.
    Independent of harness2b.parts_of: base64 pieces by index, total bytes and sha256 of the compact JSON checked."""
    parts, problems = {}, []
    for e in log.events:
        if e['kind'] == 'DIAGNOSTIC' and e['data']['milestone'] == 'PART':
            d = e['data']['detail']
            if not isinstance(d, dict):
                problems.append('PART detail is not an object')
                continue
            parts.setdefault(d.get('sha256'), {})[d.get('i')] = (d.get('n'), d.get('b64'))
    used = set()
    for e in log.events:
        f = PART_FIELDS.get(e['kind'])
        if f is None or (e['kind'] == 'DIAGNOSTIC' and e['data']['milestone'] == 'PART'):
            continue
        v = e['data'].get(f)
        if not (isinstance(v, dict) and set(v) == {'$parts', 'n', 'bytes'}):
            continue
        got = parts.get(v['$parts'], {})
        try:
            if sorted(got) != list(range(v['n'])) or any(n != v['n'] for n, _ in got.values()):
                raise ValueError('PART set')
            raw = b''.join(base64.b64decode(got[i][1], validate=True) for i in range(v['n']))
            if len(raw) != v['bytes'] or sha(raw) != v['$parts']:
                raise ValueError('PART bytes/sha')
            e['data'][f] = strict_value(raw)
            used.add(v['$parts'])
        except (KeyError, TypeError, ValueError, UnicodeDecodeError) as exc:
            problems.append('PART %s of %s: %s' % (str(v.get('$parts'))[:16], e['kind'], exc))
    orphan = [k for k in parts if k not in used]
    if orphan:
        problems.append('PART without a referencing frame: %d' % len(orphan))
    return problems


def ms(log, name):
    return log.milestones(name)


# ------------------------------------------------------------------------------------------------ unit sequence (E2B-04)

class Seq:
    """Tokens of one unit -> gidx. Frames carry the supervisor receive index; actions carry their own (same counter)."""

    def __init__(self, logs, w):
        self.logs, self.w = logs, w
        fg = w.get('frame_gidx') or {}
        self.g = {r: list(fg.get(r) or []) for r in ('driver', 'adapter', 'peer')}
        self.tokens = {}
        self.hook_events = []
        self.hook_recount_bad = []
        self.steps_by_label = {}
        self.stdout_line_commit = []
        self._driver()
        self._wire()
        self._actions()

    def gidx(self, role, i):
        return self.g[role][i] if i < len(self.g[role]) else None

    def _put(self, tok, g):
        if g is not None and tok not in self.tokens:
            self.tokens[tok] = g

    def _driver(self):
        d = self.logs['driver']
        hook_counts = {}
        for i, e in enumerate(d.events):
            g = self.gidx('driver', i)
            k, data = e['kind'], e['data']
            if k == 'DIAGNOSTIC' and data['milestone'] == 'STEP_BEGIN':
                self._put('STEP:%d' % data['detail']['step'], g)
            elif k == 'CANCEL':
                self._put('CANCEL:%d' % data['step'], g)
            elif k in ('API_RESULT', 'API_ERROR'):
                n = data['api'].split(':', 1)[0]
                if n.isdigit():
                    self._put('%s:%s' % (k, n), g)
                    self.steps_by_label.setdefault(int(n), []).append(e)
            elif k == 'API_CANCELLED':
                n = data['message'].split(':', 1)[0]
                if n.isdigit():
                    self._put('API_CANCELLED:%s' % n, g)
                    self.steps_by_label.setdefault(int(n), []).append(e)
            elif k == 'WORKER_RESULT':
                self._put('WORKER:%s' % data['name'], g)
            elif k == 'HOOK_EVENT':
                key = (data['id'], data['event'])
                hook_counts[key] = hook_counts.get(key, 0) + 1
                occ = hook_counts[key]  # R1-F02: recounted per (id, event) over the frames, never the self-report alone
                if data['occurrence'] != occ:
                    self.hook_recount_bad.append([data['id'], data['event'], data['occurrence'], occ])
                ev = dict(data, gidx=g, seq=e['seq'], occurrence=occ, reported_occurrence=data['occurrence'])
                self.hook_events.append(ev)
                self._put('HOOK:%s:%s#%d' % (data['id'], data['event'], occ), g)

    def _wire(self):
        a = self.logs['adapter']
        reads, commits = [], []  # (offset, length, gidx) per stream
        for i, e in enumerate(a.events):
            g = self.gidx('adapter', i)
            if e['kind'] == 'RAW_READ' and e['data']['stream'] == 'stdin':
                reads.append((e['data']['offset'], len(base64.b64decode(e['data']['base64'])), g))
            elif e['kind'] == 'FORWARD_COMMIT' and e['data']['stream'] == 'stdout':
                commits.append((e['data']['offset'], e['data']['bytes'], g))

        def covering(rows, off):
            for o, n, g in rows:
                if o <= off < o + n:
                    return g
            return None

        cl, _ = wire_lines(a.committed_bytes('stdin'))
        counts = {}
        ids = {}
        for x in cl:
            obj = x['obj'] or {}
            if 'method' not in obj:
                continue
            m = obj['method']
            tid = (obj.get('params') or {}).get('threadId') if isinstance(obj.get('params'), dict) else None
            for key in ([m] + (['%s@%s' % (m, tid)] if isinstance(tid, str) else [])):
                counts[key] = counts.get(key, 0) + 1
                self._put('RAW_READ:%s#%d' % (key, counts[key]), covering(reads, x['end']))
                if 'id' in obj:
                    ids.setdefault(str(obj['id']), []).append('%s#%d' % (key, counts[key]))
        sl, _ = wire_lines(a.committed_bytes('stdout'))
        self.stdout_line_commit = [covering(commits, x['end']) for x in sl]
        for x in sl:
            obj = x['obj'] or {}
            if 'id' in obj and 'method' not in obj and str(obj['id']) in ids:
                for ref in ids[str(obj['id'])]:
                    self._put('COMMIT_REPLY:%s' % ref, covering(commits, x['end']))

    def _actions(self):
        counts = {}
        for act in self.w.get('actions') or []:
            dt = act['detail']
            if act['action'] == 'CONTROL' and dt.get('command') == 'RELEASE_REPLY' and dt.get('method'):
                m = dt['method']
                tid = (dt.get('params') or {}).get('threadId') if isinstance(dt.get('params'), dict) else None
                for key in ([m] + (['%s@%s' % (m, tid)] if isinstance(tid, str) else [])):
                    counts[key] = counts.get(key, 0) + 1
                    self._put('RELEASE_REPLY:%s#%d' % (key, counts[key]), act.get('gidx'))

    def hook_event_kind(self, hid, hooks_decl):
        ev = hooks_decl.get(hid)
        return None if ev is None or ev == 'call+return' else ev

    def lookup(self, tok, hooks_decl):
        m = TOKEN.match(tok)
        if not m:
            raise ValueError('token outside the E2B-04 grammar: %r' % tok)
        if tok.startswith('HOOK:'):
            hid, k = m.group(4), int(m.group(5))
            ev = self.hook_event_kind(hid, hooks_decl)
            if ev is None:
                raise ValueError('HOOK token of an undeclared or call+return hook needs the event (R2-F01): %r' % tok)
            return self.tokens.get('HOOK:%s:%s#%d' % (hid, ev, k))
        return self.tokens.get(tok)

    def chain_ok(self, chain, hooks_decl):
        got = [self.lookup(t, hooks_decl) for t in chain]
        ok = all(g is not None for g in got) and all(x < y for x, y in zip(got, got[1:]))
        return ok, dict(zip(chain, got))


def parse_chain(chain):
    """Grammar check only (selftest over the frozen chains of both sub-lots)."""
    return all(isinstance(t, str) and TOKEN.match(t) for t in chain)


def hooks_declared(c):
    out = {}
    for s in c['case_input'].get('sdk_calls', []) + c['case_input'].get('diag_calls', []):
        if s['api'] == 'hook.install':
            for h in s['hooks']:
                out[h['id']] = h['event']
    return out


def hook_entry_matches(seq, entry, hooks_decl):
    """E2B-06 (R2-F01): id, event (declared or the hook's single event), occurrence per (id, event), attributes, order."""
    hid = entry['id']
    ev = entry.get('event') or seq.hook_event_kind(hid, hooks_decl)
    cands = [e for e in seq.hook_events if e['id'] == hid and (ev is None or e['event'] == ev)]
    if 'occurrence' in entry:
        cands = [e for e in cands if e['occurrence'] == entry['occurrence']]
    attrs = {k: v for k, v in entry.items() if k not in ('id', 'event', 'occurrence', 'before', 'after', 'during', 'thread_name_prefix', 'thread_name')}
    out = []
    for e in cands:
        rec = e['record']
        if 'thread_name' in entry and e['thread_name'] != entry['thread_name']:
            continue
        if 'thread_name_prefix' in entry and not e['thread_name'].startswith(entry['thread_name_prefix']):
            continue
        if not all(k in rec and jeq(rec[k], v) for k, v in attrs.items()):
            continue
        g = e['gidx']
        ok = True
        for rel in ('before', 'after'):
            if rel in entry:
                other = seq.lookup(entry[rel], hooks_decl)
                ok = ok and other is not None and g is not None and (g < other if rel == 'before' else g > other)
        if 'during' in entry:
            n = int(entry['during'].split(':')[1])
            start = seq.lookup('STEP:%d' % n, hooks_decl)
            ends = [seq.tokens.get('%s:%d' % (k, n)) for k in ('API_RESULT', 'API_ERROR', 'API_CANCELLED')]
            end = min([x for x in ends if x is not None], default=None)
            ok = ok and start is not None and end is not None and g is not None and start < g < end
        if ok:
            out.append(e)
    return out


# ------------------------------------------------------------------------------------------------ inherited helpers

def eof_barrier_ok(logs, actions):
    d, a, p = logs['driver'], logs['adapter'], logs['peer']

    def recv(log, kind, milestone):
        for e, rn in zip(log.events, log.recv_ns):
            if e['kind'] == kind and e['data'].get('milestone') == milestone:
                return rn
        return None
    closed = recv(d, 'DIAGNOSTIC', 'CLIENT_STDIN_CLOSED')
    eof = recv(p, 'PEER_MILESTONE', 'STDIN_EOF')
    fin = [x['t_ns'] for x in actions if x['detail'].get('command') == 'FINISH_PEER']
    end = a.stream_end.get('stdin')
    return (closed is not None and eof is not None and bool(fin) and closed <= fin[0] and eof <= fin[0]
            and end is not None and end['committed_bytes'] == len(a.data['stdin']))


_RPC = None


def _peer_v2():
    global _RPC
    if _RPC is None:
        def load(name, path):
            spec = importlib.util.spec_from_file_location(name, path)
            m = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(m)
            return m
        rpc = load('acc_fixture_rpc_2b2', HERE / 'fixture-rpc.py')
        rpc.C = load('acc_channel_2b2', HERE / 'channel.py')
        _RPC = rpc
    return _RPC


def peer_replay_check(case_input, logs):
    """F4-05: replay of the frozen peer v2 script over the committed client requests; EQUAL / PREFIX under signal / NOT_CHECKED."""
    a = logs['adapter']
    if 'peer_script' not in case_input:
        return {'status': 'NOT_APPLICABLE'}
    script = _peer_v2().ScriptV2(case_input['peer_script'])
    want = b''
    for line in a.committed_bytes('stdin').split(b'\n'):
        msg = strict_obj(line) if line else None
        if not (isinstance(msg, dict) and isinstance(msg.get('method'), str) and 'id' in msg):
            continue
        _rule, ops = script.plan(msg)
        for op in ops:
            if op[0] == 'write':
                want += op[3]
            elif op[0] == 'hold':
                want += op[2]
    got = a.committed_bytes('stdout')
    complete = a.terminal == 'END' and a.signal is None and bool(a.kinds('END')) and a.kinds('END')[0]['data']['complete']
    if complete:
        status = 'EQUAL' if got == want else 'MISMATCH'
    elif not got:
        status = 'NOT_CHECKED'
    else:
        status = 'PREFIX' if want.startswith(got) else 'MISMATCH'
    return {'status': status, 'stdout_bytes': len(got), 'replay_bytes': len(want), 'stdout_sha256': sha(got), 'replay_sha256': sha(want)}


def case_input_witness(c, logs, w, want=None):
    want = c['case_input_sha256'] if want is None else want
    roles = {r: logs[r].case_input_sha256 for r in ('driver', 'adapter', 'peer')}
    present = {r: v for r, v in roles.items() if logs[r].events}
    ok = (jeq(w.get('case_input_sha256_supervisor'), want) and jeq(w.get('case_input_sha256_recomputed'), want)
          and 'driver' in present and all(v == want for v in present.values()))
    return ok, {'frozen': want, 'supervisor': w.get('case_input_sha256_supervisor'), 'recomputed': w.get('case_input_sha256_recomputed'),
                'roles': {r: (roles[r] if r in present else 'NOT_APPLICABLE: no BEGIN') for r in roles}}


# ------------------------------------------------------------------------------------------------ wire predicates

def client_lines(logs):
    cl, tail = wire_lines(logs['adapter'].committed_bytes('stdin'))
    return cl, tail


def requests_of(cl):
    return [x['obj'] for x in cl if x['obj'] and 'method' in x['obj'] and 'id' in x['obj']]


def notifications_of(cl):
    return [x['obj'] for x in cl if x['obj'] and 'method' in x['obj'] and 'id' not in x['obj']]


def handshake_ok(obj):
    params = obj.get('params') if isinstance(obj.get('params'), dict) else {}
    return (obj.get('method') == 'initialize' and isinstance(obj.get('id'), str) and bool(UUID4.match(obj['id']))
            and jeq((params.get('clientInfo') or {}).get('name'), 'codex_python_sdk') and jeq(params.get('capabilities'), {'experimentalApi': True}))


def initialize_handshake(cl):
    objs = [x['obj'] or {} for x in cl]
    idx = [i for i, o in enumerate(objs) if o.get('method') == 'initialize' and 'id' in o]
    if not idx:
        return False, 'no initialize'
    details = []
    ok = True
    for n, i in enumerate(idx):
        nxt = idx[n + 1] if n + 1 < len(idx) else len(objs)
        followed = any(jeq(o, {'method': 'initialized'}) for o in objs[i + 1:nxt])
        details.append({'id': objs[i].get('id'), 'handshake': handshake_ok(objs[i]), 'initialized_after': followed})
        ok = ok and handshake_ok(objs[i]) and followed
    return ok, details


def request_item_ok(item, obj):
    if not jeq(obj.get('method'), item['method']):
        return False
    if item.get('handshake'):
        return handshake_ok(obj)
    if 'params' in item:
        return 'params' in obj and jeq(obj['params'], item['params'])
    if 'params_subset' in item:
        prm = obj.get('params')
        return isinstance(prm, dict) and all(k in prm and jeq(prm[k], v) for k, v in item['params_subset'].items())
    if item.get('params_absent'):
        return 'params' not in obj
    return True


def requests_exact(cl, want):
    reqs = requests_of(cl)
    ids = [str(r.get('id')) for r in reqs]
    ok = len(reqs) == len(want) and all(request_item_ok(i, r) for i, r in zip(want, reqs)) and len(set(ids)) == len(ids)
    return ok, [{'method': r.get('method'), 'params': r.get('params', '$absent')} for r in reqs]


def notifications_exact(cl, want):
    got = {}
    for n in notifications_of(cl):
        got[n.get('method')] = got.get(n.get('method'), 0) + 1
    return got == {x['method']: x['count'] for x in want}, got


def absent_ok(cl, items):
    """E2B-13: only client->server requests (id + method); notifications only for items with kind=notification."""
    hits = []
    for item in items:
        pool = notifications_of(cl) if item.get('kind') == 'notification' else requests_of(cl)
        for o in pool:
            m = o.get('method')
            if item['method'] == '*':
                if m not in item.get('except', []):
                    hits.append({'item': item, 'method': m})
            elif m == item['method']:
                if 'params_subset' in item:
                    prm = o.get('params')
                    if isinstance(prm, dict) and all(k in prm and jeq(prm[k], v) for k, v in item['params_subset'].items()):
                        hits.append({'item': item, 'params': prm})
                else:
                    hits.append({'item': item, 'method': m})
    return not hits, hits


# ------------------------------------------------------------------------------------------------ api, probes, workers

def step_result(seq, n):
    evs = seq.steps_by_label.get(n, [])
    return evs[0] if len(evs) == 1 else None


def error_detail_of(d, n):
    for x in detail_of(d, 'ERROR_DETAIL'):
        if str(x.get('label', '')).split(':', 1)[0] == str(n):
            return x
    return None


def error_matches(want, det):
    if det is None:
        return False
    ok = jeq(det.get('class'), want['class'])
    if 'str' in want:
        ok = ok and jeq(det.get('str'), want['str'])
    if 'str_prefix' in want:
        ok = ok and isinstance(det.get('str'), str) and det['str'].startswith(want['str_prefix'])
    for k in ('code', 'message_attr', 'data', 'error_count'):
        if k in want:
            ok = ok and jeq(det.get(k), want[k])
    if 'cause' in want:
        cz = det.get('cause') or {}
        ok = ok and jeq(cz.get('class'), want['cause']['class']) and ('str' not in want['cause'] or jeq(cz.get('str'), want['cause']['str']))
    if 'mro_contains' in want:
        mro = want['mro_contains'] if isinstance(want['mro_contains'], list) else [want['mro_contains']]  # frozen as str or list
        ok = ok and all(x in (det.get('mro') or []) for x in mro)
    if 'first_error' in want:
        errs = det.get('errors') or []
        ok = ok and bool(errs) and jeq(errs[0].get('type'), want['first_error'].get('type')) and jeq(errs[0].get('loc'), want['first_error'].get('loc'))
    if 'errors_contain' in want:
        errs = det.get('errors') or []
        for wantx in want['errors_contain']:
            ok = ok and any(jeq(e.get('type'), wantx.get('type')) and (('loc' in wantx and jeq(e.get('loc'), wantx['loc']))
                                                                     or ('loc_suffix' in wantx and (e.get('loc') or [])[-len(wantx['loc_suffix']):] == wantx['loc_suffix']))
                            for e in errs)
    return ok


def api_steps(d, seq, items):
    out, ok = [], True
    for item in items:
        n = item['step']
        ev = step_result(seq, n)
        good = False
        got = None
        if ev is not None:
            got = {'kind': ev['kind'], 'data': ev['data']}
            if 'result' in item:
                good = ev['kind'] == 'API_RESULT' and not (ev['data'].get('observations') or {}).get('end') \
                    and result_matches(item['result'], ev['data']['result'])
            elif 'error' in item:
                det = error_detail_of(d, n)
                got['detail'] = det
                good = ev['kind'] == 'API_ERROR' and error_matches(item['error'], det)
            elif 'cancelled' in item:
                good = ev['kind'] == 'API_CANCELLED' and jeq(ev['data']['name'], item['cancelled'])
            elif 'end' in item:
                good = ev['kind'] == 'API_RESULT' and jeq((ev['data'].get('observations') or {}).get('end'), item['end'])
        ok = ok and good
        out.append({'step': n, 'ok': good, 'got': got})
    return ok, out


def probes_of(d):
    out = {}
    for e in d.kinds('PROBE'):
        out.setdefault(e['data']['id'], []).append(e['data']['value'])
    return out


def probe_values(d, want):
    got = probes_of(d)
    ok = all(k in got and len(got[k]) == 1 and jeq(got[k][0], v) for k, v in want.items())
    return ok, {k: got.get(k) for k in want}


def workers_of(d):
    res = {}
    for e in d.kinds('WORKER_RESULT'):
        res[e['data']['name']] = e['data']
    parked = {}
    for e in d.kinds('WORKER_PARKED'):
        parked.setdefault(e['data']['name'], []).append(e['data'])
    return res, parked


def consumer_results(d, want):
    res, parked = workers_of(d)
    out, ok = {}, True
    calls_done = [i for i, e in enumerate(d.events) if e['kind'] == 'DIAGNOSTIC' and e['data']['milestone'] == 'CALLS_DONE']
    for name, w in want.items():
        r = res.get(name)
        if w.get('parked_at_calls_done'):
            last = [p for p in parked.get(name, []) if (p.get('witness') or {}).get('at_calls_done')]
            good = r is None and bool(last) and last[-1]['parked'] is True and bool(calls_done)
        elif 'result' in w:
            good = r is not None and r['kind'] == 'result' and result_matches(w['result'], (r['value'] or {}).get('summary'))
        elif 'error' in w:
            good = r is not None and r['kind'] == 'error' and error_matches(w['error'], r['value'])
        elif 'end' in w:
            good = r is not None and r['kind'] == 'end' and jeq(r['value'], w['end'])
        else:
            good = False
        ok = ok and good
        out[name] = {'ok': good, 'got': r}
    return ok, out


def identity_groups(d, groups):
    res, _ = workers_of(d)

    def ident(name):
        r = res.get(name)
        if r is None:
            return None
        v = r['value']
        return v.get('identity') if isinstance(v, dict) else None
    out, ok = [], True
    for g in groups:
        ids = [ident(n) for n in g['same_object']]
        good = all(i is not None for i in ids) and len(set(ids)) == 1
        ok = ok and good
        out.append({'group': g['same_object'], 'identities': ids, 'ok': good})
    return ok, out


# ------------------------------------------------------------------------------------------------ 2B-2 predicates (D2B-05..08)

def steps_of_case(c):
    return {s['step']: s for s in c['case_input'].get('sdk_calls', []) + c['case_input'].get('diag_calls', [])}


def shim_records(d):
    """SHIM_RECORD frames with the step whose STEP_BEGIN precedes them in the driver frame order."""
    out, cur, idx = [], None, 0
    for e in d.events:
        if e['kind'] == 'DIAGNOSTIC' and e['data']['milestone'] == 'STEP_BEGIN':
            cur = e['data']['detail']['step']
        elif e['kind'] == 'SHIM_RECORD':
            out.append(dict(e['data'], step=cur, frame=idx))
        idx += 1
    return out


def clock_recorder(c, d, target_retry='openai_codex.retry', target_goal='openai_codex._goal'):
    """clock.recorder_exact: uniform (a, b, returned), sleep seconds, monotonic values and counts, per step, by jeq."""
    want = c['expected'].get('clock') or {}
    recs = shim_records(d)
    steps = steps_of_case(c)
    got, ok = {}, bool(want)
    retry = [r for r in recs if r['target'] == target_retry]
    if any(k in want for k in ('uniform', 'sleep', 'per_step', 'first_sleep_exceeds_max_delay')):
        uni = [{'call': 'uniform', 'a': r['args'][0], 'b': r['args'][1], 'returned': r['returned']} for r in retry if r['call'] == 'uniform']
        slp = [r['args'][0] for r in retry if r['call'] == 'sleep']
        got.update({'uniform': uni, 'sleep': slp})
        if 'uniform' in want:
            ok = ok and jeq(uni, want['uniform'])
        if 'sleep' in want:
            ok = ok and jeq(slp, want['sleep'])
        if 'per_step' in want:
            per = {k: {'uniform': sum(1 for r in retry if r['call'] == 'uniform' and r['step'] == int(k)),
                       'sleep': sum(1 for r in retry if r['call'] == 'sleep' and r['step'] == int(k))} for k in want['per_step']}
            got['per_step'] = per
            ok = ok and jeq(per, want['per_step'])
        if 'first_sleep_exceeds_max_delay' in want:
            first = [r for r in retry if r['call'] == 'sleep'][:1]
            flag = False
            if first and first[0]['step'] in steps:
                mx = (steps[first[0]['step']].get('kwargs') or {}).get('max_delay_s', 2.0)  # retry_on_overload default
                flag = first[0]['args'][0] > mx
            got['first_sleep_exceeds_max_delay'] = flag
            ok = ok and jeq(flag, want['first_sleep_exceeds_max_delay'])
    if 'monotonic_calls' in want or 'monotonic_returned' in want:
        mono = [r['returned'] for r in recs if r['target'] == target_goal and r['call'] == 'monotonic']
        got.update({'monotonic_calls': len(mono), 'monotonic_returned': mono})
        if 'monotonic_calls' in want:
            ok = ok and jeq(len(mono), want['monotonic_calls'])
        if 'monotonic_returned' in want:
            ok = ok and jeq(mono, want['monotonic_returned'])
    return ok, got


def shim_scope(c, d):
    """shim.scope_exact: only the declared targets, installed and restored by identity (stdlib intact), every record inside
    its install/restore window, no violation, nothing installed at CALLS_DONE."""
    declared = [s['target'] for s in c['case_input'].get('sdk_calls', []) + c['case_input'].get('diag_calls', []) if s['api'] == 'shim.install']
    frames = [(i, e) for i, e in enumerate(d.events)]
    scopes = [(i, e['data']) for i, e in frames if e['kind'] == 'SHIM_SCOPE']
    windows, ok = {}, bool(declared)
    for t in declared:
        ins = [i for i, x in scopes if x['target'] == t and x['state'] == 'installed' and x['identity_ok'] is True]
        res = [i for i, x in scopes if x['target'] == t and x['state'] == 'restored' and x['identity_ok'] is True]
        good = len(ins) == 1 and len(res) == 1 and ins[0] < res[0]
        ok = ok and good
        windows[t] = [ins[:1], res[:1]]
    stray = [x for _, x in scopes if x['target'] not in declared]
    recs = [(i, e['data']) for i, e in frames if e['kind'] == 'SHIM_RECORD']
    outside = [x for i, x in recs if x['target'] not in windows or not windows[x['target']][0] or not windows[x['target']][1]
               or not (windows[x['target']][0][0] < i < windows[x['target']][1][0])]
    stdlib = detail_of(d, 'SHIM_STDLIB')
    viol = detail_of(d, 'SHIM_VIOLATION')
    at_done = detail_of(d, 'SCOPES_AT_CALLS_DONE')
    ok = (ok and not stray and not outside and not viol and len(stdlib) == len(declared) and all(x.get('stdlib_intact') is True for x in stdlib)
          and bool(at_done) and at_done[0].get('shims_active') == [])
    return ok, {'declared': declared, 'windows': windows, 'stray_scopes': stray, 'records_outside': outside[:4], 'violations': viol,
                'stdlib': stdlib, 'at_calls_done': at_done[:1]}


def fault_fired(c, d):
    """fault.fired_as_declared: each declared fault fired at its cut and count; no undeclared firing; clean removal."""
    steps = c['case_input'].get('sdk_calls', []) + c['case_input'].get('diag_calls', [])
    declared = {}
    for s in steps:
        if s['api'] == 'fault.install':
            declared['%s.%s' % (s['on'], s['attr'])] = 'attr'
        elif s['api'] == 'GoalStream.new' and s.get('fault'):
            declared['%s.next_notification' % s['as']] = 'stream'
    removes = ['%s.%s' % (s['on'], s['attr']) for s in steps if s['api'] == 'fault.remove']
    frames = [e['data'] for e in d.kinds('FAULT')]
    want = (c['expected'].get('fault') or {}).get('fired', [])
    scope = detail_of(d, 'FAULT_SCOPE')
    registry = detail_of(d, 'THREAD_REGISTRY')
    started = set((registry[0] or {}).get('started') or []) if len(registry) == 1 and registry[0].get('installed') is True else None
    out, ok, expected_frames = [], bool(want), 0
    for w_ in want:
        if 'stream' in w_:
            targets = ['%s.%s' % (w_['stream'], w_['attr'])]
        else:
            targets = [t for t, k in declared.items() if k == 'attr' and t.rsplit('.', 1)[1] == w_['attr']]
        fr = [f for f in frames if f['target'] in targets]
        zero_rule = None
        if 'zero_calls_client_effect_unless_started' in w_ and not fr and len(targets) == 1:
            # E3-07: zero calls of the target with the named thread never started (driver thread registry) is a client effect.
            name = w_['zero_calls_client_effect_unless_started']
            rem = [x for x in scope if x.get('target') == targets[0] and x.get('state') == 'removed']
            zero_rule = {'thread_name': name, 'registry_installed': started is not None, 'thread_started': None if started is None else name in started,
                         'scope_removed_calls': [x.get('calls') for x in rem]}
            good = started is not None and name not in started and len(rem) == 1 and rem[0].get('calls') == 0 and rem[0].get('count') == 0
        else:
            good = len(targets) == 1 and targets[0] in declared and len(fr) == w_['count'] and [f['count'] for f in fr] == list(range(1, w_['count'] + 1))
            if 'call' in w_:
                good = good and all(f['call'] == str(w_['call']) for f in fr)
            expected_frames += w_['count']
        ok = ok and good
        out.append({'want': w_, 'targets': targets, 'frames': fr, 'zero_calls_client_effect': zero_rule, 'ok': good})
    undeclared = [f for f in frames if f['target'] not in declared]
    removed = [x for x in scope if x.get('state') == 'removed']
    at_done = detail_of(d, 'SCOPES_AT_CALLS_DONE')
    ok = (ok and not undeclared and len(frames) == expected_frames and all(x.get('ok') is True for x in scope)
          and sorted(x['target'] for x in removed) == sorted(removes) and bool(at_done) and at_done[0].get('faults_active') == [])
    return ok, {'fired': out, 'undeclared': undeclared, 'scope': scope, 'at_calls_done': at_done[:1], 'thread_registry': registry[:1]}


def wait_client_effect_recorded(c, d):
    """E3-07 wait.client_effect_recorded (sanity): one WAIT_RESULT per wait step of a client-effect class, with the declared class;
    an UNLESS_ALIVE timeout with the named thread alive is a harness precondition (failure); a timeout of a CLIENT_EFFECT or of an
    UNLESS_ALIVE with the thread never started or ended is a client effect (recorded, never decides alone)."""
    steps = c['case_input'].get('sdk_calls', []) + c['case_input'].get('diag_calls', [])
    waits = [s for s in steps if s.get('api') in WAIT_APIS and s.get('wait_class') in WAIT_CLASSES]
    recs = detail_of(d, 'WAIT_RESULT')
    out, ok = [], bool(waits)
    for s in waits:
        r = [x for x in recs if x.get('step') == s['step']]
        good = len(r) == 1 and r[0].get('class') == s['wait_class'] and isinstance(r[0].get('ok'), bool)
        if good and s['wait_class'] == 'CLIENT_EFFECT_UNLESS_ALIVE':
            good = r[0].get('thread_name') == s.get('thread_name') and isinstance(r[0].get('thread_started'), bool) and isinstance(r[0].get('thread_alive'), bool)
            if r[0]['ok'] is False:
                good = good and r[0]['thread_alive'] is False
        elif good:  # R2-F03 (4): CLIENT_EFFECT without thread_name has thread_started and thread_alive null
            good = s.get('thread_name') is not None or (r[0].get('thread_started') is None and r[0].get('thread_alive') is None)
        ok = ok and good
        out.append({'step': s['step'], 'api': s['api'], 'class': s['wait_class'], 'records': r, 'ok': good,
                    'client_effect_timeout': bool(r) and r[0].get('ok') is False})
    return ok, out


def payloads_exact(cl, wexp):
    """wire.payloads_exact (2A table): params of each request with declared params equal by jeq (in request order) and no key of
    expected.wire.must_not_contain_keys at any depth of the params of the non-handshake requests."""
    reqs = requests_of(cl)
    want = wexp.get('requests', [])
    forbidden = set(wexp.get('must_not_contain_keys', []))

    def keys_in(x):
        if isinstance(x, dict):
            return set(x) | set().union(*[keys_in(v) for v in x.values()]) if x else set()
        if isinstance(x, list):
            return set().union(*[keys_in(v) for v in x]) if x else set()
        return set()
    got, ok = [], len(reqs) == len(want)
    for r, w in zip(reqs, want):
        params = r.get('params')
        good = r.get('method') == w.get('method')
        if 'params' in w:
            good = good and jeq(params, w['params'])
        bad = sorted(keys_in(params) & forbidden) if not w.get('handshake') else []
        good = good and not bad
        ok = ok and good
        got.append({'method': r.get('method'), 'params': params, 'forbidden_keys': bad, 'ok': good})
    return ok, {'requests': got, 'must_not_contain_keys': sorted(forbidden)}


def model_oracle(c, d, seq):
    """model.oracle_exact: the expected.api items of the model.* steps (dump by jeq, error by class and errors_contain)."""
    steps = steps_of_case(c)
    items = [x for x in c['expected'].get('api', []) if steps.get(x['step'], {}).get('api') in MODEL_APIS]
    if not items:
        return False, 'no model.* expectation'
    return api_steps(d, seq, items)


def model_errors_recorded(d):
    """Informational: every ValidationError detail carries the full errors() list (type, loc, msg)."""
    dets = [x for x in detail_of(d, 'ERROR_DETAIL') if str(x.get('class', '')).endswith('ValidationError')]
    ok = all(isinstance(x.get('errors'), list) and (x.get('errors_truncated') or len(x['errors']) == x.get('error_count')) for x in dets)
    return ok, [{'label': x.get('label'), 'error_count': x.get('error_count'), 'errors': x.get('errors')} for x in dets]


def login_lines(c, logs):
    """Login frames of the peer stdout: account/login/completed notifications and scripted replies to account/login/* requests."""
    a = logs['adapter']
    ps = c['case_input'].get('peer_script') or {}
    ue = ps.get('unscripted_error') or {}
    cl, _ = wire_lines(a.committed_bytes('stdin'))
    sl, _ = wire_lines(a.committed_bytes('stdout'))
    methods = {str(x['obj'].get('id')): x['obj'].get('method') for x in cl if x['obj'] and 'id' in x['obj'] and 'method' in x['obj']}
    out = []
    for x in sl:
        o = x['obj']
        if not isinstance(o, dict):
            continue
        if o.get('method') == 'account/login/completed' and 'id' not in o:
            lid = (o.get('params') or {}).get('loginId') if isinstance(o.get('params'), dict) else None
            out.append(('account/login/completed', 'notification', lid, x['raw'] + b'\n', o))
        elif 'id' in o and 'method' not in o and str(methods.get(str(o['id']), '')).startswith('account/login/'):
            err = o.get('error') if isinstance(o.get('error'), dict) else None
            if err is not None and err.get('code') == ue.get('code') and err.get('message') == ue.get('message'):
                continue  # the unscripted error reply is not a login frame
            lid = (o.get('result') or {}).get('loginId') if isinstance(o.get('result'), dict) else None
            out.append((methods[str(o['id'])], 'reply', lid, x['raw'] + b'\n', o))
    return out


def login_frames_synthetic(c, logs):
    """peer.login_frames_synthetic: the CAP-2B-PEER-LOGIN admission rule over the frozen script and over every login frame on the
    wire, and one LOGIN_FRAME milestone per login frame, in order, with its bytes and login id digest."""
    rpc = _peer_v2()
    ps = c['case_input'].get('peer_script') or {}
    problems = list(rpc.login_problems(ps))
    lines = login_lines(c, logs)
    for _m, _f, _lid, _raw, obj in lines:
        problems += rpc.login_problems(obj)
    frames = detail_of(logs['peer'], 'LOGIN_FRAME')
    pairs = []
    good = len(frames) == len(lines)
    for f, (m, fr, lid, raw, _o) in zip(frames, lines):
        want_lid = sha(lid.encode('utf-8')) if isinstance(lid, str) else None
        g = f.get('method') == m and f.get('frame') == fr and f.get('sha256') == sha(raw) and f.get('bytes') == len(raw) and f.get('login_id_sha256') == want_lid
        good = good and g
        pairs.append({'method': m, 'frame': fr, 'ok': g})
    return (not problems and good and bool(lines)), {'problems': problems, 'login_frames_on_wire': len(lines), 'login_frame_milestones': len(frames),
                                                     'pairs': pairs}


def emitted_lines(c, logs):
    """wire.emitted_lines_exact: the bytes of the client line (committed stdin) with the learned id in place of $ID."""
    cl, _ = client_lines(logs)
    reqs = [x for x in cl if x['obj'] and 'id' in x['obj'] and 'method' in x['obj']]
    out, ok = [], True
    want = (c['expected'].get('wire') or {}).get('emitted_lines', [])
    for item in want:
        if 'request' in item:
            n = item['request']
            x = reqs[n - 1] if 0 < n <= len(reqs) else None
            got = None
            if x is not None:
                idtxt = json.dumps(x['obj']['id']).encode('utf-8')
                got = (x['raw'] + b'\n').replace(b'"id": ' + idtxt, b'"id": "$ID"', 1)
            good = got is not None and got == item['bytes_with_id_placeholder'].encode('utf-8')
        else:
            hits = [x for x in cl if x['obj'] and x['obj'].get('method') == item['notification'] and 'id' not in x['obj']]
            got = (hits[0]['raw'] + b'\n') if hits else None
            good = got is not None and got == item['bytes'].encode('utf-8')
        ok = ok and good
        out.append({'item': item.get('request', item.get('notification')), 'ok': good, 'got': None if got is None else got.decode('utf-8', 'replace')})
    return ok and bool(want), out


# ------------------------------------------------------------------------------------------------ process predicates

def calls_done_g(seq, logs):
    d = logs['driver']
    for i, e in enumerate(d.events):
        if e['kind'] == 'DIAGNOSTIC' and e['data']['milestone'] == 'CALLS_DONE':
            return seq.gidx('driver', i), e['data']['detail']
    return None, {}


def adapter_signal_g(seq, logs):
    a = logs['adapter']
    for i, e in enumerate(a.events):
        if e['kind'] == 'SIGNAL':
            return seq.gidx('adapter', i), e['data']['signal']
    return None, None


def termination_form(logs, w):
    """E2B-03 classifier: (form or None, evidence). Only OS and channel witnesses; never the Popen returncode."""
    a, p = logs['adapter'], logs['peer']
    t = (w.get('termination') or {}).get('adapter') or {}
    ae = a.kinds('END')
    ev = {'adapter_signal': a.signal, 'adapter_end': ae[0]['data'] if ae else None, 'adapter_fault': a.fault,
          'peer_status': p.status(), 'peer_signal': p.signal, 'tracker': t}
    # C31-ADM/R1-F01: a zombie with wait status 15, or the PID absent with no zombie observed (absence after another status is refused).
    sigterm = (a.signal == 'SIGTERM' and bool(ae) and ae[0]['data']['complete'] is False and a.fault is None
               and (t.get('zombie_exit_code') == 15 or (t.get('zombie_exit_code') is None and t.get('absent') is True))
               and (p.signal == 'SIGTERM' or p.status() == 'END'))
    killed = (a.fault == 'sigterm_ignored' and not ae and a.signal is None and a.terminal is None
              and t.get('zombie_exit_code') == 9)
    if sigterm and not killed:
        return 'CLIENT_TERMINATED_SIGTERM', ev
    if killed and not sigterm:
        return 'CLIENT_KILLED_SIGKILL', ev
    return None, ev


def spawn_count(w, want):
    pids = (w.get('scan') or {}).get('adapter_pids') or []
    zeros = w.get('zero_checks') or []
    ok = len(pids) == want.get('spawns')
    if want.get('zero_at'):
        gates = [b for b in (w.get('barrier_log') or [])]
        ok = ok and bool(zeros) and all(z['ok'] for z in zeros) and len(gates) >= 1
    return ok, {'adapter_pids': pids, 'zero_checks': zeros}


def proc_read(w):
    reads = [r for r in (w.get('proc_witnesses') or []) if r.get('read')]
    return reads[0] if reads else None


# ------------------------------------------------------------------------------------------------ case evaluation

def sdk_case(P, c, logs, w, form, seq):
    d, a, p = logs['driver'], logs['adapter'], logs['peer']
    exp = c['expected']
    wexp = exp.get('wire', {})
    hooks_decl = hooks_declared(c)
    cl, ctail = client_lines(logs)
    P.add('wire.client_lines_complete_json', not ctail and bool(cl) and all(x['obj'] is not None for x in cl), {'lines': len(cl), 'tail': len(ctail)})
    hs_ok, hs = initialize_handshake(cl)
    P.add('wire.initialize_handshake', hs_ok, hs)
    if P.need('wire.requests_exact'):
        P.add('wire.requests_exact', *requests_exact(cl, wexp.get('requests', [])))
    if P.need('wire.notifications_exact'):
        P.add('wire.notifications_exact', *notifications_exact(cl, wexp.get('notifications', [])))
    if P.need('wire.absent'):
        P.add('wire.absent', *absent_ok(cl, wexp.get('absent', [])))
    chains = list(exp.get('order', [])) + list(wexp.get('order', []))
    if P.need('wire.order_constraints'):
        res = [seq.chain_ok(ch, hooks_decl) for ch in chains]
        P.add('wire.order_constraints', bool(chains) and all(r[0] for r in res), [r[1] for r in res])
    if P.need('wire.eof_bounded_interval'):
        P.add('wire.eof_bounded_interval', eof_barrier_ok(logs, w.get('control_actions', [])))
    if P.need('api.steps_exact'):
        P.add('api.steps_exact', *api_steps(d, seq, exp.get('api', [])))
    if P.need('probe.values_exact'):
        P.add('probe.values_exact', *probe_values(d, exp.get('probes', {})))
    if P.need('consumer.results_exact'):
        P.add('consumer.results_exact', *consumer_results(d, exp.get('workers', {})))
    if P.need('identity.groups_exact'):
        P.add('identity.groups_exact', *identity_groups(d, exp.get('identity', [])))
    if P.need('hook.events_exact'):
        entries = exp.get('hooks', [])
        hres = [{'entry': e, 'matched': [x['gidx'] for x in hook_entry_matches(seq, e, hooks_decl)]} for e in entries]
        hchains = [ch for ch in exp.get('order', []) if any(t.startswith('HOOK:') for t in ch)]
        cres = [seq.chain_ok(ch, hooks_decl) for ch in hchains]
        P.add('hook.events_exact', all(h['matched'] for h in hres) and all(r[0] for r in cres) and bool(entries or hchains),
              {'entries': hres, 'chains': [r[1] for r in cres], 'events': len(seq.hook_events)})
    if P.need('hook.code_identity'):
        P.add('hook.code_identity', *hook_identity(c, d))
    if P.need('excepthook.records_exact'):
        P.add('excepthook.records_exact', *excepthook_records(c, d, seq))
    if P.need('barrier.witnesses_in_order'):
        P.add('barrier.witnesses_in_order', *barrier_order(c, logs, w, seq))
    if P.need('peer.before_reply_order_witnessed'):
        P.add('peer.before_reply_order_witnessed', *before_reply_order(c, logs, seq))
    if P.need('clock.recorder_exact'):
        P.add('clock.recorder_exact', *clock_recorder(c, d))
    if P.need('shim.scope_exact'):
        P.add('shim.scope_exact', *shim_scope(c, d))
    if P.need('fault.fired_as_declared'):
        P.add('fault.fired_as_declared', *fault_fired(c, d))
    if P.need('wait.client_effect_recorded'):
        P.add('wait.client_effect_recorded', *wait_client_effect_recorded(c, d))
    if P.need('wire.payloads_exact'):
        P.add('wire.payloads_exact', *payloads_exact(cl, wexp))
    if P.need('model.oracle_exact'):
        P.add('model.oracle_exact', *model_oracle(c, d, seq))
    if P.need('model.errors_recorded'):
        P.add('model.errors_recorded', *model_errors_recorded(d))
    if P.need('peer.login_frames_synthetic'):
        P.add('peer.login_frames_synthetic', *login_frames_synthetic(c, logs))
    if P.need('wire.emitted_lines_exact'):
        P.add('wire.emitted_lines_exact', *emitted_lines(c, logs))
    if P.need('peer.no_unscripted_request'):
        P.add('peer.no_unscripted_request', not ms(p, 'UNSCRIPTED'), detail_of(p, 'UNSCRIPTED'))
    if P.need('peer.exit_after_script_witnessed'):
        ex = ms(p, 'EXIT_AFTER_SCRIPT')
        ae = a.kinds('END')
        P.add('peer.exit_after_script_witnessed', bool(ex) and ex[0]['detail'].get('stdout_closed') is True and bool(ae)
              and ae[0]['data']['complete'] is True and jeq(ae[0]['data']['child_exit_code'], 0),
              {'exit_after_script': ex[0]['detail'] if ex else None, 'adapter_end': ae[0]['data'] if ae else None})
    if P.need('env.adapter_sandbox_env_only'):
        P.add('env.adapter_sandbox_env_only', jeq(w.get('adapter_environ'), FIXED_ENV), w.get('adapter_environ'))
    proc = exp.get('process', {})
    if P.need('proc.spawn_count_exact'):
        P.add('proc.spawn_count_exact', *spawn_count(w, proc))
    if P.need('proc.witness_recorded'):
        P.add('proc.witness_recorded', *witness_recorded(c, logs, w))
    if P.need('proc.termination_exact'):
        P.add('proc.termination_exact', *termination_exact(c, logs, w, seq))
    pr = proc_read(w)
    begin = a.begin or {}
    if P.need('proc.argv_exact'):
        want = proc.get('argv', {})
        retained = [e['data'] for e in d.kinds('PROC_RETAIN')]
        ok = (bool(retained) and jeq(retained[0]['args'], want.get('popen_args')) and pr is not None and pr.get('ok') is True
              and jeq(pr.get('cmdline'), want.get('proc_cmdline')) and jeq(begin.get('argv_tail'), want.get('self_report_argv_tail')))
        P.add('proc.argv_exact', ok, {'popen_args': retained[0]['args'] if retained else None, 'proc_cmdline': (pr or {}).get('cmdline'),
                                      'self_report_argv_tail': begin.get('argv_tail')})
    if P.need('proc.env_exact'):
        ok = pr is not None and pr.get('ok') is True and jeq(pr.get('environ'), proc.get('env')) and jeq(begin.get('env'), proc.get('env'))
        P.add('proc.env_exact', ok, {'proc_environ': (pr or {}).get('environ'), 'self_report': begin.get('env')})
    if P.need('proc.cwd_exact'):
        ok = pr is not None and pr.get('ok') is True and jeq(pr.get('cwd'), proc.get('cwd')) and jeq(begin.get('cwd'), proc.get('cwd'))
        P.add('proc.cwd_exact', ok, {'proc_cwd': (pr or {}).get('cwd'), 'self_report': begin.get('cwd')})
    if P.need('proc.no_extra_subprocess'):
        extra = (w.get('scan') or {}).get('extra') or []
        P.add('proc.no_extra_subprocess', len(extra) == proc.get('extra_processes', 0) and (w.get('scan') or {}).get('samples', 0) > 0,
              {'extra': extra, 'samples': (w.get('scan') or {}).get('samples')})
    if P.need('proc.adapter_fault_fired'):
        declared = (c['case_input'].get('adapter') or {}).get('fault')
        P.add('proc.adapter_fault_fired', declared == 'ignore_sigterm' and a.fault == 'sigterm_ignored' and len(a.kinds('FAULT')) == 1,
              {'declared': declared, 'faults': [e['data'] for e in a.kinds('FAULT')]})
    if P.need('timing.recorded'):
        P.add('timing.recorded', bool(ms(d, 'CLOCK_MARK')), detail_of(d, 'CLOCK_MARK'))


def hook_identity(c, d):
    decl = {}
    for s in c['case_input'].get('sdk_calls', []):
        if s['api'] == 'hook.install':
            for h in s['hooks']:
                decl[h['id']] = h['code']
    inst = {}
    for m in detail_of(d, 'HOOKS_INSTALLED'):
        inst.update(m['identities'])
    out, ok = {}, bool(decl)
    for hid, code in decl.items():
        idt = inst.get(hid)
        parts = code.split('.')
        good = idt is not None
        fid = None
        if good:
            f = idt['file']
            qual = idt['qualname']
            fid = file_identity(f)  # R1-F08: the file is the one bound by the identity freeze, checked before its line is read
            good = fid['ok'] and '.'.join(parts[-len(qual.split('.')):]) == qual and isinstance(idt['first_line'], int) \
                and source_line_ok(f, idt['first_line'], qual.split('.')[-1])
        ok = ok and good
        out[hid] = {'declared': code, 'installed': idt, 'file_identity': fid, 'ok': good}
    return ok, out


def file_identity(path):
    """sha of the host file of a hook: sdk-python files against identity-freeze-r4-2b2.json, stdlib files against the anchors of
    the cases inputs. Anything else (or a missing freeze) is refused."""
    if path.startswith('/profile/sdk-python/openai_codex/'):
        rel = path[len('/profile/sdk-python/'):]
        try:
            want = json.loads(IDENTITY_FREEZE.read_text())['trees']['sdk-python'][rel]['sha256']
            got = sha((RUNTIME_SDK / rel).read_bytes())
        except (OSError, KeyError, ValueError) as exc:
            return {'ok': False, 'why': str(exc)[:120]}
        return {'ok': got == want, 'sha256': got, 'bound': 'identity-freeze-r4-2b2.json#/trees/sdk-python'}
    anchors = {inp['path_host']: inp['sha256'] for name, inp in _DOC['inputs'].items() if name.startswith('stdlib/')}
    if path in anchors:
        try:
            got = sha(Path(path).read_bytes())
        except OSError as exc:
            return {'ok': False, 'why': str(exc)[:120]}
        return {'ok': got == anchors[path], 'sha256': got, 'bound': 'cases-2b-2.json#/inputs (stdlib anchor)'}
    return {'ok': False, 'why': 'file outside the sealed sdk-python tree and the stdlib anchors'}


def source_line_ok(path, line, name):
    """The first line of the code object is its def (or a decorator right above it) in the bound source file."""
    if path.startswith('/profile/sdk-python/'):
        host = RUNTIME_SDK / path[len('/profile/sdk-python/'):]
    else:
        host = Path(path)
    try:
        lines = host.read_text().split('\n')
    except OSError:
        return False
    window = lines[line - 1:line + 3]
    return bool(window) and (('def %s(' % name) in window[0] or (window[0].lstrip().startswith('@') and any(('def %s(' % name) in x for x in window)))


def excepthook_records(c, d, seq):
    """R2-F03: an empty expectation is judged at the snapshot; a non-empty one needs a preceding excepthook.wait or thread.join."""
    steps = c['case_input'].get('sdk_calls', [])
    snap = [s['step'] for s in steps if s['api'] == 'excepthook.snapshot']
    want = c['expected'].get('excepthook')
    if want is None:
        want = [x['result'] for x in c['expected'].get('api', []) if snap and x['step'] == snap[-1] and 'result' in x]
        want = want[0] if want else None
    if not snap or want is None:
        return False, 'no snapshot step or expectation'
    ev = step_result(seq, snap[-1])
    got = ev['data']['result'] if ev is not None and ev['kind'] == 'API_RESULT' else None
    records = [e['data'] for e in d.kinds('EXCEPTHOOK_RECORD')]
    if want:
        prior = [s for s in steps if s['step'] < snap[-1] and s['api'] in ('excepthook.wait', 'thread.join')]
        if not prior:
            return False, 'non-empty expectation without excepthook.wait or thread.join before the snapshot (R2-F03)'
    return jeq(got, want), {'snapshot': got, 'records_seen': records}


def cond_witness(cond, logs, w, seq, hooks_decl):
    """R1-F05: gidx of the witness of one barrier-plan condition (None when absent), independent of the supervisor executor."""
    kind = cond[0]
    a, p, d = logs['adapter'], logs['peer'], logs['driver']
    acts = w.get('actions') or []
    if kind == 'held':
        cl, _ = wire_lines(a.committed_bytes('stdin'))
        for i, e in enumerate(p.events):
            if e['kind'] != 'REQUEST_HELD':
                continue
            hit = [x for x in cl if len(x['raw']) + 1 == e['data']['bytes'] and sha(x['raw'] + b'\n') == e['data']['sha256']]
            o = hit[0]['obj'] if hit else None
            prm = (o or {}).get('params')
            if o and o.get('method') == cond[1] and (not cond[2] or (isinstance(prm, dict) and all(k in prm and jeq(prm[k], v) for k, v in cond[2].items()))):
                return seq.gidx('peer', i)
        return None
    if kind == 'received':
        n = 0
        for i, e in enumerate(p.events):
            if e['kind'] == 'PEER_MILESTONE' and e['data']['milestone'] == 'RECEIVED' and e['data']['detail'].get('method') == cond[1] \
                    and e['data']['detail'].get('kind') == cond[2]:
                n += 1
                if n == cond[3]:
                    return seq.gidx('peer', i)
        return None
    if kind == 'driver_cancelled':
        return seq.tokens.get('API_CANCELLED:%d' % cond[1])
    if kind == 'hook':
        _, hid, ev, occ, subset = cond
        cands = [e for e in seq.hook_events if e['id'] == hid and e['event'] == ev and (occ is None or e['occurrence'] == occ)
                 and all(e['record'].get(k) == v for k, v in subset.items())]
        return cands[0]['gidx'] if cands else None
    names = {'zero_spawn': 'ZERO_SPAWN_CHECK', 'proc_witness': 'PROC_WITNESS'}
    if kind in names:
        hits = [x['gidx'] for x in acts if x['action'] == names[kind]]
        return hits[0] if hits else None
    if kind == 'adapter_killed':
        return None if a.fault != 'sigterm_ignored' else -1
    return None


def barrier_order(c, logs, w, seq):
    """Every barrier step: driver witness before the gate, the gate before each release, each release after its trigger and each
    condition of the gate and of every action witnessed before it (R1-F05); controls only from the plan, READY, FINISH_PEER and
    RELEASE_EXIT."""
    d = logs['driver']
    plan = w.get('plan') or {}
    acts = w.get('actions') or []
    hooks_decl = hooks_declared(c) if 'case_input' in c else {}
    out, ok = [], True
    wit = {}
    for i, e in enumerate(d.events):
        if e['kind'] == 'DIAGNOSTIC' and e['data']['milestone'] == 'STEP_WITNESS':
            wit[e['data']['detail']['step']] = seq.gidx('driver', i)
    for step_s, entry in plan.items():
        step = int(step_s)
        gate = [x['gidx'] for x in acts if x['action'] == 'BARRIER_GATE' and x['detail'].get('step') == step]
        rel = [x for x in acts if x['action'] == 'CONTROL' and x['detail'].get('step') == step and x['detail'].get('command') in ('RELEASE_REPLY', 'STEP_RELEASE')]
        planned = [a_[0] for a_ in entry['actions']]
        good = (step in wit and bool(gate) and wit[step] is not None and wit[step] < gate[0]
                and [x['detail']['command'] for x in rel] == planned and all(x['gidx'] > gate[0] for x in rel)
                and all(x['gidx'] < y['gidx'] for x, y in zip(rel, rel[1:])))
        conds = []
        for cond in entry['gate']:
            g = cond_witness(cond, logs, w, seq, hooks_decl)
            conds.append({'at': 'gate', 'cond': cond, 'witness_gidx': g})
            good = good and g is not None and bool(gate) and g < gate[0]
        for k, (action, acond) in enumerate(entry['actions']):
            for cond in acond:
                g = cond_witness(cond, logs, w, seq, hooks_decl)
                conds.append({'at': action, 'cond': cond, 'witness_gidx': g})
                good = good and g is not None and k < len(rel) and g < rel[k]['gidx']
        ok = ok and good
        out.append({'step': step, 'witness_gidx': wit.get(step), 'gate_gidx': gate[:1], 'releases': [[x['detail']['command'], x['gidx']] for x in rel],
                    'planned': planned, 'conditions': conds, 'ok': good})
    allowed = {'READY', 'FINISH_PEER', 'RELEASE_EXIT', 'RELEASE_REPLY', 'STEP_RELEASE'}
    stray = [x['detail'] for x in acts if x['action'] == 'CONTROL' and (x['detail'].get('command') not in allowed or
             (x['detail'].get('command') in ('RELEASE_REPLY', 'STEP_RELEASE') and x['detail'].get('step') is None))]
    parked = [e['data'] for e in d.kinds('WORKER_PARKED')]
    harness_parked = [x for x in parked if (x.get('witness') or {}).get('wait_class') == 'HARNESS_PRECONDITION' and not x['witness'].get('still')
                      and not x['witness'].get('at_calls_done')]
    ok = ok and not stray and all(x['parked'] for x in harness_parked)
    if not plan and not harness_parked:
        ok = ok and False
    return ok, {'barriers': out, 'stray_controls': stray, 'harness_parked': [[x['name'], x['parked']] for x in harness_parked]}


def before_reply_order(c, logs, seq=None):
    """Each rule with before_reply: BEFORE_REPLY_WRITTEN emitted (and, with the unit sequence, before the commit of the reply
    bytes: R1-F05), and the frames committed to the SDK before the reply bytes."""
    a, p = logs['adapter'], logs['peer']
    wgidx = {}
    if seq is not None:
        for i, e in enumerate(p.events):
            if e['kind'] == 'PEER_MILESTONE' and e['data']['milestone'] == 'BEFORE_REPLY_WRITTEN':
                wgidx.setdefault(e['data']['detail'].get('rule'), seq.gidx('peer', i))
    rules = c['case_input']['peer_script']['on_request']
    written = [m['detail'] for m in ms(p, 'BEFORE_REPLY_WRITTEN')]
    sl, _ = wire_lines(a.committed_bytes('stdout'))
    cl, _ = wire_lines(a.committed_bytes('stdin'))
    script = _peer_v2().ScriptV2(c['case_input']['peer_script'])
    out, ok = [], True
    for x in cl:
        msg = x['obj']
        if not (isinstance(msg, dict) and 'id' in msg and isinstance(msg.get('method'), str)):
            continue
        rule, ops = script.plan(msg)
        if rule is None or not rules[rule].get('before_reply'):
            continue
        frames = [op[3].rstrip(b'\n') for op in ops if op[0] == 'write' and op[2] == 'notification'][:len(rules[rule]['before_reply'])]
        pos = {i: k for k, i in enumerate([y['raw'] for y in sl])}
        reply_at = [k for k, y in enumerate(sl) if y['obj'] and y['obj'].get('id') == msg['id'] and 'method' not in y['obj']]
        frame_at = [pos.get(f) for f in frames]
        good = (any(w_['rule'] == rule for w_ in written) and bool(reply_at) and all(f is not None for f in frame_at)
                and all(f < reply_at[0] for f in frame_at))
        commit_g = None
        if seq is not None and reply_at and reply_at[0] < len(seq.stdout_line_commit):
            commit_g = seq.stdout_line_commit[reply_at[0]]
            good = good and wgidx.get(rule) is not None and commit_g is not None and wgidx[rule] < commit_g
        ok = ok and good
        out.append({'rule': rule, 'frames_line_index': frame_at, 'reply_line_index': reply_at[:1], 'written_gidx': wgidx.get(rule),
                    'reply_commit_gidx': commit_g, 'ok': good})
    return ok and bool(out), {'checked': out, 'before_reply_written': written}


def witness_recorded(c, logs, w):
    proc = c['expected'].get('process', {})
    pws = w.get('proc_witnesses') or []
    reads = [r for r in pws if r.get('read')]
    term = (w.get('termination') or {}).get('adapter') or {}
    needs_read = any('proc.argv_exact' == x or 'proc.env_exact' == x or 'proc.cwd_exact' == x for x in c['predicates'])
    if needs_read:
        ok = bool(reads) and all(r.get('ok') for r in reads) and not any(not r.get('read') for r in pws)
    else:
        ok = bool(term) and (term.get('absent') is True or term.get('zombie_exit_code') is not None)
    if 'termination' in proc and proc['termination'].get('by') == 'SIGKILL':
        ok = ok and term.get('zombie_exit_code') == 9
    return ok, {'proc_witnesses': pws, 'termination_tracker': term}


def termination_exact(c, logs, w, seq):
    a, d = logs['adapter'], logs['driver']
    proc = c['expected'].get('process', {})
    form, ev = termination_form(logs, w)
    sig_g, sig = adapter_signal_g(seq, logs)
    cd_g, cd = calls_done_g(seq, logs)
    detail = {'form': form, 'evidence': ev, 'adapter_signal_gidx': sig_g, 'calls_done_gidx': cd_g}
    if 'no_termination_before' in proc:
        t = (w.get('termination') or {}).get('adapter') or {}
        cd_recv = None
        for e, rn in zip(d.events, d.recv_ns):
            if e['kind'] == 'DIAGNOSTIC' and e['data']['milestone'] == 'CALLS_DONE':
                cd_recv = rn
        ok = (sig_g is None or (cd_g is not None and sig_g > cd_g)) and cd_recv is not None and \
            not (t.get('absent') and t.get('absent_t_ns', 0) < cd_recv) and \
            not (t.get('zombie_t_ns') is not None and t['zombie_t_ns'] < cd_recv)  # R1-F05: a zombie before CALLS_DONE too
        return ok, detail
    term = proc.get('termination') or {}
    ok = True
    if term.get('by') == 'SIGTERM':
        ok = form == 'CLIENT_TERMINATED_SIGTERM'
        if 'before' in term:
            other = seq.lookup(term['before'], hooks_declared(c))
            ok = ok and sig_g is not None and other is not None and sig_g < other
        if 'during_step' in term:
            n = term['during_step']
            start = seq.tokens.get('STEP:%d' % n)
            end = seq.tokens.get('API_RESULT:%d' % n) or seq.tokens.get('API_ERROR:%d' % n)
            ok = ok and sig_g is not None and start is not None and end is not None and start < sig_g < end
        if term.get('no_sigkill'):
            ok = ok and a.fault is None
        if 'sdk_returncode' in term:
            rcs = (cd or {}).get('popen_returncodes') or {}
            ok = ok and bool(rcs) and all(jeq(v, term['sdk_returncode']) for v in rcs.values())
            detail['popen_returncodes'] = rcs
    elif term.get('by') == 'SIGKILL':
        ok = form == 'CLIENT_KILLED_SIGKILL' and (not term.get('sigterm_ignored_fault') or a.fault == 'sigterm_ignored')
        if 'sdk_returncode_after_close' in term:
            pv = probes_of(d).get('returncode_right_after_close') or []
            ok = ok and len(pv) == 1 and jeq(pv[0], term['sdk_returncode_after_close'])
        if 'driver_reap_returncode' in term:
            reaps = [s['step'] for s in c['case_input']['sdk_calls'] if s['api'] == 'driver.reap']
            ev_ = step_result(seq, reaps[0]) if reaps else None
            ok = ok and ev_ is not None and ev_['kind'] == 'API_RESULT' and jeq(ev_['data']['result'], term['driver_reap_returncode'])
    timing = c['expected'].get('timing') or {}
    marks = {m['id']: m['mono_ns'] for m in detail_of(d, 'CLOCK_MARK')}
    for expr, lim in timing.items():
        later, earlier = [x.strip() for x in expr.split('-')]
        delta = (marks.get(later, 0) - marks.get(earlier, 0)) / 1e9 if later in marks and earlier in marks else None
        detail['timing_%s' % expr] = delta
        ok = ok and delta is not None and delta >= lim['min_s']  # E2B-09: only the minimum decides
    return ok, detail


def control_case(P, c, logs, w, seq):
    """2B1-CTRL01 / 2B2-CTRL01 / C31-CTRL01 (copy of 2B1-CTRL01, D3-07): own client (no SDK) gets the frames before the ctrl-2 reply (2B-2: account/login/completed of the
    synthetic login), then an unscripted turn/interrupt -> MISMATCH by wire.no_turn_interrupt only."""
    d, a, p = logs['driver'], logs['adapter'], logs['peer']
    cl, _ = wire_lines(a.committed_bytes('stdin'))
    sl, _ = wire_lines(a.committed_bytes('stdout'))
    exp = c['expected']['server_reply_to_ctrl-3']
    un = detail_of(p, 'UNSCRIPTED')
    reply = [x['obj'] for x in sl if x['obj'] and x['obj'].get('id') == 'ctrl-3']
    P.add('control.peer_answered_unscripted', len(un) == 1 and un[0].get('method') == 'turn/interrupt' and len(ms(p, 'UNSCRIPTED_ERROR_WRITTEN')) == 1
          and jeq(reply, [dict({'id': 'ctrl-3'}, **exp)]), {'unscripted': un, 'reply': reply})
    cr = [x for x in detail_of(d, 'CONTROL_REPLY') if x.get('id') == 'ctrl-3']
    P.add('control.client_not_blocked', len(cr) == 1 and cr[0].get('reply') is not None and bool(ms(d, 'CLIENT_STDIN_CLOSED')), cr)
    methods = [x['obj'].get('method') for x in cl if x['obj']]
    P.add('wire.no_turn_interrupt', 'turn/interrupt' not in methods, methods)
    ok, det = before_reply_order(c, logs, seq)
    pre = [e['data'] for e in d.kinds('PRE_REPLY_NOTIFICATION')]
    ctrl2 = [x for x in c['case_input']['control_client']['lines'] if x.get('id') == 'ctrl-2']
    script = _peer_v2().ScriptV2(c['case_input']['peer_script'])
    rule, _ops = script.plan(dict(ctrl2[0])) if ctrl2 else (None, [])
    want_methods = [f['notification']['method'] for f in (c['case_input']['peer_script']['on_request'][rule].get('before_reply', []) if rule is not None else [])
                    if 'notification' in f]
    got_methods = [x['method'] for x in pre if x['reply_id'] == 'ctrl-2']
    ok = ok and bool(want_methods) and got_methods == want_methods
    P.add('peer.before_reply_order_witnessed', ok, dict(det, pre_reply_notifications=pre, expected_pre_reply_methods=want_methods))
    if P.need('peer.login_frames_synthetic'):
        P.add('peer.login_frames_synthetic', *login_frames_synthetic(c, logs))


# ------------------------------------------------------------------------------------------------ outcome

def capture_extra(case, logs, w, seq=None, part_problems=()):
    out = ['PART reassembly: %s' % x for x in part_problems]
    if seq is not None and seq.hook_recount_bad:
        out.append('HOOK_EVENT occurrence differs from the recount per (id, event) (R1-F02): %s' % seq.hook_recount_bad[:4])
    maps = w.get('maps')
    if not maps or not maps.get('ok'):
        out.append('loaded-code witness missing or with unknown mapping: %s' % ((maps or {}).get('error') or len((maps or {}).get('unknown', []))))
    c = CASES_DEF[case]
    if 'peer_script' in c['case_input']:
        rep = peer_replay_check(c['case_input'], logs)
        if rep['status'] == 'MISMATCH':
            out.append('peer v2 stdout differs from the replay of the frozen peer_script (F4-05): %s' % rep)
    d = logs['driver']
    if c['kind'] == 'SDK':
        di = (logs['driver'].begin or {}).get('dependency_identity')
        if di != {'pydantic': '2.13.4', 'pydantic_core': '2.46.4'}:
            out.append('dependency identity %r (R2-F06)' % (di,))
        if not ms(d, 'SDK_CLIENT_CLOSED'):
            out.append('SDK_CLIENT_CLOSED missing')
    return out


def e2b12(c, logs, w, seq):
    """E2B-12: under a signal form, a line the SDK wrote (notify return hook) missing from RAW_READ before the adapter SIGNAL."""
    sig_g, _ = adapter_signal_g(seq, logs)
    if sig_g is None:
        return []
    missing = []
    for e in seq.hook_events:
        if e['event'] == 'return' and 'arg:method' in e['record'] and e['record'].get('arg:method') == 'initialized':
            tok = seq.tokens.get('RAW_READ:initialized#1')
            if tok is None or tok > sig_g:
                missing.append('initialized line written by the SDK not in RAW_READ before the adapter SIGNAL (E2B-12)')
    return missing


def capture_form(case, verdict, extra, logs, w):
    c = CASES_DEF[case]
    notes = []
    if verdict in ('SIGTERM_CANDIDATE', 'KILLED_CANDIDATE'):
        form, _ev = termination_form(logs, w)
        if form is None:
            notes.append('E2B-03: %s without the OS/channel termination witnesses' % verdict)
            form = 'INVALID_CAPTURE'
        elif form not in c['accepted_capture_forms']:
            notes.append('E2B-03: form %s not declared by %s -> rule 1' % (form, case))
            form = 'INVALID_CAPTURE'
    elif verdict == 'PASS':
        form = 'PASS'
    else:
        form = 'INVALID_CAPTURE'
    if extra:
        form = 'INVALID_CAPTURE'
    return form, notes


def compose(c, form, items, evaluation_completed, timeout):
    if form == 'INVALID_CAPTURE':
        return ('INCONCLUSIVE' if (c['inconclusive_on_deadline'] and timeout) else 'INVALID_CAPTURE'), 1
    if form not in c['accepted_capture_forms']:
        return 'MISMATCH', 2
    if not evaluation_completed:
        return 'INVALID_CAPTURE', 3
    failed = [x for x in items if not x['ok']]
    if any(x['class'] in CAPTURE_CLASSES for x in failed):
        return 'INVALID_CAPTURE', 4
    if any(x['class'] == 'order_unilateral' for x in failed):
        return 'INCONCLUSIVE', 5
    if any(x['class'] == 'client' for x in failed):
        return 'MISMATCH', 6
    return 'PASS_CLIENT_OBSERVATION', 7


def evaluate(case, logs, verdict, reasons, witness):
    c = CASES_DEF[case]
    assert c['language'] == 'python', 'the TypeScript slots are judged by ../tslane/acceptance.py'
    error, seq, extra, notes = None, None, [], []
    try:  # R1-F02 (2B2-ADM, D3-08): the capture-side helpers run inside the try; a failure is evaluation_completed=false
        part_problems = expand_parts(logs['driver'])
        seq = Seq(logs, witness)
        extra = capture_extra(case, logs, witness, seq, part_problems)
        if verdict == 'SIGTERM_CANDIDATE':
            extra += e2b12(c, logs, witness, seq)
    except Exception as exc:  # noqa: BLE001 - an evaluation failure is never a pass
        error = ('%s: %s' % (type(exc).__name__, exc))[:300]
    try:
        form, notes = capture_form(case, verdict, extra, logs, witness)
    except Exception as exc:  # noqa: BLE001
        error = error or ('%s: %s' % (type(exc).__name__, exc))[:300]
        form, notes = 'INVALID_CAPTURE', ['capture form not computed (R1-F02)']
    P = Preds(case)
    if error is None:
        try:
            P.add(CAPTURE_PRED, *case_input_witness(c, logs, witness))
            if c['kind'] == 'CONTROL':
                control_case(P, c, logs, witness, seq)
            else:
                sdk_case(P, c, logs, witness, form, seq)
        except Exception as exc:  # noqa: BLE001 - an evaluation failure is a failed predicate, never a pass
            error = ('%s: %s' % (type(exc).__name__, exc))[:300]
    items = []
    for pid in c['predicates']:
        ok, detail = P.got.get(pid, (False, 'not evaluated' + ('' if error is None else ' (%s)' % error)))
        items.append({'id': pid, 'ok': ok, 'class': class_of(pid), 'detail': detail})
    missing = [pid for pid in c['predicates'] if pid not in P.got]
    evaluation_completed = error is None and not missing
    timeout = bool(witness.get('timed_out')) or any('deadline' in e['data']['reason'] for e in logs['driver'].kinds('INVALID'))
    outcome, rule = compose(c, form, items, evaluation_completed, timeout)
    return {'kind': 'SDK_CASE_ACCEPTANCE_R4_C31_PY' if c['kind'] == 'SDK' else 'CONTROL_CASE_ACCEPTANCE_R4_C31_PY', 'evaluator': EVALUATOR,
            'evaluator_version': VERSION, 'case': case, 'outcome': outcome, 'composition_rule': rule, 'capture_verdict': verdict,
            'capture_form': form, 'capture_reasons': list(reasons) + extra + notes, 'predicates': items,
            'implicit_predicates': {'evaluation_completed': {'ok': evaluation_completed, 'error': error, 'missing': missing},
                                    'capture_form_accepted': {'ok': form in c['accepted_capture_forms'], 'form': form, 'accepted': c['accepted_capture_forms']}},
            'predicate_ids_match_plan': [x['id'] for x in items] == c['predicates'],
            'failed_predicates': [x['id'] for x in items if not x['ok']], 'informational_only': form == 'INVALID_CAPTURE',
            'known_bad': c['known_bad'], 'unit_sequence_tokens': len(seq.tokens) if seq is not None else None,
            'facts': {'client_fact_only': c['kind'] == 'SDK', 'control_slot': c['kind'] == 'CONTROL', 'parity_receipt': None,
                      'functional_receipts': 0, 'evaluator_version': VERSION}, 'functional_receipts': 0}


# ------------------------------------------------------------------------------------------------ DIAG checks

def diag_checks(case, logs, verdict, w, ci, sup_sha):
    d, a, p = logs['driver'], logs['adapter'], logs['peer']
    c = {}
    part_problems = expand_parts(d)
    c['parts_reassembled'] = not part_problems
    order = [x['detail'].get('command') + '->' + x['detail'].get('role') for x in w.get('control_actions', [])]
    role_shas = {r: logs[r].case_input_sha256 for r in ('driver', 'adapter', 'peer') if logs[r].events}
    c['case_input_role_witness'] = bool(role_shas) and all(v == sup_sha for v in role_shas.values())
    fake = {'id': case, 'case_input': ci, 'expected': {}, 'predicates': []}
    seq = Seq(logs, w)
    c['hook_occurrence_recount'] = not seq.hook_recount_bad
    hooks_decl = hooks_declared(fake)
    if case in ('DIAG-PY-RPC', 'DIAG-PY-STAGE', 'DIAG-PY-UNSCRIPTED'):
        c['eof_barrier'] = eof_barrier_ok(logs, w.get('control_actions', []))
    if case == 'DIAG-PY-RPC':
        ct = ms(d, 'CONTAINMENT')
        c['containment_selfcheck'] = bool(ct) and ct[0]['detail'].get('private_write') == 'PASS'
        c['barrier_order'] = [x for x in order if not x.startswith('READY')] == ['ABORT_NOW->driver', 'RELEASE_REPLY->peer', 'FINISH_PEER->peer', 'RELEASE_EXIT->driver']
        c['cancel_witness'] = bool(d.kinds('API_CANCELLED')) and bool(ms(d, 'LATE_REPLY_OBSERVED'))
        own = ms(d, 'OWN_CLIENT_CLOSED')
        c['own_client_exit_0'] = bool(own) and own[0]['detail']['returncode'] == 0
    elif case == 'DIAG-PY-STAGE':
        st = ms(d, 'STAGE_ADMISSION')
        det = st[0]['detail'] if st else {}
        c['staged_trees_sealed'] = det.get('sdk-python', 0) > 0 and det.get('python-deps', 0) > 0
        c['negatives_refused'] = all(det.get(k) == 'REFUSED' for k in ('hash_drift', 'unbound_extra_file', 'symlink', 'sdk_gate_closed'))
        c['no_target_module_loaded'] = det.get('target_modules_loaded') == []
        own = ms(d, 'OWN_CLIENT_CLOSED')
        c['own_client_exit_0'] = bool(own) and own[0]['detail']['returncode'] == 0
    elif case == 'DIAG-PY-UNSCRIPTED':
        un = ms(p, 'UNSCRIPTED')
        c['peer_recorded_unscripted'] = len(un) == 1 and un[0]['detail']['method'] == 'diag/unscripted'
        c['unscripted_error_written'] = len(ms(p, 'UNSCRIPTED_ERROR_WRITTEN')) == 1
        lines = [x['obj'] for x in wire_lines(a.committed_bytes('stdout'))[0]]
        errs = [x for x in lines if isinstance(x, dict) and 'error' in x]
        c['error_reply_exact'] = (len(errs) == 1 and errs[0]['error'] == {'code': -32601, 'message': 'cvg synthetic: unscripted request',
                                                                        'data': {'cvg_synthetic': True, 'method': 'diag/unscripted'}})
        done = ms(d, 'CALLS_DONE')
        c['client_not_blocked'] = bool(done) and done[0]['detail'].get('transport_closed') is False
        own = ms(d, 'OWN_CLIENT_CLOSED')
        c['own_client_exit_0'] = bool(own) and own[0]['detail']['returncode'] == 0
        c['peer_wire_replay_equal'] = peer_replay_check(ci, logs)['status'] == 'EQUAL'
    else:
        c['eof_barrier'] = eof_barrier_ok(logs, w.get('control_actions', [])) if ci['diag_calls'][-1]['kind'].startswith('eof_') else True
        bo_ok, bo = barrier_order(fake, logs, w, seq)
        c['barrier_plan_in_order'] = bo_ok or (not (w.get('plan') or {}) and not bo['stray_controls'])
        c['no_unscripted'] = not ms(p, 'UNSCRIPTED')
        res = {int(e['data']['api'].split(':', 1)[0]): e for e in d.kinds('API_RESULT') if e['data']['api'].split(':', 1)[0].isdigit()}
        canc = {int(e['data']['message'].split(':', 1)[0]): e for e in d.kinds('API_CANCELLED')}
        workers, _ = workers_of(d)
        probes = probes_of(d)
        if case == 'DIAG-PY-ASYNC':
            c['t1_t2_results'] = all(n in res and jeq(res[n]['data']['result'], {'a': 1}) for n in (7, 8))
            c['t3_t4_cancelled'] = all(n in canc and canc[n]['data']['name'] == 'CancelledError' for n in (12, 17))
            c['waiters_at_barrier'] = probes.get('waiters_at_barrier') == [1] and probes.get('initialized_at_barrier') == [False]
            sub = hook_entry_matches(seq, {'id': 'h_sub_close', 'self.label': 'L', 'self._closed': True, 'thread_name': 'MainThread',
                                           'after': 'CANCEL:16', 'before': 'API_CANCELLED:17'}, hooks_decl)
            c['callback_on_loop_thread_before_cancelled'] = bool(sub)
            setr = hook_entry_matches(seq, {'id': 'h_set_result', 'thread_name_prefix': 'cvg-own-start', 'before': 'CANCEL:16'}, hooks_decl)
            c['result_set_before_cancel'] = bool(setr)
            slow = hook_entry_matches(seq, {'id': 'h_req_ret', 'arg:method': 'own/slow', 'after': 'RELEASE_REPLY:own/slow#1'}, hooks_decl)
            rel13 = [x['gidx'] for x in w.get('actions', []) if x['action'] == 'CONTROL' and x['detail'].get('step') == 13
                     and x['detail'].get('command') == 'STEP_RELEASE']
            c['worker_completes_after_release'] = bool(slow) and bool(rel13) and slow[0]['gidx'] < rel13[0]
        elif case == 'DIAG-PY-BARRIER':
            c['consumers_woken'] = (workers.get('W1', {}).get('value', {}).get('summary') == 'a'
                                    and workers.get('W2', {}).get('value', {}).get('summary') == 'b')
            c['held_worker_result'] = jeq((workers.get('W3', {}).get('value') or {}).get('summary'), {'held': True})
            c['box_items_static_probe'] = probes.get('box_items') == [[]]
            unwind = hook_entry_matches(seq, {'id': 'h_raise_ret', 'arg:label': 'x', 'thread_name': 'MainThread', 'before': 'API_ERROR:17'}, hooks_decl)
            c['return_on_unwind'] = bool(unwind) and 17 in {int(e['data']['api'].split(':')[0]) for e in d.kinds('API_ERROR')}
            gen = [e for e in seq.hook_events if e['id'] == 'h_gen']
            c['generator_call_return_counted_per_event'] = (sorted((e['event'], e['occurrence']) for e in gen)
                                                           == [('call', 1), ('call', 2), ('call', 3), ('return', 1), ('return', 2), ('return', 3)])
            snap = res.get(21)
            c['excepthook_after_wait'] = snap is not None and jeq(snap['data']['result'], [{'thread_name': 'cvg-own-raiser', 'class': 'builtins.RuntimeError',
                                                                                          'str': 'own raise t'}])
        elif case == 'DIAG-PY-BEFOREREPLY':
            ok, _ = before_reply_order({'case_input': ci}, logs, seq)
            c['frames_before_reply_ledger'] = ok
            c['reader_order'] = probes.get('reader_order') == [[['r', 'initialize'], ['n', 'own/n1'], ['n', 'own/n2'], ['r', 'own/early'],
                                                               ['n', 'own/n3'], ['r', 'own/heldearly']]]
            c['before_reply_milestones'] = sorted(m['detail']['rule'] for m in ms(p, 'BEFORE_REPLY_WRITTEN')) == [1, 2]
        elif case == 'DIAG-PY-CLOCK':
            fake_c = {'case_input': ci, 'expected': {}}
            recs = shim_records(d)
            # expected records recomputed here with the formula of retry.py (jitter = delay * 0.2; sleep = min(max, delay) + uniform)
            want_uni, want_sleep, delay = [], [], 0.25
            for choice in ('b', 'a'):
                jitter = delay * 0.2
                ret = -jitter if choice == 'a' else jitter
                want_uni.append({'call': 'uniform', 'a': -jitter, 'b': jitter, 'returned': ret})
                want_sleep.append(min(2.0, delay) + ret)
                delay = min(2.0, delay * 2)
            ok_r, got_r = clock_recorder(dict(fake_c, expected={'clock': {'uniform': want_uni, 'sleep': want_sleep,
                                                                          'per_step': {'6': {'uniform': 2, 'sleep': 2}, '8': {'uniform': 0, 'sleep': 0}}}}),
                                         d, target_retry='own2b:retry')
            c['retry_records_exact'] = ok_r
            ok_m, _ = clock_recorder(dict(fake_c, expected={'clock': {'monotonic_calls': 2, 'monotonic_returned': [1000, 1031]}}), d, target_goal='own2b:goal')
            c['monotonic_records_exact'] = ok_m
            ok_s, _ = shim_scope(fake_c, d)
            c['shim_scope_identity_and_stdlib'] = ok_s
            c['flaky_result'] = 6 in res and jeq(res[6]['data']['result'], {'ok': 3})
            errs = {int(e['data']['api'].split(':', 1)[0]): e for e in d.kinds('API_ERROR')}
            c['no_retry_with_one_attempt'] = 8 in errs and errs[8]['data']['name'] == 'own2b.OwnOverloaded'
            c['wait_for_start_timeout_none'] = 12 in res and res[12]['data']['result'] is None
            c['module_attrs_back_to_stdlib'] = 14 in res and jeq(res[14]['data']['result'], {'random_is_stdlib': True, 'time_is_stdlib': True,
                                                                                         'uniform_is_stdlib': True, 'sleep_is_stdlib': True})
            c['records_count'] = len(recs) == 6
        elif case == 'DIAG-PY-FAULTCUT':
            frames = [e['data'] for e in d.kinds('FAULT')]
            c['work_fired_once_per_install'] = [f for f in frames if f['target'] == 'of.work'] == [
                {'target': 'of.work', 'call': '1', 'count': 1}, {'target': 'of.work', 'call': '1', 'count': 1}]
            c['stream_fired_at_call_2'] = [f for f in frames if f['target'] == 'gs.next_notification'] == [{'target': 'gs.next_notification', 'call': '2', 'count': 1}]
            c['cleanup_fired_in_thread'] = [f for f in frames if f['target'] == 'of.cleanup'] == [{'target': 'of.cleanup', 'call': '1', 'count': 1}]
            c['no_other_fault'] = len(frames) == 4
            scope = detail_of(d, 'FAULT_SCOPE')
            c['scope_installed_and_removed_ok'] = (all(x.get('ok') is True for x in scope)
                                                   and sorted(x['target'] for x in scope if x['state'] == 'removed') == ['of.cleanup', 'of.work', 'of.work'])
            errs = {int(x['label'].split(':', 1)[0]): x for x in detail_of(d, 'ERROR_DETAIL')}
            c['call_through_then_raise'] = 7 in errs and errs[7]['class'] == 'builtins.RuntimeError' and errs[7]['str'] == 'own injected failure'
            c['raise_before_call_keyboard_interrupt'] = 11 in errs and errs[11]['class'] == 'builtins.KeyboardInterrupt'
            c['class_method_after_remove'] = 9 in res and res[9]['data']['result'] == 2 and probes.get('work_calls') == [[1, 2]]
            c['stream_keyboard_interrupt_branch'] = (17 in res and res[17]['data']['result'] == 'n1' and 18 in errs
                                                     and errs[18]['class'] == 'builtins.KeyboardInterrupt' and probes.get('source_log') == [['next', 'cancel', 'unregister']]
                                                     and 19 in res and (res[19]['data'].get('observations') or {}).get('end') == 'StopIteration')
            snap = res.get(25)
            c['excepthook_after_thread_fault'] = snap is not None and jeq(snap['data']['result'], [{'thread_name': 'cvg-own-cleanup', 'class': 'builtins.RuntimeError',
                                                                                                  'str': 'own cleanup failure'}])
            c['cleanup_called_through'] = probes.get('cleanups') == [1]
            at_done = detail_of(d, 'SCOPES_AT_CALLS_DONE')
            c['nothing_installed_at_calls_done'] = bool(at_done) and at_done[0].get('faults_active') == []
        elif case == 'DIAG-PY-MODELORACLE':
            di = (d.begin or {}).get('dependency_identity')
            c['dependency_identity_equals_freeze'] = di == {'pydantic': '2.13.4', 'pydantic_core': '2.46.4'}
            ops = None
            for s_ in ci['diag_calls']:
                if s_['api'] == 'call' and s_.get('method') == 'oracle':
                    ops = s_['args'][0]
                    oracle_step = s_['step']
            ores = res.get(oracle_step) if ops is not None else None
            oracle = ores['data']['result'] if ores is not None else None
            errs = {int(x['label'].split(':', 1)[0]): x for x in detail_of(d, 'ERROR_DETAIL')}
            pv = {k: v[0] for k, v in probes.items() if len(v) == 1}
            rows, same = [], isinstance(oracle, list) and ops is not None and len(oracle) == len(ops)
            for i, op in enumerate(ops or []):
                step = 4 + i
                o = oracle[i] if same else None
                if op[0] in ('probe_vars', 'probe_extra_none', 'probe_type'):
                    mine = {'result': pv.get('op%d' % i)}
                elif step in errs:
                    x = errs[step]
                    mine = {'error': {'class': x.get('class'), 'error_count': x.get('error_count'),
                                      'errors': [{'type': e.get('type'), 'loc': e.get('loc')} for e in (x.get('errors') or [])]}}
                elif step in res:
                    mine = {'result': res[step]['data']['result']}
                else:
                    mine = None
                good = o is not None and mine is not None and jeq(mine, o)
                same = same and good
                rows.append({'op': i, 'ok': good})
            c['driver_equals_in_process_oracle'] = bool(same)
            loaded = res.get(oracle_step + 1) if ops is not None else None
            c['openai_codex_never_loaded'] = loaded is not None and isinstance(loaded['data']['result'], list) and 'openai_codex' not in loaded['data']['result'] \
                and 'pydantic' in loaded['data']['result']
            # recorded constants (informational: the oracle equality above is the pass criterion)
            c['info_never_dump'] = 11 in res and res[11]['data']['result'] == 'never'
            c['info_error_types'] = ([e['type'] for e in (errs.get(8) or {}).get('errors') or []] == ['missing']
                                     and [e['type'] for e in (errs.get(9) or {}).get('errors') or []] == ['int_type']
                                     and 'extra_forbidden' in [e['type'] for e in (errs.get(14) or {}).get('errors') or []]
                                     and 'literal_error' in [e['type'] for e in (errs.get(21) or {}).get('errors') or []])
            c['info_rows'] = rows if not same else len(rows)
        elif case == 'DIAG-PY-LOGIN':
            fake_c = {'case_input': ci, 'expected': {}}
            ok_l, det = login_frames_synthetic(fake_c, logs)
            c['login_frames_synthetic'] = ok_l and det['login_frames_on_wire'] == 6
            ok_b, _ = before_reply_order(fake_c, logs, seq)
            c['frame_before_reply'] = ok_b
            c['reader_order'] = probes.get('reader_order') == [[['r', 'initialize'], ['n', 'account/login/completed'], ['r', 'account/login/start'],
                                                                ['r', 'account/login/start'], ['n', 'account/login/completed'],
                                                                ['r', 'account/login/cancel'], ['n', 'account/login/completed']]]
            frames = detail_of(p, 'LOGIN_FRAME')
            c['login_frame_methods'] = [f['method'] for f in frames] == ['account/login/completed', 'account/login/start', 'account/login/start',
                                                                         'account/login/completed', 'account/login/cancel', 'account/login/completed']
        elif case == 'DIAG-PY-PROCWITNESS':  # 2B-1 checks, requalified (conditional DIAG of C3-PY02)
            pws = w.get('proc_witnesses') or []
            pr = proc_read(w)
            tail = ['--config', 'cvg="diag"', 'app-server', '--listen', 'stdio://']
            want_env = dict(FIXED_ENV, CVG_DIAG_ENV='procwitness')
            c['negative_control_read_before_begin_refused'] = (bool(pws) and pws[0].get('read') is False and pws[0].get('begin_seen') is False
                                                               and 'refused' in pws[0].get('failure', ''))
            c['read_after_begin_ok'] = pr is not None and pr.get('ok') is True and not pr.get('privilege_required')
            c['cmdline_post_execv'] = pr is not None and pr.get('cmdline') == ['/runtime/python', '-I', '-S', '/profile/adapter-python.py'] + tail
            c['environ_exact'] = pr is not None and pr.get('environ') == want_env
            c['cwd_exact'] = pr is not None and pr.get('cwd') == '/work/tmp'
            c['self_report_equal'] = (a.begin or {}).get('argv_tail') == tail and (a.begin or {}).get('env') == want_env and (a.begin or {}).get('cwd') == '/work/tmp'
            ret = [e['data'] for e in d.kinds('PROC_RETAIN')]
            c['popen_args_launcher'] = bool(ret) and ret[0]['args'] == ['/profile/adapter-python-exec'] + tail
            c['single_adapter_spawn'] = len((w.get('scan') or {}).get('adapter_pids') or []) == 1
        elif case == 'DIAG-PY-C3VOCAB':  # D3-04 / D3-05 over own code (freeze-r4-c3-delta.json#/diagnostics)
            row = {'case_input': ci, 'expected': ci.get('expected', {})}
            errs = {int(e['data']['api'].split(':', 1)[0]): e['data'] for e in d.kinds('API_ERROR') if e['data']['api'].split(':', 1)[0].isdigit()}
            wr = {x['step']: x for x in detail_of(d, 'WAIT_RESULT')}
            ecf = {x['step']: x for x in detail_of(d, 'EXPECTED_CAPTURE_FAILURE')}
            reg = (detail_of(d, 'THREAD_REGISTRY') or [{}])[0]
            c['fault_write_message_target'] = (errs.get(7, {}).get('name') == 'builtins.RuntimeError' and errs.get(7, {}).get('message') == 'own injected write failure'
                                               and probes.get('waiters_after_fault') == [[]] and 10 in res
                                               and (res[10]['data']['result'] or {}).get('method') == 'own/after')
            c['fault_next_login_notification_target'] = (errs.get(12, {}).get('name') == 'builtins.RuntimeError'
                                                         and errs.get(12, {}).get('message') == 'own injected login wait failure'
                                                         and probes.get('registered_after_fault') == [[]] and 15 in res
                                                         and res[15]['data']['result'] == 'completed-a')
            c['hook_by_identity_next_login_notification'] = 16 in res and res[16]['data']['result'] == 1 and \
                [e['record'].get('arg:login_id') for e in seq.hook_events if e['id'] == 'h_own_login'] == ['L-own-a']
            ok_f, _ = fault_fired(row, d)
            c['fault_zero_calls_with_thread_never_started_is_sane'] = ok_f
            c['client_effect_timeout_goes_on'] = wr.get(18, {}).get('ok') is False and wr.get(18, {}).get('class') == 'CLIENT_EFFECT' \
                and wr.get(18, {}).get('thread_started') is None and wr.get(18, {}).get('thread_alive') is None
            c['unless_alive_never_started_goes_on'] = (wr.get(19, {}).get('ok') is False and wr.get(19, {}).get('class') == 'CLIENT_EFFECT_UNLESS_ALIVE'
                                                       and wr.get(19, {}).get('thread_started') is False and wr.get(19, {}).get('thread_alive') is False)
            c['unless_alive_with_thread_alive_invalidates'] = (ecf.get(21, {}).get('raised') is True and wr.get(21, {}).get('ok') is False
                                                               and wr.get(21, {}).get('thread_alive') is True)
            c['wait_without_class_invalidates'] = ecf.get(22, {}).get('raised') is True and wr.get(22, {}).get('class') == 'HARNESS_PRECONDITION' \
                and wr.get(22, {}).get('ok') is False
            c['unless_alive_ended_ok'] = wr.get(24, {}).get('ok') is True and wr.get(24, {}).get('thread_started') is True and wr.get(24, {}).get('thread_alive') is False
            c['thread_registry'] = reg.get('installed') is True and 'cvg-c3-held' in (reg.get('started') or []) and 'cvg-c3-never-started' not in (reg.get('started') or [])
            ok_w, _ = wait_client_effect_recorded(row, d)
            c['wait_client_effect_recorded_rule'] = ok_w
    if 'RELEASE_EXIT->driver' in order:
        c['maps_witness_ok'] = bool(w.get('maps') and w['maps']['ok'])
    c['final_barrier'] = 'RELEASE_EXIT->driver' in order
    return c


# ------------------------------------------------------------------------------------------------ offline re-evaluation

def _load_observer():
    spec = importlib.util.spec_from_file_location('cvg_observer_reeval_2b2', HERE / 'observer.py')
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def _norm(items):
    return [[x['id'], x['ok'], json.dumps(x.get('detail'), sort_keys=True, ensure_ascii=False)] for x in items]


def rebuild(ev):
    obs = _load_observer()
    result = json.loads((ev / 'result.json').read_text())
    cfg = json.loads((ev / 'profile' / 'adapter-config.json').read_text())
    files = json.loads((ev / 'profile-manifest.json').read_text())['files']
    src = {'driver': 'control-client.py' if cfg['case'] in CONTROL_CASES else 'python-driver.py', 'adapter': 'adapter-python.py',
           'peer': 'fixture-rpc.py'}
    logs, gidx = {}, {}
    for role in ('driver', 'adapter', 'peer'):
        log = obs.RoleLog(role, {'attempt': cfg['attempt'], 'case': cfg['case'], 'nonce': cfg['nonce'], 'source_sha256': files['/profile/' + src[role]]})
        raw = (ev / ('events-%s.bin' % role)).read_bytes()
        rows = [json.loads(x) for x in (ev / ('events-%s.recv.jsonl' % role)).read_text().splitlines()]
        payloads, rest = obs.split_frames(raw)
        for i, pl in enumerate(payloads):
            log.feed(len(pl).to_bytes(4, 'big') + pl, rows[i]['recv_ns'] if i < len(rows) else -1)
        if rest:
            log.feed(rest, -1)
        if result['os_checks'].get('fifo_eof_all'):
            log.finish()
        logs[role] = log
        gidx[role] = [r['gidx'] for r in rows]
    verdict, reasons, _ = obs.reconcile(logs, 'python', {'checks': result['os_checks']}, None, None)
    host = result.get('role_host', {})
    witness = {'os_checks': result['os_checks'], 'maps': result.get('maps_witness'), 'adapter_environ': result.get('adapter_environ'),
               'adapter_cmdline': (host.get('adapter') or {}).get('cmdline'), 'adapter_pid': (host.get('adapter') or {}).get('host_pid'),
               'case_input_sha256_supervisor': result.get('case_input_sha256_supervisor'),
               'case_input_sha256_recomputed': hashlib.sha256(json.dumps(cfg['case_input'], ensure_ascii=False, separators=(',', ':')).encode('utf-8')).hexdigest(),
               'control_actions': [x for x in result['actions'] if x['action'] == 'CONTROL'], 'actions': result['actions'], 'frame_gidx': gidx,
               'barrier_log': result.get('barrier_log', []), 'proc_witnesses': result.get('proc_witnesses', []), 'termination': result.get('termination', {}),
               'scan': result.get('process_scan', {}), 'zero_checks': result.get('zero_checks', []), 'role_mapped': sorted(host),
               'timed_out': result.get('timed_out'), 'plan': json.loads((ev / 'profile-manifest.json').read_text())['case_plan']['barrier_plan']}
    return cfg, result, logs, verdict, reasons, witness


BARRIER_APIS = ('barrier', 'loop.block_release_wait_cancel')


def plan_binding(ev, case, frozen_plan=FROZEN_PLAN, freeze=SOURCE_FREEZE):
    """R1-F03 (2B2-ADM carry-over, D3-08): the plan preserved in the case folder equals the entry of case-plan-py.json bound by the
    sha of the source freeze, the folder records that same plan-file sha, and its barrier plan covers exactly the barrier steps of the
    delivered case_input (BARRIER_PLAN of the supervisor)."""
    manifest = json.loads((ev / 'profile-manifest.json').read_text())
    folder = manifest.get('case_plan') or {}
    ci = json.loads((ev / 'profile' / 'adapter-config.json').read_text())['case_input']
    problems = []
    frozen_sha = json.loads(freeze.read_text())['files'].get(frozen_plan.name, {}).get('sha256') if freeze.exists() else None
    raw = frozen_plan.read_bytes() if frozen_plan.exists() else b''
    if frozen_sha is None or sha(raw) != frozen_sha:
        problems.append('%s not bound by the source freeze' % frozen_plan.name)
    elif json.loads(raw)['cases'].get(case) != folder:
        problems.append('case folder plan differs from the frozen %s entry' % frozen_plan.name)
    if (manifest.get('case_plan_file') or {}).get('sha256') != frozen_sha:
        problems.append('case folder records another plan file')
    steps = ci.get('sdk_calls') or ci.get('diag_calls') or []
    barrier_steps = sorted(str(x['step']) for x in steps if x.get('api') in BARRIER_APIS)
    keys = sorted(folder.get('barrier_plan') or {})
    if keys != barrier_steps:
        problems.append('barrier plan keys %s differ from the barrier steps %s of the case_input' % (keys, barrier_steps))
    return not problems, {'problems': problems, 'barrier_steps': barrier_steps, 'plan_keys': keys, 'plan_file_sha256': frozen_sha}


def reevaluate(case_dir):
    ev = Path(case_dir)
    if not (ev / 'acceptance.json').is_file():
        raise SystemExit('reevaluate: no service acceptance.json in %s (exit 1)' % ev)
    service = json.loads((ev / 'acceptance.json').read_text())
    if service.get('evaluator_version') != VERSION:
        raise SystemExit('reevaluate: acceptance.json in %s has evaluator_version %r, expected %r (exit 1)' % (ev, service.get('evaluator_version'), VERSION))
    cfg, _result, logs, verdict, reasons, witness = rebuild(ev)
    plan_ok, plan_detail = plan_binding(ev, cfg['case'])
    acc = json.loads(json.dumps(evaluate(cfg['case'], logs, verdict, reasons, witness), ensure_ascii=False))
    a_items, d_items = _norm(acc['predicates']), _norm(service['predicates'])
    diff = [{'reevaluated': x, 'document': y} for x, y in zip(a_items, d_items) if x != y]
    return {'case': cfg['case'], 'verdict': verdict, 'outcome': acc['outcome'], 'service_outcome': service['outcome'],
            'predicate_level_equal': not diff and len(a_items) == len(d_items), 'outcome_equal': acc['outcome'] == service['outcome'],
            'plan_binding_ok': plan_ok, 'plan_binding': plan_detail, 'differences': diff[:10], 'evaluator_version': VERSION}


if __name__ == '__main__':
    if len(sys.argv) == 3 and sys.argv[1] == 'reevaluate':
        r = reevaluate(sys.argv[2])
        print(json.dumps(r, ensure_ascii=False, indent=1))
        sys.exit(0 if r['predicate_level_equal'] and r['outcome_equal'] and r['plan_binding_ok'] else 1)
    print(__doc__)
    sys.exit(2)
