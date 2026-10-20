"""Synthetic SDK-owned stdio child for the Python reference profile.

Launched by CodexClient through launch_args_override
["/runtime/python", "-I", "-S", "/profile/adapter-python.py"]. It is NOT a Codex
executable. It spawns the separate synthetic peer with normal pipes and relays
bytes unmodified in both directions plus stderr. RAW_READ precedes each forward;
FORWARD_COMMIT reports the exact count returned by each completed OS write.

DX100-G02 batch 2B-1 (D2B-10, CAP-2B-PROC-WITNESS): the BEGIN carries the self-report argv_tail (sys.argv[1:]), cwd and env
(never refused, only reported; it may be launched through /profile/adapter-python-exec). Fault ignore_sigterm, accepted only
where case_input.adapter.fault declares it: a SIGTERM is not handled as a termination; the adapter emits FAULT sigterm_ignored
once and keeps relaying, so only SIGKILL ends it.
"""
import importlib.util
import os
import select
import signal
import subprocess
import time


def _load_channel():
    spec = importlib.util.spec_from_file_location('cvg_channel', '/profile/channel.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


C = None  # loaded by main(): importing this file performs no I/O
SOURCE = '/profile/adapter-python.py'
SIGNAL_WINDOW = 0.09  # contract: <=100ms between the signal and the terminal declaration


class Direction:
    def __init__(self, stream, src, dst):
        self.stream, self.src, self.dst = stream, src, dst
        self.ledger = C.StreamLedger(stream)
        self.pending = b''
        self.eof = False
        self.ended = False


def declared_fault():
    """case_input.adapter.fault of the frozen slot (read before any handler is armed); only ignore_sigterm exists here."""
    try:
        cfg = C.strict_json(C.read_file(C.CONFIG))
        fault = ((cfg.get('case_input') or {}).get('adapter') or {}).get('fault')
    except Exception:  # noqa: BLE001 - the channel admission below fails on an unreadable config
        return None
    return fault if fault == 'ignore_sigterm' else None


def signal_handler(state, ignore_sigterm):
    """SIGTERM/SIGINT handler. With the ignore_sigterm fault a SIGTERM is only counted (FAULT emitted by the main loop)."""
    def on_signal(signum, _frame):
        if ignore_sigterm and signum == signal.SIGTERM:
            state['sigterm_ignored'] += 1  # D2B-10 fault: recorded by the main loop as FAULT sigterm_ignored, relay continues
            return
        if state['signal'] is None:
            state['t'] = time.monotonic()  # window anchor: the first moment Python code observes the signal
            state['signal'] = signum
    return on_signal


def main():
    global C
    C = _load_channel()
    state = {'signal': None, 't': None, 'sigterm_ignored': 0, 'fault_emitted': False}
    wake_r, wake_w = os.pipe2(os.O_NONBLOCK | os.O_CLOEXEC)
    ignore_sigterm = declared_fault() == 'ignore_sigterm'
    on_signal = signal_handler(state, ignore_sigterm)

    signal.set_wakeup_fd(wake_w, warn_on_full_buffer=False)
    for s in (signal.SIGTERM, signal.SIGINT):
        signal.signal(s, on_signal)

    ch = None
    peer = None
    dirs = {}
    try:
        config = C.load_config('python')
        ch = C.Channel(config, 'adapter', SOURCE)
    except BaseException:  # noqa: BLE001 - no channel: nothing may be written to the SDK streams
        os._exit(125)
    ch.interrupt = lambda: state['signal'] is not None  # a pending signal aborts telemetry backpressure waits

    def summaries():
        names = ('stdin', 'stdout', 'stderr')
        return {n: (dirs[n].ledger.summary() if n in dirs else C.StreamLedger(n).summary()) for n in names}

    def peer_status():
        rc = peer.poll() if peer is not None else None
        if rc is None:
            return None, None
        return (rc, None) if rc >= 0 else (None, signal.Signals(-rc).name)

    def reraise(signum):
        signal.signal(signum, signal.SIG_DFL)
        os.kill(os.getpid(), signum)
        time.sleep(1)
        os._exit(125)

    def fail(exc):
        C.invalid(ch, exc)
        signum = state['signal']
        if peer is not None and peer.poll() is None:
            peer.send_signal(signum) if signum is not None else peer.kill()
        if signum is not None:
            reraise(signum)  # contract: terminate by the same signal
        os._exit(125)

    def finish_signal():
        signum = state['signal']
        name = signal.Signals(signum).name
        anchor = state['t']
        until = anchor + SIGNAL_WINDOW
        hard = anchor + 0.1
        if time.monotonic() > hard:
            # The 100ms window from the observed signal is already gone: declare, never END.
            C.invalid(ch, C.ChannelError('signal handling exceeded the 100ms window'))
            if peer is not None and peer.poll() is None:
                peer.send_signal(signum)
            reraise(signum)
        inflight = any(d.pending for d in dirs.values())
        try:
            ch.emit('SIGNAL', {'signal': name, 'inflight': inflight}, until=until)
        except BaseException:
            pass
        if peer is not None and peer.poll() is None:
            peer.send_signal(signum)
        # Finish only the in-flight forward+commit, never a new read; bounded by the signal window.
        try:
            while any(d.pending for d in dirs.values()) and time.monotonic() < until:
                wl = [d.dst for d in dirs.values() if d.pending]
                _, w, _ = select.select([], wl, [], max(0.0, min(0.01, until - time.monotonic())))
                for d in dirs.values():
                    if d.pending and d.dst in w:
                        try:
                            n = os.write(d.dst, d.pending)
                        except BlockingIOError:
                            continue
                        ch.emit('FORWARD_COMMIT', d.ledger.commit(n), until=until)
                        d.pending = d.pending[n:]
        except BaseException:
            pass
        code, sig = peer_status()
        try:
            if time.monotonic() > hard:
                C.invalid(ch, C.ChannelError('signal handling exceeded the 100ms window'))
            else:
                ch.emit('END', {'streams': summaries(), 'child_exit_code': code, 'child_signal': sig, 'complete': False},
                        until=hard)
        except BaseException:
            pass
        reraise(signum)

    try:
        ch.emit('BEGIN', ch.begin)
        ch.emit('READY', {})
        while not ch.take('READY'):
            if state['signal'] is not None:
                finish_signal()
            ch.check_deadline()
            select.select([ch.control_fd, wake_r], [], [], max(0.0, min(0.05, ch.remaining())))
        if state['signal'] is not None:
            finish_signal()
        # Exact frozen argv; only the three ordinary pipes; close_fds keeps observer FDs out of the peer.
        peer = subprocess.Popen(config['peer_argv'], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                stderr=subprocess.PIPE, close_fds=True, cwd='/work', env=dict(C.FIXED_ENV), bufsize=0)
        dirs['stdin'] = Direction('stdin', 0, peer.stdin.fileno())
        dirs['stdout'] = Direction('stdout', peer.stdout.fileno(), 1)
        dirs['stderr'] = Direction('stderr', peer.stderr.fileno(), 2)
        for fd in (0, 1, 2, peer.stdin.fileno(), peer.stdout.fileno(), peer.stderr.fileno()):
            os.set_blocking(fd, False)

        def end_direction(d):
            if d.stream == 'stdin':
                peer.stdin.close()  # forward EOF
            ch.emit('STREAM_END', dict({'stream': d.stream}, **d.ledger.summary()))
            d.ended = True

        while True:
            if state['signal'] is not None:
                finish_signal()
            if state['sigterm_ignored'] and not state['fault_emitted']:
                state['fault_emitted'] = True
                ch.emit('FAULT', {'fault': 'sigterm_ignored'})
            ch.check_deadline()
            out_done = dirs['stdout'].ended and dirs['stderr'].ended
            if out_done and peer.poll() is not None:
                d = dirs['stdin']
                if not d.ended:
                    # Peer exit ends the call interval: do not wait for SDK stdin EOF.
                    if d.pending:
                        raise C.ChannelError('stdin bytes undeliverable after peer exit')
                    end_direction(d)
                break
            rl = [d.src for d in dirs.values() if not d.eof and not d.pending and not d.ended] + [wake_r]
            wl = [d.dst for d in dirs.values() if d.pending]
            r, w, _ = select.select(rl, wl, [], max(0.0, min(0.05, ch.remaining())))
            if wake_r in r:
                try:
                    os.read(wake_r, 64)
                except BlockingIOError:
                    pass
            if state['signal'] is not None:
                finish_signal()  # checked right after select: no new read starts after the signal
            for d in dirs.values():
                if state['signal'] is not None:
                    finish_signal()
                if d.src in r and not d.pending and not d.eof:
                    try:
                        b = os.read(d.src, C.RAW_CHUNK)
                    except BlockingIOError:
                        continue
                    if not b:
                        d.eof = True
                        end_direction(d)
                        continue
                    ch.emit('RAW_READ', d.ledger.raw(b))
                    d.pending = b
            for d in dirs.values():
                if state['signal'] is not None:
                    finish_signal()  # the in-flight chunk is finished inside the bounded signal window
                if d.pending and d.dst in w:
                    try:
                        n = os.write(d.dst, d.pending)
                    except BlockingIOError:
                        continue
                    # BrokenPipeError and other errors propagate: an undeliverable chunk is never committed.
                    ch.emit('FORWARD_COMMIT', d.ledger.commit(n))
                    d.pending = d.pending[n:]
        if state['signal'] is not None:
            finish_signal()
        code, sig = peer_status()
        streams = summaries()
        complete = all(s['read_bytes'] == s['committed_bytes'] for s in streams.values())
        ch.finish_controls()  # an extra, late or truncated control invalidates BEFORE the END
        ch.emit('END', {'streams': streams, 'child_exit_code': code, 'child_signal': sig, 'complete': complete})
        ch.close_fds()
        for s_ in (signal.SIGTERM, signal.SIGINT):
            signal.signal(s_, signal.SIG_DFL)
        if state['signal'] is not None:
            reraise(state['signal'])  # a signal observed after the END still terminates by that signal
        if not complete:
            os._exit(125)
        if sig is not None:
            reraise(signal.Signals[sig])
        os._exit(code)
    except BaseException as exc:  # noqa: BLE001 - every failure is terminal INVALID
        fail(exc)


if __name__ == '__main__':
    main()
