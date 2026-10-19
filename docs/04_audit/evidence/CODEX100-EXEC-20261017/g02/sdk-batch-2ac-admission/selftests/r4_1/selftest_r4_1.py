"""Repair R1 selftests (offline; no SDK, no service, no network). Run: python3 -I -B selftests/r4_1/selftest_r4_1.py

Adds the freeze-r4 proofs that review R1 (R1-F01) found missing or weaker than the contract, without touching the frozen
sources or selftests/selftest_r4.py: F4-09 recorder (own stream error without listener, and the recorder/drain/CALLS_DONE order
in ts-driver.mjs), F4-12 barrier drain -> release (supervisor source order and the three service windows), F4-11 the generic
r3.1 suite ported to the r4 table, F4-01 per-slot role reserialization (Node JSON.stringify over the channel strictJSON and the
Python channel json.dumps, over every preserved adapter-config.json), F4-05 with the sorted stdout of 2A-PY03 of the batch 2A
admission, F4-04 order of the exit-frame effects (the exit block of fixture-rpc.py executed against a pipe on fd 1 and a recording channel),
F4-02 Node wireFixture against the supervisor frozen_wire (ported from r3.1), F4-06 IN_Q_OVERFLOW and IN_IGNORED at ExecWitness.drain, F4-10 ID acceptance
and rejection. Writes selftests/r4_1/selftest-results.json.
"""
import glob
import hashlib
import importlib.util
import itertools
import json
import os
import shutil
import struct
import subprocess
import sys
import time
from pathlib import Path

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
U = HERE.parent.parent
PY = U / 'python'
A2 = U.parent / 'sdk-batch-2a-admission'
NODE = '/home/ricardo/.nvm/versions/node/v24.20.0/bin/node'
SCRATCH = Path('/mnt/dados/cvg-work/cvg-codex100-batch2ac-runtime-20261019/selftest-scratch/r4_1')
RESULTS = []


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


ACC = load('r41_acceptance', PY / 'acceptance.py')
OBS = load('r41_observer', PY / 'observer.py')
CH = load('r41_channel', PY / 'channel.py')
RPC = load('r41_fixture_rpc', PY / 'fixture-rpc.py')
RPC.C = CH
SUP = load('r41_supervisor', PY / 'supervisor.py')
DOC = json.loads((U / 'inputs' / 'spec-2ac' / 'cases-2a-cont.json').read_bytes())


def check(test, ok, detail=None):
    RESULTS.append({'test': test, 'ok': bool(ok), 'detail': detail})


def sha(b):
    return hashlib.sha256(b).hexdigest()


def node(js, *args):
    r = subprocess.run([NODE, '--input-type=module', '-e', js] + list(args), capture_output=True, text=True, timeout=120, cwd=str(SCRATCH))
    return r.returncode, r.stdout, r.stderr


# ------------------------------------------------------------------ F4-09 recorder
def t_recorder():
    js = ("import { Writable } from 'node:stream';\n"
          "const recorded = []; process.on('uncaughtException', e => recorded.push(e));\n"
          "const w = new Writable({ write(_c, _e, cb) { cb(Object.assign(new Error('write EPIPE'), { code: 'EPIPE', syscall: 'write' })); } });\n"
          "w.write('x');\n"
          "setTimeout(() => { console.log(JSON.stringify({ count: recorded.length, code: recorded[0]?.code, syscall: recorded[0]?.syscall, alive: true })); }, 500);\n")
    rc, out, err = node(js)
    got = json.loads(out) if rc == 0 and out.strip() else {}
    check('F4-09 an own stream error without listener reaches the recorder and the process continues', got == {'count': 1, 'code': 'EPIPE', 'syscall': 'write', 'alive': True},
          {'rc': rc, 'out': got, 'stderr': err[-200:]})
    src = (U / 'node' / 'ts-driver.mjs').read_text()
    i_reg = src.find("if (config.case === '2A-TS10E') process.on('uncaughtException', e => recorded.push(e));")
    i_drain = src.find("await new Promise(resolve => setTimeout(resolve, 500)); // F4-09 drain after the run settled")
    i_emit = src.find("for (const e of recorded) await ch.emit('DIAGNOSTIC', { milestone: 'UNCAUGHT'")
    i_final = src.find("await ch.emit('DIAGNOSTIC', { milestone: 'TMP_LISTING', detail: { step: 'final'")
    i_done = src.find("await ch.emit('DIAGNOSTIC', { milestone: 'CALLS_DONE'")
    check('F4-09 recorder registered before the steps, drained 500 ms, emitted before the final listing and CALLS_DONE',
          0 < i_reg < i_drain < i_emit < i_final < i_done, {'offsets': [i_reg, i_drain, i_emit, i_final, i_done]})
    for case_dir in sorted(glob.glob(str(U / 'cases' / '2A-TS10E-*'))) + sorted(glob.glob(str(U / 'diagnostics' / '*-DIAG-TS-EPIPE'))):
        ev = [json.loads(x) for x in Path(case_dir, 'events-driver.jsonl').read_text().splitlines()]
        un = [e['seq'] for e in ev if e['kind'] == 'DIAGNOSTIC' and e['data']['milestone'] == 'UNCAUGHT']
        done = [e['seq'] for e in ev if e['kind'] == 'DIAGNOSTIC' and e['data']['milestone'] == 'CALLS_DONE']
        check('F4-09 service: exactly one UNCAUGHT before CALLS_DONE in %s' % Path(case_dir).name, len(un) == 1 and done and un[0] < done[0], {'uncaught_seq': un, 'calls_done_seq': done})


# ------------------------------------------------------------------ F4-12 barrier
def t_barrier():
    src = (PY / 'supervisor.py').read_text()
    i_open = src.find('self.exec_witness.open_window()')
    i_rel = src.find("self.send('driver', 'STEP_RELEASE', tag=step)")
    check('F4-12 supervisor drains (open_window) before sending STEP_RELEASE', 0 < i_open < i_rel, {'open_window': i_open, 'step_release': i_rel})
    for res in sorted(glob.glob(str(U / '*' / '*' / 'result.json'))):
        r = json.loads(Path(res).read_text())
        ew = r.get('exec_witness')
        if not ew:
            continue
        rel = [a['t_ns'] for a in r['actions'] if a['action'] == 'CONTROL' and a['detail'].get('command') == 'STEP_RELEASE']
        d = Path(res).parent
        ev = [json.loads(x) for x in (d / 'events-driver.jsonl').read_text().splitlines()]
        rv = [json.loads(x)['recv_ns'] for x in (d / 'events-driver.recv.jsonl').read_text().splitlines()]
        iw = [i for i, e in enumerate(ev) if e['kind'] == 'DIAGNOSTIC' and e['data']['milestone'] == 'STEP_WITNESS'
              and (e['data'].get('detail') or {}).get('kind') == 'WINDOW_OPEN']
        chain = [rv[iw[0]], ew['window_open_ns'], rel[0], rv[iw[0] + 1]] if iw and rel and iw[0] + 1 < len(rv) else []
        check('F4-12 service: driver WINDOW_OPEN frame -> drain (window open) -> STEP_RELEASE -> next driver frame in %s' % r['case'],
              len(chain) == 4 and chain == sorted(chain) and ew['state'] == 'closed', {'recv_window_open_frame': chain[:1], 'window_open_ns': ew['window_open_ns'],
                                                                                      'release_t_ns': rel[:1], 'recv_next_driver_frame': chain[3:]})


# ------------------------------------------------------------------ F4-11 r3.1 generic suite ported to the r4 table
def empty_logs(case):
    return {r: OBS.RoleLog(r, {'attempt': 'x', 'case': case, 'nonce': 'n', 'source_sha256': '0' * 64}) for r in ('driver', 'adapter', 'peer')}


def items(*classes):
    return [{'id': 'p%d' % i, 'ok': False, 'class': k, 'detail': None} for i, k in enumerate(classes)]


def t_r31_ported():
    table = DOC['predicate_table']
    kb = [[c['id'], p] for c in DOC['cases'] for p in c['known_bad']['judged_by'] if table[p]['class'] != 'client']
    check('ported R3-11 known_bad.judged_by predicates are class client', not kb, kb)
    c = ACC.CASES_DEF['2A-TS03R']
    check('ported rule 2: form not accepted -> MISMATCH', ACC.compose(c, 'KNOWN_SIGNAL_TERMINATION', items('client'), False, False) == ('MISMATCH', 2))
    check('ported rule 5: order_unilateral -> INCONCLUSIVE', ACC.compose(c, 'PASS', items('order_unilateral', 'client'), True, False) == ('INCONCLUSIVE', 5))
    t12 = ACC.CASES_DEF['2A-TS12R']
    check('ported R3-08: deadline in 2A-TS12R -> INCONCLUSIVE', ACC.compose(t12, 'INVALID_CAPTURE', [], True, True) == ('INCONCLUSIVE', 1))
    check('ported R3-08: deadline in 2A-TS03R -> INVALID_CAPTURE', ACC.compose(c, 'INVALID_CAPTURE', [], True, True) == ('INVALID_CAPTURE', 1))
    f, notes = ACC.capture_form('2A-TS03R', 'NO_CHILD', [])
    check('ported R3-F02: NO_CHILD in 2A-TS03R -> INVALID_CAPTURE', f == 'INVALID_CAPTURE' and notes)
    w = {'maps': {'ok': True}, 'os_checks': {}, 'role_mapped': [], 'step_witness': [], 'control_actions': []}
    bad = []
    for cid in ACC.CASES_DEF:
        for verdict in ('PASS', 'KNOWN_SIGNAL_TERMINATION', 'INVALID_CAPTURE'):
            acc = ACC.evaluate(cid, empty_logs(cid), verdict, [], w)
            if not acc['implicit_predicates']['evaluation_completed']['ok'] or not acc['predicate_ids_match_plan'] or acc['outcome'] == 'PASS_CLIENT_OBSERVATION':
                bad.append([cid, verdict, acc['outcome']])
    check('ported robustness: empty RoleLogs in the 9 slots never raise and never PASS', not bad, bad[:5])
    base = DOC['cases'][-1]['peer_script']
    rej = []
    for code in (-32000, -32050, -32099):
        ps = json.loads(json.dumps(base))
        ps['unscripted_error']['code'] = code
        try:
            RPC.ScriptV2(ps)
        except Exception:  # noqa: BLE001
            rej.append(code)
    ps = json.loads(json.dumps(base))
    ps['unscripted_error']['message'] = 'server_overloaded'
    try:
        RPC.ScriptV2(ps)
    except Exception:  # noqa: BLE001
        rej.append('server_overloaded')
    check('ported peer v2 constructor rejects server-range codes and server_overloaded', rej == [-32000, -32050, -32099, 'server_overloaded'], rej)
    r = subprocess.run([sys.executable, '-I', '-B', str(PY / 'acceptance.py')], capture_output=True, text=True, timeout=60)
    check('ported usage: no arguments -> exit 2', r.returncode == 2 and 'reevaluate <case-dir>' in r.stdout)
    src = sorted(glob.glob(str(U / 'cases' / '2A-TS08X-*')))[0]
    copy = SCRATCH / Path(src).name
    if copy.exists():
        shutil.rmtree(copy)
    shutil.copytree(src, copy)
    rc0 = subprocess.run([sys.executable, '-I', '-B', str(PY / 'acceptance.py'), 'reevaluate', str(copy)], capture_output=True, text=True, timeout=120).returncode
    doc = json.loads((copy / 'acceptance.json').read_text())
    original = json.dumps(doc)
    doc['predicates'][0]['detail'] = {'perturbed': True}
    (copy / 'acceptance.json').write_text(json.dumps(doc))
    rc1 = subprocess.run([sys.executable, '-I', '-B', str(PY / 'acceptance.py'), 'reevaluate', str(copy)], capture_output=True, text=True, timeout=120).returncode
    doc = json.loads(original)
    doc['evaluator_version'] = 'acceptance-r3.1'
    (copy / 'acceptance.json').write_text(json.dumps(doc))
    r2 = subprocess.run([sys.executable, '-I', '-B', str(PY / 'acceptance.py'), 'reevaluate', str(copy)], capture_output=True, text=True, timeout=120)
    shutil.rmtree(copy)
    check('ported reevaluate: unperturbed 0, perturbed detail 1, foreign version 1 with message', rc0 == 0 and rc1 == 1 and r2.returncode == 1 and 'evaluator_version' in r2.stderr,
          {'unperturbed': rc0, 'perturbed': rc1, 'foreign': r2.returncode})


# ------------------------------------------------------------------ F4-01 per-slot role reserialization
def t_reserialization():
    configs = sorted(glob.glob(str(U / 'cases' / '*' / 'profile' / 'adapter-config.json'))) + sorted(glob.glob(str(U / 'diagnostics' / '*' / 'profile' / 'adapter-config.json')))
    js = ("const C = (await import('node:module')).createRequire(import.meta.url)(%s);\n"
          "import fs from 'node:fs'; import crypto from 'node:crypto';\n"
          "const out = {}; for (const p of JSON.parse(process.argv[1])) { const c = C.strictJSON(fs.readFileSync(p)); out[p] = crypto.createHash('sha256').update(Buffer.from(JSON.stringify(c.case_input))).digest('hex'); }\n"
          "console.log(JSON.stringify(out));\n") % json.dumps(str(U / 'node' / 'channel.cjs'))
    rc, out, err = node(js, json.dumps(configs))
    node_sha = json.loads(out) if rc == 0 and out.strip() else {}
    bad = []
    for p in configs:
        cfg = CH.strict_json(Path(p).read_bytes())
        py_sha = sha(json.dumps(cfg['case_input'], ensure_ascii=False, separators=(',', ':')).encode('utf-8'))
        frozen = None
        case = cfg['case']
        if case in ACC.CASES_DEF:
            frozen = ACC.CASES_DEF[case]['case_input_sha256']
        if node_sha.get(p) != py_sha or (frozen is not None and py_sha != frozen):
            bad.append([case, node_sha.get(p), py_sha, frozen])
    check('F4-01 Node JSON.stringify over strictJSON == Python channel json.dumps == frozen sha in every preserved adapter-config.json',
          rc == 0 and not bad and len(configs) == 20, {'configs': len(configs), 'differences': bad[:3], 'stderr': err[-200:]})


# ------------------------------------------------------------------ F4-05 with the sorted 2A-PY03 stdout
def t_peer_replay_2a():
    case_dir = sorted(glob.glob(str(A2 / 'cases' / '2A-PY03-*')))[0]
    spec2a = json.loads((A2 / 'inputs' / 'spec-2a' / 'cases-2a.json').read_bytes())
    ps = [c for c in spec2a['cases'] if c['id'] == '2A-PY03'][0]['peer_script']
    a = OBS.RoleLog('adapter', {'attempt': 'x', 'case': 'c', 'nonce': 'n', 'source_sha256': '0' * 64})
    ev = [json.loads(x) for x in Path(case_dir, 'events-adapter.jsonl').read_text().splitlines()]
    import base64
    for s in ('stdin', 'stdout'):
        b = b''.join(base64.b64decode(e['data']['base64']) for e in ev if e['kind'] == 'RAW_READ' and e['data']['stream'] == s)
        a.data[s] = bytearray(b)
        a.committed[s] = len(b)
    a.terminal = 'END'
    a.events = [e for e in ev if e['kind'] == 'END']
    frozen = ACC.peer_replay_check({'peer_script': ps}, {'adapter': a})
    sorted_ps = json.loads(json.dumps(ps, sort_keys=True))
    sorted_rep = ACC.peer_replay_check({'peer_script': sorted_ps}, {'adapter': a})
    check('F4-05 the sorted 2A-PY03 peer stdout is rejected against the frozen-order replay', frozen['status'] == 'MISMATCH', frozen)
    check('F4-05 and accepted against the sorted replay (the 2A delivery)', sorted_rep['status'] == 'EQUAL', sorted_rep)


# ------------------------------------------------------------------ F4-04 exit effects order
EXIT_HARNESS = r"""
import json, os, sys, textwrap
block = textwrap.dedent(sys.argv[1])
r, w = os.pipe()
os.dup2(w, 1)
os.close(w)
os.set_blocking(r, False)
log = []


def state():
    try:
        os.fstat(1)
        fd1_open = True
    except OSError:
        fd1_open = False
    try:
        eof = os.read(r, 1) == b''
    except BlockingIOError:
        eof = False
    return {'fd1_open': fd1_open, 'reader_eof': eof}


class Ch:
    def emit(self, kind, data):
        log.append(dict({'call': 'emit', 'kind': kind, 'milestone': data.get('milestone'), 'detail': data.get('detail'), 'complete': data.get('complete')}, **state()))

    def finish_controls(self):
        log.append(dict({'call': 'finish_controls'}, **state()))

    def close_fds(self):
        log.append(dict({'call': 'close_fds'}, **state()))


class Exit(Exception):
    pass


def fake_exit(code):
    log.append({'call': '_exit', 'code': code})
    raise Exit()


os._exit = fake_exit
try:
    exec(block, {'os': os, 'ch': Ch(), 'exiting': True, 'out': [], 'written': 3})
except Exit:
    pass
sys.stderr.write(json.dumps(log))
"""


def t_exit_effects():
    src = (PY / 'fixture-rpc.py').read_text()
    block = src[src.find('            if exiting and not out:'):src.find('            if finishing and not out:')]
    r = subprocess.run([sys.executable, '-I', '-B', '-c', EXIT_HARNESS, block], capture_output=True, text=True, timeout=60)
    log = json.loads(r.stderr) if r.stderr.strip().startswith('[') else []
    calls = [x['call'] if x['call'] != 'emit' else 'emit:%s' % (x['milestone'] or x['kind']) for x in log]
    first = log[0] if log else {}
    check('F4-04 exit frame effects executed from the source block: close(1) -> EXIT_AFTER_SCRIPT -> finish_controls -> END(complete) -> close_fds -> exit 0',
          calls == ['emit:EXIT_AFTER_SCRIPT', 'finish_controls', 'emit:END', 'close_fds', '_exit'] and log[2]['complete'] is True and log[-1]['code'] == 0,
          {'calls': calls, 'rc': r.returncode, 'stderr': r.stderr[-200:] if not log else None})
    check('F4-04 when EXIT_AFTER_SCRIPT is emitted, fd 1 is already closed and the stdout reader already sees EOF',
          bool(first) and first['fd1_open'] is False and first['reader_eof'] is True and first['detail'] == {'written': 3, 'stdout_closed': True}, first)


# ------------------------------------------------------------------ F4-02 wireFixture (Node) == frozen_wire (supervisor)
def t_wire_fixture():
    configs = sorted(glob.glob(str(U / 'cases' / '*' / 'profile' / 'adapter-config.json'))) + sorted(glob.glob(str(U / 'diagnostics' / '*' / 'profile' / 'adapter-config.json')))
    ts = []
    for p in configs:
        cfg = CH.strict_json(Path(p).read_bytes())
        if cfg['language'] == 'typescript' and SUP.frozen_wire(SUP.ts_fixture(cfg['case'])) is not None:
            ts.append(p)
    js = ("const M = await import(%s); const C = (await import('node:module')).createRequire(import.meta.url)(%s); import fs from 'node:fs';\n"
          "const out = {}; for (const p of JSON.parse(process.argv[1])) { const c = C.strictJSON(fs.readFileSync(p)); const w = M.wireFixture(M.fixtureOf(c.case_input));"
          " out[c.case] = { stdout: w.stdout.toString('hex'), stderr: w.stderr.toString('hex') }; }\n"
          "console.log(JSON.stringify(out));\n") % (json.dumps('file://' + str(U / 'node' / 'fixture-cli.mjs')), json.dumps(str(U / 'node' / 'channel.cjs')))
    rc, out, err = node(js, json.dumps(ts))
    got = json.loads(out) if rc == 0 and out.strip() else {}
    bad = []
    for case, w in got.items():
        f = SUP.frozen_wire(SUP.ts_fixture(case))
        if w != {'stdout': f['stdout'].hex(), 'stderr': f['stderr'].hex()}:
            bad.append(case)
    check('F4-02 ported r3.1: Node wireFixture over the delivered case_input equals the supervisor frozen_wire in every TS directory with a wire fixture',
          rc == 0 and len(got) == len(ts) and len(ts) > 0 and not bad, {'compared': sorted(got), 'differences': bad, 'stderr': err[-200:]})


# ------------------------------------------------------------------ F4-06 overflow and ignored at drain level
def t_drain_failures():
    target = SCRATCH / 'drain-target'
    target.write_text('x')
    w = SUP.ExecWitness(target, time.monotonic_ns())
    r, wr = os.pipe()
    os.set_blocking(r, False)
    os.write(wr, struct.pack('iIII', -1, 0x4000, 0, 0))
    os.close(w.fd)
    w.fd = r
    w.drain()
    check('F4-06 IN_Q_OVERFLOW read by drain marks a capture failure', w.failure and 'IN_Q_OVERFLOW' in w.failure, w.failure)
    os.close(wr)
    w2 = SUP.ExecWitness(target, time.monotonic_ns())
    target.unlink()
    time.sleep(0.05)
    w2.drain()
    check('F4-06 IN_IGNORED (watched file removed) marks a capture failure', w2.failure and 'IN_IGNORED' in w2.failure, w2.failure)
    os.close(w2.fd)
    try:
        os.close(r)
    except OSError:
        pass


# ------------------------------------------------------------------ F4-10 IDs
def t_ids():
    src = (U / 'node' / 'channel.cjs').read_text()
    rx = src[src.find("/^(?:2A-TS(?:03R"):]
    rx = rx[:rx.find("$/") + 2]
    accept = ['2A-TS03R', '2A-TS06R', '2A-TS07R', '2A-TS12R', '2A-TS10E', '2A-TS06X', '2A-TS07X', '2A-TS08X', 'DIAG-TS-EPIPE']
    reject = ['2A-TS03', '2A-TS12', '2A-TS10', '2AC-CTRL01', '2A-TS13R', '2A-PY03']
    js = "const re = %s; console.log(JSON.stringify(JSON.parse(process.argv[1]).map(x => re.test(x))));" % rx
    rc, out, err = node(js, json.dumps(accept + reject))
    got = json.loads(out) if rc == 0 else []
    check('F4-10 TS IDs: continuation accepted, batch 2A and others rejected', got == [True] * len(accept) + [False] * len(reject), {'got': got, 'stderr': err[-200:]})
    py = (PY / 'channel.py').read_text()
    check('F4-10 Python lane: only 2AC-CTRL01 and DIAG-PY rows', "control_case = case == '2AC-CTRL01'" in py and 'sdk_case = case in ()' in py)


def main():
    SCRATCH.mkdir(parents=True, exist_ok=True)
    for t in (t_recorder, t_barrier, t_r31_ported, t_reserialization, t_peer_replay_2a, t_exit_effects, t_wire_fixture, t_drain_failures, t_ids):
        try:
            t()
        except Exception as exc:  # noqa: BLE001
            check(t.__name__ + ' raised', False, '%s: %s' % (type(exc).__name__, exc))
    srcs = {p.relative_to(U).as_posix(): sha(p.read_bytes()) for p in sorted(list(PY.glob('*.py')) + list((U / 'node').glob('*')) + [Path(__file__).resolve()])}
    doc = {'kind': 'REPAIR_R1_OFFLINE_SELFTESTS_R4_1', 'evaluator_version': ACC.VERSION, 'sdk_imported': False, 'services': 0, 'network': False,
           'passed': sum(1 for r in RESULTS if r['ok']), 'failed': sum(1 for r in RESULTS if not r['ok']), 'results': RESULTS, 'sources_sha256': srcs,
           'note': 'Complementa selftests/selftest-results.json (suíte r4, 54/54, congelada em source-freeze-r4) sem reescrevê-la.'}
    (HERE / 'selftest-results.json').write_text(json.dumps(doc, ensure_ascii=False, indent=2) + '\n')
    shutil.rmtree(SCRATCH, ignore_errors=True)
    print(json.dumps({'passed': doc['passed'], 'failed': doc['failed'], 'failed_tests': [r['test'] for r in RESULTS if not r['ok']]}, ensure_ascii=False, indent=1))
    return 0 if doc['failed'] == 0 else 1


if __name__ == '__main__':
    sys.exit(main())
