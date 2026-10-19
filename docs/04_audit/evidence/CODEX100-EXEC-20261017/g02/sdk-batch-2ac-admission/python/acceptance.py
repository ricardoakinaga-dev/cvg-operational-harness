"""Host-side evaluator r4 for DX100-G02 batch 2A continuation (inputs/spec-2ac/evaluator-r4-contract.json).

Base r3.1 (R4-01): independent of the SDK, of the synthetic peers and of the role-side encoders; it reads the observer
RoleLogs, the observer verdict and the supervisor OS witnesses. Predicate ids, classes and oracles are the frozen table of
inputs/spec-2ac/cases-2a-cont.json (sha bound, never reclassified); the outcome follows the frozen composition (rule order n,
the first rule that applies decides): 1 capture form INVALID_CAPTURE -> INVALID_CAPTURE (INCONCLUSIVE only by deadline where
declared), 2 form not accepted -> MISMATCH, 3 evaluator failed -> INVALID_CAPTURE, 4 sanity/capture failure ->
INVALID_CAPTURE, 5 order_unilateral -> INCONCLUSIVE, 6 only client failures -> MISMATCH (informational ignored), 7 PASS.
Every JSON value comparison is strict by type (jeq).

r4 clauses: R4-02 capture.case_input_frozen_bytes in every slot (supervisor, role BEGIN and recomputed witnesses);
R4-03 frameless forms mutually exclusive: PREFRAME_TERMINATION = no adapter/peer frame, >=1 IN_OPEN of the adapter
executable in the window, no spawn-failure evidence on the driver (any ERROR_DETAIL with syscall spawn*, R2-F04 carry-over)
and no survivors at CALLS_DONE; NO_CHILD = no frame, zero events in the window and spawn-failure evidence; anything else
frameless is INVALID_CAPTURE; R4-04 wire integrity is capture (observer F4-02; peer v2 replay F4-05 for the CONTROL);
R4-06 abort.os_witness_recorded_r4 only in 2A-TS12R; R4-07 api.stdin_error_uncaught; R4-08 api.toml_errors_exact;
R4-10 2A-TS12R predicates read step 5. The attribution of a MISMATCH comes from a later adjudication (R4-05).
0 functional receipts, 0 parity credit.

Usage: python3 -I acceptance.py reevaluate <case-dir>
  Rebuilds the RoleLogs from the preserved raw frames and recv_ns, reruns observer.reconcile and the predicates and
  compares them, predicate by predicate (id, ok and JSON-normalized detail), with acceptance-r4_1.json of the same
  directory when it exists, else with the service acceptance.json (evaluator_version acceptance-r4). Exit 0 when every
  predicate and the outcome are equal; exit 1 on any difference; exit 1 with an explicit message when the service
  acceptance.json is missing or a document carries another evaluator version.
       python3 -I acceptance.py reevaluate-write <case-dir>
  Same re-judgement, written to acceptance-r4_1.json (refuses to overwrite), with the differences against the service
  document listed inside it.
"""
import hashlib
import importlib.util
import json
import re
import signal
import sys
from pathlib import Path

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
SPEC = HERE.parent / 'inputs' / 'spec-2ac' / 'cases-2a-cont.json'
CASES_SHA = '60a46db7544134958481c03df476305659f29653faaa171a6fed41a8ce6b4244'
VERSION = 'acceptance-r4'
SERVICE_VERSION = 'acceptance-r4'
R31_DOC = 'acceptance-r4_1.json'
EVALUATOR = VERSION + ' (DX100-G02 batch 2A continuation; frozen predicate table and composition of cases-2a-cont.json)'
UUID4 = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
FIXED_ENV = {'HOME': '/work/home', 'TMPDIR': '/work/tmp', 'PATH': '/runtime', 'LANG': 'C.UTF-8', 'LC_ALL': 'C.UTF-8',
             'TZ': 'UTC', 'PYTHONDONTWRITEBYTECODE': '1', 'UV_THREADPOOL_SIZE': '2'}
SCHEMA_DIR = 'codex-output-schema-'
SCHEMA_PATH = re.compile(r'^/work/tmp/codex-output-schema-[A-Za-z0-9]{6}/schema\.json$')
CAPTURE_CLASSES = ('peer_or_capture_sanity', 'capture_order_or_cleanup')
KNOWN_FORMS = ('PASS', 'KNOWN_SIGNAL_TERMINATION', 'NO_CHILD', 'PREREADY_SIGNAL_TERMINATION', 'PREFRAME_TERMINATION')
CAPTURE_PRED = 'capture.case_input_frozen_bytes'
BASE = {'2A-TS03R': '2A-TS03', '2A-TS06R': '2A-TS06', '2A-TS07R': '2A-TS07'}  # faithful copies dispatch to the 2A oracles
EMPTY_RESULT = {'items': [], 'finalResponse': '', 'usage': None}
SPAWN_FAILURE_CODES = ('ENOENT', 'EACCES', 'EPERM', 'ENOTDIR', 'ENOEXEC')


def _load_spec():
    raw = SPEC.read_bytes()
    if hashlib.sha256(raw).hexdigest() != CASES_SHA:
        raise SystemExit('cases-2a-cont.json drifted from the approved spec')
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
            'inconclusive_on_deadline': c['inconclusive_on_deadline'], 'composition': 'cases-2a.json#/composition',
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
    """Committed bytes -> (list of {'raw','obj'} per LF-terminated line, unterminated tail)."""
    out, i = [], 0
    while True:
        j = raw.find(b'\n', i)
        if j < 0:
            return out, raw[i:]
        line = raw[i:j]
        out.append({'raw': line, 'obj': strict_obj(line)})
        i = j + 1


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


def ms(log, name):
    return log.milestones(name)


def detail_of(log, name):
    return [m['detail'] for m in log.milestones(name)]


def err_detail(d, label):
    for x in detail_of(d, 'ERROR_DETAIL'):
        if x.get('api') == label:
            return x
    return None


def spawn_failure(d, label='ERROR_DETAIL_ANY'):
    """Positive spawn-failure evidence on the driver lane: an ERROR_DETAIL whose syscall starts with spawn (open list, R2-F04)."""
    out = []
    for x in detail_of(d, 'ERROR_DETAIL'):
        if label != 'ERROR_DETAIL_ANY' and x.get('api') != label:
            continue
        if str(x.get('syscall') or '').startswith('spawn'):
            out.append({'api': x.get('api'), 'code': x.get('code'), 'syscall': x.get('syscall')})
    return out


def frameless_form(verdict, ew, spawn_failed):
    """R4-03: the observer's NO_CHILD (no adapter/peer frame) is split by the exec witness into mutually exclusive forms."""
    if verdict != 'NO_CHILD':
        return verdict
    if not ew or ew.get('state') != 'closed' or ew.get('failure'):
        return 'INVALID_CAPTURE'
    in_open = ew.get('in_open_in_window', 0)
    no_survivor = ew.get('survivors_at_calls_done') == {'adapter': 0, 'peer': 0}
    if in_open >= 1 and not spawn_failed and no_survivor:
        return 'PREFRAME_TERMINATION'
    if not ew.get('events_in_window') and spawn_failed:
        return 'NO_CHILD'
    return 'INVALID_CAPTURE'


_RPC = None


def _peer_v2():
    """fixture-rpc.ScriptV2 loaded from the frozen source with the role channel module (no I/O at import)."""
    global _RPC
    if _RPC is None:
        def load(name, path):
            spec = importlib.util.spec_from_file_location(name, path)
            m = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(m)
            return m
        rpc = load('acc_fixture_rpc', HERE / 'fixture-rpc.py')
        rpc.C = load('acc_channel', HERE / 'channel.py')
        _RPC = rpc
    return _RPC


def peer_replay_check(case_input, logs):
    """F4-05: replay the frozen peer v2 script over the client requests committed by the adapter; compare with the stdout."""
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


def case_input_witness(c, logs, w):
    """R4-02: supervisor, recomputed and every role BEGIN must carry the frozen case_input_sha256 of the slot."""
    want = c['case_input_sha256']
    roles = {r: logs[r].case_input_sha256 for r in ('driver', 'adapter', 'peer')}
    present = {r: v for r, v in roles.items() if logs[r].events}
    ok = (jeq(w.get('case_input_sha256_supervisor'), want) and jeq(w.get('case_input_sha256_recomputed'), want)
          and 'driver' in present and all(v == want for v in present.values()))
    return ok, {'frozen': want, 'supervisor': w.get('case_input_sha256_supervisor'), 'recomputed': w.get('case_input_sha256_recomputed'),
                'roles': {r: (roles[r] if r in present else 'NOT_APPLICABLE: no BEGIN') for r in roles}}


def schema_dirs(entries):
    return [e for e in (entries or []) if isinstance(e, list) and e and str(e[0]).startswith(SCHEMA_DIR)]


def control_t(actions, command, role):
    t = [x['t_ns'] for x in actions if x['detail'].get('command') == command and x['detail'].get('role') == role]
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


def eof_barrier_ok(logs, actions):
    """CLIENT_STDIN_CLOSED and peer STDIN_EOF both received before FINISH_PEER, and the adapter relayed stdin to EOF."""
    d, a, p = logs['driver'], logs['adapter'], logs['peer']
    closed = recv_of(d, 'DIAGNOSTIC', 'CLIENT_STDIN_CLOSED')
    eof = recv_of(p, 'PEER_MILESTONE', 'STDIN_EOF')
    fin = control_t(actions, 'FINISH_PEER', 'peer')
    end = a.stream_end.get('stdin')
    return (closed is not None and eof is not None and fin is not None and closed <= fin and eof <= fin
            and end is not None and end['committed_bytes'] == len(a.data['stdin']))


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


def one(evs, kind=None):
    return len(evs) == 1 and (kind is None or evs[0]['kind'] == kind)


def error_is(evs, name, message):
    return one(evs, 'API_ERROR') and jeq(evs[0]['data']['name'], name) and jeq(evs[0]['data']['message'], message)


# ------------------------------------------------------------------------------------------------ TypeScript

def ts_common(P, c, logs, w, form):
    """Lane predicates of the TypeScript cases: argv, env, stdin, spawn witnesses, driver listings, schema file, peer exit."""
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
    if P.need('env.no_driver_env_inherited'):
        bad = [k for k in exp['child_env_must_not_contain'] if k in (os_env or {}) or k in (env_self or {})]
        P.add('env.no_driver_env_inherited', isinstance(os_env, dict) and isinstance(env_self, dict) and not bad, {'inherited': bad})
    if P.need('wire.stdin_exact_then_eof'):
        got = a.committed_bytes('stdin')
        P.add('wire.stdin_exact_then_eof', got == exp['stdin'].encode() and 'stdin' in a.stream_end, {'bytes': len(got), 'sha256': sha(got)})
    wit = w.get('step_witness') or []
    if P.need('spawn.count_exact'):
        want = exp['spawns_total'] if 'spawns_total' in exp else exp['adapter_processes']
        begins = len(a.kinds('BEGIN'))
        mapped = 'adapter' in (w.get('role_mapped') or [])
        zero_ok = all(x['adapter_processes'] == 0 and x['peer_processes'] == 0 and x['adapter_frames'] == 0 for x in wit)
        P.add('spawn.count_exact', begins == want and mapped == (want > 0) and zero_ok,
              {'adapter_begin_frames': begins, 'adapter_mapped': mapped, 'expected': want, 'zero_spawn_witnesses': wit})
    lazy = [x for x in wit if x['kind'] == 'LAZY_POINT']
    if P.need('lazy.zero_spawn_at_barrier'):
        P.add('lazy.zero_spawn_at_barrier', len(lazy) == 1 and lazy[0]['adapter_processes'] == 0 and lazy[0]['peer_processes'] == 0
              and lazy[0]['adapter_frames'] == 0, lazy)
    if P.need('lazy.no_schema_dir_at_barrier'):
        lz = [x for x in detail_of(d, 'STEP_WITNESS') if x.get('kind') == 'LAZY_POINT']
        P.add('lazy.no_schema_dir_at_barrier', len(lz) == 1 and schema_dirs(lz[0].get('entries')) == [], lz)
    if P.need('tmp.driver_listing_after_settle'):
        # TMP_LISTING right after each run settles; for a barrier step (LAZY_POINT) the driver listing of STEP_WITNESS.
        listings = {}
        for x in detail_of(d, 'TMP_LISTING'):
            listings.setdefault(str(x['step']), x['entries'])
        for x in detail_of(d, 'STEP_WITNESS'):
            listings.setdefault(str(x['step']), x['entries'])
        want = {k: v for k, v in exp['driver_listing_after_settle'].items() if re.fullmatch(r'step\d+', k)}
        got = {k: (None if listings.get(k[4:]) is None else len(schema_dirs(listings[k[4:]]))) for k in want}
        names = {k: (None if listings.get(k[4:]) is None else [e[0] for e in schema_dirs(listings[k[4:]])]) for k in want}
        argv_dir = next((a.split('/')[3] for a in (peer_argv or []) if isinstance(a, str) and SCHEMA_PATH.match(a)), None)
        P.add('tmp.driver_listing_after_settle', jeq(got, want), {'counts': got, 'expected': want, 'names_informational': names,
                                                                  'argv_schema_dir_informational': argv_dir})
    if P.need('tmp.inotify_informational'):
        P.add('tmp.inotify_informational', True, {'status': 'NOT_OBSERVED', 'reason': 'vigia inotify não admitida nesta unidade; capture-contract permite NOT_OBSERVED sem efeito no desfecho'})
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
    if P.need('peer.exit_status'):
        fx = c['fixture']
        pe, ae = p.kinds('END'), a.kinds('END')
        P.add('peer.exit_status', form == 'PASS' and bool(pe) and jeq(pe[0]['data']['child_exit_code'], fx['exit_code'])
              and bool(ae) and jeq(ae[0]['data']['child_exit_code'], fx['exit_code']) and ae[0]['data']['complete'] is True,
              {'peer': pe[0]['data']['child_exit_code'] if pe else None, 'adapter': ae[0]['data']['child_exit_code'] if ae else None})


def sdk_sigterm(P, pid, logs, w, form):
    a = logs['adapter']
    ok = (form == 'KNOWN_SIGNAL_TERMINATION' and a.signal == 'SIGTERM' and w.get('signal_sent_ns') is None
          and control_t(w.get('control_actions', []), 'ABORT_NOW', 'driver') is None)
    P.add(pid, ok, {'form': form, 'adapter_signal': a.signal, 'supervisor_signal_sent': w.get('signal_sent_ns') is not None,
                    'source': 'SDK exec finally child.kill()' if ok else 'not witnessed as SDK'})


def run_result(P, c, d, step):
    ev = api(d, '%d:Thread.run' % step)
    P.add('api.run_result_exact', one(ev, 'API_RESULT') and jeq(ev[0]['data']['result'], c['expected']['result']), ev[0]['data'] if ev else None)


def throws(c, step):
    return [s for s in c['sdk_calls'] if s['step'] == step][0]['expect']['throws']


def ts_case(P, c, logs, w, form):
    cid = BASE.get(c['id'], c['id'])
    d, a = logs['driver'], logs['adapter']
    exp = c['expected']
    ts_common(P, c, logs, w, form)
    if cid == '2A-TS01':
        t = throws(c, 1)
        ev = api(d, '1:new Codex')
        P.add('api.constructor_resolver_error_exact', error_is(ev, t['name'], t['message']), ev[0]['data'] if ev else None)
        t3, t4 = api(d, '3:startThread'), api(d, '4:resumeThread')
        P.add('api.thread_ids_observed', one(t3, 'API_RESULT') and t3[0]['data']['observations'].get('thread_id') is None
              and one(t4, 'API_RESULT') and jeq(t4[0]['data']['observations'].get('thread_id'), 'r-lazy'), [x['data'] for x in t3 + t4])
        ret = api(d, '7:return')
        P.add('api.stream_returned_events', one(ret, 'API_RESULT') and jeq(ret[0]['data']['observations'].get('events'), exp['events_yielded'])
              and not api(d, '7:yield') and not api(d, '7:Thread.runStreamed'), ret[0]['data'] if ret else None)
    elif cid in ('2A-TS02', '2A-TS02B', '2A-TS05', '2A-TS08', '2A-TS09'):
        run_result(P, c, d, 3)
    elif cid == '2A-TS03':
        t = throws(c, 3)
        ev = api(d, '3:Thread.run')
        P.add('api.schema_rejection_exact', error_is(ev, t['name'], t['message']), ev[0]['data'] if ev else None)
        run_result(P, c, d, 4)
    elif cid == '2A-TS04':
        t = throws(c, 3)
        ev = api(d, '3:Thread.runStreamed')
        P.add('api.normalize_error_exact', error_is(ev, t['name'], t['message']) and not api(d, '3:yield'), ev[0]['data'] if ev else None)
        y = api(d, '4:yield')
        P.add('api.first_event_exact', one(y, 'API_RESULT') and jeq(y[0]['data']['result'], exp['first_event']) and jeq(y[0]['data']['observations'].get('index'), 0),
              y[0]['data'] if y else None)
        r = api(d, '4:return()')
        P.add('ret.return_resolved_done', one(r, 'API_RESULT') and jeq(r[0]['data']['result'], {'done': True}), r[0]['data'] if r else None)
        sdk_sigterm(P, 'ret.child_terminated_by_SIGTERM', logs, w, form)
    elif cid in ('2A-TS06', '2A-TS07'):
        pid = 'api.config_error_exact' if cid == '2A-TS06' else 'api.toml_error_exact'
        t = throws(c, 3)
        ev = api(d, '3:Thread.run')
        P.add(pid, error_is(ev, t['name'], t['message']), ev[0]['data'] if ev else None)
        run_result(P, c, d, 6)
    elif cid == '2A-TS10':
        ev = api_step(d, 3)
        unc = detail_of(d, 'UNCAUGHT')
        det = err_detail(d, '3:Thread.run')
        fa = exp['source_consistent_forms']['A']['api_error']
        form_a = (one(ev, 'API_ERROR') and ev[0]['data']['api'] == '3:Thread.run' and det is not None and jeq(det.get('code'), fa['code'])
                  and str(det.get('syscall') or '').startswith(fa['syscall_prefix']) and not unc)
        form_b = len(unc) == 1 and unc[0].get('code') is not None and not ev
        P.add('api.enoent_form_A_or_B_exclusive', form_a != form_b,
              {'form': 'A' if form_a else 'B' if form_b else None, 'api': [e['data'] for e in ev], 'error_detail': det, 'uncaught': unc})
        P.add('api.no_result_value', not any(e['kind'] == 'API_RESULT' for e in ev), [e['data']['api'] for e in ev])
    elif cid == '2A-TS11':
        run_result(P, c, d, 3)
        ev = api(d, '3:Thread.run')
        P.add('api.thread_id_after', one(ev, 'API_RESULT') and jeq(ev[0]['data']['observations'].get('thread_id'), exp['thread_id_after']),
              ev[0]['data']['observations'] if ev else None)
        sizes = [len(bytes.fromhex(h)) for h in c['fixture']['stdout_chunks_hex']]
        want = b''.join(bytes.fromhex(h) for h in c['fixture']['stdout_chunks_hex'])
        got = a.committed_bytes('stdout')
        P.add('wire.fixture_chunks_relayed', got == want, {'stdout_bytes': len(got), 'expected_bytes': len(want), 'sha256': sha(got)})
        commits = [e['data']['bytes'] for e in a.events if e['kind'] == 'FORWARD_COMMIT' and e['data']['stream'] == 'stdout']
        bounds, acc = set(), 0
        for n in commits:
            acc += n
            bounds.add(acc)
        P.add('wire.chunk_boundaries_recorded', True, {'adapter_stdout_commits': commits, 'chunk_sizes': sizes,
                                                       'chunk3_and_chunk4_in_separate_commits': sum(sizes[:3]) in bounds,
                                                       'label': 'fronteira do adapter observada; leitura do SDK não testemunhada'})
    elif cid == '2A-TS12':
        ev = api_step(d, 4)
        outcome = [e['data'] for e in ev if (e['kind'] == 'API_ERROR' and e['data'].get('name') and e['data'].get('message') is not None)
                   or e['data']['api'] == '4:return']
        P.add('abort.api_outcome_recorded', len(outcome) == 1 and ev and ev[-1]['data'] is outcome[0],
              {'api': [e['data'] for e in ev], 'error_detail': err_detail(d, '4:Thread.runStreamed')})
        terminal = [e['data'] for e in api(d, '4:yield') if isinstance(e['data']['result'], dict)
                    and e['data']['result'].get('type') in ('turn.completed', 'turn.failed', 'error')]
        P.add('abort.no_remote_stop_claim', not terminal, {'terminal_events_yielded': terminal, 'note': 'só o fato do cliente; nenhuma parada remota afirmada'})
        mapped = 'adapter' in (w.get('role_mapped') or [])
        ae = a.kinds('END')
        det4 = err_detail(d, '4:Thread.runStreamed')
        spawn_failed = (det4 is not None and det4.get('code') in SPAWN_FAILURE_CODES and str(det4.get('syscall') or '').startswith('spawn'))
        rec = {'adapter_mapped': mapped, 'adapter_pid': w.get('adapter_pid'), 'adapter_signal': a.signal,
               'adapter_end': ae[0]['data'] if ae else None, 'form': form, 'client_error_detail': det4,
               'positive_spawn_failure_evidence': spawn_failed,
               'oracle_r3_1': 'processo do adapter com PID e término pelo SO, ou evidência positiva de spawn falho; ausência não testemunhada não é registro'}
        P.add('abort.os_witness_recorded', isinstance(w.get('os_checks'), dict) and isinstance(w.get('role_mapped'), list)
              and ((mapped and w.get('adapter_pid') is not None and (a.signal is not None or bool(ae))) or (not mapped and spawn_failed)), rec)
        P.add('abort.no_yield_after_abort', not api(d, '4:yield'), [e['data']['api'] for e in ev])
    elif cid == '2A-TS12R':
        # R4-10: step 5; R4-06: abort.os_witness_recorded_r4 with the exec witness.
        ev = api_step(d, 5)
        outcome = [e['data'] for e in ev if (e['kind'] == 'API_ERROR' and e['data'].get('name') and e['data'].get('message') is not None)
                   or e['data']['api'] == '5:return']
        P.add('abort.api_outcome_recorded', len(outcome) == 1 and ev and ev[-1]['data'] is outcome[0],
              {'api': [e['data'] for e in ev], 'error_detail': err_detail(d, '5:Thread.runStreamed')})
        terminal = [e['data'] for e in api(d, '5:yield') if isinstance(e['data']['result'], dict)
                    and e['data']['result'].get('type') in ('turn.completed', 'turn.failed', 'error')]
        P.add('abort.no_remote_stop_claim', not terminal, {'terminal_events_yielded': terminal, 'note': 'só o fato do cliente; nenhuma parada remota afirmada'})
        mapped = 'adapter' in (w.get('role_mapped') or [])
        ae = a.kinds('END')
        ew = w.get('exec_witness') or {}
        failed = spawn_failure(d)
        no_survivor = ew.get('survivors_at_calls_done') == {'adapter': 0, 'peer': 0}
        existence = ((mapped and w.get('adapter_pid') is not None and (a.signal is not None or bool(ae)))
                     or (not mapped and ew.get('state') == 'closed' and not ew.get('failure') and ew.get('in_open_in_window', 0) >= 1 and not failed))
        P.add('abort.os_witness_recorded_r4', isinstance(w.get('os_checks'), dict) and isinstance(w.get('role_mapped'), list) and existence and no_survivor,
              {'adapter_mapped': mapped, 'adapter_pid': w.get('adapter_pid') if mapped else 'NOT_WITNESSED', 'adapter_signal': a.signal if mapped else 'NOT_WITNESSED',
               'adapter_end': ae[0]['data'] if ae else None, 'in_open_in_window': ew.get('in_open_in_window'), 'window_state': ew.get('state'),
               'witness_failure': ew.get('failure'), 'spawn_failure_evidence': failed, 'survivors_at_calls_done': ew.get('survivors_at_calls_done'),
               'client_error_detail': err_detail(d, '5:Thread.runStreamed'), 'form': form})
        P.add('abort.no_yield_after_abort', not api(d, '5:yield'), [e['data']['api'] for e in ev])
    elif cid == '2A-TS10E':
        st = a.stream_end.get('stdin') or {}
        raw_stdin = [e for e in a.events if e['kind'] == 'RAW_READ' and e['data']['stream'] == 'stdin']
        P.add('fault.adapter_closed_stdin_unread', a.fault == 'stdin_closed_at_start' and not raw_stdin and st.get('committed_bytes') == 0
              and st.get('read_bytes') == 0, {'fault': a.fault, 'stdin_raw_reads': len(raw_stdin), 'stdin_stream_end': st or None})
        un = detail_of(d, 'UNCAUGHT')
        drain = detail_of(d, 'UNCAUGHT_DRAIN')
        u = exp['uncaught']
        P.add('api.stdin_error_uncaught', len(un) == u['count'] and all(x.get('code') in u['code_in'] and jeq(x.get('syscall'), u['syscall']) for x in un)
              and bool(drain) and drain[0].get('count') == len(un), {'uncaught': un, 'drain': drain})
        ev = api(d, '3:Thread.run')
        P.add('api.run_result_after_stdin_error', one(ev, 'API_RESULT') and jeq(ev[0]['data']['result'], exp['result']), ev[0]['data'] if ev else None)
    elif cid == '2A-TS06X':
        t = throws(c, 3)
        ev = api(d, '3:Thread.run')
        P.add('api.config_root_error_exact', error_is(ev, t['name'], t['message']), ev[0]['data'] if ev else None)
        run_result(P, c, d, 6)
    elif cid == '2A-TS07X':
        got, ok = [], True
        zero = {str(x['step']): x for x in (w.get('step_witness') or []) if x['kind'] == 'ZERO_SPAWN'}
        for e in exp['errors']:
            ev = api(d, '%d:Thread.run' % e['step'])
            zw = zero.get(str(e['step']))
            this = error_is(ev, e['name'], e['message']) and zw is not None and zw['adapter_processes'] == 0 and zw['peer_processes'] == 0
            ok = ok and this
            got.append({'step': e['step'], 'api': ev[0]['data'] if ev else None, 'zero_spawn_witness': zw, 'ok': this})
        P.add('api.toml_errors_exact', ok, got)
        run_result(P, c, d, max(s['step'] for s in c['sdk_calls'] if s.get('api') == 'run'))
    elif cid == '2A-TS08X':
        run_result(P, c, d, 3)
    elif cid in ('2A-TS13', '2A-TS14'):
        ys = [e['data'] for e in api(d, '3:yield')]
        if cid == '2A-TS13':
            P.add('api.yields_exact', jeq([y['result'] for y in ys], exp['yields']), [y['result'] for y in ys])
        else:
            snaps = []
            for y in ys:
                r = y['result'] if isinstance(y['result'], dict) else {}
                s = {'type': r.get('type')}
                if r.get('type') == 'thread.started':
                    s.update({'thread_id': r.get('thread_id'), 't.id': y['observations'].get('thread_id')})
                elif r.get('type') == 'turn.completed':
                    s['usage.cache_write_input_tokens'] = (r.get('usage') or {}).get('cache_write_input_tokens', '<absent>')
                elif r.get('type') == 'turn.failed':
                    s['error'] = r.get('error')
                snaps.append(s)
            P.add('api.yield_snapshots_exact', jeq(snaps, exp['yield_snapshots']), snaps)
        ev = api(d, '3:Thread.runStreamed')
        P.add('api.stream_error_exact', error_is(ev, exp['api_error']['name'], exp['api_error']['message']) and not api(d, '3:return'),
              ev[0]['data'] if ev else None)
    elif cid == '2A-TS15':
        ev = api(d, '3:Thread.run')
        P.add('api.run_error_exact', error_is(ev, exp['api_error']['name'], exp['api_error']['message']), ev[0]['data'] if ev else None)
        sdk_sigterm(P, 'cleanup.child_terminated_by_SIGTERM', logs, w, form)


# ------------------------------------------------------------------------------------------------ Python

def py_common(P, c, logs, w):
    d, a, p = logs['driver'], logs['adapter'], logs['peer']
    cl, ctail = wire_lines(a.committed_bytes('stdin'))
    sl, stail = wire_lines(a.committed_bytes('stdout'))
    P.add('wire.client_lines_complete_json', not ctail and bool(cl) and all(x['obj'] is not None for x in cl), {'lines': len(cl), 'tail': len(ctail)})
    P.add('wire.server_lines_complete_json', not stail and bool(sl) and all(x['obj'] is not None for x in sl), {'lines': len(sl), 'tail': len(stail)})
    co = [x['obj'] or {} for x in cl]
    so = [x['obj'] or {} for x in sl]
    c0 = co[0] if co else {}
    params = c0.get('params') if isinstance(c0.get('params'), dict) else {}
    init_ok = (c0.get('method') == 'initialize' and isinstance(c0.get('id'), str) and bool(UUID4.match(c0['id']))
               and jeq((params.get('clientInfo') or {}).get('name'), 'codex_python_sdk') and jeq(params.get('capabilities'), {'experimentalApi': True}))
    c1 = co[1] if len(co) > 1 else None
    P.add('wire.initialize_handshake', init_ok and jeq(c1, {'method': 'initialized'}), {'initialize_id': c0.get('id'), 'second_line': c1})
    P.add('wire.initialize_request_learned_uuid', init_ok, {'id': c0.get('id'), 'clientInfo': params.get('clientInfo'), 'capabilities': params.get('capabilities')})
    P.add('wire.initialized_notification_exact', jeq(c1, {'method': 'initialized'}), c1)
    init_reply = c['peer_script']['on_request'][0]['reply']
    P.add('wire.initialize_reply_learned_id', bool(so) and jeq(so[0], dict({'id': c0.get('id')}, **init_reply)), so[0] if so else None)
    first = [e for e in d.events if e['kind'] in ('API_RESULT', 'API_ERROR')][:1]
    res = first[0]['data'].get('result') if first else None
    want = init_reply['result']
    P.add('api.initialize_result_parsed', bool(first) and first[0]['kind'] == 'API_RESULT'
          and first[0]['data']['api'] in ('CodexClient.initialize', 'AsyncCodexClient.initialize') and isinstance(res, dict)
          and jeq(res.get('serverInfo'), want.get('serverInfo')) and jeq(res.get('userAgent'), want.get('userAgent'))
          and all(v is None for k, v in res.items() if k not in ('serverInfo', 'userAgent')), res)
    P.add('env.adapter_sandbox_env_only', jeq(w.get('adapter_environ'), FIXED_ENV), w.get('adapter_environ'))
    P.add('peer.no_unscripted_request', not ms(p, 'UNSCRIPTED'), detail_of(p, 'UNSCRIPTED'))
    if P.need('wire.eof_bounded_interval'):
        P.add('wire.eof_bounded_interval', eof_barrier_ok(logs, w.get('control_actions', [])))
    return co, so


def requests_of(co):
    return [x for x in co[2:] if 'method' in x and 'id' in x]


def py_err(d, step, name):
    label = '%d:%s' % (step, name)
    ev = api(d, label)
    return ev, err_detail(d, label)


def py_case(P, c, logs, w):
    cid = c['id']
    d, p = logs['driver'], logs['peer']
    exp = c['expected']
    co, so = py_common(P, c, logs, w)
    reqs = requests_of(co)
    if cid == '2A-PY03':
        r0 = reqs[0] if reqs else {}
        P.add('wire.params_absent', bool(reqs) and r0.get('method') == 'synthetic/echo' and 'params' not in r0, r0)
        P.add('wire.request_ids_uuid4', len(reqs) == 3 and all(isinstance(r.get('id'), str) and bool(UUID4.match(r['id'])) for r in reqs),
              [r.get('id') for r in reqs])
        ev2 = api(d, '2:CodexClient.request')
        P.add('api.matching_result_only', one(ev2, 'API_RESULT') and jeq(ev2[0]['data']['result'], exp['api'][0]['result']), ev2[0]['data'] if ev2 else None)
        ev3, d3 = py_err(d, 3, 'CodexClient.request')
        e3 = exp['api'][1]['error']
        P.add('api.non_object_rejected', one(ev3, 'API_ERROR') and jeq(ev3[0]['data']['message'], e3['message']) and d3 is not None
              and jeq(d3.get('class'), e3['class']), {'api': ev3[0]['data'] if ev3 else None, 'detail': d3})
        ev4, d4 = py_err(d, 4, 'CodexClient.request')
        e4 = exp['api'][2]['error']
        P.add('api.model_validate_failure_recorded', one(ev4, 'API_ERROR') and d4 is not None and jeq(d4.get('class'), e4['class'])
              and jeq(d4.get('first_loc'), e4['first_loc']), {'api': ev4[0]['data'] if ev4 else None, 'detail': d4})
    elif cid == '2A-PY04':
        want = [[x['method'], x['params']] for x in exp['client_requests']]
        got = [[r.get('method'), r.get('params')] for r in reqs]
        P.add('wire.payloads_exact', jeq(got, want), got)
        errs = []
        for n, nm in ((2, 'CodexClient.thread_resume'), (3, 'CodexClient.thread_resume'), (4, 'CodexClient.thread_fork'), (5, 'CodexClient.thread_resume')):
            ev, dt = py_err(d, n, nm)
            errs.append((ev, dt))
        P.add('api.errors_mapped_exact', all(one(ev, 'API_ERROR') and dt is not None and jeq(dt.get('class'), x['error']['class']) and jeq(dt.get('code'), x['error']['code'])
                                             for (ev, dt), x in zip(errs, exp['api'][:4])), [dt for _, dt in errs])
        ev6 = api(d, '6:CodexClient.turn_start')
        P.add('api.turn_start_result', one(ev6, 'API_RESULT') and jeq((ev6[0]['data']['result'] or {}).get('turn.id'), exp['api'][4]['result']['turn.id']),
              ev6[0]['data'] if ev6 else None)
    elif cid == '2A-PY08':
        got, ok = {}, True
        for x in exp['api'][:4]:
            n = x['step']
            nm = 'CodexClient.next_notification' if n in (4, 5) else 'CodexClient.next_turn_notification'
            ev = api(d, '%d:%s' % (n, nm))
            g = ev[0]['data']['result'] if one(ev, 'API_RESULT') and isinstance(ev[0]['data']['result'], dict) else None
            got[n] = g
            ok = ok and g is not None and all(k in g and jeq(g[k], v) for k, v in x['notification'].items())
        P.add('api.notifications_exact', ok, got)
        (e8, d8), (e9, d9) = py_err(d, 8, 'CodexClient.next_turn_notification'), py_err(d, 9, 'CodexClient.next_notification')
        w8, w9 = exp['api'][4]['error'], exp['api'][5]['error']
        P.add('api.closure_wakes_both_queues', one(e8, 'API_ERROR') and one(e9, 'API_ERROR') and d8 is not None and d9 is not None
              and jeq(d8.get('class'), w8['class']) and jeq(d9.get('class'), w9['class'])
              and e8[0]['data']['message'].startswith(w8['message_prefix']) and e9[0]['data']['message'].startswith(w9['message_prefix'])
              and d8.get('object_id') is not None and jeq(d8.get('object_id'), d9.get('object_id')), {'step8': [e8[0]['data'] if e8 else None, d8], 'step9': [e9[0]['data'] if e9 else None, d9]})
        sent = {x.get('method') for x in so if 'method' in x and 'id' not in x}
        delivered = {g.get('method') for g in got.values() if g}
        P.add('api.no_fabricated_terminal', delivered <= sent and 'turn/completed' not in delivered,
              {'peer_notifications': sorted(m for m in sent if m), 'api_delivered': sorted(m for m in delivered if m)})
        # R1-F05: the OS witness is the adapter END (peer status from waitpid), ordered by mono_ns before the step-8 error.
        exit_ms = ms(p, 'EXIT_AFTER_SCRIPT')
        ae = logs['adapter'].kinds('END')
        end_mono = int(ae[0]['mono_ns']) if ae else None
        err8_mono = int(e8[0]['mono_ns']) if e8 else None
        P.add('peer.exit_after_script_witnessed', bool(exit_ms) and bool(ae) and ae[0]['data']['complete'] is True
              and jeq(ae[0]['data']['child_exit_code'], 0) and end_mono is not None and err8_mono is not None and end_mono <= err8_mono,
              {'exit_after_script': exit_ms[0]['detail'] if exit_ms else None, 'adapter_end': ae[0]['data'] if ae else None,
               'adapter_end_mono_ns': end_mono, 'step8_error_mono_ns': err8_mono, 'witness': 'END do adapter (status do peer por waitpid), mono_ns'})
    elif cid == '2A-PY15':
        ts = [r for r in reqs if r.get('method') == 'turn/start']
        want = exp['client_requests']
        ok = len(ts) == len(want) and all(isinstance(r.get('params'), dict) and all(k in r['params'] and jeq(r['params'][k], v) for k, v in x['params_subset'].items())
                                          for r, x in zip(ts, want))
        P.add('wire.turn_start_payload_subset', ok, [r.get('params') for r in ts])
        ev = [api(d, '%d:Thread.run' % n) for n in (2, 3, 4)]
        w0, w1, w2 = exp['api']
        ok0 = one(ev[0], 'API_RESULT') and jeq(ev[0][0]['data']['result'], w0['result'])
        ok1 = one(ev[1], 'API_ERROR') and jeq(ev[1][0]['data']['name'], w1['error']['class']) and jeq(ev[1][0]['data']['message'], w1['error']['message'])
        r2 = ev[2][0]['data']['result'] if one(ev[2], 'API_RESULT') and isinstance(ev[2][0]['data']['result'], dict) else {}
        ok2 = (bool(r2) and jeq(r2.get('id'), w2['result']['id']) and jeq(r2.get('status'), w2['result']['status'])
               and jeq(r2.get('final_response'), w2['result']['final_response']) and jeq(r2.get('item_ids'), w2['result']['item_ids'])
               and r2.get('usage.total.total_tokens') is None and r2.get('usage.last.total_tokens') is None)
        P.add('api.turn_results_exact', ok0 and ok1 and ok2, [x[0]['data'] if x else None for x in ev])
    elif cid == '2A-PY16':
        want = exp['client_requests']
        ts = [r for r in reqs if r.get('method') == 'turn/start']
        P.add('wire.payloads_exact', len(ts) >= 2 and jeq(ts[0].get('params'), want[0]['params']) and jeq(ts[1].get('params'), want[1]['params']),
              [r.get('params') for r in ts])
        P.add('wire.no_approval_keys', bool(ts) and isinstance(ts[0].get('params'), dict)
              and not any(k in ts[0]['params'] for k in want[0]['must_not_contain_keys']), ts[0].get('params') if ts else None)
        e2, e3, e4 = api(d, '2:Thread.turn'), api(d, '3:Thread.turn'), api(d, '4:Thread.turn')
        we = exp['api'][2]['error']
        P.add('api.turn_handles_and_error_exact', one(e2, 'API_RESULT') and jeq((e2[0]['data']['result'] or {}).get('turn_handle.id'), exp['api'][0]['result']['turn_handle.id'])
              and one(e3, 'API_RESULT') and jeq((e3[0]['data']['result'] or {}).get('turn_handle.id'), exp['api'][1]['result']['turn_handle.id'])
              and error_is(e4, we['class'], we['message']), [x[0]['data'] if x else None for x in (e2, e3, e4)])
        P.add('wire.no_request_for_blank_tool_name', len(ts) == 2, {'turn_start_requests': len(ts)})
    elif cid == '2A-PY07R':
        h0 = (detail_of(d, 'HANDLER_CALLS') or [{}])[0]
        P.add('api.handler_called_with_none', jeq(h0.get('calls'), exp['handler_calls']), h0)
        P.add('wire.no_reply_to_server_request', not any(x.get('id') == 'approve-x' for x in co), [x.get('id') for x in co])
        ev, det = py_err(d, 2, 'CodexClient.request')
        we = exp['api'][0]['error']
        P.add('api.pending_request_failed_with_handler_error', error_is(ev, we['class'], we['message']) and det is not None
              and det.get('object_id') in (h0.get('exception_object_ids') or []), {'api': ev[0]['data'] if ev else None, 'detail': det})
    elif cid == '2A-PY10R':
        py10r(P, c, logs, w, co, so)


def py10r(P, c, logs, w, co, so):
    """Same instrumented flow and predicates as SDKPY07 (admission), now with peer v2 answering a goal path or interrupt."""
    d, p = logs['driver'], logs['peer']
    c2 = co[2] if len(co) > 2 else {}
    methods = [x.get('method') for x in co]
    P.add('wire.turn_start_written', len(co) == 3 and c2.get('method') == 'turn/start' and isinstance(c2.get('id'), str)
          and bool(UUID4.match(c2['id'])) and jeq((c2.get('params') or {}).get('threadId'), 't-synthetic'), {'params': c2.get('params')})
    P.add('wire.no_turn_interrupt', 'turn/interrupt' not in methods, methods)
    P.add('wire.no_goal_path', not any(str(m).startswith('thread/goal') for m in methods), methods)
    reply = c['peer_script']['on_request'][1]['reply']
    P.add('wire.held_reply_learned_id', len(so) == 2 and jeq(so[1], dict({'id': c2.get('id')}, **reply)), so[1] if len(so) > 1 else None)
    api_ev = [e for e in d.events if e['kind'] in ('API_RESULT', 'API_ERROR', 'API_CANCELLED', 'HOOK_CLOSED')]
    kinds = [e['kind'] for e in api_ev]
    P.add('api.cancelled_error', kinds[:2] == ['API_RESULT', 'API_CANCELLED'] and api_ev[1]['data']['name'] == 'CancelledError',
          api_ev[1]['data'] if len(api_ev) > 1 else None)
    hooks = [e['data'] for e in api_ev if e['kind'] == 'HOOK_CLOSED']
    P.add('hook.late_close_turn_A_closed_true', kinds == ['API_RESULT', 'API_CANCELLED', 'HOOK_CLOSED'] and jeq(hooks, [{'turn_id': 'A', 'closed': True}]), hooks)
    acts = w.get('control_actions', [])
    held = recv_of(p, 'REQUEST_HELD')
    abort = control_t(acts, 'ABORT_NOW', 'driver')
    P.add('order.abort_after_request_capture', held is not None and abort is not None and held <= abort, {'held_recv_ns': held, 'abort_t_ns': abort})
    cancelled = recv_of(d, 'API_CANCELLED')
    release = control_t(acts, 'RELEASE_REPLY', 'peer')
    P.add('order.reply_released_after_cancel', cancelled is not None and release is not None and cancelled <= release,
          {'cancelled_recv_ns': cancelled, 'release_t_ns': release})
    seq_hook = [e['seq'] for e in d.events if e['kind'] == 'HOOK_CLOSED']
    seq_close = [e['seq'] for e in d.events if e['kind'] == 'DIAGNOSTIC' and e['data']['milestone'] == 'CLIENT_STDIN_CLOSED']
    P.add('order.absence_judged_after_hook', bool(seq_hook) and bool(seq_close) and seq_close[0] > seq_hook[0],
          {'hook_seq': seq_hook[:1], 'stdin_closed_seq': seq_close[:1]})


def control_case(P, c, logs, w):
    """2A-CTRL01: own client (no SDK) sends an unscripted turn/interrupt; peer v2 must answer, the evaluator must say MISMATCH."""
    d, a, p = logs['driver'], logs['adapter'], logs['peer']
    cl, _ = wire_lines(a.committed_bytes('stdin'))
    sl, _ = wire_lines(a.committed_bytes('stdout'))
    exp = c['expected']['server_reply_to_ctrl-2']
    un = detail_of(p, 'UNSCRIPTED')
    reply = [x['obj'] for x in sl if x['obj'] and x['obj'].get('id') == 'ctrl-2']
    P.add('control.peer_answered_unscripted', len(un) == 1 and un[0].get('method') == 'turn/interrupt' and len(ms(p, 'UNSCRIPTED_ERROR_WRITTEN')) == 1
          and jeq(reply, [dict({'id': 'ctrl-2'}, **exp)]), {'unscripted': un, 'reply': reply})
    cr = [x for x in detail_of(d, 'CONTROL_REPLY') if x.get('id') == 'ctrl-2']
    P.add('control.client_not_blocked', len(cr) == 1 and cr[0].get('reply') is not None and bool(ms(d, 'CLIENT_STDIN_CLOSED')), cr)
    methods = [x['obj'].get('method') for x in cl if x['obj']]
    P.add('wire.no_turn_interrupt', 'turn/interrupt' not in methods, methods)


# ------------------------------------------------------------------------------------------------ outcome

def _signum(name):
    return signal.Signals[name].value


def capture_extra(case, logs, w):
    """Capture/identity checks beyond observer.reconcile: loaded-code witness, peer v2 replay (F4-05) and SDK-side returncode."""
    out = []
    maps = w.get('maps')
    if not maps or not maps.get('ok'):
        out.append('loaded-code witness missing or with unknown mapping: %s' % ((maps or {}).get('error') or len((maps or {}).get('unknown', []))))
    c = CASES_DEF[case]
    if 'peer_script' in c['case_input']:
        rep = peer_replay_check(c['case_input'], logs)
        if rep['status'] == 'MISMATCH':
            out.append('peer v2 stdout differs from the replay of the frozen peer_script (F4-05): %s' % rep)
    if c['kind'] == 'SDK' and c['language'] == 'python':
        d, a = logs['driver'], logs['adapter']
        closed = d.milestones('SDK_CLIENT_CLOSED')
        ae = a.kinds('END')
        if not closed:
            out.append('SDK_CLIENT_CLOSED missing: adapter reap by the SDK not witnessed')
        elif ae and ae[0]['data']['complete']:
            ec = ae[0]['data']
            want = ec['child_exit_code'] if ec['child_exit_code'] is not None else -_signum(ec['child_signal'])
            if not jeq(closed[0]['detail'].get('returncode'), want):
                out.append('SDK-observed adapter returncode %r differs from adapter declaration %r' % (closed[0]['detail'].get('returncode'), want))
    return out


def capture_form(case, verdict, extra, logs=None, w=None):
    """Observer verdict + extra capture checks -> capture form (R3-10, R3-F02, R4-03)."""
    c = CASES_DEF[case]
    notes = []
    if verdict == 'NO_CHILD' and logs is not None:
        split = frameless_form(verdict, (w or {}).get('exec_witness'), spawn_failure(logs['driver']))
        if split != verdict:
            notes.append('R4-03: frameless capture classified %s by the exec witness' % split)
        verdict = split
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


def evaluate(case, logs, verdict, reasons, witness, fixture=None):
    c = CASES_DEF[case]
    extra = capture_extra(case, logs, witness)
    form, notes = capture_form(case, verdict, extra, logs, witness)
    P = Preds(case)
    error = None
    try:
        ok, det = case_input_witness(c, logs, witness)
        P.add(CAPTURE_PRED, ok, det)
        if c['kind'] == 'CONTROL':
            control_case(P, c, logs, witness)
        elif c['language'] == 'typescript':
            ts_case(P, c, logs, witness, form)
        else:
            py_case(P, c, logs, witness)
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
    facts = {'client_fact_only': c['kind'] == 'SDK', 'control_slot': c['kind'] == 'CONTROL', 'native_terminal_or_remote_stop_claimed': False,
             'parity_receipt': None, 'functional_receipts': 0, 'evaluator_version': VERSION}
    return {'kind': 'SDK_CASE_ACCEPTANCE_R4' if c['kind'] == 'SDK' else 'CONTROL_CASE_ACCEPTANCE_R4', 'evaluator': EVALUATOR,
            'evaluator_version': VERSION, 'case': case, 'outcome': outcome, 'composition_rule': rule, 'capture_verdict': verdict,
            'capture_form': form, 'capture_reasons': list(reasons) + extra + notes, 'predicates': items, 'implicit_predicates': implicit,
            'predicate_ids_match_plan': [x['id'] for x in items] == c['predicates'],
            'failed_predicates': [x['id'] for x in items if not x['ok']],
            'informational_only': form == 'INVALID_CAPTURE', 'known_bad': c['known_bad'], 'facts': facts, 'functional_receipts': 0}


# ------------------------------------------------------------------------------------- offline re-evaluation (R3-04)

def _load_observer():
    spec = importlib.util.spec_from_file_location('cvg_observer_reeval', HERE / 'observer.py')
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def _norm(items):
    return [[x['id'], x['ok'], json.dumps(x.get('detail'), sort_keys=True, ensure_ascii=False)] for x in items]


def _compare(acc, doc):
    a_items, d_items = _norm(acc['predicates']), _norm(doc['predicates'])
    diff = [{'reevaluated': x, 'document': y} for x, y in zip(a_items, d_items) if x != y]
    if len(a_items) != len(d_items):
        diff.append({'count': [len(a_items), len(d_items)]})
    same_outcome = acc['outcome'] == doc['outcome'] and acc['capture_verdict'] == doc['capture_verdict']
    return diff, same_outcome


def _judge(ev):
    """Rebuild the RoleLogs from the preserved raw frames and recv_ns of one case directory and judge them again."""
    obs = _load_observer()
    result = json.loads((ev / 'result.json').read_text())
    cfg = json.loads((ev / 'profile' / 'adapter-config.json').read_text())
    files = json.loads((ev / 'profile-manifest.json').read_text())['files']
    lang = cfg['language']
    src = {'python': {'driver': 'python-driver.py', 'adapter': 'adapter-python.py', 'peer': 'fixture-rpc.py'},
           'typescript': {'driver': 'ts-driver.mjs', 'adapter': 'adapter-typescript', 'peer': 'fixture-cli.mjs'}}[lang]
    if cfg['case'] == '2AC-CTRL01':
        src = dict(src, driver='control-client.py')
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
    wire = None
    fx = CASES_DEF[cfg['case']].get('fixture') or {}
    if lang == 'typescript' and 'JSONL' in fx:
        # Frozen-order reference, the same as the service under the freeze r4 (F4-02).
        wire = {'stdout': ''.join((ln if isinstance(ln, str) else json.dumps(ln, separators=(',', ':'), ensure_ascii=False)) + '\n'
                                  for ln in fx['JSONL']).encode(), 'stderr': fx['stderr'].encode()}
    elif lang == 'typescript' and 'stdout_chunks_hex' in fx:
        wire = {'stdout': b''.join(bytes.fromhex(h) for h in fx['stdout_chunks_hex']), 'stderr': fx['stderr'].encode()}
    verdict, reasons, _ = obs.reconcile(logs, lang, {'checks': result['os_checks']}, wire, result.get('signal_sent_ns'))
    host = result.get('role_host', {})
    witness = {'os_checks': result['os_checks'], 'maps': result.get('maps_witness'), 'adapter_environ': result.get('adapter_environ'),
               'adapter_cmdline': (host.get('adapter') or {}).get('cmdline'), 'adapter_pid': (host.get('adapter') or {}).get('host_pid'),
               'control_actions': [x for x in result['actions'] if x['action'] == 'CONTROL'], 'signal_sent_ns': result.get('signal_sent_ns'),
               'step_witness': result.get('step_witness', []), 'role_mapped': sorted(host), 'exec_witness': result.get('exec_witness'),
               'case_input_sha256_supervisor': result.get('case_input_sha256_supervisor'),
               'case_input_sha256_recomputed': hashlib.sha256(json.dumps(cfg['case_input'], ensure_ascii=False, separators=(',', ':')).encode('utf-8')).hexdigest(),
               'timed_out': result.get('timed_out', not result['os_checks'].get('supervisor_bound_not_hit', True))}
    return cfg['case'], verdict, json.loads(json.dumps(evaluate(cfg['case'], logs, verdict, reasons, witness), ensure_ascii=False))


def _service_doc(ev):
    if not (ev / 'acceptance.json').is_file():
        raise SystemExit('reevaluate: no service acceptance.json in %s; nothing to compare (exit 1)' % ev)
    service = json.loads((ev / 'acceptance.json').read_text())
    if service.get('evaluator_version') != SERVICE_VERSION:
        raise SystemExit('reevaluate: service acceptance.json in %s has evaluator_version %r, expected %r (exit 1)'
                         % (ev, service.get('evaluator_version'), SERVICE_VERSION))
    return service


def reevaluate(case_dir):
    """See the module docstring: compare with acceptance-r3_1.json when present, else with the service acceptance.json.
    Raises SystemExit (exit 1, explicit message) without the service document or with a document of another version."""
    ev = Path(case_dir)
    service = _service_doc(ev)
    case, verdict, acc = _judge(ev)
    target, name = service, 'acceptance.json'
    if (ev / R31_DOC).is_file():
        target, name = json.loads((ev / R31_DOC).read_text()), R31_DOC
        if target.get('evaluator_version') != VERSION:
            raise SystemExit('reevaluate: %s in %s has evaluator_version %r, expected %r (exit 1)' % (R31_DOC, ev, target.get('evaluator_version'), VERSION))
    diff, same = _compare(acc, target)
    vs_service, same_service = _compare(acc, service)
    return {'case': case, 'verdict': verdict, 'outcome': acc['outcome'], 'compared_with': name, 'document_outcome': target['outcome'],
            'predicate_level_equal': not diff, 'outcome_equal': same, 'differences': diff[:10],
            'service_outcome': service['outcome'], 'differences_vs_service': [d['reevaluated'][0] if 'reevaluated' in d else d for d in vs_service],
            'outcome_equal_to_service': same_service, 'evaluator_version': VERSION}


def reevaluate_write(case_dir):
    """Write acceptance-r3_1.json (refuses to overwrite) with the differences against the service document inside it."""
    ev = Path(case_dir)
    service = _service_doc(ev)
    case, verdict, acc = _judge(ev)
    vs_service, same_service = _compare(acc, service)
    acc['service_document'] = {'path': 'acceptance.json', 'evaluator_version': SERVICE_VERSION, 'outcome': service['outcome'],
                               'differences': vs_service, 'outcome_equal': same_service, 'rewritten': False}
    with open(ev / R31_DOC, 'x') as f:
        f.write(json.dumps(acc, ensure_ascii=False, indent=2) + '\n')
    return {'case': case, 'outcome': acc['outcome'], 'service_outcome': service['outcome'], 'outcome_equal_to_service': same_service,
            'differences_vs_service': [d['reevaluated'][0] if 'reevaluated' in d else d for d in vs_service], 'written': R31_DOC}


if __name__ == '__main__':
    if len(sys.argv) == 3 and sys.argv[1] == 'reevaluate':
        r = reevaluate(sys.argv[2])
        print(json.dumps(r, ensure_ascii=False, indent=1))
        sys.exit(0 if r['predicate_level_equal'] and r['outcome_equal'] else 1)
    if len(sys.argv) == 3 and sys.argv[1] == 'reevaluate-write':
        print(json.dumps(reevaluate_write(sys.argv[2]), ensure_ascii=False, indent=1))
        sys.exit(0)
    print(__doc__)
    sys.exit(2)
