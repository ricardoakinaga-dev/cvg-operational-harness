"""Host-side acceptance predicates for the 19 SDK reference cases (DX100-G02:ADMIT-SDK-PROFILE-AND-ACCEPTANCE).

Closes R1-F14 and R2-F04 of the drivers unit. Independent of the SDK, of the synthetic peers and of
the role-side encoders: it reads only the observer RoleLogs (raw ledgers rebuilt by observer.py), the
observer verdict and the supervisor OS witnesses. Outcomes (execution-profile/containment-and-observer):

  PASS_CLIENT_OBSERVATION  capture complete in an accepted form AND every case predicate holds
  MISMATCH                 capture complete, but a predicate fails (the client behaved differently from
                           the frozen expectation, or a known-bad observation happened)
  INVALID_CAPTURE          capture, cleanup or loaded-code identity incomplete; predicates informational only
  INCONCLUSIVE             SDKTS10 bounded by a timeout (HOW: "timeout is INCONCLUSIVE, never expected success")

Nothing is repaired, relabeled or inferred from source text; an observation is only a client fact.

Evaluator r2 (grouped repair 1 after review R1, offline only): the 19 captures were judged in service by the
r1 evaluator frozen in source-freeze-r2.json (preimage archives/review-r1-preimages/python/acceptance.py);
r2 re-judges the preserved raw frames into cases/*/acceptance-r2.json and never rewrites acceptance.json.
Limit (R1-F01): the frozen synthetic peer never answers an unscripted request, so a known-bad that makes the
SDK block on such a request (extra turn/interrupt in SDKPY08/09, blocking interrupt in SDKPY07) ends as
INVALID_CAPTURE by deadline (fail-closed), not as MISMATCH; MISMATCH covers the non-blocking known-bads.
Usage: python3 -I acceptance.py reevaluate <attempt-dir>        compare with acceptance-r2.json (else acceptance.json)
       python3 -I acceptance.py reevaluate-write <attempt-dir>  write acceptance-r2.json (refuses to overwrite)
"""
import base64
import importlib.util
import json
import re
import signal
import sys
from pathlib import Path

sys.dont_write_bytecode = True
EVALUATOR = 'acceptance-r2 (grouped repair 1 after review R1; offline over preserved raw frames)'
UUID4 = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
FIXED_ENV = {'HOME': '/work/home', 'TMPDIR': '/work/tmp', 'PATH': '/runtime', 'LANG': 'C.UTF-8', 'LC_ALL': 'C.UTF-8',
             'TZ': 'UTC', 'PYTHONDONTWRITEBYTECODE': '1'}
TS_SDK_ENV = {'HOME': '/work/home', 'PATH': '/runtime', 'CODEX_INTERNAL_ORIGINATOR_OVERRIDE': 'codex_sdk_ts'}
TS_ADAPTER_CMDLINE = ['/runtime/node', '/profile/adapter-typescript', 'exec', '--experimental-json']
EOF_CASES = ('SDKPY01', 'SDKPY02', 'SDKPY03', 'SDKPY04', 'SDKPY05', 'SDKPY07', 'SDKPY08', 'SDKPY09')
EARLY_CLOSE_TS = ('SDKTS02', 'SDKTS03', 'SDKTS07', 'SDKTS08')
ACCEPTED_FORMS = {c: ('PASS',) for c in ['SDKPY0%d' % i for i in range(1, 10)] + ['SDKTS%02d' % i for i in range(1, 11)]}
ACCEPTED_FORMS.update({c: ('PASS', 'KNOWN_SIGNAL_TERMINATION') for c in EARLY_CLOSE_TS})
ACCEPTED_FORMS['SDKTS10'] = ('KNOWN_SIGNAL_TERMINATION',)
EMPTY_TURN = {'items': [], 'finalResponse': '', 'usage': None}
PY_COMMON = ['wire.client_lines_complete_json', 'wire.server_lines_complete_json', 'wire.initialize_request_learned_uuid',
             'wire.initialized_notification_exact', 'wire.initialize_reply_learned_id', 'api.initialize_result_parsed',
             'env.adapter_sandbox_env_only', 'peer.no_unscripted_request']
TS_COMMON = ['argv.exec_experimental_json', 'env.adapter_sdk_env_only', 'wire.stdin_prompt_then_eof']
PRED_IDS = {
    'SDKPY01': PY_COMMON + ['wire.eof_bounded_interval', 'wire.exactly_initialize_then_initialized', 'wire.no_ack_for_initialized',
                            'api.only_initialize'],
    'SDKPY02': PY_COMMON + ['wire.eof_bounded_interval', 'wire.guarded_request_absent', 'wire.only_initialize_reply',
                            'api.request_raised_CodexError_from_ValueError', 'api.error_text_from_source_guard', 'wire.initialized_before_guard'],
    'SDKPY03': PY_COMMON + ['wire.eof_bounded_interval', 'wire.guarded_request_written_after_initialized', 'wire.success_reply_learned_id',
                            'api.request_result_validated'],
    'SDKPY04': PY_COMMON + ['wire.eof_bounded_interval', 'wire.guarded_request_absent', 'wire.only_initialize_reply',
                            'api.request_raised_CodexError_from_ValueError', 'api.error_text_from_source_guard', 'wire.initialized_before_guard'],
    'SDKPY05': PY_COMMON + ['wire.eof_bounded_interval', 'wire.guarded_request_written_after_initialized', 'wire.toolOutput_null_retained',
                            'wire.success_reply_learned_id', 'api.request_result_validated'],
    'SDKPY06': PY_COMMON + ['wire.peer_requests_serial', 'wire.default_handler_replies', 'peer.all_requests_answered', 'api.only_initialize'],
    'SDKPY07': PY_COMMON + ['wire.eof_bounded_interval', 'wire.turn_start_written', 'wire.no_turn_interrupt', 'wire.no_goal_path',
                            'wire.held_reply_learned_id', 'api.cancelled_error', 'hook.late_close_turn_A_closed_true',
                            'order.abort_after_request_capture', 'order.reply_released_after_cancel', 'order.absence_judged_after_hook'],
    'SDKPY08': PY_COMMON + ['wire.eof_bounded_interval', 'wire.pause_then_interrupt_A_then_B', 'wire.no_third_interrupt',
                            'wire.scripted_replies_learned_ids', 'api.cancel_goal_operation_returned_none'],
    'SDKPY09': PY_COMMON + ['wire.eof_bounded_interval', 'wire.pause_then_interrupt_A', 'wire.no_second_interrupt',
                            'wire.scripted_replies_learned_ids', 'api.cancel_goal_operation_returned_none'],
    'SDKTS01': TS_COMMON + ['wire.fixture_bytes_relayed', 'api.run_empty_result', 'peer.exit_status'],
    'SDKTS02': TS_COMMON + ['wire.fixture_bytes_relayed', 'api.no_yield_before_error', 'api.parse_error_with_line_and_cause', 'cleanup.signal_source'],
    'SDKTS03': TS_COMMON + ['wire.fixture_bytes_relayed', 'api.no_yield_before_error', 'api.parse_error_with_line_and_cause', 'cleanup.signal_source'],
    'SDKTS04': TS_COMMON + ['wire.fixture_bytes_relayed', 'api.thread_started_sets_id_before_yield', 'api.cache_write_default_before_yield',
                            'api.stream_returned_two_events', 'peer.exit_status'],
    'SDKTS05': TS_COMMON + ['wire.fixture_bytes_relayed', 'api.items_retained_last_message_last_usage', 'peer.exit_status'],
    'SDKTS06': TS_COMMON + ['wire.fixture_bytes_relayed', 'api.error_event_ignored_empty_result', 'peer.exit_status'],
    'SDKTS07': TS_COMMON + ['wire.fixture_bytes_relayed', 'api.turn_failed_throws_message', 'cleanup.signal_source'],
    'SDKTS08': TS_COMMON + ['wire.fixture_bytes_relayed', 'api.falsey_failure_partial_result', 'cleanup.signal_source'],
    'SDKTS09': TS_COMMON + ['wire.fixture_bytes_relayed', 'api.nonzero_exit_throws_with_stderr', 'peer.exit_status'],
    'SDKTS10': TS_COMMON + ['abort.called_after_child_witness', 'abort.child_terminated_by_SIGTERM', 'abort.api_outcome_recorded_after_abort'],
}
KNOWN_BAD = {
    'SDKPY01': 'Wait for initialized ACK or omit initialized and still accept -> wire.initialized_notification_exact / wire.no_ack_for_initialized',
    'SDKPY02': 'Claim guard passed from version text alone or send a rejected request -> wire.guarded_request_absent',
    'SDKPY03': 'Claim guard passed from version text alone -> only the written request and the API result are judged',
    'SDKPY04': 'Send a rejected request -> wire.guarded_request_absent',
    'SDKPY05': 'Block None as though truthy -> wire.guarded_request_written_after_initialized; backend acceptance never claimed',
    'SDKPY06': 'Treat SDK accept as institutional approval -> facts.institutional_approval=NOT_IMPLIED',
    'SDKPY07': 'Goal path for ordinary turn, inferred remote interruption, or absence judged before late callback/drain -> wire.no_goal_path / order.absence_judged_after_hook; closed=false -> MISMATCH (R2-F04). A turn/interrupt sent blocking (request without script) leaves the SDK waiting and ends INVALID_CAPTURE by deadline (R1-F01, fail-closed); only a non-blocking interrupt is judged MISMATCH by wire.no_turn_interrupt',
    'SDKPY08': 'Pause failure prevents first interrupt -> wire.pause_then_interrupt_A_then_B (MISMATCH). Unlimited retries: a third turn/interrupt has no script, the SDK blocks on it and the case ends INVALID_CAPTURE by deadline (R1-F01, fail-closed), never PASS',
    'SDKPY09': 'Retry A or fall back despite extracted same id: the second turn/interrupt has no script, the SDK blocks and the case ends INVALID_CAPTURE by deadline (R1-F01, fail-closed), never PASS; wire.no_second_interrupt judges only completed captures',
    'SDKTS01': 'EOF implies native terminal success -> only the client result is recorded, no native claim',
    'SDKTS02': 'Silently skip malformed line -> api.no_yield_before_error / api.parse_error_with_line_and_cause',
    'SDKTS03': 'Treat blank line as ignorable framing -> api.parse_error_with_line_and_cause',
    'SDKTS04': 'Mutate after yield -> api.cache_write_default_before_yield (snapshot at yield). "Overwrite a present non-null cache-write value" has no fixture in the HOW (no cache_write_input_tokens in the JSONL), so that part of the known-bad is not exercised',
    'SDKTS05': 'Deduplicate items, concatenate text, or stop at first turn.completed -> api.items_retained_last_message_last_usage',
    'SDKTS06': 'Raise from an absent aggregator error branch -> api.error_event_ignored_empty_result',
    'SDKTS07': 'Return aggregate or treat finalizer as reaped child -> api.turn_failed_throws_message; exit judged by the OS witness',
    'SDKTS08': 'Add schema validation or unconditional throw -> api.falsey_failure_partial_result',
    'SDKTS09': 'Return successful aggregate after nonzero exit -> api.nonzero_exit_throws_with_stderr',
    'SDKTS10': 'Cancelled reported as remote stop or absent cleanup witness -> no remote-stop claim; cleanup by OS witnesses',
}


# R1-F04: predicates that check the synthetic peer/capture instead of the SDK client are labeled, not renamed.
PEER_SANITY = {'wire.server_lines_complete_json', 'wire.initialize_reply_learned_id', 'peer.no_unscripted_request', 'wire.no_ack_for_initialized',
               'wire.only_initialize_reply', 'wire.peer_requests_serial', 'peer.all_requests_answered', 'wire.success_reply_learned_id',
               'wire.held_reply_learned_id', 'wire.scripted_replies_learned_ids', 'wire.fixture_bytes_relayed', 'peer.exit_status'}


def judges(pid):
    if pid in PEER_SANITY:
        return 'peer_or_capture_sanity'
    if pid.startswith('order.') or pid.startswith('cleanup.') or pid == 'wire.eof_bounded_interval' or pid == 'capture_form_accepted':
        return 'capture_order_or_cleanup'
    return 'client'


def plan(case):
    return {'accepted_capture_forms': list(ACCEPTED_FORMS[case]), 'predicates': PRED_IDS[case], 'known_bad': KNOWN_BAD[case],
            'outcomes': ['PASS_CLIENT_OBSERVATION', 'MISMATCH', 'INVALID_CAPTURE'] + (['INCONCLUSIVE'] if case == 'SDKTS10' else []),
            'evaluator': 'acceptance.py evaluate (host, independent of SDK/fixture/role encoders)'}


class Preds:
    def __init__(self):
        self.items = []

    def add(self, pid, ok, detail=None):
        self.items.append({'id': pid, 'ok': bool(ok), 'judges': judges(pid), 'detail': detail})

    def ok(self):
        return bool(self.items) and all(x['ok'] for x in self.items)


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


def obj(lines, i):
    return lines[i]['obj'] if i < len(lines) and isinstance(lines[i]['obj'], dict) else {}


def api_events(d):
    return [e for e in d.events if e['kind'] in ('API_RESULT', 'API_ERROR', 'API_CANCELLED', 'HOOK_CLOSED')]


def milestone_events(log, name):
    return [(i, e) for i, e in enumerate(log.events) if e['kind'] in ('DIAGNOSTIC', 'PEER_MILESTONE') and e['data']['milestone'] == name]


def control_t(actions, command, role):
    t = [x['t_ns'] for x in actions if x['detail'].get('command') == command and x['detail'].get('role') == role]
    return t[0] if t else None


def recv_of(log, kind, milestone=None):
    for e, rn in zip(log.events, log.recv_ns):
        if e['kind'] == kind and (milestone is None or e['data'].get('milestone') == milestone):
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


def init_result_matches(result, init):
    if not isinstance(result, dict):
        return False
    extra = {k: v for k, v in result.items() if k not in ('serverInfo', 'userAgent')}
    return result.get('serverInfo') == init.get('serverInfo') and result.get('userAgent') == init.get('userAgent') and all(v is None for v in extra.values())


def _ids(lines):
    return [obj(lines, i).get('id') for i in range(len(lines))]


# ------------------------------------------------------------------------------------------- Python cases

def py_common(P, case, logs, w, fx):
    d, a, p = logs['driver'], logs['adapter'], logs['peer']
    cl, ctail = wire_lines(a.committed_bytes('stdin'))
    sl, stail = wire_lines(a.committed_bytes('stdout'))
    P.add('wire.client_lines_complete_json', not ctail and cl and all(x['obj'] is not None for x in cl), {'lines': len(cl), 'tail': len(ctail)})
    P.add('wire.server_lines_complete_json', not stail and sl and all(x['obj'] is not None for x in sl), {'lines': len(sl), 'tail': len(stail)})
    c0 = obj(cl, 0)
    params = c0.get('params') if isinstance(c0.get('params'), dict) else {}
    P.add('wire.initialize_request_learned_uuid', c0.get('method') == 'initialize' and isinstance(c0.get('id'), str) and bool(UUID4.match(c0['id']))
          and (params.get('clientInfo') or {}).get('name') == 'codex_python_sdk' and params.get('capabilities') == {'experimentalApi': True},
          {'id': c0.get('id'), 'clientInfo': params.get('clientInfo'), 'capabilities': params.get('capabilities')})
    P.add('wire.initialized_notification_exact', obj(cl, 1) == {'method': 'initialized'}, obj(cl, 1))
    P.add('wire.initialize_reply_learned_id', obj(sl, 0) == {'id': c0.get('id'), 'result': fx['initialize_result']})
    api = api_events(d)
    first = api[0] if api else None
    P.add('api.initialize_result_parsed', bool(first) and first['kind'] == 'API_RESULT' and first['data']['api'] in ('CodexClient.initialize', 'AsyncCodexClient.initialize')
          and init_result_matches(first['data']['result'], fx['initialize_result']), first and first['data'].get('result'))
    P.add('env.adapter_sandbox_env_only', w.get('adapter_environ') == FIXED_ENV, w.get('adapter_environ'))
    P.add('peer.no_unscripted_request', not p.milestones('UNSCRIPTED'), [m['detail'] for m in p.milestones('UNSCRIPTED')])
    if case in EOF_CASES:
        P.add('wire.eof_bounded_interval', eof_barrier_ok(logs, w.get('control_actions', [])))
    return cl, sl, api


def py01(P, logs, w, fx):
    cl, sl, api = py_common(P, 'SDKPY01', logs, w, fx)
    P.add('wire.exactly_initialize_then_initialized', len(cl) == 2, {'client_lines': len(cl)})
    P.add('wire.no_ack_for_initialized', len(sl) == 1, {'server_lines': len(sl)})
    P.add('api.only_initialize', [e['kind'] for e in api] == ['API_RESULT'])


def guard_absent(case, needle):
    def run(P, logs, w, fx):
        cl, sl, api = py_common(P, case, logs, w, fx)
        P.add('wire.guarded_request_absent', len(cl) == 2 and all(x['obj'].get('method') != fx['request']['method'] for x in cl if x['obj']),
              {'client_methods': [obj(cl, i).get('method') for i in range(len(cl))]})
        P.add('wire.only_initialize_reply', len(sl) == 1)
        e = api[1] if len(api) > 1 else None
        dd = e['data'] if e else {}
        P.add('api.request_raised_CodexError_from_ValueError', bool(e) and len(api) == 2 and e['kind'] == 'API_ERROR' and dd['api'] == 'CodexClient.request'
              and dd['name'] == 'CodexError' and isinstance(dd.get('cause'), dict) and dd['cause']['name'] == 'ValueError',
              {k: dd.get(k) for k in ('name', 'message', 'cause')} if e else None)
        P.add('api.error_text_from_source_guard', bool(e) and all(n in dd.get('message', '') for n in needle), needle)
        # R1-F05: initialize() writes the initialized notification before returning (source); the guard error comes
        # from the next call. Order is judged on the driver lane plus the wire; the mono_ns pair is informational.
        d, a = logs['driver'], logs['adapter']
        init_seq = [x['seq'] for x in d.events if x['kind'] == 'API_RESULT' and x['data']['api'] == 'CodexClient.initialize']
        err_seq = [x['seq'] for x in d.events if x['kind'] == 'API_ERROR' and x['data']['api'] == 'CodexClient.request']
        end1 = len(cl[0]['raw']) + 1 + len(cl[1]['raw']) + 1 if len(cl) >= 2 else None
        rr = [int(x['mono_ns']) for x in a.events if x['kind'] == 'RAW_READ' and x['data']['stream'] == 'stdin'
              and end1 is not None and x['data']['offset'] < end1 <= x['data']['offset'] + len(base64.b64decode(x['data']['base64']))]
        err_mono = [int(x['mono_ns']) for x in d.events if x['kind'] == 'API_ERROR']
        P.add('wire.initialized_before_guard', obj(cl, 1) == {'method': 'initialized'} and bool(init_seq) and bool(err_seq) and init_seq[0] < err_seq[0],
              {'initialize_result_seq': init_seq[:1], 'guard_error_seq': err_seq[:1],
               'informational_mono_ns': {'adapter_read_of_initialized': rr[:1], 'driver_guard_error': err_mono[:1]}})
    return run


def guard_written(case, null_tool_output):
    def run(P, logs, w, fx):
        cl, sl, api = py_common(P, case, logs, w, fx)
        c2 = obj(cl, 2)
        P.add('wire.guarded_request_written_after_initialized', len(cl) == 3 and c2.get('method') == fx['request']['method']
              and isinstance(c2.get('id'), str) and bool(UUID4.match(c2['id'])) and c2.get('params') == fx['request']['params'],
              {'params': c2.get('params')})
        if null_tool_output:
            P.add('wire.toolOutput_null_retained', isinstance(c2.get('params'), dict) and 'toolOutput' in c2['params'] and c2['params']['toolOutput'] is None)
        P.add('wire.success_reply_learned_id', len(sl) == 2 and obj(sl, 1) == {'id': c2.get('id'), 'result': fx['success_result']})
        e = api[1] if len(api) > 1 else None
        res = e['data'].get('result') if e else None
        P.add('api.request_result_validated', bool(e) and len(api) == 2 and e['kind'] == 'API_RESULT' and e['data']['api'] == 'CodexClient.request'
              and isinstance(res, dict) and sorted(res) == ['platformFamily', 'platformOs', 'serverInfo', 'userAgent']
              and all(v is None for v in res.values()), res)
    return run


def py06(P, logs, w, fx):
    cl, sl, api = py_common(P, 'SDKPY06', logs, w, fx)
    p = logs['peer']
    reqs = fx['peer_requests']
    P.add('wire.peer_requests_serial', len(sl) == 1 + len(reqs) and [obj(sl, i + 1) for i in range(len(reqs))] == reqs)
    expected = [{'id': 'approve-command', 'result': {'decision': 'accept'}}, {'id': 'approve-file', 'result': {'decision': 'accept'}},
                {'id': 'other', 'result': {}}]
    got = [obj(cl, i) for i in range(2, len(cl))]
    P.add('wire.default_handler_replies', got == expected, got)
    P.add('peer.all_requests_answered', len(p.milestones('PEER_REQUEST_ANSWERED')) == len(reqs) and bool(p.milestones('PEER_REQUESTS_DONE')))
    P.add('api.only_initialize', [e['kind'] for e in api] == ['API_RESULT'])


def py07(P, logs, w, fx):
    cl, sl, api = py_common(P, 'SDKPY07', logs, w, fx)
    d, p = logs['driver'], logs['peer']
    c2 = obj(cl, 2)
    methods = [obj(cl, i).get('method') for i in range(len(cl))]
    P.add('wire.turn_start_written', len(cl) == 3 and c2.get('method') == 'turn/start' and isinstance(c2.get('id'), str)
          and bool(UUID4.match(c2['id'])) and (c2.get('params') or {}).get('threadId') == 't-synthetic', {'params': c2.get('params')})
    P.add('wire.no_turn_interrupt', 'turn/interrupt' not in methods, methods)
    P.add('wire.no_goal_path', not any(str(m).startswith('thread/goal') for m in methods), methods)
    P.add('wire.held_reply_learned_id', len(sl) == 2 and obj(sl, 1) == dict({'id': c2.get('id')}, **fx['turn_start_reply']))
    kinds = [e['kind'] for e in api]
    P.add('api.cancelled_error', kinds[:2] == ['API_RESULT', 'API_CANCELLED'] and api[1]['data']['name'] == 'CancelledError',
          api[1]['data'] if len(api) > 1 else None)
    hooks = [e['data'] for e in api if e['kind'] == 'HOOK_CLOSED']
    P.add('hook.late_close_turn_A_closed_true', kinds == ['API_RESULT', 'API_CANCELLED', 'HOOK_CLOSED'] and hooks == [{'turn_id': 'A', 'closed': True}], hooks)
    acts = w.get('control_actions', [])
    held = recv_of(p, 'REQUEST_HELD')
    abort = control_t(acts, 'ABORT_NOW', 'driver')
    P.add('order.abort_after_request_capture', held is not None and abort is not None and held <= abort, {'held_recv_ns': held, 'abort_t_ns': abort})
    cancelled = recv_of(d, 'API_CANCELLED')
    release = control_t(acts, 'RELEASE_REPLY', 'peer')
    P.add('order.reply_released_after_cancel', cancelled is not None and release is not None and cancelled <= release,
          {'cancelled_recv_ns': cancelled, 'release_t_ns': release})
    seq_hook = [e['seq'] for e in d.events if e['kind'] == 'HOOK_CLOSED']
    seq_close = [i for i, _ in milestone_events(d, 'CLIENT_STDIN_CLOSED')]
    P.add('order.absence_judged_after_hook', bool(seq_hook) and bool(seq_close) and d.events[seq_close[0]]['seq'] > seq_hook[0])


def goal(case, interrupts):
    def run(P, logs, w, fx):
        cl, sl, api = py_common(P, case, logs, w, fx)
        rest = [obj(cl, i) for i in range(2, len(cl))]
        want = [['thread/goal/set', {'threadId': 't-synthetic', 'status': 'paused'}]] + [['turn/interrupt', {'threadId': 't-synthetic', 'turnId': t}] for t in interrupts]
        shape = [[x.get('method'), x.get('params')] for x in rest]
        ids_ok = all(isinstance(x.get('id'), str) and UUID4.match(x['id']) for x in rest)
        label = 'wire.pause_then_interrupt_A_then_B' if interrupts == ['A', 'B'] else 'wire.pause_then_interrupt_A'
        P.add(label, shape[:len(want)] == want and ids_ok, shape)
        n_int = sum(1 for m, _ in shape if m == 'turn/interrupt')
        P.add('wire.no_third_interrupt' if len(interrupts) == 2 else 'wire.no_second_interrupt', len(rest) == len(want) and n_int == len(interrupts),
              {'interrupts': n_int, 'client_lines': len(cl)})
        replies = [fx['pause_reply'], fx['interrupt_A_reply']] + ([fx['interrupt_B_reply']] if 'B' in interrupts else [])
        P.add('wire.scripted_replies_learned_ids', len(sl) == 1 + len(replies)
              and [obj(sl, i + 1) for i in range(len(replies))] == [dict({'id': rest[i].get('id')}, **r) for i, r in enumerate(replies)] if len(rest) >= len(replies) else False)
        e = api[1] if len(api) > 1 else None
        P.add('api.cancel_goal_operation_returned_none', bool(e) and len(api) == 2 and e['kind'] == 'API_RESULT'
              and e['data']['api'] == 'CodexClient.cancel_goal_operation' and e['data']['result'] is None, e and e['data'])
    return run


# --------------------------------------------------------------------------------------- TypeScript cases

def ts_fixture_bytes(fx):
    out = ''.join((ln if isinstance(ln, str) else json.dumps(ln, separators=(',', ':'), ensure_ascii=False)) + '\n' for ln in fx['JSONL'])
    return out.encode(), fx['stderr'].encode()


def ts_common(P, case, logs, w, fx):
    d, a, p = logs['driver'], logs['adapter'], logs['peer']
    argv = p.milestones('EXEC_ARGV')
    P.add('argv.exec_experimental_json', bool(argv) and argv[0]['detail'] == ['exec', '--experimental-json']
          and w.get('adapter_cmdline') == TS_ADAPTER_CMDLINE, {'peer_reported': argv[0]['detail'] if argv else None, 'os_cmdline': w.get('adapter_cmdline')})
    P.add('env.adapter_sdk_env_only', w.get('adapter_environ') == TS_SDK_ENV, w.get('adapter_environ'))
    P.add('wire.stdin_prompt_then_eof', a.committed_bytes('stdin') == b'synthetic' and 'stdin' in a.stream_end)
    if 'JSONL' in fx:
        out, err = ts_fixture_bytes(fx)
        P.add('wire.fixture_bytes_relayed', a.committed_bytes('stdout') == out and a.committed_bytes('stderr') == err,
              {'stdout_bytes': len(a.committed_bytes('stdout')), 'stderr_bytes': len(a.committed_bytes('stderr'))})
    return [e for e in d.events if e['kind'] in ('API_RESULT', 'API_ERROR')]


def peer_exit(P, logs, fx, form):
    a, p = logs['adapter'], logs['peer']
    pe, ae = p.kinds('END'), a.kinds('END')
    P.add('peer.exit_status', form == 'PASS' and bool(pe) and pe[0]['data']['child_exit_code'] == fx['exit_code']
          and bool(ae) and ae[0]['data']['child_exit_code'] == fx['exit_code'] and ae[0]['data']['complete'],
          {'peer': pe and pe[0]['data']['child_exit_code'], 'adapter': ae and ae[0]['data']['child_exit_code']})


def signal_source(P, logs, w, form):
    a = logs['adapter']
    if form == 'KNOWN_SIGNAL_TERMINATION':
        ok = a.signal == 'SIGTERM' and w.get('signal_sent_ns') is None and control_t(w.get('control_actions', []), 'ABORT_NOW', 'driver') is None
        P.add('cleanup.signal_source', ok, {'form': form, 'adapter_signal': a.signal, 'source': 'SDK exec.ts finally child.kill()' if ok else 'not SDK'})
    else:
        P.add('cleanup.signal_source', a.signal is None, {'form': form, 'adapter_signal': a.signal})


def run_result(case, expected, label):
    def run(P, logs, w, fx, form):
        api = ts_common(P, case, logs, w, fx)
        P.add(label, len(api) == 1 and api[0]['kind'] == 'API_RESULT' and api[0]['data']['api'] == 'Thread.run' and api[0]['data']['result'] == expected,
              api[0]['data'] if api else None)
        if case in EARLY_CLOSE_TS:
            signal_source(P, logs, w, form)
        else:
            peer_exit(P, logs, fx, form)
    return run


def ts01(P, logs, w, fx, form):
    api = ts_common(P, 'SDKTS01', logs, w, fx)
    P.add('api.run_empty_result', len(api) == 1 and api[0]['kind'] == 'API_RESULT' and api[0]['data']['api'] == 'Thread.run'
          and api[0]['data']['result'] == EMPTY_TURN and api[0]['data']['observations'].get('thread_id') is None, api[0]['data'] if api else None)
    peer_exit(P, logs, fx, form)


def parse_error(case, line):
    def run(P, logs, w, fx, form):
        api = ts_common(P, case, logs, w, fx)
        P.add('api.no_yield_before_error', not any(e['kind'] == 'API_RESULT' for e in api), [e['data']['api'] for e in api])
        e = api[-1]['data'] if api else {}
        P.add('api.parse_error_with_line_and_cause', bool(api) and api[-1]['kind'] == 'API_ERROR' and e['api'] == 'Thread.runStreamed'
              and e['name'] == 'Error' and e['message'] == 'Failed to parse item: ' + line
              and isinstance(e.get('cause'), dict) and e['cause']['name'] == 'SyntaxError', e)
        signal_source(P, logs, w, form)
    return run


def ts04(P, logs, w, fx, form):
    api = ts_common(P, 'SDKTS04', logs, w, fx)
    ys = [e['data'] for e in api if e['kind'] == 'API_RESULT' and e['data']['api'] == 'Thread.runStreamed.yield']
    y0 = ys[0] if ys else {}
    y1 = ys[1] if len(ys) > 1 else {}
    P.add('api.thread_started_sets_id_before_yield', y0.get('result') == {'type': 'thread.started', 'thread_id': 'synth-thread'}
          and y0.get('observations', {}).get('thread_id') == 'synth-thread' and y0.get('observations', {}).get('index') == 0, y0)
    P.add('api.cache_write_default_before_yield', y1.get('result') == {'type': 'turn.completed', 'usage': {'input_tokens': 1, 'cached_input_tokens': 0,
                                                                                                          'output_tokens': 2, 'cache_write_input_tokens': 0}}
          and y1.get('observations', {}).get('index') == 1, y1)
    ret = [e['data'] for e in api if e['data']['api'] == 'Thread.runStreamed.return']
    P.add('api.stream_returned_two_events', len(ys) == 2 and len(api) == 3 and ret and ret[0]['observations'].get('events') == 2
          and ret[0]['observations'].get('abort_called') is False, ret)
    peer_exit(P, logs, fx, form)


def ts07(P, logs, w, fx, form):
    api = ts_common(P, 'SDKTS07', logs, w, fx)
    e = api[0]['data'] if api else {}
    P.add('api.turn_failed_throws_message', len(api) == 1 and api[0]['kind'] == 'API_ERROR' and e['api'] == 'Thread.run'
          and e['name'] == 'Error' and e['message'] == 'synthetic failure', e)
    signal_source(P, logs, w, form)


def ts09(P, logs, w, fx, form):
    api = ts_common(P, 'SDKTS09', logs, w, fx)
    e = api[0]['data'] if api else {}
    P.add('api.nonzero_exit_throws_with_stderr', len(api) == 1 and api[0]['kind'] == 'API_ERROR' and e['api'] == 'Thread.run'
          and e['name'] == 'Error' and e['message'] == 'Codex Exec exited with code 7: synthetic detail', e)
    peer_exit(P, logs, fx, form)


def ts10(P, logs, w, fx, form):
    api = ts_common(P, 'SDKTS10', logs, w, fx)
    d, a = logs['driver'], logs['adapter']
    acts = w.get('control_actions', [])
    abort = milestone_events(d, 'ABORT_CALLED')
    held = recv_of(logs['peer'], 'REQUEST_HELD')
    abort_t = control_t(acts, 'ABORT_NOW', 'driver')
    P.add('abort.called_after_child_witness', bool(abort) and held is not None and abort_t is not None and held <= abort_t,
          {'held_recv_ns': held, 'abort_now_t_ns': abort_t})
    P.add('abort.child_terminated_by_SIGTERM', a.signal == 'SIGTERM' and form == 'KNOWN_SIGNAL_TERMINATION', {'adapter_signal': a.signal, 'form': form})
    term = [e for e in api if e['kind'] == 'API_ERROR' or e['data']['api'] == 'Thread.runStreamed.return']
    after = bool(term) and bool(abort) and term[-1]['seq'] > abort[0][1]['seq']
    P.add('abort.api_outcome_recorded_after_abort', len(term) == 1 and term[0] is api[-1] and after,
          {'observed_outcome': term[-1]['data'] if term else None, 'note': 'Node-version-specific result recorded as observed; no remote-stop claim'})


CASES = {
    'SDKPY01': py01,
    'SDKPY02': guard_absent('SDKPY02', ['turn/start with toolOutput', '0.151.0 or newer is required', "'0.150.0'"]),
    'SDKPY03': guard_written('SDKPY03', False),
    'SDKPY04': guard_absent('SDKPY04', ['turn/start with toolOutput', 'Cannot verify an unversioned CLI with a custom launch command']),
    'SDKPY05': guard_written('SDKPY05', True),
    'SDKPY06': py06,
    'SDKPY07': py07,
    'SDKPY08': goal('SDKPY08', ['A', 'B']),
    'SDKPY09': goal('SDKPY09', ['A']),
    'SDKTS01': ts01,
    'SDKTS02': parse_error('SDKTS02', '{broken'),
    'SDKTS03': parse_error('SDKTS03', ''),
    'SDKTS04': ts04,
    'SDKTS05': run_result('SDKTS05', {'items': [{'id': 'm', 'type': 'agent_message', 'text': 'first'}, {'id': 'm', 'type': 'agent_message', 'text': 'last'}],
                                      'finalResponse': 'last', 'usage': {'input_tokens': 3, 'cached_input_tokens': 0, 'output_tokens': 4,
                                                                         'cache_write_input_tokens': 0}}, 'api.items_retained_last_message_last_usage'),
    'SDKTS06': run_result('SDKTS06', EMPTY_TURN, 'api.error_event_ignored_empty_result'),
    'SDKTS07': ts07,
    'SDKTS08': run_result('SDKTS08', EMPTY_TURN, 'api.falsey_failure_partial_result'),
    'SDKTS09': ts09,
    'SDKTS10': ts10,
}


def _signum(name):
    return signal.Signals[name].value


def capture_extra(case, logs, w):
    """Capture/identity checks beyond observer.reconcile: loaded-code witness and SDK-side adapter returncode."""
    out = []
    maps = w.get('maps')
    if not maps or not maps.get('ok'):
        out.append('loaded-code witness missing or with unknown mapping: %s' % ((maps or {}).get('error') or len((maps or {}).get('unknown', []))))
    if case.startswith('SDKPY'):
        d, a = logs['driver'], logs['adapter']
        closed = d.milestones('SDK_CLIENT_CLOSED')
        ae = a.kinds('END')
        if not closed:
            out.append('SDK_CLIENT_CLOSED missing: adapter reap by the SDK not witnessed')
        elif ae and ae[0]['data']['complete']:
            ec = ae[0]['data']
            want = ec['child_exit_code'] if ec['child_exit_code'] is not None else -_signum(ec['child_signal'])
            if closed[0]['detail'].get('returncode') != want:
                out.append('SDK-observed adapter returncode %r differs from adapter declaration %r' % (closed[0]['detail'].get('returncode'), want))
    return out


def evaluate(case, logs, verdict, reasons, witness, fixture):
    extra = capture_extra(case, logs, witness)
    form = verdict if verdict in ('PASS', 'KNOWN_SIGNAL_TERMINATION') and not extra else 'INVALID_CAPTURE'
    P = Preds()
    try:
        if case.startswith('SDKTS'):
            CASES[case](P, logs, witness, fixture, form)
        else:
            CASES[case](P, logs, witness, fixture)
    except Exception as exc:  # noqa: BLE001 - an evaluation failure is a failed predicate, never a pass
        P.add('evaluation_completed', False, ('%s: %s' % (type(exc).__name__, exc))[:300])
    ids = [x['id'] for x in P.items]
    if form == 'INVALID_CAPTURE':
        drv_invalid = [e['data']['reason'] for e in logs['driver'].kinds('INVALID')]
        timeout = witness.get('timed_out') or any('deadline' in r for r in drv_invalid)
        outcome = 'INCONCLUSIVE' if (case == 'SDKTS10' and timeout) else 'INVALID_CAPTURE'
    elif form not in ACCEPTED_FORMS[case]:
        P.add('capture_form_accepted', False, {'form': form, 'accepted': list(ACCEPTED_FORMS[case])})
        outcome = 'MISMATCH'
    else:
        P.add('capture_form_accepted', True, {'form': form})
        outcome = 'PASS_CLIENT_OBSERVATION' if P.ok() else 'MISMATCH'
    facts = {'client_fact_only': True, 'native_terminal_or_remote_stop_claimed': False, 'parity_receipt': None}
    if case == 'SDKPY06':
        facts['institutional_approval'] = 'NOT_IMPLIED'
    return {'kind': 'SDK_CASE_ACCEPTANCE', 'evaluator': EVALUATOR, 'case': case, 'outcome': outcome, 'capture_verdict': verdict, 'capture_form': form,
            'capture_reasons': list(reasons) + extra, 'predicates': P.items, 'predicate_ids_match_plan': ids == PRED_IDS[case],
            'failed_predicates': [x['id'] for x in P.items if not x['ok']],
            'informational_only': form == 'INVALID_CAPTURE', 'known_bad': KNOWN_BAD[case], 'facts': facts, 'functional_receipts': 0}


# ------------------------------------------------------------------------------------- offline re-evaluation

def _load_observer():
    spec = importlib.util.spec_from_file_location('cvg_observer_reeval', Path(__file__).resolve().parent / 'observer.py')
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def reevaluate(attempt_dir):
    """Rebuild the RoleLogs from the preserved raw frames and recv_ns, rerun reconcile and the predicates."""
    obs = _load_observer()
    ev = Path(attempt_dir)
    result = json.loads((ev / 'result.json').read_text())
    cfg = json.loads((ev / 'profile' / 'adapter-config.json').read_text())
    files = json.loads((ev / 'profile-manifest.json').read_text())['files']
    lang = cfg['language']
    src = {'python': {'driver': 'python-driver.py', 'adapter': 'adapter-python.py', 'peer': 'fixture-rpc.py'},
           'typescript': {'driver': 'ts-driver.mjs', 'adapter': 'adapter-typescript', 'peer': 'fixture-cli.mjs'}}[lang]
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
    fx = cfg['case_input']
    if lang == 'typescript' and 'JSONL' in fx:
        out, err = ts_fixture_bytes(fx)
        wire = {'stdout': out, 'stderr': err}
    verdict, reasons, _ = obs.reconcile(logs, lang, {'checks': result['os_checks']}, wire, result.get('signal_sent_ns'))
    witness = {'os_checks': result['os_checks'], 'maps': result.get('maps_witness'), 'adapter_environ': result.get('adapter_environ'),
               'adapter_cmdline': (result.get('role_host', {}).get('adapter') or {}).get('cmdline'),
               'control_actions': [x for x in result['actions'] if x['action'] == 'CONTROL'], 'signal_sent_ns': result.get('signal_sent_ns'),
               'timed_out': not result['os_checks'].get('supervisor_bound_not_hit', True)}
    acc = json.loads(json.dumps(evaluate(cfg['case'], logs, verdict, reasons, witness, fx), ensure_ascii=False))  # R1-F03: JSON-normalized
    service = json.loads((ev / 'acceptance.json').read_text()) if (ev / 'acceptance.json').exists() else None
    r2 = json.loads((ev / 'acceptance-r2.json').read_text()) if (ev / 'acceptance-r2.json').exists() else None
    return {'case': cfg['case'], 'verdict': verdict, 'outcome': acc['outcome'], 'service_time_outcome': service and service['outcome'],
            'outcome_equal_to_service_time': service is not None and service['outcome'] == acc['outcome'] and service['capture_verdict'] == verdict,
            'identical_to_stored_r2': r2 is not None and r2 == acc, 'failed_predicates': acc['failed_predicates'], 'document': acc}


if __name__ == '__main__':
    if len(sys.argv) == 3 and sys.argv[1] in ('reevaluate', 'reevaluate-write'):
        r = reevaluate(sys.argv[2])
        if sys.argv[1] == 'reevaluate-write':
            with open(Path(sys.argv[2]) / 'acceptance-r2.json', 'x') as f:
                f.write(json.dumps(r['document'], ensure_ascii=False, indent=2) + '\n')
            r['identical_to_stored_r2'] = True
        doc = r.pop('document')
        print(json.dumps(dict(r, predicates=len(doc['predicates'])), ensure_ascii=False, indent=1))
        sys.exit(0 if r['outcome_equal_to_service_time'] and r['identical_to_stored_r2'] else 1)
    print(__doc__)
    sys.exit(2)
