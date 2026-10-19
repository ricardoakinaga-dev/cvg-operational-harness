"""Offline selftests of batch 2A helpers (no SDK, no service, no network). Run: python3 -I selftests/selftest_r3.py

Covers evaluator r3 (R3-12 class map against cases-2a.json#/predicate_table; composition with synthetic co-failures;
R3-F01; R3-F02; invariant "MISMATCH only from rules 2 and 6"; R3-08 deadline; robustness over empty RoleLogs;
reevaluate without the service document -> exit 1 with explicit message, R3-04), peer v2 planning against every frozen
peer_script (ordered single-use rules, nth order, unscripted error with merged data, forbidden codes and texts) and,
through the pinned host Node, the TS fixture wire bytes (fixture-cli.mjs wireFixture) and syntax of the node sources.
Writes selftests/selftest-results.json.
"""
import hashlib
import importlib.util
import itertools
import json
import subprocess
import sys
from pathlib import Path

sys.dont_write_bytecode = True
U = Path(__file__).resolve().parent.parent
PY = U / 'python'
NODE = '/home/ricardo/.nvm/versions/node/v24.20.0/bin/node'
NODE_SHA = '89af8424dd53e560b1933f87ba650d8bf57c83ca5a04600eefb31f416aabbae7'
SCRATCH = Path('/mnt/dados/cvg-work/cvg-codex100-batch2a-runtime-20261019/selftest-scratch')


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


ACC = load('st_acceptance', PY / 'acceptance.py')
OBS = load('st_observer', PY / 'observer.py')
CH = load('st_channel', PY / 'channel.py')
RPC = load('st_fixture_rpc', PY / 'fixture-rpc.py')
RPC.C = CH
DOC = json.loads((U / 'inputs' / 'spec-2a' / 'cases-2a.json').read_bytes())
RESULTS = []


def check(test, ok, detail=None):
    RESULTS.append({'test': test, 'ok': bool(ok), 'detail': detail})


# ------------------------------------------------------------------ evaluator r3
def t_class_map():
    table = DOC['predicate_table']
    bad = []
    for c in DOC['cases']:
        cls = ACC.plan(c['id'])['classes']
        for p in c['predicates']:
            if p not in table or cls.get(p) != table[p]['class']:
                bad.append([c['id'], p, cls.get(p), table.get(p, {}).get('class')])
    used = {p for c in DOC['cases'] for p in c['predicates']}
    check('R3-12 class map equals the frozen table for every case predicate', not bad, {'differences': bad, 'case_predicates': len(used)})
    kb = []
    for c in DOC['cases']:
        for p in (c['known_bad'] or {}).get('judged_by', []) if isinstance(c['known_bad'], dict) else []:
            if table[p]['class'] != 'client':
                kb.append([c['id'], p])
    check('R3-11 known_bad.judged_by predicates are class client', not kb, kb)


def items(*classes):
    return [{'id': 'p%d' % i, 'ok': False, 'class': k, 'detail': None} for i, k in enumerate(classes)]


def t_composition():
    c = ACC.CASES_DEF['2A-TS02']
    ts10 = ACC.CASES_DEF['2A-TS10']
    cases = [
        ('sanity + client -> INVALID_CAPTURE', c, 'PASS', items('peer_or_capture_sanity', 'client'), True, False, ('INVALID_CAPTURE', 4)),
        ('capture/order + client -> INVALID_CAPTURE', c, 'PASS', items('capture_order_or_cleanup', 'client'), True, False, ('INVALID_CAPTURE', 4)),
        ('evaluation_completed false -> INVALID_CAPTURE', c, 'PASS', items('client'), False, False, ('INVALID_CAPTURE', 3)),
        ('only client -> MISMATCH', c, 'PASS', items('client', 'client'), True, False, ('MISMATCH', 6)),
        ('only informational -> PASS_CLIENT_OBSERVATION', c, 'PASS', items('informational'), True, False, ('PASS_CLIENT_OBSERVATION', 7)),
        ('R3-F01 client + informational -> MISMATCH', c, 'PASS', items('client', 'informational'), True, False, ('MISMATCH', 6)),
        ('R3-F01 form not accepted + evaluation_completed false -> MISMATCH (rule 2)', c, 'KNOWN_SIGNAL_TERMINATION', items('client'), False, False, ('MISMATCH', 2)),
        ('order_unilateral -> INCONCLUSIVE', c, 'PASS', items('order_unilateral', 'client'), True, False, ('INCONCLUSIVE', 5)),
        ('no failure -> PASS_CLIENT_OBSERVATION', c, 'PASS', [], True, False, ('PASS_CLIENT_OBSERVATION', 7)),
        ('R3-08 INVALID by deadline in TS10 -> INCONCLUSIVE', ts10, 'INVALID_CAPTURE', [], True, True, ('INCONCLUSIVE', 1)),
        ('R3-08 INVALID by deadline in TS02 -> INVALID_CAPTURE', c, 'INVALID_CAPTURE', [], True, True, ('INVALID_CAPTURE', 1)),
        ('INVALID without deadline in TS10 -> INVALID_CAPTURE', ts10, 'INVALID_CAPTURE', [], True, False, ('INVALID_CAPTURE', 1)),
    ]
    for name, case, form, its, done, timeout, want in cases:
        got = ACC.compose(case, form, its, done, timeout)
        check('composition: ' + name, got == want, {'got': list(got), 'want': list(want)})
    # Invariant over every combination: MISMATCH only from rule 2 or rule 6; rule 6 only when the decisive failures are all client.
    classes = ['client', 'peer_or_capture_sanity', 'capture_order_or_cleanup', 'order_unilateral', 'informational']
    viol = []
    for case in ACC.CASES_DEF.values():
        for form in ACC.KNOWN_FORMS + ('INVALID_CAPTURE',):
            for r in range(len(classes) + 1):
                for combo in itertools.combinations(classes, r):
                    for done in (True, False):
                        for timeout in (True, False):
                            out, rule = ACC.compose(case, form, items(*combo), done, timeout)
                            decisive = [k for k in combo if k != 'informational']
                            if out == 'MISMATCH' and rule not in (2, 6):
                                viol.append([case['id'], form, combo, done, timeout, out, rule])
                            if rule == 6 and set(decisive) != {'client'}:
                                viol.append([case['id'], form, combo, done, timeout, out, rule])
                            if out == 'INCONCLUSIVE' and not (rule == 5 or (rule == 1 and case['inconclusive_on_deadline'] and timeout)):
                                viol.append([case['id'], form, combo, done, timeout, out, rule])
    check('invariant: MISMATCH only from rules 2/6; INCONCLUSIVE only by deadline or order_unilateral', not viol, {'violations': viol[:5]})


def empty_logs(case):
    return {r: OBS.RoleLog(r, {'attempt': 'x', 'case': case, 'nonce': 'n', 'source_sha256': '0' * 64}) for r in ('driver', 'adapter', 'peer')}


def t_r3f02_and_robustness():
    w = {'maps': {'ok': True}, 'os_checks': {}, 'role_mapped': [], 'step_witness': [], 'control_actions': []}
    acc = ACC.evaluate('2A-TS02', empty_logs('2A-TS02'), 'NO_CHILD', [], w)
    check('R3-F02 NO_CHILD in a case without it -> INVALID_CAPTURE (rule 1)', acc['capture_form'] == 'INVALID_CAPTURE' and acc['outcome'] == 'INVALID_CAPTURE'
          and acc['composition_rule'] == 1, {'form': acc['capture_form'], 'outcome': acc['outcome'], 'rule': acc['composition_rule']})
    acc = ACC.evaluate('2A-PY03', empty_logs('2A-PY03'), 'PREREADY_SIGNAL_TERMINATION', [], w)
    check('R3-F02 PREREADY in a case without it -> INVALID_CAPTURE (rule 1)', acc['capture_form'] == 'INVALID_CAPTURE' and acc['composition_rule'] == 1,
          {'form': acc['capture_form'], 'outcome': acc['outcome']})
    for form in ('NO_CHILD',):
        f, notes = ACC.capture_form('2A-TS10', form, [])
        check('R3-10 NO_CHILD kept where declared (2A-TS10)', f == 'NO_CHILD' and not notes, {'form': f})
    for form in ('PREREADY_SIGNAL_TERMINATION', 'NO_CHILD', 'KNOWN_SIGNAL_TERMINATION'):
        f, notes = ACC.capture_form('2A-TS12', form, [])
        check('R3-10 %s kept where declared (2A-TS12)' % form, f == form and not notes, {'form': f})
    bad = []
    for cid in ACC.CASES_DEF:
        for verdict in ('PASS', 'KNOWN_SIGNAL_TERMINATION', 'INVALID_CAPTURE'):
            acc = ACC.evaluate(cid, empty_logs(cid), verdict, [], w)
            ic = acc['implicit_predicates']['evaluation_completed']
            if not ic['ok'] or not acc['predicate_ids_match_plan'] or acc['outcome'] == 'PASS_CLIENT_OBSERVATION':
                bad.append([cid, verdict, ic, acc['outcome']])
    check('robustness: empty RoleLogs never raise, every predicate is computed, never PASS', not bad, {'problems': bad[:5]})


def t_reevaluate_no_doc():
    SCRATCH.mkdir(parents=True, exist_ok=True)
    empty = SCRATCH / 'no-acceptance'
    empty.mkdir(exist_ok=True)
    r = subprocess.run([sys.executable, '-I', str(PY / 'acceptance.py'), 'reevaluate', str(empty)], capture_output=True, text=True, timeout=60)
    check('R3-04 reevaluate without service acceptance.json -> exit 1 with explicit message', r.returncode == 1 and 'no service acceptance.json' in r.stderr,
          {'returncode': r.returncode, 'stderr': r.stderr.strip()[-200:]})
    empty.rmdir()
    r = subprocess.run([sys.executable, '-I', str(PY / 'acceptance.py')], capture_output=True, text=True, timeout=60)
    check('R3-04 docstring usage printed without arguments (exit 2)', r.returncode == 2 and 'reevaluate <case-dir>' in r.stdout, {'returncode': r.returncode})


# ------------------------------------------------------------------ peer v2
FORBIDDEN_TEXT = ('server_overloaded', 'retry limit', 'too many failed attempts')


def scan_forbidden(x, path='$'):
    out = []
    if isinstance(x, dict):
        if isinstance(x.get('code'), int) and -32099 <= x['code'] <= -32000:
            out.append(path + '.code')
        for k, v in x.items():
            out += scan_forbidden(v, path + '.' + k)
    elif isinstance(x, list):
        for i, v in enumerate(x):
            out += scan_forbidden(v, '%s[%d]' % (path, i))
    elif isinstance(x, str) and any(t in x.lower() for t in FORBIDDEN_TEXT):
        out.append(path)
    return out


def t_peer_v2():
    scripts = {c['id']: c['peer_script'] for c in DOC['cases'] if c.get('peer_script')}
    bad = {cid: scan_forbidden(ps) for cid, ps in scripts.items() if scan_forbidden(ps)}
    check('peer v2: no code in -32099..-32000 and no retryable text in any frozen peer_script', not bad, bad)
    nth_bad = []
    for cid, ps in scripts.items():
        seen = {}
        for i, rule in enumerate(ps['on_request']):
            m = dict(rule['match'])
            k = json.dumps({x: m[x] for x in m if x != 'nth'}, sort_keys=True)
            seen[k] = seen.get(k, 0) + 1
            if 'nth' in m and m['nth'] != seen[k]:
                nth_bad.append([cid, i, m['nth'], seen[k]])
    check('peer v2: every nth equals the order of the rule among identical matches', not nth_bad, nth_bad)

    def frames(ops):
        return [(o[0], o[2] if o[0] == 'write' else None, json.loads(o[3]) if o[0] == 'write' else (json.loads(o[2]) if o[0] == 'hold' else None)) for o in ops]

    # 2A-PY04: ordered single-use resolution of the two identical thread/resume {threadId: B} rules.
    s = RPC.ScriptV2(scripts['2A-PY04'])
    seq = [{'id': 'i', 'method': 'initialize', 'params': {}}, {'id': 'a', 'method': 'thread/resume', 'params': {'threadId': 'B'}},
           {'id': 'b', 'method': 'thread/resume', 'params': {'threadId': 'A'}}, {'id': 'c', 'method': 'thread/fork', 'params': {'threadId': None}},
           {'id': 'd', 'method': 'thread/resume', 'params': {'threadId': 'B'}},
           {'id': 'e', 'method': 'turn/start', 'params': {'threadId': 'A', 'input': [{'type': 'text', 'text': 'X'}], 'model': 'SYNTHETIC'}},
           {'id': 'f', 'method': 'thread/resume', 'params': {'threadId': 'B'}}]
    got = [s.plan(m)[0] for m in seq]
    last = s.plan({'id': 'g', 'method': 'turn/interrupt', 'params': {}})
    check('peer v2 2A-PY04: rules 0..5 in order, third resume B unscripted', got == [0, 1, 2, 3, 4, 5, None], got)
    # unscripted error with merged data
    err = json.loads(last[1][0][3])
    check('peer v2: unscripted request -> -32601 with data {cvg_synthetic, method}', last[0] is None and err == {
        'id': 'g', 'error': {'code': -32601, 'message': 'cvg synthetic: unscripted request', 'data': {'cvg_synthetic': True, 'method': 'turn/interrupt'}}}, err)
    # CONTROL: the frozen ctrl-2 reply
    s = RPC.ScriptV2(scripts['2A-CTRL01'])
    lines = [x for x in DOC['cases'] if x['id'] == '2A-CTRL01'][0]['control_client']['lines']
    r1 = s.plan(lines[0])
    r3 = s.plan(lines[2])
    want = dict({'id': 'ctrl-2'}, **[x for x in DOC['cases'] if x['id'] == '2A-CTRL01'][0]['expected']['server_reply_to_ctrl-2'])
    check('peer v2 2A-CTRL01: initialize scripted, ctrl-2 gets the frozen unscripted error', r1[0] == 0 and r3[0] is None and json.loads(r3[1][0][3]) == want,
          json.loads(r3[1][0][3]))
    # 2A-PY03: params_absent, before_reply alien response, exact-params rules
    s = RPC.ScriptV2(scripts['2A-PY03'])
    s.plan({'id': 'i', 'method': 'initialize', 'params': {}})
    i1, ops1 = s.plan({'id': 'u1', 'method': 'synthetic/echo'})
    i2, _ = s.plan({'id': 'u2', 'method': 'synthetic/echo', 'params': {'k': 1}})
    i3, _ = s.plan({'id': 'u3', 'method': 'synthetic/echo', 'params': {'k': 2}})
    f1 = frames(ops1)
    check('peer v2 2A-PY03: params_absent rule writes the alien response before the reply', i1 == 1 and i2 == 2 and i3 == 3
          and [x[1] for x in f1] == ['response', 'reply'] and f1[0][2]['id'] == '00000000-0000-4000-8000-000000000000' and f1[1][2]['id'] == 'u1', f1)
    s2 = RPC.ScriptV2(scripts['2A-PY03'])
    s2.plan({'id': 'i', 'method': 'initialize', 'params': {}})
    check('peer v2 2A-PY03: params present does not match params_absent', s2.plan({'id': 'x', 'method': 'synthetic/echo', 'params': None})[0] is None)
    # 2A-PY08: reply, four notifications, exit
    s = RPC.ScriptV2(scripts['2A-PY08'])
    s.plan({'id': 'i', 'method': 'initialize', 'params': {}})
    i, ops = s.plan({'id': 't', 'method': 'synthetic/trigger'})
    kinds = [o[0] if o[0] != 'write' else o[2] for o in ops]
    check('peer v2 2A-PY08: reply, 4 notifications, then exit', i == 1 and kinds == ['reply'] + ['notification'] * 4 + ['exit'], kinds)
    # 2A-PY07R: hold forever with the server request after receipt
    s = RPC.ScriptV2(scripts['2A-PY07R'])
    s.plan({'id': 'i', 'method': 'initialize', 'params': {}})
    i, ops = s.plan({'id': 'h', 'method': 'synthetic/hold'})
    check('peer v2 2A-PY07R: server_request approve-x then hold forever', i == 1 and ops[0][2] == 'server_request' and json.loads(ops[0][3])['id'] == 'approve-x'
          and ops[-1] == ('forever',), [o[:3] for o in ops])
    # 2A-PY10R: turn/start held until RELEASE_REPLY; goal path answered with the pause reply
    s = RPC.ScriptV2(scripts['2A-PY10R'])
    s.plan({'id': 'i', 'method': 'initialize', 'params': {}})
    i, ops = s.plan({'id': 'ts', 'method': 'turn/start', 'params': {'threadId': 't-synthetic'}})
    j, ops2 = s.plan({'id': 'g', 'method': 'thread/goal/set', 'params': {}})
    k, _ = s.plan({'id': 'x', 'method': 'turn/interrupt', 'params': {}})
    check('peer v2 2A-PY10R: turn/start held, goal path answered, interrupt unscripted', i == 1 and ops[0][0] == 'hold' and j == 2 and ops2[0][2] == 'reply'
          and k is None, [ops[0][0], ops2[0][2], k])
    # 2A-PY15 / 2A-PY16: params_subset routing
    s = RPC.ScriptV2(scripts['2A-PY15'])
    s.plan({'id': 'i', 'method': 'initialize', 'params': {}})
    a = s.plan({'id': 'a', 'method': 'turn/start', 'params': {'threadId': 't15', 'input': []}})[0]
    b = s.plan({'id': 'b', 'method': 'turn/start', 'params': {'threadId': 't15f', 'input': []}})[0]
    cc = s.plan({'id': 'c', 'method': 'turn/start', 'params': {'threadId': 't15i', 'input': []}})[0]
    check('peer v2 2A-PY15: params_subset routes the three turn/start', [a, b, cc] == [1, 2, 3], [a, b, cc])
    # constructor guards
    for bad_code in (-32000, -32050, -32099):
        ps = json.loads(json.dumps(scripts['2A-PY03']))
        ps['unscripted_error']['code'] = bad_code
        try:
            RPC.ScriptV2(ps)
            ok = False
        except Exception:  # noqa: BLE001
            ok = True
        check('peer v2: constructor rejects unscripted code %d' % bad_code, ok)
    ps = json.loads(json.dumps(scripts['2A-PY03']))
    ps['unscripted_error']['message'] = 'server_overloaded'
    try:
        RPC.ScriptV2(ps)
        ok = False
    except Exception:  # noqa: BLE001
        ok = True
    check('peer v2: constructor rejects a server_overloaded unscripted error', ok)


# ------------------------------------------------------------------ node
def t_node():
    sha = hashlib.sha256(Path(NODE).read_bytes()).hexdigest()
    check('host node pinned', sha == NODE_SHA, sha)
    bad = []
    for f in ('ts-driver.mjs', 'fixture-cli.mjs', 'extension-loader.mjs', 'transpile.mjs', 'channel.cjs', 'adapter-typescript'):
        r = subprocess.run([NODE, '--check', str(U / 'node' / f)], capture_output=True, text=True, timeout=60)
        if r.returncode != 0:
            bad.append([f, r.stderr[-300:]])
    check('node --check on the node sources', not bad, bad)
    rows = {c['id']: c['fixture'] for c in DOC['cases'] if c.get('language') == 'typescript' and c['fixture'] and 'no_child' not in c['fixture']
            and 'behavior' not in c['fixture']}
    js = ("import { wireFixture } from %s;\n"
          "const rows = JSON.parse(process.argv[1]); const out = {};\n"
          "for (const [k, fx] of Object.entries(rows)) { const w = wireFixture(fx); out[k] = { stdout: w.stdout.toString('hex'), chunks: w.chunks.map(c => c.length), stderr: w.stderr.toString('hex'), code: w.code }; }\n"
          "process.stdout.write(JSON.stringify(out));\n") % json.dumps('file://' + str(U / 'node' / 'fixture-cli.mjs'))
    r = subprocess.run([NODE, '--input-type=module', '-e', js, json.dumps(rows)], capture_output=True, text=True, timeout=60, cwd=str(SCRATCH))
    diff = []
    if r.returncode == 0:
        got = json.loads(r.stdout)
        for k, fx in rows.items():
            if 'JSONL' in fx:
                want = ''.join((ln if isinstance(ln, str) else json.dumps(ln, separators=(',', ':'), ensure_ascii=False)) + '\n' for ln in fx['JSONL']).encode()
                chunks = [len(want)]
            else:
                want = b''.join(bytes.fromhex(h) for h in fx['stdout_chunks_hex'])
                chunks = [len(bytes.fromhex(h)) for h in fx['stdout_chunks_hex']]
            g = got.get(k, {})
            if g.get('stdout') != want.hex() or g.get('chunks') != chunks or g.get('code') != fx['exit_code'] or g.get('stderr') != fx['stderr'].encode().hex():
                diff.append(k)
    check('fixture-cli wireFixture bytes equal the evaluator/observer reconstruction for every TS fixture', r.returncode == 0 and not diff,
          {'returncode': r.returncode, 'stderr': r.stderr[-300:], 'differences': diff, 'fixtures': sorted(rows)})


def main():
    SCRATCH.mkdir(parents=True, exist_ok=True)
    for t in (t_class_map, t_composition, t_r3f02_and_robustness, t_reevaluate_no_doc, t_peer_v2, t_node):
        try:
            t()
        except Exception as exc:  # noqa: BLE001
            check(t.__name__ + ' raised', False, '%s: %s' % (type(exc).__name__, exc))
    srcs = {p.relative_to(U).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in sorted(list((U / 'python').glob('*.py')) + list((U / 'node').glob('*')) + [Path(__file__).resolve()])}
    doc = {'kind': 'BATCH_2A_OFFLINE_SELFTESTS', 'evaluator_version': ACC.VERSION, 'sdk_imported': False, 'services': 0, 'network': False,
           'passed': sum(1 for r in RESULTS if r['ok']), 'failed': sum(1 for r in RESULTS if not r['ok']), 'results': RESULTS,
           'sources_sha256': srcs, 'python': sys.version.split()[0]}
    (U / 'selftests' / 'selftest-results.json').write_text(json.dumps(doc, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'passed': doc['passed'], 'failed': doc['failed'], 'failed_tests': [r['test'] for r in RESULTS if not r['ok']]}, ensure_ascii=False, indent=1))
    return 0 if doc['failed'] == 0 else 1


if __name__ == '__main__':
    sys.exit(main())
