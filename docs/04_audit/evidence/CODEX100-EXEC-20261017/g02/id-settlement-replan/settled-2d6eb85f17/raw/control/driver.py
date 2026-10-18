#!/usr/bin/env python3
"""Require source-declared ID responses before next send and before stdin EOF."""
from pathlib import Path
import hashlib
import importlib.util
import json
import sys
import time

BASE = None


def identity(value):
    return type(value).__name__, value


def validate_plan(plan):
    rows = plan['all_historical_cases']
    assert len(rows) == 23 and len({r['name'] for r in rows}) == 23
    positive = [r for r in rows if r['source_category'].startswith('SOURCE_')]
    edges = [r for r in rows if r['source_category'] == 'EDGE_OBSERVE']
    assert len(positive) == 12 and len(edges) == 11
    assert plan['execute_names'] == [r['name'] for r in positive]
    assert plan['deferred_edge_names'] == [r['name'] for r in edges]
    values = []
    for row in positive:
        value = json.loads(row['raw_id_token'])
        assert (row['source_category'] == 'SOURCE_I64' and type(value) is int
                and -(2**63) <= value < 2**63) or (
                    row['source_category'] == 'SOURCE_STRING' and type(value) is str)
        assert identity(value) not in [identity('init'), identity('barrier')]
        values.append(identity(value))
    assert len(set(values)) == 12
    return positive


def validate_response(response, expected_id, initial=False):
    assert identity(response.get('id')) == identity(expected_id), 'typed ID mismatch'
    assert set(response) == {'id', 'result'}, 'failed/ambiguous source-positive response'
    result = response['result']
    if initial:
        assert set(result) == {'userAgent', 'codexHome', 'platformFamily', 'platformOs'}
        assert result['codexHome'] == '/reference-home/.codex'
    else:
        assert result == {'data': [], 'readStates': {}, 'nextCursor': None, 'backwardsCursor': None}


def validate_response_prefix(messages, written_ids):
    """A received response cannot acknowledge an ID not yet written."""
    allowed = [identity(value) for value in written_ids]
    assert len(set(allowed)) == len(allowed)
    found = []
    for message in messages:
        assert isinstance(message, dict)
        if 'id' not in message:
            assert isinstance(message.get('method'), str)
            assert 'result' not in message and 'error' not in message
            continue
        assert 'method' not in message, 'unexpected server request'
        key = identity(message['id'])
        assert key in allowed, 'response for unwritten/future ID'
        assert key not in found, 'duplicate response in observed prefix'
        assert ('result' in message) != ('error' in message)
        found.append(key)


def settlement_bounds(messages, expected_id, raw_stdout, before_messages, before_bytes):
    matches = [i for i, message in enumerate(messages)
               if identity(message.get('id')) == identity(expected_id)]
    assert len(matches) == 1
    index = matches[0]
    assert before_messages <= index, 'cached response predates own write'
    offset = 0
    seen = 0
    for line in raw_stdout.splitlines(keepends=True):
        if line.strip():
            if seen == index:
                assert line.endswith(b'\n')
                assert json.loads(line) == messages[index]
                assert before_bytes <= offset, 'response frame began before own write'
                return index, offset, offset + len(line)
            seen += 1
        offset += len(line)
    raise AssertionError('settlement frame not present in raw stdout')


def main():
    global BASE
    sys.dont_write_bytecode = True
    spec = importlib.util.spec_from_file_location('pinned_reference_capture', '/control/base-driver.py')
    base = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = base
    spec.loader.exec_module(base)
    BASE = base
    base.OUT.mkdir(exist_ok=False)
    base.guard()
    plan = json.loads(Path('/control/cases.json').read_text())
    positive = validate_plan(plan)
    capture = base.Capture('settled', ['/reference/codex', 'app-server', '--listen', 'stdio://'])
    writes = []
    settlements = []
    try:
        with (base.OUT / 'settled.requests.ndjson').open('xb') as wire:
            def send_and_settle(raw, name, initial=False):
                message = json.loads(raw)
                assert set(message) == {'id', 'method', 'params'}
                assert message['method'] in ['initialize', 'thread/list']
                # There can be no next write while the preceding request is unsettled.
                assert len(writes) == len(settlements)
                validate_response_prefix(capture.messages, [m['id'] for m in capture.sent])
                start = wire.tell()
                wire.write(raw)
                wire.flush()
                record = {'case': name, 'raw_utf8': raw.decode(), 'byte_start': start,
                          'byte_end_exclusive': wire.tell(), 'sha256': hashlib.sha256(raw).hexdigest(),
                          'messages_seen_before_write': len(capture.messages),
                          'stdout_bytes_seen_before_write': len(capture.buffers['stdout']),
                          'settlements_before_write': len(settlements), 'delivered_to_stdin': False}
                writes.append(record)
                capture.sent.append(message)
                base.write('settled.requests.json', {'authority': 'Exact requests.ndjson bytes.', 'writes': writes})
                count = capture.proc.stdin.write(raw)
                assert count == len(raw), 'short stdin write'
                capture.proc.stdin.flush()
                record['delivered_to_stdin'] = True
                base.write('settled.requests.json', {'authority': 'Exact requests.ndjson bytes.', 'writes': writes})
                response = capture.drain(min(capture.started + 75, time.monotonic() + 20),
                                         True, message['id'])
                validate_response_prefix(capture.messages, [m['id'] for m in capture.sent])
                validate_response(response, message['id'], initial)
                index, frame_start, frame_end = settlement_bounds(
                    capture.messages, message['id'], bytes(capture.buffers['stdout']),
                    record['messages_seen_before_write'], record['stdout_bytes_seen_before_write'])
                settlements.append({'case': name, 'wire_ordinal': len(writes) - 1,
                                    'response_frame_index': index,
                                    'response_frame_byte_start': frame_start,
                                    'response_frame_byte_end_exclusive': frame_end,
                                    'messages_seen_at_settlement': len(capture.messages),
                                    'stdout_bytes_seen_at_settlement': len(capture.buffers['stdout']),
                                    'typed_id_kind': type(message['id']).__name__})
                base.write('settled.order.json', {'settlements': settlements, 'eof_started': False})

            params = {'clientInfo': {'name': 'cvg-reference-probe', 'title': 'Synthetic', 'version': '0.synthetic'},
                      'capabilities': {'explicitGatewayOauth': True, 'experimentalApi': False,
                                       'requestAttestation': False}}
            send_and_settle((json.dumps({'id': 'init', 'method': 'initialize', 'params': params},
                                        ensure_ascii=True) + '\n').encode(), 'initialize', True)
            for row in positive:
                raw = ('{"id":' + row['raw_id_token'] + ',"method":"thread/list","params":{"limit":1}}\n').encode()
                send_and_settle(raw, row['name'])
            send_and_settle(b'{"id":"barrier","method":"thread/list","params":{"limit":1}}\n', 'barrier')
            assert len(writes) == len(settlements) == 14
            base.write('settled.order.json', {'settlements': settlements, 'eof_started': True,
                       'settlements_before_eof': len(settlements),
                       'messages_seen_before_eof': len(capture.messages)})
            exit_code = capture.finish(15, parse=True, total=75)
            assert exit_code == 0
            capture.validate_guard()
            capture.validate_frames()
    except BaseException as exc:
        base.first_failure('settled', exc)
        raise
    finally:
        capture.close()
    assert base.FIRST is None, 'cleanup failed; original cause retained'
    base.write('observations.json', {
        'kind': 'SETTLED_SOURCE_ID_REFERENCE_ROUNDTRIPS_NOT_CVG_PARITY',
        'positive_cases': positive, 'positive_count': 12, 'wire_writes': 14,
        'response_settlements': 14, 'processes': 1, 'same_connection': True,
        'all_historical_case_count': 23, 'deferred_edges': plan['deferred_edge_names'],
        'deferred_edge_status': 'OPEN_NOT_EXECUTED_IN_THIS_LANE',
        'EOF_after_all_responses': True, 'normalizations_applied': [],
        'functional_parity_receipts': 0, 'CVG_engine_executed': False,
        'model_or_tool_requests': 0,
        'limits': 'Only12declaredpositiveIDfixtures; all11edgegrammar andothernumericfields/platforms remainopen.'})


if __name__ == '__main__':
    try:
        main()
    except BaseException as exc:
        if BASE is not None and BASE.OUT.is_dir():
            BASE.first_failure('main', exc)
        raise
