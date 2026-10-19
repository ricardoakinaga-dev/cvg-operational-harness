"""Host-side evaluator r4-2b1 for DX100-G02 batch 2B-1 (evaluator r4 + inputs/spec-2b/evaluator-r4-2b-delta.json).

Independent of the SDK, of the synthetic peer and of the role-side encoders: it reads the observer RoleLogs, the observer verdict
and the supervisor witnesses (actions with the global sequence index gidx, PROC_WITNESS, termination tracker, cgroup scan).
Inherits R4-01..R4-05, R4-07..R4-09 (R4-06 and R4-10 do not apply: no 2A-TS12R in 2B). Clauses:

- E2B-01 predicate table and composition of cases-2b-1.json (sha bound; classes never reclassified; R3-12 selftest);
- E2B-02 jeq on every JSON value comparison (bool strict, null only null, int/float by value, -0.0 == 0.0);
- E2B-03 CLIENT_TERMINATED_SIGTERM / CLIENT_KILLED_SIGKILL only with OS and channel witnesses (never the Popen returncode),
  mutually exclusive with each other and with PASS, valid only where the case declares them (else rule 1);
- E2B-04 order grammar: chains of KIND:REF tokens strictly increasing on the unit sequence (gidx): STEP:n, CANCEL:n,
  API_RESULT:n, API_ERROR:n, API_CANCELLED:n, WORKER:<name>, HOOK:<id>#k (k counted per (id, event): R2-F01, lead decision),
  RAW_READ:<method>[@<threadId>]#k, COMMIT_REPLY:<method>[@<threadId>]#k, RELEASE_REPLY:<method>[@<threadId>]#k;
- E2B-05/E2B-06 identity tokens and hook matching by id, attributes and occurrence (per (id, event)); extra events recorded;
- E2B-09 timing informational except the minimum of expected.timing (inside proc.termination_exact);
- E2B-10 attribution of a MISMATCH only by adjudication (R4-05); E2B-11 result matching; E2B-12 lines the SDK wrote that
  are absent from RAW_READ before the adapter SIGNAL are a capture failure; E2B-13 wire.absent judges requests only;
  E2B-14 harness waits that time out are INVALID_CAPTURE (driver side), client-effect waits continue (R2-F04).
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
SPEC_DIR = HERE.parent / 'inputs' / 'spec-2b'
SPEC = SPEC_DIR / 'cases-2b-1.json'
SPEC2 = SPEC_DIR / 'cases-2b-2.json'
CASES_SHA = '96b1e4d92d6333addfff638dbdbe6c0550d17625f9e57cf67291aa9548098105'
CASES2_SHA = '382d7b2956717634f95545276020fc47b6328465a5fd81f5a690424d065eaedc'
VERSION = 'acceptance-r4-2b1'
EVALUATOR = VERSION + ' (DX100-G02 batch 2B-1; frozen predicate table and composition of cases-2b-1.json; E2B-01..E2B-14)'
UUID4 = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
FIXED_ENV = {'HOME': '/work/home', 'TMPDIR': '/work/tmp', 'PATH': '/runtime', 'LANG': 'C.UTF-8', 'LC_ALL': 'C.UTF-8',
             'TZ': 'UTC', 'PYTHONDONTWRITEBYTECODE': '1', 'UV_THREADPOOL_SIZE': '2'}
CAPTURE_CLASSES = ('peer_or_capture_sanity', 'capture_order_or_cleanup')
CAPTURE_PRED = 'capture.case_input_frozen_bytes'
SIGNAL_FORMS = ('CLIENT_TERMINATED_SIGTERM', 'CLIENT_KILLED_SIGKILL')
# R2-F04 (mirror of python-driver.py): waits whose timeout is a client effect.
CLIENT_EFFECT_WAITS = {('2B-PY11B', 8): 'worker.parked de W2 no lock do thread', ('2B-PY02A', 12): 'thread.join do leitor'}
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


def cases2():
    return _load_doc(SPEC2, CASES2_SHA)


def class_of(pid):
    return TABLE[pid]['class']


def plan(case):
    c = CASES_DEF[case]
    return {'accepted_capture_forms': c['accepted_capture_forms'], 'predicates': c['predicates'],
            'classes': {p: class_of(p) for p in c['predicates']}, 'known_bad': c['known_bad'],
            'inconclusive_on_deadline': c['inconclusive_on_deadline'], 'composition': 'inputs/spec-2b/cases-2b-1.json#/composition',
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
        self.steps_by_label = {}
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
                ev = dict(data, gidx=g, seq=e['seq'])
                self.hook_events.append(ev)
                self._put('HOOK:%s:%s#%d' % (data['id'], data['event'], data['occurrence']), g)

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
        rpc = load('acc_fixture_rpc_2b1', HERE / 'fixture-rpc.py')
        rpc.C = load('acc_channel_2b1', HERE / 'channel.py')
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
        ok = ok and all(x in (det.get('mro') or []) for x in want['mro_contains'])
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
    sigterm = (a.signal == 'SIGTERM' and bool(ae) and ae[0]['data']['complete'] is False and a.fault is None
               and (t.get('absent') is True or t.get('zombie_exit_code') == 15)
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
        P.add('peer.before_reply_order_witnessed', *before_reply_order(c, logs))
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
    stdlib_files = {inp['path_host'] for name, inp in _DOC['inputs'].items() if name.startswith('stdlib/')}
    out, ok = {}, bool(decl)
    for hid, code in decl.items():
        idt = inst.get(hid)
        parts = code.split('.')
        good = idt is not None
        if good:
            f = idt['file']
            in_tree = f.startswith('/profile/sdk-python/openai_codex/')
            in_std = f in stdlib_files
            qual = idt['qualname']
            good = (in_tree or in_std) and '.'.join(parts[-len(qual.split('.')):]) == qual and isinstance(idt['first_line'], int) \
                and source_line_ok(f, idt['first_line'], qual.split('.')[-1])
        ok = ok and good
        out[hid] = {'declared': code, 'installed': idt, 'ok': good}
    return ok, out


def source_line_ok(path, line, name):
    """The first line of the code object is its def (or a decorator right above it) in the bound source file."""
    if path.startswith('/profile/sdk-python/'):
        host = Path('/mnt/dados/cvg-work/cvg-codex100-batch2b1-runtime-20261019/sdk-python') / path[len('/profile/sdk-python/'):]
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


def barrier_order(c, logs, w, seq):
    """Every barrier step: driver witness before the gate, the gate before each release, each release after its trigger;
    controls only from the plan, READY, FINISH_PEER and RELEASE_EXIT."""
    d = logs['driver']
    plan = w.get('plan') or {}
    acts = w.get('actions') or []
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
        ok = ok and good
        out.append({'step': step, 'witness_gidx': wit.get(step), 'gate_gidx': gate[:1], 'releases': [[x['detail']['command'], x['gidx']] for x in rel],
                    'planned': planned, 'ok': good})
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


def before_reply_order(c, logs):
    """Each rule with before_reply: BEFORE_REPLY_WRITTEN emitted, and the frames committed to the SDK before the reply bytes."""
    a, p = logs['adapter'], logs['peer']
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
        ok = ok and good
        out.append({'rule': rule, 'frames_line_index': frame_at, 'reply_line_index': reply_at[:1], 'ok': good})
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
            not (t.get('absent') and t.get('absent_t_ns', 0) < cd_recv)
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
    """2B1-CTRL01: own client (no SDK) gets a frame before the ctrl-2 reply, then an unscripted turn/interrupt -> MISMATCH."""
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
    ok, det = before_reply_order(c, logs)
    pre = [e['data'] for e in d.kinds('PRE_REPLY_NOTIFICATION')]
    ok = ok and any(x['reply_id'] == 'ctrl-2' and x['method'] == 'turn/started' for x in pre)
    P.add('peer.before_reply_order_witnessed', ok, dict(det, pre_reply_notifications=pre))


# ------------------------------------------------------------------------------------------------ outcome

def capture_extra(case, logs, w):
    out = []
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
    seq = Seq(logs, witness)
    extra = capture_extra(case, logs, witness)
    if verdict == 'SIGTERM_CANDIDATE':
        extra += e2b12(c, logs, witness, seq)
    form, notes = capture_form(case, verdict, extra, logs, witness)
    P = Preds(case)
    error = None
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
    return {'kind': 'SDK_CASE_ACCEPTANCE_R4_2B1' if c['kind'] == 'SDK' else 'CONTROL_CASE_ACCEPTANCE_R4_2B1', 'evaluator': EVALUATOR,
            'evaluator_version': VERSION, 'case': case, 'outcome': outcome, 'composition_rule': rule, 'capture_verdict': verdict,
            'capture_form': form, 'capture_reasons': list(reasons) + extra + notes, 'predicates': items,
            'implicit_predicates': {'evaluation_completed': {'ok': evaluation_completed, 'error': error, 'missing': missing},
                                    'capture_form_accepted': {'ok': form in c['accepted_capture_forms'], 'form': form, 'accepted': c['accepted_capture_forms']}},
            'predicate_ids_match_plan': [x['id'] for x in items] == c['predicates'],
            'failed_predicates': [x['id'] for x in items if not x['ok']], 'informational_only': form == 'INVALID_CAPTURE',
            'known_bad': c['known_bad'], 'unit_sequence_tokens': len(seq.tokens),
            'facts': {'client_fact_only': c['kind'] == 'SDK', 'control_slot': c['kind'] == 'CONTROL', 'parity_receipt': None,
                      'functional_receipts': 0, 'evaluator_version': VERSION}, 'functional_receipts': 0}


# ------------------------------------------------------------------------------------------------ DIAG checks

def diag_checks(case, logs, verdict, w, ci, sup_sha):
    d, a, p = logs['driver'], logs['adapter'], logs['peer']
    c = {}
    order = [x['detail'].get('command') + '->' + x['detail'].get('role') for x in w.get('control_actions', [])]
    role_shas = {r: logs[r].case_input_sha256 for r in ('driver', 'adapter', 'peer') if logs[r].events}
    c['case_input_role_witness'] = bool(role_shas) and all(v == sup_sha for v in role_shas.values())
    fake = {'id': case, 'case_input': ci, 'expected': {}, 'predicates': []}
    seq = Seq(logs, w)
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
            ok, _ = before_reply_order({'case_input': ci}, logs)
            c['frames_before_reply_ledger'] = ok
            c['reader_order'] = probes.get('reader_order') == [[['r', 'initialize'], ['n', 'own/n1'], ['n', 'own/n2'], ['r', 'own/early'],
                                                               ['n', 'own/n3'], ['r', 'own/heldearly']]]
            c['before_reply_milestones'] = sorted(m['detail']['rule'] for m in ms(p, 'BEFORE_REPLY_WRITTEN')) == [1, 2]
        elif case == 'DIAG-PY-CLOSETERM':
            form, ev = termination_form(logs, w)
            c['form_client_terminated_sigterm'] = form == 'CLIENT_TERMINATED_SIGTERM'
            c['returncode_minus_15'] = probes.get('returncode_after_close') == [-15]
            c['no_kill_branch'] = not [e for e in seq.hook_events if e['id'] == 'h_kill']
            rep = peer_replay_check(ci, logs)['status']
            c['prefix_integrity'] = rep in ('PREFIX', 'EQUAL')
            pr = proc_read(w)
            want_env = dict(FIXED_ENV, CVG_DIAG_ENV='closeterm', LANG='C')
            # Launch-tuple form of the process witness: recorded for the conditional gate (gate_ key, not a pass criterion).
            c['gate_proc_witness_launch_form'] = (pr is not None and pr.get('ok') is True and pr.get('cmdline') == ['/runtime/python', '-I', '-S', '/profile/adapter-python.py']
                                                  and pr.get('environ') == want_env and pr.get('cwd') == '/work/tmp'
                                                  and (a.begin or {}).get('env') == want_env and (a.begin or {}).get('cwd') == '/work/tmp'
                                                  and (a.begin or {}).get('argv_tail') == [])
        elif case == 'DIAG-PY-PROCWITNESS':
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
        elif case == 'DIAG-PY-KILLWAIT':
            form, ev = termination_form(logs, w)
            c['form_client_killed_sigkill'] = form == 'CLIENT_KILLED_SIGKILL'
            c['fault_sigterm_ignored'] = a.fault == 'sigterm_ignored' and len(a.kinds('FAULT')) == 1
            c['timeout_expired_then_kill'] = bool([e for e in seq.hook_events if e['id'] == 'h_timeout']) and bool([e for e in seq.hook_events if e['id'] == 'h_kill'])
            c['returncode_none_right_after_kill'] = probes.get('returncode_right_after_close') == [None]
            reap = res.get(11)
            c['reap_minus_9'] = reap is not None and reap['data']['result'] == -9
            marks = {m['id']: m['mono_ns'] for m in detail_of(d, 'CLOCK_MARK')}
            c['close_waited_2s'] = 'after_close' in marks and 'before_close' in marks and (marks['after_close'] - marks['before_close']) >= 2_000_000_000
    if 'RELEASE_EXIT->driver' in order:
        c['maps_witness_ok'] = bool(w.get('maps') and w['maps']['ok'])
    c['final_barrier'] = 'RELEASE_EXIT->driver' in order
    return c


# ------------------------------------------------------------------------------------------------ offline re-evaluation

def _load_observer():
    spec = importlib.util.spec_from_file_location('cvg_observer_reeval_2b1', HERE / 'observer.py')
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
    src = {'driver': 'control-client.py' if cfg['case'] == '2B1-CTRL01' else 'python-driver.py', 'adapter': 'adapter-python.py', 'peer': 'fixture-rpc.py'}
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


def reevaluate(case_dir):
    ev = Path(case_dir)
    if not (ev / 'acceptance.json').is_file():
        raise SystemExit('reevaluate: no service acceptance.json in %s (exit 1)' % ev)
    service = json.loads((ev / 'acceptance.json').read_text())
    if service.get('evaluator_version') != VERSION:
        raise SystemExit('reevaluate: acceptance.json in %s has evaluator_version %r, expected %r (exit 1)' % (ev, service.get('evaluator_version'), VERSION))
    cfg, _result, logs, verdict, reasons, witness = rebuild(ev)
    acc = json.loads(json.dumps(evaluate(cfg['case'], logs, verdict, reasons, witness), ensure_ascii=False))
    a_items, d_items = _norm(acc['predicates']), _norm(service['predicates'])
    diff = [{'reevaluated': x, 'document': y} for x, y in zip(a_items, d_items) if x != y]
    return {'case': cfg['case'], 'verdict': verdict, 'outcome': acc['outcome'], 'service_outcome': service['outcome'],
            'predicate_level_equal': not diff and len(a_items) == len(d_items), 'outcome_equal': acc['outcome'] == service['outcome'],
            'differences': diff[:10], 'evaluator_version': VERSION}


if __name__ == '__main__':
    if len(sys.argv) == 3 and sys.argv[1] == 'reevaluate':
        r = reevaluate(sys.argv[2])
        print(json.dumps(r, ensure_ascii=False, indent=1))
        sys.exit(0 if r['predicate_level_equal'] and r['outcome_equal'] else 1)
    print(__doc__)
    sys.exit(2)
