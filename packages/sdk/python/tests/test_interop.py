import asyncio
import base64
import copy
import hashlib
import json
import os
import subprocess
import sys
import time
import unittest
from unittest.mock import patch

import run
from run import NodeOwner, node_json
from cvg_sdk import create_sdk_client, SdkWireError
from cvg_sdk.protocol import _CONTRACT
from cvg_sdk.validation import CATALOG, Invalid, Limit, encode, json_size, validate_event


def equivalent(test, a, b):
    # JSON numbers are one semantic type; booleans never compare equal to them.
    if type(a) in (int, float) and type(b) in (int, float):
        test.assertEqual(a, b)
    else:
        test.assertIs(type(a), type(b))
        if type(a) is dict:
            test.assertEqual(a.keys(), b.keys())
            for k in a:
                equivalent(test, a[k], b[k])
        elif type(a) is list:
            test.assertEqual(len(a), len(b))
            for x, y in zip(a, b):
                equivalent(test, x, y)
        else:
            test.assertEqual(a, b)


class InteropTests(unittest.IsolatedAsyncioTestCase):
    async def test_oracle_projection_all_nine_schemas_and_js_canonical_upper_bound(self):
        oracle = await node_json('oracle')
        for key in ('protocol_version', 'methods', 'error_codes', 'transport_error_codes', 'stop_reasons', 'event_fingerprints'):
            equivalent(self, oracle[key], _CONTRACT[key])
        equivalent(self, oracle['catalog'], CATALOG)
        self.assertTrue(all('/dist/' in p and '/src/' not in p for p in oracle['public_resolution']))
        for event, actual_size in zip(oracle['events'], oracle['canonical_sizes']):
            validate_event(event)
            self.assertGreaterEqual(json_size(event, 1048576, canonical_upper=True), actual_size)
        probe = oracle['canonical_limit_probe']
        self.assertEqual(probe['canonicalBytes'], 1048575)
        self.assertTrue(probe['tsAccepted'])
        near = copy.deepcopy(next(e for e in oracle['events'] if e['type'] == 'tool/call'))
        near['payload']['input'] = {'text': 'x' * probe['textLength']}
        with self.assertRaises(Limit):
            validate_event(near)  # Declared conservative restriction, never full TS parity.
        # Additional correlation/compaction invariants checked against TS-good inputs.
        for event in oracle['events']:
            if event['type'] == 'model/request':
                for change_nested in (False, True):
                    bad = copy.deepcopy(event)
                    if change_nested:
                        bad['payload']['request']['correlationId'] = 'other'
                    else:
                        bad['payload']['correlationId'] = 'other'
                    with self.assertRaises(Invalid):
                        validate_event(bad)
            if event['type'] == 'context/compacted':
                bad = copy.deepcopy(event); bad['payload']['throughSequence'] = bad['sequence']
                with self.assertRaises(Invalid):
                    validate_event(bad)
        (run.artifacts() / 'public-ts-oracle.json').write_text(json.dumps(oracle, ensure_ascii=False, indent=2) + '\n')

    async def test_real_compiled_full_journey_matches_public_ts_wire(self):
        async with NodeOwner('full') as owner:
            with owner.wire() as wire:
                client = create_sdk_client(owner.transport)
                hello = await client.hello()
                session = await client.open_session('stdio_session')
                turn = await client.send_turn('Olá 🌿', session['sessionId'])
                events = await client.read_events(session['sessionId'])
                page = await client.read_events(session['sessionId'], after_sequence=4)
                journey = dict(hello=hello, session=session, turn=turn, events=events, page=page)
                raw_requests, raw_responses = map(bytes, wire)
        self.assertEqual(turn, {'stopReason': 'COMPLETED', 'response': 'Resposta sintética stdio: olá 🌿.',
            'modelCalls': 1, 'toolCalls': 0, 'usage': {'inputTokens': 3, 'outputTokens': 4, 'costUsd': 0},
            'sessionId': 'stdio_session'})
        self.assertEqual([e['type'] for e in events], ['message/user', 'turn/start', 'model/request',
            'model/result', 'turn/end', 'message/assistant'])
        self.assertEqual([e['sequence'] for e in events], list(range(1, 7)))
        self.assertEqual([e['sequence'] for e in page], [5, 6])
        self.assertTrue(all(e['tenantId'] == 'sdk_stdio_synthetic' for e in events))
        self.assertEqual(owner.stats['modelCalls'], 1)
        ts = await node_json('ts-journey')
        for k, v in journey.items():
            equivalent(self, v, ts[k])
        ts_requests = base64.b64decode(ts['requests'])
        ts_responses = base64.b64decode(ts['responses'])
        files = {'full-python-requests': raw_requests, 'full-python-responses': raw_responses,
                 'full-ts-requests': ts_requests, 'full-ts-responses': ts_responses}
        mapping = []
        for index, (py_req, ts_req, py_res, ts_res) in enumerate(zip(
                raw_requests.splitlines(), ts_requests.splitlines(),
                raw_responses.splitlines(), ts_responses.splitlines()), 1):
            a, b, c, d = map(json.loads, (py_req, ts_req, py_res, ts_res))
            self.assertIs(type(a['id']), str); self.assertIs(type(b['id']), int)
            self.assertEqual(a['id'], f'py:{index}'); self.assertEqual(b['id'], index)
            self.assertEqual(c['id'], a['id']); self.assertEqual(d['id'], b['id'])
            equivalent(self, {k: v for k, v in a.items() if k != 'id'}, {k: v for k, v in b.items() if k != 'id'})
            equivalent(self, {k: v for k, v in c.items() if k != 'id'}, {k: v for k, v in d.items() if k != 'id'})
            mapping.append({'python_id': a['id'], 'ts_id': b['id']})
        self.assertEqual(len(mapping), 5)
        manifest = {}
        for name, raw in files.items():
            (run.artifacts() / f'{name}.log').write_bytes(raw)
            manifest[name] = {'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()}
        (run.artifacts() / 'cross-language-transcripts.json').write_text(json.dumps({
            'files': manifest, 'id_mapping': mapping, 'comparison': 'typed JSON semantics, exact values, no tolerance',
            'python_boundary': 'Python process to real compiled Node child stdio',
            'ts_boundary': 'public compiled TS client/server stdio adapters over byte pipes in fresh Node process'
        }, indent=2) + '\n')

    async def test_minimal_and_full_errors_and_unknown_methods(self):
        async with NodeOwner('minimal') as owner:
            client = create_sdk_client(owner.transport)
            self.assertEqual((await client.hello())['capabilities'], {
                'sessions': False, 'events': False, 'methods': ['sdk.hello', 'turn.send']})
            self.assertNotIn('sessionId', await client.send_turn('synthetic'))
            for action in (client.open_session('s'), client.read_events('s')):
                with self.assertRaises(SdkWireError) as cm:
                    await action
                self.assertEqual((cm.exception.code, cm.exception.outcome), (1003, 'unknown'))
        async with NodeOwner('full') as owner:
            client = create_sdk_client(owner.transport)
            for action, code in ((client.send_turn('x'), -32602), (client.send_turn('x', 'missing'), 1002)):
                with self.assertRaises(SdkWireError) as cm:
                    await action
                self.assertEqual(cm.exception.code, code)
            for id, method in enumerate(('toString', 'constructor', '__proto__'), 1):
                with self.assertRaises(SdkWireError) as cm:
                    await owner.transport.request({'jsonrpc': '2.0', 'id': id, 'method': method})
                self.assertEqual(cm.exception.code, -32601)
            with self.assertRaises(SdkWireError) as cm:
                await owner.transport.request({'jsonrpc': '2.0', 'id': 'version',
                    'method': 'sdk.hello', 'params': {'protocolVersion': 2}})
            self.assertEqual(cm.exception.code, 1001)

    async def test_model_failure_is_valid_result_not_retry(self):
        async with NodeOwner('model-failure') as owner:
            client = create_sdk_client(owner.transport)
            await client.open_session('stdio_session')
            result = await client.send_turn('synthetic', 'stdio_session')
            self.assertEqual(result['stopReason'], 'MODEL_FAILURE')
            events = await client.read_events('stdio_session')
            self.assertNotIn('message/assistant', [e['type'] for e in events])
        self.assertEqual(owner.stats['modelCalls'], 1)

    async def test_append_after_execution_failure_unknown_and_no_replay(self):
        async with NodeOwner('append-failure') as owner:
            client = create_sdk_client(owner.transport)
            await client.open_session('stdio_session')
            with self.assertRaises(SdkWireError) as cm:
                await client.send_turn('synthetic', 'stdio_session')
            self.assertEqual((cm.exception.code, cm.exception.outcome, cm.exception.retry_safe), (-32603, 'unknown', False))
            events = await client.read_events('stdio_session')
            self.assertIn('model/result', [e['type'] for e in events])
            self.assertEqual(events[-1]['type'], 'turn/end')
        self.assertEqual(owner.stats['modelCalls'], 1)
        self.assertEqual(owner.stats['dispatches'], 3)

    async def test_oversized_response_keeps_integral_assistant_unknown(self):
        async with NodeOwner('oversized') as owner:
            client = create_sdk_client(owner.transport)
            await client.open_session('stdio_session')
            with self.assertRaises(SdkWireError) as cm:
                await client.send_turn('synthetic', 'stdio_session')
            self.assertEqual((cm.exception.code, cm.exception.message, cm.exception.outcome),
                             (-32081, 'response_too_large', 'unknown'))
        self.assertEqual(owner.stats['modelCalls'], 1)
        self.assertEqual(owner.stats['assistantLength'], [1200])
        self.assertEqual(owner.stats['dispatches'], 2)

    async def test_tenant_payload_cannot_override_host(self):
        async with NodeOwner('full') as owner:
            extra = {'tenantId': 'other', 'actor': 'admin', 'policy': 'ALLOW',
                     'approval': 'APPROVED', 'budget': {'maxModelCalls': 999},
                     'requestedTool': {'toolId': 'synthetic.neutral', 'input': {}, 'operationKey': 'injected'}}
            for id, method, params in (
                (1, 'session.open', {'sessionId': 'stdio_session'}),
                (2, 'turn.send', {'sessionId': 'stdio_session', 'userMessage': 'synthetic'}),
                (3, 'session.events', {'sessionId': 'stdio_session'})):
                result = await owner.transport.request({'jsonrpc': '2.0', 'id': id,
                    'method': method, 'params': {**params, **extra}})
            self.assertTrue(all(e['tenantId'] == 'sdk_stdio_synthetic' for e in result['result']['events']))
        self.assertEqual(owner.stats['modelCalls'], 1)
        self.assertEqual(owner.stats['toolBodies'], 0)

    async def test_real_kernel_denial_and_approval_adapter_zero_tool_body(self):
        for mode, reason in (('deny', 'POLICY_DENIED'), ('approval', 'APPROVAL_REQUIRED')):
            with self.subTest(mode=mode):
                async with NodeOwner(mode) as owner:
                    result = await create_sdk_client(owner.transport).send_turn('synthetic')
                    self.assertEqual(result['stopReason'], reason)
                    self.assertEqual(result['toolCalls'], 0)
                self.assertEqual(owner.stats['toolBodies'], 0)
                self.assertGreaterEqual(owner.stats['policyCalls'], 1)
                if mode == 'approval':
                    self.assertGreaterEqual(owner.stats['approvalCalls'], 1)

    async def test_real_server_raw_invalid_frames_zero_dispatch(self):
        for data in (b'\xc3(\n', b'{bad}\n', b'[]\n',
                     b'{"jsonrpc":"2.0","method":"sdk.hello"}\n',
                     b'{"jsonrpc":"2.0","id":1,"method":"turn.send","params":{}}\n',
                     b'{"jsonrpc":"2.0","id":1,"method":"sdk.hello","params":{}}\n'):
            with self.subTest(data=data):
                async with NodeOwner('full', attach=False) as owner:
                    os.write(owner.child.stdin.fileno(), data)
                    self.assertTrue(await owner.wait_exit(2))
                self.assertEqual(owner.stats['dispatches'], 0)

    async def test_server_lifetime_duplicate_queue_and_byte_limits(self):
        request = lambda id: encode({'jsonrpc': '2.0', 'id': id, 'method': 'sdk.hello', 'params': {'protocolVersion': 1}}, 4096)
        for mode, data, expected in (
            ('lifetime-limit', request(1) + request(2), 1),
            ('full', request(1) + request(1), 1),
            ('byte-limit', b''.join(encode({'jsonrpc': '2.0', 'id': i, 'method': 'sdk.hello',
                'params': {'protocolVersion': 1}, 'padding': 'x' * 120}, 4096) for i in (1, 2, 3)), 1),
            ('queue-limit', request(1) + request(2) + request(3), 1)):
            async with NodeOwner(mode, attach=False) as owner:
                os.write(owner.child.stdin.fileno(), data)
                self.assertTrue(await owner.wait_exit(2))
            self.assertEqual(owner.stats['dispatches'], expected)
        actual = await node_json('server-probes')
        self.assertEqual(actual, {'before': 1, 'drainOnly': 1, 'afterBoth': 2, 'writes': 2})

    async def test_real_server_partial_json_and_utf8_eof_zero_dispatch(self):
        request = encode({'jsonrpc': '2.0', 'id': 1, 'method': 'sdk.hello',
                          'params': {'protocolVersion': 1}}, 4096)
        for data in (request[:-1], b'\xf0\x9f'):
            async with NodeOwner('full', attach=False) as owner:
                os.write(owner.child.stdin.fileno(), data)
                owner.child.stdin.close()
                self.assertTrue(await owner.wait_exit(2))
            self.assertEqual(owner.stats['dispatches'], 0)

    async def test_attached_example_owns_no_fd_or_process(self):
        async with NodeOwner('full', attach=False) as owner:
            # Give exclusive wire access to the example instead of this runner.
            loop = asyncio.get_running_loop()
            loop.remove_reader(owner.child.stdout.fileno())
            fds = (owner.child.stdout.fileno(), owner.child.stdin.fileno())
            argv = [sys.executable, '-I', '-S', '-B', str(run.BASE / 'examples/attached_client.py'),
                '--input-fd', str(fds[0]), '--output-fd', str(fds[1]),
                '--expected-tenant-id', 'sdk_stdio_synthetic']
            p = subprocess.Popen(argv, cwd=run.BASE, env=owner.env, close_fds=True,
                pass_fds=fds, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                stderr=subprocess.PIPE, shell=False)
            try:
                stdout, stderr = p.communicate(timeout=5)
                self.assertEqual(p.returncode, 0)
                self.assertEqual(stdout, b'')
                self.assertEqual(stderr, b'sdk-python-example:COMPLETED\n')
            finally:
                if p.poll() is None:
                    p.terminate()
                    try:
                        p.wait(timeout=.5)
                    except subprocess.TimeoutExpired:
                        p.kill(); p.wait(timeout=.25)
                for stream in (p.stdout, p.stderr):
                    stream.close()
            for fd in fds:
                os.fstat(fd)  # Adapter in the example left borrowed FDs intact.
        self.assertEqual(owner.stats['modelCalls'], 1)

    async def test_owner_attach_failure_reaps_own_child(self):
        owner = NodeOwner('full')
        with patch('cvg_sdk.attach_stdio', side_effect=ValueError('synthetic attach failed')):
            with self.assertRaisesRegex(ValueError, 'synthetic attach failed'):
                async with owner:
                    self.fail('attach must fail')
        self.assertIsNotNone(owner.child.returncode)
        self.assertFalse(owner.home.exists())
        self.assertTrue(all(s.closed for s in (owner.child.stdin, owner.child.stdout, owner.child.stderr)))

    async def test_owner_env_stderr_bounds_stubborn_cleanup_and_readiness_failure(self):
        with patch.dict(os.environ, {'NODE_OPTIONS': '--synthetic-invalid', 'PYTHONPATH': '/synthetic/hostile', 'LD_PRELOAD': '/synthetic/not-real'}):
            async with NodeOwner('full') as owner:
                await create_sdk_client(owner.transport).hello()
            self.assertEqual(set(owner.env), {'HOME', 'XDG_CONFIG_HOME', 'TMPDIR', 'NODE_ENV'})
        async with NodeOwner('stderr-flood') as owner:
            await create_sdk_client(owner.transport).hello()
        self.assertLessEqual(len(owner.stderr_head) + len(owner.stderr_tail), 4096)
        start = time.monotonic()
        async with NodeOwner('stubborn') as owner:
            pass
        self.assertEqual(owner.signals, ['SIGTERM', 'SIGKILL'])
        self.assertLess(time.monotonic() - start, 2.5)
        self.assertIsNotNone(owner.child.returncode)
        self.assertFalse(owner.home.exists())
        owner = NodeOwner('no-ready')
        with self.assertRaises(TimeoutError):
            async with owner:
                self.fail('must not enter')
        self.assertFalse(owner.home.exists())
        self.assertIsNotNone(owner.child.returncode)
        await owner.close()
