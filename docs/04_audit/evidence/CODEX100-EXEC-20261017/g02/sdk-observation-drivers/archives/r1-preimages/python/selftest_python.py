"""Pure-data selftest of the Python helpers and of the independent observer (host python3.12 -I).

No SDK, Pydantic or compiler import. The only OS objects are own FIFOs inside a fresh
private directory under the unit runtime root, removed at the end. Also runs the Node
pure selftest (pinned Node v24.20.0) and decodes its frames with the Python observer.
Usage: python3 -I selftest_python.py <output-dir>
"""
import sys

sys.dont_write_bytecode = True
import base64  # noqa: E402
import errno  # noqa: E402
import hashlib  # noqa: E402
import importlib.util  # noqa: E402
import json  # noqa: E402
import os  # noqa: E402
import secrets  # noqa: E402
import shutil  # noqa: E402
import subprocess  # noqa: E402
from pathlib import Path  # noqa: E402

HERE = Path(__file__).resolve().parent
UNIT = HERE.parent
NODE = '/home/ricardo/.nvm/versions/node/v24.20.0/bin/node'


def load(name, mod):
    spec = importlib.util.spec_from_file_location(mod, HERE / name)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


CH = load('channel.py', 'cvg_channel')
OBS = load('observer.py', 'cvg_observer')
RPC = load('fixture-rpc.py', 'cvg_fixture_rpc')
DRV = load('python-driver.py', 'cvg_python_driver')
SUP = load('supervisor.py', 'cvg_supervisor')

results = []


def check(cid, fn):
    try:
        ok = fn()
        results.append({'id': cid, 'status': 'FAIL' if ok is False else 'PASS'})
    except Exception as exc:  # noqa: BLE001
        results.append({'id': cid, 'status': 'FAIL', 'error': ('%s: %s' % (type(exc).__name__, exc))[:200]})


def rejects(cid, fn):
    try:
        fn()
    except Exception as exc:  # noqa: BLE001
        results.append({'id': cid, 'status': 'PASS', 'rejected': ('%s: %s' % (type(exc).__name__, exc))[:120]})
    else:
        results.append({'id': cid, 'status': 'FAIL', 'error': 'accepted known-bad input'})


A, N, SRC = 'a' * 40, 'b' * 40, 'c' * 64
EXPECT = {'attempt': A, 'case': 'DIAG-PY-RPC', 'nonce': N, 'source_sha256': SRC}


def sha(b):
    return hashlib.sha256(b).hexdigest()


def ev(role, seq, kind, data, mono=None, **kw):
    e = {'v': 1, 'attempt': A, 'case': 'DIAG-PY-RPC', 'role': role, 'seq': seq, 'kind': kind, 'pid': 7,
         'mono_ns': str(1000000 + seq * 10 if mono is None else mono), 'data': json.loads(json.dumps(data))}  # no shared mutable data
    e.update(kw)
    return e


def raw_frame(obj, text=None):
    payload = (text if text is not None else json.dumps(obj, separators=(',', ':'))).encode('utf-8')
    return len(payload).to_bytes(4, 'big') + payload


def rr(stream, off, b):
    return {'stream': stream, 'offset': off, 'base64': base64.b64encode(b).decode(), 'sha256': sha(b)}


def counters(b, committed=None):
    return {'read_bytes': len(b), 'committed_bytes': len(b) if committed is None else committed, 'read_sha256': sha(b)}


REQ, REP = b'{"id":"1","method":"x"}\n', b'{"id":"1","result":{}}\n'
BEGIN = {'nonce': N, 'source_sha256': SRC, 'pid_namespace': 'pid:[4026532000]'}


def adapter_good():
    return [ev('adapter', 0, 'BEGIN', BEGIN), ev('adapter', 1, 'READY', {}),
            ev('adapter', 2, 'RAW_READ', rr('stdin', 0, REQ)),
            ev('adapter', 3, 'FORWARD_COMMIT', {'stream': 'stdin', 'offset': 0, 'bytes': 10}),
            ev('adapter', 4, 'FORWARD_COMMIT', {'stream': 'stdin', 'offset': 10, 'bytes': len(REQ) - 10}),
            ev('adapter', 5, 'RAW_READ', rr('stdout', 0, REP)),
            ev('adapter', 6, 'FORWARD_COMMIT', {'stream': 'stdout', 'offset': 0, 'bytes': len(REP)}),
            ev('adapter', 7, 'STREAM_END', dict({'stream': 'stdout'}, **counters(REP))),
            ev('adapter', 8, 'STREAM_END', dict({'stream': 'stderr'}, **counters(b''))),
            ev('adapter', 9, 'STREAM_END', dict({'stream': 'stdin'}, **counters(REQ))),
            ev('adapter', 10, 'END', {'streams': {'stdin': counters(REQ), 'stdout': counters(REP), 'stderr': counters(b'')},
                                      'child_exit_code': 0, 'child_signal': None, 'complete': True})]


def feed(role, frames, finish=True):
    log = OBS.RoleLog(role, EXPECT)
    log.feed(b''.join(frames), 0)
    if finish:
        log.finish()
    return log


def bad(cid, events=None, frames=None, role='adapter'):
    def run():
        fr = frames if frames is not None else [raw_frame(e) for e in events]
        log = feed(role, fr)
        if log.violation is None:
            raise AssertionError('no violation')
        raise OBS.Violation(log.violation)
    rejects('observer.' + cid, run)


def mutate(idx, fn):
    evs = adapter_good()
    fn(evs, idx)
    return evs


# ---------------------------------------------------------------- observer positives and known-bad controls
check('observer.adapter_good', lambda: feed('adapter', [CH.encode_frame(e) for e in adapter_good()]).status() == 'END')
check('observer.split_feed', lambda: (lambda log: (log.feed(b''.join(CH.encode_frame(e) for e in adapter_good())[:9], 0), log.feed(
    b''.join(CH.encode_frame(e) for e in adapter_good())[9:], 0), log.finish(), log.status())[-1] == 'END')(OBS.RoleLog('adapter', EXPECT)))
bad('omitted_raw_read', mutate(2, lambda e, i: e.pop(i)))
bad('raw_sha_corrupt', mutate(2, lambda e, i: e[i]['data'].update(sha256='d' * 64)))
bad('raw_base64_noncanonical', mutate(2, lambda e, i: e[i]['data'].update(base64=e[i]['data']['base64'].rstrip('='))))
bad('false_commit_beyond_read', mutate(4, lambda e, i: e[i]['data'].update(bytes=len(REQ))))
bad('seq_gap', mutate(3, lambda e, i: [x.update(seq=x['seq'] + 1) for x in e[i:]]))
bad('seq_duplicate', mutate(3, lambda e, i: e[i].update(seq=2)))
bad('late_frame_after_end', adapter_good() + [ev('adapter', 11, 'READY', {})])
bad('raw_before_previous_commit', mutate(3, lambda e, i: e.insert(i, ev('adapter', 3, 'RAW_READ', rr('stdout', 0, REP)))))
bad('stream_end_counters_wrong', mutate(7, lambda e, i: e[i]['data'].update(read_bytes=1)))
bad('complete_end_uncommitted', [ev('adapter', 0, 'BEGIN', BEGIN), ev('adapter', 1, 'READY', {}), ev('adapter', 2, 'RAW_READ', rr('stdin', 0, REQ)),
                                 ev('adapter', 3, 'END', {'streams': {'stdin': counters(REQ, 0), 'stdout': counters(b''), 'stderr': counters(b'')},
                                                          'child_exit_code': 0, 'child_signal': None, 'complete': True})])
bad('complete_end_without_stream_end', mutate(9, lambda e, i: (e.pop(i), e[i].update(seq=9))))
bad('end_complete_after_signal', mutate(10, lambda e, i: (e.insert(i, ev('adapter', 10, 'SIGNAL', {'signal': 'SIGTERM', 'inflight': False})), e[i + 1].update(seq=11))))
bad('signal_commit_window_exceeded', [ev('adapter', 0, 'BEGIN', BEGIN), ev('adapter', 1, 'READY', {}),
                                      ev('adapter', 2, 'SIGNAL', {'signal': 'SIGTERM', 'inflight': False}, mono=1000000),
                                      ev('adapter', 3, 'END', {'streams': {'stdin': counters(b''), 'stdout': counters(b''), 'stderr': counters(b'')},
                                                               'child_exit_code': None, 'child_signal': None, 'complete': False}, mono=1000000 + 150000000)])
bad('role_mismatch', mutate(1, lambda e, i: e[i].update(role='driver')))
bad('attempt_mismatch', mutate(1, lambda e, i: e[i].update(attempt='f' * 40)))
bad('begin_wrong_source', mutate(0, lambda e, i: e[i]['data'].update(source_sha256='e' * 64)))
bad('begin_wrong_nonce', mutate(0, lambda e, i: e[i]['data'].update(nonce='e' * 40)))
bad('first_frame_not_begin', mutate(0, lambda e, i: (e.pop(0), [x.update(seq=x['seq'] - 1) for x in e])))
bad('new_raw_after_signal', [ev('adapter', 0, 'BEGIN', BEGIN), ev('adapter', 1, 'READY', {}),
                             ev('adapter', 2, 'SIGNAL', {'signal': 'SIGTERM', 'inflight': False}), ev('adapter', 3, 'RAW_READ', rr('stdin', 0, REQ))])
bad('pid_changed', mutate(3, lambda e, i: e[i].update(pid=8)))
bad('non_monotonic', mutate(3, lambda e, i: e[i].update(mono_ns='5')))
bad('stream_cap', [ev('adapter', 0, 'BEGIN', BEGIN), ev('adapter', 1, 'READY', {})] + [
    x for k in range(33) for x in (ev('adapter', 2 + 2 * k, 'RAW_READ', rr('stderr', 2048 * k, b'e' * 2048)),
                                   ev('adapter', 3 + 2 * k, 'FORWARD_COMMIT', {'stream': 'stderr', 'offset': 2048 * k, 'bytes': 2048}))])
bad('kind_not_allowed_for_role', [ev('peer', 0, 'BEGIN', BEGIN), ev('peer', 1, 'READY', {}), ev('peer', 2, 'RAW_READ', rr('stdin', 0, REQ))], role='peer')
bad('unknown_kind', mutate(1, lambda e, i: e[i].update(kind='HELLO')))
bad('unknown_data_field', mutate(2, lambda e, i: e[i]['data'].update(extra=1)))
g = adapter_good()
bad('duplicate_json_key', frames=[raw_frame(None, json.dumps(g[0], separators=(',', ':'))[:-1] + ',"v":1}')])
bad('nan_in_frame', frames=[raw_frame(g[0]), raw_frame(None, json.dumps(g[1], separators=(',', ':'))[:-3] + '{"x":NaN}}')])
bad('noncompact_whitespace', frames=[raw_frame(None, json.dumps(g[0]))])
bad('oversize_length_prefix', frames=[(4093).to_bytes(4, 'big') + b'x' * 4093])
bad('zero_length_frame', frames=[(0).to_bytes(4, 'big')])
bad('invalid_utf8', frames=[(3).to_bytes(4, 'big') + b'{\xff}'])
bad('metadata_over_1024', [ev('driver', 0, 'BEGIN', BEGIN), ev('driver', 1, 'READY', {}),
                           ev('driver', 2, 'DIAGNOSTIC', {'milestone': 'X', 'detail': 'z' * 1100})], role='driver')
bad('truncated_frame_at_eof', frames=[raw_frame(g[0]), raw_frame(g[1])[:7]])
check('observer.signal_inflight_then_incomplete_end', lambda: feed('adapter', [raw_frame(e) for e in [
    ev('adapter', 0, 'BEGIN', BEGIN), ev('adapter', 1, 'READY', {}), ev('adapter', 2, 'RAW_READ', rr('stdout', 0, REP)),
    ev('adapter', 3, 'SIGNAL', {'signal': 'SIGTERM', 'inflight': True}, mono=2000000),
    ev('adapter', 4, 'FORWARD_COMMIT', {'stream': 'stdout', 'offset': 0, 'bytes': 5}, mono=2000100),
    ev('adapter', 5, 'END', {'streams': {'stdin': counters(b''), 'stdout': counters(REP, 5), 'stderr': counters(b'')},
                             'child_exit_code': None, 'child_signal': None, 'complete': False}, mono=2000000 + 50000000)]]).status() == 'END')


# ---------------------------------------------------------------- reconciliation
def logs_py(peer_lines=None, driver_recv=None, extra_stdout=b'', os_ok=True):
    adapter = adapter_good()
    out = REP + extra_stdout
    if extra_stdout:
        adapter = adapter[:5] + [ev('adapter', 5, 'RAW_READ', rr('stdout', 0, out)), ev('adapter', 6, 'FORWARD_COMMIT', {'stream': 'stdout', 'offset': 0, 'bytes': len(out)}),
                                 ev('adapter', 7, 'STREAM_END', dict({'stream': 'stdout'}, **counters(out)))] + adapter[8:]
        adapter[-1] = ev('adapter', 10, 'END', {'streams': {'stdin': counters(REQ), 'stdout': counters(out), 'stderr': counters(b'')},
                                                 'child_exit_code': 0, 'child_signal': None, 'complete': True})
    peer = [ev('peer', 0, 'BEGIN', BEGIN), ev('peer', 1, 'READY', {}),
            ev('peer', 2, 'PEER_MILESTONE', {'milestone': 'RECEIVED', 'detail': {'kind': 'request', 'method': 'x', 'bytes': len(REQ), 'sha256': peer_lines or sha(REQ)}}),
            ev('peer', 3, 'PEER_MILESTONE', {'milestone': 'REPLY_WRITTEN', 'detail': {'method': 'x', 'bytes': len(REP), 'sha256': sha(REP)}}),
            ev('peer', 4, 'END', {'streams': {}, 'child_exit_code': 0, 'child_signal': None, 'complete': True})]
    drv = [ev('driver', 0, 'BEGIN', BEGIN), ev('driver', 1, 'READY', {}),
           ev('driver', 2, 'DIAGNOSTIC', {'milestone': 'OWN_CLIENT_CLOSED', 'detail': {
               'sent_bytes': len(REQ), 'sent_sha256': sha(REQ), 'recv_bytes': len(out), 'recv_sha256': driver_recv or sha(out),
               'stderr_bytes': 0, 'stderr_sha256': sha(b''), 'returncode': 0, 'source_sdk_claim': False}}),
           ev('driver', 3, 'END', {'streams': {}, 'child_exit_code': None, 'child_signal': None, 'complete': True})]
    logs = {'driver': feed('driver', [raw_frame(e) for e in drv]), 'adapter': feed('adapter', [raw_frame(e) for e in adapter]),
            'peer': feed('peer', [raw_frame(e) for e in peer])}
    return OBS.reconcile(logs, 'python', {'checks': {'cleanup': os_ok}})


check('reconcile.python_consistent_pass', lambda: logs_py()[0] == 'PASS')
check('reconcile.peer_line_mismatch_invalid', lambda: logs_py(peer_lines='0' * 64)[0] == 'INVALID_CAPTURE')
check('reconcile.driver_recv_mismatch_invalid', lambda: logs_py(driver_recv='0' * 64)[0] == 'INVALID_CAPTURE')
check('reconcile.extra_stdout_not_from_peer_invalid', lambda: logs_py(extra_stdout=b'INJECTED\n')[0] == 'INVALID_CAPTURE')
check('reconcile.os_witness_failure_invalid', lambda: logs_py(os_ok=False)[0] == 'INVALID_CAPTURE')


# ---------------------------------------------------------------- role-side channel
def ctl(seq, command, **kw):
    c = {'v': 1, 'attempt': A, 'case': 'DIAG-PY-RPC', 'role': 'peer', 'seq': seq, 'command': command}
    c.update(kw)
    return c


check('channel.control_roundtrip_split', lambda: (lambda d, b: (d.push(b[:5]), d.push(b[5:]))[1][1]['command'] == 'FINISH_PEER')(
    CH.FrameDecoder(), CH.encode_frame(ctl(0, 'READY'), True) + CH.encode_frame(ctl(1, 'FINISH_PEER'), True)))
rejects('channel.control_unknown_command', lambda: CH.encode_frame(ctl(0, 'EXEC'), True))
rejects('channel.control_bool_seq', lambda: CH.encode_frame(ctl(True, 'READY'), True))
rejects('channel.control_duplicate_key', lambda: CH.FrameDecoder().push(raw_frame(None, json.dumps(ctl(0, 'READY'), separators=(',', ':'))[:-1] + ',"seq":0}')))
rejects('channel.control_whitespace', lambda: CH.FrameDecoder().push(raw_frame(None, json.dumps(ctl(0, 'READY')))))
rejects('channel.control_zero_length', lambda: CH.FrameDecoder().push(b'\0\0\0\0'))
rejects('channel.control_truncated_finish', lambda: (lambda d: (d.push(CH.encode_frame(ctl(0, 'READY'), True)[:9]), d.finish()))(CH.FrameDecoder()))
rejects('channel.event_sha_mismatch', lambda: CH.encode_frame(ev('adapter', 2, 'RAW_READ', dict(rr('stdin', 0, REQ), sha256='0' * 64))))
rejects('channel.event_kind_for_role', lambda: CH.encode_frame(ev('driver', 2, 'RAW_READ', rr('stdin', 0, REQ))))
rejects('channel.event_metadata_cap', lambda: CH.encode_frame(ev('driver', 2, 'API_RESULT', {'api': 'x', 'result': 'r' * 1100, 'observations': {}})))
rejects('channel.event_nan', lambda: CH.encode_frame(ev('driver', 2, 'API_RESULT', {'api': 'x', 'result': float('nan'), 'observations': {}})))
rejects('channel.json_depth', lambda: CH.strict_json('[' * 40 + ']' * 40))
rejects('channel.ledger_false_commit', lambda: (lambda l: (l.raw(b'ab'), l.commit(3)))(CH.StreamLedger('stdin')))
rejects('channel.ledger_zero_commit', lambda: (lambda l: (l.raw(b'ab'), l.commit(0)))(CH.StreamLedger('stdin')))
check('channel.ledger_partial', lambda: (lambda l: (l.raw(b'abcdef'), l.commit(1), l.commit(5), l.summary()['committed_bytes'] == 6)[-1])(CH.StreamLedger('stdout')))
check('channel_vs_observer.same_frames', lambda: feed('adapter', [CH.encode_frame(e) for e in adapter_good()]).violation is None)


# ---------------------------------------------------------------- real host FIFOs (own private directory)
def fifo_tests():
    root = SUP.RUNTIME / ('selftest-' + secrets.token_hex(6))
    root.mkdir(mode=0o700)
    try:
        f = root / 'f.events'
        os.mkfifo(f, 0o600)
        st = os.lstat(f)
        exp = [str(st.st_dev), str(st.st_ino), '0600', os.getuid()]
        try:
            CH.open_fifo_at(str(f), 'events', exp)
            raise AssertionError('opened events without reader')
        except OSError as exc:
            check('fifo.missing_reader_fails_closed_ENXIO', lambda: exc.errno == errno.ENXIO)
        r = os.open(f, os.O_RDONLY | os.O_NONBLOCK | os.O_CLOEXEC)
        w = CH.open_fifo_at(str(f), 'events', exp)
        check('fifo.nonblocking_cloexec', lambda: not os.get_blocking(w) and not os.get_inheritable(w))
        check('fifo.pipe_buf_ge_4096', lambda: os.fpathconf(w, 'PC_PIPE_BUF') >= 4096)
        frame = b'\0\0\x0f\xfc' + b'x' * 4092
        writes, partial = 0, 0
        while True:
            try:
                n = os.write(w, frame)
            except BlockingIOError:
                break
            writes += 1
            partial += n != len(frame)
        check('fifo.backpressure_atomic_no_partial_frame', lambda: writes > 0 and partial == 0)
        os.close(w)
        os.close(r)
        rejects('fifo.wrong_inode', lambda: CH.open_fifo_at(str(f), 'control', [exp[0], str(int(exp[1]) + 1), '0600', exp[3]]))
        rejects('fifo.wrong_owner', lambda: CH.open_fifo_at(str(f), 'control', [exp[0], exp[1], '0600', exp[3] + 1]))
        g = root / 'g.control'
        os.mkfifo(g, 0o600)
        os.chmod(g, 0o644)
        sg = os.lstat(g)
        rejects('fifo.wrong_mode', lambda: CH.open_fifo_at(str(g), 'control', [str(sg.st_dev), str(sg.st_ino), '0600', os.getuid()]))
        link = root / 'link'
        os.symlink(f, link)
        rejects('fifo.symlink_refused', lambda: CH.open_fifo_at(str(link), 'control', exp))
        reg = root / 'regular'
        reg.write_bytes(b'')
        sr = os.lstat(reg)
        rejects('fifo.regular_file_refused', lambda: CH.open_fifo_at(str(reg), 'control', [str(sr.st_dev), str(sr.st_ino), '0600', os.getuid()]))
        c = CH.open_fifo_at(str(f), 'control', exp)
        check('fifo.control_reader_without_writer', lambda: not os.get_blocking(c))
        os.close(c)
    finally:
        shutil.rmtree(root)


fifo_tests()


# ---------------------------------------------------------------- peer scripts (H04) and plans
rows = json.loads(SUP.fixture_bytes())
cases_json = json.loads(SUP.CASES_JSON.read_bytes())['cases']
check('fixtures.27_rows', lambda: len(rows) == 27)
check('fixtures.sdk_rows_exact_copy', lambda: all(rows[c['id']] == c['fixture_input'] for c in cases_json) and len(cases_json) == 19)
check('fixtures.file_matches_generator', lambda: (UNIT / 'fixture-cases.json').read_bytes() == SUP.fixture_bytes())


def plan(case, *reqs):
    s = RPC.Script(case, rows[case])
    return [s.plan(r) for r in reqs]


def req(method, **params):
    return {'id': 'x', 'method': method, 'params': params}


INIT = req('initialize')
check('peer.SDKPY01', lambda: plan('SDKPY01', INIT)[0] == ('reply', {'result': rows['SDKPY01']['initialize_result']}))
for c in ('SDKPY02', 'SDKPY03', 'SDKPY04', 'SDKPY05'):
    check('peer.' + c, lambda c=c: plan(c, INIT, req('turn/start'), req('turn/start'))[1:] == [('reply', {'result': {}}), ('none', None)])
check('peer.SDKPY06_requests', lambda: [r['id'] for r in RPC.Script('SDKPY06', rows['SDKPY06']).peer_requests] == ['approve-command', 'approve-file', 'other'])
check('peer.SDKPY07_hold', lambda: plan('SDKPY07', req('turn/start'))[0] == ('hold', rows['SDKPY07']['turn_start_reply']))
check('peer.SDKPY08', lambda: plan('SDKPY08', req('thread/goal/set'), req('turn/interrupt', turnId='A'), req('turn/interrupt', turnId='B'),
                                   req('turn/interrupt', turnId='A')) == [('reply', rows['SDKPY08']['pause_reply']), ('reply', rows['SDKPY08']['interrupt_A_reply']),
                                                                         ('reply', rows['SDKPY08']['interrupt_B_reply']), ('none', None)])
check('peer.SDKPY09', lambda: plan('SDKPY09', req('thread/goal/set'), req('turn/interrupt', turnId='A'), req('turn/interrupt', turnId='B'))
      == [('reply', rows['SDKPY09']['pause_reply']), ('reply', rows['SDKPY09']['interrupt_A_reply']), ('none', None)])
check('peer.unscripted', lambda: plan('SDKPY01', req('thread/start'))[0] == ('none', None))
check('peer.DIAG-PY-LARGE', lambda: len(plan('DIAG-PY-LARGE', req('diag/large'))[0][1]['result']['blob']) == 150000)
check('driver.diag_plan_matches_supervisor', lambda: sorted(DRV.DIAG_PLAN) == sorted(k for k in SUP.DIAG if k.startswith('DIAG-PY-')))
check('driver.sdk_cases_9', lambda: list(DRV.SDK_CASES) == SUP.SDK_CASES_PY)
check('plan.every_case', lambda: all(SUP.case_plan(c)['barriers'] for c in SUP.SDK_CASES_PY + SUP.SDK_CASES_TS + list(SUP.DIAG)))
check('plan.file_matches_tables', lambda: json.loads((UNIT / 'case-plan.json').read_text())['cases'] == {
    c: SUP.case_plan(c) for c in SUP.SDK_CASES_PY + SUP.SDK_CASES_TS + sorted(SUP.DIAG)})
check('argv.python_peer_frozen', lambda: SUP.peer_argv('python', 'SDKPY01') == ['/runtime/python', '-I', '-S', '/profile/fixture-rpc.py', '--case', 'SDKPY01'])
check('argv.ts_peer_prefix', lambda: SUP.peer_argv('typescript', 'SDKTS01') == ['/runtime/node', '/profile/fixture-cli.mjs', '--case', 'SDKTS01', '--sdk-argv-json'])
check('templates.match_generator', lambda: (UNIT / 'profile-templates' / 'node-loader.json').read_text() == SUP.compact(SUP.node_loader_json()) + '\n'
      and (UNIT / 'profile-templates' / 'node-transpile.json').read_text() == SUP.compact(SUP.node_transpile_json()) + '\n')
check('transpile.ten_source_hashes_from_HOW', lambda: SUP.ts_source_hashes() == {
    p['path'].rsplit('/', 1)[1]: p['sha256'] for p in json.loads((SUP.REFERENCE / 'review-freeze-r2.json').read_text())['files']
    if p['path'].startswith('inputs/sdk/typescript/src/')})

# ---------------------------------------------------------------- terminal declarations after the case deadline (Python)
def deadline_tests():
    root = SUP.RUNTIME / ('selftest-' + secrets.token_hex(6))
    root.mkdir(mode=0o700)
    try:
        f = root / 'driver.events'
        os.mkfifo(f, 0o600)
        r = os.open(f, os.O_RDONLY | os.O_NONBLOCK | os.O_CLOEXEC)
        ch = object.__new__(CH.Channel)
        ch.config, ch.role, ch.seq, ch.bytes, ch.terminal = {'attempt': A, 'case': 'DIAG-PY-RPC'}, 'driver', 2, 0, False
        ch.deadline = 0.0
        ch.event_fd = os.open(f, os.O_WRONLY | os.O_NONBLOCK | os.O_CLOEXEC)
        ch._elock = __import__('threading').Lock()
        rejects('deadline.py_ordinary_event_refused_after_deadline', lambda: ch.emit('DIAGNOSTIC', {'milestone': 'LATE', 'detail': None}))
        check('deadline.py_invalid_declared_after_deadline', lambda: (CH.invalid(ch, CH.ChannelError('driver deadline')), ch.terminal and ch.seq == 3)[-1])
        rejects('deadline.py_no_frame_after_terminal', lambda: ch.emit('END', {'streams': {}, 'child_exit_code': None, 'child_signal': None, 'complete': True}, until=1e18))
        log = OBS.RoleLog('driver', EXPECT)
        log.seq = 2
        log.feed(os.read(r, 65536), 0)
        check('deadline.py_invalid_frame_valid_for_observer', lambda: log.violation is None and log.terminal == 'INVALID')
        os.close(ch.event_fd)
        os.close(r)
    finally:
        shutil.rmtree(root)


deadline_tests()

# ---------------------------------------------------------------- Node selftest + cross-implementation decode
node_root = SUP.RUNTIME / ('selftest-' + secrets.token_hex(6))
node_root.mkdir(mode=0o700)
try:
    node_fifo = node_root / 'driver.events'
    os.mkfifo(node_fifo, 0o600)
    node_reader = os.open(node_fifo, os.O_RDONLY | os.O_NONBLOCK | os.O_CLOEXEC)
    node = subprocess.run([NODE, str(UNIT / 'node' / 'selftest.mjs'), str(UNIT / 'profile-templates'), str(UNIT / 'fixture-cases.json'), '--emit-frames', str(node_fifo)],
                          capture_output=True, text=True, timeout=60, cwd=str(UNIT / 'node'), env={'PATH': '/usr/bin:/bin', 'LANG': 'C.UTF-8'})
    node_tail = os.read(node_reader, 65536)
    os.close(node_reader)
finally:
    shutil.rmtree(node_root)
node_report = json.loads(node.stdout) if node.stdout.strip() else {'error': node.stderr[-400:]}


def node_invalid_frame():
    log = OBS.RoleLog('driver', {'attempt': A, 'case': 'DIAG-TS-ECHO', 'nonce': N, 'source_sha256': SRC})
    log.seq = 2
    log.feed(node_tail, 0)
    return log.violation is None and log.terminal == 'INVALID' and log.events[0]['data']['reason'] == 'driver deadline'


check('deadline.node_invalid_frame_valid_for_observer', node_invalid_frame)
check('node.selftest_all_pass', lambda: node.returncode == 0 and node_report.get('failed') == 0)


def interop():
    e = node_report['frames_expect']
    log = OBS.RoleLog('adapter', {'attempt': e['attempt'], 'case': e['case'], 'nonce': e['nonce'], 'source_sha256': e['source_sha256']})
    log.feed(bytes.fromhex(node_report['frames_hex']), 0)
    log.finish()
    return log.violation is None and len(log.events) == 5 and log.committed['stdout'] == 5


check('interop.node_frames_decoded_by_python_observer', interop)

failed = [r for r in results if r['status'] != 'PASS']
report = {'kind': 'PYTHON_PURE_DATA_SELFTEST', 'python': sys.version.split()[0], 'checks': len(results), 'failed': len(failed),
          'results': results, 'SDK_imports': 0, 'compiler_imports': 0}
out = Path(sys.argv[1]) if len(sys.argv) > 1 else None
if out:
    out.mkdir(exist_ok=True)
    (out / 'python-selftest.json').write_text(json.dumps(report, ensure_ascii=False, indent=1) + '\n')
    node_report.pop('frames_hex', None)
    (out / 'node-selftest.json').write_text(json.dumps(node_report, ensure_ascii=False, indent=1) + '\n')
print(json.dumps({'python_checks': len(results), 'python_failed': len(failed), 'node_checks': node_report.get('checks'),
                  'node_failed': node_report.get('failed'), 'failed': failed}, indent=1))
sys.exit(1 if failed else 0)
