"""Host-side TypeScript evaluator of DX100-G02:IMPLEMENT-AND-ADMIT-SDK-SOURCE-CONTINUATION-3-1 (acceptance-r4-c31-ts).

Base: the 2AC evaluator r4 (g02/sdk-batch-2ac-admission/python/acceptance.py; base r3.1): independent of the SDK, of the synthetic
peers and of the role-side encoders; it reads the observer RoleLogs, the observer verdict and the supervisor OS witnesses
(step witnesses, termination tracker, control actions, maps). Predicate ids, classes and oracles are the frozen table of
inputs/spec-c3/cases-c3-1.json (sha bound, never reclassified: E3-01, R3-12 selftest); the outcome follows the frozen composition
(first rule that applies decides): 1 capture form INVALID_CAPTURE, 2 form not accepted -> MISMATCH, 3 evaluator failed ->
INVALID_CAPTURE, 4 sanity/capture failure -> INVALID_CAPTURE, 5 order_unilateral -> INCONCLUSIVE, 6 only client failures ->
MISMATCH, 7 PASS_CLIENT_OBSERVATION. Every JSON comparison is strict by type (jeq). Only the 14 TypeScript slots are judged here;
C31-CTRL01 is judged by ../python/acceptance.py.

C3 clauses (evaluator-r4-c3-delta.json):
- E3-02 api.ts_steps_exact over expected.api: error by name, exact message or message_prefix, cause_name and code (ERROR_DETAIL of
  the same step); result by jeq; yields as the exact list of '<n>:yield'; yield_snapshots (event by jeq, observations thread_id or
  thread_id_is_undefined); return by '<n>:return' (events, observations); observations of startThread/resumeThread by jeq;
- E3-03 tmp.getter_witness_exact (client) and tmp.getter_witness_recorded (sanity; a listing error inside the getter makes it fail:
  C3-SPEC/R2-F02);
- E3-04 witness.suspended_resources; E3-05 gen.throw_propagated (with ret.child_terminated_by_SIGTERM and
  tmp.driver_listing_after_settle it judges the implicit return of the for await);
- E3-06 api.abort_error_exact and abort.child_terminated_by_node_abort WITH THE BINDING ERRATUM C3-SPEC/R2-F01: the client
  predicate judges only (1) the form KNOWN_SIGNAL_TERMINATION, (2) SIGTERM in the adapter SIGNAL and in the OS witness, (3) no
  signal sent by the supervisor to the adapter, (4) no kill by the driver's own code and (5) abort() recorded at its step by a
  driver milestone (ABORT_REQUESTED before the call, ABORT_RETURNED after it). The inter-process order (abort() before the adapter
  SIGNAL before the API_ERROR) is NOT judged by this client predicate: it is only recorded (order_recorded_not_judged), never a
  MISMATCH; this unit adds no order_unilateral predicate. api.first_event_exact reads expected.first_event;
  fixture.schema_bytes_exact reads expected.schema_file_bytes and expected.schema_file_trailing_lf.
- spawn.count_exact: the zero-spawn part reads only the ZERO_SPAWN and LAZY_POINT witnesses (a SUSPENDED or CHILD_HELD witness
  sees the live adapter by design) and requires one ZERO_SPAWN witness for every step that declares expect.spawns 0.
The attribution of a MISMATCH comes from a later adjudication (R4-05, E3-09). 0 functional receipts, 0 parity credit.

Usage: python3 -I -B acceptance.py reevaluate <case-dir>
  Rebuilds the RoleLogs from the preserved raw frames and recv_ns, reruns observer.reconcile and the predicates, compares them
  predicate by predicate with the service acceptance.json and checks the plan of the case folder against case-plan-ts.json bound
  by the source freeze (plan_binding). Exit 0 only when everything is equal.
"""
import hashlib
import importlib.util
import json
import re
import sys
from pathlib import Path

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
UNIT_DIR = HERE.parent
SPEC = UNIT_DIR / 'inputs' / 'spec-c3' / 'cases-c3-1.json'
CASES_SHA = 'fc9b54c02760eda44617cf60d414c26f9213a8b84b149c8cf9edc6bc7eb7de96'
SOURCE_FREEZE = UNIT_DIR / 'source-freeze-r4-c31.json'
FROZEN_PLAN = UNIT_DIR / 'case-plan-ts.json'
VERSION = 'acceptance-r4-c31-ts'
EVALUATOR = VERSION + ' (DX100-G02 continuation 3-1, TypeScript slots; frozen predicate table and composition of cases-c3-1.json; E3-01..E3-06, erratum C3-SPEC/R2-F01)'
SCHEMA_DIR = 'codex-output-schema-'
SCHEMA_PATH = re.compile(r'^/work/tmp/codex-output-schema-[A-Za-z0-9]{6}/schema\.json$')
CAPTURE_CLASSES = ('peer_or_capture_sanity', 'capture_order_or_cleanup')
KNOWN_FORMS = ('PASS', 'KNOWN_SIGNAL_TERMINATION', 'NO_CHILD', 'PREREADY_SIGNAL_TERMINATION', 'PREFRAME_TERMINATION')
CAPTURE_PRED = 'capture.case_input_frozen_bytes'
TERMINAL_EVENTS = ('turn.completed', 'turn.failed', 'error')


def _load_spec():
    raw = SPEC.read_bytes()
    if hashlib.sha256(raw).hexdigest() != CASES_SHA:
        raise SystemExit('cases-c3-1.json drifted from the approved spec')
    return json.loads(raw)


_DOC = _load_spec()
CASES_DEF = {c['id']: c for c in _DOC['cases']}
TABLE = _DOC['predicate_table']
COMPOSITION = _DOC['composition']


def class_of(pid):
    return TABLE[pid]['class']


def plan(case):
    c = CASES_DEF[case]
    return {'accepted_capture_forms': c['accepted_capture_forms'], 'predicates': c['predicates'],
            'classes': {p: class_of(p) for p in c['predicates']}, 'known_bad': c['known_bad'],
            'inconclusive_on_deadline': c['inconclusive_on_deadline'], 'composition': 'inputs/spec-c3/cases-c3-1.json#/composition',
            'evaluator': EVALUATOR}


class Preds:
    """Only the predicates listed by the case are computed (need) and kept (add)."""

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


# ------------------------------------------------------------------------------------------------ helpers

def sha(b):
    return hashlib.sha256(b).hexdigest()


def jeq(a, b):
    """JSON value equality, strict by type (R1-F03): bool never equals a number, null only null; int/float by value."""
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
    return type(a) is type(b) and a == b


def api(d, label):
    """Driver API lane events whose label equals `label` (lane convention "<step>:<name>")."""
    return [e for e in d.events if e['kind'] in ('API_RESULT', 'API_ERROR') and e['data']['api'] == label]


def api_step(d, step):
    pre = '%d:' % step
    return [e for e in d.events if e['kind'] in ('API_RESULT', 'API_ERROR') and e['data']['api'].startswith(pre)]


def detail_of(log, name):
    return [m['detail'] for m in log.milestones(name)]


def err_detail(d, label):
    for x in detail_of(d, 'ERROR_DETAIL'):
        if x.get('api') == label:
            return x
    return None


def schema_dirs(entries):
    return [e for e in (entries or []) if isinstance(e, list) and e and str(e[0]).startswith(SCHEMA_DIR)]


def control_t(actions, command, role, tag=None):
    t = [x['t_ns'] for x in actions if x['detail'].get('command') == command and x['detail'].get('role') == role
         and (tag is None or str(x['detail'].get('tag')) == str(tag))]
    return t[0] if t else None


def recv_of(log, kind, milestone=None, api_label=None):
    for e, rn in zip(log.events, log.recv_ns):
        if e['kind'] != kind:
            continue
        if milestone is not None and e['data'].get('milestone') != milestone:
            continue
        if api_label is not None and e['data'].get('api') != api_label:
            continue
        return rn
    return None


def match_pattern(got, pattern):
    if not isinstance(got, list) or len(got) != len(pattern):
        return False
    for g, p in zip(got, pattern):
        if isinstance(p, dict):
            if not (isinstance(g, str) and re.fullmatch(p['regex'], g)):
                return False
        elif not jeq(g, p):
            return False
    return True


def calls(c):
    return c['case_input']['sdk_calls']


def step_of(c, n):
    return [s for s in calls(c) if s['step'] == n][0]


def thread_obs(obs):
    """D3-02 (h): the thread identity part of an observation (thread_id or thread_id_is_undefined)."""
    return {k: obs[k] for k in ('thread_id', 'thread_id_is_undefined') if isinstance(obs, dict) and k in obs}


def declared_witnesses(x, out=None):
    """Witness ids of every $GETTER marker with witness in the case_input, in document order (mirror of the driver scan)."""
    out = [] if out is None else out
    if isinstance(x, list):
        for v in x:
            declared_witnesses(v, out)
    elif isinstance(x, dict):
        for k, v in x.items():
            if k == '$GETTER' and isinstance(v, dict) and 'witness' in v:
                out.append(v['witness'])
            declared_witnesses(v, out)
    return out


def os_sigterm(w):
    """OS witness of the adapter termination by SIGTERM (2B-2 tracker, E2B-03): zombie wait status 15 or the PID absent."""
    t = (w.get('termination') or {}).get('adapter') or {}
    return t.get('zombie_exit_code') == 15 or t.get('absent') is True, t


def supervisor_signal(w):
    """Any signal or kill of the supervisor towards the unit (this lane never signals a role): signal_sent_ns, the kill actions and
    an ABORT_NOW control."""
    return {'signal_sent_ns': w.get('signal_sent_ns'), 'kills': [x['action'] for x in (w.get('supervisor_kills') or [])],
            'abort_now': control_t(w.get('control_actions', []), 'ABORT_NOW', 'driver')}


def no_supervisor_signal(w):
    s = supervisor_signal(w)
    return s['signal_sent_ns'] is None and not s['kills'] and s['abort_now'] is None


# ------------------------------------------------------------------------------------------------ E3-02

def step_events(d, n):
    evs = api_step(d, n)
    yields = [e for e in evs if e['data']['api'] == '%d:yield' % n]
    rets = [e for e in evs if e['data']['api'] == '%d:return' % n]
    own = [e for e in evs if e not in yields and e not in rets]
    return own, yields, rets


def error_matches(want, data, detail):
    ok = jeq(data.get('name'), want['name'])
    if 'message' in want:
        ok = ok and jeq(data.get('message'), want['message'])
    if 'message_prefix' in want:
        ok = ok and isinstance(data.get('message'), str) and data['message'].startswith(want['message_prefix'])
    if 'cause_name' in want:
        ok = ok and isinstance(data.get('cause'), dict) and jeq(data['cause'].get('name'), want['cause_name'])
    if 'code' in want:
        ok = ok and detail is not None and jeq(detail.get('code'), want['code'])
    return ok


def ts_steps_exact(c, d):
    out, ok = [], True
    for item in c['expected']['api']:
        n = item['step']
        own, yields, rets = step_events(d, n)
        errs = [e for e in own if e['kind'] == 'API_ERROR']
        results = [e for e in own if e['kind'] == 'API_RESULT']
        good, got = True, {}
        if 'error' in item:
            det = err_detail(d, errs[0]['data']['api']) if len(errs) == 1 else None
            good = good and len(errs) == 1 and not results and error_matches(item['error'], errs[0]['data'], det)
            got['error'] = [errs[0]['data'], det] if errs else None
        if 'result' in item:
            good = good and len(results) == 1 and not errs and jeq(results[0]['data']['result'], item['result'])
            got['result'] = results[0]['data']['result'] if results else None
        if 'observations' in item:
            good = good and len(results) == 1 and not errs and jeq(results[0]['data']['observations'], item['observations'])
            got['observations'] = results[0]['data']['observations'] if results else None
        if 'yields' in item:
            good = good and jeq([e['data']['result'] for e in yields], item['yields'])
            got['yields'] = [e['data']['result'] for e in yields]
        if 'yield_snapshots' in item:
            snaps = [{'event': e['data']['result'], 'observations': thread_obs(e['data']['observations'])} for e in yields]
            good = good and jeq(snaps, item['yield_snapshots'])
            got['yield_snapshots'] = snaps
        if 'return' in item:
            r = item['return']
            ro = rets[0]['data']['observations'] if len(rets) == 1 else None
            good = good and ro is not None and jeq(ro.get('events'), r['events']) and ('observations' not in r or jeq(thread_obs(ro), r['observations']))
            got['return'] = ro
        ok = ok and good
        out.append({'step': n, 'ok': good, 'got': got})
    return ok, out


def run_result_exact(c, d):
    """api.run_result_exact: every run step without expect.throws resolves with the frozen result of its expected.api item."""
    want = {x['step']: x['result'] for x in c['expected']['api'] if 'result' in x}
    steps = [s['step'] for s in calls(c) if s.get('api') == 'run' and 'throws' not in (s.get('expect') or {})]
    got, ok = {}, bool(steps)
    for n in steps:
        ev = api(d, '%d:Thread.run' % n)
        got[n] = ev[0]['data']['result'] if len(ev) == 1 and ev[0]['kind'] == 'API_RESULT' else None
        ok = ok and n in want and len(ev) == 1 and ev[0]['kind'] == 'API_RESULT' and jeq(ev[0]['data']['result'], want[n])
    return ok, {'run_steps': steps, 'results': got}


# ------------------------------------------------------------------------------------------------ E3-03

def getter_witness_exact(c, d):
    recs = detail_of(d, 'GETTER_WITNESS')
    out, ok = [], True
    for want in c['expected']['getter_witnesses']:
        got = [r for r in recs if r.get('id') == want['id'] and r.get('step') == want['step']]
        g = got[0] if len(got) == 1 else None
        good = g is not None and jeq(g.get('invocations'), want['invocations']) and want['invocations'] >= 1
        entries = g.get('entries') if g else None
        if good:
            good = (isinstance(entries, list) and len(entries) == len(want['schema_dirs'])
                    and all(isinstance(e, list) and len(e) == 2 and isinstance(e[0], str) and re.fullmatch(sd['name_regex'], e[0]) is not None
                            and jeq(e[1], sd['children']) for e, sd in zip(entries, want['schema_dirs'])))
        ok = ok and good
        out.append({'id': want['id'], 'step': want['step'], 'ok': good, 'record': g, 'records_of_id': [r for r in recs if r.get('id') == want['id']]})
    return ok, out


def getter_witness_recorded(c, d):
    """Sanity of the driver telemetry (D3-03): the CALLS_DONE summary lists exactly the declared witnesses with totals equal to the
    sum of the GETTER_WITNESS records; each record is of a declared id, unique per (id, step), with >= 1 invocation, emitted after
    the API outcome of its step and before the TMP_LISTING of that step; the first record of an id carries the listing and no
    listing error (R2-F02)."""
    declared = declared_witnesses(c['case_input'])
    recs = detail_of(d, 'GETTER_WITNESS')
    done = detail_of(d, 'CALLS_DONE')
    summary = done[0].get('getter_witnesses') if len(done) == 1 else None
    problems = []
    if len(set(declared)) != len(declared):
        problems.append('duplicate declared witness id')
    if not isinstance(summary, list):
        problems.append('no CALLS_DONE getter_witnesses summary')
    else:
        ids = [x.get('id') for x in summary]
        if ids != declared:
            problems.append('summary ids %s differ from the declared %s' % (ids, declared))
        for x in summary:
            total = sum(r.get('invocations', 0) for r in recs if r.get('id') == x.get('id'))
            if not jeq(x.get('invocations_total'), total):
                problems.append('summary total of %s differs from its records' % x.get('id'))
    seen, first = set(), {}
    seqs = {}
    for e in d.events:
        if e['kind'] == 'DIAGNOSTIC' and e['data']['milestone'] == 'GETTER_WITNESS':
            seqs.setdefault((e['data']['detail'].get('id'), e['data']['detail'].get('step')), e['seq'])
    for r in recs:
        key = (r.get('id'), r.get('step'))
        if r.get('id') not in declared:
            problems.append('undeclared witness %r' % r.get('id'))
        if key in seen:
            problems.append('duplicate record %r' % (key,))
        seen.add(key)
        if not (isinstance(r.get('invocations'), int) and r['invocations'] >= 1):
            problems.append('record without invocation %r' % (key,))
        if 'error' in r:
            problems.append('listing error inside the getter %r: %s' % (key, r['error']))
        first.setdefault(r.get('id'), r)
        n = r.get('step')
        if isinstance(n, int):
            outcome = [e['seq'] for e in d.events if e['kind'] in ('API_RESULT', 'API_ERROR') and e['data']['api'].startswith('%d:' % n)]
            listing = [e['seq'] for e in d.events if e['kind'] == 'DIAGNOSTIC' and e['data']['milestone'] == 'TMP_LISTING'
                       and e['data']['detail'].get('step') == n]
            s = seqs.get(key)
            if not outcome or s is None or s < max(outcome) or (listing and s > listing[0]):
                problems.append('record %r not between the step outcome and its TMP_LISTING' % (key,))
    for wid, r in first.items():
        if not isinstance(r.get('entries'), list):
            problems.append('first record of %s without the listing' % wid)
    return not problems, {'problems': problems, 'declared': declared, 'summary': summary, 'records': recs}


# ------------------------------------------------------------------------------------------------ E3-04 / E3-05

def suspended_resources(c, logs, w):
    d, a = logs['driver'], logs['adapter']
    exp = c['expected']['suspended_witness']
    n = exp['step']
    sw = [x for x in (w.get('step_witness') or []) if x['kind'] == 'SUSPENDED' and str(x['step']) == str(n)]
    lst = [x for x in detail_of(d, 'STEP_WITNESS') if x.get('kind') == 'SUSPENDED' and x.get('step') == n]
    rel = control_t(w.get('control_actions', []), 'STEP_RELEASE', 'driver', tag=n)
    sig = recv_of(a, 'SIGNAL')
    term = (w.get('termination') or {}).get('adapter') or {}
    gone = [term[k] for k in ('zombie_t_ns', 'absent_t_ns') if term.get(k) is not None]
    first_yield = [e['seq'] for e in d.events if e['kind'] == 'API_RESULT' and e['data']['api'] == '%d:yield' % n]
    wit_seq = [e['seq'] for e in d.events if e['kind'] == 'DIAGNOSTIC' and e['data']['milestone'] == 'STEP_WITNESS'
               and e['data']['detail'].get('kind') == 'SUSPENDED' and e['data']['detail'].get('step') == n]
    ok = (len(sw) == 1 and len(lst) == 1 and len(schema_dirs(lst[0].get('entries'))) == exp['driver_listing_schema_dirs']
          and sw[0].get('adapter_alive') is exp['adapter_alive'] and sw[0].get('adapter_mapped') is True
          and sw[0].get('adapter_signal_frames') == 0 and sw[0].get('adapter_terminal') is None
          and rel is not None and (sig is None or sig > rel) is (not exp['adapter_signal_before_release'])
          and all(t > rel for t in gone) and bool(first_yield) and bool(wit_seq) and first_yield[0] < wit_seq[0])
    return ok, {'supervisor_witness': sw, 'driver_listing': lst, 'release_t_ns': rel, 'adapter_signal_recv_ns': sig, 'termination': term,
                'first_yield_seq': first_yield[:1], 'witness_seq': wit_seq[:1]}


def throw_propagated(c, logs, w):
    d = logs['driver']
    n = [s['step'] for s in calls(c) if s.get('consume') == 'first_then_witness_then_throw'][0]
    want = step_of(c, n)['throw']
    th = [x for x in detail_of(d, 'THROW_PROPAGATED') if x.get('step') == n]
    own, _y, _r = step_events(d, n)
    errs = [e for e in own if e['kind'] == 'API_ERROR']
    rel = control_t(w.get('control_actions', []), 'STEP_RELEASE', 'driver', tag=n)
    er = recv_of(d, 'API_ERROR', api_label=errs[0]['data']['api']) if errs else None
    ok = (len(th) == 1 and th[0].get('same_object') is True and th[0].get('cause_present') is False and len(errs) == 1
          and jeq(errs[0]['data']['name'], want['name']) and jeq(errs[0]['data']['message'], want['message']) and errs[0]['data']['cause'] is None
          and rel is not None and er is not None and er > rel)
    return ok, {'throw_propagated': th, 'api_error': [e['data'] for e in errs], 'release_t_ns': rel, 'api_error_recv_ns': er}


def ret_sigterm(logs, w, form, after_step=None):
    """ret.child_terminated_by_SIGTERM: after the return() of the for await, the adapter ends by SIGTERM (the exec finally), with
    the OS witness, without any supervisor signal; the adapter SIGNAL arrives after the SUSPENDED release."""
    a = logs['adapter']
    ae = a.kinds('END')
    os_ok, term = os_sigterm(w)
    rel = control_t(w.get('control_actions', []), 'STEP_RELEASE', 'driver', tag=after_step) if after_step is not None else None
    sig = recv_of(a, 'SIGNAL')
    ok = (form == 'KNOWN_SIGNAL_TERMINATION' and a.signal == 'SIGTERM' and bool(ae) and ae[0]['data']['complete'] is False
          and os_ok and no_supervisor_signal(w) and (after_step is None or (rel is not None and sig is not None and sig > rel)))
    return ok, {'form': form, 'adapter_signal': a.signal, 'adapter_end': ae[0]['data'] if ae else None, 'os_termination': term,
                'supervisor': supervisor_signal(w), 'release_t_ns': rel, 'adapter_signal_recv_ns': sig,
                'source': 'SDK exec finally child.kill()' if ok else 'not witnessed as SDK'}


# ------------------------------------------------------------------------------------------------ E3-06 (+ erratum R2-F01)

def abort_step(c):
    return [s['step'] for s in calls(c) if s.get('consume') == 'next_abort_at_barrier'][0]


def abort_error_exact(c, d):
    n = abort_step(c)
    want = [x['error'] for x in c['expected']['api'] if x['step'] == n and 'error' in x][0]
    own, yields, _r = step_events(d, n)
    errs = [e for e in own if e['kind'] == 'API_ERROR']
    det = err_detail(d, errs[0]['data']['api']) if len(errs) == 1 else None
    ok = len(errs) == 1 and not [e for e in own if e['kind'] == 'API_RESULT'] and not yields and error_matches(want, errs[0]['data'], det)
    return ok, {'api_error': errs[0]['data'] if errs else None, 'error_detail': det, 'yields': [e['data'] for e in yields],
                'cause_recorded_not_judged': errs[0]['data']['cause'] if errs else None}


def node_abort_termination(c, logs, w, form):
    """abort.child_terminated_by_node_abort under the binding erratum C3-SPEC/R2-F01 (see the module docstring): items (1)-(5) only;
    the inter-process order is recorded, never judged here."""
    d, a = logs['driver'], logs['adapter']
    n = abort_step(c)
    ae = a.kinds('END')
    os_ok, term = os_sigterm(w)
    req = [e for e in d.events if e['kind'] == 'DIAGNOSTIC' and e['data']['milestone'] == 'ABORT_REQUESTED' and e['data']['detail'].get('step') == n]
    ret = [e for e in d.events if e['kind'] == 'DIAGNOSTIC' and e['data']['milestone'] == 'ABORT_RETURNED' and e['data']['detail'].get('step') == n]
    own_kill = [m['detail'] for m in d.milestones('ABORT_CALLED')]
    items = {'1_form_known_signal_termination': form == 'KNOWN_SIGNAL_TERMINATION',
             '2_sigterm_adapter_signal_and_os': a.signal == 'SIGTERM' and bool(ae) and ae[0]['data']['complete'] is False and os_ok,
             '3_no_supervisor_signal': no_supervisor_signal(w),
             '4_no_driver_own_kill': not own_kill,
             '5_abort_recorded_at_step': (len(req) == 1 and len(ret) == 1 and req[0]['data']['detail'].get('controller') == step_of(c, n)['abort']
                                          and ret[0]['data']['detail'].get('aborted') is True and req[0]['seq'] < ret[0]['seq'])}
    sig = [e for e in a.events if e['kind'] == 'SIGNAL']
    err = [e for e in d.events if e['kind'] == 'API_ERROR' and e['data']['api'].startswith('%d:' % n)]
    order = {'abort_requested_mono_ns': int(req[0]['mono_ns']) if req else None, 'adapter_signal_mono_ns': int(sig[0]['mono_ns']) if sig else None,
             'api_error_mono_ns': int(err[0]['mono_ns']) if err else None,
             'note': 'errata C3-SPEC/R2-F01: ordem entre processos registrada, não julgada pelo oráculo client (nenhum predicado order_unilateral nesta unidade)'}
    return all(items.values()), {'items': items, 'os_termination': term, 'supervisor': supervisor_signal(w), 'own_kill_milestones': own_kill,
                                 'order_recorded_not_judged': order}


# ------------------------------------------------------------------------------------------------ TypeScript lane predicates

def case_input_witness(c, logs, w):
    """R4-02: supervisor, recomputed and every role BEGIN must carry the frozen case_input_sha256 of the slot."""
    want = c['case_input_sha256']
    roles = {r: logs[r].case_input_sha256 for r in ('driver', 'adapter', 'peer')}
    present = {r: v for r, v in roles.items() if logs[r].events}
    ok = (jeq(w.get('case_input_sha256_supervisor'), want) and jeq(w.get('case_input_sha256_recomputed'), want)
          and 'driver' in present and all(v == want for v in present.values()))
    return ok, {'frozen': want, 'supervisor': w.get('case_input_sha256_supervisor'), 'recomputed': w.get('case_input_sha256_recomputed'),
                'roles': {r: (roles[r] if r in present else 'NOT_APPLICABLE: no BEGIN') for r in roles}}


def ts_case(P, c, logs, w, form):
    d, a, p = logs['driver'], logs['adapter'], logs['peer']
    exp = c['expected']
    peer_argv = (detail_of(p, 'EXEC_ARGV') or [None])[0]
    cmd = w.get('adapter_cmdline')
    os_args = cmd[2:] if isinstance(cmd, list) and cmd[:2] == ['/runtime/node', '/profile/adapter-typescript'] else None
    if P.need('argv.exact_vector'):
        P.add('argv.exact_vector', jeq(peer_argv, exp['argv']) and jeq(os_args, exp['argv']), {'peer_reported': peer_argv, 'os_cmdline_args': os_args})
    if P.need('argv.pattern'):
        P.add('argv.pattern', match_pattern(peer_argv, exp['argv_pattern']) and jeq(os_args, peer_argv), {'peer_reported': peer_argv, 'os_cmdline_args': os_args})
    env_self = (detail_of(p, 'EXEC_ENV') or [None])[0]
    os_env = w.get('adapter_environ')
    if P.need('env.child_env_exact'):
        P.add('env.child_env_exact', jeq(env_self, exp['child_env']) and jeq(os_env, exp['child_env']), {'peer_reported': env_self, 'os_environ': os_env})
    if P.need('wire.stdin_exact_then_eof'):
        got = a.committed_bytes('stdin')
        P.add('wire.stdin_exact_then_eof', got == exp['stdin'].encode() and 'stdin' in a.stream_end, {'bytes': len(got), 'sha256': sha(got)})
    wit = w.get('step_witness') or []
    if P.need('spawn.count_exact'):
        want = exp['spawns_total']
        begins = len(a.kinds('BEGIN'))
        mapped = 'adapter' in (w.get('role_mapped') or [])
        zero = [x for x in wit if x['kind'] in ('ZERO_SPAWN', 'LAZY_POINT')]
        zero_ok = all(x['adapter_processes'] == 0 and x['peer_processes'] == 0 and x['adapter_frames'] == 0 for x in zero)
        need_zero = [s['step'] for s in calls(c) if (s.get('expect') or {}).get('spawns') == 0]
        have_zero = {str(x['step']) for x in zero if x['kind'] == 'ZERO_SPAWN'}
        P.add('spawn.count_exact', begins == want and mapped == (want > 0) and zero_ok and all(str(n) in have_zero for n in need_zero),
              {'adapter_begin_frames': begins, 'adapter_mapped': mapped, 'expected': want, 'zero_spawn_witnesses': zero,
               'steps_with_spawns_0': need_zero})
    lazy = [x for x in wit if x['kind'] == 'LAZY_POINT']
    if P.need('lazy.zero_spawn_at_barrier'):
        P.add('lazy.zero_spawn_at_barrier', len(lazy) == 1 and lazy[0]['adapter_processes'] == 0 and lazy[0]['peer_processes'] == 0
              and lazy[0]['adapter_frames'] == 0, lazy)
    if P.need('lazy.no_schema_dir_at_barrier'):
        lz = [x for x in detail_of(d, 'STEP_WITNESS') if x.get('kind') == 'LAZY_POINT']
        P.add('lazy.no_schema_dir_at_barrier', len(lz) == 1 and schema_dirs(lz[0].get('entries')) == [], lz)
    if P.need('tmp.driver_listing_after_settle'):
        listings = {}
        for x in detail_of(d, 'TMP_LISTING'):
            listings.setdefault(str(x['step']), x['entries'])
        want = {k: v for k, v in exp['driver_listing_after_settle'].items() if re.fullmatch(r'step\d+', k)}
        got = {k: (None if listings.get(k[4:]) is None else len(schema_dirs(listings[k[4:]]))) for k in want}
        P.add('tmp.driver_listing_after_settle', jeq(got, want), {'counts': got, 'expected': want,
                                                                  'names_informational': {k: [e[0] for e in schema_dirs(listings.get(k[4:]))] for k in want}})
    sf = (detail_of(p, 'SCHEMA_FILE') or [{}])[0]
    path_ok = isinstance(sf.get('path'), str) and bool(SCHEMA_PATH.match(sf['path']))
    first_write = recv_of(p, 'PEER_MILESTONE', 'REPLY_WRITTEN')
    sf_recv = recv_of(p, 'PEER_MILESTONE', 'SCHEMA_FILE')
    before_write = sf_recv is not None and (first_write is None or sf_recv <= first_write)
    if P.need('fixture.schema_file_present_during_child'):
        P.add('fixture.schema_file_present_during_child', sf.get('exists') is True and path_ok and before_write and peer_argv is not None
              and sf.get('path') in peer_argv, sf or None)
    if P.need('fixture.schema_bytes_exact'):
        want_b = exp['schema_file_bytes'].encode()
        P.add('fixture.schema_bytes_exact', sf.get('exists') is True and path_ok and before_write and sf.get('sha256') == sha(want_b)
              and jeq(sf.get('bytes'), len(want_b)) and sf.get('trailing_lf') is exp['schema_file_trailing_lf'], sf or None)
    if P.need('api.ts_steps_exact'):
        P.add('api.ts_steps_exact', *ts_steps_exact(c, d))
    if P.need('api.run_result_exact'):
        P.add('api.run_result_exact', *run_result_exact(c, d))
    if P.need('api.first_event_exact'):
        y = [e for e in d.events if e['kind'] == 'API_RESULT' and e['data']['api'].endswith(':yield')]
        P.add('api.first_event_exact', bool(y) and jeq(y[0]['data']['result'], exp['first_event']) and jeq(y[0]['data']['observations'].get('index'), 0),
              y[0]['data'] if y else None)
    if P.need('tmp.getter_witness_exact'):
        P.add('tmp.getter_witness_exact', *getter_witness_exact(c, d))
    if P.need('tmp.getter_witness_recorded'):
        P.add('tmp.getter_witness_recorded', *getter_witness_recorded(c, d))
    if P.need('witness.suspended_resources'):
        P.add('witness.suspended_resources', *suspended_resources(c, logs, w))
    if P.need('gen.throw_propagated'):
        P.add('gen.throw_propagated', *throw_propagated(c, logs, w))
    if P.need('ret.child_terminated_by_SIGTERM'):
        n = exp['suspended_witness']['step'] if 'suspended_witness' in exp else None
        P.add('ret.child_terminated_by_SIGTERM', *ret_sigterm(logs, w, form, n))
    if P.need('api.abort_error_exact'):
        P.add('api.abort_error_exact', *abort_error_exact(c, d))
    if P.need('abort.child_terminated_by_node_abort'):
        P.add('abort.child_terminated_by_node_abort', *node_abort_termination(c, logs, w, form))
    if P.need('abort.no_yield_after_abort'):
        n = abort_step(c)
        req = [e['seq'] for e in d.events if e['kind'] == 'DIAGNOSTIC' and e['data']['milestone'] == 'ABORT_REQUESTED']
        late = [e['data'] for e in api(d, '%d:yield' % n) if not req or e['seq'] > req[0]]
        P.add('abort.no_yield_after_abort', bool(req) and not late, {'yields_after_abort': late, 'abort_requested_seq': req[:1]})
    if P.need('abort.no_remote_stop_claim'):
        n = abort_step(c)
        terminal = [e['data'] for e in api(d, '%d:yield' % n) if isinstance(e['data']['result'], dict) and e['data']['result'].get('type') in TERMINAL_EVENTS]
        P.add('abort.no_remote_stop_claim', not terminal, {'terminal_events_yielded': terminal, 'note': 'só o fato do cliente; nenhuma parada remota afirmada'})


# ------------------------------------------------------------------------------------------------ outcome

def capture_extra(case, logs, w):
    """Capture/identity checks beyond observer.reconcile: the loaded-code witness of the driver."""
    out = []
    maps = w.get('maps')
    if not maps or not maps.get('ok'):
        out.append('loaded-code witness missing or with unknown mapping: %s' % ((maps or {}).get('error') or len((maps or {}).get('unknown', []))))
    return out


def capture_form(case, verdict, extra):
    """Observer verdict + extra capture checks -> capture form (R3-10, R3-F02). No C3-1 slot declares a frameless form."""
    c = CASES_DEF[case]
    notes = []
    form = verdict if verdict in KNOWN_FORMS and not extra else 'INVALID_CAPTURE'
    if form in ('NO_CHILD', 'PREREADY_SIGNAL_TERMINATION', 'PREFRAME_TERMINATION') and form not in c['accepted_capture_forms']:
        notes.append('R3-F02: capture form %s is not declared by %s -> INVALID_CAPTURE (rule 1)' % (form, case))
        form = 'INVALID_CAPTURE'
    return form, notes


def compose(c, form, items, evaluation_completed, timeout):
    """Frozen composition: returns (outcome, rule n). The first rule in order n that applies decides."""
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
    assert c['language'] == 'typescript' and c['kind'] == 'SDK', 'C31-CTRL01 is judged by ../python/acceptance.py'
    error, extra, notes = None, [], []
    try:
        extra = capture_extra(case, logs, witness)
        form, notes = capture_form(case, verdict, extra)
    except Exception as exc:  # noqa: BLE001 - an evaluation failure is never a pass
        error = ('%s: %s' % (type(exc).__name__, exc))[:300]
        form = 'INVALID_CAPTURE'
    P = Preds(case)
    if error is None:
        try:
            ok, det = case_input_witness(c, logs, witness)
            P.add(CAPTURE_PRED, ok, det)
            ts_case(P, c, logs, witness, form)
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
    implicit = {'evaluation_completed': {'ok': evaluation_completed, 'error': error, 'missing': missing},
                'capture_form_accepted': {'ok': form in c['accepted_capture_forms'], 'form': form, 'accepted': c['accepted_capture_forms']}}
    facts = {'client_fact_only': True, 'native_terminal_or_remote_stop_claimed': False, 'parity_receipt': None, 'functional_receipts': 0,
             'evaluator_version': VERSION}
    return {'kind': 'SDK_CASE_ACCEPTANCE_R4_C31_TS', 'evaluator': EVALUATOR, 'evaluator_version': VERSION, 'case': case, 'outcome': outcome,
            'composition_rule': rule, 'capture_verdict': verdict, 'capture_form': form, 'capture_reasons': list(reasons) + extra + notes,
            'predicates': items, 'implicit_predicates': implicit, 'predicate_ids_match_plan': [x['id'] for x in items] == c['predicates'],
            'failed_predicates': [x['id'] for x in items if not x['ok']], 'informational_only': form == 'INVALID_CAPTURE',
            'known_bad': c['known_bad'], 'facts': facts, 'functional_receipts': 0}


# ------------------------------------------------------------------------------------- offline re-evaluation

def _load_observer():
    spec = importlib.util.spec_from_file_location('cvg_observer_reeval_c31_ts', HERE / 'observer.py')
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def _norm(items):
    return [[x['id'], x['ok'], json.dumps(x.get('detail'), sort_keys=True, ensure_ascii=False)] for x in items]


def frozen_wire(fx):
    if 'JSONL' in fx:
        return {'stdout': ''.join((ln if isinstance(ln, str) else json.dumps(ln, separators=(',', ':'), ensure_ascii=False)) + '\n'
                                  for ln in fx['JSONL']).encode(), 'stderr': fx['stderr'].encode()}
    return None


def rebuild(ev):
    """Rebuild the RoleLogs from the preserved raw frames and recv_ns of one case directory, and the witness of the service."""
    obs = _load_observer()
    result = json.loads((ev / 'result.json').read_text())
    cfg = json.loads((ev / 'profile' / 'adapter-config.json').read_text())
    files = json.loads((ev / 'profile-manifest.json').read_text())['files']
    src = {'driver': 'ts-driver.mjs', 'adapter': 'adapter-typescript', 'peer': 'fixture-cli.mjs'}
    logs = {}
    for role in ('driver', 'adapter', 'peer'):
        log = obs.RoleLog(role, {'attempt': cfg['attempt'], 'case': cfg['case'], 'nonce': cfg['nonce'], 'source_sha256': files['/profile/' + src[role]]})
        raw = (ev / ('events-%s.bin' % role)).read_bytes()
        recv = [json.loads(x)['recv_ns'] for x in (ev / ('events-%s.recv.jsonl' % role)).read_text().splitlines()]
        payloads, rest = obs.split_frames(raw)
        for i, pl in enumerate(payloads):
            log.feed(len(pl).to_bytes(4, 'big') + pl, recv[i] if i < len(recv) else -1)
        if rest:
            log.feed(rest, -1)
        if result['os_checks'].get('fifo_eof_all'):
            log.finish()
        logs[role] = log
    fx = CASES_DEF[cfg['case']]['case_input']['fixture']
    verdict, reasons, _ = obs.reconcile(logs, 'typescript', {'checks': result['os_checks']}, frozen_wire(fx), result.get('signal_sent_ns'))
    host = result.get('role_host', {})
    witness = {'os_checks': result['os_checks'], 'maps': result.get('maps_witness'), 'adapter_environ': result.get('adapter_environ'),
               'adapter_cmdline': (host.get('adapter') or {}).get('cmdline'), 'adapter_pid': (host.get('adapter') or {}).get('host_pid'),
               'control_actions': [x for x in result['actions'] if x['action'] == 'CONTROL'],
               'supervisor_kills': [x for x in result['actions'] if x['action'] in ('SUPERVISOR_BOUND_KILL', 'CASE_ARTIFACT_BUDGET_KILL', 'ADMISSION_STOP')],
               'signal_sent_ns': result.get('signal_sent_ns'), 'step_witness': result.get('step_witness', []), 'role_mapped': sorted(host),
               'termination': result.get('termination', {}), 'case_input_sha256_supervisor': result.get('case_input_sha256_supervisor'),
               'case_input_sha256_recomputed': hashlib.sha256(json.dumps(cfg['case_input'], ensure_ascii=False, separators=(',', ':')).encode('utf-8')).hexdigest(),
               'timed_out': result.get('timed_out', not result['os_checks'].get('supervisor_bound_not_hit', True))}
    return cfg, logs, verdict, reasons, witness


def plan_binding(ev, case, frozen_plan=FROZEN_PLAN, freeze=SOURCE_FREEZE):
    """The plan preserved in the case folder equals the entry of case-plan-ts.json bound by the sha of the source freeze, the folder
    records that plan-file sha, and its barrier steps are exactly the barrier steps of the delivered case_input (same rule as the
    R1-F03 carry-over of the Python lane)."""
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
    want = {str(s['step']): s['barrier'] if 'barrier' in s else 'ZERO_SPAWN' for s in steps if 'barrier' in s or isinstance(s.get('expect'), dict)}
    if folder.get('barrier_steps') != want:
        problems.append('barrier steps of the folder plan differ from the case_input')
    return not problems, {'problems': problems, 'barrier_steps': want, 'plan_file_sha256': frozen_sha}


def reevaluate(case_dir):
    ev = Path(case_dir)
    if not (ev / 'acceptance.json').is_file():
        raise SystemExit('reevaluate: no service acceptance.json in %s; nothing to compare (exit 1)' % ev)
    service = json.loads((ev / 'acceptance.json').read_text())
    if service.get('evaluator_version') != VERSION:
        raise SystemExit('reevaluate: acceptance.json in %s has evaluator_version %r, expected %r (exit 1)' % (ev, service.get('evaluator_version'), VERSION))
    cfg, logs, verdict, reasons, witness = rebuild(ev)
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
