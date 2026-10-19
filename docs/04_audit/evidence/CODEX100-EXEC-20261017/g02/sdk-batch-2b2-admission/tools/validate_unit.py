"""Unit validator of DX100-G02:IMPLEMENT-AND-ADMIT-SDK-SOURCE-BATCH-2B-2 (offline, read-only over the frozen spec copies).

Run: python3 -I -B tools/validate_unit.py   -> writes validation-unit.json (exit 0 only when every check passes and every
negative control is refused).

Full rules over cases-2b-2.json (carry-over R1-F03 of the 2B-1 review), each with a negative control:
- R2-F07: WORKER:<name> tokens name a worker.start of the case; RAW_READ / COMMIT_REPLY / RELEASE_REPLY methods are sent by the
  client and scripted by the peer (RELEASE_REPLY only for a rule with hold until_RELEASE_REPLY); @threadId is checked for the three
  kinds: a client request of that method with that threadId exists in expected.wire.requests or in a peer rule match (R1-F03);
  CANCEL:n names a task.cancel or loop.block_release_wait_cancel step; STEP/API tokens name a step.
- R2-F03: an excepthook expectation that is not empty needs an excepthook.wait or thread.join before the snapshot.
- R2-F01 (binding lead decision, point 3): in expected.hooks, an entry with occurrence > 1 of a call+return hook must carry event;
  R1-F02: a HOOK:<id>#k token of a call+return hook (event ambiguous) or of an undeclared hook is refused.
- E2B-04: every frozen order token parses with the grammar of acceptance.py.
- D2B-11: every barrier step of every slot and own-code DIAG has exactly one barrier-plan entry; 2B-PY13D steps 10 and 16 release
  on (h_stop, return, 1) and (h_cleanup_cb, return, 2) (R1-F01).
- D2B-07: response_model, $model and $enum of the cases are in the closed lists of the driver.
- D2B-08: every peer_script of the sub-lot (cases and DIAG rows) passes the login admission (FORBIDDEN_LOGIN_KEYS, login.invalid).
"""
import copy
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


def run():
    d2 = ACC._DOC
    d1 = ACC.cases1()
    results = {'cases_2b_2': {c['id']: check_case(c) for c in d2['cases']},
               'cases_2b_1_occurrence_rule': {c['id']: [p for p in check_case(c) if p.startswith('R2-F01')] for c in d1['cases']},
               'barrier_plan_coverage': SUP.plan_check(),
               'diag_rows_login_admission': {k: RPC.login_problems(v['peer_script']) for k, v in SUP.DIAG_ROWS.items() if 'peer_script' in v}}
    p13d = SUP.BARRIER_PLAN['2B-PY13D']
    results['r1_f01_13d_plan'] = (p13d[10]['actions'][1][1] == [('hook', 'h_stop', 'return', 1, {})]
                                  and p13d[16]['actions'][1][1] == [('hook', 'h_cleanup_cb', 'return', 2, {})])
    by_id = {c['id']: c for c in d2['cases']}
    neg = {}
    x = copy.deepcopy(by_id['2B-PY13D'])
    x['expected']['wire']['order'] = [['API_CANCELLED:8', 'RAW_READ:thread/goal/sett@t13d1#2']]
    neg['raw_read_unknown_method'] = bool(check_case(x))
    x = copy.deepcopy(by_id['2B-PY13D'])
    x['expected']['wire']['order'] = [['API_CANCELLED:8', 'RAW_READ:thread/goal/set@t13zz#2']]
    neg['raw_read_unknown_thread_r1_f03'] = any(p.startswith('R1-F03') for p in check_case(x))
    x = copy.deepcopy(by_id['2B-PY13D'])
    x['expected']['wire']['order'] = [['COMMIT_REPLY:turn/interrupt@t13zz#1']]
    neg['commit_reply_unknown_thread_r1_f03'] = any(p.startswith('R1-F03') for p in check_case(x))
    x = copy.deepcopy(by_id['2B-PY13E'])
    x['expected']['hooks'][1]['after'] = 'CANCEL:10'
    neg['cancel_on_non_cancel_step'] = bool(check_case(x))
    x = copy.deepcopy(by_id['2B-PY13D'])
    x['expected']['hooks'][0]['after'] = 'RELEASE_REPLY:thread/goal/set@t13zz#1'
    neg['release_reply_wrong_thread'] = bool(check_case(x))
    x = copy.deepcopy(by_id['2B-PY13D'])
    x['expected']['hooks'][0]['after'] = 'RELEASE_REPLY:initialize#1'
    neg['release_reply_without_hold'] = bool(check_case(x))
    x = copy.deepcopy(by_id['2B-PY13D'])
    x['expected']['wire']['order'] = [['WORKER:W9', 'RAW_READ:initialize#1']]
    neg['worker_unknown'] = bool(check_case(x))
    x = copy.deepcopy(by_id['2B-PY13E'])
    x['case_input']['sdk_calls'] = [s for s in x['case_input']['sdk_calls'] if s['api'] not in ('excepthook.wait', 'thread.join')]
    neg['excepthook_non_empty_without_wait'] = bool(check_case(x))
    y = copy.deepcopy(by_id['2B-PY13D'])
    for h in y['expected']['hooks']:
        if h.get('occurrence', 1) > 1:
            h.pop('event', None)
    neg['occurrence_without_event'] = any(p.startswith('R2-F01') for p in check_case(y))
    y = copy.deepcopy(by_id['2B-PY13D'])
    y['expected']['wire']['order'] = [['HOOK:h_stop#1', 'API_CANCELLED:15']]
    neg['hook_token_of_call_return_hook_r1_f02'] = any(p.startswith('R1-F02') for p in check_case(y))
    y = copy.deepcopy(by_id['2B-PY13D'])
    y['expected']['wire']['order'] = [['HOOK:h_nope#1', 'API_CANCELLED:15']]
    neg['hook_token_undeclared_r1_f02'] = any(p.startswith('R1-F02') for p in check_case(y))
    y = copy.deepcopy(by_id['2B-PY18A'])
    y['case_input']['sdk_calls'][3]['kwargs']['response_model'] = 'ThreadListResponse'
    neg['response_model_outside_closed_list'] = any(p.startswith('D2B-07') for p in check_case(y))
    y = copy.deepcopy(by_id['2B-PY18B'])
    y['case_input']['sdk_calls'][3]['args'][0]['$model'] = 'ConfigReadParams'
    neg['model_outside_closed_list'] = any(p.startswith('D2B-07') for p in check_case(y))
    y = copy.deepcopy(by_id['2B-PY17A'])
    y['case_input']['peer_script']['on_request'][1]['reply']['result']['accessToken'] = 'z'
    neg['login_forbidden_key'] = any(p.startswith('D2B-08') for p in check_case(y))
    y = copy.deepcopy(by_id['2B-PY17A'])
    y['case_input']['peer_script']['on_request'][1]['match']['params']['type'] = 'apiKey'
    neg['login_start_type_apikey'] = any(p.startswith('D2B-08') for p in check_case(y))
    neg['grammar_bad_token'] = not ACC.parse_chain(['HOOK:h#x'])
    saved = SUP.BARRIER_PLAN.pop('2B-PY13E')
    neg['barrier_plan_missing_entry'] = bool(SUP.plan_check())
    SUP.BARRIER_PLAN['2B-PY13E'] = saved
    ok = (all(not v for v in results['cases_2b_2'].values()) and all(not v for v in results['cases_2b_1_occurrence_rule'].values())
          and not results['barrier_plan_coverage'] and all(not v for v in results['diag_rows_login_admission'].values())
          and results['r1_f01_13d_plan'] and all(neg.values()))
    doc = {'kind': 'UNIT_VALIDATION_2B2', 'ok': ok, 'results': results, 'negative_controls_refused': neg,
           'note': 'Validador da IMPLEMENT do 2B-2 (regras completas sobre cases-2b-2.json: R2-F07 com @threadId dos três tipos (R1-F03), R2-F03, '
                   'R2-F01 ponto 3, R1-F02, E2B-04, D2B-11 com R1-F01, listas fechadas do D2B-07 e admissão de login do D2B-08); '
                   'cada regra com controle negativo.'}
    (UNIT / 'validation-unit.json').write_text(json.dumps(doc, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'ok': ok, 'negatives': neg, 'problems': {k: v for k, v in results['cases_2b_2'].items() if v}}, ensure_ascii=False, indent=1))
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(run())
