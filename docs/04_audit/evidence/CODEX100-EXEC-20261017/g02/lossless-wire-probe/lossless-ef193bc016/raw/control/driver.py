#!/usr/bin/env python3
"""Observe exact reference ID bytes; do not decide native CVG parity."""
from pathlib import Path
import hashlib
import importlib.util
import json
import sys
import time

BASE = None


def typed(value):
    return type(value).__name__, value


def inspect_frames(messages, expected_id, source_category):
    """Controls must settle; target semantics remain observed data, not a gate."""
    for message in messages:
        assert isinstance(message, dict)
        if 'id' in message:
            assert 'method' not in message, 'unexpected server request; no automatic answer'
        else:
            assert isinstance(message.get('method'), str), 'non-notification output'
    controls = {}
    for control_id in ['init', 'barrier']:
        found = [m for m in messages if typed(m.get('id')) == typed(control_id)]
        assert len(found) == 1, 'missing/duplicate control response'
        controls[control_id] = found[0]
        assert set(found[0]) == {'id', 'result'}, 'control response failed'
    assert set(controls['init']['result']) == {'userAgent', 'codexHome', 'platformFamily', 'platformOs'}
    assert controls['init']['result']['codexHome'] == '/reference-home/.codex'
    assert controls['barrier']['result'] == {
        'data': [], 'readStates': {}, 'nextCursor': None, 'backwardsCursor': None}
    targets = [m for m in messages if 'id' in m and not any(
        typed(m['id']) == typed(c) for c in controls)]
    echo = [m for m in targets if typed(m['id']) == typed(expected_id)]
    return {
        'target_response_count': len(targets), 'typed_echo_count': len(echo),
        'source_declared_id_echo_observed': (len(targets) == len(echo) == 1)
            if source_category.startswith('SOURCE_') else None,
        'target_result_presence': ['result' in m for m in targets],
        'target_error_presence': ['error' in m for m in targets],
        'target_response_id_types': [type(m['id']).__name__ for m in targets],
        'all_messages_without_jsonrpc_field': all('jsonrpc' not in m for m in messages),
        'target_result_xor_error': [('result' in m) != ('error' in m) for m in targets],
        'notification_methods': [m['method'] for m in messages if 'id' not in m],
        'absence_scope': 'No target response observed by this process EOF only; not a universal timeout/rejection claim.',
        'parsed_summary_authority': 'Diagnostic only. Raw request/stdout bytes are the numeric and lexical authority.'}


def main():
    # Import only the pinned collector module. Its __main__ experiment is not run.
    sys.dont_write_bytecode = True
    spec = importlib.util.spec_from_file_location('pinned_reference_capture', '/control/base-driver.py')
    base = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = base
    spec.loader.exec_module(base)
    global BASE
    BASE = base
    base.OUT.mkdir(exist_ok=False)
    base.guard()
    plan = json.loads(Path('/control/cases.json').read_text())
    assert len(plan['cases']) == 23
    assert len({r['name'] for r in plan['cases']}) == 23
    assert sum(r['source_category'].startswith('SOURCE_') for r in plan['cases']) == 12
    observations = []
    params = {'clientInfo': {'name': 'cvg-reference-probe', 'title': 'Synthetic', 'version': '0.synthetic'},
              'capabilities': {'explicitGatewayOauth': True, 'experimentalApi': False,
                               'requestAttestation': False}}
    for case in plan['cases']:
        name = case['name']
        assert name and all(c.isalnum() or c == '-' for c in name)
        token = case['raw_id_token']
        expected_id = json.loads(token)
        capture = base.Capture(name, ['/reference/codex', 'app-server', '--listen', 'stdio://'])
        ledger = []
        try:
            with (base.OUT / (name + '.requests.ndjson')).open('xb') as wire:
                def send(raw, role):
                    value = json.loads(raw)
                    assert isinstance(value, dict) and set(value) == {'id', 'method', 'params'}
                    assert value['method'] in ['initialize', 'thread/list']
                    start = wire.tell()
                    wire.write(raw)
                    wire.flush()
                    record = {'role': role, 'raw_utf8': raw.decode(),
                              'byte_start': start, 'byte_end_exclusive': wire.tell(),
                              'sha256': hashlib.sha256(raw).hexdigest(), 'delivered_to_stdin': False}
                    ledger.append(record)
                    base.write(name + '.requests.json', {
                        'authority': 'Exact requests.ndjson bytes, including raw ID token.', 'writes': ledger})
                    count = capture.proc.stdin.write(raw)
                    assert count == len(raw), 'short stdin write'
                    capture.proc.stdin.flush()
                    record['delivered_to_stdin'] = True
                    base.write(name + '.requests.json', {
                        'authority': 'Exact requests.ndjson bytes, including raw ID token.', 'writes': ledger})

                initial = (json.dumps({'id': 'init', 'method': 'initialize', 'params': params},
                                      ensure_ascii=True) + '\n').encode()
                send(initial, 'initialize-control')
                capture.drain(min(capture.started + 75, time.monotonic() + 20), True, 'init')
                target = ('{"id":' + token + ',"method":"thread/list","params":{"limit":1}}\n').encode()
                send(target, 'raw-id-target')
                send(b'{"id":"barrier","method":"thread/list","params":{"limit":1}}\n', 'barrier-control')
                capture.drain(min(capture.started + 75, time.monotonic() + 20), True, 'barrier')
                # Both requests may execute concurrently. Preserve every frame through EOF,
                # including any target response that follows the barrier response.
                code = capture.finish(15, parse=True, total=75)
                assert code == 0, ('stdio exit', code)
                capture.validate_guard()
                summary = inspect_frames(capture.messages, expected_id, case['source_category'])
                frames = []
                offset = 0
                for line in bytes(capture.buffers['stdout']).splitlines(keepends=True):
                    frames.append({'byte_start': offset, 'byte_end_exclusive': offset + len(line),
                                   'sha256': hashlib.sha256(line).hexdigest()})
                    offset += len(line)
                observations.append({**case, 'status': 'OBSERVED_NOT_FUNCTIONALLY_QUALIFIED',
                                     'writes': len(ledger), 'exit': code, 'summary': summary,
                                     'stdout_frames': frames, 'raw_request_file': name + '.requests.ndjson',
                                     'raw_stdout_file': name + '.stdout.log', 'raw_stderr_file': name + '.stderr.log'})
        except BaseException as exc:
            base.first_failure(name, exc)
            raise
        finally:
            capture.close()
    assert base.FIRST is None, 'capture cleanup failed; primary cause preserved'
    base.write('observations.json', {
        'kind': 'ACTUAL_PINNED_REFERENCE_ID_TOKEN_OBSERVATIONS_NOT_PARITY',
        'cases': observations, 'processes': 23, 'source_declared_cases': 12, 'edge_cases': 11,
        'wire_requests': 69, 'functional_parity_receipts': 0, 'CVG_engine_executed': False,
        'model_or_tool_requests': 0,
        'normalizations_applied': [],
        'limits': 'Only these fresh stdio/empty-home fixtures. No all-i64-field, parser, transport, SDK or CVG qualification.'})


if __name__ == '__main__':
    try:
        main()
    except BaseException as exc:
        if BASE is not None and BASE.OUT.is_dir():
            BASE.first_failure('main', exc)
        raise
