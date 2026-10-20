"""TypeScript-lane host supervisor of DX100-G02:IMPLEMENT-AND-ADMIT-SDK-SOURCE-CONTINUATION-3-1 (runs OUTSIDE the target cgroup).

Derived from the TypeScript part of the 2AC supervisor (g02/sdk-batch-2ac-admission/python/supervisor.py, freeze r4: F4-01
delivery of the frozen case_input bytes with supervisor, role and evaluator witnesses; F4-02 wire reference from the frozen
fixture; transient systemd unit + bwrap sandbox; /proc and cgroup witnesses) with the deltas of freeze-r4-c3-delta.json for the
sub-lot C3-1:

- D3-01 cases-c3-1.json bound by sha: 14 TypeScript SDK slots (this lane) + C31-CTRL01 (Python lane, ../python/supervisor.py);
- D3-02 barriers SUSPENDED (record: driver listing, adapter alive and not reaped, no adapter SIGNAL, then STEP_RELEASE) and
  CHILD_HELD (STEP_RELEASE only after the peer REQUEST_HELD), next to the inherited ZERO_SPAWN and LAZY_POINT;
- termination tracker of the adapter and peer PIDs (state, zombie exit status, absence and their instants), the OS witness of
  ret.child_terminated_by_SIGTERM, witness.suspended_resources and abort.child_terminated_by_node_abort (same tracker as 2B-2);
- DIAG rows DIAG-TS-ECHO, DIAG-TS-ABORT, DIAG-TS-ARGVENV (requalified) and DIAG-TS-C3VOCAB (new, own code, no SDK);
- D3-06 one source freeze (source-freeze-r4-c31.json) and one identity freeze (identity-freeze-r4-c31.json) for both lanes,
  before any service; the 8 DIAG passes of both lanes go to diag-admission-c31.json; budget.json (12 services) and
  case-ledger.json (15 single-use slots) are shared with the Python lane (services run in series, never concurrently).

Commands (host python3.12 -I -B):
  supervisor.py stage               copy the admitted trees (sdk-python, python-deps, typescript-5.9.2) and the sealed emit into
                                    the private runtime, manifest-checked
  supervisor.py fixtures            fixture-cases-ts.json (14 slots + 4 DIAG rows; canonical; never the delivered source)
  supervisor.py plan                case-plan-ts.json (barriers and acceptance of every TypeScript slot and DIAG)
  supervisor.py init-ledgers        budget.json (12 services) and case-ledger.json (15 single-use slots) for both lanes
  supervisor.py freeze              source-freeze-r4-c31.json (both lanes; refuses to overwrite)
  supervisor.py freeze-identities   identity-freeze-r4-c31.json (both lanes; before any service)
  supervisor.py diag-admission      diag-admission-c31.json (the 8 DIAG passes of both lanes)
  supervisor.py run CASE            one transient service: DIAG-TS-* (12-service budget) or a C3-TS slot (single-use, slot order,
                                    after the CONTROL gate; never retried)

SDK code is imported or executed only inside the contained service. The supervisor never imports SDK, Pydantic, compiler or
acquired code. Load average above 12 before a service: wait and record.
"""
import datetime
import hashlib
import importlib.util
import json
import os
import secrets
import select
import shutil
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
SPEC = UNIT / 'inputs' / 'spec-c3'
SPEC_2B = UNIT / 'inputs' / 'spec-2b'
SPEC_R4 = UNIT / 'inputs' / 'spec-r4'
RUNTIME = Path('/mnt/dados/cvg-work/cvg-codex100-c31-runtime-20261019')
STAGED_PY_FROM = Path('/mnt/dados/cvg-work/cvg-codex100-batch2a-runtime-20261019')   # admitted sdk-python / python-deps copies
STAGED_TS_FROM = Path('/mnt/dados/cvg-work/cvg-codex100-batch2ac-runtime-20261019')  # admitted typescript tree and sealed emit
ATTEMPTS = RUNTIME / 'attempts'
SDK_PY_TREE = RUNTIME / 'sdk-python'
PY_DEPS_TREE = RUNTIME / 'python-deps'
TS_TREE = RUNTIME / 'trees' / 'typescript-5.9.2'
EMITTED = RUNTIME / 'emitted'
DIAG_DIR = UNIT / 'diagnostics'
CASES_DIR = UNIT / 'cases'
FREEZE = UNIT / 'source-freeze-r4-c31.json'
IDENTITY = UNIT / 'identity-freeze-r4-c31.json'
DIAG_ADMISSION = UNIT / 'diag-admission-c31.json'
FIXTURES = UNIT / 'fixture-cases-ts.json'
PLAN = UNIT / 'case-plan-ts.json'
ADMISSION_IDENTITY = ADMISSION / 'identity-freeze.json'
ADMISSION_IDENTITY_SHA = 'ebfb308f17e6a21ab77c91ab3863b737dd646ed6b1b6bbd835cba73e62225b1d'
EMIT_RECORD = ADMISSION / 'compiler' / 'emit.json'  # sealed emit of the admission, reused (same .ts, same transpile)
CASES_JSON = SPEC / 'cases-c3-1.json'
CASES_SHA = 'fc9b54c02760eda44617cf60d414c26f9213a8b84b149c8cf9edc6bc7eb7de96'
# Spec inputs of the sub-lot (next-task.json#/spec of the continuation-3 spec); identical table in ../python/supervisor.py.
SPEC_SHA = {'cases-c3-1.json': CASES_SHA,
            'freeze-r4-c3-delta.json': '71468dd2ee4df077c0165f0d861fdcaabcec50e210cab229560e35d35d6652d5',
            'evaluator-r4-c3-delta.json': 'fede1a1dc43a0a3a36faed67777f924797a2689dc4cf696912ec035d1cf32d79',
            'control-slot-contract-c3.json': '7649589b93ca46e50a3026e8c7700179a7b4dbc98e19a94a39eaed9245d51eaa',
            'execution-budget-c3-1.json': '7bf1e98a050b7241bc9abc67cce6383b4b4b14649f01081289a6e0017e1bf0b6',
            'coverage-plan-c3.json': 'ec4cf5c913c358f7167394d5895ee4df45e57d46a7a471f9358046428e299e1e',
            't3-assessment.json': 'f8daae2e9ac8ffebf353000956d5fcee51abf46abaee2df9439c9638ceba354b'}
SPEC_2B_SHA = {'cases-2b-1.json': '96b1e4d92d6333addfff638dbdbe6c0550d17625f9e57cf67291aa9548098105',
               'freeze-r4-2b-delta.json': '55c561192009c44a0b0de25c561f9f95bb675285221124a35edb7f7d67d93136',
               'evaluator-r4-2b-delta.json': '87a4169617c358da6f557d6b57d621649eaca6a2dbae66a6aad55d0e47de1ba9',
               'capability-contracts-2b.json': '78bc3c9fb3789134b1e8d37527dcbfbed867a39f7d618546d1f00ed1da2bdf3a',
               'control-slot-contract-2b.json': 'ea2d910a123908c247a26baa847120b3323fa2585ca90af4d80790ce4db69c3b'}
SPEC_R4_SHA = {'freeze-r4-contract.json': '14ad70297aa907e5a88add489196c1b38dfdbf15ef50454f40250185957688ed',
               'evaluator-r4-contract.json': '62d948a1373ab0b7eb7ac55d02bfd3a638bdadbf6d194b3765dd273d63c89b72',
               'control-slot-contract.json': '35a7f210c7eb2c40762009d924177164cadce5661172d12d12fbcaea53d68c73'}
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
UNIT_PREFIX = 'cvg-dx100-c31-'
LOAD_LIMIT = 12.0
CASE_ARTIFACTS = 2097152  # interface-v1 limits.case_artifacts: events of all roles + controls + service output
SERVICE_OUTPUT_CAP = 65536
BUDGET = UNIT / 'budget.json'
CASE_LEDGER = UNIT / 'case-ledger.json'
NAMES = [r + '.' + k for r in ('driver', 'adapter', 'peer') for k in ('events', 'control')]
TS_SOURCES = ('channel.cjs', 'adapter-typescript', 'fixture-cli.mjs', 'ts-driver.mjs', 'extension-loader.mjs', 'transpile.mjs')
ROLE_SOURCE = {'driver': 'ts-driver.mjs', 'adapter': 'adapter-typescript', 'peer': 'fixture-cli.mjs'}
SDK_BUILTINS = ['node:child_process', 'node:fs', 'node:module', 'node:os', 'node:path', 'node:readline']
LOADER_BUILTINS = sorted(set(SDK_BUILTINS) | {'node:crypto', 'node:net', 'node:util'})
TS_FILES = ['codex.ts', 'codexOptions.ts', 'events.ts', 'exec.ts', 'index.ts', 'items.ts', 'outputSchemaFile.ts',
            'thread.ts', 'threadOptions.ts', 'turnOptions.ts']
CONTROL_CASE = 'C31-CTRL01'
BARRIER_KINDS = ('ZERO_SPAWN', 'LAZY_POINT', 'SUSPENDED', 'CHILD_HELD')
SUPERVISOR_KILLS = ('SUPERVISOR_BOUND_KILL', 'CASE_ARTIFACT_BUDGET_KILL', 'ADMISSION_STOP')


def spec_cases():
    raw = CASES_JSON.read_bytes()
    assert hashlib.sha256(raw).hexdigest() == CASES_SHA, 'cases-c3-1.json drifted from the approved spec'
    return {c['id']: c for c in json.loads(raw)['cases']}  # json.loads preserves the frozen insertion order (F4-01)


SPEC_CASES = spec_cases()
SDK_CASES_TS = [c for c, d in sorted(SPEC_CASES.items(), key=lambda kv: kv[1]['slot']) if d['kind'] == 'SDK' and d['language'] == 'typescript']
assert len(SDK_CASES_TS) == 14 and SPEC_CASES[CONTROL_CASE]['kind'] == 'CONTROL' and len(SPEC_CASES) == 15
CONDITIONAL = {}  # execution-budget-c3-1.json: no conditional slot
_ARGVENV_ARGV = ['exec', '--experimental-json'] + [a for i in range(14) for a in ('--config', 'diag_k%02d="%s"' % (i, 'v' * 24))]
# DIAG-TS-C3VOCAB (D3-02, D3-03): constant diag_calls run by the driver interpreter over OwnCodex (own code, no SDK import).
C3VOCAB_CALLS = [
    {'step': 1, 'api': 'new Codex', 'as': 'c', 'options': {'config': {'g': {'$GETTER': {'name': 'w', 'value': 'x', 'witness': 'wB'}}},
                                                           'baseUrl': 'http://127.0.0.1:9/own-a'}, 'options_as': 'co'},
    {'step': 2, 'api': 'c.startThread', 'options': {'model': 'own-m-a'}, 'as': 't', 'options_as': 'to'},
    {'step': 3, 'on': 't', 'api': 'run_streamed', 'input': 'own-lazy',
     'turn_options': {'own_report': True, 'outputSchema': {'type': 'object', 'p': {'$GETTER': {'name': 'q', 'value': 1, 'witness': 'wA'}}},
                      'own_events': [{'type': 'thread.started', 'thread_id': 'own-1'}, {'type': 'thread.started'}]}, 'consume': 'none'},
    {'step': 4, 'barrier': 'LAZY_POINT', 'witness': {'adapter_processes': 0, 'driver_listing_work_tmp_schema_dirs': 0}},
    {'step': 5, 'api': 'mutate', 'target': 'to', 'key': 'model', 'value': 'own-m-b'},
    {'step': 6, 'api': 'mutate', 'target': 'co', 'key': 'baseUrl', 'value': 'http://127.0.0.1:9/own-b'},
    {'step': 7, 'api': 'mutate', 'target': 'to', 'key': 'unread', 'value': {'$GETTER': {'name': 'z', 'value': 0, 'witness': 'wZ'}}},
    {'step': 8, 'api': 'events.consume', 'events_of_step': 3, 'consume': 'all'},
    {'step': 9, 'api': 'new AbortController', 'as': 'ac'},
    {'step': 10, 'on': 't', 'api': 'run_streamed', 'input': 'own-throw',
     'turn_options': {'outputSchema': {'type': 'object'}, 'own_events': [{'type': 'own.first'}, {'type': 'own.second'}]},
     'consume': 'first_then_witness_then_throw', 'barrier': 'SUSPENDED', 'throw': {'name': 'Error', 'message': 'cvg own throw'}},
    {'step': 11, 'on': 't', 'api': 'run_streamed', 'input': 'own-abort', 'turn_options': {'signal': '$ac.signal', 'own_child': True},
     'consume': 'next_abort_at_barrier', 'barrier': 'CHILD_HELD', 'abort': 'ac'},
]
DIAG_ROWS = {
    'DIAG-TS-ECHO': {'JSONL': [{'type': 'thread.started', 'thread_id': 'diag-thread'}, 'not json', '',
                               {'type': 'turn.completed', 'usage': {'input_tokens': 1, 'cached_input_tokens': 0, 'output_tokens': 1}}],
                     'exit_code': 3, 'stderr': 'diag stderr\n'},
    # r4: JSONL objects (keys out of code-point order) written before holding; the signal cascade checks the wire prefix (F4-02).
    'DIAG-TS-ABORT': {'JSONL': [{'type': 'thread.started', 'thread_id': 'diag-abort'}, {'type': 'turn.started'}], 'exit_code': 0, 'stderr': '',
                      'write_then_hold': True},
    # r4: env keys out of code-point order; the role BEGIN witnesses prove the frozen bytes were delivered (F4-01).
    'DIAG-TS-ARGVENV': {'sdk_calls': [], 'fixture': {'JSONL': [{'type': 'thread.started', 'thread_id': 'diag-argvenv'}], 'exit_code': 0, 'stderr': ''},
                        'diag': {'argv': _ARGVENV_ARGV, 'env': {'PATH': '/runtime', 'HOME': '/work/home', 'CVG_DIAG_ENV': 'argvenv',
                                                                 'CODEX_INTERNAL_ORIGINATOR_OVERRIDE': 'codex_sdk_ts'}}},
    'DIAG-TS-C3VOCAB': {'sdk_calls': [], 'fixture': {'behavior': 'hold'}, 'diag_calls': C3VOCAB_CALLS},
}
DIAG = {
    'DIAG-TS-ECHO': {'language': 'typescript', 'deadline': 20, 'expect': 'PASS'},
    'DIAG-TS-ABORT': {'language': 'typescript', 'deadline': 20, 'expect': 'KNOWN_SIGNAL_TERMINATION'},
    'DIAG-TS-ARGVENV': {'language': 'typescript', 'deadline': 20, 'expect': 'PASS'},
    'DIAG-TS-C3VOCAB': {'language': 'typescript', 'deadline': 20, 'expect': 'KNOWN_SIGNAL_TERMINATION'},
}
# execution-budget-c3-1.json#/planned/qualification_services: 8 of 12 services (4 in reserve), every DIAG a stop condition.
ADMISSION_DIAGS = ['DIAG-TS-ECHO', 'DIAG-TS-ABORT', 'DIAG-TS-ARGVENV', 'DIAG-TS-C3VOCAB',
                   'DIAG-PY-RPC', 'DIAG-PY-STAGE', 'DIAG-PY-UNSCRIPTED', 'DIAG-PY-BEFOREREPLY']
CONDITIONAL_DIAGS = {}
# D3-06: files whose bytes form the source identity of the sub-lot (both lanes); identical list in ../python/supervisor.py.
SOURCE_SET = (['python/' + n for n in ('acceptance.py', 'adapter-python.py', 'adapter-python-exec', 'bootstrap.py', 'channel.py',
                                       'control-client.py', 'fixture-rpc.py', 'harness2b.py', 'observer.py', 'own2b.py', 'ownmodels.py',
                                       'python-driver.py', 'supervisor.py')]
              + ['tslane/' + n for n in ('acceptance.py', 'bootstrap.py', 'observer.py', 'supervisor.py')]
              + ['node/' + n for n in ('adapter-typescript', 'channel.cjs', 'extension-loader.mjs', 'fixture-cli.mjs', 'transpile.mjs', 'ts-driver.mjs')]
              + ['profile-templates/' + n for n in ('node-loader.json', 'node-transpile.json', 'package.json', 'sdk-emitted-package.json')]
              + ['case-plan-py.json', 'case-plan-ts.json', 'fixture-cases-py.json', 'fixture-cases-ts.json']
              + ['inputs/spec-c3/' + n for n in sorted(SPEC_SHA)] + ['inputs/spec-2b/' + n for n in sorted(SPEC_2B_SHA)]
              + ['inputs/spec-r4/' + n for n in sorted(SPEC_R4_SHA)]
              + ['selftests/selftest_c31.py', 'selftests/selftest_c31_driver.mjs', 'selftests/selftest-results.json',
                 'tools/validate_unit.py', 'validation-unit.json'])


def _load(name, mod):
    spec = importlib.util.spec_from_file_location(mod, HERE / name)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


OBS = _load('observer.py', 'cvg_observer_c31_ts')
ACC = _load('acceptance.py', 'cvg_acceptance_c31_ts')


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
    """F4-01: the frozen case_input of each TypeScript slot (cases-c3-1.json#/cases[]/case_input), insertion order preserved."""
    rows = {}
    for cid in SDK_CASES_TS:
        row = SPEC_CASES[cid]['case_input']
        assert sha_bytes(compact(row).encode('utf-8')) == SPEC_CASES[cid]['case_input_sha256'], 'frozen case_input bytes of %s' % cid
        rows[cid] = row
    assert len(rows) == 14, 'expected the 14 frozen TypeScript slots'
    return rows


def delivered_input(case):
    """F4-01: the case_input delivered to the roles, never derived from the sorted fixture-cases file."""
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


def role_argv(role, case, adapter_args=None, adapter_env_json=None):
    if role == 'driver':
        return ['/runtime/node', '--experimental-loader', '/profile/extension-loader.mjs', '/profile/ts-driver.mjs', '--case', case]
    if role == 'adapter':
        return ['/runtime/node', '/profile/adapter-typescript'] + list(adapter_args or [])
    return ['/runtime/node', '/profile/fixture-cli.mjs', '--case', case, '--sdk-argv-json', compact(list(adapter_args or [])),
            '--sdk-env-json', adapter_env_json]


def peer_argv(case):
    return ['/runtime/node', '/profile/fixture-cli.mjs', '--case', case, '--sdk-argv-json']


def env_json(env):
    """JSON.stringify of the adapter environment with sorted keys, as adapter-typescript passes it to the peer."""
    return compact({k: env[k] for k in sorted(env)})


def ts_fixture(case):
    """F4-02: the wire reference comes from the frozen fixture (insertion order), never from the sorted fixture file."""
    row = delivered_input(case)
    return row['fixture'] if 'sdk_calls' in row else row


def frozen_wire(fx):
    if 'JSONL' in fx:
        return {'stdout': ''.join((ln if isinstance(ln, str) else json.dumps(ln, separators=(',', ':'), ensure_ascii=False)) + '\n'
                                  for ln in fx['JSONL']).encode(), 'stderr': fx['stderr'].encode()}
    if 'stdout_chunks_hex' in fx:
        return {'stdout': b''.join(bytes.fromhex(h) for h in fx['stdout_chunks_hex']), 'stderr': fx['stderr'].encode()}
    return None


def calls_of(case):
    row = delivered_input(case)
    return row.get('sdk_calls') or row.get('diag_calls') or []


def barrier_steps(case):
    """Every step that opens a STEP_WITNESS barrier, by number: standalone barriers, barrier modes and expect (ZERO_SPAWN)."""
    out = {}
    for s in calls_of(case):
        if 'barrier' in s:
            out[str(s['step'])] = s['barrier']
        elif isinstance(s.get('expect'), dict):
            out[str(s['step'])] = 'ZERO_SPAWN'
    return out


RELEASE_RULE = {'ZERO_SPAWN': 'STEP_RELEASE after the supervisor zero-spawn witness (no adapter or peer process in the unit cgroup)',
                'LAZY_POINT': 'STEP_RELEASE after the supervisor zero-spawn witness (LAZY_POINT)',
                'SUSPENDED': 'STEP_RELEASE after recording the driver listing, adapter alive (same PID+starttime, not zombie) and no adapter SIGNAL',
                'CHILD_HELD': 'STEP_RELEASE only after the peer REQUEST_HELD (adapter alive recorded)'}


def case_plan(case):
    spec = SPEC_CASES.get(case)
    exits = ('RELEASE_EXIT->driver after driver CALLS_DONE and adapter and peer exits witnessed by the OS (dead or zombie PID+starttime) '
             'or both absent (no frame and no process in the unit cgroup); a terminal frame alone is not enough')
    fx = ts_fixture(case)
    barriers = ['READY to each role']
    bs = barrier_steps(case)
    for step, kind in bs.items():
        barriers.append('step %s %s: %s' % (step, kind, RELEASE_RULE[kind]))
    if 'behavior' in fx:
        barriers.append('no reply release: the peer holds stdout; termination is the SDK (or abort) signal cascade')
    elif fx.get('no_child'):
        barriers.append('no child: the release condition is CALLS_DONE with adapter and peer absent')
    else:
        barriers.append('RELEASE_REPLY->peer after peer REQUEST_HELD (or STDIN_EMPTY with a 0-byte stdin STREAM_END) equals adapter-forwarded stdin')
        if fx.get('write_then_hold'):
            barriers.append('write_then_hold: no RELEASE_EXIT->peer; the SDK finally (child.kill) and the forwarded signal end adapter and peer')
        else:
            barriers.append('RELEASE_EXIT->peer after adapter committed exactly the peer REPLY_WRITTEN stdout/stderr byte counts')
    barriers.append(exits)
    barriers.append('termination tracker of the adapter and peer PIDs (state, zombie exit status, absence) sampled at every supervisor turn')
    if spec:
        barriers.append('driver /proc maps sampled by the supervisor right before RELEASE_EXIT->driver (loaded-code identity)')
    driver = 'sdkCase (frozen C3-1 sdk_calls, real Codex/Thread calls)' if spec else 'diagnostic (own constant code; DIAG-TS-C3VOCAB: interpreter over OwnCodex)'
    return {'language': 'typescript', 'driver': driver, 'peer': 'fixture-cli wireFixture/hold from frozen fixture_input', 'barriers': barriers,
            'barrier_steps': bs, 'acceptance_predicates': ACC.plan(case) if spec else 'diag_checks + observer.reconcile'}


# --------------------------------------------------------------------------- ledgers (shared with the Python lane)

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
    if kind == 'sdk':
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
    got = {'spec-c3': {n: sha_path(SPEC / n) for n in SPEC_SHA}, 'spec-2b': {n: sha_path(SPEC_2B / n) for n in SPEC_2B_SHA},
           'spec-r4': {n: sha_path(SPEC_R4 / n) for n in SPEC_R4_SHA}}
    assert got == {'spec-c3': SPEC_SHA, 'spec-2b': SPEC_2B_SHA, 'spec-r4': SPEC_R4_SHA}, 'approved spec inputs drifted'
    return got


def case_input_anchors():
    """cases-c3-1.json#/inputs re-checked by sha: the TypeScript sources of the pin, the admitted bootstrap and the 2B-2 peer; the
    unit copies of bootstrap.py (both lanes) and fixture-rpc.py are byte-equal to the anchors."""
    inputs = json.loads(CASES_JSON.read_bytes())['inputs']
    got = {}
    for name, inp in inputs.items():
        assert inp['path'].startswith('../'), 'input path relative to the spec folder'
        got[name] = sha_path(G02 / inp['path'][3:])  # ../ of the spec folder is g02/
    bad = [n for n, inp in inputs.items() if got[n] != inp['sha256']]
    assert not bad, 'case input anchors drifted: %s' % bad
    assert sha_path(HERE / 'bootstrap.py') == sha_path(UNIT / 'python' / 'bootstrap.py') == inputs['adm2ac/python/bootstrap.py']['sha256'], 'bootstrap anchor'
    assert sha_path(UNIT / 'python' / 'fixture-rpc.py') == inputs['adm2b2/python/fixture-rpc.py']['sha256'], 'peer v2 anchor (fixture-rpc.py)'
    return got


def check_identity_freeze():
    assert IDENTITY.exists(), 'BLOCKED: no identity freeze r4-c31'
    raw = IDENTITY.read_bytes()
    ident = json.loads(raw)
    assert ident['status'] == 'FROZEN_BEFORE_SERVICES', 'identity freeze status'
    assert ident['source_freeze']['sha256'] == sha_bytes(FREEZE.read_bytes()), 'identity freeze binds another source freeze'
    assert tree_manifest(SDK_PY_TREE) == ident['trees']['sdk-python'], 'sdk-python tree drift'
    assert tree_manifest(PY_DEPS_TREE) == ident['trees']['python-deps'], 'python-deps tree drift'
    assert sha_path(TS_TREE / TYPESCRIPT_JS[0]) == TYPESCRIPT_JS[1], 'typescript.js drift'
    assert ts_source_hashes() == ident['ts_sources'], 'TypeScript source drift'
    assert spec_hashes() == ident['spec_inputs'], 'spec inputs binding'
    assert case_input_anchors() == ident['case_input_anchors'], 'case input anchors binding'
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


def control_gate():
    """C31-CTRL01 first: MISMATCH by rule 6 with failed predicates exactly [wire.no_turn_interrupt] (sanities approved)."""
    ledger = json.loads(CASE_LEDGER.read_text())
    assert ledger['slots'][CONTROL_CASE]['status'] == 'EXECUTED', 'BLOCKED: the CONTROL gate %s must run first' % CONTROL_CASE
    docs = sorted(CASES_DIR.glob(CONTROL_CASE + '-*/acceptance.json'))
    assert len(docs) == 1, 'BLOCKED: exactly one CONTROL acceptance expected'
    acc = json.loads(docs[0].read_text())
    ok = acc['outcome'] == 'MISMATCH' and acc['composition_rule'] == 6 and acc['failed_predicates'] == ['wire.no_turn_interrupt']
    assert ok, 'BLOCKED: CONTROL gate not met (%s, rule %s, %s)' % (acc['outcome'], acc['composition_rule'], acc['failed_predicates'])


def slot_order_gate(case):
    """Serial slot order: every TypeScript slot before this one was executed once (no slot is skipped or reordered)."""
    ledger = json.loads(CASE_LEDGER.read_text())
    before = SDK_CASES_TS[:SDK_CASES_TS.index(case)]
    pending = [c for c in before if ledger['slots'][c]['status'] != 'EXECUTED']
    assert not pending, 'BLOCKED: slots before %s not executed yet: %s' % (case, pending)


# --------------------------------------------------------------------------- /proc witnesses

def proc_info(pid):
    base = Path('/proc/%d' % pid)
    try:
        status = (base / 'status').read_text()
        stat_ = (base / 'stat').read_text()
        cmd = (base / 'cmdline').read_bytes().split(b'\0')
        post = stat_.rsplit(')', 1)[1].split()
        info = {'host_pid': pid,
                'nspid': [int(x) for x in [ln for ln in status.splitlines() if ln.startswith('NSpid:')][0].split()[1:]],
                'ppid': int([ln for ln in status.splitlines() if ln.startswith('PPid:')][0].split()[1]),
                'starttime': post[19], 'state': post[0], 'exit_code': int(post[49]) if len(post) > 49 else None,
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


def classify_mappings(mappings, roots):
    """Each file-backed mapping must be an allowed read-only root by (dev, inode) equality. Returns (entries, unknown)."""
    entries, unknown = [], []
    for (path, dev, inode), perms in sorted(mappings.items()):
        rec = {'path': path, 'dev': dev, 'inode': inode, 'perms': sorted(perms)}
        if path.startswith('/memfd:'):
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
    """Copy a closed regular-file tree (no symlink/special file) into the attempt profile or the private runtime."""
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
        elif case in SDK_CASES_TS:
            self.kind = 'sdk'
            self.spec = {'language': 'typescript', 'deadline': 30, 'expect': None}
        else:
            raise ValueError('not a TypeScript-lane case: %r' % case)
        self.case = case
        self.language = 'typescript'
        self.attempt = secrets.token_hex(20)
        self.nonce = secrets.token_hex(20)
        self.unit = '%s%s-%s.service' % (UNIT_PREFIX, self.attempt[:12], case.lower())
        self.dir = ATTEMPTS / (self.attempt[:12] + '-' + case)
        self.evidence = DIAG_DIR / (self.attempt[:12] + '-' + case) if self.kind == 'diag' else CASES_DIR / (case + '-' + self.attempt[:12])
        self.step_witness = []
        self.actions = []
        self.done = set()
        self.ctl_seq = {'driver': 0, 'adapter': 0, 'peer': 0}
        self.role_host = {}
        self.admission_fail = []
        self.cgroup = None
        self.service = {}
        self.host_netns = os.readlink('/proc/self/ns/net')
        self.peaks = {}
        self.signal_sent_ns = None  # this lane never signals a role; only the unit-level kills below (recorded as actions)
        self.service_bytes = {'stdout': 0, 'stderr': 0}
        self.budget_hit = False
        self.launched = False
        self.maps = None
        self.maps_raw = None
        self.adapter_environ = None
        self.controls = {}
        self.logs = {}
        self.term = {}
        self.t0 = time.monotonic_ns()

    def act(self, name, **detail):
        self.actions.append({'t_ns': time.monotonic_ns() - self.t0, 'action': name, 'detail': detail})

    # ----------------------------------------------------------------- preparation
    def prepare(self):
        for name, (path, digest) in HOST.items():
            assert sha_path(path) == digest, 'host identity drift: ' + name
        self.freeze = check_source_freeze()
        spec_hashes()
        self.identity = check_identity_freeze()
        self.emit = check_emit_record() if self.kind == 'sdk' else None
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
        for name in TS_SOURCES:
            shutil.copyfile(UNIT / 'node' / name, prof / name)
        shutil.copyfile(HERE / 'bootstrap.py', prof / 'bootstrap.py')
        (prof / 'package.json').write_bytes((UNIT / 'profile-templates' / 'package.json').read_bytes())
        (prof / 'node-loader.json').write_text(compact(node_loader_json(self.emit['files'] if self.emit else None)) + '\n')
        (prof / 'node-transpile.json').write_text(compact(node_transpile_json()) + '\n')
        if self.kind == 'sdk':
            stage_tree(EMITTED, prof / 'sdk-emitted')
        (prof / 'fixture-cases.json').write_bytes(FIXTURES.read_bytes())
        assert FIXTURES.read_bytes() == fixture_bytes(), 'fixture-cases-ts.json differs from the frozen rows'
        case_input = delivered_input(self.case)
        self.case_input_sha256 = sha_bytes(compact(case_input).encode('utf-8'))  # F4-01 supervisor witness, before READY
        if self.case in SPEC_CASES:
            assert self.case_input_sha256 == SPEC_CASES[self.case]['case_input_sha256'], 'delivered case_input differs from the frozen bytes'
        self.config = {'attempt': self.attempt, 'case': self.case, 'nonce': self.nonce, 'language': 'typescript',
                       'deadline_seconds': self.spec['deadline'], 'fifo_root': '/observer', 'fifo_nodes': list(NAMES),
                       'fifo_stat': self.fifo_stat, 'peer_argv': peer_argv(self.case), 'case_input': case_input,
                       'mode': {'diag': 'diagnostic', 'sdk': 'sdk'}[self.kind]}
        (prof / 'adapter-config.json').write_text(compact(self.config) + '\n')
        self.files = profile_files(prof)
        self.admission = {'v': 1, 'attempt': self.attempt, 'case': self.case, 'nonce': self.nonce, 'language': 'typescript',
                          'runtime_sha256': HOST['node'][1], 'files': self.files, 'fifo_pipe_buf': self.pipe_buf,
                          'containment_admitted': True, 'sdk_admitted': self.kind == 'sdk', 'compiler_admitted': False}
        (prof / 'admission.json').write_text(compact(self.admission) + '\n')
        seal_profile(prof)
        assert profile_files(prof) == self.files, 'profile changed while sealing'
        self.expect = {role: {'attempt': self.attempt, 'case': self.case, 'nonce': self.nonce, 'source_sha256': self.files['/profile/' + src]}
                       for role, src in ROLE_SOURCE.items()}
        self.logs = {role: OBS.RoleLog(role, self.expect[role]) for role in self.expect}
        self.exe = os.stat(HOST['node'][0])

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
        bw += ['--remount-ro', '/', '--', '/runtime/python', '-I', '-S', '/profile/bootstrap.py'] + role_argv('driver', self.case)
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
            if found.get('exe_dev_ino') != [self.exe.st_dev, self.exe.st_ino]:
                problems.append('executable inode differs from bound runtime')
            if role == 'adapter':
                ok = found['cmdline'][:2] == ['/runtime/node', '/profile/adapter-typescript']
                self.adapter_args = found['cmdline'][2:]
            elif role == 'peer':
                env = self.adapter_environ if isinstance(self.adapter_environ, dict) and 'error' not in self.adapter_environ else {}
                ok = found['cmdline'] == role_argv('peer', self.case, getattr(self, 'adapter_args', None), env_json(env))
            else:
                ok = found['cmdline'] == role_argv(role, self.case)
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
        out['entries'], out['unknown'] = classify_mappings(parse_maps(text), self.map_roots())
        out['ok'] = bool(out['entries']) and not out['unknown']
        return out

    def track_processes(self):
        """Termination tracker of the mapped adapter and peer (2B-2 tracker): state changes, zombie exit status and absence,
        each with its supervisor instant (t_ns since t0)."""
        for role in ('adapter', 'peer'):
            info = self.role_host.get(role)
            if not info:
                continue
            t = self.term.setdefault(role, {'host_pid': info['host_pid'], 'states': [], 'zombie_exit_code': None, 'absent': False})
            cur = proc_info(info['host_pid'])
            if cur is None or cur['starttime'] != info['starttime']:
                if not t['absent']:
                    t['absent'] = True
                    t['absent_t_ns'] = time.monotonic_ns() - self.t0
                continue
            if not t['states'] or t['states'][-1] != cur['state']:
                t['states'].append(cur['state'])
            if cur['state'] == 'Z' and t['zombie_exit_code'] is None:
                t['zombie_exit_code'] = cur['exit_code']
                t['zombie_t_ns'] = time.monotonic_ns() - self.t0

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
            if '/profile/adapter-typescript' in cmd:
                out['adapter'].append(m['host_pid'])
            elif '/profile/fixture-cli.mjs' in cmd:
                out['peer'].append(m['host_pid'])
        return out

    def role_exited(self, role):
        """Exit witnessed by the OS (process gone or zombie with the same PID+starttime)."""
        return role in self.role_host and not alive(self.role_host[role])

    def role_done(self, role):
        """Terminal frame (END/INVALID) or independently witnessed exit; a SIGNAL frame alone is not enough."""
        return self.logs[role].terminal is not None or self.role_exited(role)

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

    def barrier(self, d, a, p):
        """STEP_WITNESS -> STEP_RELEASE by kind (D3-02 f): ZERO_SPAWN/LAZY_POINT/SUSPENDED record and release; CHILD_HELD waits
        for the peer REQUEST_HELD; SUSPENDED waits until a running adapter process is mapped (no record before its BEGIN)."""
        for ev in d.events:
            if ev['kind'] != 'DIAGNOSTIC' or ev['data']['milestone'] != 'STEP_WITNESS':
                continue
            det = ev['data']['detail']
            step, kind = det.get('step'), det.get('kind')
            if 'STEP_RELEASE->driver#%s' % step in self.done:
                continue
            if kind not in BARRIER_KINDS:
                if 'BAD_BARRIER#%s' % step not in self.done:
                    self.done.add('BAD_BARRIER#%s' % step)
                    self.admission_fail.append('unknown STEP_WITNESS kind %r at step %r' % (kind, step))
                continue
            if kind == 'CHILD_HELD' and not p.kinds('REQUEST_HELD'):
                continue
            procs = self.role_processes()
            if kind == 'SUSPENDED' and procs['adapter'] and 'adapter' not in self.role_host:
                continue
            info = self.role_host.get('adapter')
            w = {'step': step, 'kind': kind, 'adapter_processes': len(procs['adapter']), 'peer_processes': len(procs['peer']),
                 'adapter_frames': len(a.events), 'peer_frames': len(p.events), 'adapter_mapped': info is not None,
                 'adapter_alive': alive(info) if info else False, 'adapter_signal_frames': len(a.kinds('SIGNAL')),
                 'adapter_terminal': a.terminal, 'request_held_frames': len(p.kinds('REQUEST_HELD')),
                 't_ns': time.monotonic_ns() - self.t0}
            self.step_witness.append(w)
            self.act('STEP_WITNESS', **w)
            self.send('driver', 'STEP_RELEASE', tag=step)

    def advance(self):
        self.sample_peaks()
        self.track_processes()
        L = self.logs
        d, a, p = L['driver'], L['adapter'], L['peer']
        if self.admission_fail:
            return
        self.barrier(d, a, p)
        fx = self.config['case_input'].get('fixture') if 'sdk_calls' in self.config['case_input'] else self.config['case_input']
        fx = fx or {}
        hold = 'behavior' in fx
        held = p.kinds('REQUEST_HELD')
        empty = p.milestones('STDIN_EMPTY')
        stdin_end = a.stream_end.get('stdin')
        forwarded = bool(stdin_end and ((held and held[0]['data']['bytes'] == stdin_end['committed_bytes']
                                         and held[0]['data']['sha256'] == OBS.h(a.committed_bytes('stdin')))
                                        or (empty and stdin_end['committed_bytes'] == 0)))
        if forwarded and not hold:
            self.send('peer', 'RELEASE_REPLY')
        wrote = p.milestones('REPLY_WRITTEN')
        if (self.case == 'DIAG-TS-ABORT' and forwarded and 'READY->adapter' in self.done and 'READY->peer' in self.done
                and alive(self.role_host.get('peer')) and wrote and a.committed['stdout'] == wrote[0]['detail']['stdout_bytes']):
            self.send('driver', 'ABORT_NOW')  # r4: after the JSONL objects were relayed, so the signal path checks a non-empty prefix
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
        return {'diag': 'CONSTANT_DIAGNOSTIC_NOT_SDK_EXECUTION', 'sdk': 'SDK_CLIENT_OBSERVATION_REFERENCE_PROFILE_NOT_PARITY_RECEIPT'}[self.kind]

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
                                                 'case_plan': case_plan(self.case), 'case_plan_file': {'path': PLAN.name, 'sha256': sha_path(PLAN)},
                                                 'spec': self.spec})

    def take_budget(self):
        if self.kind == 'sdk':
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
            rl = list(open_streams) + list(readers)
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
        self.track_processes()
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
        wire = frozen_wire(ts_fixture(self.case))
        verdict, reasons, facts = OBS.reconcile(self.logs, 'typescript', {'checks': checks}, wire, self.signal_sent_ns)
        ev = self.evidence
        for r, log in self.logs.items():
            (ev / ('events-%s.bin' % r)).write_bytes(bytes(log.raw))
            (ev / ('events-%s.jsonl' % r)).write_text(''.join(compact(e) + '\n' for e in log.events))
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
                   'case_input_sha256_supervisor': self.case_input_sha256,
                   'case_input_sha256_recomputed': sha_bytes(compact(cfg_copy['case_input']).encode('utf-8')),
                   'control_actions': [x for x in self.actions if x['action'] == 'CONTROL'],
                   'supervisor_kills': [x for x in self.actions if x['action'] in SUPERVISOR_KILLS],
                   'step_witness': list(self.step_witness), 'role_mapped': sorted(self.role_host), 'termination': self.term,
                   'signal_sent_ns': self.signal_sent_ns, 'timed_out': timed_out}
        result = {'kind': self.result_kind(), 'case': self.case, 'unit': self.unit, 'attempt': self.attempt,
                  'language': 'typescript', 'verdict': verdict, 'reasons': reasons, 'facts': facts, 'os_checks': checks,
                  'role_status': {r: log.status() for r, log in self.logs.items()},
                  'role_violation': {r: log.violation for r, log in self.logs.items()},
                  'role_host': self.role_host, 'adapter_environ': self.adapter_environ, 'maps_witness': self.maps,
                  'cgroup_limits': getattr(self, 'limits', None), 'cgroup_peaks_sampled': self.peaks,
                  'service_before': self.service, 'service_after': after, 'cgroup_events_after': cg_events, 'systemd_run_rc': rc,
                  'actions': self.actions, 'frames': {r: len(log.events) for r, log in self.logs.items()},
                  'raw_frame_bytes': {r: log.raw_bytes for r, log in self.logs.items()},
                  'case_artifact_bytes': self.case_bytes(), 'service_output_bytes': self.service_bytes, 'signal_sent_ns': self.signal_sent_ns,
                  'step_witness': list(self.step_witness), 'termination': self.term, 'timed_out': timed_out,
                  'case_input_sha256_supervisor': self.case_input_sha256, 'wire_check': facts.get('wire_check'),
                  't0_monotonic_ns': str(self.t0), 'source_freeze': self.freeze, 'identity_freeze': self.identity,
                  'elapsed_ns': time.monotonic_ns() - self.t0, 'functional_receipts': 0, 'observed_at': now_iso()}
        if self.kind == 'diag':
            self.facts = facts
            diag_checks = self.diag_checks(verdict)
            status = 'DIAG_PASS' if verdict == self.spec['expect'] and all(diag_checks.values()) else 'DIAG_FAIL'
            result.update({'expected_verdict': self.spec['expect'], 'status': status, 'diag_checks': diag_checks,
                           'SDK_imports': 0, 'compiler_imports': 0})
            save_json(ev / 'result.json', result)
            ledger_result(self.kind, self.unit, self.case, '%s/%s' % (status, verdict))
            return result
        acceptance = ACC.evaluate(self.case, self.logs, verdict, reasons, witness)
        save_json(ev / 'acceptance.json', acceptance)
        result.update({'outcome': acceptance['outcome'], 'status': 'EXECUTED_ONCE', 'acceptance': 'acceptance.json',
                       'SDK_runtime': 'RUN_ONCE_CONTAINED', 'compiler_runtime': 'NOT_IN_THIS_SERVICE', 'parity_credit': 0})
        save_json(ev / 'result.json', result)
        ledger_result(self.kind, self.unit, self.case, '%s/%s' % (acceptance['outcome'], verdict))
        return result

    def diag_checks(self, verdict):
        d, a, p = self.logs['driver'], self.logs['adapter'], self.logs['peer']
        c = {}
        case = self.case
        order = [x['detail'].get('command') + '->' + x['detail'].get('role') for x in self.actions if x['action'] == 'CONTROL']
        # F4-01: every role that emitted BEGIN reports the supervisor's sha of the delivered case_input.
        role_shas = {r: self.logs[r].case_input_sha256 for r in ('driver', 'adapter', 'peer') if self.logs[r].events}
        c['case_input_role_witness'] = bool(role_shas) and all(v == self.case_input_sha256 for v in role_shas.values())
        if case == 'DIAG-TS-ECHO':
            st = d.milestones('LOADER_SELFTEST')
            tg = d.milestones('TRANSPILE_GATE')
            own = d.milestones('OWN_FIXTURE_CHILD_CLOSED')
            c['loader_selftest'] = bool(st) and st[0]['detail']['pass'] is True
            c['transpile_refused_before_compiler'] = bool(tg) and tg[0]['detail']['pass'] is True
            c['nonzero_exit_mirrored'] = bool(own) and own[0]['detail']['code'] == 3
        elif case == 'DIAG-TS-ABORT':
            own = d.milestones('OWN_FIXTURE_CHILD_CLOSED')
            c['abort_after_witnesses'] = 'ABORT_NOW->driver' in order
            # F4-02 under a signal: the committed JSONL objects are a (here complete) prefix of the frozen bytes.
            c['signal_wire_prefix_checked'] = self.facts.get('wire_check') == 'PREFIX' and a.committed['stdout'] > 0
            c['adapter_signal_and_incomplete_end'] = a.signal == 'SIGTERM' and a.terminal == 'END'
            c['adapter_died_by_sigterm'] = bool(own) and own[0]['detail']['signal'] == 'SIGTERM'
            c['peer_received_forwarded_signal'] = p.signal == 'SIGTERM'
            t = self.term.get('adapter') or {}
            c['adapter_os_termination_tracked'] = t.get('zombie_exit_code') == 15 or t.get('absent') is True
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
        elif case == 'DIAG-TS-C3VOCAB':
            c.update(c3vocab_checks(self.logs, self.step_witness, self.term, order))
        c['final_barrier'] = 'RELEASE_EXIT->driver' in order
        if 'RELEASE_EXIT->driver' in order:
            c['maps_witness_ok'] = bool(self.maps and self.maps['ok'])
        c['verdict_matches_expectation'] = verdict == self.spec['expect']
        return c


SCHEMA_DIR_RE = r'^codex-output-schema-[A-Za-z0-9]{6}$'


def c3vocab_checks(logs, step_witness, term, order):
    """DIAG-TS-C3VOCAB (freeze-r4-c3-delta.json#/diagnostics): own markers, refusals, options_as + mutate + identity, events.consume
    over the kept own generator, GETTER_WITNESS by JSON.stringify and Object.entries with an own directory in /work/tmp, the
    zero-invocation summary, LAZY_POINT, SUSPENDED + throw and CHILD_HELD + abort over an own adapter child."""
    import re
    d, a, p = logs['driver'], logs['adapter'], logs['peer']
    c = {}
    first = lambda name: (d.milestones(name) or [{'detail': {}}])[0]['detail']
    vm, vr, oi = first('VOCAB_MARKERS'), first('VOCAB_REFUSALS'), first('OPTIONS_IDENTITY')
    c['markers_materialized'] = len(vm) == 8 and all(v is True for v in vm.values())
    c['unknown_vocabulary_refused'] = len(vr) == 10 and all(v is True for v in vr.values())
    c['options_as_identity_and_mutate'] = (oi.get('codex_options_same_object') is True and oi.get('thread_options_same_object') is True
                                           and oi.get('mutated_model') == 'own-m-b' and oi.get('mutated_base_url') == 'http://127.0.0.1:9/own-b')
    y8 = [e['data'] for e in ACC.api(d, '8:yield')]
    r8 = [e['data'] for e in ACC.api(d, '8:return')]
    rep = y8[0]['result'] if y8 and isinstance(y8[0]['result'], dict) else {}
    c['lazy_read_after_mutate'] = rep.get('type') == 'own.options' and rep.get('model') == 'own-m-b' and rep.get('base_url') == 'http://127.0.0.1:9/own-b'
    c['events_consume_kept_generator'] = ([y['result'].get('type') for y in y8] == ['own.options', 'thread.started', 'thread.started']
                                          and len(r8) == 1 and r8[0]['observations'].get('events') == 3
                                          and len(ACC.api(d, '3:Thread.runStreamed')) == 1 and not ACC.api(d, '3:yield'))
    c['thread_id_is_undefined'] = (len(y8) == 3 and y8[1]['observations'] == {'thread_id': 'own-1', 'index': 1}
                                   and y8[2]['observations'] == {'thread_id_is_undefined': True, 'index': 2}
                                   and len(r8) == 1 and r8[0]['observations'] == {'events': 3, 'thread_id_is_undefined': True})
    gw = ACC.detail_of(d, 'GETTER_WITNESS')
    wa = [g for g in gw if g.get('id') == 'wA']
    wb = [g for g in gw if g.get('id') == 'wB']
    dir_a = wa[0]['entries'][0][0] if len(wa) == 1 and isinstance(wa[0].get('entries'), list) and len(wa[0]['entries']) == 1 else None
    c['getter_witness_json_stringify'] = (len(wa) == 1 and wa[0].get('step') == 8 and wa[0].get('invocations') == 1 and dir_a is not None
                                          and re.fullmatch(SCHEMA_DIR_RE, dir_a) is not None and wa[0]['entries'] == [[dir_a, []]] and 'error' not in wa[0])
    c['getter_witness_object_entries'] = (len(wb) == 1 and wb[0].get('step') == 8 and wb[0].get('invocations') == 1
                                          and wb[0].get('entries') == [[dir_a, ['schema.json']]] and 'error' not in wb[0])
    done = first('CALLS_DONE')
    c['getter_summary_with_zero'] = done.get('getter_witnesses') == [{'id': 'wB', 'invocations_total': 1}, {'id': 'wA', 'invocations_total': 1},
                                                                    {'id': 'wZ', 'invocations_total': 0}]
    lst = {str(x['step']): x['entries'] for x in ACC.detail_of(d, 'TMP_LISTING')}
    sw = {(x['kind'], str(x['step'])): x for x in step_witness}
    lazy = sw.get(('LAZY_POINT', '4'))
    c['lazy_point_zero_spawn'] = lazy is not None and lazy['adapter_processes'] == 0 and lazy['peer_processes'] == 0
    c['events_consume_cleanup_listing'] = lst.get('8') == []
    susp = sw.get(('SUSPENDED', '10'))
    wit10 = [x for x in ACC.detail_of(d, 'STEP_WITNESS') if x.get('kind') == 'SUSPENDED' and x.get('step') == 10]
    th = [x for x in ACC.detail_of(d, 'THROW_PROPAGATED') if x.get('step') == 10]
    e10 = [e['data'] for e in ACC.api(d, '10:Thread.runStreamed') if e['kind'] == 'API_ERROR']
    c['suspended_witness_and_throw'] = (susp is not None and len(wit10) == 1 and len(wit10[0]['entries']) == 1
                                        and wit10[0]['entries'][0][1] == ['schema.json'] and 'STEP_RELEASE->driver' in order
                                        and [y['data']['result'] for y in ACC.api(d, '10:yield')] == [{'type': 'own.first'}]
                                        and len(th) == 1 and th[0]['same_object'] is True and len(e10) == 1 and e10[0]['name'] == 'Error'
                                        and e10[0]['message'] == 'cvg own throw' and e10[0]['cause'] is None and lst.get('10') == [])
    held = sw.get(('CHILD_HELD', '11'))
    ar = [x for x in ACC.detail_of(d, 'ABORT_REQUESTED') if x.get('step') == 11]
    rt = [x for x in ACC.detail_of(d, 'ABORT_RETURNED') if x.get('step') == 11]
    e11 = [e['data'] for e in ACC.api(d, '11:Thread.runStreamed') if e['kind'] == 'API_ERROR']
    det11 = ACC.err_detail(d, '11:Thread.runStreamed') or {}
    c['child_held_then_abort'] = (held is not None and held['request_held_frames'] >= 1 and held['adapter_alive'] is True
                                  and len(ar) == 1 and len(rt) == 1 and rt[0]['aborted'] is True and len(e11) == 1
                                  and e11[0]['name'] == 'AbortError' and e11[0]['message'] == 'The operation was aborted'
                                  and det11.get('code') == 'ABORT_ERR' and not ACC.api(d, '11:yield'))
    c['abort_signal_cascade'] = a.signal == 'SIGTERM' and a.terminal == 'END' and p.signal == 'SIGTERM'
    t = term.get('adapter') or {}
    c['adapter_os_termination_tracked'] = t.get('zombie_exit_code') == 15 or t.get('absent') is True
    c['no_own_kill'] = not d.milestones('ABORT_CALLED')
    return c


# --------------------------------------------------------------------------- staging, identity freeze, admission

def stage():
    """Private runtime copies of the admitted trees and of the sealed emit, each manifest-checked (no acquisition, no network)."""
    adm = json.loads(ADMISSION_IDENTITY.read_text())
    assert sha_path(ADMISSION_IDENTITY) == ADMISSION_IDENTITY_SHA
    for name, dst in (('sdk-python', SDK_PY_TREE), ('python-deps', PY_DEPS_TREE)):
        if not dst.exists():
            stage_tree(STAGED_PY_FROM / name, dst)
        assert tree_manifest(dst) == adm['trees'][name], '%s differs from the admitted tree' % name
    if not TS_TREE.exists():
        stage_tree(STAGED_TS_FROM / 'trees' / 'typescript-5.9.2', TS_TREE)
    if not EMITTED.exists():
        stage_tree(STAGED_TS_FROM / 'emitted', EMITTED)
    validation = json.loads((ARTIFACTS / 'validation.json').read_text())
    deps_expected = {f['path']: {'bytes': f['bytes'], 'sha256': f['sha256']} for f in validation['merged_python']['files']}
    assert tree_manifest(PY_DEPS_TREE) == deps_expected, 'python-deps differs from the authenticated validation.json merge'
    ts_row = [r for r in validation['rows'] if r['name'] == 'typescript'][0]
    assert tree_manifest(TS_TREE) == {f['path']: {'bytes': f['bytes'], 'sha256': f['sha256']} for f in ts_row['files']}, 'typescript tree'
    emit = check_emit_record()
    return {'sdk-python': len(tree_manifest(SDK_PY_TREE)), 'python-deps': len(tree_manifest(PY_DEPS_TREE)),
            'typescript-5.9.2': len(tree_manifest(TS_TREE)), 'emitted': len(emit['files'])}


def freeze_identities():
    src = check_source_freeze()
    adm = json.loads(ADMISSION_IDENTITY.read_text())
    assert sha_path(ADMISSION_IDENTITY) == ADMISSION_IDENTITY_SHA
    trees = {'sdk-python': tree_manifest(SDK_PY_TREE), 'python-deps': tree_manifest(PY_DEPS_TREE)}
    assert trees['sdk-python'] == adm['trees']['sdk-python'] and trees['python-deps'] == adm['trees']['python-deps'], 'staged trees drift'
    validation = json.loads((ARTIFACTS / 'validation.json').read_text())
    ts_row = [r for r in validation['rows'] if r['name'] == 'typescript'][0]
    assert tree_manifest(TS_TREE) == {f['path']: {'bytes': f['bytes'], 'sha256': f['sha256']} for f in ts_row['files']}, 'typescript tree'
    packaging = ('packaging/version.py', '635693b717b7b27db138c6b905d23ce7e01c1eec9b6da9ce56412fbd24510bc2')
    assert sha_path(PY_DEPS_TREE / packaging[0]) == packaging[1], 'packaging/version.py anchor'
    static = json.loads((ADMISSION / 'static-admission.json').read_text())
    assert static['status'] == 'PASS', 'static admission not PASS'
    emit = check_emit_record()
    ident = {'kind': 'IDENTITY_FREEZE_R4_C31', 'status': 'FROZEN_BEFORE_SERVICES', 'task': 'DX100-G02:IMPLEMENT-AND-ADMIT-SDK-SOURCE-CONTINUATION-3-1',
             'source_freeze': src, 'trees': trees, 'pydeps_anchors': {packaging[0]: packaging[1]},
             'dependency_identity': {'pydantic': '2.13.4', 'pydantic_core': '2.46.4'},
             'typescript_js': {'path': str(TS_TREE / TYPESCRIPT_JS[0]), 'sha256': TYPESCRIPT_JS[1], 'bytes': TYPESCRIPT_JS[2]},
             'ts_sources': ts_source_hashes(), 'emit_record': {k: emit[k] for k in ('path', 'sha256')},
             'static_admission': {'path': 'g02/sdk-admission/static-admission.json', 'sha256': sha_path(ADMISSION / 'static-admission.json')},
             'admission_identity_freeze': {'path': 'g02/sdk-admission/identity-freeze.json', 'sha256': ADMISSION_IDENTITY_SHA},
             'case_input_anchors': case_input_anchors(), 'host': {k: list(v) for k, v in HOST.items()}, 'service_properties': PROPS,
             'sandbox_env': FIXED_ENV, 'ts_sdk_env': TS_SDK_ENV,
             'argv': {'typescript': {role: role_argv(role, 'CASE_ID') for role in ('driver', 'adapter', 'peer')},
                      'python': {'driver': ['/runtime/python', '-I', '-S', '/profile/python-driver.py', '--case', 'CASE_ID'],
                                 'adapter': ['/runtime/python', '-I', '-S', '/profile/adapter-python.py'],
                                 'peer': ['/runtime/python', '-I', '-S', '/profile/fixture-rpc.py', '--case', 'CASE_ID']}},
             'control_argv': SPEC_CASES[CONTROL_CASE]['case_input']['control_client']['argv'],
             'spec_inputs': spec_hashes(), 'frozen_at': now_iso(),
             'note': ('D3-06: antes de qualquer serviço; vale para as duas pilhas (driver TypeScript e pilha Python do CONTROL); os DIAG ficam '
                      'em diag-admission-c31.json. Nenhuma capacidade nova (Q4 negada pelo usuário).')}
    save_new_json(IDENTITY, ident)
    return ident


def diag_admission():
    src = check_source_freeze()
    idf = check_identity_freeze()
    diag, missing = {}, []
    for case in ADMISSION_DIAGS:
        passes, fails = [], []
        for d in sorted(DIAG_DIR.glob('*-' + case)):
            r = json.loads((d / 'result.json').read_text())
            row = {'dir': str(d.relative_to(UNIT)), 'unit': r['unit'], 'verdict': r['verdict'], 'status': r.get('status')}
            (passes if r.get('status') == 'DIAG_PASS' and r.get('source_freeze', {}).get('sha256') == src['sha256'] else fails).append(row)
        if not passes:
            missing.append({'case': case, 'runs': fails})
            continue
        diag[case] = passes[-1]
    assert not missing, 'BLOCKED: no DIAG_PASS of %s (every C3-1 DIAG is a stop condition)' % [m['case'] for m in missing]
    doc = {'kind': 'DIAG_ADMISSION_C31', 'task': 'DX100-G02:IMPLEMENT-AND-ADMIT-SDK-SOURCE-CONTINUATION-3-1', 'source_freeze': src,
           'identity_freeze': idf, 'admission_diagnostics': diag, 'conditional_slots': 'nenhuma (execution-budget-c3-1.json)',
           'recorded_at': now_iso()}
    save_new_json(DIAG_ADMISSION, doc)
    return doc


def init_ledgers():
    save_new_json(BUDGET, {'kind': 'SERVICE_BUDGET', 'services_max': 12, 'services_used': 0, 'planned': ADMISSION_DIAGS,
                           'rule': 'qualification services only (4 in reserve, admission diagnostics only); never a case repetition; no automatic retry; '
                                   'shared by the TypeScript and Python lanes, services in series',
                           'history': [], 'updated_at': now_iso()})
    slots = {c: {'status': 'UNUSED'} for c in [CONTROL_CASE] + SDK_CASES_TS}
    assert len(slots) == 15
    save_new_json(CASE_LEDGER, {'kind': 'SINGLE_USE_CASE_SLOTS', 'slots_max': 15, 'used': 0, 'slots': slots,
                                'rule': 'one service per slot, once, serial, no retry; C31-CTRL01 first (gate: MISMATCH by rule 6 only from '
                                        'wire.no_turn_interrupt, sanities approved); then the 14 TypeScript slots in slot order; no conditional slot',
                                'updated_at': now_iso()})


def main(argv):
    if argv[:1] == ['stage']:
        print(json.dumps(stage()))
        return 0
    if argv[:1] == ['fixtures']:
        b = fixture_bytes()
        FIXTURES.write_bytes(b)
        print(json.dumps({'fixture_cases_ts_sha256': sha_bytes(b), 'rows': len(json.loads(b))}))
        return 0
    if argv[:1] == ['plan']:
        plan = {c: case_plan(c) for c in SDK_CASES_TS + sorted(DIAG)}
        save_json(PLAN, {'kind': 'CASE_PLAN_FROM_SUPERVISOR_TABLES_TS', 'cases': plan, 'diagnostics': DIAG,
                         'admission_diagnostics': ADMISSION_DIAGS, 'conditional_slots': CONDITIONAL})
        print(len(plan))
        return 0
    if argv[:1] == ['init-ledgers']:
        init_ledgers()
        print('ledgers written')
        return 0
    if argv[:1] == ['freeze']:
        files = source_freeze_files()
        save_new_json(FREEZE, {'kind': 'SOURCE_FREEZE', 'task': 'DX100-G02:IMPLEMENT-AND-ADMIT-SDK-SOURCE-CONTINUATION-3-1', 'files': files,
                               'file_count': len(files), 'frozen_at': now_iso()})
        print(json.dumps({'freeze': FREEZE.name, 'sha256': sha_path(FREEZE), 'files': len(files)}))
        return 0
    if argv[:1] == ['freeze-identities']:
        freeze_identities()
        print(json.dumps({'identity_freeze': IDENTITY.name, 'sha256': sha_path(IDENTITY)}))
        return 0
    if argv[:1] == ['diag-admission']:
        doc = diag_admission()
        print(json.dumps({'diag_admission': DIAG_ADMISSION.name, 'sha256': sha_path(DIAG_ADMISSION), 'diagnostics': sorted(doc['admission_diagnostics'])}))
        return 0
    if len(argv) == 2 and argv[0] == 'run':
        case = argv[1]
        if case in SDK_CASES_TS:
            assert DIAG_ADMISSION.exists(), 'BLOCKED: no diag-admission-c31.json'
            control_gate()
            slot_order_gate(case)
        result = Attempt(case).run()
        keys = ('case', 'unit', 'kind', 'verdict', 'outcome', 'status', 'reasons', 'diag_checks', 'os_checks', 'role_status', 'elapsed_ns')
        print(json.dumps({k: result.get(k) for k in keys}, indent=1))
        return 0 if result['status'] in ('DIAG_PASS', 'EXECUTED_ONCE') else 1
    print(__doc__)
    return 2


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
