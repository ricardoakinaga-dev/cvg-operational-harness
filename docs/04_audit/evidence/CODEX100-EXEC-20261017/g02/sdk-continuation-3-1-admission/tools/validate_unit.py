"""Unit validator of DX100-G02:IMPLEMENT-AND-ADMIT-SDK-SOURCE-CONTINUATION-3-1 (offline, read-only over the frozen spec copies).

Run: python3 -I -B tools/validate_unit.py   -> writes validation-unit.json (exit 0 only when every check passes and every negative
control is refused).

Rules over inputs/spec-c3/cases-c3-1.json (the frozen table this unit runs), each with a negative control:
- F4-01: case_input_sha256 is the sha256 of the compact serialization of the case_input (insertion order);
- D3-02 references: X.startThread/resumeThread name a new Codex 'as'; run/run_streamed 'on' names a thread; mutate targets an
  options_as of an earlier step; events.consume names an earlier run_streamed with consume none, consumed once; abort and
  '$<name>.signal' name an earlier new AbortController; every step key is in the closed vocabulary of the driver (STEP_KEYS mirror);
  a consume mode carries exactly its barrier (SUSPENDED / CHILD_HELD) and its throw/abort key;
- expectations: every expected.api step exists; expected.getter_witnesses ids are declared by a $GETTER witness of the step
  declared_in_step and read at a run/run_streamed/events.consume step not earlier than that; driver_listing_after_settle keys name
  run/run_streamed/events.consume steps; suspended_witness names the SUSPENDED step; the abort predicates name a CHILD_HELD step;
- predicates: every predicate in the table, and every predicate that reads an expected key has it (argv, argv_pattern,
  first_event, schema_file_bytes/trailing_lf, getter_witnesses, suspended_witness, driver_listing_after_settle); argv_json_bytes
  and argv_count agree with the frozen argv;
- Python stack: the peer_script of C31-CTRL01 and of the DIAG rows passes the login admission of the peer (fixture-rpc.py) and the
  barrier plan of the Python lane covers every barrier step (D2B-11).
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


PSUP = load('val_c31_psup', UNIT / 'python' / 'supervisor.py')
CH = load('val_c31_channel', UNIT / 'python' / 'channel.py')
RPC = load('val_c31_rpc', UNIT / 'python' / 'fixture-rpc.py')
RPC.C = CH
DOC = json.loads((UNIT / 'inputs' / 'spec-c3' / 'cases-c3-1.json').read_bytes())
TABLE = DOC['predicate_table']
# Mirror of ts-driver.mjs STEP_KEYS / CONSUME (closed vocabulary, D3-02).
STEP_KEYS = {
    'new Codex': {'step', 'api', 'as', 'options', 'options_as', 'expect'},
    'new AbortController': {'step', 'api', 'as', 'then'},
    'thread': {'step', 'api', 'as', 'options', 'options_as', 'id'},
    'run': {'step', 'api', 'on', 'input', 'turn_options', 'expect'},
    'run_streamed': {'step', 'api', 'on', 'input', 'turn_options', 'consume', 'barrier', 'throw', 'abort', 'expect'},
    'mutate': {'step', 'api', 'target', 'key', 'value'},
    'events.consume': {'step', 'api', 'events_of_step', 'consume'},
    'barrier': {'step', 'barrier', 'witness'},
}
CONSUME = {'all': None, 'first_next_only': None, 'first_then_return': None, 'none': None,
           'first_then_witness_then_throw': 'SUSPENDED', 'next_abort_at_barrier': 'CHILD_HELD'}
NEEDS = {'argv.exact_vector': ['argv', 'argv_json_bytes', 'argv_count'], 'argv.pattern': ['argv_pattern'], 'api.first_event_exact': ['first_event'],
         'fixture.schema_bytes_exact': ['schema_file_bytes', 'schema_file_trailing_lf'], 'tmp.getter_witness_exact': ['getter_witnesses'],
         'tmp.getter_witness_recorded': ['getter_witnesses'], 'witness.suspended_resources': ['suspended_witness'],
         'tmp.driver_listing_after_settle': ['driver_listing_after_settle'], 'env.child_env_exact': ['child_env'],
         'wire.stdin_exact_then_eof': ['stdin'], 'spawn.count_exact': ['spawns_total'], 'api.ts_steps_exact': ['api']}


def compact(x):
    return json.dumps(x, ensure_ascii=False, separators=(',', ':'))


def kind_of(s):
    if 'api' not in s:
        return 'barrier'
    if s['api'].endswith('.startThread') or s['api'].endswith('.resumeThread'):
        return 'thread'
    return s['api']


def getter_ids(x, out):
    if isinstance(x, list):
        for v in x:
            getter_ids(v, out)
    elif isinstance(x, dict):
        for k, v in x.items():
            if k == '$GETTER' and isinstance(v, dict) and 'witness' in v:
                out.append(v['witness'])
            getter_ids(v, out)
    return out


def check_ts(c):
    problems = []
    if hashlib.sha256(compact(c['case_input']).encode('utf-8')).hexdigest() != c['case_input_sha256']:
        problems.append('F4-01: case_input_sha256 differs from the compact bytes')
    calls = c['case_input']['sdk_calls']
    codexes, threads, opts, acs, kept, consumed, declared_at = set(), set(), set(), set(), {}, set(), {}
    steps = {}
    for s in calls:
        n = s['step']
        steps[n] = s
        k = kind_of(s)
        if k not in STEP_KEYS:
            problems.append('step %d: api %r outside the vocabulary' % (n, s.get('api')))
            continue
        extra = set(s) - STEP_KEYS[k]
        if extra:
            problems.append('step %d: keys %s outside the vocabulary' % (n, sorted(extra)))
        for wid in getter_ids({kk: v for kk, v in s.items() if kk in ('options', 'input', 'turn_options', 'value')}, []):
            declared_at[wid] = n
        if k == 'barrier' and s['barrier'] != 'LAZY_POINT':
            problems.append('step %d: standalone barrier %s' % (n, s['barrier']))
        if k == 'new Codex':
            codexes.add(s.get('as'))
        if k == 'new AbortController':
            acs.add(s['as'])
        if k == 'thread':
            if s['api'].split('.')[0] not in codexes:
                problems.append('step %d: %s names no new Codex' % (n, s['api']))
            threads.add(s['as'])
        if k in ('new Codex', 'thread') and 'options_as' in s:
            if 'options' not in s:
                problems.append('step %d: options_as without options' % n)
            opts.add(s['options_as'])
        if k == 'mutate' and s['target'] not in opts:
            problems.append('step %d: mutate target %s is no earlier options_as' % (n, s['target']))
        if k in ('run', 'run_streamed'):
            if s['on'] not in threads:
                problems.append('step %d: on %s names no thread' % (n, s['on']))
            sig = (s.get('turn_options') or {}).get('signal')
            if isinstance(sig, str) and (not sig.startswith('$') or sig[1:].split('.')[0] not in acs):
                problems.append('step %d: signal %s names no AbortController' % (n, sig))
        if k in ('run_streamed', 'events.consume'):
            mode = s.get('consume')
            if mode not in CONSUME or (k == 'events.consume' and mode == 'none'):
                problems.append('step %d: consume %r outside the vocabulary' % (n, mode))
            else:
                if s.get('barrier') != CONSUME[mode]:
                    problems.append('step %d: mode %s with barrier %r' % (n, mode, s.get('barrier')))
                if ('throw' in s) != (mode == 'first_then_witness_then_throw') or ('abort' in s) != (mode == 'next_abort_at_barrier'):
                    problems.append('step %d: throw/abort key does not match the mode' % n)
                if 'abort' in s and s['abort'] not in acs:
                    problems.append('step %d: abort %s names no AbortController' % (n, s['abort']))
            if k == 'run_streamed' and mode == 'none':
                kept[n] = True
            if k == 'events.consume':
                src = s['events_of_step']
                if src not in kept or src in consumed:
                    problems.append('step %d: events_of_step %s is no kept, unconsumed run_streamed' % (n, src))
                consumed.add(src)
    exp = c['expected']
    for item in exp.get('api', []):
        if item['step'] not in steps:
            problems.append('expected.api names missing step %d' % item['step'])
    readers = {n for n, s in steps.items() if kind_of(s) in ('run', 'run_streamed', 'events.consume')}
    for gw in exp.get('getter_witnesses', []):
        if declared_at.get(gw['id']) != gw['declared_in_step']:
            problems.append('getter witness %s declared at %s, frozen declared_in_step %s' % (gw['id'], declared_at.get(gw['id']), gw['declared_in_step']))
        if gw['step'] not in readers or gw['step'] < gw['declared_in_step']:
            problems.append('getter witness %s read at a step that is not a later run/run_streamed/events.consume' % gw['id'])
    if sorted(declared_at) != sorted(x['id'] for x in exp.get('getter_witnesses', [])):
        problems.append('declared witnesses %s differ from expected.getter_witnesses' % sorted(declared_at))
    for key in exp.get('driver_listing_after_settle', {}):
        if key.startswith('step') and int(key[4:]) not in readers:
            problems.append('driver_listing_after_settle %s names no run/run_streamed/events.consume step' % key)
    if 'suspended_witness' in exp and steps.get(exp['suspended_witness']['step'], {}).get('barrier') != 'SUSPENDED':
        problems.append('suspended_witness names no SUSPENDED step')
    if any(p.startswith('abort.') or p == 'api.abort_error_exact' for p in c['predicates']) and 'api.abort_error_exact' in c['predicates']:
        if not any(s.get('barrier') == 'CHILD_HELD' for s in calls):
            problems.append('abort predicates without a CHILD_HELD step')
    for p in c['predicates']:
        if p not in TABLE:
            problems.append('predicate %s not in the table' % p)
        for key in NEEDS.get(p, []):
            if key not in exp:
                problems.append('predicate %s needs expected.%s' % (p, key))
    if 'argv' in exp and (len(compact(exp['argv']).encode()) != exp.get('argv_json_bytes') or len(exp['argv']) != exp.get('argv_count')):
        problems.append('argv_json_bytes/argv_count disagree with the frozen argv')
    return problems


def check_control(c):
    problems = []
    if hashlib.sha256(compact(c['case_input']).encode('utf-8')).hexdigest() != c['case_input_sha256']:
        problems.append('F4-01: case_input_sha256 differs from the compact bytes')
    problems += ['login admission: %s' % x for x in RPC.login_problems(c['case_input']['peer_script'])]
    for p in c['predicates']:
        if p not in TABLE:
            problems.append('predicate %s not in the table' % p)
    return problems


def main():
    cases = {c['id']: c for c in DOC['cases']}
    results = {cid: (check_ts(c) if c['language'] == 'typescript' else check_control(c)) for cid, c in cases.items()}
    diag_rows = {d: RPC.login_problems(r['peer_script']) for d, r in PSUP.DIAG_ROWS.items() if 'peer_script' in r}
    plan = PSUP.plan_check()
    negatives = {}

    def mutated(cid, fn):
        c = copy.deepcopy(cases[cid])
        fn(c)
        return check_ts(c)
    negatives['case_input_bytes_changed'] = bool(mutated('C3-TS02', lambda c: c['case_input']['sdk_calls'][2].update(input=8)))
    negatives['unknown_step_key'] = bool(mutated('C3-TS02', lambda c: c['case_input']['sdk_calls'][1].update(extra=1)))
    negatives['unknown_consume_mode'] = bool(mutated('C3-TS13', lambda c: c['case_input']['sdk_calls'][2].update(consume='bogus')))
    negatives['mode_without_its_barrier'] = bool(mutated('C3-TS04', lambda c: c['case_input']['sdk_calls'][2].pop('barrier')))
    negatives['mutate_target_unknown'] = bool(mutated('C3-TS01', lambda c: c['case_input']['sdk_calls'][5].update(target='zz')))
    negatives['events_consume_of_unkept_step'] = bool(mutated('C3-TS01', lambda c: c['case_input']['sdk_calls'][7].update(events_of_step=3)))
    negatives['abort_unknown_controller'] = bool(mutated('C3-TS12', lambda c: c['case_input']['sdk_calls'][3].update(abort='zz')))
    negatives['thread_of_unknown_codex'] = bool(mutated('C3-TS08', lambda c: c['case_input']['sdk_calls'][1].update(api='zz.resumeThread')))
    negatives['witness_declared_elsewhere'] = bool(mutated('C3-TS05', lambda c: c['expected']['getter_witnesses'][0].update(declared_in_step=2)))
    negatives['witness_read_before_declared'] = bool(mutated('C3-TS05', lambda c: c['expected']['getter_witnesses'][0].update(step=0)))
    negatives['expected_api_missing_step'] = bool(mutated('C3-TS15', lambda c: c['expected']['api'].append({'step': 9, 'result': None})))
    negatives['predicate_without_expected_key'] = bool(mutated('C3-TS04', lambda c: c['expected'].pop('first_event')))
    negatives['argv_bytes_disagree'] = bool(mutated('C3-TS06', lambda c: c['expected'].update(argv_json_bytes=1)))
    negatives['suspended_witness_without_barrier'] = bool(mutated('C3-TS04', lambda c: c['expected']['suspended_witness'].update(step=2)))
    bad_ctrl = copy.deepcopy(cases['C31-CTRL01'])
    bad_ctrl['case_input']['peer_script']['on_request'].append({'match': {'method': 'account/login/start', 'params': {'type': 'apiKey', 'apiKey': 'x'}},
                                                               'reply': {'result': {}}})
    negatives['control_login_forbidden'] = bool(check_control(bad_ctrl))
    ok = all(not v for v in results.values()) and all(not v for v in diag_rows.values()) and not plan and all(negatives.values())
    doc = {'kind': 'UNIT_VALIDATION_C31', 'ok': ok, 'results': {'cases_c3_1': results, 'diag_rows_login_admission': diag_rows, 'barrier_plan_coverage': plan},
           'negative_controls_refused': negatives,
           'note': ('Validador da IMPLEMENT do C3-1: regras sobre cases-c3-1.json (bytes F4-01, referências e vocabulário fechado do D3-02, '
                    'expectativas de getter witness do D3-03, chaves esperadas por predicado, argv) e pilha Python do CONTROL (admissão de login '
                    'do peer, cobertura do plano de barreira); cada regra com controle negativo.')}
    (UNIT / 'validation-unit.json').write_text(json.dumps(doc, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'ok': ok, 'problems': {k: v for k, v in results.items() if v}, 'negatives_not_refused': [k for k, v in negatives.items() if not v]}, indent=1))
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main())
