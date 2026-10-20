"""CONTROL client for the batch 2B gate (inputs/spec-2b/control-slot-contract-2b.json, D2B-13). Not the SDK.

argv (frozen): ["/runtime/python", "-I", "-S", "/profile/control-client.py", "--case", "2B1-CTRL01" | "2B2-CTRL01" | "C31-CTRL01" | "C32-CTRL01" | "DP2-CTRL01"]
Distributed profile DP-2 (DDP-09): DP2-CTRL01 is 2B2-CTRL01 with only the case ID of this argv changed.
Continuation 3 (D3-07): C31-CTRL01 is 2B1-CTRL01 and C32-CTRL01 is 2B2-CTRL01 with only the case ID of this argv changed.
2B-2: the same client runs 2B2-CTRL01, whose ctrl-2 is account/login/start with an account/login/completed frame before the reply
(CAP-2B-PEER-LOGIN under the 2B-2 freeze).
D2B-13: reads the frozen lines of case_input.control_client, records every notification received before each reply
(PRE_REPLY_NOTIFICATION) and keeps reading one reply per request with a bound; then closes the stdin.
Role: driver. It never imports the SDK, Pydantic or any acquired code. Implementation base: the
OwnClient of python-driver.py (Popen of the frozen adapter LAUNCH, pipes, cwd /work, sandbox env,
bufsize 0). It writes the three frozen JSON-RPC lines of the control slot, reads one reply per
request with a bound, closes the client stdin (EOF-bounded interval) and reports the exact bytes.
The known-bad (an unscripted turn/interrupt) must be answered by the peer v2 and judged MISMATCH.
"""
import hashlib
import importlib.util
import json
import os
import queue
import subprocess
import sys
import threading


def _load_channel():
    spec = importlib.util.spec_from_file_location('cvg_channel', '/profile/channel.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


C = None  # loaded by main(): importing this file performs no I/O
SOURCE = '/profile/control-client.py'
LAUNCH = ('/runtime/python', '-I', '-S', '/profile/adapter-python.py')
REPLY_BOUND = 5.0


class OwnClient:
    def __init__(self):
        self.proc = subprocess.Popen(list(LAUNCH), stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                     cwd='/work', env=os.environ.copy(), bufsize=0)
        self.sent, self.sent_bytes = hashlib.sha256(), 0
        self.recv, self.recv_bytes = hashlib.sha256(), 0
        self.err, self.err_bytes = hashlib.sha256(), 0
        self.lines = queue.Queue()
        self.reader = threading.Thread(target=self._read, daemon=True)
        self.drain = threading.Thread(target=self._drain, daemon=True)
        self.reader.start()
        self.drain.start()

    def _read(self):
        buf = b''
        while True:
            b = os.read(self.proc.stdout.fileno(), 65536)
            if not b:
                self.lines.put(None)
                return
            self.recv.update(b)
            self.recv_bytes += len(b)
            buf += b
            while b'\n' in buf:
                line, buf = buf.split(b'\n', 1)
                self.lines.put(line + b'\n')

    def _drain(self):
        while True:
            b = os.read(self.proc.stderr.fileno(), 65536)
            if not b:
                return
            self.err.update(b)
            self.err_bytes += len(b)

    def send(self, obj):
        raw = (json.dumps(obj) + '\n').encode('utf-8')
        self.proc.stdin.write(raw)
        self.proc.stdin.flush()
        self.sent.update(raw)
        self.sent_bytes += len(raw)

    def wait_reply(self, request_id, timeout):
        """D2B-13: (reply line or None, notifications received before it as [(method, line)])."""
        before = []
        while True:
            try:
                line = self.lines.get(timeout=timeout)
            except queue.Empty:
                return None, before
            if line is None:
                return None, before
            msg = json.loads(line.decode('utf-8'))
            if isinstance(msg, dict) and msg.get('id') == request_id and 'method' not in msg:
                return line, before
            if isinstance(msg, dict) and 'method' in msg and 'id' not in msg:
                before.append((msg.get('method') if isinstance(msg.get('method'), str) else None, line))

    def close(self, timeout):
        if not self.proc.stdin.closed:
            self.proc.stdin.close()
        rc = self.proc.wait(timeout=timeout)
        self.reader.join(timeout=timeout)
        self.drain.join(timeout=timeout)
        return rc

    def summary(self):
        return {'sent_bytes': self.sent_bytes, 'sent_sha256': self.sent.hexdigest(), 'recv_bytes': self.recv_bytes,
                'recv_sha256': self.recv.hexdigest(), 'stderr_bytes': self.err_bytes, 'stderr_sha256': self.err.hexdigest()}


def main():
    global C
    C = _load_channel()
    ch = None
    try:
        config = C.load_config('python')
        ch = C.Channel(config, 'driver', SOURCE)
    except BaseException:  # noqa: BLE001
        os._exit(125)

    def watchdog():
        C.invalid(ch, C.ChannelError('driver deadline'))
        os._exit(125)

    timer = threading.Timer(max(0.01, ch.remaining()), watchdog)
    timer.daemon = True
    try:
        C.check(sys.argv == [SOURCE, '--case', config['case']] and config['case'] in ('2B1-CTRL01', '2B2-CTRL01', 'C31-CTRL01', 'C32-CTRL01', 'DP2-CTRL01') and config['mode'] == 'control',
                'control argv/case')
        C.check(ch.admission['sdk_admitted'] is False, 'the control slot is never SDK-admitted')
        for p in ('/profile/fixture-cases.json', '/profile/adapter-python.py', '/profile/fixture-rpc.py'):
            C.check(C.is_hex(ch.admission['files'].get(p, '')), 'unbound ' + p)
        fx = C.selected_fixture(config)
        lines = fx['control_client']['lines']
        C.check(fx['control_client']['imports_sdk'] is False and len(lines) == 4, 'frozen control lines')
        timer.start()
        ch.start()
        client = OwnClient()
        try:
            replies = {}
            for obj in lines:
                client.send(obj)
                if 'id' in obj:
                    line, before = client.wait_reply(obj['id'], timeout=min(REPLY_BOUND, max(0.1, ch.remaining())))
                    for method, raw in before:
                        ch.emit('PRE_REPLY_NOTIFICATION', {'reply_id': obj['id'], 'method': method, 'bytes': len(raw), 'sha256': C.sha(raw)})
                    replies[obj['id']] = None if line is None else {'bytes': len(line), 'sha256': C.sha(line)}
                    ch.emit('DIAGNOSTIC', {'milestone': 'CONTROL_REPLY', 'detail': {'id': obj['id'], 'reply': replies[obj['id']]}})
            client.proc.stdin.close()
            ch.emit('DIAGNOSTIC', {'milestone': 'CLIENT_STDIN_CLOSED', 'detail': {'source_sdk_claim': False}})
            ch.emit('DIAGNOSTIC', {'milestone': 'CALLS_DONE', 'detail': {'replies': len([r for r in replies.values() if r]), 'source_sdk_claim': False}})
            ch.control('RELEASE_EXIT')
        finally:
            rc = client.close(timeout=max(0.1, min(5.0, ch.remaining())))
        detail = client.summary()
        detail.update({'returncode': rc, 'source_sdk_claim': False})
        ch.emit('DIAGNOSTIC', {'milestone': 'OWN_CLIENT_CLOSED', 'detail': detail})
        ch.finish_controls()
        timer.cancel()
        ch.emit('END', {'streams': {}, 'child_exit_code': None, 'child_signal': None, 'complete': True})
        ch.close_fds()
        os._exit(0)
    except BaseException as exc:  # noqa: BLE001 - every failure is terminal INVALID
        timer.cancel()
        C.invalid(ch, exc)
        os._exit(125)


if __name__ == '__main__':
    main()
