"""Host supervisor for DX100-G02 SDK observation drivers (runs OUTSIDE the target cgroup).

Commands (host python3.12 -I):
  supervisor.py fixtures          write fixture-cases.json (19 frozen SDK rows + constant DIAG rows)
  supervisor.py plan              write case-plan.json (driver/peer/barrier definition of every case)
  supervisor.py run DIAG-CASE     one budget-gated transient service running one constant diagnostic

SDK cases are defined here (barriers, argv, expectations) but are refused by `run`:
they require a separate future admission (sdk_admitted/compiler_admitted stay false).
No SDK, Pydantic or compiler code is imported or executed by this program.
"""
import datetime
import hashlib
import importlib.util
import json
import os
import secrets
import select
import shutil
import signal
import subprocess
import sys
import time
from pathlib import Path

sys.dont_write_bytecode = True  # never leave bytecode next to the evidence sources
HERE = Path(__file__).resolve().parent
UNIT = HERE.parent
REFERENCE = UNIT.parent / 'sdk-reference-profile'
RUNTIME = Path('/mnt/ia/cvg-codex100-exec-20261017/sdk-observation-drivers')
DIAG_DIR = UNIT / 'diagnostics'
CASES_JSON = REFERENCE / 'cases.json'
CASES_SHA = '5f8587edbffb5c1dc5d931d5cd637cb1acbb21fa606f928809008aac258093be'
TS_SRC = REFERENCE / 'inputs' / 'sdk' / 'typescript' / 'src'
HOST = {
    'python': ('/usr/bin/python3.12', 'e50d468e8b0adfb05733f5b87b3cff34829c4a8c1aea50c865aa8bdfe4bb150f'),
    'node': ('/home/ricardo/.nvm/versions/node/v24.20.0/bin/node', '89af8424dd53e560b1933f87ba650d8bf57c83ca5a04600eefb31f416aabbae7'),
    'bwrap': ('/usr/bin/bwrap', 'e318903862396f96de3df57264e0158682b952fd3fb53ac23d876413e7b30f71'),
    'systemd-run': ('/usr/bin/systemd-run', 'dbc8b988a849d5c9d7ef2de7068a6f107021bc6c11e0d7864c73f373eef726a7'),
    'systemctl': ('/usr/bin/systemctl', 'e0d3d0e9444da1b2b58c792c3f5028b69f049b77d5ca17b3ec0d09f89117225b'),
}
PROPS = {'MemoryMax': '536870912', 'TasksMax': '32', 'CPUQuota': '100%', 'RuntimeMaxSec': '45', 'KillMode': 'control-group',
         'TimeoutStopSec': '3', 'NoNewPrivileges': 'yes', 'LimitNOFILE': '128', 'LimitFSIZE': '8388608', 'LimitCORE': '0'}
FIXED_ENV = {'HOME': '/work/home', 'TMPDIR': '/work/tmp', 'PATH': '/runtime', 'LANG': 'C.UTF-8', 'LC_ALL': 'C.UTF-8',
             'TZ': 'UTC', 'PYTHONDONTWRITEBYTECODE': '1'}
UNIT_PREFIX = 'cvg-codex100-sdkdiag-'
BUDGET = UNIT / 'budget.json'
NAMES = [r + '.' + k for r in ('driver', 'adapter', 'peer') for k in ('events', 'control')]
PY_SOURCES = {'channel.py': 0o444, 'adapter-python.py': 0o444, 'fixture-rpc.py': 0o444, 'python-driver.py': 0o444, 'bootstrap.py': 0o444}
TS_SOURCES = {'channel.cjs': 0o444, 'adapter-typescript': 0o555, 'fixture-cli.mjs': 0o444, 'ts-driver.mjs': 0o444,
              'extension-loader.mjs': 0o444, 'transpile.mjs': 0o444}
ROLE_SOURCE = {'python': {'driver': 'python-driver.py', 'adapter': 'adapter-python.py', 'peer': 'fixture-rpc.py'},
               'typescript': {'driver': 'ts-driver.mjs', 'adapter': 'adapter-typescript', 'peer': 'fixture-cli.mjs'}}
SDK_BUILTINS = ['node:child_process', 'node:fs', 'node:module', 'node:os', 'node:path', 'node:readline']
LOADER_BUILTINS = sorted(set(SDK_BUILTINS) | {'node:crypto', 'node:net', 'node:util'})
TS_FILES = ['codex.ts', 'codexOptions.ts', 'events.ts', 'exec.ts', 'index.ts', 'items.ts', 'outputSchemaFile.ts',
            'thread.ts', 'threadOptions.ts', 'turnOptions.ts']
SDK_CASES_PY = ['SDKPY0%d' % i for i in range(1, 10)]
SDK_CASES_TS = ['SDKTS%02d' % i for i in range(1, 11)]
_INIT = {'serverInfo': {'name': 'synthetic-diagnostic', 'version': '0.151.0'}, 'userAgent': 'synthetic-diagnostic/0.151.0'}
_TURN = {'result': {'turn': {'id': 'A', 'items': [], 'status': 'inProgress'}}}
DIAG_ROWS = {
    'DIAG-PY-RPC': {'initialize_result': _INIT, 'turn_start_reply': _TURN},
    'DIAG-PY-LARGE': {'initialize_result': _INIT, 'large_bytes': 150000},
    'DIAG-PY-TERM': {'initialize_result': _INIT, 'large_bytes': 200000},
    'DIAG-PY-STALL': {'initialize_result': _INIT, 'large_bytes': 200000},
    'DIAG-PY-KILL': {'initialize_result': _INIT, 'turn_start_reply': _TURN},
    'DIAG-TS-ECHO': {'JSONL': [{'type': 'thread.started', 'thread_id': 'diag-thread'}, 'not json', '',
                               {'type': 'turn.completed', 'usage': {'input_tokens': 1, 'cached_input_tokens': 0, 'output_tokens': 1}}],
                     'exit_code': 3, 'stderr': 'diag stderr\n'},
    'DIAG-TS-LARGE': {'JSONL': ['x' * 60000, 'y' * 60000, 'z' * 60000], 'exit_code': 0, 'stderr': 'e' * 4000},
    'DIAG-TS-ABORT': {'behavior': 'Hold stdout open after REQUEST_HELD; terminated only by the adapter-forwarded signal.'},
}
DIAG = {
    'DIAG-PY-RPC': {'language': 'python', 'deadline': 20, 'expect': 'PASS', 'action': None},
    'DIAG-PY-LARGE': {'language': 'python', 'deadline': 20, 'expect': 'PASS', 'action': None},
    'DIAG-PY-TERM': {'language': 'python', 'deadline': 20, 'expect': 'KNOWN_SIGNAL_TERMINATION', 'action': 'SIGTERM_ADAPTER_ON_FIRST_STDOUT_COMMIT'},
    'DIAG-PY-STALL': {'language': 'python', 'deadline': 6, 'expect': 'INVALID_CAPTURE', 'action': 'STOP_READING_ADAPTER_EVENTS_AFTER_READY'},
    'DIAG-PY-KILL': {'language': 'python', 'deadline': 20, 'expect': 'INVALID_CAPTURE', 'action': 'SIGKILL_UNIT_ON_REQUEST_HELD'},
    'DIAG-TS-ECHO': {'language': 'typescript', 'deadline': 20, 'expect': 'PASS', 'action': None},
    'DIAG-TS-LARGE': {'language': 'typescript', 'deadline': 20, 'expect': 'PASS', 'action': None},
    'DIAG-TS-ABORT': {'language': 'typescript', 'deadline': 20, 'expect': 'KNOWN_SIGNAL_TERMINATION', 'action': None},
}


def _load(name):
    spec = importlib.util.spec_from_file_location('cvg_' + name.replace('.py', '').replace('-', '_'), HERE / name)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


OBS = _load('observer.py')


def now_iso():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def sha_bytes(b):
    return hashlib.sha256(b).hexdigest()


def sha_path(p):
    h = hashlib.sha256()
    with open(p, 'rb') as f:
        for block in iter(lambda: f.read(1 << 20), b''):
            h.update(block)
    return h.hexdigest()


def compact(obj):
    return json.dumps(obj, separators=(',', ':'), ensure_ascii=False, allow_nan=False)


def save_json(path, obj):
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + '\n')


# --------------------------------------------------------------------------- frozen data

def sdk_rows():
    raw = CASES_JSON.read_bytes()
    assert sha_bytes(raw) == CASES_SHA, 'cases.json drifted from HOW R2'
    cases = json.loads(raw)['cases']
    rows = {c['id']: c['fixture_input'] for c in cases}
    assert sorted(rows) == sorted(SDK_CASES_PY + SDK_CASES_TS) and len(rows) == 19, 'expected the 19 frozen cases'
    return rows


def fixture_bytes():
    rows = sdk_rows()
    assert not set(rows) & set(DIAG_ROWS)
    rows.update(DIAG_ROWS)
    return (json.dumps(rows, sort_keys=True, separators=(',', ':'), ensure_ascii=False) + '\n').encode('utf-8')


def ts_source_hashes():
    out = {}
    for name in TS_FILES:
        out[name] = sha_path(TS_SRC / name)
    return out


def node_loader_json():
    return {'v': 1, 'entry': 'file:///profile/ts-driver.mjs',
            'prebound': ['file:///profile/channel.cjs', 'file:///profile/fixture-cli.mjs', 'file:///profile/ts-driver.mjs'],
            'builtins': LOADER_BUILTINS, 'sdk_entry': 'file:///profile/sdk-emitted/index.js',
            'emitted_dir': 'file:///profile/sdk-emitted/', 'emitted': {}}


def node_transpile_json():
    return {'v': 1,
            'typescript': {'path': '/profile/typescript/lib/typescript.js', 'sha256': 'e5f1f6b3e82228a89873cc7b941b2465185e839c0692860f83e3e63e53f94c2b',
                           'bytes': 9111680, 'version': '5.9.2'},
            'sources': ts_source_hashes(), 'source_dir': '/profile/sdk-ts-src/', 'out_dir': '/work/sdk-emitted/',
            'compiler_options': {'allowSyntheticDefaultImports': True, 'declaration': False, 'esModuleInterop': True,
                                 'isolatedModules': True, 'module': 'ESNext', 'removeComments': False, 'sourceMap': False,
                                 'target': 'ES2022', 'verbatimModuleSyntax': False},
            'allowed_imports': {'builtins': SDK_BUILTINS, 'relative': ['./' + n[:-3] for n in TS_FILES]}}


def role_argv(language, role, case, adapter_args=None):
    if language == 'python':
        return {'driver': ['/runtime/python', '-I', '-S', '/profile/python-driver.py', '--case', case],
                'adapter': ['/runtime/python', '-I', '-S', '/profile/adapter-python.py'],
                'peer': ['/runtime/python', '-I', '-S', '/profile/fixture-rpc.py', '--case', case]}[role]
    if role == 'driver':
        return ['/runtime/node', '--experimental-loader', '/profile/extension-loader.mjs', '/profile/ts-driver.mjs', '--case', case]
    if role == 'adapter':
        return ['/runtime/node', '/profile/adapter-typescript'] + list(adapter_args or [])
    return ['/runtime/node', '/profile/fixture-cli.mjs', '--case', case, '--sdk-argv-json', compact(list(adapter_args or []))]


def peer_argv(language, case):
    if language == 'python':
        return role_argv('python', 'peer', case)
    return ['/runtime/node', '/profile/fixture-cli.mjs', '--case', case, '--sdk-argv-json']


# --------------------------------------------------------------------------- case plan (all 19 + diagnostics)

def case_plan(case):
    py = case.startswith('SDKPY') or case.startswith('DIAG-PY-')
    hold_py = case in ('SDKPY07', 'DIAG-PY-RPC')
    hold_ts = case in ('SDKTS10', 'DIAG-TS-ABORT')
    if py:
        if hold_py:
            barriers = ['READY to each role after BEGIN identity + cgroup/PID witness',
                        'ABORT_NOW->driver after peer REQUEST_HELD and the held line fully committed by the adapter (RAW_READ+FORWARD_COMMIT)',
                        'RELEASE_REPLY->peer after driver API_CANCELLED',
                        'FINISH_PEER->peer after driver %s' % ('HOOK_CLOSED(turn A)' if case == 'SDKPY07' else 'DIAGNOSTIC LATE_REPLY_OBSERVED'),
                        'RELEASE_EXIT->driver after adapter and peer terminal (frame or witnessed process exit)']
        elif case == 'DIAG-PY-KILL':
            barriers = ['READY to each role', 'SIGKILL of the whole unit after peer REQUEST_HELD (no further control)']
        else:
            barriers = ['READY to each role after BEGIN identity + cgroup/PID witness',
                        'FINISH_PEER->peer after driver DIAGNOSTIC CALLS_DONE' + (' and peer PEER_REQUESTS_DONE' if case == 'SDKPY06' else ''),
                        'RELEASE_EXIT->driver after adapter and peer terminal']
        driver = 'run_sdk (CodexClient/AsyncCodexClient real calls)' if case.startswith('SDK') else 'run_diag (own constant client)'
        return {'language': 'python', 'driver': driver, 'peer': 'fixture-rpc Script from frozen fixture_input', 'barriers': barriers}
    if hold_ts:
        barriers = ['READY to each role', 'ABORT_NOW->driver after peer REQUEST_HELD equals adapter-forwarded stdin (STREAM_END) and peer host PID witnessed in the unit cgroup',
                    'no release: termination is the abort/kill signal cascade']
    else:
        barriers = ['READY to each role', 'RELEASE_REPLY->peer after peer REQUEST_HELD equals adapter-forwarded stdin (STREAM_END)',
                    'RELEASE_EXIT->peer after adapter committed exactly the peer REPLY_WRITTEN stdout/stderr byte counts']
    driver = 'sdkCase (Thread.run or runStreamed real calls)' if case.startswith('SDK') else 'diagnostic (own spawn mirroring exec.ts)'
    return {'language': 'typescript', 'driver': driver, 'peer': 'fixture-cli wireFixture/hold from frozen fixture_input', 'barriers': barriers}


# --------------------------------------------------------------------------- budget

def budget_take(unit, case, attempt):
    b = json.loads(BUDGET.read_text())
    if b['services_used'] >= b['services_max']:
        raise SystemExit('BLOCKED: service budget exhausted (%d/%d)' % (b['services_used'], b['services_max']))
    b['services_used'] += 1
    b['history'].append({'unit': unit, 'case': case, 'attempt': attempt, 'counted': b['services_used'], 'started_at': now_iso(), 'result': 'STARTED'})
    b['updated_at'] = now_iso()
    save_json(BUDGET, b)
    return b['services_used']


def budget_result(unit, result):
    b = json.loads(BUDGET.read_text())
    for e in b['history']:
        if e['unit'] == unit:
            e['result'] = result
            e['finished_at'] = now_iso()
    b['updated_at'] = now_iso()
    save_json(BUDGET, b)


# --------------------------------------------------------------------------- /proc witnesses

def proc_info(pid):
    base = Path('/proc/%d' % pid)
    try:
        status = (base / 'status').read_text()
        stat_ = (base / 'stat').read_text()
        cmd = (base / 'cmdline').read_bytes().split(b'\0')
        info = {'host_pid': pid,
                'nspid': [int(x) for x in [ln for ln in status.splitlines() if ln.startswith('NSpid:')][0].split()[1:]],
                'ppid': int([ln for ln in status.splitlines() if ln.startswith('PPid:')][0].split()[1]),
                'starttime': stat_.rsplit(')', 1)[1].split()[19],
                'cmdline': [x.decode('utf-8', 'replace') for x in cmd[:-1]] if cmd and cmd[-1] == b'' else [x.decode('utf-8', 'replace') for x in cmd]}
        try:
            info['pid_ns'] = os.readlink(base / 'ns' / 'pid')
            info['net_ns'] = os.readlink(base / 'ns' / 'net')
            st = os.stat(base / 'exe')
            info['exe_dev_ino'] = [st.st_dev, st.st_ino]
        except OSError as exc:
            info['ns_error'] = '%s' % exc
        return info
    except (OSError, IndexError, ValueError):
        return None


def alive(info):
    if not info:
        return False
    cur = proc_info(info['host_pid'])
    return cur is not None and cur['starttime'] == info['starttime']


class Attempt:
    def __init__(self, case):
        assert case in DIAG, 'SDK cases require a separate future admission; only DIAG-* constant diagnostics may run'
        self.case = case
        self.spec = DIAG[case]
        self.language = self.spec['language']
        self.attempt = secrets.token_hex(20)
        self.nonce = secrets.token_hex(20)
        self.unit = '%s%s-%s.service' % (UNIT_PREFIX, self.attempt[:12], case.lower())
        self.dir = RUNTIME / 'attempts' / (self.attempt[:12] + '-' + case)
        self.evidence = DIAG_DIR / (self.attempt[:12] + '-' + case)
        self.actions = []
        self.done = set()
        self.ctl_seq = {'driver': 0, 'adapter': 0, 'peer': 0}
        self.role_host = {}
        self.admission_fail = []
        self.cgroup = None
        self.service = {}
        self.stalled = False
        self.host_netns = os.readlink('/proc/self/ns/net')
        self.peaks = {}
        self.t0 = time.monotonic_ns()

    def act(self, name, **detail):
        self.actions.append({'t_ns': time.monotonic_ns() - self.t0, 'action': name, 'detail': detail})

    # ----------------------------------------------------------------- preparation
    def prepare(self):
        for name, (path, digest) in HOST.items():
            assert sha_path(path) == digest, 'host identity drift: ' + name
        self.dir.mkdir(mode=0o700, parents=False)
        fifo = self.dir / 'fifo'
        fifo.mkdir(mode=0o700)
        prof = self.dir / 'profile'
        prof.mkdir(mode=0o755)
        self.fds = {}
        self.fifo_stat = {}
        self.pipe_buf = {}
        for n in NAMES:
            p = fifo / n
            os.mkfifo(p, 0o600)
            os.chmod(p, 0o600)
            if n.endswith('.events'):
                r = os.open(p, os.O_RDONLY | os.O_NONBLOCK | os.O_CLOEXEC)
                k = os.open(p, os.O_WRONLY | os.O_NONBLOCK | os.O_CLOEXEC)
                self.fds[n] = {'read': r, 'keeper': k}
                self.pipe_buf['/observer/' + n] = os.fpathconf(r, 'PC_PIPE_BUF')
            else:
                c = os.open(p, os.O_RDWR | os.O_NONBLOCK | os.O_CLOEXEC)
                self.fds[n] = {'control': c}
                self.pipe_buf['/observer/' + n] = os.fpathconf(c, 'PC_PIPE_BUF')
            st = os.lstat(p)
            assert (st.st_mode & 0o7777) == 0o600 and st.st_uid == os.getuid()
            self.fifo_stat['/observer/' + n] = [str(st.st_dev), str(st.st_ino), '0600', 0]
        sources = PY_SOURCES if self.language == 'python' else TS_SOURCES
        src_dir = HERE if self.language == 'python' else UNIT / 'node'
        for name, mode in sources.items():
            origin = (HERE / name) if name == 'bootstrap.py' else (src_dir / name)
            shutil.copyfile(origin, prof / name)
            os.chmod(prof / name, mode)
        if self.language == 'typescript':
            shutil.copyfile(HERE / 'bootstrap.py', prof / 'bootstrap.py')
            os.chmod(prof / 'bootstrap.py', 0o444)
            (prof / 'package.json').write_text('{"type":"commonjs"}\n')
            (prof / 'node-loader.json').write_text(compact(node_loader_json()) + '\n')
            (prof / 'node-transpile.json').write_text(compact(node_transpile_json()) + '\n')
        (prof / 'fixture-cases.json').write_bytes(fixture_bytes())
        rows = json.loads(fixture_bytes())
        self.config = {'attempt': self.attempt, 'case': self.case, 'nonce': self.nonce, 'language': self.language,
                       'deadline_seconds': self.spec['deadline'], 'fifo_root': '/observer', 'fifo_nodes': list(NAMES),
                       'fifo_stat': self.fifo_stat, 'peer_argv': peer_argv(self.language, self.case),
                       'case_input': rows[self.case], 'mode': 'diagnostic'}
        (prof / 'adapter-config.json').write_text(compact(self.config) + '\n')
        for p in prof.iterdir():
            if p.name != 'adapter-typescript':
                os.chmod(p, 0o444)
        self.files = {'/profile/' + p.name: sha_path(p) for p in sorted(prof.iterdir())}
        self.admission = {'v': 1, 'attempt': self.attempt, 'case': self.case, 'nonce': self.nonce, 'language': self.language,
                          'runtime_sha256': HOST['python' if self.language == 'python' else 'node'][1], 'files': self.files,
                          'fifo_pipe_buf': self.pipe_buf, 'containment_admitted': True, 'sdk_admitted': False, 'compiler_admitted': False}
        (prof / 'admission.json').write_text(compact(self.admission) + '\n')
        os.chmod(prof / 'admission.json', 0o444)
        os.chmod(prof, 0o555)
        self.expect = {}
        for role, src in ROLE_SOURCE[self.language].items():
            self.expect[role] = {'attempt': self.attempt, 'case': self.case, 'nonce': self.nonce, 'source_sha256': self.files['/profile/' + src]}
        self.logs = {role: OBS.RoleLog(role, self.expect[role]) for role in ('driver', 'adapter', 'peer')}
        self.exe = {lang: os.stat(HOST[lang][0]) for lang in ('python', 'node')}

    def command(self):
        py, node = HOST['python'][0], HOST['node'][0]
        bw = ['/usr/bin/bwrap', '--unshare-all', '--uid', '0', '--gid', '0', '--new-session', '--die-with-parent', '--clearenv',
              '--dir', '/runtime', '--dir', '/usr/lib', '--dir', '/usr/lib64', '--symlink', 'usr/lib', '/lib', '--symlink', 'usr/lib64', '/lib64',
              '--ro-bind', py, '/runtime/python', '--ro-bind', node, '/runtime/node',
              '--ro-bind', '/usr/lib/python3.12', '/usr/lib/python3.12', '--ro-bind', '/usr/lib/x86_64-linux-gnu', '/usr/lib/x86_64-linux-gnu',
              '--ro-bind', '/usr/lib/locale', '/usr/lib/locale',
              '--ro-bind', '/usr/lib/x86_64-linux-gnu/ld-linux-x86-64.so.2', '/usr/lib64/ld-linux-x86-64.so.2',
              '--ro-bind', str(self.dir / 'profile'), '/profile', '--dir', '/observer']
        for n in NAMES:
            bw += ['--ro-bind', str(self.dir / 'fifo' / n), '/observer/' + n]
        bw += ['--proc', '/proc', '--dev', '/dev', '--size', '67108864', '--tmpfs', '/work', '--dir', '/work/home', '--dir', '/work/tmp', '--chdir', '/work']
        for k, v in FIXED_ENV.items():
            bw += ['--setenv', k, v]
        bw += ['--remount-ro', '/', '--', '/runtime/python', '-I', '-S', '/profile/bootstrap.py'] + role_argv(self.language, 'driver', self.case)
        cmd = ['/usr/bin/systemd-run', '--user', '--quiet', '--unit', self.unit, '--wait', '--pipe', '--collect']
        for k, v in PROPS.items():
            cmd += ['--property', '%s=%s' % (k, v)]
        uid = os.getuid()
        env = {'PATH': '/usr/bin:/bin', 'HOME': str(Path.home()), 'LANG': 'C.UTF-8', 'XDG_RUNTIME_DIR': '/run/user/%d' % uid,
               'DBUS_SESSION_BUS_ADDRESS': 'unix:path=/run/user/%d/bus' % uid}
        return cmd + ['--'] + bw, env

    # ----------------------------------------------------------------- systemd/cgroup witnesses
    def systemctl(self, *args, timeout=5):
        _, env = self.command()
        return subprocess.run(['/usr/bin/systemctl', '--user'] + list(args), capture_output=True, text=True, env=env, timeout=timeout)

    def unit_witness(self):
        fields = ['Id', 'MainPID', 'ControlGroup', 'MemoryMax', 'TasksMax', 'CPUQuotaPerSecUSec', 'RuntimeMaxUSec',
                  'TimeoutStopUSec', 'NoNewPrivileges', 'KillMode', 'LoadState', 'ActiveState']
        c = self.systemctl('show', self.unit, *[a for f in fields for a in ('-p', f)])
        values = dict(line.split('=', 1) for line in c.stdout.splitlines() if '=' in line)
        if values.get('ControlGroup'):
            self.cgroup = Path('/sys/fs/cgroup' + values['ControlGroup'])
        return values

    def members(self):
        if self.cgroup is None:
            self.service = self.unit_witness()
        if self.cgroup is None:
            return []
        try:
            pids = [int(x) for x in (self.cgroup / 'cgroup.procs').read_text().split()]
        except OSError:
            return []
        return [i for i in (proc_info(p) for p in pids) if i]

    def cgroup_limits(self):
        try:
            vals = {n: (self.cgroup / n).read_text().strip() for n in ('memory.max', 'pids.max', 'cpu.max')}
        except (OSError, TypeError):
            return {'error': 'unreadable'}, False
        q = vals['cpu.max'].split()
        ok = vals['memory.max'] == '536870912' and vals['pids.max'] == '32' and len(q) == 2 and q[0] == q[1]
        return vals, ok

    def map_role(self, role, ev):
        deadline = time.monotonic() + 1.0
        found = None
        while time.monotonic() < deadline and found is None:
            for m in self.members():
                if m['nspid'] and m['nspid'][-1] == ev['pid'] and len(m['nspid']) >= 2 and m.get('pid_ns') == ev['data']['pid_namespace']:
                    found = m
                    break
            if found is None:
                time.sleep(0.01)
        problems = []
        if found is None:
            problems.append('no cgroup member with NSpid %d in %s' % (ev['pid'], ev['data']['pid_namespace']))
        else:
            lang_exe = 'python' if self.language == 'python' else 'node'
            want = [self.exe[lang_exe].st_dev, self.exe[lang_exe].st_ino]
            if found.get('exe_dev_ino') != want:
                problems.append('executable inode differs from bound runtime')
            if role == 'adapter' and self.language == 'typescript':
                args = found['cmdline'][2:]
                ok = found['cmdline'][:2] == ['/runtime/node', '/profile/adapter-typescript']
                self.adapter_args = args
            elif role == 'peer' and self.language == 'typescript':
                ok = found['cmdline'] == role_argv('typescript', 'peer', self.case, getattr(self, 'adapter_args', None))
            else:
                ok = found['cmdline'] == role_argv(self.language, role, self.case)
            if not ok:
                problems.append('cmdline differs from frozen argv: %r' % found['cmdline'])
            if found.get('net_ns') == self.host_netns:
                problems.append('role shares the host network namespace')
            parent = {'adapter': 'driver', 'peer': 'adapter'}.get(role)
            if parent and (parent not in self.role_host or self.role_host[parent]['host_pid'] != found['ppid']):
                problems.append('%s parent is not the witnessed %s' % (role, parent))
        if not hasattr(self, 'limits'):
            self.limits, self.limits_ok = self.cgroup_limits()
            if not self.limits_ok:
                problems.append('cgroup limits differ from the frozen service properties')
        if found is not None:
            self.role_host[role] = found
        if problems:
            self.admission_fail += ['%s: %s' % (role, p) for p in problems]
        self.act('MAP_ROLE', role=role, ok=not problems, host=found, problems=problems)
        return not problems

    # ----------------------------------------------------------------- control
    def send(self, role, command):
        key = '%s->%s' % (command, role)
        if key in self.done:
            return
        self.done.add(key)
        obj = {'v': 1, 'attempt': self.attempt, 'case': self.case, 'role': role, 'seq': self.ctl_seq[role], 'command': command}
        payload = compact(obj).encode()
        frame = len(payload).to_bytes(4, 'big') + payload
        n = os.write(self.fds[role + '.control']['control'], frame)
        assert n == len(frame), 'short control write'
        self.ctl_seq[role] += 1
        self.controls.setdefault(role, bytearray()).extend(frame)
        self.act('CONTROL', role=role, command=command, seq=obj['seq'])

    def sample_peaks(self):
        if self.cgroup is None:
            return
        for name in ('pids.peak', 'memory.peak', 'pids.current'):
            try:
                v = int((self.cgroup / name).read_text().split()[0])
            except (OSError, ValueError, IndexError):
                continue
            key = name.replace('.current', '.max_sampled')
            self.peaks[key] = max(self.peaks.get(key, 0), v)

    def role_done(self, role):
        log = self.logs[role]
        return log.terminal is not None or log.signal is not None or (role in self.role_host and not alive(self.role_host[role]))

    def advance(self):
        self.sample_peaks()
        L = self.logs
        d, a, p = L['driver'], L['adapter'], L['peer']
        case = self.case
        if self.admission_fail:
            return
        if self.language == 'python':
            hold = case in ('SDKPY07', 'DIAG-PY-RPC')
            held = p.kinds('REQUEST_HELD')
            if case == 'DIAG-PY-KILL' and held and 'KILL' not in self.done:
                self.done.add('KILL')
                c = self.systemctl('kill', '--signal=SIGKILL', self.unit)
                self.act('SIGKILL_UNIT', rc=c.returncode, stderr=c.stderr[-300:])
                return
            if hold and held and not self.role_done('driver'):
                lines, _ = OBS.lines_of(a.committed_bytes('stdin'))
                hd = held[0]['data']
                if any(len(x) == hd['bytes'] and OBS.h(x) == hd['sha256'] for x in lines):
                    self.send('driver', 'ABORT_NOW')
            if hold and 'ABORT_NOW->driver' in self.done and d.kinds('API_CANCELLED'):
                self.send('peer', 'RELEASE_REPLY')
            finished = (d.kinds('HOOK_CLOSED') if case == 'SDKPY07' else d.milestones('LATE_REPLY_OBSERVED') if hold
                        else d.milestones('CALLS_DONE'))
            if case == 'SDKPY06':
                finished = finished and p.milestones('PEER_REQUESTS_DONE')
            if finished and not self.role_done('peer') and case != 'DIAG-PY-KILL':
                self.send('peer', 'FINISH_PEER')
            if (d.milestones('CALLS_DONE') or d.milestones('LATE_REPLY_OBSERVED')) and self.role_done('adapter') \
                    and self.role_done('peer') and not self.role_done('driver'):
                self.send('driver', 'RELEASE_EXIT')
            if case == 'DIAG-PY-TERM' and 'TERM' not in self.done and a.committed['stdout'] >= 16384:
                self.done.add('TERM')
                info = self.role_host.get('adapter')
                ok = alive(info)
                if ok:
                    os.kill(info['host_pid'], signal.SIGTERM)
                self.act('SIGTERM_ADAPTER', host_pid=info and info['host_pid'], identity_rechecked=ok)
        else:
            hold = case in ('SDKTS10', 'DIAG-TS-ABORT')
            held = p.kinds('REQUEST_HELD')
            stdin_end = a.stream_end.get('stdin')
            forwarded = bool(held and stdin_end and held[0]['data']['bytes'] == stdin_end['committed_bytes']
                             and held[0]['data']['sha256'] == OBS.h(a.committed_bytes('stdin')))
            if forwarded and not hold:
                self.send('peer', 'RELEASE_REPLY')
            if forwarded and hold and 'READY->adapter' in self.done and 'READY->peer' in self.done and alive(self.role_host.get('peer')):
                self.send('driver', 'ABORT_NOW')
            wrote = p.milestones('REPLY_WRITTEN')
            if wrote:
                w = wrote[0]['detail']
                if a.committed['stdout'] == w['stdout_bytes'] and a.committed['stderr'] == w['stderr_bytes']:
                    self.send('peer', 'RELEASE_EXIT')

    def on_event(self, role, ev):
        if ev['kind'] == 'BEGIN':
            self.map_role(role, ev)
        elif ev['kind'] == 'READY':
            if role in self.role_host and not self.admission_fail:
                self.send(role, 'READY')
                if role == 'adapter' and self.spec['action'] == 'STOP_READING_ADAPTER_EVENTS_AFTER_READY':
                    self.stalled = True
                    self.act('STALL_ADAPTER_EVENTS')
            elif 'ADMISSION_STOP' not in self.done:
                self.done.add('ADMISSION_STOP')
                c = self.systemctl('stop', self.unit, timeout=10)
                self.act('ADMISSION_STOP', rc=c.returncode, reasons=self.admission_fail)
        self.advance()

    # ----------------------------------------------------------------- run
    def run(self):
        self.prepare()
        self.controls = {}
        cmd, env = self.command()
        evidence = self.evidence
        evidence.mkdir(parents=True, exist_ok=False)
        host_sources = {str(q.relative_to(UNIT)): sha_path(q) for q in sorted(list(HERE.glob('*.py')) + [x for x in (UNIT / 'node').iterdir() if x.is_file()])}
        save_json(evidence / 'command.json', {'unit': self.unit, 'attempt': self.attempt, 'case': self.case, 'argv': cmd, 'host_sources': host_sources,
                                               'env_keys': sorted(env), 'service_properties': PROPS, 'fifo_stat': self.fifo_stat,
                                               'pipe_buf': self.pipe_buf, 'runtime_dir': str(self.dir)})
        (evidence / 'profile').mkdir()
        for name in ('adapter-config.json', 'admission.json', 'node-loader.json', 'node-transpile.json', 'package.json'):
            if (self.dir / 'profile' / name).exists():
                shutil.copyfile(self.dir / 'profile' / name, evidence / 'profile' / name)
        save_json(evidence / 'profile-manifest.json', {'files': self.files, 'admission_sha256': sha_path(self.dir / 'profile' / 'admission.json'),
                                                        'admission': self.admission, 'config_sha256': self.files['/profile/adapter-config.json'],
                                                        'case_plan': case_plan(self.case), 'diag_spec': self.spec})
        count = budget_take(self.unit, self.case, self.attempt)
        self.act('LAUNCH', services_used=count)
        proc = subprocess.Popen(cmd, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env, start_new_session=True)
        os.set_blocking(proc.stdout.fileno(), False)
        os.set_blocking(proc.stderr.fileno(), False)
        out = {'stdout': bytearray(), 'stderr': bytearray()}
        open_streams = {proc.stdout.fileno(): 'stdout', proc.stderr.fileno(): 'stderr'}
        readers = {self.fds[r + '.events']['read']: r for r in ('driver', 'adapter', 'peer')}
        hard = time.monotonic() + self.spec['deadline'] + 25
        timed_out = False
        while True:
            if time.monotonic() > hard:
                timed_out = True
                c = self.systemctl('kill', '--signal=SIGKILL', self.unit)
                self.act('SUPERVISOR_BOUND_KILL', rc=c.returncode)
                break
            rl = list(open_streams) + [fd for fd, r in readers.items() if not (r == 'adapter' and self.stalled)]
            r, _, _ = select.select(rl, [], [], 0.02)
            for fd in r:
                if fd in open_streams:
                    try:
                        b = os.read(fd, 65536)
                    except BlockingIOError:
                        continue
                    if not b:
                        del open_streams[fd]
                    elif len(out[open_streams[fd]]) < 65536:
                        out[open_streams[fd]] += b[:65536 - len(out[open_streams[fd]])]
                    continue
                role = readers[fd]
                try:
                    b = os.read(fd, 65536)
                except BlockingIOError:
                    continue
                for ev in self.logs[role].feed(b, time.monotonic_ns() - self.t0):
                    self.on_event(role, ev)
            if not r:
                self.advance()
            if proc.poll() is not None and not open_streams:
                break
        try:
            rc = proc.wait(timeout=15)
        except subprocess.TimeoutExpired:
            proc.kill()
            rc = proc.wait(timeout=5)
        self.act('SERVICE_EXITED', systemd_run_rc=rc, timed_out=timed_out)
        return self.finish(rc, out, timed_out)

    def finish(self, rc, out, timed_out):
        after = self.unit_witness()
        cg_removed = self.cgroup is None or not self.cgroup.exists()
        cg_events = None if cg_removed else (self.cgroup / 'cgroup.events').read_text()
        still = [r for r, info in self.role_host.items() if alive(info)]
        # Close keepers only after the service/cgroup witness, then drain to actual FIFO EOF.
        for r in ('driver', 'adapter', 'peer'):
            os.close(self.fds[r + '.events']['keeper'])
        eof = {}
        for r in ('driver', 'adapter', 'peer'):
            fd = self.fds[r + '.events']['read']
            limit = time.monotonic() + 3
            eof[r] = False
            while time.monotonic() < limit:
                sel, _, _ = select.select([fd], [], [], 0.05)
                if not sel:
                    continue
                try:
                    b = os.read(fd, 65536)
                except BlockingIOError:
                    continue
                if not b:
                    eof[r] = True
                    break
                for ev in self.logs[r].feed(b, time.monotonic_ns() - self.t0):
                    self.act('LATE_DRAIN_EVENT', role=r, kind=ev['kind'])
            if eof[r]:
                self.logs[r].finish()
            os.close(fd)
        for r in ('driver', 'adapter', 'peer'):
            os.close(self.fds[r + '.control']['control'])
        checks = {
            'admission_witness_ok': not self.admission_fail,
            'cgroup_limits_match': bool(getattr(self, 'limits_ok', False)),
            'service_exited': rc is not None,
            'cgroup_removed_or_empty': cg_removed or (cg_events is not None and 'populated 0' in cg_events),
            'no_role_process_alive': not still,
            'unit_collected': after.get('LoadState') == 'not-found',
            'fifo_eof_all': all(eof.values()),
            'supervisor_bound_not_hit': not timed_out,
        }
        wire = None
        if self.language == 'typescript' and 'JSONL' in self.config['case_input']:
            fx = self.config['case_input']
            wire = {'stdout': ''.join((ln if isinstance(ln, str) else json.dumps(ln, separators=(',', ':'), ensure_ascii=False)) + '\n'
                                      for ln in fx['JSONL']).encode(), 'stderr': fx['stderr'].encode()}
        verdict, reasons, facts = OBS.reconcile(self.logs, self.language, {'checks': checks}, wire)
        diag_checks = self.diag_checks(verdict)
        status = 'DIAG_PASS' if verdict == self.spec['expect'] and all(diag_checks.values()) else 'DIAG_FAIL'
        ev = self.evidence
        for r, log in self.logs.items():
            (ev / ('events-%s.bin' % r)).write_bytes(bytes(log.raw))
            (ev / ('events-%s.jsonl' % r)).write_text(''.join(compact(e) + '\n' for e in log.events))
        for r, frames in self.controls.items():
            (ev / ('controls-%s.bin' % r)).write_bytes(bytes(frames))
        (ev / 'service-stdout.txt').write_bytes(bytes(out['stdout']))
        (ev / 'service-stderr.txt').write_bytes(bytes(out['stderr']))
        result = {'kind': 'CONSTANT_DIAGNOSTIC_NOT_SDK_EXECUTION', 'case': self.case, 'unit': self.unit, 'attempt': self.attempt,
                  'language': self.language, 'expected_verdict': self.spec['expect'], 'verdict': verdict, 'status': status,
                  'reasons': reasons, 'diag_checks': diag_checks, 'facts': facts, 'os_checks': checks,
                  'role_status': {r: log.status() for r, log in self.logs.items()},
                  'role_violation': {r: log.violation for r, log in self.logs.items()},
                  'role_host': self.role_host, 'cgroup_limits': getattr(self, 'limits', None), 'cgroup_peaks_sampled': self.peaks,
                  'service_before': self.service,
                  'service_after': after, 'cgroup_events_after': cg_events, 'systemd_run_rc': rc, 'actions': self.actions,
                  'frames': {r: len(log.events) for r, log in self.logs.items()},
                  'raw_frame_bytes': {r: log.raw_bytes for r, log in self.logs.items()},
                  'elapsed_ns': time.monotonic_ns() - self.t0, 'SDK_imports': 0, 'compiler_imports': 0,
                  'functional_receipts': 0, 'observed_at': now_iso()}
        save_json(ev / 'result.json', result)
        budget_result(self.unit, '%s/%s' % (status, verdict))
        return result

    def diag_checks(self, verdict):
        d, a, p = self.logs['driver'], self.logs['adapter'], self.logs['peer']
        c = {}
        case = self.case
        order = [x['detail'].get('command') + '->' + x['detail'].get('role') for x in self.actions if x['action'] == 'CONTROL']
        if case == 'DIAG-PY-RPC':
            ct = d.milestones('CONTAINMENT')
            c['containment_selfcheck'] = bool(ct) and ct[0]['detail'].get('private_write') == 'PASS'
            seq = [x for x in order if not x.startswith('READY')]
            c['barrier_order'] = seq == ['ABORT_NOW->driver', 'RELEASE_REPLY->peer', 'FINISH_PEER->peer', 'RELEASE_EXIT->driver']
            c['cancel_witness'] = bool(d.kinds('API_CANCELLED')) and bool(d.milestones('LATE_REPLY_OBSERVED'))
            own = d.milestones('OWN_CLIENT_CLOSED')
            c['own_client_exit_0'] = bool(own) and own[0]['detail']['returncode'] == 0
        elif case in ('DIAG-PY-LARGE',):
            own = d.milestones('OWN_CLIENT_CLOSED')
            c['large_reply_relayed'] = a.committed['stdout'] > 150000 and bool(own) and own[0]['detail']['returncode'] == 0
        elif case == 'DIAG-PY-TERM':
            own = d.milestones('OWN_CLIENT_CLOSED')
            c['adapter_signal_and_incomplete_end'] = a.signal == 'SIGTERM' and a.terminal == 'END'
            c['adapter_died_by_sigterm'] = bool(own) and own[0]['detail']['returncode'] == -15
            c['peer_received_forwarded_signal'] = p.signal == 'SIGTERM' or p.terminal == 'INVALID'
            c['signal_mid_large_stream'] = 16384 <= a.committed['stdout'] < 200000
        elif case == 'DIAG-PY-STALL':
            c['bounded_by_deadline'] = (time.monotonic_ns() - self.t0) < (self.spec['deadline'] + 12) * 1_000_000_000
            c['adapter_without_complete_end'] = not (a.terminal == 'END' and a.kinds('END')[0]['data']['complete'])
        elif case == 'DIAG-PY-KILL':
            c['unit_sigkilled'] = 'KILL' in self.done
            c['no_role_terminal_frame'] = all(self.logs[r].terminal is None for r in ('adapter', 'peer'))
        elif case == 'DIAG-TS-ECHO':
            st = d.milestones('LOADER_SELFTEST')
            tg = d.milestones('TRANSPILE_GATE')
            own = d.milestones('OWN_FIXTURE_CHILD_CLOSED')
            c['loader_selftest'] = bool(st) and st[0]['detail']['pass'] is True
            c['transpile_refused_before_compiler'] = bool(tg) and tg[0]['detail']['pass'] is True
            c['nonzero_exit_mirrored'] = bool(own) and own[0]['detail']['code'] == 3
        elif case == 'DIAG-TS-LARGE':
            own = d.milestones('OWN_FIXTURE_CHILD_CLOSED')
            c['large_stdout_relayed'] = bool(own) and own[0]['detail']['stdout_bytes'] == 180003 and a.committed['stdout'] == 180003
        elif case == 'DIAG-TS-ABORT':
            own = d.milestones('OWN_FIXTURE_CHILD_CLOSED')
            c['abort_after_witnesses'] = 'ABORT_NOW->driver' in order
            c['adapter_signal_and_incomplete_end'] = a.signal == 'SIGTERM' and a.terminal == 'END'
            c['adapter_died_by_sigterm'] = bool(own) and own[0]['detail']['signal'] == 'SIGTERM'
        c['verdict_matches_expectation'] = verdict == self.spec['expect']
        return c


def main(argv):
    if argv[:1] == ['fixtures']:
        b = fixture_bytes()
        (UNIT / 'fixture-cases.json').write_bytes(b)
        print(json.dumps({'fixture_cases_sha256': sha_bytes(b), 'rows': len(json.loads(b))}))
        return 0
    if argv[:1] == ['templates']:
        t = UNIT / 'profile-templates'
        t.mkdir(exist_ok=True)
        (t / 'node-loader.json').write_text(compact(node_loader_json()) + '\n')
        (t / 'node-transpile.json').write_text(compact(node_transpile_json()) + '\n')
        (t / 'package.json').write_text('{"type":"commonjs"}\n')
        (t / 'sdk-emitted-package.json').write_text('{"type":"module"}\n')
        print(json.dumps({p.name: sha_path(p) for p in sorted(t.iterdir())}))
        return 0
    if argv[:1] == ['plan']:
        plan = {c: case_plan(c) for c in SDK_CASES_PY + SDK_CASES_TS + sorted(DIAG)}
        save_json(UNIT / 'case-plan.json', {'kind': 'CASE_PLAN_FROM_SUPERVISOR_TABLES', 'cases': plan, 'diagnostics': DIAG,
                                            'sdk_cases_runnable_now': False, 'SDK_runtime': 'NOT_RUN'})
        print(len(plan))
        return 0
    if len(argv) == 2 and argv[0] == 'run':
        result = Attempt(argv[1]).run()
        print(json.dumps({k: result[k] for k in ('case', 'unit', 'verdict', 'status', 'reasons', 'diag_checks', 'os_checks', 'role_status', 'elapsed_ns')}, indent=1))
        return 0 if result['status'] == 'DIAG_PASS' else 1
    print(__doc__)
    return 2


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
