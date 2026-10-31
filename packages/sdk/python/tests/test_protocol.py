import copy
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

import run
from cvg_sdk import SDK_METHODS, SDK_ERROR_CODES, SDK_TRANSPORT_ERROR_CODES
from cvg_sdk.protocol import _CONTRACT
from cvg_sdk.validation import (CATALOG, Invalid, Limit, check_catalog, decode,
    encode, identifier, id_key, integer, json_size, utf16, validate_event,
    validate_request, validate_response)


def hello(id=1):
    return {'jsonrpc': '2.0', 'id': id, 'method': 'sdk.hello', 'params': {'protocolVersion': 1}}


def hello_result():
    return {'protocolVersion': 1, 'capabilities': {
        'sessions': True, 'events': True, 'methods': list(SDK_METHODS)}}


def response(id=1, result=None):
    return {'jsonrpc': '2.0', 'id': id, 'result': hello_result() if result is None else result}


def event(seq=1, id='e'):
    return {'tenantId': 't', 'sessionId': 's', 'formatVersion': 1, 'eventId': id,
        'timestamp': '0000-02-29T00:00:00.000Z', 'correlationId': 'c', 'traceId': 'trace',
        'type': 'message/user', 'payload': {'text': 'Olá 🌿'}, 'sequence': seq,
        'schemaFingerprint': _CONTRACT['event_fingerprints']['message/user']}


class ProtocolTests(unittest.TestCase):
    def test_local_copy_only_imports_stdlib_and_own_json(self):
        with tempfile.TemporaryDirectory(dir=run.artifacts()) as root:
            dest = Path(root) / 'cvg_sdk'
            shutil.copytree(run.BASE / 'cvg_sdk', dest)
            script = '''import sys,json,asyncio,os
sys.path.insert(0,sys.argv[1])
import cvg_sdk
assert 'site' not in sys.modules
assert all('site-packages' not in str(getattr(m,'__file__','')) for m in sys.modules.values())
async def main():
    incoming,peer_write=os.pipe2(os.O_NONBLOCK)
    peer_read,outgoing=os.pipe2(os.O_NONBLOCK)
    t=cvg_sdk.attach_stdio(input_fd=incoming,output_fd=outgoing,options=cvg_sdk.StdioOptions('t'))
    try:
        task=asyncio.create_task(cvg_sdk.create_sdk_client(t).hello())
        await asyncio.sleep(0)
        request=json.loads(os.read(peer_read,4096))
        result={'protocolVersion':1,'capabilities':{'sessions':False,'events':False,'methods':['sdk.hello','turn.send']}}
        os.write(peer_write,(json.dumps({'jsonrpc':'2.0','id':request['id'],'result':result})+'\\n').encode())
        assert (await task)==result
    finally:
        await t.close()
        for fd in (incoming,peer_write,peer_read,outgoing): os.close(fd)
asyncio.run(main())
print(json.dumps({'protocol':cvg_sdk.SDK_PROTOCOL_VERSION,'methods':cvg_sdk.SDK_METHODS}))
'''
            p = subprocess.run([sys.executable, '-I', '-S', '-B', '-c', script, root],
                cwd=root, env={}, capture_output=True, timeout=5, check=True)
            self.assertEqual(json.loads(p.stdout)['methods'], list(SDK_METHODS))
            self.assertFalse(any(Path(root).rglob('__pycache__')))

    def test_source_pins_and_catalog_exact_copy(self):
        root = run.BASE.parents[2]
        for path, sha in _CONTRACT['source_sha256'].items():
            self.assertEqual(hashlib.sha256((root / path).read_bytes()).hexdigest(), sha, path)
        self.assertEqual((run.BASE / 'cvg_sdk/session_event_schemas_v1.json').read_bytes(),
                         (root / 'packages/contracts/src/session-event-schemas.v1.json').read_bytes())
        self.assertEqual(len(_CONTRACT['event_fingerprints']), 9)

    def test_js_identity_numeric_and_unicode_boundaries(self):
        self.assertNotEqual(id_key(1), id_key('1'))
        self.assertEqual(id_key(-0.0), id_key(0))
        self.assertEqual(id_key(1.0), id_key(1))
        for v in (True, None, 9007199254740992, '', 'a\0b', '🌿' * 101, '\ufeff', '\u00a0'):
            with self.subTest(v=repr(v)), self.assertRaises(Invalid):
                id_key(v)
        self.assertTrue(identifier('🌿' * 100))
        self.assertTrue(identifier('\u0085'))  # Python strip differs from JS.
        self.assertEqual(utf16('🌿é'), 3)
        self.assertFalse(integer(True))

    def test_encode_preflight_exact_escapes_and_no_custom_callbacks(self):
        for value in ('', '\x7f' * 10, '🌿é\0\n"\\', {'x': [1, 1.0, None, True, False, -0.0]}):
            expected = (json.dumps(value, ensure_ascii=True, separators=(',', ':')) + '\n').encode()
            self.assertEqual(encode(value, len(expected)), expected)
            with self.assertRaises(Limit):
                encode(value, len(expected) - 1)
        class Hostile(dict):
            def items(self):
                raise AssertionError('must not execute')
        for value in (Hostile(), {'x': float('nan')}, {'x': '\ud800'}, {1: 'bad'}):
            with self.assertRaises(Invalid):
                encode(value, 1024)
        cycle = []; cycle.append(cycle)
        with self.assertRaises(Invalid):
            encode(cycle, 1024)
        with self.assertRaises(Limit):
            encode({'x': '🌿' * 1000000}, 128)

    def test_bounded_parser_adversaries(self):
        cases = [b'\xef\xbb\xbf{}\n', b'\xc3(\n', b'{bad}\n', b'{"x":1,"x":2}\n',
                 b'{"x":"\\ud800"}\n', b'{"x":NaN}\n', b'{"x":Infinity}\n',
                 b'{"x":1e400}\n', b'[' * 66 + b'0' + b']' * 66,
                 b'[' + b'0,' * 20000 + b'0]']
        for data in cases:
            with self.subTest(data=data[:30]), self.assertRaises((ValueError, UnicodeError)):
                decode(data)
        self.assertEqual(decode(b'{"x":1.0,"y":-0,"s":"\\ud83c\\udf3f"}'),
                         {'x': 1.0, 'y': 0, 's': '🌿'})
        self.assertIs(type(decode(b'9007199254740993')), float)

    def test_request_params_rules(self):
        for request in (hello(), hello('🌿'), {**hello(), 'method': '__proto__'},
            {**hello(), 'method': 'turn.send', 'params': {'userMessage': 'a' * 65536}},
            {**hello(), 'method': 'session.events', 'params': {'sessionId': 's', 'limit': 500, 'afterSequence': 0}}):
            validate_request(request)
        invalid = [
            {**hello(), 'jsonrpc': '1.0'}, {**hello(), 'id': True},
            {**hello(), 'params': []}, {**hello(), 'params': {'protocolVersion': True}},
            {**hello(), 'method': 'turn.send', 'params': {'userMessage': '\ufeff'}},
            {**hello(), 'method': 'turn.send', 'params': {'userMessage': 'a' * 65537}},
            {**hello(), 'method': 'session.events', 'params': {'sessionId': 's', 'limit': 501}},
            {**hello(), 'method': 'session.events', 'params': {'sessionId': 's', 'afterSequence': -1}},
        ]
        for request in invalid:
            with self.subTest(request=str(request)[:90]), self.assertRaises(Invalid):
                validate_request(request)

    def test_correlated_results_no_coercion(self):
        validate_response(hello(), response(), 't')
        mutations = [
            {'jsonrpc': '1.0'}, {'id': '1'}, {'id': None},
            {'error': {'code': 1, 'message': 'bad'}},
            {'result': {**hello_result(), 'protocolVersion': True}},
            {'result': {**hello_result(), 'protocolVersion': 2}},
            {'result': {'protocolVersion': 1, 'capabilities': {
                'sessions': False, 'events': True, 'methods': list(SDK_METHODS)}}},
            {'result': {'protocolVersion': 1, 'capabilities': {
                'sessions': True, 'events': True, 'methods': list(SDK_METHODS) + ['sdk.hello']}}},
            {'result': {'protocolVersion': 1, 'capabilities': {
                'sessions': True, 'events': True, 'methods': list(SDK_METHODS) + ['__proto__']}}},
            {'result': {'protocolVersion': 1, 'capabilities': {
                'sessions': True, 'events': True, 'methods': list(SDK_METHODS) + ['session.li st']}}},
            {'result': {'protocolVersion': 1, 'capabilities': {
                'sessions': True, 'events': True, 'methods': list(SDK_METHODS) + [['session']]}}},
        ]
        for delta in mutations:
            with self.subTest(delta=delta), self.assertRaises(Invalid):
                validate_response(hello(), {**response(), **delta}, 't')
        for extra in ('session.fork', 'toString', 'a.b.c1'):
            with self.subTest(extra=extra):
                validate_response(hello(), response(result={'protocolVersion': 1, 'capabilities': {
                    'sessions': True, 'events': True, 'methods': list(SDK_METHODS) + [extra]}}), 't')
        for code, message in ((True, 'bad'), (1.1, 'bad'), (1, ''), (1, '🌿' * 257)):
            with self.subTest(code=code, message=message[:10]), self.assertRaises(Invalid):
                validate_response(hello(), {'jsonrpc': '2.0', 'id': 1, 'error': {'code': code, 'message': message}}, 't')
        validate_response(hello(), {'jsonrpc': '2.0', 'id': 1,
            'error': {'code': 42, 'message': 'synthetic', 'data': {'hint': True}}}, 't')

    def test_all_turn_fields_and_open_session(self):
        request = {**hello(), 'method': 'turn.send', 'params': {'userMessage': 'x', 'sessionId': 's'}}
        good = {'stopReason': 'COMPLETED', 'response': 'x', 'modelCalls': 1, 'toolCalls': 0,
                'usage': {'inputTokens': 1, 'outputTokens': 2, 'costUsd': 0.1}, 'sessionId': 's'}
        validate_response(request, response(result=good), 't')
        mutations = [{'stopReason': 'RETRY'}, {'response': 1}, {'modelCalls': True},
            {'toolCalls': -1}, {'sessionId': 'other'}, {'usage': None},
            *({'usage': {**good['usage'], key: bad}} for key, bad in
              [('inputTokens', True), ('outputTokens', 1.5), ('costUsd', -1), ('costUsd', float('inf'))])]
        for delta in mutations:
            with self.subTest(delta=delta), self.assertRaises(Invalid):
                validate_response(request, response(result={**good, **delta}), 't')
        with self.assertRaises(Invalid):
            validate_response({**request, 'params': {'userMessage': 'x'}}, response(result=good), 't')
        open_request = {**hello(), 'method': 'session.open', 'params': {'sessionId': 's'}}
        for v in ({'sessionId': 'other', 'formatVersion': 1}, {'sessionId': 's', 'formatVersion': True}):
            with self.assertRaises(Invalid):
                validate_response(open_request, response(result=v), 't')

    def test_event_page_identity_schema_calendar_order_and_bound(self):
        request = {**hello(), 'method': 'session.events', 'params': {'sessionId': 's', 'afterSequence': 1, 'limit': 2}}
        good = {'events': [event(2), event(5, 'e2')]}
        validate_response(request, response(result=good), 't')
        for delta in ({'tenantId': 'wrong'}, {'sessionId': 'wrong'}, {'sequence': 1},
                      {'formatVersion': True}, {'schemaFingerprint': '0' * 64}, {'payload': {'text': 8}},
                      {'extra': 1}, {'timestamp': '0001-02-29T00:00:00.000Z'},
                      {'timestamp': '2026-01-01T24:00:00.000Z'}, {'correlationId': '\0'}):
            with self.subTest(delta=delta), self.assertRaises(Invalid):
                validate_response(request, response(result={'events': [{**event(2), **delta}]}), 't')
        for events in ([event(3), event(2, 'e2')], [event(2), event(3)], [event(2), event(3, 'e2'), event(4, 'e3')]):
            with self.assertRaises(Invalid):
                validate_response(request, response(result={'events': events}), 't')
        for timestamp in ('0000-02-29T00:00:00.000Z', '2000-02-29T23:59:59.999Z'):
            validate_event({**event(), 'timestamp': timestamp})
        with self.assertRaises(Limit):
            json_size({'x': 'a' * 1048576}, 1048576, canonical_upper=True)

    def test_catalog_unknown_keyword_ref_or_pattern_rejected(self):
        for mutation in ('keyword', 'ref', 'pattern'):
            catalog = copy.deepcopy(CATALOG)
            if mutation == 'keyword':
                catalog['events']['message/user']['oneOf'] = []
            elif mutation == 'ref':
                catalog['events']['message/user']['$ref'] = 'https://invalid.example/schema'
            else:
                catalog['definitions']['id']['pattern'] = '.*'
            with self.subTest(mutation=mutation), self.assertRaises(Invalid):
                check_catalog(catalog)

    def test_error_constants_are_read_only(self):
        self.assertEqual(SDK_ERROR_CODES['session_not_found'], 1002)
        self.assertEqual(SDK_TRANSPORT_ERROR_CODES['invalid_response'], -32085)
        with self.assertRaises(TypeError):
            SDK_ERROR_CODES['session_not_found'] = 3
