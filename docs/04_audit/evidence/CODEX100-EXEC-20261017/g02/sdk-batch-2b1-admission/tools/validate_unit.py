"""Unit validator of DX100-G02:IMPLEMENT-AND-ADMIT-SDK-SOURCE-BATCH-2B-1 (offline, read-only over the frozen spec copies).

Run: python3 -I -B tools/validate_unit.py   -> writes validation-unit.json (exit 0 only when every check passes and every
negative control is refused).

Checks over cases-2b-1.json (and the occurrence rule also over cases-2b-2.json), each with a negative control:
- R2-F07: WORKER:<name> tokens name a worker.start of the case; RAW_READ / COMMIT_REPLY / RELEASE_REPLY methods (and @threadId)
  are sent by the client and scripted by the peer (RELEASE_REPLY only for a rule with hold until_RELEASE_REPLY, @threadId equal
  to the rule's threadId); CANCEL:n names a task.cancel or loop.block_release_wait_cancel step; STEP/API tokens name a step.
- R2-F03: an excepthook expectation that is not empty needs an excepthook.wait or thread.join before the snapshot.
- R2-F01 (binding lead decision, point 3): in expected.hooks, an entry with occurrence > 1 of a call+return hook must carry event.
- E2B-04: every frozen order token parses with the grammar of acceptance.py.
- D2B-11: every barrier step of every slot and own-code DIAG has exactly one barrier-plan entry.
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


def chains_of(c):
    exp = c.get('expected', {})
    out = list(exp.get('order', [])) + list((exp.get('wire') or {}).get('order', []))
    for h in exp.get('hooks', []):
        out += [[h[k]] for k in ('before', 'after', 'during') if k in h]
    return out


def steps(c):
    return c['case_input'].get('sdk_calls', [])


def check_case(c):
    """Problems of one case under R2-F07, R2-F03, R2-F01 and the grammar."""
    problems = []
    st = {s['step']: s for s in steps(c)}
    workers = {s['name'] for s in steps(c) if s['api'] == 'worker.start'}
    rules = (c['case_input'].get('peer_script') or {}).get('on_request', [])
    scripted = {r['match'].get('method') for r in rules}
    held = [r for r in rules if r.get('hold') == 'until_RELEASE_REPLY']
    wire = c.get('expected', {}).get('wire', {})
    client_methods = scripted | {x['method'] for x in wire.get('notifications', [])} | {x['method'] for x in wire.get('requests', [])}
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
            elif m.group(6):
                kind, method, tid = m.group(6), m.group(7), m.group(8)
                if method not in client_methods:
                    problems.append('%s: method not sent by the client of this case' % tok)
                if kind in ('COMMIT_REPLY', 'RELEASE_REPLY') and method not in scripted:
                    problems.append('%s: no peer rule answers %s' % (tok, method))
                if kind == 'RELEASE_REPLY':
                    hs = [r for r in held if r['match'].get('method') == method]
                    if not hs:
                        problems.append('%s: no held rule for %s' % (tok, method))
                    elif tid is not None and not any(((r['match'].get('params') or r['match'].get('params_subset') or {}).get('threadId')) == tid for r in hs):
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
    decl = ACC.hooks_declared(c)
    for h in exp.get('hooks', []):
        if decl.get(h['id']) == 'call+return' and h.get('occurrence', 1) > 1 and 'event' not in h:
            problems.append('R2-F01: occurrence %d of call+return hook %s without event' % (h['occurrence'], h['id']))
    return problems


def run():
    d1 = ACC._DOC
    d2 = ACC.cases2()
    results = {'cases_2b_1': {c['id']: check_case(c) for c in d1['cases']},
               'cases_2b_2_occurrence_rule': {c['id']: [p for p in check_case(c) if p.startswith('R2-F01')] for c in d2['cases']},
               'barrier_plan_coverage': SUP.plan_check()}
    by_id = {c['id']: c for c in d1['cases']}
    neg = {}
    x = copy.deepcopy(by_id['2B-PY11B'])
    x['expected']['wire']['order'] = [['COMMIT_REPLY:turn/start#1', 'RAW_READ:turn/strat#2']]
    neg['raw_read_unknown_method'] = bool(check_case(x))
    x = copy.deepcopy(by_id['2B-PY10X'])
    x['expected']['hooks'][1]['after'] = 'CANCEL:8'
    neg['cancel_on_non_cancel_step'] = bool(check_case(x))
    x = copy.deepcopy(by_id['2B-PY10X'])
    x['expected']['hooks'][2]['after'] = 'RELEASE_REPLY:synthetic/slow@t10z#1'
    neg['release_reply_wrong_thread'] = bool(check_case(x))
    x = copy.deepcopy(by_id['2B-PY10X'])
    x['expected']['hooks'][2]['after'] = 'RELEASE_REPLY:initialize#1'
    neg['release_reply_without_hold'] = bool(check_case(x))
    x = copy.deepcopy(by_id['2B-PY01B'])
    x['expected']['wire']['order'] = [['WORKER:W9', 'RAW_READ:initialize#1']]
    neg['worker_unknown'] = bool(check_case(x))
    x = copy.deepcopy(by_id['2B-PY10X'])
    for item in x['expected']['api']:
        if item['step'] == 21:
            item['result'] = [{'thread_name': 'T', 'class': 'builtins.RuntimeError', 'str': 'x'}]
    neg['excepthook_non_empty_without_wait'] = bool(check_case(x))
    y = copy.deepcopy([c for c in d2['cases'] if c['id'] == '2B-PY13D'][0])
    for h in y['expected']['hooks']:
        if h.get('occurrence', 1) > 1:
            h.pop('event', None)
    neg['occurrence_without_event'] = any(p.startswith('R2-F01') for p in check_case(y))
    neg['grammar_bad_token'] = not ACC.parse_chain(['HOOK:h#x'])
    ok = (all(not v for v in results['cases_2b_1'].values()) and all(not v for v in results['cases_2b_2_occurrence_rule'].values())
          and not results['barrier_plan_coverage'] and all(neg.values()))
    doc = {'kind': 'UNIT_VALIDATION_2B1', 'ok': ok, 'results': results, 'negative_controls_refused': neg,
           'note': 'Validador da IMPLEMENT (R2-F07, R2-F03, R2-F01 ponto 3, E2B-04, D2B-11); cada regra com controle negativo.'}
    (UNIT / 'validation-unit.json').write_text(json.dumps(doc, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'ok': ok, 'negatives': neg, 'problems': {k: v for k, v in results['cases_2b_1'].items() if v}}, ensure_ascii=False, indent=1))
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(run())
