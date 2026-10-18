#!/usr/bin/env python3
"""Trusted inner guard; emit proof before replacing this process with exact CLI."""
from pathlib import Path
import json
import os
import socket
import sys

expected = json.loads(Path('/control/environment.json').read_text())
observed = dict(os.environ)
if observed.get('PWD') == '/reference-home':
    observed.pop('PWD')
assert observed == expected, 'inner environment differs'
assert not any(Path(p).exists() for p in ['/work', '/home/ricardo', '/run/user', '/source', '/toolchain'])
assert len(Path('/proc/net/route').read_text().splitlines()) == 1
assert {name for _, name in socket.if_nameindex()} <= {'lo'}
host = json.loads(Path('/control/host-namespaces.json').read_text())
ns = {k: os.readlink('/proc/self/ns/' + k) for k in ['net', 'mnt', 'pid']}
assert all(ns[k] != host[k] for k in ns)
mounts = [line.split() for line in Path('/proc/self/mountinfo').read_text().splitlines()]
for name in ['/reference/codex', '/native', '/control', '/usr']:
    rows = [r for r in mounts if r[4] == name]
    assert len(rows) == 1 and 'ro' in rows[0][5].split(',')
assert sys.argv[1:] in [
    ['/reference/codex', '--version'], ['/reference/codex', '--help'],
    ['/reference/codex', 'app-server', '--help'],
    ['/reference/codex', 'app-server', '--listen', 'stdio://'],
], 'unapproved target argv'
print('CVG_INNER_REFERENCE_GUARD ' + json.dumps({
    'namespaces': ns, 'environment_exact': True, 'readonly_inputs': True,
    'collector_paths_absent': True, 'interfaces': socket.if_nameindex(),
    'target_argv': sys.argv[1:],
}), file=sys.stderr, flush=True)
os.execv(sys.argv[1], sys.argv[1:])
