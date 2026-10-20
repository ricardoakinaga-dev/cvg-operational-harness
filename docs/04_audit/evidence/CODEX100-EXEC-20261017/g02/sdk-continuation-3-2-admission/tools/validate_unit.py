"""Unit validator of DX100-G02:IMPLEMENT-AND-ADMIT-SDK-SOURCE-CONTINUATION-3-2 (offline, read-only over the frozen spec copies).

Run: python3 -I -B tools/validate_unit.py   -> writes validation-unit.json (exit 0 only when every check passes and every
negative control is refused).

The 2B-2 rules over cases-c3-2.json (R2-F07 tokens with @threadId of the three kinds, R2-F03, R2-F01 point 3, R1-F02, E2B-04, D2B-11
barrier-plan coverage, the closed lists of D2B-07 and the login admission of D2B-08), plus the C3-2 rules, each with a negative control:
- F4-01: case_input_sha256 is the sha256 of the compact case_input bytes;
- D3-04 (a): input markers only from the six 2A markers; (b) every fault.install target (class of the object named by 'on', attribute)
  is in the closed list of the driver (FAULT_TARGETS); (c) every hook code path of the cases exists as a function in the pinned
  source files (read with ast, never imported: openai_codex is never imported on the host); (d) probe paths are static (.attr/[key]);
- D3-05: wait_class only on wait steps; CLIENT_EFFECT_UNLESS_ALIVE carries thread_name and comes after a hook.install of the case;
  zero_calls_client_effect_unless_started names the thread of a CLIENT_EFFECT_UNLESS_ALIVE wait of the same case;
- D3-07: C32-CTRL01 equals 2B2-CTRL01 except the last element of the control-client argv.
"""
import copy
import hashlib
import importlib.util
import json
import sys
from pathlib import Path

sys.dont_write_bytecode = True
UNIT = Path(__file__).resolve().parent.parent


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


ACC = load('val_acceptance', UNIT / 'python' / 'acceptance.py')
SUP = load('val_supervisor', UNIT / 'python' / 'supervisor.py')
PIN = UNIT.parent / 'sdk-reference-profile' / 'inputs' / 'sdk' / 'python' / 'src'
CH = load('val_channel', UNIT / 'python' / 'channel.py')
RPC = load('val_fixture_rpc', UNIT / 'python' / 'fixture-rpc.py')
RPC.C = CH
DRV = load('val_driver', UNIT / 'python' / 'python-driver.py')


def chains_of(c):
    exp = c.get('expected', {})
    out = list(exp.get('order', [])) + list((exp.get('wire') or {}).get('order', []))
    for h in exp.get('hooks', []):
        out += [[h[k]] for k in ('before', 'after', 'during') if k in h]
    return out


def steps(c):
    return c['case_input'].get('sdk_calls', [])


def thread_of(params):
    return params.get('threadId') if isinstance(params, dict) else None


def markers(x):
    out = []
    if isinstance(x, dict):
        if '$model' in x or '$enum' in x:
            out.append(x)
        for v in x.values():
            out += markers(v)
    elif isinstance(x, list):
        for v in x:
            out += markers(v)
    return out


def check_case(c):
    """Problems of one case under R2-F07 (+R1-F03), R2-F03, R2-F01, R1-F02, the grammar and the closed lists."""
    problems = []
    st = {s['step']: s for s in steps(c)}
    workers = {s['name'] for s in steps(c) if s['api'] == 'worker.start'}
    rules = (c['case_input'].get('peer_script') or {}).get('on_request', [])
    scripted = {r['match'].get('method') for r in rules}
    held = [r for r in rules if r.get('hold') == 'until_RELEASE_REPLY']
    wire = c.get('expected', {}).get('wire', {})
    client_methods = scripted | {x['method'] for x in wire.get('notifications', [])} | {x['method'] for x in wire.get('requests', [])}
    threads = {}  # method -> threadIds of client requests (expected) and of peer rule matches
    for x in wire.get('requests', []):
        threads.setdefault(x['method'], set()).add(thread_of(x.get('params') or x.get('params_subset')))
    for r in rules:
        threads.setdefault(r['match'].get('method'), set()).add(thread_of(r['match'].get('params') or r['match'].get('params_subset')))
    decl = ACC.hooks_declared(c)
    for chain in chains_of(c):
        for tok in chain:
            m = ACC.TOKEN.match(tok)
            if not m:
                problems.append('grammar: %s' % tok)
                continue
            if m.group(1):
                n = int(m.group(2))
                if n not in st:
                    problems.append('%s names no step' % tok)
                elif m.group(1) == 'CANCEL' and st[n]['api'] not in ('task.cancel', 'loop.block_release_wait_cancel'):
                    problems.append('%s: step %d is %s, not a cancel step' % (tok, n, st[n]['api']))
            elif m.group(3) and m.group(3) not in workers:
                problems.append('%s names no worker.start' % tok)
            elif m.group(4):
                if m.group(4) not in decl:
                    problems.append('R1-F02: %s names an undeclared hook' % tok)
                elif decl[m.group(4)] == 'call+return':
                    problems.append('R1-F02: %s of a call+return hook needs the event (ambiguous token)' % tok)
            elif m.group(6):
                kind, method, tid = m.group(6), m.group(7), m.group(8)
                if method not in client_methods:
                    problems.append('%s: method not sent by the client of this case' % tok)
                if kind in ('COMMIT_REPLY', 'RELEASE_REPLY') and method not in scripted:
                    problems.append('%s: no peer rule answers %s' % (tok, method))
                if tid is not None and tid not in threads.get(method, set()):
                    problems.append('R1-F03: %s: no client request of %s with threadId %s' % (tok, method, tid))
                if kind == 'RELEASE_REPLY':
                    hs = [r for r in held if r['match'].get('method') == method]
                    if not hs:
                        problems.append('%s: no held rule for %s' % (tok, method))
                    elif tid is not None and not any(thread_of(r['match'].get('params') or r['match'].get('params_subset')) == tid for r in hs):
                        problems.append('%s: no held rule with threadId %s' % (tok, tid))
    exp = c.get('expected', {})
    snaps = [s['step'] for s in steps(c) if s['api'] == 'excepthook.snapshot']
    want = exp.get('excepthook')
    if want is None and snaps:
        hits = [x.get('result') for x in exp.get('api', []) if x['step'] == snaps[-1]]
        want = hits[0] if hits else None
    if want:
        if not any(s['api'] in ('excepthook.wait', 'thread.join') and s['step'] < snaps[-1] for s in steps(c)):
            problems.append('R2-F03: non-empty excepthook expectation without excepthook.wait/thread.join before the snapshot')
    for h in exp.get('hooks', []):
        if decl.get(h['id']) == 'call+return' and h.get('occurrence', 1) > 1 and 'event' not in h:
            problems.append('R2-F01: occurrence %d of call+return hook %s without event' % (h['occurrence'], h['id']))
    for s in steps(c):
        rm = (s.get('kwargs') or {}).get('response_model') if isinstance(s.get('kwargs'), dict) else None
        if rm is not None and rm not in DRV.RESPONSE_MODELS:
            problems.append('D2B-07: step %d response_model %s outside the closed list' % (s['step'], rm))
        for mk in markers({k: v for k, v in s.items() if k in ('args', 'kwargs')}):
            if '$model' in mk and mk['$model'] not in DRV.MODEL_CLASSES + (DRV.STATE_MODEL,):
                problems.append('D2B-07: step %d $model %s outside the closed list' % (s['step'], mk['$model']))
            if '$enum' in mk and mk['$enum'] not in DRV.ENUM_CLASSES:
                problems.append('D2B-07: step %d $enum %s outside the closed list' % (s['step'], mk['$enum']))
        if s['api'] in ('model.validate', 'model.construct') and s['model'] not in DRV.MODEL_CLASSES:
            problems.append('D2B-07: step %d model %s outside the closed list' % (s['step'], s['model']))
    if c['case_input'].get('peer_script'):
        problems += ['D2B-08: %s' % x for x in RPC.login_problems(c['case_input']['peer_script'])]
    return problems


def compact(x):
    return json.dumps(x, ensure_ascii=False, separators=(',', ':'))


def pin_functions():
    """Qualified names of every function in the pinned openai_codex sources (ast; nothing is imported)."""
    import ast
    out = set()

    def walk(node, prefix):
        for ch in ast.iter_child_nodes(node):
            if isinstance(ch, ast.ClassDef):
                walk(ch, prefix + [ch.name])
            elif isinstance(ch, (ast.FunctionDef, ast.AsyncFunctionDef)):
                q = prefix + [ch.name]
                out.add('.'.join(q))
                walk(ch, q + ['<locals>'])
            else:  # statements (try, if, with, ...) keep the qualified prefix of their function or class
                walk(ch, prefix)
    for p in sorted((PIN / 'openai_codex').rglob('*.py')):
        mod = 'openai_codex.' + '.'.join(p.relative_to(PIN / 'openai_codex').with_suffix('').parts)
        mod = mod[:-len('.__init__')] if mod.endswith('.__init__') else mod
        walk(ast.parse(p.read_text()), [mod])
    return out


PIN_FUNCS = None
STDLIB_HOOKS = ('concurrent.futures._base.Future.set_result',)
OWNER_CLASS = {'CodexClient.new': 'CodexClient', 'AsyncCodexClient.new': 'AsyncCodexClient', 'Codex.new': 'Codex', 'AsyncCodex.new': 'AsyncCodex'}
SUB_OBJECT = {('AsyncCodexClient', '_sync'): 'CodexClient', ('Codex', '_client'): 'CodexClient', ('AsyncCodex', '_client'): 'AsyncCodexClient'}


def c3_problems(c):
    """D3-04 / D3-05 / F4-01 rules of one C3-2 case."""
    global PIN_FUNCS
    if PIN_FUNCS is None:
        PIN_FUNCS = pin_functions()
    problems = []
    if hashlib.sha256(compact(c['case_input']).encode('utf-8')).hexdigest() != c['case_input_sha256']:
        problems.append('F4-01: case_input_sha256 differs from the compact bytes')
    st = steps(c)
    owners = {s['as']: OWNER_CLASS[s['api']] for s in st if s['api'] in OWNER_CLASS and s.get('as')}
    hook_seen = False
    unless_threads = set()

    def markers_in(x):
        found = []
        if isinstance(x, dict):
            found += [k for k in x if k.startswith('$')]
            for v in x.values():
                found += markers_in(v)
        elif isinstance(x, list):
            for v in x:
                found += markers_in(v)
        return found
    for s in st:
        if s['api'] == 'hook.install':
            hook_seen = True
            for h in s['hooks']:
                if h['code'] not in PIN_FUNCS and h['code'] not in STDLIB_HOOKS:
                    problems.append('D3-04 (c): hook code %s not found in the pinned sources' % h['code'])
        for mk in markers_in({k: v for k, v in s.items() if k in ('args', 'kwargs', 'config')}):
            if mk not in ('$model', '$enum', '$ref') + DRV.INPUT_MARKERS:
                problems.append('D3-04 (a): marker %s outside the vocabulary' % mk)
        if s['api'] == 'fault.install':
            parts = s['on'].split('.')
            cls = owners.get(parts[0])
            for attr in parts[1:]:
                cls = SUB_OBJECT.get((cls, attr))
            if (cls, s['attr']) not in DRV.FAULT_TARGETS['sdk']:
                problems.append('D3-04 (b): fault target %s.%s outside the closed list' % (cls, s['attr']))
            if s['mode'] not in ('call_through_then_raise', 'raise_before_call'):
                problems.append('D3-04 (b): fault mode %s' % s['mode'])
        if s['api'] == 'probe' and not all(isinstance(p, str) and (p.startswith('.') or (p.startswith('[') and p.endswith(']')))
                                           for p in s['path'][1:]):
            problems.append('D3-04 (d): probe path of step %d not static' % s['step'])
        if 'wait_class' in s:
            if s['api'] not in DRV.WAIT_APIS or s['wait_class'] not in DRV.WAIT_CLASSES:
                problems.append('D3-05: wait_class %r on %s' % (s['wait_class'], s['api']))
            if s['wait_class'] == 'CLIENT_EFFECT_UNLESS_ALIVE':
                if not isinstance(s.get('thread_name'), str) or not hook_seen:
                    problems.append('D3-05: CLIENT_EFFECT_UNLESS_ALIVE of step %d without thread_name or before hook.install' % s['step'])
                else:
                    unless_threads.add(s['thread_name'])
    for f in (c['expected'].get('fault') or {}).get('fired', []):
        name = f.get('zero_calls_client_effect_unless_started')
        if name is not None and name not in unless_threads:
            problems.append('E3-07: zero_calls_client_effect_unless_started names %s, no CLIENT_EFFECT_UNLESS_ALIVE wait of it' % name)
    return problems


def run():
    doc2 = ACC._DOC
    by_id = {c['id']: c for c in doc2['cases']}
    results = {'cases_c3_2': {c['id']: check_case(c) + c3_problems(c) for c in doc2['cases']},
               'barrier_plan_coverage': SUP.plan_check(),
               'diag_rows_login_admission': {k: RPC.login_problems(v['peer_script']) for k, v in SUP.DIAG_ROWS.items() if 'peer_script' in v}}
    p13f = SUP.BARRIER_PLAN['C3-PY13F']
    results['r1_f01_13f_plan'] = (p13f[10]['actions'][1][1] == [('hook', 'h_stop', 'return', 1, {})]
                                  and p13f[16]['actions'][1][1] == [('hook', 'h_cleanup_cb', 'return', 2, {})])
    base = {c['id']: c for c in ACC.cases1()['cases']}['2B2-CTRL01']
    ci, bi = copy.deepcopy(by_id['C32-CTRL01']['case_input']), copy.deepcopy(base['case_input'])
    last = (ci['control_client']['argv'].pop(), bi['control_client']['argv'].pop())
    results['d3_07_control_copy'] = ci == bi and last == ('C32-CTRL01', '2B2-CTRL01')
    neg = {}

    def mutated(cid, fn, prefix=None):
        x = copy.deepcopy(by_id[cid])
        fn(x)
        probs = check_case(x) + c3_problems(x)
        return any(p.startswith(prefix) for p in probs) if prefix else bool(probs)
    neg['raw_read_unknown_method'] = mutated('C3-PY13F', lambda x: x['expected']['wire'].update(order=[['API_CANCELLED:8', 'RAW_READ:thread/goal/sett@t13d1#2']]))
    neg['raw_read_unknown_thread_r1_f03'] = mutated('C3-PY13F', lambda x: x['expected']['wire'].update(order=[['API_CANCELLED:8', 'RAW_READ:thread/goal/set@t13zz#2']]), 'R1-F03')
    neg['release_reply_without_hold'] = mutated('C3-PY13F', lambda x: x['expected']['hooks'][0].update(after='RELEASE_REPLY:initialize#1'))
    neg['cancel_on_non_cancel_step'] = mutated('C3-PY13ER', lambda x: x['expected']['hooks'][1].update(after='CANCEL:10'))
    neg['hook_token_undeclared_r1_f02'] = mutated('C3-PY13H', lambda x: x['expected']['order'][0].append('HOOK:h_nope#1'), 'R1-F02')
    neg['response_model_outside_closed_list'] = mutated('C3-PY03', lambda x: x['case_input']['sdk_calls'][4]['kwargs'].update(response_model='ThreadListResponse'), 'D2B-07')
    neg['model_outside_closed_list'] = mutated('C3-PY14', lambda x: x['case_input']['sdk_calls'][11]['args'][0].update({'$model': 'ConfigReadParams'}), 'D2B-07')
    neg['login_forbidden_key'] = mutated('C3-PY17', lambda x: x['case_input']['peer_script']['on_request'][1]['reply']['result'].update(accessToken='z'), 'D2B-08')
    neg['case_input_bytes_changed'] = mutated('C3-PY05', lambda x: x['case_input']['sdk_calls'][4]['args'][1].update(excludeTurns=True), 'F4-01')
    neg['fault_target_outside_closed_list'] = mutated('C3-PY03', lambda x: x['case_input']['sdk_calls'][3].update(attr='request'), 'D3-04 (b)')
    neg['hook_code_not_in_pin'] = mutated('C3-PY13H', lambda x: x['case_input']['sdk_calls'][0]['hooks'][1].update(code='openai_codex._goal._GoalOperationState.finnish'), 'D3-04 (c)')
    neg['input_marker_outside_vocabulary'] = mutated('C3-PY16S', lambda x: x['case_input']['sdk_calls'][4]['args'][0].update({'$AudioInput': {}}), 'D3-04 (a)')
    neg['probe_path_not_static'] = mutated('C3-PY03', lambda x: x['case_input']['sdk_calls'][5]['path'].append('get()'), 'D3-04 (d)')
    neg['unless_alive_without_thread_name'] = mutated('C3-PY13ER', lambda x: x['case_input']['sdk_calls'][11].pop('thread_name'), 'D3-05')
    neg['wait_class_on_non_wait_step'] = mutated('C3-PY03', lambda x: x['case_input']['sdk_calls'][5].update(wait_class='CLIENT_EFFECT'), 'D3-05')
    neg['zero_calls_unknown_thread'] = mutated('C3-PY13ER', lambda x: x['expected']['fault']['fired'][0].update(zero_calls_client_effect_unless_started='zz'), 'E3-07')
    saved = SUP.BARRIER_PLAN.pop('C3-PY13ER')
    neg['barrier_plan_missing_entry'] = bool(SUP.plan_check())
    SUP.BARRIER_PLAN['C3-PY13ER'] = saved
    ok = (all(not v for v in results['cases_c3_2'].values()) and not results['barrier_plan_coverage']
          and all(not v for v in results['diag_rows_login_admission'].values()) and results['r1_f01_13f_plan'] and results['d3_07_control_copy']
          and all(neg.values()))
    doc = {'kind': 'UNIT_VALIDATION_C32', 'ok': ok, 'results': results, 'negative_controls_refused': neg,
           'note': ('Validador da IMPLEMENT do C3-2: regras do 2B-2 sobre cases-c3-2.json e regras do C3-2 (F4-01, D3-04 a-d, D3-05, E3-07 e D3-07); '
                    'cada regra com controle negativo; as fontes do pin são lidas por ast, nunca importadas.')}
    (UNIT / 'validation-unit.json').write_text(json.dumps(doc, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'ok': ok, 'negatives_not_refused': [k for k, v in neg.items() if not v],
                      'problems': {k: v for k, v in results['cases_c3_2'].items() if v}}, ensure_ascii=False, indent=1))
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(run())
