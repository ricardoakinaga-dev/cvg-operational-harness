"""Host-side evaluator of DX100-G02:IMPLEMENT-AND-ADMIT-SDK-DISTRIBUTED-PROFILE-DP-1 (acceptance-dp1).

Independent of the published SDK, of the wrappers and of the role-side encoders: it reads the observer RoleLog of the driver (frames,
milestones and BLOB relays rebuilt by the observer), the observer verdict of the driver_only topology and the supervisor witnesses
(cgroup limits, net namespace, staging and fixture manifests, maps). Predicate ids, classes and oracles are the frozen table of
inputs/spec-dp/cases-dp-1.json (sha bound, never reclassified: EDP-01); the outcome follows the frozen composition (first rule that
applies decides): 1 capture form INVALID_CAPTURE, 2 form not accepted -> MISMATCH, 3 evaluator failed -> INVALID_CAPTURE,
4 sanity/capture failure -> INVALID_CAPTURE, 5 order_unilateral -> INCONCLUSIVE, 6 only client failures -> MISMATCH,
7 PASS_CLIENT_OBSERVATION. Every JSON comparison is strict by type (jeq).

Deltas: EDP-02 oracles of the new predicates; EDP-03 forms (erratum DP-SPEC/R2-F01: a complete driver_only capture is the base of
PASS, PASS_DECLARED_TERMINATION and REAL_CLI_KEYLESS, each valid only where the case declares it; the termination of wrappers,
children and the published binary is judged by predicates, never by the form); EDP-05 build_link NO_BUILD_LINK_DECLARED in every
non-CONTROL acceptance; EDP-06 no functional receipt nor parity credit; EDP-07 NOT_REACHED adds no failure by itself (the outcome
comes from the first divergence) and loader denial or driver deadline is INVALID_CAPTURE; EDP-08 service limits of DDP-05.
DP-PK09A (ARTIFACT_CHECK) is judged by evaluate_artifact(), without service.

Usage: python3 -I -B acceptance.py reevaluate <case-dir>
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
G02 = UNIT_DIR.parent
SPEC = UNIT_DIR / 'inputs' / 'spec-dp' / 'cases-dp-1.json'
CASES_SHA = 'daafcb4e53e06b284e92f94f221bfd1653fff44a697234051ae8d2da3e60829b'
SOURCE_FREEZE = UNIT_DIR / 'source-freeze-dp1.json'
FROZEN_PLAN = UNIT_DIR / 'case-plan-dp1.json'
VERSION = 'acceptance-dp1'
EVALUATOR = VERSION + ' (DX100-G02 distributed profile DP-1; frozen predicate table and composition of cases-dp-1.json; EDP-01..EDP-08; erratum DP-SPEC/R2-F01)'
CAPTURE_CLASSES = ('peer_or_capture_sanity', 'capture_order_or_cleanup')
CAPTURE_PRED = 'capture.case_input_frozen_bytes'
NBL = 'NO_BUILD_LINK_DECLARED'
CRED_VARS = ('OPENAI_API_KEY', 'CODEX_API_KEY', 'GH_TOKEN', 'GITHUB_TOKEN', 'ANTHROPIC_API_KEY', 'AZURE_OPENAI_API_KEY')
DRIVER_ONLY_FORMS = ('PASS', 'PASS_DECLARED_TERMINATION', 'REAL_CLI_KEYLESS')


def _load_spec():
    raw = SPEC.read_bytes()
    if hashlib.sha256(raw).hexdigest() != CASES_SHA:
        raise SystemExit('cases-dp-1.json drifted from the approved spec')
    return json.loads(raw)


_DOC = _load_spec()
CASES_DEF = {c['id']: c for c in _DOC['cases']}
TABLE = _DOC['predicate_table']
COMPOSITION = _DOC['composition']


def _stage():
    spec = importlib.util.spec_from_file_location('cvg_stage_dp1_acc', HERE / 'stage.py')
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


STG = _stage()


def class_of(pid):
    return TABLE[pid]['class']


def plan(case):
    c = CASES_DEF[case]
    return {'accepted_capture_forms': c['accepted_capture_forms'], 'predicates': c['predicates'],
            'classes': {p: class_of(p) for p in c['predicates']}, 'known_bad': c['known_bad'],
            'inconclusive_on_deadline': c.get('inconclusive_on_deadline', False), 'composition': 'inputs/spec-dp/cases-dp-1.json#/composition',
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


def sha(b):
    return hashlib.sha256(b).hexdigest()


def jeq(a, b):
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


def api_step(d, step):
    pre = '%d:' % step
    return [e for e in d.events if e['kind'] in ('API_RESULT', 'API_ERROR') and e['data']['api'].startswith(pre)]


def ms(d, name):
    return [m['detail'] for m in d.milestones(name)]


def calls(c):
    return c['case_input'].get('sdk_calls', [])


def run_steps(c):
    """wrapper.run steps by `as`, and the SDK run steps in order."""
    wr = {s['as']: s for s in calls(c) if s['api'] == 'wrapper.run'}
    runs = [s for s in calls(c) if s['api'] == 'run']
    return wr, runs


def program_at(c, step):
    """Program in force at a spawn-causing step: the last child.program before it, else the child_script."""
    prog = None
    for s in calls(c):
        if s['step'] >= step:
            break
        if s['api'] == 'child.program':
            prog = {'id': s['id'], 'program': s['program']}
    if prog is not None:
        return prog
    cs = c['case_input'].get('child_script') or {}
    p = {}
    if 'exit_code' in cs:
        p['exit_code'] = cs['exit_code']
    if cs.get('read_stdin') is True:
        p['read_stdin'] = True
    if cs.get('stdout_jsonl'):
        p['stdout_jsonl'] = cs['stdout_jsonl']
    p.setdefault('exit_code', 0)
    return {'id': 'child_script' if cs else 'default', 'program': p}


def records(d, step):
    return d.blob_json('child-records:%s' % step, None)


def text(d, name):
    return d.blobs.get(name, b'').decode('utf-8', 'replace')


def wrapper_results(d):
    return {r['as']: r for r in ms(d, 'WRAPPER_RESULT')}


def expected_declared_termination(program, rec):
    if 'self_signal' in program:
        return {'self_signal': program['self_signal']}
    if program.get('ready_barrier') or 'on_signal' in program:
        on = program.get('on_signal', {})
        if rec.get('no_signal'):
            return {'exit_code': program.get('no_signal_exit_code', 97)}
        sigs = rec.get('signals') or []
        hit = [s for s in sigs if s in on]
        return {'exit_code': on[hit[0]]['exit_code']} if hit else None
    return {'exit_code': program.get('exit_code', 0)}


def spawned_expected(c, as_):
    w = (c['expected'].get('wrappers') or {}).get(as_)
    if w is not None and w.get('child_spawned') is False:
        return False
    return True


def env_matches(env, want):
    bad = {}
    for k, v in want.items():
        got = env.get(k) if isinstance(env, dict) else None
        if not jeq(got, v):
            bad[k] = {'want': v, 'got': got}
    return bad


# ------------------------------------------------------------------------------------------------ predicates

def case_input_witness(c, logs, w):
    frozen = c['case_input_sha256']
    d = logs['driver']
    ok = (w.get('case_input_sha256_supervisor') == frozen and w.get('case_input_sha256_recomputed') == frozen and d.case_input_sha256 == frozen)
    return ok, {'frozen': frozen, 'supervisor': w.get('case_input_sha256_supervisor'), 'evaluator': w.get('case_input_sha256_recomputed'),
                'driver': d.case_input_sha256, 'adapter': 'NOT_APPLICABLE (driver_only)', 'peer': 'NOT_APPLICABLE (driver_only)'}


def stage_bound(c, d, w):
    sw = w.get('stage_witness') or {}
    arch = sw.get('archives') or {}
    archives_ok = sorted(arch) == sorted(STG.LAYOUT) and all(arch[a] == STG.ARCHIVES[a]['observed']['sha256'] for a in arch)
    copy_problems = [p for p in (w.get('fixture_problems_host') or []) if isinstance(p, dict) and str(p.get('want', {}).get('type')) == 'file'
                     and any(e['path'] == p.get('path') and e['kind'] == 'copy_of_member' for t in c['case_input'].get('trees', []) for e in t['entries'])]
    dm = d.blob_json('dist-manifest')
    uses_dist = any((s.get('module') or s.get('script') or '').startswith('/dist/') for s in calls(c))
    dist_ok = (not uses_dist) or dm == {'/dist/' + k: v for k, v in STG.expected_dist().items()}
    ok = archives_ok and sw.get('dist_manifest_equal') is True and not copy_problems and dist_ok
    return ok, {'archives_equal_ledger': archives_ok, 'dist_host_equal_metadata': sw.get('dist_manifest_equal'),
                'copy_of_member_problems': copy_problems, 'dist_sandbox_checked': uses_dist, 'dist_sandbox_equal': dist_ok}


def fixture_exact(c, d, w):
    trees = c['case_input'].get('trees', [])
    host = w.get('fixture_problems_host')
    listing = d.blob_json('fixture-listing', [])
    sandbox = STG.check_fixture(trees, STG.sandbox_listing_to_manifest(listing))
    ok = host == [] and sandbox == []
    return ok, {'entries': sum(len(t['entries']) for t in trees), 'host_problems': (host or [])[:5], 'sandbox_problems': sandbox[:5]}


def keyless(c, d, w):
    kw = (ms(d, 'KEYLESS_WITNESS') or [{}])[0]
    envs = [s['env'] for s in calls(c) if s['api'] == 'wrapper.run'] + [((s.get('options') or {}).get('env') or {}) for s in calls(c) if s['api'] == 'new Codex']
    cred = sorted({k for e in envs for k in e if k in CRED_VARS})
    ok = (kw.get('net_devices') == ['lo'] and kw.get('codex_home_present') is False and kw.get('credential_vars_in_driver_env') == [] and not cred
          and w.get('driver_net_ns') is not None and w.get('driver_net_ns') != w.get('host_net_ns'))
    return ok, {'keyless_witness': kw, 'credential_vars_in_case_env': cred, 'driver_net_ns_differs': w.get('driver_net_ns') != w.get('host_net_ns')}


def limits(w):
    lim = w.get('cgroup_limits') or {}
    q = (lim.get('cpu.max') or '').split()
    ok = w.get('limits_ok') is True and lim.get('memory.max') == '1073741824' and lim.get('pids.max') == '256' and len(q) == 2 and q[0] == q[1]
    return ok, lim


def no_leftover(d):
    left = ms(d, 'LEFTOVER')
    bad = [x for x in left if x.get('pids') != []]
    return not bad and bool(left), {'witnesses': len(left), 'with_processes': bad[:5]}


def program_followed(c, d):
    problems = []
    wr, _ = run_steps(c)
    by_step = {s['step']: s for s in calls(c)}
    for cr in ms(d, 'CHILD_RUN'):
        step = cr['step']
        want = program_at(c, step)
        recs = records(d, step)
        s = by_step.get(step)
        if recs is None:
            problems.append({'step': step, 'problem': 'no child-records relay'})
            continue
        expect_spawn = spawned_expected(c, s['as']) if s and s['api'] == 'wrapper.run' else True
        if cr.get('program_id') != want['id']:
            problems.append({'step': step, 'problem': 'program in force differs', 'want': want['id'], 'got': cr.get('program_id')})
        if not expect_spawn:
            if recs:
                problems.append({'step': step, 'problem': 'record of a child that must not run'})
            continue
        if len(recs) != 1:
            problems.append({'step': step, 'problem': 'expected one child record', 'got': len(recs)})
            continue
        r = recs[0]
        p = want['program']
        if r.get('program_id') != want['id']:
            problems.append({'step': step, 'problem': 'record program id', 'got': r.get('program_id')})
        if (p.get('ready_barrier') or 'on_signal' in p) and r.get('ready') is not True:
            problems.append({'step': step, 'problem': 'CHILD_READY not recorded'})
        dt = expected_declared_termination(p, r)
        if dt is None or not jeq(r.get('declared_termination'), dt):
            problems.append({'step': step, 'problem': 'declared termination', 'want': dt, 'got': r.get('declared_termination')})
    runs = [s['step'] for s in calls(c) if s['api'] in ('wrapper.run', 'run')]
    seen = sorted(x['step'] for x in ms(d, 'CHILD_RUN'))
    if seen != runs:
        problems.append({'problem': 'CHILD_RUN steps differ from the spawn-causing steps', 'want': runs, 'got': seen})
    return not problems, {'problems': problems[:8], 'runs': len(seen)}


def steps_exact(c, d):
    res = []
    ok = True
    for item in c['expected'].get('api', []):
        evs = api_step(d, item['step'])
        if len(evs) != 1:
            ok = False
            res.append({'step': item['step'], 'problem': 'events %d' % len(evs)})
            continue
        e = evs[0]
        if 'error' in item:
            good = e['kind'] == 'API_ERROR' and e['data']['name'] == item['error']['name'] and e['data']['message'] == item['error']['message']
        else:
            good = e['kind'] == 'API_RESULT' and jeq(e['data']['result'], item['result'])
        ok = ok and good
        res.append({'step': item['step'], 'ok': good, 'kind': e['kind'], 'got': {k: e['data'].get(k) for k in ('name', 'message', 'result') if k in e['data']}})
    not_reached = ms(d, 'NOT_REACHED')
    return ok, {'items': res, 'not_reached': not_reached[:5]}


def probes_exact(c, d):
    got = {}
    for p in ms(d, 'PROBE'):
        got.setdefault(p['id'], []).append(p)
    res, ok = {}, True
    for pid, want in (c['expected'].get('probes') or {}).items():
        g = got.get(pid, [])
        good = len(g) == 1 and g[0]['present'] is True and jeq(g[0]['value'], want)
        ok = ok and good
        res[pid] = {'ok': good, 'got': g[0]['value'] if g else None}
    for pid, other in (c['expected'].get('not_equal') or {}).items():
        g = got.get(pid, [])
        good = len(g) == 1 and not jeq(g[0]['value'], other)
        ok = ok and good
        res['not_equal:' + pid] = {'ok': good}
    return ok, res


def shim_scoped(c, d):
    problems = []
    applies = [x for x in ms(d, 'SHIM_SCOPE') if x['action'] == 'apply']
    restores = [x for x in ms(d, 'SHIM_SCOPE') if x['action'] == 'restore']
    want_apply = [(s['step'], s['platform'], s['arch']) for s in calls(c) if s['api'] == 'shim.platform']
    want_restore = [s['step'] for s in calls(c) if s['api'] == 'shim.restore']
    if [(a['step'], a['platform'], a['arch']) for a in applies] != want_apply or any(a['observed'] != [a['platform'], a['arch']] for a in applies):
        problems.append('driver shim applications differ')
    if [r['step'] for r in restores] != want_restore or any(r['observed'] != ['linux', 'x64'] for r in restores):
        problems.append('driver shim restorations differ')
    for s in calls(c):
        if s['api'] == 'wrapper.run' and s.get('preload_shim'):
            rec = d.blob_json('shim:%d' % s['step'])
            if not (isinstance(rec, dict) and rec.get('applied') is True and rec.get('platform') == s['preload_shim']['platform']
                    and rec.get('arch') == s['preload_shim']['arch'] and rec.get('real') == {'platform': 'linux', 'arch': 'x64'}):
                problems.append('preload shim of step %d' % s['step'])
    return not problems, {'problems': problems, 'driver_shims': len(want_apply)}


def spawn_none(c, d):
    samples = ms(d, 'PROC_SAMPLE')
    bad = [x for x in samples if x['pids'] != []]
    runs = ms(d, 'CHILD_RUN')
    recs = [k for k in d.blobs if k.startswith('child-records:') and d.blob_json(k)]
    ok = bool(samples) and len(samples) == len(calls(c)) and not bad and not runs and not recs
    return ok, {'samples': len(samples), 'with_processes': bad[:5], 'child_runs': len(runs), 'records': recs}


def argv_env(c, d):
    problems = []
    exp = c['expected']
    wr, runs = run_steps(c)
    ch = exp.get('children')
    if isinstance(ch, list):
        if len(ch) != len(runs):
            problems.append('children expected %d, runs %d' % (len(ch), len(runs)))
        for want, s in zip(ch, runs):
            recs = records(d, s['step']) or []
            if len(recs) != 1:
                problems.append({'step': s['step'], 'records': len(recs)})
                continue
            r = recs[0]
            if not jeq(r.get('argv_tail'), want['argv_tail']):
                problems.append({'step': s['step'], 'argv_tail': r.get('argv_tail')})
            if 'stdin' in want and not jeq(r.get('stdin'), want['stdin']):
                problems.append({'step': s['step'], 'stdin': r.get('stdin')})
            bad = env_matches(r.get('env'), want.get('env', {}))
            if bad:
                problems.append({'step': s['step'], 'env': bad})
    elif isinstance(ch, dict):
        for as_, want_env in ch.items():
            s = wr.get(as_)
            recs = records(d, s['step']) if s else None
            if not recs or len(recs) != 1:
                problems.append({'as': as_, 'records': None if recs is None else len(recs)})
                continue
            bad = env_matches(recs[0].get('env'), want_env)
            if bad:
                problems.append({'as': as_, 'env': bad})
    for as_, want in (exp.get('wrappers') or {}).items():
        if 'child_argv_tail' not in want and 'child_env' not in want:
            continue
        s = wr[as_]
        recs = records(d, s['step']) or []
        if len(recs) != 1:
            problems.append({'as': as_, 'records': len(recs)})
            continue
        if 'child_argv_tail' in want and not jeq(recs[0].get('argv_tail'), want['child_argv_tail']):
            problems.append({'as': as_, 'argv_tail': recs[0].get('argv_tail')})
        if 'child_env' in want:
            bad = env_matches(recs[0].get('env'), want['child_env'])
            if bad:
                problems.append({'as': as_, 'env': bad})
    return not problems, {'problems': problems[:8]}


def executed_path(c, d):
    problems = []
    exp = c['expected']
    wr, runs = run_steps(c)
    ch = exp.get('children')
    if isinstance(ch, list):
        for want, s in zip(ch, runs):
            recs = records(d, s['step']) or []
            if 'executed_path' in want and (len(recs) != 1 or recs[0].get('exec_path') != want['executed_path']):
                problems.append({'step': s['step'], 'got': [r.get('exec_path') for r in recs]})
    for as_, want in (exp.get('wrappers') or {}).items():
        s = wr[as_]
        recs = records(d, s['step'])
        if want.get('child_spawned') is False:
            if recs:
                problems.append({'as': as_, 'problem': 'child ran', 'got': [r.get('exec_path') for r in recs]})
        elif 'child_executed_path' in want:
            if not recs or len(recs) != 1 or recs[0].get('exec_path') != want['child_executed_path']:
                problems.append({'as': as_, 'got': [r.get('exec_path') for r in (recs or [])]})
    return not problems, {'problems': problems[:8]}


def exit_mirror(c, d):
    problems = []
    got = wrapper_results(d)
    exp = c['expected']
    wants = {as_: {'exit_code': w['exit_code'], 'signal': w['signal']} for as_, w in (exp.get('wrappers') or {}).items() if 'exit_code' in w}
    for as_, code in (exp.get('wrappers_exit') or {}).items():
        wants[as_] = {'exit_code': code, 'signal': None}
    for as_, w in wants.items():
        g = got.get(as_)
        if g is None or not (jeq(g['exit_code'], w['exit_code']) and jeq(g['signal'], w['signal'])):
            problems.append({'as': as_, 'want': w, 'got': None if g is None else {'exit_code': g['exit_code'], 'signal': g['signal']}})
    return not problems, {'checked': len(wants), 'problems': problems[:8]}


def stream_texts(c, d, key, stream):
    problems = []
    wr, _ = run_steps(c)
    n = 0
    for as_, want in (c['expected'].get('wrappers') or {}).items():
        if key not in want:
            continue
        t = text(d, '%s:%d' % (stream, wr[as_]['step']))
        for needle in want[key]:
            n += 1
            present = needle in t
            if present != (key != 'stderr_not_contains'):
                problems.append({'as': as_, 'text': needle, 'present': present})
    return not problems, {'checked': n, 'problems': problems[:8]}


def signals_exact(c, d):
    problems = []
    wr, _ = run_steps(c)
    n = 0
    for as_, want in (c['expected'].get('wrappers') or {}).items():
        if 'child_received' not in want:
            continue
        n += 1
        recs = records(d, wr[as_]['step']) or []
        if len(recs) != 1 or recs[0].get('signals') != want['child_received'] or recs[0].get('no_signal') is not False:
            problems.append({'as': as_, 'got': [{'signals': r.get('signals'), 'no_signal': r.get('no_signal')} for r in recs]})
    return not problems and n > 0, {'checked': n, 'problems': problems}


def delivery(c, d):
    problems = []
    order = [(e['kind'], e['data'].get('milestone'), e['data'].get('detail')) for e in d.events if e['kind'] == 'DIAGNOSTIC']
    for s in calls(c):
        if not s.get('send_signal'):
            continue
        idx_run = [i for i, (_, m, det) in enumerate(order) if m == 'CHILD_RUN' and det.get('step') == s['step']]
        idx_sent = [i for i, (_, m, det) in enumerate(order) if m == 'SIGNAL_SENT' and det.get('step') == s['step']]
        idx_res = [i for i, (_, m, det) in enumerate(order) if m == 'WRAPPER_RESULT' and det.get('step') == s['step']]
        if not (len(idx_run) == len(idx_sent) == len(idx_res) == 1 and idx_run[0] < idx_sent[0] < idx_res[0]):
            problems.append({'step': s['step'], 'problem': 'order or presence'})
            continue
        det = order[idx_sent[0]][2]
        if not (det.get('sent') is True and det.get('kill_ok') is True and det.get('signal') == s['send_signal']['signal'] and det.get('ready_marker')
                and (det.get('sigcgt_bit_seen') is True or det.get('waited_ms', 0) >= 1000)):
            problems.append({'step': s['step'], 'detail': det})
    return not problems, {'problems': problems}


def own_code_only(c, d, w):
    ci = c['case_input']
    copies = [e for t in ci.get('trees', []) for e in t['entries'] if e['kind'] == 'copy_of_member']
    loader = w.get('loader_json') or {}
    ctrl = [e for t in ci.get('trees', []) for e in t['entries'] if e['kind'] == 'copy_of_profile']
    own_sha = STG.sha_bytes((UNIT_DIR / 'node' / 'dp-control-wrapper.mjs').read_bytes())
    host = w.get('fixture_manifest_host') or {}
    ok = (not copies and loader.get('sdk_entries') == {} and not any('/dist/' in json.dumps(s) for s in calls(c))
          and len(ctrl) == 1 and (host.get(ctrl[0]['path']) or {}).get('sha256') == own_sha and not any(e['kind'] == 'API_RESULT' for e in d.events))
    return ok, {'copies_of_cache': len(copies), 'sdk_entries': loader.get('sdk_entries'), 'control_wrapper_sha256': own_sha}


def dp_case(P, c, logs, w, form):
    d = logs['driver']
    if P.need('stage.bound_to_cache'):
        P.add('stage.bound_to_cache', *stage_bound(c, d, w))
    if P.need('fixture.tree_exact'):
        P.add('fixture.tree_exact', *fixture_exact(c, d, w))
    if P.need('keyless.no_network_no_credential'):
        P.add('keyless.no_network_no_credential', *keyless(c, d, w))
    if P.need('service.limits_declared'):
        P.add('service.limits_declared', *limits(w))
    if P.need('wrap.no_leftover_process'):
        P.add('wrap.no_leftover_process', *no_leftover(d))
    if P.need('child.program_followed'):
        P.add('child.program_followed', *program_followed(c, d))
    if P.need('api.dp_steps_exact'):
        P.add('api.dp_steps_exact', *steps_exact(c, d))
    if P.need('probe.dp_values_exact'):
        P.add('probe.dp_values_exact', *probes_exact(c, d))
    if P.need('shim.platform_scoped'):
        P.add('shim.platform_scoped', *shim_scoped(c, d))
    if P.need('spawn.none'):
        P.add('spawn.none', *spawn_none(c, d))
    if P.need('child.argv_env_exact'):
        P.add('child.argv_env_exact', *argv_env(c, d))
    if P.need('child.executed_path_exact'):
        P.add('child.executed_path_exact', *executed_path(c, d))
    if P.need('wrap.exit_mirror_exact'):
        P.add('wrap.exit_mirror_exact', *exit_mirror(c, d))
    if P.need('wrap.stderr_contains'):
        P.add('wrap.stderr_contains', *stream_texts(c, d, 'stderr_contains', 'stderr'))
    if P.need('wrap.stderr_not_contains'):
        P.add('wrap.stderr_not_contains', *stream_texts(c, d, 'stderr_not_contains', 'stderr'))
    if P.need('wrap.stdout_contains'):
        P.add('wrap.stdout_contains', *stream_texts(c, d, 'stdout_contains', 'stdout'))
    if P.need('child.signals_received_exact'):
        P.add('child.signals_received_exact', *signals_exact(c, d))
    if P.need('signal.delivery_witnessed'):
        P.add('signal.delivery_witnessed', *delivery(c, d))
    if P.need('control.own_code_only'):
        P.add('control.own_code_only', *own_code_only(c, d, w))


# ------------------------------------------------------------------------------------------------ outcome

def capture_extra(case, logs, w):
    out = []
    maps = w.get('maps')
    if not maps or not maps.get('ok'):
        out.append('loaded-code witness missing or with unknown mapping: %s' % ((maps or {}).get('error') or len((maps or {}).get('unknown', []))))
    if any('ERR_CVG_LOADER_DENIED' in e['data']['reason'] for e in logs['driver'].kinds('INVALID')):
        out.append('loader denial (EDP-07)')
    return out


def capture_form(case, verdict, extra):
    """Erratum DP-SPEC/R2-F01: a complete driver_only capture (observer PASS) takes the driver_only form the case declares."""
    c = CASES_DEF[case]
    notes = []
    if verdict != 'PASS' or extra:
        return 'INVALID_CAPTURE', notes
    declared = [f for f in c['accepted_capture_forms'] if f in DRIVER_ONLY_FORMS]
    form = declared[0] if declared else 'PASS'
    notes.append('driver_only base -> %s' % form)
    return form, notes


def compose(c, form, items, evaluation_completed, timeout):
    if form == 'INVALID_CAPTURE':
        return ('INCONCLUSIVE' if (c.get('inconclusive_on_deadline') and timeout) else 'INVALID_CAPTURE'), 1
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


def _document(c, case, verdict, form, items, error, missing, reasons, timeout):
    evaluation_completed = error is None and not missing
    outcome, rule = compose(c, form, items, evaluation_completed, timeout)
    implicit = {'evaluation_completed': {'ok': evaluation_completed, 'error': error, 'missing': missing},
                'capture_form_accepted': {'ok': form in c['accepted_capture_forms'], 'form': form, 'accepted': c['accepted_capture_forms']}}
    facts = {'client_fact_only': True, 'parity_receipt': None, 'functional_receipts': 0, 'evaluator_version': VERSION, 'topology': 'driver_only'}
    doc = {'kind': 'DP1_CASE_ACCEPTANCE', 'evaluator': EVALUATOR, 'evaluator_version': VERSION, 'case': case, 'outcome': outcome,
           'composition_rule': rule, 'capture_verdict': verdict, 'capture_form': form, 'capture_reasons': list(reasons),
           'predicates': items, 'implicit_predicates': implicit, 'predicate_ids_match_plan': [x['id'] for x in items] == c['predicates'],
           'failed_predicates': [x['id'] for x in items if not x['ok']], 'informational_only': form == 'INVALID_CAPTURE',
           'known_bad': c['known_bad'], 'facts': facts, 'functional_receipts': 0, 'parity_credit': 0}
    if c['kind'] != 'CONTROL':
        doc['build_link'] = NBL  # EDP-05
    return doc


def evaluate(case, logs, verdict, reasons, witness):
    c = CASES_DEF[case]
    assert c['kind'] in ('SDK', 'CONTROL'), 'ARTIFACT_CHECK is judged by evaluate_artifact'
    error, extra, notes = None, [], []
    try:
        extra = capture_extra(case, logs, witness)
        form, notes = capture_form(case, verdict, extra)
    except Exception as exc:  # noqa: BLE001
        error = ('%s: %s' % (type(exc).__name__, exc))[:300]
        form = 'INVALID_CAPTURE'
    P = Preds(case)
    if error is None:
        try:
            P.add(CAPTURE_PRED, *case_input_witness(c, logs, witness))
            dp_case(P, c, logs, witness, form)
        except Exception as exc:  # noqa: BLE001 - an evaluation failure is never a pass
            error = ('%s: %s' % (type(exc).__name__, exc))[:300]
    items = []
    for pid in c['predicates']:
        ok, detail = P.got.get(pid, (False, 'not evaluated' + ('' if error is None else ' (%s)' % error)))
        items.append({'id': pid, 'ok': ok, 'class': class_of(pid), 'detail': detail})
    missing = [pid for pid in c['predicates'] if pid not in P.got]
    timeout = bool(witness.get('timed_out')) or any('deadline' in e['data']['reason'] for e in logs['driver'].kinds('INVALID'))
    return _document(c, case, verdict, form, items, error, missing, list(reasons) + extra + notes, timeout)


# ------------------------------------------------------------------------------------------------ ARTIFACT_CHECK (DP-PK09A)

def final_exports(js_text):
    blocks = re.findall(r'^export \{\n((?:  [A-Za-z_$][A-Za-z0-9_$]*,?\n)+)\};?$', js_text, re.M)
    if not blocks:
        return None
    return [x.strip().rstrip(',') for x in blocks[-1].strip().splitlines()]


def evaluate_artifact(case):
    c = CASES_DEF[case]
    assert c['kind'] == 'ARTIFACT_CHECK'
    exp = c['expected']
    P = Preds(case)
    error = None
    detail = {}
    try:
        frozen = c['case_input_sha256']
        recomputed = sha(json.dumps(c['case_input'], ensure_ascii=False, separators=(',', ':')).encode('utf-8'))
        P.add(CAPTURE_PRED, recomputed == frozen, {'frozen': frozen, 'evaluator': recomputed, 'roles': 'NOT_APPLICABLE (no service)'})
        STG._ARCHIVE_OK.clear()
        used = sorted({s['member'].split(':', 1)[0] for s in calls(c)})
        arch = {a: STG.check_archive(a) for a in used}
        got, members = {}, {}
        for s in calls(c):
            data, _ = STG.member_bytes(*STG.member_ref(s['member']))
            members[s['member']] = STG.sha_bytes(data)
            if s.get('extract') == 'final export statement':
                got[s['id']] = final_exports(data.decode('utf-8'))
            else:
                man = json.loads(data)
                want = exp['artifacts'][s['id']]
                got[s['id']] = {k: man.get(k) for k in want}
        P.add('stage.bound_to_cache', all(arch[a] == STG.ARCHIVES[a]['observed']['sha256'] for a in arch), {'archives': arch, 'members': members})
        ref = G02 / 'sdk-reference-profile' / 'inputs' / 'sdk' / 'typescript'
        pin_version = json.loads((ref / 'package.json').read_text()).get('version')
        idx = (ref / 'src' / 'index.ts').read_text()
        pin_exports = 'export { Codex } from "./codex";' in idx and 'export { Thread } from "./thread";' in idx
        source = {'pin_sdk_version': pin_version, 'pin_sdk_exports_codex_and_thread': pin_exports, 'build_link': NBL}
        problems = {k: {'want': v, 'got': got.get(k)} for k, v in exp['artifacts'].items() if not jeq(got.get(k), v)}
        if not jeq(source, exp['source_comparison']):
            problems['source_comparison'] = {'want': exp['source_comparison'], 'got': source}
        P.add('artifact.manifest_fields_exact', not problems, {'problems': problems, 'checked': sorted(exp['artifacts']) + ['source_comparison']})
        detail = {'members': members}
    except Exception as exc:  # noqa: BLE001
        error = ('%s: %s' % (type(exc).__name__, exc))[:300]
    items = []
    for pid in c['predicates']:
        ok, det = P.got.get(pid, (False, 'not evaluated' + ('' if error is None else ' (%s)' % error)))
        items.append({'id': pid, 'ok': ok, 'class': class_of(pid), 'detail': det})
    missing = [pid for pid in c['predicates'] if pid not in P.got]
    doc = _document(c, case, 'ARTIFACT_CHECK', 'ARTIFACT_CHECK', items, error, missing, [], False)
    doc['facts']['topology'] = 'none (evaluator only, no service)'
    doc['facts']['members_read'] = detail.get('members')
    return doc


# ------------------------------------------------------------------------------------------------ offline re-evaluation

def _load_observer():
    spec = importlib.util.spec_from_file_location('cvg_observer_reeval_dp1', HERE / 'observer.py')
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def _norm(items):
    return [[x['id'], x['ok'], json.dumps(x.get('detail'), sort_keys=True, ensure_ascii=False)] for x in items]


def rebuild(ev):
    obs = _load_observer()
    result = json.loads((ev / 'result.json').read_text())
    cfg = json.loads((ev / 'profile' / 'adapter-config.json').read_text())
    manifest = json.loads((ev / 'profile-manifest.json').read_text())
    files = manifest['files']
    logs = {}
    for role in ('driver', 'adapter', 'peer'):
        src = files['/profile/dp-driver.mjs'] if role == 'driver' else '0' * 64
        log = obs.RoleLog(role, {'attempt': cfg['attempt'], 'case': cfg['case'], 'nonce': cfg['nonce'], 'source_sha256': src})
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
    verdict, reasons, _ = obs.reconcile_driver_only(logs, {'checks': result['os_checks']})
    host = result.get('role_host', {})
    witness = {'os_checks': result['os_checks'], 'maps': result.get('maps_witness'), 'cgroup_limits': result.get('cgroup_limits'),
               'limits_ok': result['os_checks'].get('cgroup_limits_match') is True,
               'driver_net_ns': (host.get('driver') or {}).get('net_ns'), 'host_net_ns': result.get('host_net_ns'),
               'stage_witness': result.get('stage_witness'), 'fixture_manifest_host': manifest.get('fixture_manifest_host'),
               'fixture_problems_host': manifest.get('fixture_problems_host'),
               'case_input_sha256_supervisor': result.get('case_input_sha256_supervisor'),
               'case_input_sha256_recomputed': sha(json.dumps(cfg['case_input'], ensure_ascii=False, separators=(',', ':')).encode('utf-8')),
               'control_actions': [x for x in result['actions'] if x['action'] == 'CONTROL'],
               'supervisor_kills': [x for x in result['actions'] if x['action'] in ('SUPERVISOR_BOUND_KILL', 'CASE_ARTIFACT_BUDGET_KILL', 'ADMISSION_STOP')],
               'timed_out': result.get('timed_out', False), 'loader_json': json.loads((ev / 'profile' / 'dp-loader.json').read_text())}
    return cfg, logs, verdict, reasons, witness


def plan_binding(ev, case, frozen_plan=FROZEN_PLAN, freeze=SOURCE_FREEZE):
    manifest = json.loads((ev / 'profile-manifest.json').read_text())
    folder = manifest.get('case_plan') or {}
    problems = []
    frozen_sha = json.loads(freeze.read_text())['files'].get(frozen_plan.name, {}).get('sha256') if freeze.exists() else None
    raw = frozen_plan.read_bytes() if frozen_plan.exists() else b''
    if frozen_sha is None or sha(raw) != frozen_sha:
        problems.append('%s not bound by the source freeze' % frozen_plan.name)
    elif json.loads(raw)['cases'].get(case) != folder:
        problems.append('case folder plan differs from the frozen %s entry' % frozen_plan.name)
    if (manifest.get('case_plan_file') or {}).get('sha256') != frozen_sha:
        problems.append('case folder records another plan file')
    return not problems, {'problems': problems, 'plan_file_sha256': frozen_sha}


def reevaluate(case_dir):
    ev = Path(case_dir)
    if not (ev / 'acceptance.json').is_file():
        raise SystemExit('reevaluate: no service acceptance.json in %s' % ev)
    service = json.loads((ev / 'acceptance.json').read_text())
    if service.get('evaluator_version') != VERSION:
        raise SystemExit('reevaluate: evaluator_version %r, expected %r' % (service.get('evaluator_version'), VERSION))
    result = json.loads((ev / 'result.json').read_text())
    if result.get('kind') == 'ARTIFACT_CHECK_EVALUATOR_ONLY_NO_SERVICE':
        acc = json.loads(json.dumps(evaluate_artifact(service['case']), ensure_ascii=False))
        plan_ok, plan_detail, verdict = True, {'problems': [], 'note': 'no service, no plan folder'}, 'ARTIFACT_CHECK'
    else:
        cfg, logs, verdict, reasons, witness = rebuild(ev)
        plan_ok, plan_detail = plan_binding(ev, cfg['case'])
        acc = json.loads(json.dumps(evaluate(cfg['case'], logs, verdict, reasons, witness), ensure_ascii=False))
    a_items, d_items = _norm(acc['predicates']), _norm(service['predicates'])
    diff = [{'reevaluated': x, 'document': y} for x, y in zip(a_items, d_items) if x != y]
    return {'case': service['case'], 'verdict': verdict, 'outcome': acc['outcome'], 'service_outcome': service['outcome'],
            'predicate_level_equal': not diff and len(a_items) == len(d_items), 'outcome_equal': acc['outcome'] == service['outcome'],
            'plan_binding_ok': plan_ok, 'plan_binding': plan_detail, 'differences': diff[:10], 'evaluator_version': VERSION}


if __name__ == '__main__':
    if len(sys.argv) == 3 and sys.argv[1] == 'reevaluate':
        r = reevaluate(sys.argv[2])
        print(json.dumps(r, ensure_ascii=False, indent=1))
        sys.exit(0 if r['predicate_level_equal'] and r['outcome_equal'] and r['plan_binding_ok'] else 1)
    print(__doc__)
    sys.exit(2)
