from pathlib import Path
import json
import os
import sys

unit = sys.argv[1]
group = Path('/proc/self/cgroup').read_text().strip().split('::', 1)[1]
assert group.endswith('/' + unit)
cg = Path('/sys/fs/cgroup') / group.lstrip('/')
limits = {name: (cg / name).read_text().strip() for name in ['memory.max', 'memory.swap.max', 'cpu.max', 'pids.max']}
assert limits == {'memory.max': '2147483648', 'memory.swap.max': '0', 'cpu.max': '100000 100000', 'pids.max': '128'}, limits
print('CVG_REUSE_KERNEL ' + json.dumps({'unit': unit, 'group': group, 'limits': limits}), file=sys.stderr, flush=True)
root = Path('/tmp/cvg-codex100-exec-20261017/reuse-native-delivery-probe')
args = ['/usr/bin/bwrap', '--unshare-all', '--new-session', '--die-with-parent', '--cap-drop', 'ALL', '--clearenv',
        '--setenv', 'PATH', '/nonexistent', '--setenv', 'LANG', 'C', '--proc', '/proc', '--dev', '/dev', '--tmpfs', '/tmp',
        '--ro-bind', str(root / 'probe.mjs'), '/bundle/probe.mjs',
        '--ro-bind', '/home/ricardo/.nvm/versions/node/v22.23.2/bin/node', '/node',
        '--ro-bind', str(cg), '/limits', '--bind', str(root / 'output'), '/work', '--chdir', '/work']
for lib in ['/lib/x86_64-linux-gnu/libdl.so.2', '/lib/x86_64-linux-gnu/libstdc++.so.6', '/lib/x86_64-linux-gnu/libm.so.6',
            '/lib/x86_64-linux-gnu/libgcc_s.so.1', '/lib/x86_64-linux-gnu/libpthread.so.0', '/lib/x86_64-linux-gnu/libc.so.6', '/lib64/ld-linux-x86-64.so.2']:
    args.extend(['--ro-bind', os.path.realpath(lib), lib])
args.extend(['/node', '/bundle/probe.mjs'])
os.execv(args[0], args)
