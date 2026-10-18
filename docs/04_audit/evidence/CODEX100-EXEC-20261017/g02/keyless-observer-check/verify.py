#!/usr/bin/env python3
"""Exercise known-bad frames and the prior EOF bug in our trusted observer only."""
from pathlib import Path
import copy
import hashlib
import json
import runpy
import types

HERE = Path(__file__).resolve().parent
task = json.loads((HERE / 'task.json').read_text())
driver = Path(task['own_driver'])
assert hashlib.sha256(driver.read_bytes()).hexdigest() == task['own_driver_sha256']
status = driver.parent / 'review-status.json'
assert hashlib.sha256(status.read_bytes()).hexdigest() == task['approved_HOW_status_sha256']
assert json.loads(status.read_text())['status'] == 'APPROVED_BOUNDED_HOW'

# This is our byte-bound trusted helper, not code from the reference repository.
# __main__ is not entered; every possible child creation is explicitly disabled.
module = runpy.run_path(str(driver), run_name='cvg_observer_negative_verification')
spawn_calls = []


def denied_spawn(*args, **kwargs):
    spawn_calls.append(True)
    raise AssertionError('no process may be spawned by this verification')


module['subprocess'].Popen = denied_spawn
Capture = module['Capture']
sent = [{'id': 7}, {'id': 'lookup'}]
valid = [{'id': 7, 'result': {'data': []}},
         {'id': 'lookup', 'error': {'code': -32600, 'message': 'Invalid request: synthetic'}}]
cases = []


def validate(name, messages, accept):
    observer = object.__new__(Capture)
    observer.sent = copy.deepcopy(sent)
    observer.messages = messages
    try:
        observer.validate_frames()
        accepted = True
    except (AssertionError, TypeError, KeyError):
        accepted = False
    assert accepted is accept, (name, accepted, accept)
    cases.append({'case': name, 'expected_acceptance': accept, 'actual_acceptance': accepted})


validate('two-valid-responses', copy.deepcopy(valid), True)
validate('valid-plus-async-notification', copy.deepcopy(valid) + [
    {'method': 'configWarning', 'params': {'synthetic': True}}], True)
bad = []
bad.append(('late-duplicate', valid + [valid[0]]))
bad.append(('unknown-id', valid + [{'id': 'foreign', 'result': {}}]))
bad.append(('missing-response', valid[:1]))
bad.append(('ambiguous-result-error', [dict(valid[0], error={'code': -32600, 'message': 'x'}), valid[1]]))
bad.append(('neither-result-nor-error', [{'id': 7}, valid[1]]))
bad.append(('unexpected-server-request', [dict(valid[0], method='request/tool/approval'), valid[1]]))
bad.append(('string-instead-of-numeric-id', [{'id': '7', 'result': {}}, valid[1]]))
bad.append(('float-instead-of-integer-id', [{'id': 7.0, 'result': {}}, valid[1]]))
bad.append(('boolean-instead-of-integer-error', [valid[0], {'id': 'lookup', 'error': {'code': True, 'message': 'x'}}]))
bad.append(('non-string-error-message', [valid[0], {'id': 'lookup', 'error': {'code': -32600, 'message': 1}}]))
bad.append(('ambiguous-notification-response', valid + [{'method': 'event', 'result': {}}]))
bad.append(('different-wire-version-field', [dict(valid[0], jsonrpc='2.0'), valid[1]]))
for name, messages in bad:
    validate(name, copy.deepcopy(messages), False)

# A valid stdio exchange that has lasted 20s must still get a future EOF window.
# The old started+15 implementation makes this check red, while basic commands
# must continue to time out after their 15s total budget.
clock = module['time'].monotonic
module['time'].monotonic = lambda: 100.0
eof = []
try:
    for name, total, allowed in [('stdio-after-20-seconds', 75, True),
                                  ('basic-command-after-20-seconds', None, False)]:
        observer = object.__new__(Capture)
        observer.started = 80.0
        observer.line_buffer = bytearray()
        observer.proc = types.SimpleNamespace(
            stdin=types.SimpleNamespace(close=lambda: None), wait=lambda timeout: 0)

        def drain(deadline, parse):
            assert deadline <= 155.0 and deadline <= 115.0
            if deadline <= 100.0:
                raise TimeoutError('window expired')

        observer.drain = drain
        try:
            observer.finish(15, parse=True, total=total)
            accepted = True
        except TimeoutError:
            accepted = False
        assert accepted is allowed, name
        eof.append({'case': name, 'expected_window_available': allowed,
                    'actual_window_available': accepted})
finally:
    module['time'].monotonic = clock
assert not spawn_calls
assert hashlib.sha256(driver.read_bytes()).hexdigest() == task['own_driver_sha256']
result = {'kind': 'TRUSTED_OBSERVER_SYNTHETIC_CONTROLS_ONLY', 'positive_frames': 2,
          'negative_frames_rejected': len(bad), 'EOF_controls': eof, 'cases': cases,
          'Popen_calls': len(spawn_calls), 'upstream_or_CVG_executed': False,
          'source_unchanged': True, 'functional_parity_receipts': 0}
(HERE / 'verification.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({k: result[k] for k in ['kind', 'positive_frames', 'negative_frames_rejected',
                                       'Popen_calls', 'source_unchanged', 'functional_parity_receipts']}))
