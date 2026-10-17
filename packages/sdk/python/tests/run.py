"""Trusted focused unittest runner and fixed synthetic Node-child owner."""
import argparse
import asyncio
import base64
from contextlib import contextmanager
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

BASE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BASE))
NODE = None
EVIDENCE = BASE / 'tests/.artifacts'
FIXTURE = BASE / 'tests/fixtures/stdio-host.mjs'
MODES = {'full', 'minimal', 'model-failure', 'append-failure', 'oversized',
         'deny', 'approval', 'oracle', 'ts-journey', 'server-probes', 'stubborn',
         'no-ready', 'stderr-flood', 'queue-limit', 'byte-limit', 'lifetime-limit'}


def artifacts():
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    return EVIDENCE


class NodeOwner:
    """Test-only child ownership. The client adapter never closes these FDs."""
    def __init__(self, mode, *, attach=True, readiness=True):
        if mode not in MODES or not NODE or not Path(NODE).is_absolute():
            raise ValueError('Trusted Node executable and fixture mode required')
        self.mode, self.attach, self.readiness = mode, attach, readiness
        self.child = self.transport = None
        self.stderr_head, self.stderr_tail, self.line = bytearray(), bytearray(), bytearray()
        self.ready = None
        self.signals = []
        self.home = None
        self.stdout_data = bytearray()
        self._closed = False
        self.argv = self.env = None

    async def __aenter__(self):
        from cvg_sdk import attach_stdio, StdioOptions
        loop = asyncio.get_running_loop()
        self.ready = loop.create_future()
        self.home = Path(tempfile.mkdtemp(prefix='node-home-', dir=artifacts()))
        env = {k: str(self.home) for k in ('HOME', 'XDG_CONFIG_HOME', 'TMPDIR')}
        env['NODE_ENV'] = 'test'
        try:
            self.argv, self.env = [NODE, str(FIXTURE), self.mode], env
            self.child = subprocess.Popen(self.argv,
                stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                cwd=FIXTURE.parent, env=env, shell=False, close_fds=True, bufsize=0)
            for stream in (self.child.stdin, self.child.stdout, self.child.stderr):
                os.set_blocking(stream.fileno(), False)
            loop.add_reader(self.child.stderr.fileno(), self._stderr)
            if not self.attach:
                loop.add_reader(self.child.stdout.fileno(), self._stdout)
            if self.readiness:
                await asyncio.wait_for(asyncio.shield(self.ready), 2)
            if self.attach:
                self.transport = attach_stdio(input_fd=self.child.stdout.fileno(),
                    output_fd=self.child.stdin.fileno(), options=StdioOptions(
                        'sdk_stdio_synthetic', request_timeout_ms=2000))
            return self
        except BaseException:
            await self.close()
            raise

    def _stderr(self):
        try:
            chunk = os.read(self.child.stderr.fileno(), 65536)
        except (BlockingIOError, InterruptedError):
            return
        if not chunk:
            asyncio.get_running_loop().remove_reader(self.child.stderr.fileno())
            return
        self.stderr_head.extend(chunk[:max(0, 2048 - len(self.stderr_head))])
        self.stderr_tail.extend(chunk)
        del self.stderr_tail[:-2048]
        for b in chunk:
            if b == 10:
                if self.line == b'sdk-stdio-ready' and not self.ready.done():
                    self.ready.set_result(None)
                self.line.clear()
            elif len(self.line) < 256:
                self.line.append(b)

    def _stdout(self):
        try:
            chunk = os.read(self.child.stdout.fileno(), 65536)
        except (BlockingIOError, InterruptedError):
            return
        if not chunk:
            asyncio.get_running_loop().remove_reader(self.child.stdout.fileno())
            return
        if len(self.stdout_data) + len(chunk) > 1048576:
            raise RuntimeError('Synthetic fixture output exceeded bound')
        self.stdout_data.extend(chunk)

    async def wait_exit(self, seconds):
        deadline = asyncio.get_running_loop().time() + seconds
        while self.child.poll() is None and asyncio.get_running_loop().time() < deadline:
            await asyncio.sleep(.005)
        return self.child.poll() is not None

    async def close(self):
        if self._closed:
            return
        if not self.child:
            if self.home:
                shutil.rmtree(self.home)
            return
        if self.transport:
            await self.transport.close()
        self.child.stdin.close()
        exited = await self.wait_exit(1)
        if not exited:
            self.signals.append('SIGTERM')
            self.child.terminate()
            exited = await self.wait_exit(.5)
        if not exited:
            self.signals.append('SIGKILL')
            self.child.kill()
            exited = await self.wait_exit(.25)
        if not exited:
            raise RuntimeError('Synthetic child shutdown unconfirmed; private directory retained')
        # Consume final bounded diagnostics after reap, before removing callbacks.
        self._stderr()
        if not self.attach:
            self._stdout()
        loop = asyncio.get_running_loop()
        for stream in (self.child.stdout, self.child.stderr):
            loop.remove_reader(stream.fileno())
            stream.close()
        if not all(s.closed for s in (self.child.stdin, self.child.stdout, self.child.stderr)):
            raise RuntimeError('Synthetic child streams unconfirmed')
        shutil.rmtree(self.home)
        self._closed = True
        record = {'argv': self.argv, 'cwd': str(FIXTURE.parent), 'env': self.env,
                  'shell': False, 'close_fds': True, 'pid': self.child.pid,
                  'exit_code': self.child.returncode, 'signals': self.signals,
                  'streams_closed': True, 'home_removed_after_confirmed_exit': True,
                  'stderr_retained_bytes': len(self.stderr_head) + len(self.stderr_tail),
                  'stderr_head_base64': base64.b64encode(self.stderr_head).decode('ascii'),
                  'stderr_tail_base64': base64.b64encode(self.stderr_tail).decode('ascii')}
        (artifacts() / f'node-{self.mode}-{self.child.pid}.json').write_text(json.dumps(record, indent=2) + '\n')

    async def __aexit__(self, exc_type, exc, tb):
        try:
            await self.close()
        except BaseException as cleanup:
            if exc is not None:
                raise BaseExceptionGroup('Synthetic operation and cleanup failed', [exc, cleanup])
            raise

    @property
    def stats(self):
        for line in bytes(self.stderr_tail).splitlines():
            if line.startswith(b'sdk-stats:'):
                return json.loads(line[10:])
        raise AssertionError('Missing synthetic server stats')

    @contextmanager
    def wire(self):
        # Exclusive FDs; record only bytes actually written/read. No replay.
        original_read, original_write = os.read, os.write
        requests, responses = bytearray(), bytearray()

        def retain(dest, chunk):
            if len(dest) + len(chunk) > 1048576:
                raise AssertionError('Synthetic transcript bound exceeded')
            dest.extend(chunk)

        def read(fd, size):
            b = original_read(fd, size)
            if fd == self.child.stdout.fileno():
                retain(responses, b)
            return b

        def write(fd, b):
            n = original_write(fd, b)
            if fd == self.child.stdin.fileno():
                retain(requests, bytes(b[:n]))
            return n

        with patch('cvg_sdk.stdio.os.read', read), patch('cvg_sdk.stdio.os.write', write):
            yield requests, responses


async def node_json(mode):
    async with NodeOwner(mode, attach=False, readiness=False) as owner:
        if not await owner.wait_exit(5):
            raise AssertionError('Synthetic fixture deadline')
        owner._stdout()
    if owner.child.returncode != 0:
        raise AssertionError(bytes(owner.stderr_tail).decode('utf-8', 'replace'))
    return json.loads(owner.stdout_data)


def main():
    global NODE, EVIDENCE
    p = argparse.ArgumentParser()
    p.add_argument('--suite', choices=('unit', 'interop', 'all'), default='unit')
    p.add_argument('--node')
    p.add_argument('--evidence-dir', type=Path)
    args = p.parse_args()
    NODE = args.node
    if args.evidence_dir:
        EVIDENCE = args.evidence_dir.resolve()
    if args.suite != 'unit' and (not NODE or not Path(NODE).is_absolute() or not Path(NODE).is_file()):
        p.error('--node must be an existing absolute trusted executable')
    # Tests import this module for the single, explicitly configured owner.
    sys.modules['run'] = sys.modules[__name__]
    loader = unittest.TestLoader()
    suite = unittest.TestSuite()
    names = ['test_protocol.py', 'test_stdio.py'] if args.suite == 'unit' else ['test_interop.py']
    if args.suite == 'all':
        names = ['test_protocol.py', 'test_stdio.py', 'test_interop.py']
    for name in names:
        suite.addTests(loader.discover(str(BASE / 'tests'), pattern=name))
    start = time.monotonic()
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    report = {'suite': args.suite, 'python': sys.version, 'platform': sys.platform,
              'tests': result.testsRun, 'failures': len(result.failures),
              'errors': len(result.errors), 'skipped': len(result.skipped),
              'successful': result.wasSuccessful(), 'seconds': time.monotonic() - start,
              'independent_acceptance': False}
    (artifacts() / f'{args.suite}-result.json').write_text(json.dumps(report, indent=2) + '\n')
    return 0 if result.wasSuccessful() else 1


if __name__ == '__main__':
    raise SystemExit(main())
