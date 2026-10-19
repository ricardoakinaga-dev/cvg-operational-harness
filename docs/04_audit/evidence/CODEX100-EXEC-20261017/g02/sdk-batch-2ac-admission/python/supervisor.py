"""Host supervisor for DX100-G02:IMPLEMENT-AND-ADMIT-SDK-SOURCE-BATCH-2A-CONTINUATION (runs OUTSIDE the target cgroup).

Derived from the batch 2A supervisor (g02/sdk-batch-2a-admission/python/supervisor.py, source-freeze-r3) with the freeze r4
of the approved continuation spec copied to inputs/spec-2ac/ (cases-2a-cont.json sha bound): F4-01 case_input delivered from
the frozen slot bytes (insertion order) with supervisor, role and evaluator witnesses; F4-02 wire reference from the frozen
fixture, also under a signal (observer); F4-06 unprivileged inotify witness of the adapter executable inside the
WITNESS_WINDOW_OPEN window; DIAG rows of the r4 qualification (9 requalified, 2 new).

Commands (host python3.12 -I):
  supervisor.py fixtures            write fixture-cases.json (9 continuation rows + constant DIAG rows; canonical, sorted keys;
                                    never the source of the delivered case_input)
  supervisor.py plan                write case-plan.json (driver/peer/barrier/acceptance of every case)
  supervisor.py init-ledgers        write budget.json (12 services) and case-ledger.json (9 single-use slots)
  supervisor.py freeze              write source-freeze-r4.json (refuses to overwrite)
  supervisor.py freeze-identities   identity-freeze-r4.json: binds DIAG passes, conditional-slot decisions, host, trees, emit
  supervisor.py run CASE            one transient service: DIAG-* (12-service budget), 2AC-CTRL01 or a continuation SDK case
                                    (single-shot case ledger, never retried)

SDK/Pydantic code is imported or executed only inside the contained service, and only when the source freeze,
the identity freeze and (for TypeScript cases) the sealed emit of the admission match. The supervisor never
imports SDK, Pydantic, compiler or acquired code. Load average above 12 before a service: wait and record.
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
import stat
import subprocess
import sys
import time
from pathlib import Path

sys.dont_write_bytecode = True  # never leave bytecode next to the evidence sources
HERE = Path(__file__).resolve().parent
UNIT = HERE.parent
G02 = UNIT.parent
ADMISSION = G02 / 'sdk-admission'
REFERENCE = G02 / 'sdk-reference-profile'
ARTIFACTS = G02 / 'sdk-profile-artifacts'
SPEC = UNIT / 'inputs' / 'spec-2ac'
RUNTIME = Path('/mnt/dados/cvg-work/cvg-codex100-batch2ac-runtime-20261019')
ATTEMPTS = RUNTIME / 'attempts'
SDK_PY_TREE = RUNTIME / 'sdk-python'
PY_DEPS_TREE = RUNTIME / 'python-deps'
TS_TREE = RUNTIME / 'trees' / 'typescript-5.9.2'
EMITTED = RUNTIME / 'emitted'
DIAG_DIR = UNIT / 'diagnostics'
CASES_DIR = UNIT / 'cases'
FREEZE = UNIT / 'source-freeze-r4.json'
IDENTITY = UNIT / 'identity-freeze-r4.json'
ADMISSION_IDENTITY = ADMISSION / 'identity-freeze.json'
ADMISSION_IDENTITY_SHA = 'ebfb308f17e6a21ab77c91ab3863b737dd646ed6b1b6bbd835cba73e62225b1d'
EMIT_RECORD = ADMISSION / 'compiler' / 'emit.json'  # sealed emit of the admission, reused (same .ts, same transpile)
CASES_JSON = SPEC / 'cases-2a-cont.json'
CASES_SHA = '60a46db7544134958481c03df476305659f29653faaa171a6fed41a8ce6b4244'
SPEC_SHA = {'cases-2a-cont.json': CASES_SHA,
            'coverage-plan-2a-cont.json': 'dca8d1fb22d31145ad9d0a0f4f86d47b9e391c59e8c88aa7eb7ac7f3197ea343',
            'freeze-r4-contract.json': '14ad70297aa907e5a88add489196c1b38dfdbf15ef50454f40250185957688ed',
            'evaluator-r4-contract.json': '62d948a1373ab0b7eb7ac55d02bfd3a638bdadbf6d194b3765dd273d63c89b72',
            'control-slot-contract.json': '35a7f210c7eb2c40762009d924177164cadce5661172d12d12fbcaea53d68c73',
            'execution-budget.json': '037922bc1b5e5d383071ad46460c187cecd6b52673e214b20d68bf90cd6097f1'}
SOURCE_INPUTS = REFERENCE / 'source-inputs.json'
TS_SRC = REFERENCE / 'inputs' / 'sdk' / 'typescript' / 'src'
TYPESCRIPT_JS = ('lib/typescript.js', 'e5f1f6b3e82228a89873cc7b941b2465185e839c0692860f83e3e63e53f94c2b', 9111680)
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
             'TZ': 'UTC', 'PYTHONDONTWRITEBYTECODE': '1', 'UV_THREADPOOL_SIZE': '2'}
TS_SDK_ENV = {'HOME': '/work/home', 'PATH': '/runtime', 'CODEX_INTERNAL_ORIGINATOR_OVERRIDE': 'codex_sdk_ts'}
UNIT_PREFIX = 'cvg-dx100-2ac-'
LOAD_LIMIT = 12.0
CASE_ARTIFACTS = 2097152  # interface-v1 limits.case_artifacts: events of all roles + controls + service output
SERVICE_OUTPUT_CAP = 65536
COMPILER_STDOUT_CAP = 262144
BUDGET = UNIT / 'budget.json'
CASE_LEDGER = UNIT / 'case-ledger.json'
NAMES = [r + '.' + k for r in ('driver', 'adapter', 'peer') for k in ('events', 'control')]
PY_SOURCES = ('channel.py', 'adapter-python.py', 'fixture-rpc.py', 'python-driver.py', 'control-client.py', 'bootstrap.py')
TS_SOURCES = ('channel.cjs', 'adapter-typescript', 'fixture-cli.mjs', 'ts-driver.mjs', 'extension-loader.mjs', 'transpile.mjs')
ROLE_SOURCE = {'python': {'driver': 'python-driver.py', 'adapter': 'adapter-python.py', 'peer': 'fixture-rpc.py'},
               'typescript': {'driver': 'ts-driver.mjs', 'adapter': 'adapter-typescript', 'peer': 'fixture-cli.mjs'}}
SDK_BUILTINS = ['node:child_process', 'node:fs', 'node:module', 'node:os', 'node:path', 'node:readline']
LOADER_BUILTINS = sorted(set(SDK_BUILTINS) | {'node:crypto', 'node:net', 'node:util'})
TS_FILES = ['codex.ts', 'codexOptions.ts', 'events.ts', 'exec.ts', 'index.ts', 'items.ts', 'outputSchemaFile.ts',
            'thread.ts', 'threadOptions.ts', 'turnOptions.ts']
CONTROL_CASE = '2AC-CTRL01'


def spec_cases():
    raw = CASES_JSON.read_bytes()
    assert hashlib.sha256(raw).hexdigest() == CASES_SHA, 'cases-2a-cont.json drifted from the approved spec'
    return {c['id']: c for c in json.loads(raw)['cases']}  # json.loads preserves the frozen insertion order (F4-01)


SPEC_CASES = spec_cases()
SDK_CASES_PY = [c for c, d in SPEC_CASES.items() if d['kind'] == 'SDK' and d['language'] == 'python']
SDK_CASES_TS = [c for c, d in SPEC_CASES.items() if d['kind'] == 'SDK' and d['language'] == 'typescript']
assert len(SDK_CASES_PY) == 0 and len(SDK_CASES_TS) == 8 and SPEC_CASES[CONTROL_CASE]['kind'] == 'CONTROL'
HOLD_PY = {'DIAG-PY-RPC'}  # held turn/start reply released after the driver cancellation witness
WITNESS_CASES = {'2A-TS12R', 'DIAG-TS-PREABORT', 'DIAG-TS-ENOENT'}  # F4-06: inotify window of the adapter executable
CONDITIONAL = {'2A-TS12R': 'ts12r_slot', '2A-TS10E': 'ts10e_slot'}
# Python cases whose driver closes the client stdin before CALLS_DONE (EOF-bounded absence judgment).
EOF_BARRIER = {'DIAG-PY-RPC', 'DIAG-PY-STAGE', 'DIAG-PY-UNSCRIPTED', CONTROL_CASE}
_INIT = {'serverInfo': {'name': 'synthetic-diagnostic', 'version': '0.151.0'}, 'userAgent': 'synthetic-diagnostic/0.151.0'}
_TURN = {'result': {'turn': {'id': 'A', 'items': [], 'status': 'inProgress'}}}
_UNSCRIPTED = {'code': -32601, 'message': 'cvg synthetic: unscripted request', 'data': {'cvg_synthetic': True},
               'data_merge_rule': 'o peer acrescenta "method": <método recebido> ao data declarado',
               'sdk_class': 'openai_codex.errors.MethodNotFoundError'}
_ARGVENV_ARGV = ['exec', '--experimental-json'] + [a for i in range(14) for a in ('--config', 'diag_k%02d="%s"' % (i, 'v' * 24))]
DIAG_ROWS = {
    'DIAG-PY-RPC': {'initialize_result': _INIT, 'turn_start_reply': _TURN},
    'DIAG-PY-STAGE': {'initialize_result': _INIT, 'large_bytes': 4096},
    'DIAG-PY-UNSCRIPTED': {'sdk_calls': [], 'peer_script': {'version': 2, 'unscripted_error': _UNSCRIPTED,
                                                            'on_request': [{'match': {'method': 'initialize'}, 'reply': {'result': _INIT}}]}},
    'DIAG-TS-ECHO': {'JSONL': [{'type': 'thread.started', 'thread_id': 'diag-thread'}, 'not json', '',
                               {'type': 'turn.completed', 'usage': {'input_tokens': 1, 'cached_input_tokens': 0, 'output_tokens': 1}}],
                     'exit_code': 3, 'stderr': 'diag stderr\n'},
    'DIAG-TS-LARGE': {'JSONL': ['x' * 60000, 'y' * 60000, 'z' * 60000], 'exit_code': 0, 'stderr': 'e' * 4000},
    # r4: JSONL objects (keys out of code-point order) written before holding; the signal cascade checks the wire prefix (F4-02).
    'DIAG-TS-ABORT': {'JSONL': [{'type': 'thread.started', 'thread_id': 'diag-abort'}, {'type': 'turn.started'}], 'exit_code': 0, 'stderr': '',
                      'write_then_hold': True},
    # r4: env keys out of code-point order; the role BEGIN witnesses prove the frozen bytes were delivered (F4-01).
    'DIAG-TS-ARGVENV': {'sdk_calls': [], 'fixture': {'JSONL': [{'type': 'thread.started', 'thread_id': 'diag-argvenv'}], 'exit_code': 0, 'stderr': ''},
                        'diag': {'argv': _ARGVENV_ARGV, 'env': {'PATH': '/runtime', 'HOME': '/work/home', 'CVG_DIAG_ENV': 'argvenv',
                                                                 'CODEX_INTERNAL_ORIGINATOR_OVERRIDE': 'codex_sdk_ts'}}},
    'DIAG-TS-TMPWATCH': {'sdk_calls': [], 'fixture': {'JSONL': [], 'exit_code': 0, 'stderr': '', 'read_schema_file_from_argv': True},
                         'diag': {'schema': {'type': 'object', 'properties': {'diag': {'type': 'string'}}}}},
    'DIAG-TS-ENOENT': {'sdk_calls': [], 'fixture': {'no_child': True, 'exit_code': 0, 'stderr': ''},
                       'diag': {'path': '/profile/no-such-codex', 'wait_ms': 5000}},
    'DIAG-TS-PREABORT': {'sdk_calls': [], 'fixture': {'no_child': True, 'exit_code': 0, 'stderr': ''},
                         'diag': {'path': '/profile/adapter-typescript', 'wait_ms': 5000}},
    'DIAG-TS-EPIPE': {'sdk_calls': [], 'fixture': {'JSONL': [], 'exit_code': 0, 'stderr': '', 'allow_empty_stdin': True,
                                                   'adapter_close_stdin_at_start': True},
                      'diag': {'bytes': 1048576}},
}
DIAG = {
    'DIAG-PY-RPC': {'language': 'python', 'deadline': 20, 'expect': 'PASS', 'action': None},
    'DIAG-PY-STAGE': {'language': 'python', 'deadline': 20, 'expect': 'PASS', 'action': None},
    'DIAG-PY-UNSCRIPTED': {'language': 'python', 'deadline': 20, 'expect': 'PASS', 'action': None},
    'DIAG-TS-ECHO': {'language': 'typescript', 'deadline': 20, 'expect': 'PASS', 'action': None},
    'DIAG-TS-LARGE': {'language': 'typescript', 'deadline': 20, 'expect': 'PASS', 'action': None},
    'DIAG-TS-ABORT': {'language': 'typescript', 'deadline': 20, 'expect': 'KNOWN_SIGNAL_TERMINATION', 'action': None},
    'DIAG-TS-ARGVENV': {'language': 'typescript', 'deadline': 20, 'expect': 'PASS', 'action': None},
    'DIAG-TS-TMPWATCH': {'language': 'typescript', 'deadline': 20, 'expect': 'PASS', 'action': None},
    'DIAG-TS-ENOENT': {'language': 'typescript', 'deadline': 20, 'expect': 'NO_CHILD', 'action': None},
    'DIAG-TS-PREABORT': {'language': 'typescript', 'deadline': 20, 'expect': 'NO_CHILD', 'action': None},  # observer form; evaluator PREFRAME
    'DIAG-TS-EPIPE': {'language': 'typescript', 'deadline': 20, 'expect': 'PASS', 'action': None},
}
# Freeze r4 qualification (freeze-r4-contract.json#/qualification_diags): 11 of 12 services, 1 in reserve.
ADMISSION_DIAGS = ['DIAG-PY-RPC', 'DIAG-TS-ECHO', 'DIAG-TS-ABORT', 'DIAG-TS-LARGE', 'DIAG-PY-STAGE', 'DIAG-PY-UNSCRIPTED',
                   'DIAG-TS-ARGVENV', 'DIAG-TS-TMPWATCH', 'DIAG-TS-ENOENT', 'DIAG-TS-PREABORT', 'DIAG-TS-EPIPE']
# Conditional diagnostics: a failure only switches off the conditional slot they decide (conditional_diags of the contract).
CONDITIONAL_DIAGS = {'DIAG-TS-ENOENT': 'ts12r_slot', 'DIAG-TS-PREABORT': 'ts12r_slot', 'DIAG-TS-EPIPE': 'ts10e_slot'}
# Files whose bytes form the source identity (freeze): everything a role, the observer or the supervisor uses.
SOURCE_SET = (['python/' + n for n in ('acceptance.py', 'adapter-python.py', 'bootstrap.py', 'channel.py', 'control-client.py',
                                       'fixture-rpc.py', 'observer.py', 'python-driver.py', 'supervisor.py')]
              + ['node/' + n for n in ('adapter-typescript', 'channel.cjs', 'extension-loader.mjs', 'fixture-cli.mjs',
                                       'transpile.mjs', 'ts-driver.mjs')]
              + ['case-plan.json', 'fixture-cases.json', 'interface-bindings-v2.json', 'profile-templates/node-loader.json',
                 'profile-templates/node-transpile.json', 'profile-templates/package.json', 'profile-templates/sdk-emitted-package.json']
              + ['inputs/spec-2ac/' + n for n in sorted(SPEC_SHA)]
              + ['selftests/selftest_r4.py', 'selftests/selftest-results.json'])


def _load(name, mod):
    spec = importlib.util.spec_from_file_location(mod, HERE / name)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


OBS = _load('observer.py', 'cvg_observer')
ACC = _load('acceptance.py', 'cvg_acceptance')


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


def save_new_json(path, obj):
    with open(path, 'x') as f:
        f.write(json.dumps(obj, ensure_ascii=False, indent=2) + '\n')


# --------------------------------------------------------------------------- frozen data

def sdk_rows():
    """F4-01: the frozen case_input of each slot (cases-2a-cont.json#/cases[]/case_input), insertion order preserved."""
    rows = {}
    for cid, c in SPEC_CASES.items():
        row = c['case_input']
        assert sha_bytes(compact(row).encode('utf-8')) == c['case_input_sha256'], 'frozen case_input bytes of %s' % cid
        rows[cid] = row
    assert len(rows) == 9, 'expected the 9 frozen slots'
    return rows


def delivered_input(case):
    """F4-01: the case_input delivered to the roles, never derived from the sorted fixture-cases.json."""
    return SPEC_CASES[case]['case_input'] if case in SPEC_CASES else DIAG_ROWS[case]


def fixture_bytes():
    rows = sdk_rows()
    assert not set(rows) & set(DIAG_ROWS)
    rows.update(DIAG_ROWS)
    return (json.dumps(rows, sort_keys=True, separators=(',', ':'), ensure_ascii=False) + '\n').encode('utf-8')


def ts_source_hashes():
    return {name: sha_path(TS_SRC / name) for name in TS_FILES}


def node_loader_json(emitted=None):
    return {'v': 1, 'entry': 'file:///profile/ts-driver.mjs',
            'prebound': ['file:///profile/channel.cjs', 'file:///profile/fixture-cli.mjs', 'file:///profile/ts-driver.mjs'],
            'builtins': LOADER_BUILTINS, 'sdk_builtins': SDK_BUILTINS, 'sdk_entry': 'file:///profile/sdk-emitted/index.js',
            'emitted_dir': 'file:///profile/sdk-emitted/', 'emitted': dict(emitted or {})}


def node_transpile_json():
    return {'v': 1,
            'typescript': {'path': '/profile/typescript/lib/typescript.js', 'sha256': TYPESCRIPT_JS[1], 'bytes': TYPESCRIPT_JS[2], 'version': '5.9.2'},
            'sources': ts_source_hashes(), 'source_dir': '/profile/sdk-ts-src/', 'out_dir': '/work/sdk-emitted/',
            'compiler_options': {'allowSyntheticDefaultImports': True, 'declaration': False, 'esModuleInterop': True,
                                 'isolatedModules': True, 'module': 'ESNext', 'removeComments': False, 'sourceMap': False,
                                 'target': 'ES2022', 'verbatimModuleSyntax': False},
            'allowed_imports': {'builtins': SDK_BUILTINS, 'relative': ['./' + n[:-3] for n in TS_FILES]}}


def role_argv(language, role, case, adapter_args=None, adapter_env_json=None):
    if language == 'python':
        driver = '/profile/control-client.py' if case == CONTROL_CASE else '/profile/python-driver.py'
        return {'driver': ['/runtime/python', '-I', '-S', driver, '--case', case],
                'adapter': ['/runtime/python', '-I', '-S', '/profile/adapter-python.py'],
                'peer': ['/runtime/python', '-I', '-S', '/profile/fixture-rpc.py', '--case', case]}[role]
    if role == 'compiler':
        return ['/runtime/node', '/profile/transpile.mjs']
    if role == 'driver':
        return ['/runtime/node', '--experimental-loader', '/profile/extension-loader.mjs', '/profile/ts-driver.mjs', '--case', case]
    if role == 'adapter':
        return ['/runtime/node', '/profile/adapter-typescript'] + list(adapter_args or [])
    return ['/runtime/node', '/profile/fixture-cli.mjs', '--case', case, '--sdk-argv-json', compact(list(adapter_args or [])),
            '--sdk-env-json', adapter_env_json]


def peer_argv(language, case):
    if language == 'python':
        return role_argv('python', 'peer', case)
    return ['/runtime/node', '/profile/fixture-cli.mjs', '--case', case, '--sdk-argv-json']


def env_json(env):
    """JSON.stringify of the adapter environment with sorted keys, as adapter-typescript passes it to the peer."""
    return compact({k: env[k] for k in sorted(env)})


# --------------------------------------------------------------------------- case plan (all 19 + diagnostics)

def ts_fixture(case):
    """F4-02: the wire reference comes from the frozen fixture (insertion order), never from the sorted fixture-cases.json."""
    row = delivered_input(case)
    return row['fixture'] if 'sdk_calls' in row else row


def frozen_wire(fx):
    if 'JSONL' in fx:
        return {'stdout': ''.join((ln if isinstance(ln, str) else json.dumps(ln, separators=(',', ':'), ensure_ascii=False)) + '\n'
                                  for ln in fx['JSONL']).encode(), 'stderr': fx['stderr'].encode()}
    if 'stdout_chunks_hex' in fx:
        return {'stdout': b''.join(bytes.fromhex(h) for h in fx['stdout_chunks_hex']), 'stderr': fx['stderr'].encode()}
    return None


# --------------------------------------------------------------------------- F4-06 exec witness (inotify, unprivileged)

class ExecWitness:
    """inotify on the host path of /profile/adapter-typescript; window = [WITNESS_WINDOW_OPEN release, CALLS_DONE]."""
    MASKS = {0x1: 'IN_ACCESS', 0x20: 'IN_OPEN', 0x10: 'IN_CLOSE_NOWRITE', 0x4000: 'IN_Q_OVERFLOW', 0x8000: 'IN_IGNORED'}

    def __init__(self, path, t0):
        import ctypes
        import struct
        self._struct = struct
        self.t0 = t0
        self.libc = ctypes.CDLL('libc.so.6', use_errno=True)
        self.path = str(path)
        st = os.stat(self.path)
        self.dev_ino = [st.st_dev, st.st_ino]
        self.fd = self.libc.inotify_init1(os.O_NONBLOCK | os.O_CLOEXEC)
        assert self.fd >= 0, 'inotify_init1 failed: %d' % ctypes.get_errno()
        self.wd = self.libc.inotify_add_watch(self.fd, self.path.encode(), 0x1 | 0x20 | 0x10)
        assert self.wd >= 0, 'inotify_add_watch failed: %d' % ctypes.get_errno()
        self.before, self.window, self.after = [], [], []
        self.state = 'before'
        self.open_ns = self.close_ns = None
        self.failure = None

    def drain(self):
        out = []
        while True:
            try:
                buf = os.read(self.fd, 65536)
            except BlockingIOError:
                return out
            i = 0
            while i < len(buf):
                _wd, mask, _cookie, ln = self._struct.unpack_from('iIII', buf, i)
                names = [v for k, v in self.MASKS.items() if mask & k] or [hex(mask)]
                if mask & 0x4000 or mask & 0x8000:
                    self.failure = 'inotify %s' % names
                out.append({'mask': names, 't_ns': time.monotonic_ns() - self.t0})
                i += 16 + ln

    def open_window(self):
        self.before += self.drain()
        self.state, self.open_ns = 'window', time.monotonic_ns() - self.t0

    def close_window(self, survivors):
        if self.state == 'window':
            self.window += self.drain()
            self.state, self.close_ns = 'closed', time.monotonic_ns() - self.t0
            self.survivors = survivors

    def record(self):
        if self.state != 'closed':
            more = self.drain()
            (self.window if self.state == 'window' else self.before).extend(more)
        else:
            self.after += self.drain()
        try:
            os.close(self.fd)
        except OSError:
            pass
        return {'path': self.path, 'dev_ino': self.dev_ino, 'window_open_ns': self.open_ns, 'window_close_ns': self.close_ns,
                'events_before': len(self.before), 'events_in_window': self.window, 'events_after': len(self.after),
                'in_open_in_window': sum(1 for e in self.window if 'IN_OPEN' in e['mask']), 'state': self.state,
                'survivors_at_calls_done': getattr(self, 'survivors', None), 'failure': self.failure, 'privilege': 'none (uid %d)' % os.getuid()}


def case_plan(case):
    spec = SPEC_CASES.get(case)
    py = case in SDK_CASES_PY or case == CONTROL_CASE or case.startswith('DIAG-PY-')
    exits = ('RELEASE_EXIT->driver after driver CALLS_DONE and adapter and peer exits witnessed by the OS (dead or zombie PID+starttime) '
             'or both absent (no frame and no process in the unit cgroup); a terminal frame alone is not enough')
    eof = ' and peer STDIN_EOF after driver CLIENT_STDIN_CLOSED (EOF-bounded interval)' if case in EOF_BARRIER else ''
    acceptance = ACC.plan(case) if spec else 'diag_checks + observer.reconcile'
    if py:
        if case in HOLD_PY:
            barriers = ['READY to each role after BEGIN identity + cgroup/PID witness',
                        'ABORT_NOW->driver after peer REQUEST_HELD and the held line fully committed by the adapter (RAW_READ+FORWARD_COMMIT)',
                        'RELEASE_REPLY->peer after driver API_CANCELLED',
                        'FINISH_PEER->peer after driver %s%s' % ('HOOK_CLOSED(turn_id=A, any closed value)' if case == '2A-PY10R' else 'DIAGNOSTIC LATE_REPLY_OBSERVED', eof),
                        exits]
        elif case == '2A-PY08':
            barriers = ['READY to each role after BEGIN identity + cgroup/PID witness',
                        'peer v2 exit frame: the peer closes stdout and exits after its script (CAP-PEER-EXIT-EARLY); no FINISH_PEER', exits]
        else:
            barriers = ['READY to each role after BEGIN identity + cgroup/PID witness',
                        'FINISH_PEER->peer after driver DIAGNOSTIC CALLS_DONE' + eof + (' (a hold=forever request is discarded by contract)' if case == '2A-PY07R' else ''),
                        exits]
        if spec:
            barriers.append('driver /proc maps sampled by the supervisor right before RELEASE_EXIT->driver (loaded-code identity)')
        driver = {'diag': 'run_diag (own constant client)', 'control': 'control-client.py (own constant client, no SDK)',
                  'sdk': 'run_sdk (frozen 2A sdk_calls, real CodexClient/Thread calls)'}['control' if case == CONTROL_CASE else ('sdk' if spec else 'diag')]
        return {'language': 'python', 'driver': driver, 'peer': 'fixture-rpc ScriptV2 (peer v2) or v1 constant rows', 'barriers': barriers,
                'acceptance_predicates': acceptance}
    fx = ts_fixture(case)
    barriers = ['READY to each role', 'STEP_RELEASE->driver after each driver STEP_WITNESS and the supervisor zero-spawn witness (no adapter or peer process in the unit cgroup)']
    if 'behavior' in fx:
        barriers.append('no reply release: the peer holds stdout; termination is the SDK (or abort) signal cascade')
    elif fx.get('no_child'):
        barriers.append('no child: the release condition is CALLS_DONE with adapter and peer absent')
    else:
        barriers.append('RELEASE_REPLY->peer after peer REQUEST_HELD (or STDIN_EMPTY with a 0-byte stdin STREAM_END) equals adapter-forwarded stdin')
        if 'stdout_chunks_hex' in fx:
            barriers.append('CHUNK_RELEASE->peer after the adapter committed every byte of chunk k (per-chunk barrier)')
        if fx.get('write_then_hold'):
            barriers.append('write_then_hold: no RELEASE_EXIT->peer; the SDK finally (child.kill) and the forwarded signal end adapter and peer')
        else:
            barriers.append('RELEASE_EXIT->peer after adapter committed exactly the peer REPLY_WRITTEN stdout/stderr byte counts')
    barriers.append(exits)
    if case in WITNESS_CASES:
        barriers.append('F4-06: inotify on the adapter executable armed before launch; window = drain at the WINDOW_OPEN release up to the drain at CALLS_DONE')
    if spec:
        barriers.append('driver /proc maps sampled by the supervisor right before RELEASE_EXIT->driver (loaded-code identity)')
    driver = 'sdkCase (frozen continuation sdk_calls, real Codex/Thread calls)' if spec else 'diagnostic (own constant code mirroring exec.ts)'
    return {'language': 'typescript', 'driver': driver, 'peer': 'fixture-cli wireFixture/hold from frozen fixture_input', 'barriers': barriers,
            'acceptance_predicates': acceptance}


# --------------------------------------------------------------------------- ledgers

def budget_take(unit, case, attempt):
    b = json.loads(BUDGET.read_text())
    if b['services_used'] >= b['services_max']:
        raise SystemExit('BLOCKED: service budget exhausted (%d/%d)' % (b['services_used'], b['services_max']))
    b['services_used'] += 1
    b['history'].append({'unit': unit, 'case': case, 'attempt': attempt, 'counted': b['services_used'], 'started_at': now_iso(), 'result': 'STARTED'})
    b['updated_at'] = now_iso()
    save_json(BUDGET, b)
    return b['services_used']


def case_take(unit, case, attempt):
    ledger = json.loads(CASE_LEDGER.read_text())
    slot = ledger['slots'][case]
    if slot['status'] != 'UNUSED':
        raise SystemExit('BLOCKED: case %s already executed once (%s); no retry' % (case, slot['status']))
    slot.update({'status': 'STARTED', 'unit': unit, 'attempt': attempt, 'started_at': now_iso()})
    ledger['used'] = sum(1 for s in ledger['slots'].values() if s['status'] != 'UNUSED')
    ledger['updated_at'] = now_iso()
    save_json(CASE_LEDGER, ledger)
    return ledger['used']


def ledger_result(kind, unit, case, result):
    if kind in ('sdk', 'control'):
        ledger = json.loads(CASE_LEDGER.read_text())
        slot = ledger['slots'][case]
        if slot.get('unit') == unit:
            slot.update({'status': 'EXECUTED', 'result': result, 'finished_at': now_iso()})
        ledger['updated_at'] = now_iso()
        save_json(CASE_LEDGER, ledger)
        return
    b = json.loads(BUDGET.read_text())
    for e in b['history']:
        if e.get('unit') == unit:
            e['result'] = result
            e['finished_at'] = now_iso()
    b['updated_at'] = now_iso()
    save_json(BUDGET, b)


# --------------------------------------------------------------------------- freezes and gates

def source_freeze_files():
    return {rel: {'bytes': (UNIT / rel).stat().st_size, 'sha256': sha_path(UNIT / rel), 'mode': oct((UNIT / rel).stat().st_mode & 0o777)}
            for rel in SOURCE_SET}


def check_source_freeze():
    assert FREEZE.exists(), 'BLOCKED: no source freeze; no service may run before FREEZE'
    raw = FREEZE.read_bytes()
    frozen = json.loads(raw)['files']
    assert sorted(frozen) == sorted(SOURCE_SET), 'freeze file set differs from SOURCE_SET'
    drift = [rel for rel, x in frozen.items() if sha_path(UNIT / rel) != x['sha256']]
    assert not drift, 'source identity drift since freeze: %s' % drift
    return {'path': FREEZE.name, 'sha256': sha_bytes(raw)}


def tree_manifest(root):
    """Closed regular-file tree manifest; refuses symlinks and special files."""
    out = {}
    for top, dirs, names in os.walk(root, followlinks=False):
        dirs.sort()
        for d in dirs:
            assert not os.path.islink(os.path.join(top, d)), 'symlinked directory in tree: %s' % d
        for n in sorted(names):
            p = Path(top) / n
            st = os.lstat(p)
            assert stat.S_ISREG(st.st_mode), 'non-regular file in tree: %s' % p
            out[str(p.relative_to(root))] = {'bytes': st.st_size, 'sha256': sha_path(p)}
    return out


def spec_hashes():
    got = {n: sha_path(SPEC / n) for n in SPEC_SHA}
    assert got == SPEC_SHA, 'approved spec inputs drifted: %s' % [n for n in SPEC_SHA if got[n] != SPEC_SHA[n]]
    return got


def check_identity_freeze():
    assert IDENTITY.exists(), 'BLOCKED: no identity freeze r3 (ADMIT not completed)'
    raw = IDENTITY.read_bytes()
    ident = json.loads(raw)
    assert ident['status'] == 'ADMITTED_AND_FROZEN', 'identity freeze status'
    assert ident['source_freeze']['sha256'] == sha_bytes(FREEZE.read_bytes()), 'identity freeze binds another source freeze'
    assert tree_manifest(SDK_PY_TREE) == ident['trees']['sdk-python'], 'sdk-python tree drift'
    assert tree_manifest(PY_DEPS_TREE) == ident['trees']['python-deps'], 'python-deps tree drift'
    assert sha_path(TS_TREE / TYPESCRIPT_JS[0]) == TYPESCRIPT_JS[1], 'typescript.js drift'
    assert ts_source_hashes() == ident['ts_sources'], 'TypeScript source drift'
    assert spec_hashes() == ident['spec_inputs'], 'spec inputs binding'
    for name, (path, digest) in HOST.items():
        assert ident['host'][name] == [path, digest], 'host identity binding'
    return {'path': IDENTITY.name, 'sha256': sha_bytes(raw)}


def check_emit_record():
    """The admission's sealed emit is reused: same ten .ts sources, same transpile profile, same bytes (no recompilation)."""
    assert EMIT_RECORD.exists(), 'BLOCKED: no sealed emit record of the admission'
    raw = EMIT_RECORD.read_bytes()
    rec = json.loads(raw)
    assert rec['status'] == 'EMITTED_SEALED' and rec['identity_freeze_sha256'] == ADMISSION_IDENTITY_SHA, 'emit record binding'
    assert sha_path(ADMISSION_IDENTITY) == ADMISSION_IDENTITY_SHA, 'admission identity freeze drift'
    assert json.loads(ADMISSION_IDENTITY.read_text())['ts_sources'] == ts_source_hashes(), 'TS sources differ from the admitted emit'
    want = dict(rec['files'])
    want['package.json'] = rec['package_json_sha256']
    got = {k: v['sha256'] for k, v in tree_manifest(EMITTED).items()}
    assert got == want, 'emitted tree drift'
    return {'path': str(EMIT_RECORD.relative_to(G02)), 'sha256': sha_bytes(raw), 'files': rec['files']}


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
                'state': stat_.rsplit(')', 1)[1].split()[0],
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
    """Same PID+starttime still running. A zombie (Z) or dead (X) entry has already exited: exit witnessed."""
    if not info:
        return False
    cur = proc_info(info['host_pid'])
    return cur is not None and cur['starttime'] == info['starttime'] and cur.get('state') not in ('Z', 'X')


def environ_of(info):
    """Initial environment of a witnessed role process (PTRACE_MODE_READ, same uid). Synthetic values only."""
    try:
        raw = Path('/proc/%d/environ' % info['host_pid']).read_bytes()
    except OSError as exc:
        return {'error': str(exc)[:200]}
    if not alive(info):
        return {'error': 'process identity changed before environ read'}
    env = {}
    for item in raw.split(b'\0'):
        if item:
            k, _, v = item.partition(b'=')
            env[k.decode('utf-8', 'replace')] = v.decode('utf-8', 'replace')[:200]
    return env


def parse_maps(text):
    """File-backed mappings of /proc/PID/maps as {(path, dev, inode): perms}; anonymous (inode 0) skipped."""
    out = {}
    for line in text.splitlines():
        parts = line.split(None, 5)
        if len(parts) < 5:
            continue
        perms, dev, inode = parts[1], parts[3], parts[4]
        path = parts[5].strip() if len(parts) == 6 else ''
        if inode == '0':
            continue
        out.setdefault((path, dev, inode), set()).add(perms)
    return out


def classify_mappings(mappings, roots, language):
    """Each file-backed mapping must be an allowed read-only root by (dev, inode) equality. Returns (entries, unknown)."""
    entries, unknown = [], []
    for (path, dev, inode), perms in sorted(mappings.items()):
        rec = {'path': path, 'dev': dev, 'inode': inode, 'perms': sorted(perms)}
        if language == 'typescript' and path.startswith('/memfd:'):
            rec['class'] = 'ANONYMOUS_MEMFD_JIT'
            entries.append(rec)
            continue
        if path.startswith('anon_inode:') and not any('x' in p for p in perms):
            # Kernel object shared with the process (e.g. libuv io_uring rings): no file root, never executable.
            rec['class'] = 'ANONYMOUS_KERNEL_OBJECT_NO_EXEC'
            entries.append(rec)
            continue
        if path.endswith('(deleted)') or not path.startswith('/'):
            rec['class'] = 'UNKNOWN'
            unknown.append(rec)
            entries.append(rec)
            continue
        candidates = []
        for sandbox, host in roots:
            if sandbox.endswith('/') and path.startswith(sandbox):
                candidates.append(host + path[len(sandbox):])
            elif path == sandbox:
                candidates.append(host)
            if (host.endswith('/') and path.startswith(host)) or path == host:
                candidates.append(path)
        match = None
        for c in candidates:
            try:
                st = os.stat(c)
            except OSError:
                continue
            want = '%02x:%02x' % (os.major(st.st_dev), os.minor(st.st_dev))
            if st.st_ino == int(inode) and want == dev.lower():
                match = c
                break
        rec['class'] = 'ALLOWED_RO_ROOT' if match else 'UNKNOWN'
        rec['host_path'] = match
        entries.append(rec)
        if not match:
            unknown.append(rec)
    return entries, unknown


# --------------------------------------------------------------------------- staging

def stage_tree(src, dst):
    """Copy a closed regular-file tree (no symlink/special file) into the attempt profile."""
    for rel in tree_manifest(src):
        q = dst / rel
        q.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(src / rel, q)


def seal_profile(prof):
    """Files 0444 (top-level adapter-typescript 0555), directories 0555; symlinks untouched."""
    for top, dirs, names in os.walk(prof, topdown=False, followlinks=False):
        for n in names:
            p = Path(top) / n
            if p.is_symlink():
                continue
            os.chmod(p, 0o555 if (p.name == 'adapter-typescript' and p.parent == prof) else 0o444)
        for d in dirs:
            p = Path(top) / d
            if not p.is_symlink():
                os.chmod(p, 0o555)
    os.chmod(prof, 0o555)


def profile_files(prof, unbound=()):
    out = {}
    for top, dirs, names in os.walk(prof, followlinks=False):
        dirs.sort()
        for n in sorted(names):
            p = Path(top) / n
            if p.is_symlink():
                continue
            key = '/profile/' + str(p.relative_to(prof))
            if key == '/profile/admission.json' or key in unbound:
                continue
            out[key] = sha_path(p)
    return out


# --------------------------------------------------------------------------- attempt

class Attempt:
    def __init__(self, case):
        if case in DIAG:
            self.kind, self.spec = 'diag', DIAG[case]
        elif case in SDK_CASES_PY or case in SDK_CASES_TS:
            self.kind = 'sdk'
            self.spec = {'language': SPEC_CASES[case]['language'], 'deadline': 30, 'expect': None, 'action': None}
        elif case == CONTROL_CASE:
            self.kind, self.spec = 'control', {'language': 'python', 'deadline': 30, 'expect': 'MISMATCH', 'action': None}
        else:
            raise ValueError('unknown case %r' % case)
        self.case = case
        self.language = self.spec['language']
        self.attempt = secrets.token_hex(20)
        self.nonce = secrets.token_hex(20)
        self.unit = '%s%s-%s.service' % (UNIT_PREFIX, self.attempt[:12], case.lower())
        self.dir = ATTEMPTS / (self.attempt[:12] + '-' + case)
        self.evidence = DIAG_DIR / (self.attempt[:12] + '-' + case) if self.kind == 'diag' else CASES_DIR / (case + '-' + self.attempt[:12])
        self.step_witness = []
        self.chunk_released = set()
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
        self.signal_sent_ns = None
        self.service_bytes = {'stdout': 0, 'stderr': 0}
        self.budget_hit = False
        self.launched = False
        self.maps = None
        self.maps_raw = None
        self.adapter_environ = None
        self.exec_witness = None
        self.controls = {}
        self.logs = {}
        self.t0 = time.monotonic_ns()

    def act(self, name, **detail):
        self.actions.append({'t_ns': time.monotonic_ns() - self.t0, 'action': name, 'detail': detail})

    # ----------------------------------------------------------------- preparation
    def prepare(self):
        for name, (path, digest) in HOST.items():
            assert sha_path(path) == digest, 'host identity drift: ' + name
        self.freeze = check_source_freeze()
        spec_hashes()
        self.identity = check_identity_freeze() if self.kind in ('sdk', 'control') else None
        self.emit = check_emit_record() if (self.kind == 'sdk' and self.language == 'typescript') else None
        if self.case == 'DIAG-PY-STAGE':
            assert tree_manifest(SDK_PY_TREE) and tree_manifest(PY_DEPS_TREE), 'staged data trees missing'
        ATTEMPTS.mkdir(mode=0o700, exist_ok=True)
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
        for name in sources:
            origin = (HERE / name) if name == 'bootstrap.py' else (src_dir / name)
            shutil.copyfile(origin, prof / name)
        if self.case == CONTROL_CASE:
            os.remove(prof / 'python-driver.py')  # the CONTROL driver role is control-client.py; no SDK driver in its profile
        elif self.language == 'python':
            os.remove(prof / 'control-client.py')
        unbound = ()
        if self.language == 'typescript':
            shutil.copyfile(HERE / 'bootstrap.py', prof / 'bootstrap.py')
            (prof / 'package.json').write_bytes((UNIT / 'profile-templates' / 'package.json').read_bytes())
            (prof / 'node-loader.json').write_text(compact(node_loader_json(self.emit['files'] if self.emit else None)) + '\n')
            (prof / 'node-transpile.json').write_text(compact(node_transpile_json()) + '\n')
        if (self.kind == 'sdk' and self.language == 'python') or self.case == 'DIAG-PY-STAGE':
            stage_tree(SDK_PY_TREE, prof / 'sdk-python')
            stage_tree(PY_DEPS_TREE, prof / 'python-deps')
        if self.case == 'DIAG-PY-STAGE':
            # Constant negative controls for the closure check: one unbound extra file and one symlink.
            (prof / 'sdk-drift-extra').mkdir()
            (prof / 'sdk-drift-extra' / 'bound.txt').write_text('constant bound file\n')
            (prof / 'sdk-drift-extra' / 'unbound.txt').write_text('constant unbound file\n')
            (prof / 'sdk-drift-link').mkdir()
            (prof / 'sdk-drift-link' / 'bound.txt').write_text('constant bound file\n')
            os.symlink('bound.txt', prof / 'sdk-drift-link' / 'link.txt')
            unbound = ('/profile/sdk-drift-extra/unbound.txt',)
        if self.kind == 'sdk' and self.language == 'typescript':
            stage_tree(EMITTED, prof / 'sdk-emitted')
        (prof / 'fixture-cases.json').write_bytes(fixture_bytes())
        case_input = delivered_input(self.case)
        self.case_input_sha256 = sha_bytes(compact(case_input).encode('utf-8'))  # F4-01 supervisor witness, before READY
        if self.case in SPEC_CASES:
            assert self.case_input_sha256 == SPEC_CASES[self.case]['case_input_sha256'], 'delivered case_input differs from the frozen bytes'
        self.config = {'attempt': self.attempt, 'case': self.case, 'nonce': self.nonce, 'language': self.language,
                       'deadline_seconds': self.spec['deadline'], 'fifo_root': '/observer', 'fifo_nodes': list(NAMES),
                       'fifo_stat': self.fifo_stat, 'peer_argv': peer_argv(self.language, self.case),
                       'case_input': case_input,
                       'mode': {'diag': 'diagnostic', 'sdk': 'sdk', 'control': 'control'}[self.kind]}
        (prof / 'adapter-config.json').write_text(compact(self.config) + '\n')
        self.files = profile_files(prof, unbound)
        self.admission = {'v': 1, 'attempt': self.attempt, 'case': self.case, 'nonce': self.nonce, 'language': self.language,
                          'runtime_sha256': HOST['python' if self.language == 'python' else 'node'][1], 'files': self.files,
                          'fifo_pipe_buf': self.pipe_buf, 'containment_admitted': True, 'sdk_admitted': self.kind == 'sdk',
                          'compiler_admitted': False}
        (prof / 'admission.json').write_text(compact(self.admission) + '\n')
        seal_profile(prof)
        assert profile_files(prof, unbound) == self.files, 'profile changed while sealing'
        self.expect = {}
        for role, src in ROLE_SOURCE[self.language].items():
            if role == 'driver' and self.case == CONTROL_CASE:
                src = 'control-client.py'
            self.expect[role] = {'attempt': self.attempt, 'case': self.case, 'nonce': self.nonce, 'source_sha256': self.files['/profile/' + src]}
        self.logs = {role: OBS.RoleLog(role, self.expect[role]) for role in self.expect}
        self.exe = {lang: os.stat(HOST[lang][0]) for lang in ('python', 'node')}
        if self.case in WITNESS_CASES:
            self.exec_witness = ExecWitness(prof / 'adapter-typescript', self.t0)
            self.act('EXEC_WITNESS_ARMED', path=self.exec_witness.path, dev_ino=self.exec_witness.dev_ino)

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
        main = role_argv(self.language, 'driver', self.case)
        bw += ['--remount-ro', '/', '--', '/runtime/python', '-I', '-S', '/profile/bootstrap.py'] + main
        cmd = ['/usr/bin/systemd-run', '--user', '--quiet', '--unit', self.unit, '--wait', '--pipe', '--collect']
        for k, v in PROPS.items():
            cmd += ['--property', '%s=%s' % (k, v)]
        uid = os.getuid()
        env = {'PATH': '/usr/bin:/bin', 'HOME': str(Path.home()), 'LANG': 'C.UTF-8', 'XDG_RUNTIME_DIR': '/run/user/%d' % uid,
               'DBUS_SESSION_BUS_ADDRESS': 'unix:path=/run/user/%d/bus' % uid}
        return cmd + ['--'] + bw, env

    def map_roots(self):
        return [('/runtime/python', HOST['python'][0]), ('/runtime/node', HOST['node'][0]),
                ('/usr/lib64/ld-linux-x86-64.so.2', '/usr/lib/x86_64-linux-gnu/ld-linux-x86-64.so.2'),
                ('/usr/lib/python3.12/', '/usr/lib/python3.12/'), ('/usr/lib/x86_64-linux-gnu/', '/usr/lib/x86_64-linux-gnu/'),
                ('/usr/lib/locale/', '/usr/lib/locale/'), ('/profile/', str(self.dir / 'profile') + '/')]

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
                env = self.adapter_environ if isinstance(self.adapter_environ, dict) and 'error' not in self.adapter_environ else {}
                ok = found['cmdline'] == role_argv('typescript', 'peer', self.case, getattr(self, 'adapter_args', None), env_json(env))
            else:
                ok = found['cmdline'] == role_argv(self.language, role, self.case)
            if not ok:
                problems.append('cmdline differs from frozen argv: %r' % found['cmdline'])
            if found.get('net_ns') == self.host_netns:
                problems.append('role shares the host network namespace')
            parent = {'adapter': 'driver', 'peer': 'adapter'}.get(role)
            if parent and (parent not in self.role_host or self.role_host[parent]['host_pid'] != found['ppid']):
                problems.append('%s parent is not the witnessed %s' % (role, parent))
            if role == 'adapter':
                self.adapter_environ = environ_of(found)
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

    def maps_witness(self, role):
        info = self.role_host.get(role)
        out = {'role': role, 'ok': False, 'entries': [], 'unknown': []}
        if not alive(info):
            out['error'] = 'process not alive'
            return out
        try:
            text = Path('/proc/%d/maps' % info['host_pid']).read_text()
        except OSError as exc:
            out['error'] = str(exc)[:200]
            return out
        if not alive(info):
            out['error'] = 'process identity changed during maps read'
            return out
        self.maps_raw = text
        out['entries'], out['unknown'] = classify_mappings(parse_maps(text), self.map_roots(), self.language)
        out['ok'] = bool(out['entries']) and not out['unknown']
        return out

    # ----------------------------------------------------------------- control
    def send(self, role, command, tag=None):
        key = '%s->%s' % (command, role) + ('' if tag is None else '#%s' % tag)
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
        self.act('CONTROL', role=role, command=command, seq=obj['seq'], tag=tag)

    def role_processes(self):
        """Cgroup members by role, from /proc cmdline (independent of the role frames)."""
        out = {'adapter': [], 'peer': []}
        for m in self.members():
            cmd = m.get('cmdline') or []
            if '/profile/adapter-typescript' in cmd or '/profile/adapter-python.py' in cmd:
                out['adapter'].append(m['host_pid'])
            elif '/profile/fixture-cli.mjs' in cmd or '/profile/fixture-rpc.py' in cmd:
                out['peer'].append(m['host_pid'])
        return out

    def exited_or_absent(self, role, procs):
        """Exit witnessed by the OS, or the role never produced a frame and no process of that role is in the cgroup."""
        if role in self.role_host:
            return self.role_exited(role)
        return not self.logs[role].events and not self.logs[role].raw_bytes and not procs[role]

    def release_driver(self):
        if 'RELEASE_EXIT->driver' not in self.done:
            self.maps = self.maps_witness('driver')
            self.act('MAPS_SAMPLED', role='driver', ok=self.maps['ok'], unknown=len(self.maps['unknown']))
        self.send('driver', 'RELEASE_EXIT')

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

    def case_bytes(self):
        return (sum(log.raw_bytes for log in self.logs.values()) + sum(len(v) for v in self.controls.values())
                + sum(self.service_bytes.values()))

    def role_done(self, role):
        """Terminal frame (END/INVALID) or independently witnessed exit; a SIGNAL frame alone is not enough."""
        log = self.logs[role]
        return log.terminal is not None or self.role_exited(role)

    def role_exited(self, role):
        """Exit witnessed by the OS (process gone or zombie with the same PID+starttime)."""
        return role in self.role_host and not alive(self.role_host[role])

    def advance(self):
        self.sample_peaks()
        L = self.logs
        d, a, p = L['driver'], L['adapter'], L['peer']
        case = self.case
        if self.admission_fail:
            return
        if self.language == 'python':
            hold = case in HOLD_PY
            held = p.kinds('REQUEST_HELD')
            if hold and held and not self.role_done('driver'):
                lines, _ = OBS.lines_of(a.committed_bytes('stdin'))
                hd = held[0]['data']
                if any(len(x) == hd['bytes'] and OBS.h(x) == hd['sha256'] for x in lines):
                    self.send('driver', 'ABORT_NOW')
            if hold and 'ABORT_NOW->driver' in self.done and d.kinds('API_CANCELLED'):
                self.send('peer', 'RELEASE_REPLY')
            finished = ([e for e in d.kinds('HOOK_CLOSED') if e['data'].get('turn_id') == 'A'] if case == '2A-PY10R'
                        else d.milestones('LATE_REPLY_OBSERVED') if hold else d.milestones('CALLS_DONE'))
            if case in EOF_BARRIER:
                finished = finished and d.milestones('CLIENT_STDIN_CLOSED') and p.milestones('STDIN_EOF')
            if finished and not self.role_done('peer'):
                self.send('peer', 'FINISH_PEER')
            if (d.milestones('CALLS_DONE') or d.milestones('LATE_REPLY_OBSERVED')) and self.role_exited('adapter') \
                    and self.role_exited('peer') and not self.role_done('driver'):
                self.release_driver()
            return
        # TypeScript
        fx = self.config['case_input'].get('fixture') if 'sdk_calls' in self.config['case_input'] else self.config['case_input']
        fx = fx or {}
        for ev in d.events:
            if ev['kind'] == 'DIAGNOSTIC' and ev['data']['milestone'] == 'STEP_WITNESS':
                step = ev['data']['detail']['step']
                if 'STEP_RELEASE->driver#%s' % step not in self.done:
                    procs = self.role_processes()
                    w = {'step': step, 'kind': ev['data']['detail']['kind'], 'adapter_processes': len(procs['adapter']),
                         'peer_processes': len(procs['peer']), 'adapter_frames': len(a.events), 'peer_frames': len(p.events)}
                    if w['kind'] == 'WINDOW_OPEN':
                        # F4-06/F4-12: drain and discard before the release; the window starts at the release.
                        if self.exec_witness is None:
                            self.admission_fail.append('WINDOW_OPEN without an armed exec witness')
                        else:
                            self.exec_witness.open_window()
                    self.step_witness.append(w)
                    self.act('STEP_WITNESS', **w)
                    self.send('driver', 'STEP_RELEASE', tag=step)
        if self.exec_witness is not None and self.exec_witness.state == 'window' and d.milestones('CALLS_DONE'):
            procs = self.role_processes()
            self.exec_witness.close_window({'adapter': len(procs['adapter']), 'peer': len(procs['peer'])})
            self.act('EXEC_WITNESS_WINDOW_CLOSED', in_open=sum(1 for e in self.exec_witness.window if 'IN_OPEN' in e['mask']))
        hold = 'behavior' in fx
        held = p.kinds('REQUEST_HELD')
        empty = p.milestones('STDIN_EMPTY')
        stdin_end = a.stream_end.get('stdin')
        forwarded = bool(stdin_end and ((held and held[0]['data']['bytes'] == stdin_end['committed_bytes']
                                         and held[0]['data']['sha256'] == OBS.h(a.committed_bytes('stdin')))
                                        or (empty and stdin_end['committed_bytes'] == 0)))
        if forwarded and not hold:
            self.send('peer', 'RELEASE_REPLY')
        wrote_abort = p.milestones('REPLY_WRITTEN')
        if (case == 'DIAG-TS-ABORT' and forwarded and 'READY->adapter' in self.done and 'READY->peer' in self.done and alive(self.role_host.get('peer'))
                and wrote_abort and a.committed['stdout'] == wrote_abort[0]['detail']['stdout_bytes']):
            self.send('driver', 'ABORT_NOW')  # r4: after the JSONL objects were relayed, so the signal path checks a non-empty prefix
        chunks = [m['detail'] for m in p.milestones('CHUNK_WRITTEN')]
        total = 0
        for c in chunks:
            total += c['bytes']
            if c['index'] + 1 < len(fx.get('stdout_chunks_hex', [])) and a.committed['stdout'] >= total and c['index'] not in self.chunk_released:
                self.chunk_released.add(c['index'])
                self.send('peer', 'CHUNK_RELEASE', tag=c['index'])
        wrote = p.milestones('REPLY_WRITTEN')
        if wrote and not self.role_done('peer') and not fx.get('write_then_hold'):
            w = wrote[0]['detail']
            if a.committed['stdout'] == w['stdout_bytes'] and a.committed['stderr'] == w['stderr_bytes']:
                self.send('peer', 'RELEASE_EXIT')
        if d.milestones('CALLS_DONE') and not self.role_done('driver'):
            procs = self.role_processes()
            if self.exited_or_absent('adapter', procs) and self.exited_or_absent('peer', procs):
                self.release_driver()

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
        try:
            return self._run()
        except Exception as exc:  # noqa: BLE001 - every supervisor failure still stops the unit and records a verdict
            return self.abort(exc)

    def abort(self, exc):
        self.act('SUPERVISOR_EXCEPTION', error=('%s: %s' % (type(exc).__name__, exc))[:400])
        stop = None
        if self.launched:
            try:
                stop = self.systemctl('kill', '--signal=SIGKILL', self.unit, timeout=10).returncode
            except Exception as e2:  # noqa: BLE001
                stop = repr(e2)[:200]
            proc = getattr(self, 'proc', None)
            if proc is not None:
                try:
                    proc.wait(timeout=10)
                except Exception:  # noqa: BLE001
                    proc.kill()
        cg_removed = self.cgroup is None or not self.cgroup.exists()
        result = {'kind': self.result_kind(), 'case': self.case, 'unit': self.unit, 'attempt': self.attempt,
                  'verdict': 'INVALID_CAPTURE', 'outcome': 'INVALID_CAPTURE' if self.kind == 'sdk' else None,
                  'status': 'SUPERVISOR_ERROR', 'reasons': ['supervisor exception: %s' % self.actions[-1]['detail']['error']],
                  'launched': self.launched, 'os_checks': {'cgroup_removed_or_empty': cg_removed},
                  'role_status': {r: log.status() for r, log in self.logs.items()},
                  'stop_rc': stop, 'actions': self.actions, 'elapsed_ns': time.monotonic_ns() - self.t0,
                  'functional_receipts': 0, 'observed_at': now_iso()}
        self.evidence.mkdir(parents=True, exist_ok=True)
        save_json(self.evidence / 'result.json', result)
        if self.launched:
            ledger_result(self.kind, self.unit, self.case, 'SUPERVISOR_ERROR/INVALID_CAPTURE')
        return result

    def result_kind(self):
        return {'diag': 'CONSTANT_DIAGNOSTIC_NOT_SDK_EXECUTION', 'control': 'CONTROL_KNOWN_BAD_REACH_NOT_SDK_OBSERVATION',
                'sdk': 'SDK_CLIENT_OBSERVATION_REFERENCE_PROFILE_NOT_PARITY_RECEIPT'}[self.kind]

    def write_preamble(self, cmd, env):
        ev = self.evidence
        ev.mkdir(parents=True, exist_ok=False)
        save_json(ev / 'command.json', {'unit': self.unit, 'attempt': self.attempt, 'case': self.case, 'kind': self.kind, 'argv': cmd,
                                        'source_freeze': self.freeze, 'identity_freeze': self.identity,
                                        'emit_record': None if self.emit is None else {k: self.emit[k] for k in ('path', 'sha256')},
                                        'load_wait': getattr(self, 'load_wait', None),
                                        'env_keys': sorted(env), 'service_properties': PROPS, 'fifo_stat': self.fifo_stat,
                                        'pipe_buf': self.pipe_buf, 'runtime_dir': str(self.dir), 't0_monotonic_ns': str(self.t0)})
        (ev / 'profile').mkdir()
        for name in ('adapter-config.json', 'admission.json', 'node-loader.json', 'node-transpile.json', 'package.json'):
            if (self.dir / 'profile' / name).exists():
                shutil.copyfile(self.dir / 'profile' / name, ev / 'profile' / name)
        save_json(ev / 'profile-manifest.json', {'files': self.files, 'admission_sha256': sha_path(self.dir / 'profile' / 'admission.json'),
                                                 'admission': {k: v for k, v in self.admission.items() if k != 'files'},
                                                 'config_sha256': self.files['/profile/adapter-config.json'],
                                                 'case_plan': case_plan(self.case), 'spec': self.spec})

    def take_budget(self):
        if self.kind in ('sdk', 'control'):
            n = case_take(self.unit, self.case, self.attempt)
            self.act('LAUNCH', case_slots_used=n)
        else:
            n = budget_take(self.unit, self.case, self.attempt)
            self.act('LAUNCH', services_used=n)

    def wait_load(self):
        """Load average above LOAD_LIMIT: wait before starting the service and record it (not a retry)."""
        t = time.monotonic()
        samples = []
        while os.getloadavg()[0] > LOAD_LIMIT:
            samples.append(round(os.getloadavg()[0], 2))
            time.sleep(15)
        self.load_wait = {'waited_s': round(time.monotonic() - t, 1), 'samples_above_limit': samples[:40],
                          'loadavg_at_start': [round(x, 2) for x in os.getloadavg()], 'limit': LOAD_LIMIT}

    def _run(self):
        self.wait_load()
        self.prepare()
        cmd, env = self.command()
        self.write_preamble(cmd, env)
        self.take_budget()
        self.launched = True
        proc = subprocess.Popen(cmd, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env, start_new_session=True)
        self.proc = proc
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
                    else:
                        name = open_streams[fd]
                        self.service_bytes[name] += len(b)  # counted in full; never silently truncated
                        if len(out[name]) < SERVICE_OUTPUT_CAP:
                            out[name] += b[:SERVICE_OUTPUT_CAP - len(out[name])]
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
            if not self.budget_hit and self.case_bytes() > CASE_ARTIFACTS:
                self.budget_hit = True
                c = self.systemctl('kill', '--signal=SIGKILL', self.unit)
                self.act('CASE_ARTIFACT_BUDGET_KILL', bytes=self.case_bytes(), rc=c.returncode)
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
            'driver_exit_zero': rc == 0,
            'case_artifact_budget': not self.budget_hit and self.case_bytes() <= CASE_ARTIFACTS,
            'service_output_within_cap': all(v <= SERVICE_OUTPUT_CAP for v in self.service_bytes.values()),
        }
        wire = frozen_wire(ts_fixture(self.case)) if self.language == 'typescript' else None
        verdict, reasons, facts = OBS.reconcile(self.logs, self.language, {'checks': checks}, wire, self.signal_sent_ns)
        exec_witness = self.exec_witness.record() if self.exec_witness is not None else None
        ev = self.evidence
        for r, log in self.logs.items():
            (ev / ('events-%s.bin' % r)).write_bytes(bytes(log.raw))
            (ev / ('events-%s.jsonl' % r)).write_text(''.join(compact(e) + '\n' for e in log.events))
            # R2-F02: receive instant of every accepted frame (supervisor monotonic ns since t0), aligned with the jsonl.
            (ev / ('events-%s.recv.jsonl' % r)).write_text(''.join(compact({'seq': e['seq'], 'kind': e['kind'], 'recv_ns': rn}) + '\n'
                                                                   for e, rn in zip(log.events, log.recv_ns)))
        for r, frames in self.controls.items():
            (ev / ('controls-%s.bin' % r)).write_bytes(bytes(frames))
        (ev / 'service-stdout.txt').write_bytes(bytes(out['stdout']))
        (ev / 'service-stderr.txt').write_bytes(bytes(out['stderr']))
        if self.maps_raw is not None:
            (ev / 'maps-driver.txt').write_text(self.maps_raw)
        cfg_copy = json.loads((ev / 'profile' / 'adapter-config.json').read_text())
        witness = {'os_checks': checks, 'maps': self.maps, 'adapter_environ': self.adapter_environ,
                   'adapter_cmdline': (self.role_host.get('adapter') or {}).get('cmdline'),
                   'adapter_pid': (self.role_host.get('adapter') or {}).get('host_pid'),
                   'exec_witness': exec_witness, 'case_input_sha256_supervisor': self.case_input_sha256,
                   'case_input_sha256_recomputed': sha_bytes(compact(cfg_copy['case_input']).encode('utf-8')),
                   'control_actions': [x for x in self.actions if x['action'] == 'CONTROL'],
                   'step_witness': list(self.step_witness), 'role_mapped': sorted(self.role_host),
                   'signal_sent_ns': self.signal_sent_ns, 'timed_out': timed_out}
        result = {'kind': self.result_kind(), 'case': self.case, 'unit': self.unit, 'attempt': self.attempt,
                  'language': self.language, 'verdict': verdict, 'reasons': reasons, 'facts': facts, 'os_checks': checks,
                  'role_status': {r: log.status() for r, log in self.logs.items()},
                  'role_violation': {r: log.violation for r, log in self.logs.items()},
                  'role_host': self.role_host, 'adapter_environ': self.adapter_environ, 'maps_witness': self.maps,
                  'cgroup_limits': getattr(self, 'limits', None), 'cgroup_peaks_sampled': self.peaks,
                  'service_before': self.service, 'service_after': after, 'cgroup_events_after': cg_events, 'systemd_run_rc': rc,
                  'actions': self.actions, 'frames': {r: len(log.events) for r, log in self.logs.items()},
                  'raw_frame_bytes': {r: log.raw_bytes for r, log in self.logs.items()},
                  'case_artifact_bytes': self.case_bytes(), 'service_output_bytes': self.service_bytes, 'signal_sent_ns': self.signal_sent_ns,
                  'step_witness': list(self.step_witness), 'timed_out': timed_out, 'exec_witness': exec_witness,
                  'case_input_sha256_supervisor': self.case_input_sha256, 'wire_check': facts.get('wire_check'),
                  't0_monotonic_ns': str(self.t0), 'source_freeze': self.freeze, 'identity_freeze': self.identity,
                  'elapsed_ns': time.monotonic_ns() - self.t0, 'functional_receipts': 0, 'observed_at': now_iso()}
        if self.kind == 'diag':
            self.facts = facts
            self.exec_record = exec_witness
            diag_checks = self.diag_checks(verdict)
            status = 'DIAG_PASS' if verdict == self.spec['expect'] and all(diag_checks.values()) else 'DIAG_FAIL'
            result.update({'expected_verdict': self.spec['expect'], 'status': status, 'diag_checks': diag_checks,
                           'SDK_imports': 0, 'compiler_imports': 0})
            save_json(ev / 'result.json', result)
            ledger_result(self.kind, self.unit, self.case, '%s/%s' % (status, verdict))
            return result
        acceptance = ACC.evaluate(self.case, self.logs, verdict, reasons, witness, self.config['case_input'])
        save_json(ev / 'acceptance.json', acceptance)
        result.update({'outcome': acceptance['outcome'], 'status': 'EXECUTED_ONCE', 'acceptance': 'acceptance.json',
                       'SDK_runtime': 'RUN_ONCE_CONTAINED' if self.kind == 'sdk' else 'NOT_IN_THIS_SERVICE (control client, no SDK)',
                       'compiler_runtime': 'NOT_IN_THIS_SERVICE', 'parity_credit': 0})
        save_json(ev / 'result.json', result)
        ledger_result(self.kind, self.unit, self.case, '%s/%s' % (acceptance['outcome'], verdict))
        return result

    def diag_checks(self, verdict):
        d, a, p = self.logs['driver'], self.logs['adapter'], self.logs['peer']
        c = {}
        case = self.case
        order = [x['detail'].get('command') + '->' + x['detail'].get('role') for x in self.actions if x['action'] == 'CONTROL']
        if case in EOF_BARRIER:
            c['eof_barrier'] = ACC.eof_barrier_ok(self.logs, [x for x in self.actions if x['action'] == 'CONTROL'])
        # F4-01: every role that emitted BEGIN reports the supervisor's sha of the delivered case_input.
        role_shas = {r: self.logs[r].case_input_sha256 for r in ('driver', 'adapter', 'peer') if self.logs[r].events}
        c['case_input_role_witness'] = bool(role_shas) and all(v == self.case_input_sha256 for v in role_shas.values())
        if case == 'DIAG-PY-RPC':
            ct = d.milestones('CONTAINMENT')
            c['containment_selfcheck'] = bool(ct) and ct[0]['detail'].get('private_write') == 'PASS'
            seq = [x for x in order if not x.startswith('READY')]
            c['barrier_order'] = seq == ['ABORT_NOW->driver', 'RELEASE_REPLY->peer', 'FINISH_PEER->peer', 'RELEASE_EXIT->driver']
            c['cancel_witness'] = bool(d.kinds('API_CANCELLED')) and bool(d.milestones('LATE_REPLY_OBSERVED'))
            own = d.milestones('OWN_CLIENT_CLOSED')
            c['own_client_exit_0'] = bool(own) and own[0]['detail']['returncode'] == 0
        elif case == 'DIAG-PY-STAGE':
            st = d.milestones('STAGE_ADMISSION')
            det = st[0]['detail'] if st else {}
            c['staged_trees_sealed'] = det.get('sdk-python', 0) > 0 and det.get('python-deps', 0) > 0
            c['negatives_refused'] = all(det.get(k) == 'REFUSED' for k in ('hash_drift', 'unbound_extra_file', 'symlink', 'sdk_gate_closed'))
            c['no_target_module_loaded'] = det.get('target_modules_loaded') == []
            own = d.milestones('OWN_CLIENT_CLOSED')
            c['own_client_exit_0'] = bool(own) and own[0]['detail']['returncode'] == 0
        elif case in ('DIAG-PY-LARGE',):
            own = d.milestones('OWN_CLIENT_CLOSED')
            c['large_reply_relayed'] = a.committed['stdout'] > 150000 and bool(own) and own[0]['detail']['returncode'] == 0
        elif case == 'DIAG-PY-TERM':
            own = d.milestones('OWN_CLIENT_CLOSED')
            c['adapter_signal_and_incomplete_end'] = a.signal == 'SIGTERM' and a.terminal == 'END'
            c['adapter_died_by_sigterm'] = bool(own) and own[0]['detail']['returncode'] == -15
            c['peer_received_forwarded_signal'] = p.signal == 'SIGTERM'
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
            c['final_barrier'] = 'RELEASE_EXIT->driver' in order
        elif case == 'DIAG-TS-LARGE':
            own = d.milestones('OWN_FIXTURE_CHILD_CLOSED')
            c['large_stdout_relayed'] = bool(own) and own[0]['detail']['stdout_bytes'] == 180003 and a.committed['stdout'] == 180003
            c['final_barrier'] = 'RELEASE_EXIT->driver' in order
        elif case == 'DIAG-TS-ABORT':
            own = d.milestones('OWN_FIXTURE_CHILD_CLOSED')
            c['abort_after_witnesses'] = 'ABORT_NOW->driver' in order
            # F4-02 under a signal: the committed JSONL objects are a (here complete) prefix of the frozen bytes.
            c['signal_wire_prefix_checked'] = self.facts.get('wire_check') == 'PREFIX' and a.committed['stdout'] > 0
            c['adapter_signal_and_incomplete_end'] = a.signal == 'SIGTERM' and a.terminal == 'END'
            c['adapter_died_by_sigterm'] = bool(own) and own[0]['detail']['signal'] == 'SIGTERM'
            c['peer_received_forwarded_signal'] = p.signal == 'SIGTERM'
            c['final_barrier'] = 'RELEASE_EXIT->driver' in order
        elif case == 'DIAG-PY-UNSCRIPTED':
            un = p.milestones('UNSCRIPTED')
            c['peer_recorded_unscripted'] = len(un) == 1 and un[0]['detail']['method'] == 'diag/unscripted'
            c['unscripted_error_written'] = len(p.milestones('UNSCRIPTED_ERROR_WRITTEN')) == 1
            lines = [ACC.strict_obj(x[:-1]) for x in OBS.lines_of(a.committed_bytes('stdout'))[0]]
            errs = [x for x in lines if isinstance(x, dict) and 'error' in x]
            c['error_reply_exact'] = (len(errs) == 1 and errs[0]['error'] == {'code': -32601, 'message': 'cvg synthetic: unscripted request',
                                                                            'data': {'cvg_synthetic': True, 'method': 'diag/unscripted'}})
            done = d.milestones('CALLS_DONE')
            c['client_not_blocked'] = bool(done) and done[0]['detail'].get('transport_closed') is False
            own = d.milestones('OWN_CLIENT_CLOSED')
            c['own_client_exit_0'] = bool(own) and own[0]['detail']['returncode'] == 0
            c['peer_wire_replay_equal'] = ACC.peer_replay_check(self.config['case_input'], self.logs)['status'] == 'EQUAL'  # F4-05
        elif case == 'DIAG-TS-ARGVENV':
            sent = self.config['case_input']['diag']
            argv = p.milestones('EXEC_ARGV')
            envm = p.milestones('EXEC_ENV')
            nbytes = len(compact(sent['argv']).encode())
            c['argv_over_512_within_768'] = 512 < nbytes <= 768
            c['peer_argv_exact'] = bool(argv) and argv[0]['detail'] == sent['argv']
            c['peer_env_exact'] = bool(envm) and envm[0]['detail'] == sent['env']
            c['os_environ_exact'] = self.adapter_environ == sent['env']
            # F4-01: the env object is delivered in its frozen (not code-point) order.
            c['case_input_not_sorted'] = compact(self.config['case_input']) != json.dumps(self.config['case_input'], sort_keys=True, separators=(',', ':'), ensure_ascii=False)
            own = d.milestones('OWN_FIXTURE_CHILD_CLOSED')
            c['own_child_exit_0'] = bool(own) and own[0]['detail']['code'] == 0
            c['final_barrier'] = 'RELEASE_EXIT->driver' in order
        elif case == 'DIAG-TS-TMPWATCH':
            sent = self.config['case_input']['diag']
            lst = {m['detail']['step']: m['detail'] for m in d.milestones('TMP_LISTING')}
            created = [e for e in lst.get('created', {}).get('entries', []) if e[0].startswith('codex-output-schema-')]
            removed = [e for e in lst.get('removed', {}).get('entries', []) if e[0].startswith('codex-output-schema-')]
            sf = p.milestones('SCHEMA_FILE')
            want = json.dumps(sent['schema'], separators=(',', ':')).encode()
            c['created_listed'] = len(created) == 1 and created[0][1] == ['schema.json']
            # F4-01: SCHEMA_FILE has JSON.stringify of the schema in its frozen order (not the code-point order of 2A).
            c['schema_bytes_frozen_order'] = bool(sf) and sf[0]['detail'].get('sha256') != sha_bytes(json.dumps(sent['schema'], sort_keys=True, separators=(',', ':')).encode())
            c['schema_file_read_by_peer'] = bool(sf) and sf[0]['detail'].get('exists') is True and sf[0]['detail'].get('sha256') == sha_bytes(want) \
                and sf[0]['detail'].get('trailing_lf') is False
            c['removed_listed'] = removed == []
            c['tmpdir_and_threadpool'] = lst.get('created', {}).get('tmpdir') == '/work/tmp' and lst.get('created', {}).get('uv_threadpool_size') == '2'
            c['pids_within_tasksmax'] = 0 < self.peaks.get('pids.peak', 0) <= 32
            own = d.milestones('OWN_FIXTURE_CHILD_CLOSED')
            c['own_child_exit_0'] = bool(own) and own[0]['detail']['code'] == 0
            c['final_barrier'] = 'RELEASE_EXIT->driver' in order
        elif case == 'DIAG-TS-ENOENT':
            f = d.milestones('ENOENT_FORM')
            c['form_recorded'] = bool(f) and f[0]['detail']['form'] in ('A', 'B', 'C')
            c['no_adapter_frames'] = not a.events and not p.events
            c['calls_done'] = bool(d.milestones('CALLS_DONE'))
            c['final_barrier'] = 'RELEASE_EXIT->driver' in order
            ew = self.exec_record or {}
            c['exec_witness_window_closed'] = ew.get('state') == 'closed' and ew.get('failure') is None
            c['exec_witness_zero_events'] = ew.get('events_in_window') == []
            c['frameless_form_no_child'] = ACC.frameless_form(verdict, ew, ACC.spawn_failure(d, 'ERROR_DETAIL_ANY')) == 'NO_CHILD'
        elif case == 'DIAG-TS-PREABORT':
            r = (d.milestones('PREABORT_RESULT') or [{'detail': {}}])[0]['detail']
            ew = self.exec_record or {}
            c['abort_err'] = (r.get('error') or {}).get('code') == 'ABORT_ERR'
            c['no_spawn_failure'] = not ACC.spawn_failure(d, 'ERROR_DETAIL_ANY')
            c['exec_witness_window_closed'] = ew.get('state') == 'closed' and ew.get('failure') is None
            c['in_open_in_window'] = ew.get('in_open_in_window', 0) >= 1
            c['no_survivors'] = ew.get('survivors_at_calls_done') == {'adapter': 0, 'peer': 0}
            c['frameless_form_preframe'] = ACC.frameless_form(verdict, ew, ACC.spawn_failure(d, 'ERROR_DETAIL_ANY')) == 'PREFRAME_TERMINATION'
            c['calls_done'] = bool(d.milestones('CALLS_DONE'))
            c['final_barrier'] = 'RELEASE_EXIT->driver' in order
        elif case == 'DIAG-TS-EPIPE':
            r = (d.milestones('EPIPE_RESULT') or [{'detail': {}}])[0]['detail']
            un = [m['detail'] for m in d.milestones('UNCAUGHT')]
            c['one_uncaught_epipe_write'] = len(un) == 1 and un[0].get('code') in ('EPIPE', 'ECONNRESET') and un[0].get('syscall') == 'write' and r.get('uncaught_count') == 1
            c['no_child_error'] = r.get('child_error') is None
            c['exit_0'] = r.get('exit') == {'code': 0, 'signal': None}
            c['stdout_eof'] = r.get('stdout_eof') is True
            c['adapter_fault_declared'] = a.fault == 'stdin_closed_at_start'
            c['adapter_stdin_zero'] = len(a.data['stdin']) == 0 and a.stream_end.get('stdin', {}).get('committed_bytes') == 0
            c['final_barrier'] = 'RELEASE_EXIT->driver' in order
        if 'RELEASE_EXIT->driver' in order:
            c['maps_witness_ok'] = bool(self.maps and self.maps['ok'])
        c['verdict_matches_expectation'] = verdict == self.spec['expect']
        return c

# --------------------------------------------------------------------------- data staging and identity freeze

def freeze_identities():
    src = check_source_freeze()
    diag, missing = {}, []
    for case in ADMISSION_DIAGS:
        passes = []
        for d in sorted(DIAG_DIR.glob('*-' + case)):
            r = json.loads((d / 'result.json').read_text())
            if r.get('status') == 'DIAG_PASS' and r.get('source_freeze', {}).get('sha256') == src['sha256']:
                passes.append({'dir': str(d.relative_to(UNIT)), 'unit': r['unit'], 'verdict': r['verdict']})
        if not passes:
            assert case in CONDITIONAL_DIAGS, 'BLOCKED: no DIAG_PASS of %s with the current source freeze' % case
            missing.append(case)
            continue
        diag[case] = passes[-1]
    decisions = {}
    for slot, need in (('ts12r_slot', ('DIAG-TS-ENOENT', 'DIAG-TS-PREABORT')), ('ts10e_slot', ('DIAG-TS-EPIPE',))):
        decisions[slot] = {'decision': 'RUN' if all(n in diag for n in need) else 'NOT_USED', 'diags': {n: diag.get(n) for n in need},
                           'rule': 'conditional_diags de freeze-r4-contract.json: só a vaga decidida é afetada'}
    validation = json.loads((ARTIFACTS / 'validation.json').read_text())
    deps_expected = {f['path']: {'bytes': f['bytes'], 'sha256': f['sha256']} for f in validation['merged_python']['files']}
    deps = tree_manifest(PY_DEPS_TREE)
    assert deps == deps_expected, 'python-deps differs from the authenticated validation.json merge'
    ts_row = [r for r in validation['rows'] if r['name'] == 'typescript'][0]
    ts_expected = {f['path']: {'bytes': f['bytes'], 'sha256': f['sha256']} for f in ts_row['files']}
    assert tree_manifest(TS_TREE) == ts_expected, 'typescript tree differs from the authenticated validation.json'
    adm = json.loads(ADMISSION_IDENTITY.read_text())
    assert sha_path(ADMISSION_IDENTITY) == ADMISSION_IDENTITY_SHA
    assert tree_manifest(SDK_PY_TREE) == adm['trees']['sdk-python'], 'sdk-python differs from the admitted tree'
    static = json.loads((ADMISSION / 'static-admission.json').read_text())
    assert static['status'] == 'PASS', 'static admission not PASS'
    emit = check_emit_record()
    ident = {'kind': 'ADMISSION_AND_IDENTITY_FREEZE_R4', 'status': 'ADMITTED_AND_FROZEN', 'task': 'DX100-G02:IMPLEMENT-AND-ADMIT-SDK-SOURCE-BATCH-2A-CONTINUATION',
             'source_freeze': src, 'admission_diagnostics': diag, 'conditional_diags_without_pass': missing,
             'ts12r_slot': decisions['ts12r_slot'], 'ts10e_slot': decisions['ts10e_slot'],
             'static_admission': {'path': 'g02/sdk-admission/static-admission.json', 'sha256': sha_path(ADMISSION / 'static-admission.json')},
             'admission_identity_freeze': {'path': 'g02/sdk-admission/identity-freeze.json', 'sha256': ADMISSION_IDENTITY_SHA},
             'emit_record': {k: emit[k] for k in ('path', 'sha256')},
             'host': {k: list(v) for k, v in HOST.items()}, 'service_properties': PROPS, 'sandbox_env': FIXED_ENV,
             'ts_sdk_env': TS_SDK_ENV,
             'argv': {lang: {role: role_argv(lang, role, 'CASE_ID') for role in ('driver', 'adapter', 'peer')} for lang in ('python', 'typescript')},
             'control_argv': role_argv('python', 'driver', CONTROL_CASE),
             'trees': {'sdk-python': tree_manifest(SDK_PY_TREE), 'python-deps': deps},
             'typescript_js': {'path': str(TS_TREE / TYPESCRIPT_JS[0]), 'sha256': TYPESCRIPT_JS[1], 'bytes': TYPESCRIPT_JS[2]},
             'ts_sources': ts_source_hashes(), 'spec_inputs': spec_hashes(), 'frozen_at': now_iso()}
    save_new_json(IDENTITY, ident)
    return ident


def init_ledgers():
    save_new_json(BUDGET, {'kind': 'SERVICE_BUDGET', 'services_max': 12, 'services_used': 0, 'planned': ADMISSION_DIAGS,
                           'rule': 'qualification services only; never a case repetition; no automatic retry', 'history': [], 'updated_at': now_iso()})
    slots = {c: {'status': 'UNUSED'} for c in [CONTROL_CASE] + SDK_CASES_TS + SDK_CASES_PY}
    assert len(slots) == 9
    save_new_json(CASE_LEDGER, {'kind': 'SINGLE_USE_CASE_SLOTS', 'slots_max': 9, 'used': 0, 'slots': slots,
                                'rule': 'one service per slot, once, serial, no retry; 2AC-CTRL01 first (gate); conditional slots only with their DIAG decision RUN',
                                'updated_at': now_iso()})


def main(argv):
    if argv[:1] == ['fixtures']:
        b = fixture_bytes()
        (UNIT / 'fixture-cases.json').write_bytes(b)
        print(json.dumps({'fixture_cases_sha256': sha_bytes(b), 'rows': len(json.loads(b))}))
        return 0
    if argv[:1] == ['plan']:
        plan = {c: case_plan(c) for c in [CONTROL_CASE] + SDK_CASES_TS + SDK_CASES_PY + sorted(DIAG)}
        save_json(UNIT / 'case-plan.json', {'kind': 'CASE_PLAN_FROM_SUPERVISOR_TABLES', 'cases': plan, 'diagnostics': DIAG,
                                            'eof_barrier_cases': sorted(EOF_BARRIER), 'admission_diagnostics': ADMISSION_DIAGS})
        print(len(plan))
        return 0
    if argv[:1] == ['init-ledgers']:
        init_ledgers()
        print('ledgers written')
        return 0
    if argv[:1] == ['freeze']:
        files = source_freeze_files()
        save_new_json(FREEZE, {'kind': 'SOURCE_FREEZE', 'task': 'DX100-G02:IMPLEMENT-AND-ADMIT-SDK-SOURCE-BATCH-2A', 'files': files,
                               'file_count': len(files), 'frozen_at': now_iso()})
        print(json.dumps({'freeze': FREEZE.name, 'sha256': sha_path(FREEZE), 'files': len(files)}))
        return 0
    if argv[:1] == ['freeze-identities']:
        ident = freeze_identities()
        print(json.dumps({'identity_freeze': IDENTITY.name, 'sha256': sha_path(IDENTITY), 'diagnostics': ident['admission_diagnostics'],
                          'ts12r_slot': ident['ts12r_slot']['decision'], 'ts10e_slot': ident['ts10e_slot']['decision']}))
        return 0
    if len(argv) == 2 and argv[0] == 'run':
        case = argv[1]
        if case in SDK_CASES_PY + SDK_CASES_TS:
            ledger = json.loads(CASE_LEDGER.read_text())
            assert ledger['slots'][CONTROL_CASE]['status'] == 'EXECUTED' and str(ledger['slots'][CONTROL_CASE].get('result', '')).startswith('MISMATCH/'), \
                'BLOCKED: the CONTROL gate 2A-CTRL01 must run first and end MISMATCH'
            if case in CONDITIONAL:
                assert json.loads(IDENTITY.read_text())[CONDITIONAL[case]]['decision'] == 'RUN', 'BLOCKED: conditional slot %s not released by its DIAG' % case
        result = Attempt(case).run()
        keys = ('case', 'unit', 'kind', 'verdict', 'outcome', 'status', 'reasons', 'diag_checks', 'os_checks', 'role_status', 'elapsed_ns')
        print(json.dumps({k: result.get(k) for k in keys}, indent=1))
        return 0 if result['status'] in ('DIAG_PASS', 'EXECUTED_ONCE') else 1
    print(__doc__)
    return 2


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
