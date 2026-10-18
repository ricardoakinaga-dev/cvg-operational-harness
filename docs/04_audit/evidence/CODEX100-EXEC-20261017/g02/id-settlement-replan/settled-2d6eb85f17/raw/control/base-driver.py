#!/usr/bin/env python3
"""Finite reference-only observation inside the private offline namespace."""
from pathlib import Path
import hashlib
import json
import os
import selectors
import signal
import socket
import subprocess
import time

OUT = Path('/work/output')
CAP = 8 * 1024 * 1024
FIRST = None
SECONDARY = []


def write(name, value):
    (OUT / name).write_text(json.dumps(value, indent=2, ensure_ascii=True) + '\n')


def first_failure(where, exc):
    global FIRST
    record = {'where': where, 'type': type(exc).__name__, 'message': str(exc)}
    if FIRST is None:
        FIRST = record
        try:
            write('first-failure.json', record)
        except BaseException as secondary:
            SECONDARY.append({'where': 'persist-first-failure', 'type': type(secondary).__name__})
    else:
        SECONDARY.append(record)


def target_command(args):
    # The collector and its /work are outside the target's second namespace.
    cmd = ['/usr/bin/bwrap', '--unshare-all', '--new-session', '--die-with-parent',
           '--clearenv', '--cap-drop', 'ALL', '--ro-bind', '/usr', '/usr',
           '--ro-bind', '/lib', '/lib', '--ro-bind', '/lib64', '/lib64',
           '--symlink', 'usr/bin', '/bin', '--proc', '/proc', '--dev', '/dev',
           '--tmpfs', '/tmp', '--dir', '/etc', '--dir', '/reference',
           '--ro-bind', '/reference/codex', '/reference/codex',
           '--ro-bind', '/native', '/native', '--ro-bind', '/control', '/control',
           '--ro-bind', '/etc/passwd', '/etc/passwd', '--ro-bind', '/etc/group', '/etc/group',
           '--bind', '/reference-home', '/reference-home', '--chdir', '/reference-home']
    for k, v in json.loads(Path('/control/environment.json').read_text()).items():
        cmd.extend(['--setenv', k, v])
    return [*cmd, '/usr/bin/python3', '-I', '/control/target-guard.py', *args]


def guard():
    expected = json.loads(Path('/control/environment.json').read_text())
    observed = dict(os.environ)
    # bubblewrap itself may set PWD after --chdir; this is not a host inheritance.
    if observed.get('PWD') == '/work':
        observed.pop('PWD')
    assert observed == expected, 'unexpected environment'
    assert not Path('/home/ricardo').exists() and not Path('/run/user').exists()
    assert not Path('/source').exists() and not Path('/toolchain').exists()
    assert len(Path('/proc/net/route').read_text().splitlines()) == 1
    assert {name for _, name in socket.if_nameindex()} <= {'lo'}
    host = json.loads(Path('/control/host-namespaces.json').read_text())
    ns = {k: os.readlink('/proc/self/ns/' + k) for k in ['net', 'mnt', 'pid']}
    assert all(ns[k] != host[k] for k in ns), 'namespace isolation absent'
    mounts = [line.split() for line in Path('/proc/self/mountinfo').read_text().splitlines()]
    for name in ['/reference/codex', '/native', '/control', '/usr']:
        rows = [r for r in mounts if r[4] == name]
        assert len(rows) == 1 and 'ro' in rows[0][5].split(','), ('mount not readonly', name)
    assert Path('/reference-home/.codex/config.toml').is_file()
    assert not Path('/reference-home/.codex/auth.json').exists()
    proof = {'namespace_ids': ns, 'host_namespaces_distinct': True,
             'environment_exact': True, 'home_source': 'synthetic /etc/passwd, HOME/CODEX_HOME absent',
             'host_home_and_sockets_absent': True, 'network_routes_absent': True,
             'reference_native_controller_usr_readonly': True}
    write('namespace-proof.json', proof)


class Capture:
    def __init__(self, name, args):
        self.name = name
        self.args = args
        self.proc = None
        self.sel = selectors.DefaultSelector()
        self.buffers = {'stdout': bytearray(), 'stderr': bytearray()}
        self.files = {}
        self.started = time.monotonic()
        self.sent = []
        self.messages = []
        self.line_buffer = bytearray()
        self.actual_command = target_command(args)
        try:
            for k in self.buffers:
                self.files[k] = (OUT / (name + '.' + k + '.log')).open('xb')
            self.proc = subprocess.Popen(self.actual_command, stdin=subprocess.PIPE,
                                         stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                         start_new_session=True, close_fds=True)
            for k in self.buffers:
                fd = getattr(self.proc, k)
                os.set_blocking(fd.fileno(), False)
                self.sel.register(fd, selectors.EVENT_READ, k)
        except BaseException as exc:
            first_failure(name + ': constructor', exc)
            self.close()
            raise

    def drain(self, deadline, parse=False, response_id=None):
        while self.sel.get_map():
            if time.monotonic() >= deadline:
                raise TimeoutError(self.name + ': observation deadline')
            for key, _ in self.sel.select(min(0.1, max(0, deadline - time.monotonic()))):
                data = os.read(key.fd, 65536)
                if not data:
                    self.sel.unregister(key.fileobj)
                    continue
                self.buffers[key.data].extend(data)
                self.files[key.data].write(data)
                self.files[key.data].flush()
                assert sum(map(len, self.buffers.values())) <= CAP, 'output cap exceeded'
                if parse and key.data == 'stdout':
                    self.line_buffer.extend(data)
                    while b'\n' in self.line_buffer:
                        line, _, tail = self.line_buffer.partition(b'\n')
                        self.line_buffer = bytearray(tail)
                        if line.strip():
                            value = json.loads(line)
                            assert isinstance(value, dict), 'non-object wire message'
                            self.messages.append(value)
            if response_id is not None:
                matching = [m for m in self.messages if type(m.get('id')) is type(response_id) and m.get('id') == response_id]
                assert len(matching) <= 1, 'duplicate response id'
                if matching:
                    return matching[0]
            if self.proc.poll() is not None and not self.sel.get_map():
                break
        if response_id is not None:
            raise RuntimeError('reference exited before response ' + str(response_id))

    def request(self, message):
        self.sent.append(message)
        write(self.name + '.requests.json', self.sent)
        self.proc.stdin.write((json.dumps(message, ensure_ascii=True) + '\n').encode())
        self.proc.stdin.flush()
        return self.drain(min(self.started + 75, time.monotonic() + 20), True, message['id'])

    def finish(self, timeout, parse=False, total=None):
        self.proc.stdin.close()
        self.drain(min(self.started + (total or timeout), time.monotonic() + timeout), parse)
        code = self.proc.wait(timeout=2)
        if parse:
            assert not self.line_buffer.strip(), 'incomplete final wire frame'
        return code

    def close(self):
        forced = False
        if self.proc is not None:
            try:
                os.killpg(self.proc.pid, 0)
            except ProcessLookupError:
                pass
            except BaseException as exc:
                first_failure(self.name + ': inspect process group', exc)
            else:
                forced = True
                try:
                    os.killpg(self.proc.pid, signal.SIGTERM)
                    try:
                        self.proc.wait(timeout=3)
                    except subprocess.TimeoutExpired:
                        os.killpg(self.proc.pid, signal.SIGKILL)
                        self.proc.wait(timeout=3)
                except BaseException as exc:
                    first_failure(self.name + ': process cleanup', exc)
                if FIRST is None:
                    first_failure(self.name + ': residual process group', RuntimeError('forced cleanup'))
        try:
            self.sel.close()
            for f in self.files.values():
                f.close()
        except BaseException as exc:
            first_failure(self.name + ': descriptor cleanup', exc)
        try:
            write(self.name + '.capture.json', {
                'args': self.args, 'actual_command': self.actual_command,
                'exit': self.proc.returncode if self.proc is not None else None,
                'forced_cleanup': forced,
                'elapsed_seconds': round(time.monotonic() - self.started, 3),
                'bytes': {k: len(v) for k, v in self.buffers.items()},
                'sha256': {k: hashlib.sha256(v).hexdigest() for k, v in self.buffers.items()},
                'messages': self.messages, 'secondary_failures': SECONDARY,
            })
        except BaseException as exc:
            first_failure(self.name + ': capture persistence', exc)

    def validate_guard(self):
        line = bytes(self.buffers['stderr']).split(b'\n', 1)[0]
        prefix = b'CVG_INNER_REFERENCE_GUARD '
        assert line.startswith(prefix), 'missing trusted inner guard before target'
        proof = json.loads(line[len(prefix):])
        assert proof['target_argv'] == self.args
        assert all(proof[k] is True for k in ['environment_exact', 'readonly_inputs', 'collector_paths_absent'])
        write(self.name + '.inner-guard.json', proof)

    def validate_frames(self):
        expected = [(type(m['id']).__name__, m['id']) for m in self.sent]
        found = []
        for message in self.messages:
            assert 'jsonrpc' not in message
            if 'id' in message:
                key = (type(message['id']).__name__, message['id'])
                assert key in expected and key not in found, 'unknown id or late duplicate'
                assert 'method' not in message, 'unauthorized server request'
                assert ('result' in message) != ('error' in message), 'ambiguous response'
                if 'error' in message:
                    error = message['error']
                    assert isinstance(error, dict) and type(error.get('code')) is int and isinstance(error.get('message'), str)
                found.append(key)
            else:
                assert isinstance(message.get('method'), str) and 'result' not in message and 'error' not in message, 'invalid notification'
        assert len(found) == len(expected), 'missing response at EOF'


def main():
    OUT.mkdir(exist_ok=False)
    guard()
    controls = []
    for name, args in [('version', ['--version']), ('help', ['--help']),
                       ('app-server-help', ['app-server', '--help'])]:
        capture = Capture(name, ['/reference/codex', *args])
        try:
            code = capture.finish(15)
            assert code == 0, (name, code)
            assert capture.buffers['stdout'], 'empty successful observation'
            capture.validate_guard()
            controls.append({'case': name, 'status': 'OBSERVED', 'exit': code})
        except BaseException as exc:
            first_failure(name, exc)
            raise
        finally:
            capture.close()
    capture = Capture('stdio', ['/reference/codex', 'app-server', '--listen', 'stdio://'])
    try:
        def ask(i, method, params):
            return capture.request({'id': i, 'method': method, 'params': params})

        before = ask('before', 'thread/list', {})
        assert before.get('error', {}).get('code') == -32600
        assert before['error']['message'] == 'Not initialized'
        # A header-invalid client must fail without committing initialization.
        invalid = ask('invalid', 'initialize', {
            'clientInfo': {'name': 'cvg\ninvalid', 'version': '0.synthetic'},
            'capabilities': {'explicitGatewayOauth': True}})
        assert invalid.get('error', {}).get('code') == -32600
        assert invalid['error']['message'].startswith('Invalid clientInfo.name:')
        params = {'clientInfo': {'name': 'cvg-reference-probe', 'title': 'Synthetic',
                                'version': '0.synthetic'},
                  'capabilities': {'explicitGatewayOauth': True, 'experimentalApi': False,
                                   'requestAttestation': False}}
        initialized = ask(7, 'initialize', params)
        result = initialized['result']
        assert set(['userAgent', 'codexHome', 'platformFamily', 'platformOs']) <= set(result)
        assert result['codexHome'] == '/reference-home/.codex'
        assert result['platformFamily'] == 'unix' and result['platformOs'] == 'linux'
        duplicate = ask('duplicate', 'initialize', params)
        assert duplicate.get('error', {}).get('code') == -32600
        assert duplicate['error']['message'] == 'Already initialized'
        listed = ask('empty-list', 'thread/list', {'limit': 1})
        assert listed['result']['data'] == [] and listed['result']['nextCursor'] is None
        unknown = ask('unknown', 'cvg.synthetic.unknown', {})
        assert type(unknown.get('error', {}).get('code')) is int and unknown['error']['code'] == -32600
        assert unknown['error']['message'].startswith('Invalid request:') and 'cvg.synthetic.unknown' in unknown['error']['message']
        exit_code = capture.finish(15, parse=True, total=75)
        assert exit_code == 0, ('app-server exit', exit_code)
        capture.validate_guard()
        capture.validate_frames()
        for response in [before, invalid, initialized, duplicate, listed, unknown]:
            assert 'jsonrpc' not in response, 'unexpected protocol envelope'
        controls.extend({'case': name, 'status': 'OBSERVED'} for name in [
            'before-initialize', 'invalid-client-without-state-commit', 'initialize',
            'duplicate-initialize', 'empty-thread-list', 'unknown-method'])
    except BaseException as exc:
        first_failure('stdio', exc)
        raise
    finally:
        capture.close()
    assert FIRST is None, 'cleanup failed; initial cause persisted'
    write('observations.json', {'kind': 'ACTUAL_PINNED_REFERENCE_KEYLESS_OBSERVATIONS',
                               'cases': controls, 'functional_parity_receipts': 0,
                               'CVG_engine_executed': False, 'model_or_tool_requests': 0})


if __name__ == '__main__':
    try:
        main()
    except BaseException as exc:
        if OUT.is_dir():
            first_failure('main', exc)
        raise
