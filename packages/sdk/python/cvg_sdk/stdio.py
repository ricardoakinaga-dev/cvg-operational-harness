"""Async attach to exclusive, host-owned nonblocking POSIX pipe descriptors."""
import asyncio
from collections import deque
from dataclasses import dataclass, field
import os
import stat

from .protocol import SdkWireError, JsonRpcRequest, JsonRpcSuccess
from .validation import (Invalid, Limit, decode, encode, identifier, id_key,
                         validate_request, validate_response)


@dataclass(frozen=True)
class StdioOptions:
    expected_tenant_id: str
    max_frame_bytes: int = field(default=1048576, kw_only=True)
    max_pending_requests: int = field(default=64, kw_only=True)
    max_lifetime_requests: int = field(default=4096, kw_only=True)
    max_buffered_bytes: int = field(default=4194304, kw_only=True)
    request_timeout_ms: int = field(default=30000, kw_only=True)

    def __post_init__(self):
        if not identifier(self.expected_tenant_id):
            raise ValueError('Invalid SDK stdio tenant')
        for name, low, high in (
            ('max_frame_bytes', 128, 4194304),
            ('max_pending_requests', 1, 1024),
            ('max_lifetime_requests', 1, 65536),
            ('max_buffered_bytes', self.max_frame_bytes, 16777216),
            ('request_timeout_ms', 1, 300000),
        ):
            n = getattr(self, name)
            if type(n) is not int or not low <= n <= high:
                raise ValueError('Invalid SDK stdio limit')


@dataclass
class _Pending:
    request: dict
    frame: bytes | None
    size: int
    future: asyncio.Future
    deadline: float
    timer: asyncio.TimerHandle | None = None
    written: bool = False
    complete: bool = False
    offset: int = 0


class StdioTransport:
    """Construct through attach_stdio; all methods belong to its running loop."""

    def __init__(self, input_fd, output_fd, options, loop):
        self._input, self._output, self.options, self._loop = input_fd, output_fd, options, loop
        self._state = 'OPEN'
        self._pending, self._seen, self._queue = {}, set(), deque()
        self._bytes, self._tail, self._remainder = 0, bytearray(), b''
        self._active = self._continuation = None
        self._reader = self._writer = self._client_bound = False
        # Both registrations must succeed. Roll back even partial attach.
        try:
            self._loop.add_reader(self._input, self._read)
            self._reader = True
            self._loop.add_writer(self._output, self._write)
            self._writer = True
            self._unwatch_writer()
        except BaseException:
            if self._reader:
                self._loop.remove_reader(self._input)
            if self._writer:
                self._loop.remove_writer(self._output)
            self._state = 'CLOSED'
            raise ValueError('Invalid SDK stdio descriptors') from None

    def _same_loop(self):
        if asyncio.get_running_loop() is not self._loop:
            raise RuntimeError('SDK transport belongs to another event loop')

    @staticmethod
    def _error(kind, request, written=False):
        return SdkWireError(kind, request['id'], request['method'],
                            'unknown' if written else 'not_dispatched')

    def _unwatch_writer(self):
        if self._writer:
            self._loop.remove_writer(self._output)
            self._writer = False

    def _close(self, kind):
        if self._state != 'OPEN':
            return
        self._state = 'CLOSING'
        if self._reader:
            self._loop.remove_reader(self._input)
            self._reader = False
        self._unwatch_writer()
        if self._continuation is not None:
            self._continuation.cancel()
            self._continuation = None
        for entry in self._pending.values():
            entry.timer.cancel()
            entry.frame = None
            if not entry.future.done():
                entry.future.set_exception(self._error(kind, entry.request, entry.written))
        self._pending.clear()
        self._queue.clear()
        self._seen.clear()
        self._active = None
        self._bytes = 0
        self._tail.clear()
        self._remainder = b''
        self._state = 'CLOSED'

    def _expired(self):
        if self._state != 'OPEN':
            return True
        now = self._loop.time()
        if any(p.deadline <= now for p in self._pending.values()):
            self._close('timeout')
            return True
        return False

    def _timeout(self, entry):
        # asyncio may wake a timer up to one clock-resolution early.
        if not self._expired() and not entry.future.done():
            entry.timer = self._loop.call_at(entry.deadline, self._timeout, entry)

    def _watch_writer(self):
        if not self._writer:
            try:
                self._loop.add_writer(self._output, self._write)
                self._writer = True
            except (OSError, ValueError, RuntimeError):
                self._close('transport')

    def _write(self):
        quota, calls = 65536, 0
        while quota > 0 and calls < 32 and not self._expired():
            if self._active is None:
                if not self._queue:
                    self._unwatch_writer()
                    return
                self._active = self._queue.popleft()
            entry = self._active
            entry.written = True  # Before the attempt, including throw/EAGAIN.
            calls += 1
            try:
                n = os.write(self._output, memoryview(entry.frame)[entry.offset:entry.offset + quota])
            except BlockingIOError:
                self._watch_writer()
                return
            except InterruptedError:
                continue
            except (OSError, ValueError):
                self._close('transport')
                return
            if n <= 0 or n > min(len(entry.frame) - entry.offset, quota):
                self._close('transport')
                return
            quota -= n
            entry.offset += n
            if entry.offset == entry.size:
                entry.frame = None
                entry.complete = True
                self._active = None
        if self._state == 'OPEN':
            if self._active is not None or self._queue:
                self._watch_writer()
            else:
                self._unwatch_writer()

    def _response(self, frame):
        if self._expired():
            return
        try:
            response = decode(frame)
        except (ValueError, UnicodeError, RecursionError, MemoryError, OverflowError):
            self._close('frame')
            return
        try:
            key = id_key(response.get('id')) if type(response) is dict else None
            entry = self._pending.get(key)
            if entry is None or not entry.written or not entry.complete:
                raise Invalid()
            validate_response(entry.request, response, self.options.expected_tenant_id)
        except (ValueError, TypeError, KeyError, UnicodeError, RecursionError, MemoryError):
            self._close('invalid_response')
            return
        if self._expired():
            return
        del self._pending[key]
        self._bytes -= entry.size
        entry.timer.cancel()
        if 'error' in response:
            error = response['error']
            entry.future.set_exception(SdkWireError(
                'remote_error', entry.request['id'], entry.request['method'],
                'unknown', error['code'], error['message'], error.get('data')))
        else:
            entry.future.set_result(response)

    def _consume(self, chunk):
        offset, count = 0, 0
        while offset < len(chunk) and count < 32 and not self._expired():
            lf = chunk.find(b'\n', offset)
            end = len(chunk) if lf < 0 else lf + 1
            length = len(self._tail) + end - offset
            if length > self.options.max_frame_bytes or (lf < 0 and length >= self.options.max_frame_bytes):
                self._close('frame')
                return
            self._tail.extend(memoryview(chunk)[offset:end])
            offset = end
            if lf < 0:
                break
            self._response(self._tail)
            self._tail.clear()
            count += 1
        if self._state == 'OPEN' and offset < len(chunk):
            self._remainder = chunk[offset:]
            self._continuation = self._loop.call_soon(self._resume_read)
        elif self._state == 'OPEN':
            self._loop.add_reader(self._input, self._read)
            self._reader = True

    def _resume_read(self):
        self._continuation = None
        chunk, self._remainder = self._remainder, b''
        try:
            self._consume(chunk)
        except (OSError, ValueError, RuntimeError, MemoryError):
            self._close('transport')

    def _read(self):
        if self._expired():
            return
        try:
            chunk = os.read(self._input, 65536)
        except (BlockingIOError, InterruptedError):
            return
        except (OSError, ValueError):
            self._close('transport')
            return
        if not chunk:
            self._close('frame' if self._tail else 'transport')
            return
        self._loop.remove_reader(self._input)
        self._reader = False
        try:
            self._consume(chunk)
        except (OSError, ValueError, RuntimeError, MemoryError):
            self._close('transport')

    async def request(self, request: JsonRpcRequest) -> JsonRpcSuccess:
        self._same_loop()
        # Inputs incapable of identifying a request are API misuse, before I/O.
        if type(request) is not dict or not valid_request_identity(request):
            raise TypeError('Invalid SDK request identity')
        if self._state != 'OPEN':
            raise self._error('closed', request)
        try:
            # Preflight before params validators to avoid encoding giant strings.
            frame = encode(request, self.options.max_frame_bytes)
            snapshot = decode(frame)
            validate_request(snapshot)
        except Limit:
            raise self._error('limit', request) from None
        except (ValueError, TypeError, UnicodeError, RecursionError, MemoryError, OverflowError):
            raise self._error('frame', request) from None
        key = id_key(snapshot['id'])
        if (key in self._seen or len(self._seen) >= self.options.max_lifetime_requests
                or len(self._pending) >= self.options.max_pending_requests
                or self._bytes + len(frame) > self.options.max_buffered_bytes):
            raise self._error('limit', snapshot)
        self._seen.add(key)
        # Only correlation metadata lives past encoding; no message clone retained.
        p = snapshot.get('params', {})
        meta = {k: p[k] for k in ('sessionId', 'afterSequence', 'limit') if type(p) is dict and k in p}
        entry = _Pending({'id': snapshot['id'], 'method': snapshot['method'], 'params': meta},
                         frame, len(frame), self._loop.create_future(),
                         self._loop.time() + self.options.request_timeout_ms / 1000)
        entry.timer = self._loop.call_at(entry.deadline, self._timeout, entry)
        self._pending[key] = entry
        self._queue.append(entry)
        self._bytes += entry.size
        self._write()
        # Drop local snapshots/frame before the long await; pending owns only one.
        del frame, snapshot, request, p, meta
        try:
            return await asyncio.shield(entry.future)
        except asyncio.CancelledError:
            if not entry.future.done():
                self._close('closed')
            # A settled response wins; otherwise structured closed/uncertainty.
            return entry.future.result()

    async def close(self):
        self._same_loop()
        self._close('closed')


def valid_request_identity(r):
    from .validation import valid_id
    return valid_id(r.get('id')) and type(r.get('method')) is str and bool(r['method'])


def attach_stdio(*, input_fd: int, output_fd: int, options: StdioOptions) -> StdioTransport:
    loop = asyncio.get_running_loop()
    if os.name != 'posix' or not isinstance(loop, asyncio.SelectorEventLoop):
        raise ValueError('SDK stdio requires a POSIX selector loop')
    if type(options) is not StdioOptions or input_fd == output_fd:
        raise ValueError('Invalid SDK stdio options')
    options.__post_init__()
    import fcntl
    for fd, access in ((input_fd, os.O_RDONLY), (output_fd, os.O_WRONLY)):
        try:
            valid = (type(fd) is int and stat.S_ISFIFO(os.fstat(fd).st_mode)
                     and not os.get_blocking(fd)
                     and fcntl.fcntl(fd, fcntl.F_GETFL) & os.O_ACCMODE == access)
        except (OSError, ValueError):
            valid = False
        if not valid:
            raise ValueError('Invalid SDK stdio descriptors')
    return StdioTransport(input_fd, output_fd, options, loop)
