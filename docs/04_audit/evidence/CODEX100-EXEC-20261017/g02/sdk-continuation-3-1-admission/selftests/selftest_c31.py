"""Offline selftests of DX100-G02:IMPLEMENT-AND-ADMIT-SDK-SOURCE-CONTINUATION-3-1 (no SDK, no Pydantic, no service, no network).

Run: python3 -I -B selftests/selftest_c31.py   -> writes selftests/selftest-results.json (exit 0 only when all pass).

Covers the proofs of freeze-r4-c3-delta.json for the sub-lot C3-1 (D3-01 IDs and slot counts; D3-02 vocabulary and D3-03 getter
witness through selftests/selftest_c31_driver.mjs run by the pinned host Node over own objects and own generators; D3-06 one
SOURCE_SET and one spec table for both lanes; D3-07 CONTROL by copy; D3-08 carry-overs R1-F02, R1-F03 and R1-F04 of the 2B-2
admission), the clauses of evaluator-r4-c3-delta.json (E3-01 R3-12 over the C3-1 table, copied predicates keep class and oracle;
E3-02 with synthetic captures of C3-TS02, C3-TS14 and C3-TS01; E3-03 positive and negatives; E3-04 adapter reaped before the
release; E3-05; E3-06 including the mandatory selftest of the erratum C3-SPEC/R2-F01: an adapter SIGNAL before the driver marker
is not a MISMATCH), plus node --check and compile checks of the sources.
"""
import copy
import hashlib
import importlib.util
import json
import shutil
import subprocess
import sys
import traceback
from pathlib import Path

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
UNIT = HERE.parent
G02 = UNIT.parent
NODE = '/home/ricardo/.nvm/versions/node/v24.20.0/bin/node'
NODE_SHA = '89af8424dd53e560b1933f87ba650d8bf57c83ca5a04600eefb31f416aabbae7'
SCRATCH = Path('/mnt/dados/cvg-work/cvg-codex100-c31-runtime-20261019/selftest-scratch')
RESULTS = []


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    sys.modules[name] = m
    spec.loader.exec_module(m)
    return m


TSUP = load('st_c31_tsup', UNIT / 'tslane' / 'supervisor.py')
TACC = TSUP.ACC
TOBS = TSUP.OBS
PSUP = load('st_c31_psup', UNIT / 'python' / 'supervisor.py')
PACC = PSUP.ACC
POBS = PSUP.OBS
PCH = load('st_c31_pchannel', UNIT / 'python' / 'channel.py')
RPC = load('st_c31_rpc', UNIT / 'python' / 'fixture-rpc.py')
RPC.C = PCH
DOC = json.loads((UNIT / 'inputs/spec-c3/cases-c3-1.json').read_bytes())
DOC2 = json.loads((UNIT / 'inputs/spec-c3/cases-c3-2.json').read_bytes())
BASE_2B1 = json.loads((UNIT / 'inputs/spec-2b/cases-2b-1.json').read_bytes())
CASES = {c['id']: c for c in DOC['cases']}


def check(test, ok, detail=None):
    RESULTS.append({'test': test, 'ok': bool(ok), 'detail': detail})


def sha(b):
    return hashlib.sha256(b).hexdigest()


def compact(x):
    return json.dumps(x, ensure_ascii=False, separators=(',', ':'))


# ------------------------------------------------------------------------------------------------ synthetic TS captures
def res(label, result=None, obs=None, **kw):
    return dict({'kind': 'API_RESULT', 'data': {'api': label, 'result': result, 'observations': obs or {}}}, **kw)


def err(label, name, message, cause=None, **kw):
    return dict({'kind': 'API_ERROR', 'data': {'api': label, 'name': name, 'message': message, 'cause': cause}}, **kw)


def dm(milestone, detail, **kw):
    return dict({'kind': 'DIAGNOSTIC', 'data': {'milestone': milestone, 'detail': detail}}, **kw)


def pm(milestone, detail, **kw):
    return dict({'kind': 'PEER_MILESTONE', 'data': {'milestone': milestone, 'detail': detail}}, **kw)


def tlog(role, events, case='X', **attrs):
    lg = TOBS.RoleLog(role, {'attempt': 'a' * 40, 'case': case, 'nonce': 'n' * 40, 'source_sha256': '0' * 64})
    lg.events = [{'kind': e['kind'], 'data': e['data'], 'seq': i, 'mono_ns': str(e.get('mono', 1000 + i))} for i, e in enumerate(events)]
    lg.recv_ns = [e.get('recv', 1000 + i) for i, e in enumerate(events)]
    for k, v in attrs.items():
        setattr(lg, k, v)
    return lg


def tlogs(driver, adapter=(), peer=(), case='X', **adapter_attrs):
    return {'driver': tlog('driver', driver, case), 'adapter': tlog('adapter', list(adapter), case, **adapter_attrs), 'peer': tlog('peer', list(peer), case)}


def pred(case, logs, w, form='PASS'):
    P = TACC.Preds(case)
    TACC.ts_case(P, TACC.CASES_DEF[case], logs, w, form)
    return P.got


def outcome_with(case, overrides, form='PASS'):
    """Composition of the frozen case with every predicate ok except the overridden ones (rule numbers of the frozen table)."""
    c = TACC.CASES_DEF[case]
    items = [{'id': p, 'ok': overrides.get(p, True), 'class': TACC.class_of(p)} for p in c['predicates']]
    return TACC.compose(c, form, items, True, False)


def edetail(step, label, code=None):
    return dm('ERROR_DETAIL', {'step': step, 'api': label, 'code': code, 'syscall': None, 'ctor': 'Error'})


# ================================================================================================ D3-01 / D3-06
def t_ids_counts_tables():
    acc = ['C3-PY02', 'C3-PY18', 'C3-PY13H', 'C3-PY13F', 'C3-PY13ER', 'C3-PY15A', 'C3-PY16S', '2B-PY01A']
    rej = ['C3-PY01', 'C3-PY19', 'C3-PY13X', 'C3-PY15B', 'C3-TS01', 'C31-CTRL01', '2A-PY03']
    check('D3-01 Python SDK IDs (C3-2) accepted and rejected by channel.py', all(PCH.SDK_CASE_RE.match(x) for x in acc)
          and not any(PCH.SDK_CASE_RE.match(x) for x in rej), {'accepted': acc, 'rejected': rej})
    check('D3-01 CONTROL IDs of the two sub-lots in channel.py and control-client.py', PCH.CONTROL_CASES == ('2B1-CTRL01', '2B2-CTRL01', 'C31-CTRL01', 'C32-CTRL01')
          and "('2B1-CTRL01', '2B2-CTRL01', 'C31-CTRL01', 'C32-CTRL01')" in (UNIT / 'python/control-client.py').read_text())
    ts = [c['id'] for c in sorted(DOC['cases'], key=lambda c: c['slot']) if c['language'] == 'typescript']
    check('D3-01 slot counts per sub-lot: C3-1 15 (14 TypeScript + C31-CTRL01 at slot 15), C3-2 14', len(DOC['cases']) == 15 and DOC['counts']['slots'] == 15
          and len(DOC2['cases']) == 14 and DOC2['counts']['slots'] == 14 and TSUP.SDK_CASES_TS == ts and len(ts) == 14
          and list(PSUP.SPEC_CASES) == ['C31-CTRL01'] and CASES['C31-CTRL01']['slot'] == 15, {'ts_slots': ts})
    check('D3-01 both supervisors and both evaluators bind cases-c3-1.json by sha', TSUP.CASES_SHA == PSUP.CASES_SHA == TACC.CASES_SHA == PACC.CASES_SHA
          == sha((UNIT / 'inputs/spec-c3/cases-c3-1.json').read_bytes()))
    budget = json.loads((UNIT / 'inputs/spec-c3/execution-budget-c3-1.json').read_text())
    check('budget: the 8 qualification services of execution-budget-c3-1.json are the DIAG rows of the two lanes, 12 services, 15 slots',
          TSUP.ADMISSION_DIAGS == budget['planned']['qualification_services'] and set(TSUP.DIAG) | set(PSUP.DIAG) == set(TSUP.ADMISSION_DIAGS)
          and not set(TSUP.DIAG) & set(PSUP.DIAG) and all(d in TSUP.DIAG_ROWS for d in TSUP.DIAG) and all(d in PSUP.DIAG_ROWS for d in PSUP.DIAG)
          and budget['max']['services'] == 12 and len([TSUP.CONTROL_CASE] + TSUP.SDK_CASES_TS) == budget['planned']['case_slots'] == 15
          and TSUP.CONDITIONAL == PSUP.CONDITIONAL == {} and budget['planned']['conditional_slots'] == [], TSUP.ADMISSION_DIAGS)
    check('D3-06 one SOURCE_SET and one spec table for both lanes (shared source and identity freezes)', TSUP.SOURCE_SET == PSUP.SOURCE_SET
          and TSUP.SPEC_SHA == PSUP.SPEC_SHA and TSUP.SPEC_2B_SHA == PSUP.SPEC_2B_SHA and TSUP.SPEC_R4_SHA == PSUP.SPEC_R4_SHA
          and TSUP.FREEZE == PSUP.FREEZE and TSUP.IDENTITY == PSUP.IDENTITY and TSUP.DIAG_ADMISSION == PSUP.DIAG_ADMISSION
          and TSUP.BUDGET == PSUP.BUDGET and TSUP.CASE_LEDGER == PSUP.CASE_LEDGER and TSUP.UNIT_PREFIX == PSUP.UNIT_PREFIX == 'cvg-dx100-c31-')
    check('D3-06 the spec inputs of the freeze match next-task.json#/spec', all(TSUP.SPEC_SHA[n] == sha((UNIT / 'inputs/spec-c3' / n).read_bytes()) for n in TSUP.SPEC_SHA))
    check('D2B-11 barrier plan of the Python lane covers exactly the barrier steps (only DIAG-PY-BEFOREREPLY step 6)', PSUP.plan_check() == []
          and list(PSUP.BARRIER_PLAN) == ['DIAG-PY-BEFOREREPLY'], PSUP.plan_check())
    want = {'C3-TS01': {'1': 'ZERO_SPAWN', '5': 'LAZY_POINT'}, 'C3-TS04': {'3': 'SUSPENDED'}, 'C3-TS12': {'4': 'CHILD_HELD'}}
    got = {c: TSUP.barrier_steps(c) for c in want}
    check('D3-02 (f) TypeScript barrier steps per slot (plan): LAZY_POINT, SUSPENDED, CHILD_HELD and ZERO_SPAWN of the expect steps', got == want, got)
    rows = json.loads(TSUP.fixture_bytes())
    prow = json.loads(PSUP.fixture_bytes())
    check('fixture rows: TS file = 14 frozen slots + 4 TS DIAG rows, Python file = C31-CTRL01 + 4 PY DIAG rows (sorted, never delivered)',
          sorted(rows) == sorted(TSUP.SDK_CASES_TS + list(TSUP.DIAG_ROWS)) and sorted(prow) == sorted(['C31-CTRL01'] + list(PSUP.DIAG_ROWS))
          and TSUP.DIAG_ROWS['DIAG-TS-C3VOCAB'] == {'sdk_calls': [], 'fixture': {'behavior': 'hold'}, 'diag_calls': TSUP.C3VOCAB_CALLS})


# ================================================================================================ E3-01 / R3-12
def t_r3_12():
    table = DOC['predicate_table']
    unused = [p for c in DOC['cases'] for p in c['predicates'] if p not in table]
    check('E3-01 every predicate of every C3-1 case is in the frozen table', not unused, unused)
    frozen = DOC['predicate_classes']
    capture = sorted(k for k, v in frozen.items() if 'INVALID_CAPTURE' in v)
    check('E3-01 R3-12: CAPTURE_CLASSES of both evaluators equal the frozen predicate_classes; composition is the frozen one',
          sorted(TACC.CAPTURE_CLASSES) == capture and sorted(PACC.CAPTURE_CLASSES) == capture and TACC.COMPOSITION == PACC.COMPOSITION == DOC['composition'],
          capture)
    bad = [p for p in table if TACC.class_of(p) != table[p]['class'] or PACC.class_of(p) != table[p]['class']]
    check('E3-01 R3-12: evaluator class == frozen class on every predicate of the C3-1 table (both lanes)', not bad, bad)
    bases = {'../sdk-source-batch-2a-continuation-spec/cases-2a-cont.json': G02 / 'sdk-batch-2ac-admission/inputs/spec-2ac/cases-2a-cont.json',
             '../sdk-source-batch-2a-spec/cases-2a.json': G02 / 'sdk-batch-2a-admission/inputs/spec-2a/cases-2a.json',
             '../sdk-source-batch-2b-spec/cases-2b-1.json': UNIT / 'inputs/spec-2b/cases-2b-1.json'}
    diff, new = [], []
    for pid, v in table.items():
        if v['source'].startswith('NEW'):
            new.append(pid)
            continue
        b = json.loads(bases[v['source'].split('#')[0]].read_bytes())['predicate_table'][pid]
        if b['class'] != v['class'] or b['oracle'] != v['oracle']:
            diff.append(pid)
    check('E3-01 a predicate copied from a base keeps the class and the oracle of the base (source)', not diff
          and sorted(new) == sorted(['abort.child_terminated_by_node_abort', 'api.abort_error_exact', 'api.ts_steps_exact', 'gen.throw_propagated',
                                     'tmp.getter_witness_exact', 'tmp.getter_witness_recorded', 'witness.suspended_resources']), {'differ': diff, 'new': new})
    rules = []
    c = TACC.CASES_DEF['C3-TS02']
    rules.append(TACC.compose(c, 'INVALID_CAPTURE', [], True, False))
    rules.append(TACC.compose(c, 'KNOWN_SIGNAL_TERMINATION', [], True, False))
    rules.append(TACC.compose(c, 'PASS', [], False, False))
    rules.append(TACC.compose(c, 'PASS', [{'ok': False, 'class': 'peer_or_capture_sanity'}, {'ok': False, 'class': 'client'}], True, False))
    rules.append(TACC.compose(c, 'PASS', [{'ok': False, 'class': 'order_unilateral'}, {'ok': False, 'class': 'client'}], True, False))
    rules.append(TACC.compose(c, 'PASS', [{'ok': False, 'class': 'client'}, {'ok': False, 'class': 'informational'}], True, False))
    rules.append(TACC.compose(c, 'PASS', [{'ok': False, 'class': 'informational'}], True, False))
    want = [(x['outcome'].split(' ')[0], x['n']) for x in DOC['composition']['rule_order']]
    check('E3-01 composition rule order 1..7 as frozen (INVALID_CAPTURE, MISMATCH, INVALID_CAPTURE, INVALID_CAPTURE, INCONCLUSIVE, MISMATCH, PASS)',
          [list(r) for r in rules] == [list(x) for x in want], {'got': rules, 'frozen': want})
    missing = {}
    for cid in TSUP.SDK_CASES_TS:
        logs = tlogs([{'kind': 'BEGIN', 'data': {}}], case=cid)
        acc = TACC.evaluate(cid, logs, 'PASS', [], {'maps': {'ok': True}})
        missing[cid] = [acc['implicit_predicates']['evaluation_completed']['missing'], acc['implicit_predicates']['evaluation_completed']['error']]
    check('E3-01 every predicate of the 14 TypeScript slots is computed by the evaluator (no "not evaluated", no exception on an empty capture)',
          all(m == [[], None] for m in missing.values()), {k: v for k, v in missing.items() if v != [[], None]})


# ================================================================================================ E3-02
def t_e3_02():
    ts02 = [err('3:Thread.run', 'TypeError', 'input is not iterable'), edetail(3, '3:Thread.run'),
            err('4:Thread.run', 'TypeError', 'input is not iterable'), edetail(4, '4:Thread.run'),
            err('5:Thread.run', 'TypeError', "Cannot read properties of null (reading 'type')"), edetail(5, '5:Thread.run'),
            res('6:Thread.run', {'items': [], 'finalResponse': '', 'usage': None}, {'thread_id': None})]
    ok, det = TACC.ts_steps_exact(CASES['C3-TS02'], tlog('driver', ts02))
    bad = copy.deepcopy(ts02)
    bad[4]['data']['message'] = "Cannot read properties of null (reading 'kind')"
    ok_bad, _ = TACC.ts_steps_exact(CASES['C3-TS02'], tlog('driver', bad))
    rr, _ = TACC.run_result_exact(CASES['C3-TS02'], tlog('driver', ts02))
    check('E3-02 C3-TS02: errors by name and exact message (version_dependent exact), run result by jeq; a different message fails', ok and not ok_bad and rr, det)
    snaps = [res('3:yield', {'type': 'thread.started', 'thread_id': 't14a'}, {'thread_id': 't14a', 'index': 0}),
             res('3:yield', {'type': 'thread.started'}, {'thread_id_is_undefined': True, 'index': 1}),
             res('3:yield', {'type': 'turn.completed', 'usage': {'input_tokens': 1, 'cached_input_tokens': 0, 'output_tokens': 1, 'cache_write_input_tokens': 0}},
                 {'thread_id_is_undefined': True, 'index': 2}),
             res('3:return', None, {'events': 3, 'thread_id_is_undefined': True})]
    ok14, det14 = TACC.ts_steps_exact(CASES['C3-TS14'], tlog('driver', snaps))
    bad14 = copy.deepcopy(snaps)
    bad14[1]['data']['observations'] = {'thread_id': None, 'index': 1}
    ok14b, _ = TACC.ts_steps_exact(CASES['C3-TS14'], tlog('driver', bad14))
    check('E3-02 C3-TS14: yield_snapshots with thread_id_is_undefined and return observations; thread_id null instead of undefined fails', ok14 and not ok14b, det14)
    ts01 = [dm('RESOLVER_ABSENCE', {'paths': {}, 'node_path': False}),
            err('1:new Codex', 'Error', 'Unable to locate Codex CLI binaries. Ensure @openai/codex is installed with optional dependencies.'),
            edetail(1, '1:new Codex'), res('8:return', None, {'events': 0, 'thread_id': None})]
    ok01, det01 = TACC.ts_steps_exact(CASES['C3-TS01'], tlog('driver', ts01))
    bad01 = ts01[:3] + [res('8:yield', {'type': 'x'}, {'thread_id': None, 'index': 0})] + ts01[3:]
    ok01b, _ = TACC.ts_steps_exact(CASES['C3-TS01'], tlog('driver', bad01))
    check('E3-02 C3-TS01: constructor error and events.consume without yield (return events 0); a yield in step 8 fails', ok01 and not ok01b, det01)
    o, r = outcome_with('C3-TS02', {'api.ts_steps_exact': False})
    check('E3-02 a failed api.ts_steps_exact (client) is MISMATCH by rule 6', (o, r) == ('MISMATCH', 6))


# ================================================================================================ E3-03
def ts03_driver(w3=None, w4=None, summary=None):
    rec3 = {'id': 'w3', 'step': 3, 'invocations': 1, 'entries': [['codex-output-schema-AbC123', []]]} if w3 is None else w3
    rec4 = {'id': 'w4', 'step': 4, 'invocations': 1, 'entries': [['codex-output-schema-XyZ789', []]]} if w4 is None else w4
    ev = [err('3:Thread.run', 'TypeError', 'Do not know how to serialize a BigInt'), edetail(3, '3:Thread.run')]
    if rec3 != 'absent':
        ev.append(dm('GETTER_WITNESS', rec3))
    ev += [dm('TMP_LISTING', {'step': 3, 'entries': []}), err('4:Thread.run', 'TypeError', 'Converting circular structure to JSON x'), edetail(4, '4:Thread.run'),
           dm('GETTER_WITNESS', rec4), dm('TMP_LISTING', {'step': 4, 'entries': []}),
           res('5:Thread.run', {'items': [], 'finalResponse': '', 'usage': None}), dm('TMP_LISTING', {'step': 5, 'entries': []}),
           dm('CALLS_DONE', {'source_sdk_claim': False, 'getter_witnesses': summary or [{'id': 'w3', 'invocations_total': 1}, {'id': 'w4', 'invocations_total': 1}]})]
    return tlog('driver', ev)


def t_e3_03():
    c = CASES['C3-TS03']
    ex, dex = TACC.getter_witness_exact(c, ts03_driver())
    rc, drc = TACC.getter_witness_recorded(c, ts03_driver())
    check('E3-03 positive: tmp.getter_witness_exact and tmp.getter_witness_recorded pass (C3-TS03)', ex and rc, {'exact': dex, 'recorded': drc})
    cases = {
        'no directory in the listing': dict(w3={'id': 'w3', 'step': 3, 'invocations': 1, 'entries': []}),
        'extra child in the directory': dict(w3={'id': 'w3', 'step': 3, 'invocations': 1, 'entries': [['codex-output-schema-AbC123', ['schema.json']]]}),
        '0 invocations (no record, summary 0)': dict(w3='absent', summary=[{'id': 'w3', 'invocations_total': 0}, {'id': 'w4', 'invocations_total': 1}]),
    }
    for name, kw in cases.items():
        d = ts03_driver(**kw)
        e, _ = TACC.getter_witness_exact(c, d)
        r, det = TACC.getter_witness_recorded(c, d)
        out = outcome_with('C3-TS03', {'tmp.getter_witness_exact': e, 'tmp.getter_witness_recorded': r})
        check('E3-03 negative %s: exact fails, record sane -> MISMATCH (rule 6)' % name, not e and r and out == ('MISMATCH', 6), {'recorded': det, 'outcome': out})
    for name, kw in {'missing record (summary 1)': dict(w3='absent'),
                     'listing error inside the getter (R2-F02)': dict(w3={'id': 'w3', 'step': 3, 'invocations': 1, 'entries': None, 'error': 'EACCES'}),
                     'duplicate/undeclared record': dict(w4={'id': 'wX', 'step': 4, 'invocations': 1, 'entries': []})}.items():
        d = ts03_driver(**kw)
        r, det = TACC.getter_witness_recorded(c, d)
        out = outcome_with('C3-TS03', {'tmp.getter_witness_recorded': r, 'tmp.getter_witness_exact': TACC.getter_witness_exact(c, d)[0]})
        check('E3-03 negative %s: tmp.getter_witness_recorded fails -> INVALID_CAPTURE (rule 4)' % name, not r and out == ('INVALID_CAPTURE', 4),
              {'problems': det['problems'], 'outcome': out})


# ================================================================================================ E3-04 / E3-05 / TS04
SF_BYTES = b'{"type":"object"}'


def ts04(term=None, alive=True, kills=(), err_recv=7000, same=True, sig_recv=5500, trailing=False):
    d = [res('1:new Codex'), res('2:startThread', None, {'thread_id': None}),
         res('3:yield', {'type': 'thread.started', 'thread_id': 't4x'}, {'thread_id': 't4x', 'index': 0}, recv=4000),
         dm('STEP_WITNESS', {'step': 3, 'kind': 'SUSPENDED', 'entries': [['codex-output-schema-AbC123', ['schema.json']]]}, recv=4100),
         dm('THROW_PROPAGATED', {'step': 3, 'same_object': same, 'cause_present': False}, recv=6900),
         err('3:Thread.runStreamed', 'Error', 'cvg consumer throw', recv=err_recv), edetail(3, '3:Thread.runStreamed'),
         dm('TMP_LISTING', {'step': 3, 'entries': []}, recv=7100), dm('CALLS_DONE', {'source_sdk_claim': False, 'getter_witnesses': []}, recv=7200)]
    a = [{'kind': 'BEGIN', 'data': {}}, {'kind': 'SIGNAL', 'data': {'signal': 'SIGTERM', 'inflight': False}, 'recv': sig_recv},
         {'kind': 'END', 'data': {'streams': {}, 'child_exit_code': None, 'child_signal': None, 'complete': False}, 'recv': sig_recv + 10}]
    p = [pm('EXEC_ARGV', ['exec', '--experimental-json', '--output-schema', '/work/tmp/codex-output-schema-AbC123/schema.json'], recv=3000),
         pm('SCHEMA_FILE', {'path': '/work/tmp/codex-output-schema-AbC123/schema.json', 'exists': True, 'bytes': len(SF_BYTES), 'sha256': sha(SF_BYTES),
                            'trailing_lf': trailing, 'text': SF_BYTES.decode()}, recv=3100),
         pm('REPLY_WRITTEN', {'stdout_bytes': 1}, recv=3500)]
    logs = tlogs(d, a, p, signal='SIGTERM', terminal='END')
    w = {'step_witness': [{'step': 3, 'kind': 'SUSPENDED', 'adapter_processes': 1, 'peer_processes': 1, 'adapter_frames': 9, 'peer_frames': 5,
                           'adapter_mapped': True, 'adapter_alive': alive, 'adapter_signal_frames': 0, 'adapter_terminal': None, 'request_held_frames': 1}],
         'control_actions': [{'t_ns': 5000, 'action': 'CONTROL', 'detail': {'command': 'STEP_RELEASE', 'role': 'driver', 'tag': 3}}],
         'supervisor_kills': [{'action': k} for k in kills], 'signal_sent_ns': None,
         'termination': {'adapter': term if term is not None else {'zombie_exit_code': 15, 'zombie_t_ns': 5600, 'absent': False}}}
    return logs, w


def t_e3_04_05():
    logs, w = ts04()
    got = pred('C3-TS04', logs, w, 'KNOWN_SIGNAL_TERMINATION')
    names = ['witness.suspended_resources', 'gen.throw_propagated', 'ret.child_terminated_by_SIGTERM', 'api.first_event_exact', 'fixture.schema_bytes_exact',
             'fixture.schema_file_present_during_child', 'tmp.driver_listing_after_settle', 'api.ts_steps_exact']
    check('E3-04/E3-05/E3-06 positive C3-TS04: suspended witness, throw propagated, SIGTERM after return(), first event, schema bytes, listing after settle',
          all(got[n][0] for n in names), {n: got[n][0] for n in names})
    logs, w = ts04(term={'zombie_exit_code': None, 'absent': True, 'absent_t_ns': 4500})
    g = pred('C3-TS04', logs, w, 'KNOWN_SIGNAL_TERMINATION')
    check('E3-04 negative: adapter reaped (absent) before the release of SUSPENDED -> witness.suspended_resources fails -> MISMATCH',
          not g['witness.suspended_resources'][0] and outcome_with('C3-TS04', {'witness.suspended_resources': False}, 'KNOWN_SIGNAL_TERMINATION') == ('MISMATCH', 6),
          g['witness.suspended_resources'][1])
    logs, w = ts04(alive=False)
    check('E3-04 negative: adapter not alive at the barrier -> fails', not pred('C3-TS04', logs, w, 'KNOWN_SIGNAL_TERMINATION')['witness.suspended_resources'][0])
    logs, w = ts04(same=False)
    check('E3-05 negative: a different error object reaches the driver -> gen.throw_propagated fails', not pred('C3-TS04', logs, w, 'KNOWN_SIGNAL_TERMINATION')['gen.throw_propagated'][0])
    logs, w = ts04(err_recv=4500)
    check('E3-05 negative: API_ERROR received before the release of SUSPENDED -> fails', not pred('C3-TS04', logs, w, 'KNOWN_SIGNAL_TERMINATION')['gen.throw_propagated'][0])
    logs, w = ts04(kills=('SUPERVISOR_BOUND_KILL',))
    check('ret.child_terminated_by_SIGTERM negative: a supervisor kill -> fails', not pred('C3-TS04', logs, w, 'KNOWN_SIGNAL_TERMINATION')['ret.child_terminated_by_SIGTERM'][0])
    logs, w = ts04(term={'zombie_exit_code': None, 'absent': False})
    check('ret.child_terminated_by_SIGTERM negative: no OS termination witness -> fails', not pred('C3-TS04', logs, w, 'KNOWN_SIGNAL_TERMINATION')['ret.child_terminated_by_SIGTERM'][0])
    logs, w = ts04(trailing=True)
    check('E3-06 fixture.schema_bytes_exact reads expected.schema_file_trailing_lf (a trailing LF fails)', not pred('C3-TS04', logs, w, 'KNOWN_SIGNAL_TERMINATION')['fixture.schema_bytes_exact'][0])


# ================================================================================================ E3-06 / erratum R2-F01
def ts12(sig_mono=200, own_kill=False, kills=(), signal='SIGTERM', requested=True, code='ABORT_ERR', term=True, yield_late=False):
    d = [res('1:new Codex'), res('2:startThread', None, {'thread_id': None}), res('3:new AbortController', {'aborted': False}),
         dm('STEP_WITNESS', {'step': 4, 'kind': 'CHILD_HELD', 'entries': []})]
    if requested:
        d.append(dm('ABORT_REQUESTED', {'step': 4, 'controller': 'ac'}, mono=100))
    if own_kill:
        d.append(dm('ABORT_CALLED', {'signal': 'SIGTERM', 'source_sdk_claim': False}, mono=105))
    d.append(dm('ABORT_RETURNED', {'step': 4, 'aborted': True}, mono=110))
    if yield_late:
        d.append(res('4:yield', {'type': 'turn.completed'}, {'thread_id': None, 'index': 0}, mono=150))
    d += [err('4:Thread.runStreamed', 'AbortError', 'The operation was aborted', {'name': 'AbortError', 'message': 'This operation was aborted'}, mono=300),
          edetail(4, '4:Thread.runStreamed', code), dm('TMP_LISTING', {'step': 4, 'entries': []}, mono=310)]
    a = [{'kind': 'BEGIN', 'data': {}}, {'kind': 'SIGNAL', 'data': {'signal': signal, 'inflight': False}, 'mono': sig_mono},
         {'kind': 'END', 'data': {'streams': {}, 'child_exit_code': None, 'child_signal': None, 'complete': False}, 'mono': sig_mono + 5}]
    logs = tlogs(d, a, [], signal=signal, terminal='END')
    w = {'step_witness': [], 'control_actions': [], 'supervisor_kills': [{'action': k} for k in kills], 'signal_sent_ns': None,
         'termination': {'adapter': {'zombie_exit_code': 15, 'zombie_t_ns': 900, 'absent': False}} if term else {}}
    return logs, w


def t_e3_06():
    logs, w = ts12()
    g = pred('C3-TS12', logs, w, 'KNOWN_SIGNAL_TERMINATION')
    names = ['api.abort_error_exact', 'abort.child_terminated_by_node_abort', 'abort.no_yield_after_abort', 'abort.no_remote_stop_claim', 'api.ts_steps_exact']
    check('E3-06 positive C3-TS12: AbortError/ABORT_ERR without yield, Node abort termination (items 1-5), no yield after abort, no remote stop',
          all(g[n][0] for n in names), {n: g[n][0] for n in names})
    logs, w = ts12(sig_mono=50)
    g2 = pred('C3-TS12', logs, w, 'KNOWN_SIGNAL_TERMINATION')
    items = {p: g2[p][0] for p in ('api.abort_error_exact', 'abort.child_terminated_by_node_abort', 'abort.no_yield_after_abort',
                                   'abort.no_remote_stop_claim', 'api.ts_steps_exact')}
    check('E3-06 MANDATORY (erratum C3-SPEC/R2-F01): adapter SIGNAL before the driver ABORT_REQUESTED marker is not a MISMATCH (order recorded, not judged)',
          g2['abort.child_terminated_by_node_abort'][0] is True and outcome_with('C3-TS12', items, 'KNOWN_SIGNAL_TERMINATION') == ('PASS_CLIENT_OBSERVATION', 7)
          and g2['abort.child_terminated_by_node_abort'][1]['order_recorded_not_judged']['adapter_signal_mono_ns'] == 50,
          g2['abort.child_terminated_by_node_abort'][1])
    for name, kw in {'(1) form PASS instead of KNOWN_SIGNAL_TERMINATION': {}, '(2) SIGINT in the adapter SIGNAL': {'signal': 'SIGINT'},
                     '(2) no OS witness': {'term': False}, '(3) supervisor kill': {'kills': ('CASE_ARTIFACT_BUDGET_KILL',)},
                     '(4) own kill of the driver (ABORT_CALLED)': {'own_kill': True}, '(5) no ABORT_REQUESTED marker': {'requested': False}}.items():
        logs, w = ts12(**kw)
        form = 'PASS' if name.startswith('(1)') else 'KNOWN_SIGNAL_TERMINATION'
        check('E3-06 negative %s -> abort.child_terminated_by_node_abort fails' % name, not pred('C3-TS12', logs, w, form)['abort.child_terminated_by_node_abort'][0])
    logs, w = ts12(code=None)
    check('E3-06 negative: ERROR_DETAIL without code ABORT_ERR -> api.abort_error_exact fails', not pred('C3-TS12', logs, w, 'KNOWN_SIGNAL_TERMINATION')['api.abort_error_exact'][0])
    logs, w = ts12(yield_late=True)
    g3 = pred('C3-TS12', logs, w, 'KNOWN_SIGNAL_TERMINATION')
    check('E3-06 negative: a terminal event yielded after the abort -> abort_error_exact, no_yield_after_abort and no_remote_stop_claim fail',
          not g3['api.abort_error_exact'][0] and not g3['abort.no_yield_after_abort'][0] and not g3['abort.no_remote_stop_claim'][0])
    check('E3-06 the abort predicate is client and no order_unilateral predicate was added (erratum: order only recorded)',
          TACC.class_of('abort.child_terminated_by_node_abort') == 'client' and not any(DOC['predicate_table'][p]['class'] == 'order_unilateral'
                                                                                       for p in CASES['C3-TS12']['predicates']))


def t_spawn_zero():
    d = [dm('RESOLVER_ABSENCE', {})]
    w_ok = {'step_witness': [{'step': 1, 'kind': 'ZERO_SPAWN', 'adapter_processes': 0, 'peer_processes': 0, 'adapter_frames': 0},
                             {'step': 5, 'kind': 'LAZY_POINT', 'adapter_processes': 0, 'peer_processes': 0, 'adapter_frames': 0}], 'role_mapped': ['adapter', 'driver']}
    logs = tlogs(d, [{'kind': 'BEGIN', 'data': {}}], [])
    ok = pred('C3-TS01', logs, w_ok)['spawn.count_exact'][0]
    w_no = dict(w_ok, step_witness=w_ok['step_witness'][1:])
    no = pred('C3-TS01', logs, w_no)['spawn.count_exact'][0]
    logs4, w4 = ts04()
    w4 = dict(w4, role_mapped=['adapter', 'driver'])
    s4 = pred('C3-TS04', logs4, w4, 'KNOWN_SIGNAL_TERMINATION')['spawn.count_exact'][0]
    check('spawn.count_exact: the zero part reads only ZERO_SPAWN/LAZY_POINT witnesses (a SUSPENDED witness with the live adapter is fine) and needs the ZERO_SPAWN of every spawns-0 step',
          ok and not no and s4)


# ================================================================================================ D3-07
def t_d3_07():
    c31 = CASES['C31-CTRL01']
    b = [c for c in BASE_2B1['cases'] if c['id'] == '2B1-CTRL01'][0]
    contract = json.loads((UNIT / 'inputs/spec-c3/control-slot-contract-c3.json').read_text())
    slot = [s for s in contract['slots'] if s['case'] == 'C31-CTRL01'][0]
    ci, bi = copy.deepcopy(c31['case_input']), copy.deepcopy(b['case_input'])
    last = (ci['control_client']['argv'].pop(), bi['control_client']['argv'].pop())
    check('D3-07 C31-CTRL01 case_input equals 2B1-CTRL01 except the last argv element (the case ID)', ci == bi and last == ('C31-CTRL01', '2B1-CTRL01')
          and compact(ci) == compact(bi), last)
    check('D3-07 C31-CTRL01 case_input bytes have the frozen sha of the CONTROL contract and of cases-c3-1.json',
          sha(compact(c31['case_input']).encode()) == slot['case_input_sha256'] == c31['case_input_sha256'])
    same = {f: c31[f] == b[f] for f in slot['copy_of']['unchanged_fields']}
    check('D3-07 unchanged fields of the copy are equal to the base (contract list)', all(same.values()), same)
    s = RPC.ScriptV2(c31['case_input']['peer_script'])
    outs = []
    for obj in c31['case_input']['control_client']['lines']:
        if 'id' in obj:
            rule, ops = s.plan(obj)
            outs.append((obj['id'], rule, [o[0] for o in ops]))
    check('D3-07 peer v2 plan of the copy: ctrl-2 frame before the reply, ctrl-3 unscripted error', outs == [('ctrl-1', 0, ['write']),
          ('ctrl-2', 1, ['write', 'before_reply_done', 'write']), ('ctrl-3', None, ['write'])], outs)
    check('D3-07 the CONTROL driver of the Python lane is the control client with the frozen argv', PSUP.role_argv('driver', 'C31-CTRL01') == c31['case_input']['control_client']['argv']
          and c31['predicates'] == b['predicates'] and c31['expected']['evaluator_outcome'] == 'MISMATCH')


# ================================================================================================ D3-08
def plogs():
    return {r: POBS.RoleLog(r, {'attempt': 'a' * 40, 'case': 'C31-CTRL01', 'nonce': 'n' * 40, 'source_sha256': '0' * 64}) for r in ('driver', 'adapter', 'peer')}


def t_r1_f02():
    for target in ('expand_parts', 'Seq', 'capture_extra'):
        orig = getattr(PACC, target)

        def boom(*_a, _t=target, **_k):
            raise RuntimeError('selftest %s failure' % _t)
        setattr(PACC, target, boom)
        try:
            acc = PACC.evaluate('C31-CTRL01', plogs(), 'PASS', [], {'maps': {'ok': True}})
        finally:
            setattr(PACC, target, orig)
        ec = acc['implicit_predicates']['evaluation_completed']
        check('D3-08 R1-F02: %s raising inside evaluate -> evaluation_completed false -> INVALID_CAPTURE by rule 3' % target,
              acc['outcome'] == 'INVALID_CAPTURE' and acc['composition_rule'] == 3 and ec['ok'] is False and 'selftest %s failure' % target in (ec['error'] or ''),
              {'outcome': acc['outcome'], 'rule': acc['composition_rule'], 'error': ec['error']})


def synth_folder(root, case, folder_plan, case_input, plan_file_name, plan_doc_cases, bind=True, record_sha=True):
    if root.exists():
        shutil.rmtree(root)
    (root / 'case' / 'profile').mkdir(parents=True)
    plan_path = root / plan_file_name
    plan_path.write_text(json.dumps({'cases': plan_doc_cases}, ensure_ascii=False, indent=2) + '\n')
    psha = sha(plan_path.read_bytes())
    (root / 'source-freeze.json').write_text(json.dumps({'files': {plan_file_name: {'sha256': psha if bind else '0' * 64}}}))
    (root / 'case' / 'profile-manifest.json').write_text(json.dumps({'case_plan': folder_plan, 'case_plan_file': {'path': plan_file_name, 'sha256': psha if record_sha else 'x'}}))
    (root / 'case' / 'profile' / 'adapter-config.json').write_text(json.dumps({'case_input': case_input}))
    return root / 'case', plan_path, root / 'source-freeze.json'


def t_r1_f03():
    root = SCRATCH / 'r1f03'
    jp = lambda x: json.loads(json.dumps(x))
    ctrl = jp(PSUP.case_plan('C31-CTRL01'))
    br = jp(PSUP.case_plan('DIAG-PY-BEFOREREPLY'))
    ci_ctrl, ci_br = PSUP.delivered_input('C31-CTRL01'), PSUP.delivered_input('DIAG-PY-BEFOREREPLY')
    res_ = {}
    ev, pp, fz = synth_folder(root, 'C31-CTRL01', ctrl, ci_ctrl, 'case-plan-py.json', {'C31-CTRL01': ctrl})
    res_['control_positive'] = PACC.plan_binding(ev, 'C31-CTRL01', pp, fz)[0]
    ev, pp, fz = synth_folder(root, 'DIAG-PY-BEFOREREPLY', br, ci_br, 'case-plan-py.json', {'DIAG-PY-BEFOREREPLY': br})
    res_['barrier_positive'] = PACC.plan_binding(ev, 'DIAG-PY-BEFOREREPLY', pp, fz)[0]
    tampered = dict(ctrl, barrier_plan={'3': {'gate': [], 'actions': []}})
    ev, pp, fz = synth_folder(root, 'C31-CTRL01', tampered, ci_ctrl, 'case-plan-py.json', {'C31-CTRL01': ctrl})
    res_['neg_folder_plan_differs'] = not PACC.plan_binding(ev, 'C31-CTRL01', pp, fz)[0]
    ev, pp, fz = synth_folder(root, 'C31-CTRL01', ctrl, ci_ctrl, 'case-plan-py.json', {'C31-CTRL01': ctrl}, bind=False)
    res_['neg_plan_not_bound_by_freeze'] = not PACC.plan_binding(ev, 'C31-CTRL01', pp, fz)[0]
    nobar = dict(br, barrier_plan={})
    ev, pp, fz = synth_folder(root, 'DIAG-PY-BEFOREREPLY', nobar, ci_br, 'case-plan-py.json', {'DIAG-PY-BEFOREREPLY': nobar})
    ok, det = PACC.plan_binding(ev, 'DIAG-PY-BEFOREREPLY', pp, fz)
    res_['neg_plan_without_the_barrier_step'] = not ok and any('barrier plan keys' in x for x in det['problems'])
    ev, pp, fz = synth_folder(root, 'C31-CTRL01', ctrl, ci_ctrl, 'case-plan-py.json', {'C31-CTRL01': ctrl}, record_sha=False)
    res_['neg_folder_records_other_plan_file'] = not PACC.plan_binding(ev, 'C31-CTRL01', pp, fz)[0]
    ts4 = jp(TSUP.case_plan('C3-TS04'))
    ev, pp, fz = synth_folder(root, 'C3-TS04', ts4, TSUP.delivered_input('C3-TS04'), 'case-plan-ts.json', {'C3-TS04': ts4})
    res_['ts_positive'] = TACC.plan_binding(ev, 'C3-TS04', pp, fz)[0]
    ts4b = dict(ts4, barrier_steps={})
    ev, pp, fz = synth_folder(root, 'C3-TS04', ts4b, TSUP.delivered_input('C3-TS04'), 'case-plan-ts.json', {'C3-TS04': ts4b})
    res_['ts_neg_barrier_steps'] = not TACC.plan_binding(ev, 'C3-TS04', pp, fz)[0]
    shutil.rmtree(root)
    check('D3-08 R1-F03: plan of the case folder checked against the plan file bound by the source freeze and the barrier steps of the case_input (positive and negative controls, both lanes)',
          all(res_.values()), res_)


class FakeSeq:
    tokens = {}

    def gidx(self, role, i):
        return {'driver': 100, 'adapter': 200, 'peer': 300}[role] + i

    def lookup(self, *_a):
        return None


def t_r1_f04():
    c = {'expected': {'process': {'no_termination_before': 'CALLS_DONE'}}, 'predicates': [], 'case_input': {'sdk_calls': []}}
    out = {}
    for name, zt, want in (('zombie after CALLS_DONE', 9000, True), ('zombie before CALLS_DONE', 4000, False)):
        logs = plogs()
        logs['driver'].events = [{'kind': 'DIAGNOSTIC', 'data': {'milestone': 'CALLS_DONE', 'detail': {}}, 'seq': 0, 'mono_ns': '1'}]
        logs['driver'].recv_ns = [5000]
        w = {'termination': {'adapter': {'zombie_exit_code': 0, 'zombie_t_ns': zt, 'absent': False}}}
        ok, det = PACC.termination_exact(c, logs, w, FakeSeq())
        out[name] = [ok, want]
    check('D3-08 R1-F04: zombie_t_ns in no_termination_before (positive: zombie after CALLS_DONE passes; negative: zombie before it fails)',
          all(ok == want for ok, want in out.values()), out)


# ================================================================================================ node, compile, vocabulary
def t_node():
    check('host node pinned', sha(Path(NODE).read_bytes()) == NODE_SHA)
    bad = []
    for f in ('ts-driver.mjs', 'fixture-cli.mjs', 'extension-loader.mjs', 'transpile.mjs', 'channel.cjs', 'adapter-typescript'):
        r = subprocess.run([NODE, '--check', str(UNIT / 'node' / f)], capture_output=True, text=True, timeout=60)
        if r.returncode:
            bad.append([f, r.stderr[-200:]])
    r = subprocess.run([NODE, '--check', str(HERE / 'selftest_c31_driver.mjs')], capture_output=True, text=True, timeout=60)
    check('node --check of the node sources and of the driver selftest', not bad and r.returncode == 0, bad)
    for f in ('node/fixture-cli.mjs', 'node/adapter-typescript', 'node/extension-loader.mjs', 'node/transpile.mjs'):
        check('%s byte-equal to the admitted 2AC source' % f, (UNIT / f).read_bytes() == (G02 / 'sdk-batch-2ac-admission' / f).read_bytes())
    for f in ('fixture-rpc.py', 'python-driver.py', 'harness2b.py', 'adapter-python.py', 'adapter-python-exec', 'observer.py', 'own2b.py', 'ownmodels.py', 'bootstrap.py'):
        check('python/%s byte-equal to the admitted 2B-2 source' % f, (UNIT / 'python' / f).read_bytes() == (G02 / 'sdk-batch-2b2-admission/python' / f).read_bytes())
    for f in ('observer.py', 'bootstrap.py'):
        check('tslane/%s byte-equal to the admitted 2AC source' % f, (UNIT / 'tslane' / f).read_bytes() == (G02 / 'sdk-batch-2ac-admission/python' / f).read_bytes())
    SCRATCH.mkdir(parents=True, exist_ok=True)
    inp = SCRATCH / 'driver-selftest-input.json'
    inp.write_text(json.dumps({'cases': [c for c in DOC['cases'] if c['language'] == 'typescript'], 'c3vocab_calls': TSUP.C3VOCAB_CALLS,
                               'scratch': str(SCRATCH / 'drv')}, ensure_ascii=False))
    r = subprocess.run([NODE, str(HERE / 'selftest_c31_driver.mjs'), str(inp)], capture_output=True, text=True, timeout=120, cwd=str(SCRATCH))
    inp.unlink()
    try:
        tests = json.loads(r.stdout)['tests']
    except (ValueError, KeyError):
        tests = []
    check('driver selftest ran (selftest_c31_driver.mjs, own objects and generators, no SDK)', r.returncode == 0 and len(tests) >= 18, {'rc': r.returncode, 'stderr': r.stderr[-400:]})
    for t in tests:
        check('[node] ' + t['test'], t['ok'], t['detail'])


def t_compile():
    bad = []
    for p in sorted(list((UNIT / 'python').glob('*.py')) + list((UNIT / 'tslane').glob('*.py')) + list((UNIT / 'tools').glob('*.py')) + [Path(__file__)]):
        try:
            compile(p.read_text(), str(p), 'exec')
        except SyntaxError as exc:
            bad.append([str(p.relative_to(UNIT)), str(exc)])
    check('compile of every Python source of the unit (no bytecode written)', not bad, bad)


def main():
    for t in (t_ids_counts_tables, t_r3_12, t_e3_02, t_e3_03, t_e3_04_05, t_e3_06, t_spawn_zero, t_d3_07, t_r1_f02, t_r1_f03, t_r1_f04, t_node, t_compile):
        try:
            t()
        except Exception as exc:  # noqa: BLE001
            check(t.__name__ + ' raised', False, '%s: %s\n%s' % (type(exc).__name__, exc, traceback.format_exc()[-1500:]))
    srcs = {p.relative_to(UNIT).as_posix(): sha(p.read_bytes()) for p in sorted(list((UNIT / 'python').iterdir()) + list((UNIT / 'tslane').iterdir())
                                                                                 + list((UNIT / 'node').iterdir()) + list(HERE.glob('selftest_c31*')))}
    doc = {'kind': 'C31_OFFLINE_SELFTESTS', 'task': 'DX100-G02:IMPLEMENT-AND-ADMIT-SDK-SOURCE-CONTINUATION-3-1', 'evaluator_versions': [TACC.VERSION, PACC.VERSION],
           'sdk_imported': False, 'services': 0, 'network': False, 'passed': sum(1 for r in RESULTS if r['ok']), 'failed': sum(1 for r in RESULTS if not r['ok']),
           'results': RESULTS, 'sources_sha256': srcs, 'python': sys.version.split()[0]}
    (HERE / 'selftest-results.json').write_text(json.dumps(doc, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'passed': doc['passed'], 'failed': doc['failed'], 'failed_tests': [r['test'] for r in RESULTS if not r['ok']]}, ensure_ascii=False, indent=1))
    return 0 if doc['failed'] == 0 else 1


if __name__ == '__main__':
    sys.exit(main())
