import asyncio
import errno
import json
import os
import tempfile
import time
import unittest
from unittest.mock import patch
import run

from cvg_sdk import StdioOptions, SdkWireError, attach_stdio, create_sdk_client
from cvg_sdk.validation import encode
from test_protocol import hello, response, event


async def ticks(n=4):
    for _ in range(n):
        await asyncio.sleep(0)


class StdioTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.fds, self.transports, self.tasks = [], [], []

    async def asyncTearDown(self):
        for transport in self.transports:
            await transport.close()
        if self.tasks:
            await asyncio.gather(*self.tasks, return_exceptions=True)
        for fd in self.fds:
            os.close(fd)

    def channel(self, **options):
        incoming, peer_output = os.pipe2(os.O_NONBLOCK)
        peer_input, outgoing = os.pipe2(os.O_NONBLOCK)
        self.fds.extend((incoming, peer_output, peer_input, outgoing))
        transport = attach_stdio(input_fd=incoming, output_fd=outgoing,
            options=StdioOptions('t', **options))
        self.transports.append(transport)
        return transport, peer_output, peer_input

    def start(self, t, request=None):
        task = asyncio.create_task(t.request(hello() if request is None else request))
        self.tasks.append(task)
        return task

    async def feed(self, fd, data, step=4096):
        offset = 0
        while offset < len(data):
            try:
                offset += os.write(fd, data[offset:offset + step])
            except BlockingIOError:
                pass
            await asyncio.sleep(0)
        await ticks()

    def clean(self, t):
        self.assertEqual(t._state, 'CLOSED')
        self.assertFalse(t._pending or t._seen or t._queue or t._tail or t._remainder)
        self.assertEqual(t._bytes, 0)
        self.assertIsNone(t._active)
        self.assertIsNone(t._continuation)
        self.assertFalse(t._reader or t._writer)

    async def test_basic_snapshot_and_borrowed_fd_ownership(self):
        t, write, read = self.channel()
        flags = [os.get_blocking(fd) for fd in self.fds]
        req = hello(); task = self.start(t, req)
        await ticks()
        sent = os.read(read, 4096)
        req['id'] = 'changed'; req['params']['protocolVersion'] = 99
        await self.feed(write, encode(response(), 4096), step=1)
        self.assertEqual((await task)['id'], 1)
        self.assertEqual(json.loads(sent)['params'], {'protocolVersion': 1})
        self.assertEqual(t._bytes, 0)
        self.assertEqual(len(t._seen), 1)
        await t.close(); await t.close()
        self.clean(t)
        self.assertEqual(flags, [os.get_blocking(fd) for fd in self.fds])
        for fd in self.fds:
            os.fstat(fd)

    async def test_duplicate_and_typed_ids_lifetime_preserves_accepted(self):
        t, write, read = self.channel(max_lifetime_requests=2)
        a = self.start(t, hello(1)); b = self.start(t, hello('1'))
        await ticks()
        for request in (hello(1), hello(3)):
            with self.assertRaises(SdkWireError) as cm:
                await t.request(request)
            self.assertTrue(cm.exception.retry_safe)
        await self.feed(write, encode(response('1'), 4096) + encode(response(1), 4096))
        self.assertEqual((await a)['id'], 1)
        self.assertEqual((await b)['id'], '1')
        self.assertEqual(len(os.read(read, 4096).splitlines()), 2)
        with self.assertRaises(SdkWireError) as cm:
            await t.request(hello('1'))
        self.assertEqual(cm.exception.kind, 'limit')
        os.close(write); self.fds.remove(write)
        await ticks(); self.clean(t)  # Lifetime retains observation of EOF.

    async def test_pending_and_byte_admission_refusal(self):
        for opts in ({'max_pending_requests': 1}, {'max_frame_bytes': 128, 'max_buffered_bytes': 128}):
            with self.subTest(opts=opts):
                t, _, read = self.channel(**opts)
                a = self.start(t)
                await ticks()
                with self.assertRaises(SdkWireError) as cm:
                    await t.request(hello(2))
                self.assertEqual(cm.exception.outcome, 'not_dispatched')
                self.assertEqual(len(os.read(read, 4096).splitlines()), 1)
                await t.close()
                with self.assertRaises(SdkWireError) as cm:
                    await a
                self.assertEqual(cm.exception.outcome, 'unknown')

    async def test_invalid_options_before_attach_and_second_registration_rollback(self):
        for opts in ({'max_frame_bytes': 127}, {'max_frame_bytes': 4194305},
            {'max_pending_requests': 0}, {'max_pending_requests': 1025},
            {'max_lifetime_requests': 65537}, {'max_lifetime_requests': True},
            {'request_timeout_ms': 0}, {'request_timeout_ms': 300001},
            {'max_buffered_bytes': 16777217}, {'max_buffered_bytes': 128},
            {'expected_tenant_id': ''}):
            with self.subTest(opts=opts), self.assertRaises(ValueError):
                StdioOptions(**{'expected_tenant_id': 't', **opts})
        t, _, _ = self.channel()
        await t.close()
        loop = asyncio.get_running_loop()
        baseline = set(loop._selector.get_map())
        with patch.object(loop, 'add_writer', side_effect=OSError('synthetic')):
            with self.assertRaises(ValueError):
                attach_stdio(input_fd=t._input, output_fd=t._output, options=StdioOptions('t'))
        self.assertEqual(set(loop._selector.get_map()), baseline)
        for fd in (True, -1, t._output):
            with self.subTest(fd=fd), self.assertRaises(ValueError):
                attach_stdio(input_fd=fd, output_fd=t._output, options=StdioOptions('t'))
        os.set_blocking(t._input, True)
        with self.assertRaises(ValueError):
            attach_stdio(input_fd=t._input, output_fd=t._output, options=StdioOptions('t'))
        os.set_blocking(t._input, False)
        with tempfile.TemporaryFile(dir=run.artifacts()) as regular:
            os.set_blocking(regular.fileno(), False)
            with self.assertRaises(ValueError):
                attach_stdio(input_fd=regular.fileno(), output_fd=t._output, options=StdioOptions('t'))
        with patch('cvg_sdk.stdio.os.name', 'nt'):
            with self.assertRaises(ValueError):
                attach_stdio(input_fd=t._input, output_fd=t._output, options=StdioOptions('t'))

    async def test_option_endpoints_and_bounded_bookkeeping_high_water(self):
        low = StdioOptions('t', max_frame_bytes=128, max_pending_requests=1,
            max_lifetime_requests=1, max_buffered_bytes=128, request_timeout_ms=1)
        high = StdioOptions('t', max_frame_bytes=4194304, max_pending_requests=1024,
            max_lifetime_requests=65536, max_buffered_bytes=16777216, request_timeout_ms=300000)
        self.assertEqual((low.max_frame_bytes, high.max_pending_requests), (128, 1024))
        t, write, read = self.channel(max_lifetime_requests=100)
        bytes_high, pending_high = 0, 0
        for i in range(100):
            a = self.start(t, hello(i)); await ticks()
            bytes_high = max(bytes_high, t._bytes)
            pending_high = max(pending_high, len(t._pending))
            self.assertEqual(len(t._seen), i + 1)
            os.read(read, 4096)
            await self.feed(write, encode(response(i), 4096))
            await a
            self.assertEqual(t._bytes, 0)
            self.assertFalse(t._pending or t._queue or t._active or t._tail or t._remainder)
        self.assertEqual(pending_high, 1)
        self.assertLess(bytes_high, 128)
        await t.close(); self.clean(t)

    async def test_frame_errors_vs_valid_json_invalid_response(self):
        for data, kind in [(b'\xc3(\n', 'frame'), (b'{bad}\n', 'frame'),
            (b'\xef\xbb\xbf{}\n', 'frame'), (b'\n', 'frame'),
            (b'[]\n', 'invalid_response'), (b'1\n', 'invalid_response'),
            (b'{"jsonrpc":"2.0","method":"event"}\n', 'invalid_response'),
            (b'{"x":1,"x":2}\n', 'frame')]:
            with self.subTest(data=data):
                t, write, _ = self.channel()
                a = self.start(t); await ticks()
                await self.feed(write, data)
                with self.assertRaises(SdkWireError) as cm:
                    await a
                self.assertEqual(cm.exception.kind, kind)
                self.assertEqual(cm.exception.outcome, 'unknown')
                self.clean(t)

    async def test_partial_eof_vs_clean_eof(self):
        for partial in (b'', b'{"x":1}', b'\xf0\x9f'):
            t, write, _ = self.channel()
            a = self.start(t); await ticks()
            if partial:
                await self.feed(write, partial)
            os.close(write); self.fds.remove(write)
            await ticks()
            with self.assertRaises(SdkWireError) as cm:
                await a
            self.assertEqual(cm.exception.kind, 'frame' if partial else 'transport')
            self.clean(t)

    async def test_frame_lf_exact_cap_over_cap_and_crlf_fragmentation(self):
        payload = {**response(), 'padding': '🌿é'}
        for adjustment in (0, -1):
            raw = (json.dumps(payload, ensure_ascii=False) + '\r\n').encode()
            raw = b' ' * (256 - len(raw)) + raw
            t, write, _ = self.channel(max_frame_bytes=256 + adjustment)
            a = self.start(t); await ticks()
            await self.feed(write, raw, step=1)
            if adjustment == 0:
                self.assertEqual(await a, payload)
            else:
                with self.assertRaises(SdkWireError) as cm:
                    await a
                self.assertEqual(cm.exception.kind, 'frame')
        t, write, _ = self.channel(max_frame_bytes=128)
        a = self.start(t); await ticks()
        await self.feed(write, b' ' * 128)
        with self.assertRaises(SdkWireError):
            await a

    async def test_coalesced_more_than_quantum_and_out_of_order(self):
        t, write, read = self.channel(max_pending_requests=128)
        tasks = [self.start(t, hello(i)) for i in range(70)]
        await ticks()
        # Consume the requests to avoid filling the peer pipe before all writes.
        for _ in range(4):
            try:
                os.read(read, 65536)
            except BlockingIOError:
                pass
            await ticks()
        data = b''.join(encode(response(i), 4096) for i in reversed(range(70)))
        await self.feed(write, data)
        results = await asyncio.gather(*tasks)
        self.assertEqual([r['id'] for r in results], list(range(70)))
        self.assertEqual(t._bytes, 0)

    async def test_tampered_response_id_result_and_repeated_response_close(self):
        for bad in (response('1'), response(None), response(99),
                    response(result={'protocolVersion': 2}),
                    {'jsonrpc': '2.0', 'id': 1, 'error': {'code': True, 'message': 'bad'}}):
            t, write, _ = self.channel()
            a = self.start(t); b = self.start(t, hello(2)); await ticks()
            await self.feed(write, encode(bad, 4096))
            for task in (a, b):
                with self.assertRaises(SdkWireError) as cm:
                    await task
                self.assertEqual(cm.exception.kind, 'invalid_response')
            self.clean(t)
        t, write, _ = self.channel()
        a = self.start(t); await ticks()
        await self.feed(write, encode(response(), 4096)); await a
        await self.feed(write, encode(response(), 4096))
        self.clean(t)

    async def test_event_mutations_close_before_any_pending_success(self):
        request = {**hello(), 'method': 'session.events', 'params': {'sessionId': 's'}}
        for delta in ({'tenantId': 'other'}, {'sessionId': 'other'}, {'sequence': 0},
                      {'schemaFingerprint': '0' * 64}, {'payload': {'text': 8}}):
            t, write, _ = self.channel()
            a = self.start(t, request); b = self.start(t, hello(2)); await ticks()
            await self.feed(write, encode(response(result={'events': [{**event(), **delta}]}), 4096))
            failures = await asyncio.gather(a, b, return_exceptions=True)
            self.assertTrue(all(isinstance(e, SdkWireError) and e.kind == 'invalid_response' for e in failures))

    def fill(self, fd):
        while True:
            try:
                os.write(fd, b'x' * 4096)
            except BlockingIOError:
                return

    async def test_real_pipe_backpressure_deadline_per_request_outcome(self):
        t, _, _ = self.channel(request_timeout_ms=20)
        self.fill(t._output)
        a = self.start(t); b = self.start(t, hello(2))
        failures = await asyncio.gather(a, b, return_exceptions=True)
        self.assertEqual([(e.kind, e.outcome) for e in failures],
                         [('timeout', 'unknown'), ('timeout', 'not_dispatched')])
        self.clean(t)

    async def test_partial_write_eintr_eagain_and_no_prefix_repetition(self):
        t, write, read = self.channel()
        actual = os.write
        calls, transcript = [], bytearray()
        def partial(fd, data):
            if fd != t._output:
                return actual(fd, data)
            calls.append(bytes(data))
            if len(calls) == 1:
                raise InterruptedError()
            if len(calls) == 3:
                raise BlockingIOError(errno.EAGAIN, 'synthetic')
            n = actual(fd, data[:7]); transcript.extend(data[:n]); return n
        with patch('cvg_sdk.stdio.os.write', partial):
            a = self.start(t); b = self.start(t, hello(2))
            await ticks(60)
            expected = encode(hello(), 4096) + encode(hello(2), 4096)
            self.assertEqual(bytes(transcript), expected)
            self.assertEqual(os.read(read, 4096), expected)
            await self.feed(write, encode(response(), 4096) + encode(response(2), 4096))
            await asyncio.gather(a, b)

    async def test_write_zero_error_and_throw_after_prefix_are_unknown(self):
        for mode in ('zero', 'error', 'prefix-error'):
            t, _, _ = self.channel()
            actual, calls = os.write, 0
            def broken(fd, data):
                nonlocal calls
                if fd != t._output:
                    return actual(fd, data)
                calls += 1
                if mode == 'prefix-error' and calls == 1:
                    return actual(fd, data[:3])
                if mode == 'zero':
                    return 0
                raise OSError('SYNTHETIC_SECRET')
            with patch('cvg_sdk.stdio.os.write', broken):
                a = self.start(t); await ticks()
                with self.assertRaises(SdkWireError) as cm:
                    await a
                self.assertEqual(cm.exception.outcome, 'unknown')
                self.assertNotIn('SECRET', str(cm.exception))
            self.clean(t)

    async def test_queued_and_early_partial_response_never_settle(self):
        for request_id in (1, 2):
            t, write, _ = self.channel()
            self.fill(t._output)
            a = self.start(t); b = self.start(t, hello(2)); await ticks()
            await self.feed(write, encode(response(request_id), 4096))
            failures = await asyncio.gather(a, b, return_exceptions=True)
            self.assertEqual([e.outcome for e in failures], ['unknown', 'not_dispatched'])
            self.assertTrue(all(e.kind == 'invalid_response' for e in failures))

    async def test_deadline_beats_response_at_exact_instant(self):
        t, _, _ = self.channel()
        a = self.start(t); await ticks()
        entry = next(iter(t._pending.values()))
        with patch.object(t._loop, 'time', return_value=entry.deadline):
            t._response(encode(response(), 4096))
        with self.assertRaises(SdkWireError) as cm:
            await a
        self.assertEqual(cm.exception.kind, 'timeout')

    async def test_cancel_queued_written_and_before_entry(self):
        t, _, _ = self.channel()
        self.fill(t._output)
        a = self.start(t); b = self.start(t, hello(2)); await ticks()
        b.cancel()
        errors = await asyncio.gather(a, b, return_exceptions=True)
        self.assertEqual([(e.kind, e.outcome) for e in errors],
                         [('closed', 'unknown'), ('closed', 'not_dispatched')])
        self.clean(t)
        t, _, _ = self.channel()
        a = self.start(t); a.cancel()
        with self.assertRaises(asyncio.CancelledError):
            await a
        self.assertFalse(t._seen)
        a = self.start(t); await ticks(); a.cancel()
        with self.assertRaises(SdkWireError) as cm:
            await a
        self.assertEqual(cm.exception.outcome, 'unknown')

    async def test_cancel_after_prefix_and_local_optional_none_omission(self):
        t, _, read = self.channel()
        actual, count = os.write, 0
        def prefix(fd, data):
            nonlocal count
            if fd != t._output:
                return actual(fd, data)
            count += 1
            if count == 1:
                return actual(fd, data[:5])
            raise BlockingIOError()
        with patch('cvg_sdk.stdio.os.write', prefix):
            a = self.start(t); await ticks(); a.cancel()
            with self.assertRaises(SdkWireError) as cm:
                await a
        self.assertEqual(cm.exception.outcome, 'unknown')
        self.assertEqual(os.read(read, 4096), encode(hello(), 4096)[:5])
        self.clean(t)
        t, write, read = self.channel()
        client = create_sdk_client(t)
        a = asyncio.create_task(client.read_events('s', after_sequence=None, limit=None))
        self.tasks.append(a); await ticks()
        request = json.loads(os.read(read, 4096))
        self.assertEqual(request['params'], {'sessionId': 's'})
        await self.feed(write, encode(response('py:1', {'events': []}), 4096))
        self.assertEqual(await a, [])

    async def test_settled_response_wins_cancel_race(self):
        t, _, _ = self.channel()
        a = self.start(t); await ticks()
        t._response(encode(response(), 4096))
        a.cancel()
        self.assertEqual(await a, response())
        self.assertEqual(t._state, 'OPEN')

    async def test_close_bounded_when_both_pipes_stalled_no_adapter_timers(self):
        t, _, _ = self.channel()
        self.fill(t._output)
        a = self.start(t); await ticks()
        timers = [p.timer for p in t._pending.values()]
        start = time.monotonic()
        await t.close(); await t.close()
        self.assertLess(time.monotonic() - start, 1)
        self.assertTrue(all(x.cancelled() for x in timers))
        with self.assertRaises(SdkWireError):
            await a
        self.clean(t)
        with self.assertRaises(SdkWireError) as cm:
            await t.request(hello(2))
        self.assertTrue(cm.exception.retry_safe)

    async def test_remote_error_preserved_connection_can_reconcile(self):
        t, write, _ = self.channel()
        a = self.start(t); await ticks()
        error = {'jsonrpc': '2.0', 'id': 1, 'error': {'code': 42, 'message': 'synthetic', 'data': {'hint': True}}}
        await self.feed(write, encode(error, 4096))
        with self.assertRaises(SdkWireError) as cm:
            await a
        self.assertEqual((cm.exception.kind, cm.exception.code, cm.exception.data),
                         ('remote_error', 42, {'hint': True}))
        self.assertEqual(cm.exception.outcome, 'unknown')
        b = self.start(t, hello(2)); await ticks()
        await self.feed(write, encode(response(2), 4096)); await b

    async def test_client_single_owner_allocator_and_no_extra_api_fields(self):
        t, _, _ = self.channel(max_lifetime_requests=1)
        client = create_sdk_client(t)
        with self.assertRaises(ValueError):
            create_sdk_client(t)
        with self.assertRaises(TypeError):
            await client.send_turn('x', tenant_id='other')
        await t.close()
        for _ in range(3):
            with self.assertRaises(SdkWireError):
                await client.hello()
        self.assertLessEqual(client._next_id, 2)
