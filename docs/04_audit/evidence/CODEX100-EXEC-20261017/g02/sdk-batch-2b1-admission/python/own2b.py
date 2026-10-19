"""Own constant code for the batch 2B-1 diagnostics (capability-contracts-2b.json DIAG own_code). Standard library only.

Never imports the SDK, Pydantic or acquired code; importing it performs no I/O. It mirrors the transport patterns the
SDK cases exercise so that the same driver interpreter, supervisor barrier plan and evaluator machinery run in service
before any SDK slot:

- OwnClient: JSON-RPC over the adapter like CodexClient (text Popen, bufsize 1, os.environ copy + env, cwd, one reader thread
  routing responses to one-shot queues and notifications to a global queue), close() with the SDK sequence
  (stdin.close, terminate, wait(2), except: kill with no further wait).
- OwnAsync: lazy initialization under asyncio.Lock with double check (AsyncCodex._ensure_initialized pattern), requests
  through asyncio.to_thread, and a start through an own ThreadPoolExecutor (thread prefix cvg-own-start) awaited with
  asyncio.wrap_future whose except CancelledError registers a discard callback that closes an OwnSubscription
  (AsyncCodexClient._start_turn pattern).
- OwnBox / own queue consumers, a function that raises, a generator and a thread target that raises (CAP-2B-CONC-BARRIER).
"""
import asyncio
import json
import os
import queue
import subprocess
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor

LAUNCH = ('/runtime/python', '-I', '-S', '/profile/adapter-python.py')
_OWN_START_EXECUTOR = ThreadPoolExecutor(thread_name_prefix='cvg-own-start')


class OwnTransportClosed(Exception):
    pass


class OwnClient:
    def __init__(self, launch=LAUNCH, cwd='/work', env=None):
        self.launch, self.cwd, self.env = tuple(launch), cwd, dict(env or {})
        self._proc = None
        self._lock = threading.Lock()
        self._waiters = {}
        self._global = queue.Queue()
        self._reader_thread = None
        self._methods = {}
        self._log = []  # reader order: ['n', method] or ['r', method of the answered request]

    def start(self):
        if self._proc is not None:
            return None
        env = os.environ.copy()
        env.update(self.env)
        self._proc = subprocess.Popen(list(self.launch), stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                      text=True, encoding='utf-8', cwd=self.cwd, env=env, bufsize=1)
        threading.Thread(target=self._drain, daemon=True, name='cvg-own-stderr').start()
        self._reader_thread = threading.Thread(target=self._reader, daemon=True, name='cvg-own-reader')
        self._reader_thread.start()
        return None

    def _drain(self):
        for _line in self._proc.stderr:
            pass

    def _reader(self):
        try:
            while True:
                line = self._proc.stdout.readline()
                if not line:
                    raise OwnTransportClosed('own transport closed stdout')
                msg = json.loads(line)
                if 'method' in msg and 'id' not in msg:
                    self._log.append(['n', msg['method']])
                    self._global.put(msg)
                    continue
                with self._lock:
                    w = self._waiters.pop(str(msg.get('id')), None)
                    self._log.append(['r', self._methods.get(str(msg.get('id')))])
                if w is not None:
                    w.put(msg)
        except BaseException as exc:  # noqa: BLE001 - every blocked waiter is woken with the same failure
            with self._lock:
                ws = list(self._waiters.values())
                self._waiters.clear()
            for w in ws:
                w.put(exc)
            self._global.put(exc)

    def _write(self, obj):
        if self._proc is None or self._proc.stdin is None:
            raise OwnTransportClosed('own process is not running')
        with self._lock:
            self._proc.stdin.write(json.dumps(obj) + '\n')
            self._proc.stdin.flush()

    def request(self, method, params=None):
        rid = str(uuid.uuid4())
        w = queue.Queue(maxsize=1)
        with self._lock:
            self._waiters[rid] = w
            self._methods[rid] = method
        msg = {'id': rid, 'method': method}
        if params is not None:
            msg['params'] = params
        self._write(msg)
        item = w.get()
        if isinstance(item, BaseException):
            raise item
        if 'error' in item:
            raise RuntimeError('own rpc error %s' % item['error'].get('code'))
        return item.get('result')

    def notify(self, method, params=None):
        msg = {'method': method}
        if params is not None:
            msg['params'] = params
        self._write(msg)

    def initialize(self):
        result = self.request('initialize', {'clientInfo': {'name': 'cvg_own_diagnostic', 'title': 'constant', 'version': '0'},
                                             'capabilities': {'experimentalApi': True}})
        self.notify('initialized', None)
        return result

    def next_notification(self):
        item = self._global.get()
        if isinstance(item, BaseException):
            raise item
        return item

    def close(self):
        """The SDK close sequence: stdin.close, terminate, wait(timeout=2); on any exception kill() without a further wait."""
        if self._proc is None:
            return None
        proc = self._proc
        self._proc = None
        if proc.stdin:
            proc.stdin.close()
        try:
            proc.terminate()
            proc.wait(timeout=2)
        except Exception:  # noqa: BLE001 - same branch as CodexClient.close
            proc.kill()
        return None


class OwnSubscription:
    def __init__(self, label):
        self.label = label
        self._closed = False

    def close(self):
        self._closed = True
        return None


class OwnAsync:
    def __init__(self, launch=LAUNCH, cwd='/work', env=None):
        self._client = OwnClient(launch, cwd, env)
        self._initialized = False
        self._init = None
        self._init_lock = asyncio.Lock()

    async def _ensure_initialized(self):
        if self._initialized:
            return
        async with self._init_lock:
            if self._initialized:
                return
            try:
                await asyncio.to_thread(self._client.start)
                self._init = await asyncio.to_thread(self._client.initialize)
                self._initialized = True
            except Exception:
                await asyncio.to_thread(self._client.close)
                self._init = None
                self._initialized = False
                raise

    async def call(self, method):
        await self._ensure_initialized()
        return await asyncio.to_thread(self._client.request, method, None)

    def _start_sync(self, label):
        result = self._client.request('own/start', {'label': label})
        return result, OwnSubscription(label)

    async def start(self, label):
        """AsyncCodexClient._start_turn pattern over own code: cancellation after the result closes the subscription."""
        await self._ensure_initialized()
        operation = _OWN_START_EXECUTOR.submit(self._start_sync, label)
        try:
            return (await asyncio.wrap_future(operation))[0]
        except asyncio.CancelledError:
            def discard_cancelled_result(completed):
                try:
                    _, subscription = completed.result()
                except BaseException:  # noqa: BLE001
                    return
                subscription.close()

            operation.add_done_callback(discard_cancelled_result)
            raise

    async def aclose(self):
        await asyncio.to_thread(self._client.close)
        self._initialized = False
        self._init = None


class OwnBox:
    """Condition consumer and queue consumer used for the parking witnesses (CAP-2B-CONC-BARRIER)."""

    def __init__(self):
        self._cond = threading.Condition()
        self._items = []
        self._queue = queue.Queue()

    def wait_item(self):
        with self._cond:
            while not self._items:
                self._cond.wait()
            return self._items.pop(0)

    def put_one(self, item):
        with self._cond:
            self._items.append(item)
            self._cond.notify()
        return None

    def put_all(self, item, n):
        with self._cond:
            self._items.extend([item] * n)
            self._cond.notify_all()
        return None

    def queue_get(self):
        return self._queue.get()

    def queue_put(self, item):
        self._queue.put(item)
        return None


def own_raises(label):
    raise RuntimeError('own raise %s' % label)


def own_generator(n):
    for i in range(n):
        yield i


def own_generator_drain(n):
    """Resumes own_generator until StopIteration: call/return on every resumption (CPython 3.12 setprofile)."""
    return list(own_generator(n))


def own_thread_that_raises(label):
    t = threading.Thread(target=own_raises, args=(label,), name='cvg-own-raiser', daemon=True)
    t.start()
    return t
