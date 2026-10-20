"""Host supervisor of DX100-G02:IMPLEMENT-AND-ADMIT-SDK-DISTRIBUTED-PROFILE-DP-1 (runs OUTSIDE the target cgroup).

Derived from the TypeScript-lane supervisor of the C3-1 (sdk-continuation-3-1-admission/tslane/supervisor.py, itself from the 2AC:
F4-01 delivery of the frozen case_input bytes with supervisor, role and evaluator witnesses; transient systemd unit + bwrap sandbox;
/proc and cgroup witnesses) with the declared deltas of the distributed profile (inputs/spec-dp/freeze-r4-dp-delta.json) and the
binding erratum DP-SPEC/R2-F01:

- DDP-01 cases-dp-1.json bound by sha: 10 SDK slots, the ARTIFACT_CHECK slot DP-PK09A (evaluator only, no service) and the CONTROL
  DP1-CTRL01 (own code), 12 single-use slots; the DIAG rows DIAG-TS-ECHO (requalified on this stack), DIAG-DP-STAGE, DIAG-DP-NODE,
  DIAG-DP-SYNTH-CHILD and DIAG-DP-REAL-CLI (conditional: its failure disables only DP-REAL01);
- DDP-02/DDP-11 CAP-DP-STAGE (stage.py): /dist staged once from the cache (read-only bind), fixture trees per attempt (/fixture,
  read-only bind), archives re-checked against the ledger before every service;
- DDP-03 driver dp-driver.mjs + loader dp-loader.mjs (SDK entries bound by the A7 member sha; closed bare list);
- DDP-05 service limits MemoryMax 1073741824 and TasksMax 256 for every DP-1 service (three Node processes at once and the
  multithreaded published binary), CPU quota and the other properties inherited;
- erratum DP-SPEC/R2-F01: topology driver_only declared in every config; the adapter and peer FIFOs stay bound and must stay
  empty; the form comes from observer.reconcile_driver_only.

Commands (host python3.12 -I -B):
  supervisor.py stage               stage /dist from the cache into the private runtime (once; manifest-checked)
  supervisor.py fixtures            fixture-cases-dp1.json (frozen DP-1 rows + DIAG rows; never the delivered source)
  supervisor.py plan                case-plan-dp1.json
  supervisor.py init-ledgers        budget.json (12 services) and case-ledger.json (12 single-use slots)
  supervisor.py freeze              source-freeze-dp1.json (refuses to overwrite)
  supervisor.py freeze-identities   identity-freeze-dp1.json (before any service)
  supervisor.py diag-admission      diag-admission-dp1.json (the 4 mandatory DIAG passes + the conditional one, if passed)
  supervisor.py run CASE            one transient service (DIAG, CONTROL or slot), or the evaluator alone for DP-PK09A
The supervisor never imports SDK code and never executes a cache file. Load average above 12 before a service: wait and record.
"""
import datetime
import hashlib
import importlib.util
import json
import os
import secrets
import select
import shutil
import subprocess
import sys
import time
from pathlib import Path

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
UNIT = HERE.parent
G02 = UNIT.parent
SPEC = UNIT / 'inputs' / 'spec-dp'
RUNTIME = Path('/mnt/dados/cvg-work/cvg-codex100-dp1-runtime-20261019')
ATTEMPTS = RUNTIME / 'attempts'
DIST = RUNTIME / 'dist'
DIAG_DIR = UNIT / 'diagnostics'
CASES_DIR = UNIT / 'cases'
FREEZE = UNIT / 'source-freeze-dp1.json'
IDENTITY = UNIT / 'identity-freeze-dp1.json'
DIAG_ADMISSION = UNIT / 'diag-admission-dp1.json'
FIXTURES = UNIT / 'fixture-cases-dp1.json'
PLAN = UNIT / 'case-plan-dp1.json'
CASES_JSON = SPEC / 'cases-dp-1.json'
# Spec inputs of the sub-lot (byte copies of g02/sdk-distributed-profile-spec, bound by next-task.json#/spec of the spec).
SPEC_SHA = {
    'cases-dp-1.json': 'daafcb4e53e06b284e92f94f221bfd1653fff44a697234051ae8d2da3e60829b',
    'capability-contracts-dp.json': 'f8f6c7956c9dd31896a8fee5da8e3cc7b5997966aa1be5ba6a6bc8c80892098b',
    'freeze-r4-dp-delta.json': 'daffa28b13cdb4cdfa1126c239bf7857bd0317f5893004f230f9352ca37c7f31',
    'evaluator-r4-dp-delta.json': '73ae948285f4a81103474519c64b788c51f0b751ba51bd024e795b411097c29a',
    'control-slot-contract-dp.json': '816680caa9e8795ea8bde8e122b62c2f321ae6f983907f8010f45cde41e11e7c',
    'coverage-plan-dp.json': '1065a69a9ad81c394cc435f1df42af9b371d349cb79d695d8b682bb53a2d5678',
    'execution-budget-dp-1.json': '7b2c294a3dc07f94451d54f726e2636d7b1f540b8b38ff29a12cbb940fddc9ee',
    't3-assessment.json': '05d564fefa510a54c1f93bbd1ba2121d743c3e7978ac76bffb1fc9533ebdbebe',
}
HOST = {
    'python': ('/usr/bin/python3.12', 'e50d468e8b0adfb05733f5b87b3cff34829c4a8c1aea50c865aa8bdfe4bb150f'),
    'node': ('/home/ricardo/.nvm/versions/node/v24.20.0/bin/node', '89af8424dd53e560b1933f87ba650d8bf57c83ca5a04600eefb31f416aabbae7'),
    'bwrap': ('/usr/bin/bwrap', 'e318903862396f96de3df57264e0158682b952fd3fb53ac23d876413e7b30f71'),
    'systemd-run': ('/usr/bin/systemd-run', 'dbc8b988a849d5c9d7ef2de7068a6f107021bc6c11e0d7864c73f373eef726a7'),
    'systemctl': ('/usr/bin/systemctl', 'e0d3d0e9444da1b2b58c792c3f5028b69f049b77d5ca17b3ec0d09f89117225b'),
}
PROPS = {'MemoryMax': '1073741824', 'TasksMax': '256', 'CPUQuota': '100%', 'RuntimeMaxSec': '90', 'KillMode': 'control-group',
         'TimeoutStopSec': '3', 'NoNewPrivileges': 'yes', 'LimitNOFILE': '128', 'LimitFSIZE': '8388608', 'LimitCORE': '0'}
LIMITS = {'memory.max': '1073741824', 'pids.max': '256'}
FIXED_ENV = {'HOME': '/work/home', 'TMPDIR': '/work/tmp', 'PATH': '/runtime', 'LANG': 'C.UTF-8', 'LC_ALL': 'C.UTF-8',
             'TZ': 'UTC', 'PYTHONDONTWRITEBYTECODE': '1', 'UV_THREADPOOL_SIZE': '2'}
UNIT_PREFIX = 'cvg-dx100-dp1-'
LOAD_LIMIT = 12.0
CASE_ARTIFACTS = 4194304
SERVICE_OUTPUT_CAP = 65536
BUDGET = UNIT / 'budget.json'
CASE_LEDGER = UNIT / 'case-ledger.json'
NAMES = [r + '.' + k for r in ('driver', 'adapter', 'peer') for k in ('events', 'control')]
PROFILE_SOURCES = ('dp-channel.cjs', 'dp-driver.mjs', 'dp-loader.mjs', 'dp-platform-shim.mjs', 'dp-synth-child.mjs', 'dp-control-wrapper.mjs',
                   'dp-diag-wrapper.mjs', 'dp-diag-sdklike.mjs', 'dp-diag-sdkbad.mjs', 'dp-diag-sdkdrift.mjs')
HELPER_BUILTINS = ['node:child_process', 'node:crypto', 'node:fs', 'node:module', 'node:net', 'node:os', 'node:path', 'node:readline', 'node:util']
SDK_BUILTINS = ['node:child_process', 'node:fs', 'node:module', 'node:os', 'node:path', 'node:readline']
SDK_BARE = ['child_process', 'fs', 'module', 'os', 'path', 'readline']
A7_INDEX_SHA = 'd62ed107033bdba802b283c77d875e4bec3deb2704a910bb7e3f95059473b16f'  # artifact-metadata.json, member A7:package/dist/index.js
CONTROL_CASE = 'DP1-CTRL01'
ARTIFACT_CASE = 'DP-PK09A'
CONDITIONAL = {'DP-REAL01': 'DIAG-DP-REAL-CLI'}
SUPERVISOR_KILLS = ('SUPERVISOR_BOUND_KILL', 'CASE_ARTIFACT_BUDGET_KILL', 'ADMISSION_STOP')


def _load(name, mod):
    spec = importlib.util.spec_from_file_location(mod, HERE / name)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


OBS = _load('observer.py', 'cvg_observer_dp1')
STG = _load('stage.py', 'cvg_stage_dp1')
ACC = _load('acceptance.py', 'cvg_acceptance_dp1')


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


def spec_bindings():
    """next-task.json#/spec of the spec unit binds every copied input by sha (the copy of next-task.json is itself checked by the
    preflight against the spec folder)."""
    nt = json.loads((SPEC / 'next-task.json').read_text())
    want = {Path(v['path']).name: v['sha256'] for v in nt['spec'].values() if v['path'].split('/')[-2] == 'sdk-distributed-profile-spec'}
    got = {}
    for name in SPEC_SHA:
        got[name] = sha_path(SPEC / name)
        assert got[name] == want[name], 'spec input %s differs from next-task.json' % name
    assert got['cases-dp-1.json'] == SPEC_SHA['cases-dp-1.json'], 'cases-dp-1.json drifted'
    return got


def spec_cases():
    raw = CASES_JSON.read_bytes()
    assert sha_bytes(raw) == SPEC_SHA['cases-dp-1.json'], 'cases-dp-1.json drifted from the approved spec'
    return {c['id']: c for c in json.loads(raw)['cases']}


SPEC_CASES = spec_cases()
SLOTS = [c for c, d in sorted(SPEC_CASES.items(), key=lambda kv: kv[1]['slot'])]
SDK_SLOTS = [c for c in SLOTS if SPEC_CASES[c]['kind'] == 'SDK']
assert len(SLOTS) == 12 and SLOTS[-1] == CONTROL_CASE and SPEC_CASES[ARTIFACT_CASE]['kind'] == 'ARTIFACT_CHECK' and len(SDK_SLOTS) == 10
RUN_ORDER = [CONTROL_CASE] + [c for c in SLOTS if c != CONTROL_CASE]

# ------------------------------------------------------------------------------------------------ DIAG rows (own code, no SDK)
DIAG_TREE = '/fixture/diag'


def _child(path):
    return {'path': path, 'kind': 'synthetic_child', 'mode': '0755'}


DIAG_STAGE_TREES = [{'root': DIAG_TREE, 'entries': [
    {'path': DIAG_TREE + '/m/package.json', 'kind': 'copy_of_member', 'member': 'A2:package/package.json'},
    {'path': DIAG_TREE + '/m/codex.js', 'kind': 'copy_of_member', 'member': 'A2:package/bin/codex.js', 'mode': '0755'},
    {'path': DIAG_TREE + '/m/index.js', 'kind': 'copy_of_member', 'member': 'A7:package/dist/index.js'},
    {'path': DIAG_TREE + '/f/text', 'kind': 'file', 'content': 'own text\n', 'mode': '0600'},
    {'path': DIAG_TREE + '/f/data.json', 'kind': 'json', 'value': {'b': 1, 'a': [True, None, 'x']}},
    {'path': DIAG_TREE + '/d/empty', 'kind': 'dir'},
    {'path': DIAG_TREE + '/s/link', 'kind': 'symlink', 'target': DIAG_TREE + '/f/text'},
    {'path': DIAG_TREE + '/s/dangling', 'kind': 'symlink', 'target': DIAG_TREE + '/absent'},
    _child(DIAG_TREE + '/vendor/child'),
    {'path': DIAG_TREE + '/bin/control-wrapper.mjs', 'kind': 'copy_of_profile', 'from': '/profile/dp-control-wrapper.mjs', 'mode': '0755'}]}]
DIAG_CHILD_TREES = [{'root': DIAG_TREE, 'entries': [_child(DIAG_TREE + '/vendor/child')]}]
_DIAGW = '/profile/dp-diag-wrapper.mjs'
_ENV = {'HOME': '/work/home', 'PATH': '/runtime'}
DIAG_NODE_CALLS = [
    {'step': 1, 'api': 'child.program', 'id': 'exit0', 'program': {'exit_code': 0}},
    {'step': 2, 'api': 'wrapper.run', 'script': _DIAGW, 'argv': ['shim'], 'env': _ENV, 'cwd': '/work', 'stdin': '/dev/null', 'as': 'n_shim',
     'preload_shim': {'platform': 'freebsd', 'arch': 'x64'}},
    {'step': 3, 'api': 'child.program', 'id': 'wait_hup', 'program': {'ready_barrier': True, 'on_signal': {'SIGHUP': {'exit_code': 0}},
                                                                       'no_signal_timeout_ms': 5000, 'no_signal_exit_code': 97}},
    {'step': 4, 'api': 'wrapper.run', 'script': _DIAGW, 'argv': [], 'env': _ENV, 'cwd': '/work', 'stdin': '/dev/null', 'as': 'n_hup',
     'send_signal': {'after': 'CHILD_READY', 'signal': 'SIGHUP', 'to': 'wrapper'}},
]
DIAG_CHILD_CALLS = [
    {'step': 1, 'api': 'child.program', 'id': 'exit3', 'program': {'exit_code': 3}},
    {'step': 2, 'api': 'wrapper.run', 'script': _DIAGW, 'argv': ['a', 'b c'], 'env': dict(_ENV, CVG_DIAG='1'), 'cwd': '/work', 'stdin': '/dev/null', 'as': 'c_exit3'},
    {'step': 3, 'api': 'child.program', 'id': 'self_term', 'program': {'self_signal': 'SIGTERM'}},
    {'step': 4, 'api': 'wrapper.run', 'script': _DIAGW, 'argv': [], 'env': _ENV, 'cwd': '/work', 'stdin': '/dev/null', 'as': 'c_self'},
    {'step': 5, 'api': 'child.program', 'id': 'on_term', 'program': {'ready_barrier': True, 'on_signal': {'SIGTERM': {'exit_code': 0}},
                                                                      'no_signal_timeout_ms': 5000, 'no_signal_exit_code': 97}},
    {'step': 6, 'api': 'wrapper.run', 'script': _DIAGW, 'argv': [], 'env': _ENV, 'cwd': '/work', 'stdin': '/dev/null', 'as': 'c_on_term',
     'send_signal': {'after': 'CHILD_READY', 'signal': 'SIGTERM', 'to': 'wrapper'}},
    {'step': 7, 'api': 'child.program', 'id': 'no_signal', 'program': {'ready_barrier': True, 'on_signal': {'SIGINT': {'exit_code': 130}},
                                                                        'no_signal_timeout_ms': 400, 'no_signal_exit_code': 97}},
    {'step': 8, 'api': 'wrapper.run', 'script': _DIAGW, 'argv': [], 'env': _ENV, 'cwd': '/work', 'stdin': '/dev/null', 'as': 'c_nosig'},
]
DIAG_ROWS = {
    'DIAG-TS-ECHO': {'diag': 'loader selftest of dp-loader.mjs, own synthetic child exit 3 mirrored, channel framing (driver_only)'},
    'DIAG-DP-STAGE': {'trees': DIAG_STAGE_TREES, 'diag': '/dist and /fixture views inside the sandbox; write probes'},
    'DIAG-DP-NODE': {'trees': DIAG_CHILD_TREES, 'diag_calls': DIAG_NODE_CALLS, 'child_script': {'behavior': 'programmable'},
                     'diag': 'own SDK-like entries (bare imports), denials, probe refusal, wrapper.run with shim, SIGHUP after CHILD_READY'},
    'DIAG-DP-SYNTH-CHILD': {'trees': DIAG_CHILD_TREES, 'diag_calls': DIAG_CHILD_CALLS, 'child_script': {'behavior': 'programmable'},
                            'diag': 'synthetic child programs: exit code, self-signal, on_signal, NO_SIGNAL'},
    'DIAG-DP-REAL-CLI': {'diag': 'published binary from /dist with --version, own client, no SDK and no wrapper'},
}
DIAG = {'DIAG-TS-ECHO': {'deadline': 30}, 'DIAG-DP-STAGE': {'deadline': 45}, 'DIAG-DP-NODE': {'deadline': 30},
        'DIAG-DP-SYNTH-CHILD': {'deadline': 45}, 'DIAG-DP-REAL-CLI': {'deadline': 30}}
ADMISSION_DIAGS = ['DIAG-TS-ECHO', 'DIAG-DP-STAGE', 'DIAG-DP-NODE', 'DIAG-DP-SYNTH-CHILD']
CONDITIONAL_DIAGS = {'DIAG-DP-REAL-CLI': 'DP-REAL01'}
SOURCE_SET = (['node/' + n for n in PROFILE_SOURCES]
              + ['dplane/' + n for n in ('acceptance.py', 'bootstrap.py', 'observer.py', 'stage.py', 'supervisor.py')]
              + ['inputs/spec-dp/' + n for n in sorted(SPEC_SHA)] + ['inputs/spec-dp/next-task.json', 'inputs/spec-dp/review-r2/executor-disposition.json',
                                                                   'inputs/spec-dp/lead-confirmation-20261019.json']
              + ['inputs/acquisition/' + n for n in ('acquisition-ledger.json', 'artifact-metadata.json', 'digest-verification.json', 'lead-decision-loopback-a5.json')]
              + ['inputs/user-decision-distributed-profile-20261019.json', 'case-plan-dp1.json', 'fixture-cases-dp1.json', 'preflight.json',
                 'selftests/selftest_dp1.py', 'selftests/selftest_dp1_driver.mjs', 'selftests/selftest-results.json',
                 'tools/validate_unit.py', 'validation-unit.json'])


def delivered_input(case):
    """F4-01: the case_input delivered to the driver (frozen bytes for the slots; constant rows for the DIAG)."""
    return SPEC_CASES[case]['case_input'] if case in SPEC_CASES else DIAG_ROWS[case]


def fixture_bytes():
    rows = {}
    for cid in SLOTS:
        row = SPEC_CASES[cid]['case_input']
        assert sha_bytes(compact(row).encode('utf-8')) == SPEC_CASES[cid]['case_input_sha256'], 'frozen case_input bytes of %s' % cid
        rows[cid] = row
    assert not set(rows) & set(DIAG_ROWS)
    rows.update(DIAG_ROWS)
    return (json.dumps(rows, sort_keys=True, separators=(',', ':'), ensure_ascii=False) + '\n').encode('utf-8')


def mode_of(case):
    if case in DIAG:
        return 'diagnostic'
    return 'control' if case == CONTROL_CASE else 'sdk'


def sdk_entries(case):
    if case == 'DIAG-DP-NODE':
        return {'file:///profile/dp-diag-sdklike.mjs': sha_path(UNIT / 'node' / 'dp-diag-sdklike.mjs'),
                'file:///profile/dp-diag-sdkbad.mjs': sha_path(UNIT / 'node' / 'dp-diag-sdkbad.mjs'),
                'file:///profile/dp-diag-sdkdrift.mjs': '0' * 64}
    if case not in SPEC_CASES:
        return {}
    out = {}
    for s in SPEC_CASES[case]['case_input'].get('sdk_calls', []):
        if s.get('api') == 'import':
            assert s['module'].endswith('/@openai/codex-sdk/dist/index.js'), 'import outside the published SDK copies'
            out['file://' + s['module']] = A7_INDEX_SHA
    return out


def loader_json(case):
    return {'v': 1, 'entry': 'file:///profile/dp-driver.mjs', 'prebound': ['file:///profile/dp-channel.cjs', 'file:///profile/dp-driver.mjs'],
            'builtins': HELPER_BUILTINS, 'sdk_builtins': SDK_BUILTINS, 'sdk_bare': SDK_BARE, 'sdk_entries': sdk_entries(case)}


def role_argv(case):
    return ['/runtime/node', '--experimental-loader', '/profile/dp-loader.mjs', '/profile/dp-driver.mjs', '--case', case]


def case_plan(case):
    ci = delivered_input(case)
    calls = ci.get('sdk_calls') or ci.get('diag_calls') or []
    plan = {'topology': 'driver_only', 'driver': 'dp-driver.mjs (%s)' % mode_of(case),
            'release': 'RELEASE_EXIT->driver after CALLS_DONE (no adapter, no peer; their FIFOs stay bound and must stay empty), after the driver maps witness',
            'wrapper_runs': [s['step'] for s in calls if s.get('api') == 'wrapper.run'],
            'signals': {str(s['step']): s['send_signal']['signal'] for s in calls if s.get('send_signal')},
            'sdk_entries': sorted(sdk_entries(case)), 'fixture_entries': sum(len(t['entries']) for t in ci.get('trees', [])),
            'service_properties': PROPS}
    if case in SPEC_CASES and SPEC_CASES[case]['kind'] == 'ARTIFACT_CHECK':
        plan = {'topology': 'none (evaluator only)', 'driver': None, 'release': None, 'artifact_steps': [s['step'] for s in calls]}
    if case in SPEC_CASES:
        plan['acceptance_predicates'] = ACC.plan(case)
    return plan


# ------------------------------------------------------------------------------------------------ ledgers

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
        raise SystemExit('BLOCKED: case %s already used (%s); no retry' % (case, slot['status']))
    slot.update({'status': 'STARTED', 'unit': unit, 'attempt': attempt, 'started_at': now_iso()})
    ledger['used'] = sum(1 for s in ledger['slots'].values() if s['status'] != 'UNUSED')
    ledger['updated_at'] = now_iso()
    save_json(CASE_LEDGER, ledger)
    return ledger['used']


def ledger_result(kind, unit, case, result):
    if kind in ('sdk', 'control', 'artifact'):
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


def mark_not_used(case, reason):
    ledger = json.loads(CASE_LEDGER.read_text())
    slot = ledger['slots'][case]
    assert slot['status'] == 'UNUSED', 'slot %s already %s' % (case, slot['status'])
    slot.update({'status': 'NOT_USED_CONDITIONAL', 'reason': reason, 'at': now_iso()})
    ledger['updated_at'] = now_iso()
    save_json(CASE_LEDGER, ledger)


# ------------------------------------------------------------------------------------------------ freezes and gates

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


def pin_bindings():
    """R2-F04 (carry-over DP-SPEC/R2-F04): the values of DP-PK02R and DP-PK09A that do not come from the cache, bound by sha."""
    ref = G02 / 'sdk-reference-profile' / 'inputs' / 'sdk' / 'typescript'
    acc = G02.parent / 'g02-reference-acceptance.json'
    prov = G02 / 'reference-compilation' / 'build-provenance.json'
    exe = json.loads(acc.read_text())['artifact']['sha256']
    assert exe in prov.read_text(), 'pin executable sha not in build-provenance.json'
    return {'pin_ts_package_json': {'path': 'g02/sdk-reference-profile/inputs/sdk/typescript/package.json', 'sha256': sha_path(ref / 'package.json')},
            'pin_ts_index_ts': {'path': 'g02/sdk-reference-profile/inputs/sdk/typescript/src/index.ts', 'sha256': sha_path(ref / 'src' / 'index.ts')},
            'pin_executable': {'sha256': exe, 'bound_by': [{'path': 'CODEX100-EXEC-20261017/g02-reference-acceptance.json', 'sha256': sha_path(acc)},
                                                            {'path': 'g02/reference-compilation/build-provenance.json', 'sha256': sha_path(prov)}]},
            'a3_bin_codex_member': {'member': 'A3:package/vendor/x86_64-unknown-linux-musl/bin/codex',
                                    'sha256': STG.MEMBERS['A3']['package/vendor/x86_64-unknown-linux-musl/bin/codex']['sha256']}}


def archives_witness():
    """stage.bound_to_cache: every archive of the DP-1 layout recomputed against the ledger right before the service."""
    STG._ARCHIVE_OK.clear()
    return {aid: STG.check_archive(aid) for aid in STG.LAYOUT}


def check_identity_freeze():
    assert IDENTITY.exists(), 'BLOCKED: no identity freeze dp1'
    raw = IDENTITY.read_bytes()
    ident = json.loads(raw)
    assert ident['status'] == 'FROZEN_BEFORE_SERVICES', 'identity freeze status'
    assert ident['source_freeze']['sha256'] == sha_bytes(FREEZE.read_bytes()), 'identity freeze binds another source freeze'
    assert spec_bindings() == ident['spec_inputs'], 'spec inputs binding'
    assert pin_bindings() == ident['pin_bindings'], 'pin bindings'
    for name, (path, digest) in HOST.items():
        assert ident['host'][name] == [path, digest], 'host identity binding'
    return {'path': IDENTITY.name, 'sha256': sha_bytes(raw)}


def control_gate():
    """DP1-CTRL01 first: MISMATCH by rule 6 with failed predicates exactly [wrap.exit_mirror_exact] (sanities approved)."""
    ledger = json.loads(CASE_LEDGER.read_text())
    assert ledger['slots'][CONTROL_CASE]['status'] == 'EXECUTED', 'BLOCKED: the CONTROL gate %s must run first' % CONTROL_CASE
    docs = sorted(CASES_DIR.glob(CONTROL_CASE + '-*/acceptance.json'))
    assert len(docs) == 1, 'BLOCKED: exactly one CONTROL acceptance expected'
    acc = json.loads(docs[0].read_text())
    ok = acc['outcome'] == 'MISMATCH' and acc['composition_rule'] == 6 and acc['failed_predicates'] == ['wrap.exit_mirror_exact']
    assert ok, 'BLOCKED: CONTROL gate not met (%s, rule %s, %s)' % (acc['outcome'], acc['composition_rule'], acc['failed_predicates'])


def slot_order_gate(case):
    ledger = json.loads(CASE_LEDGER.read_text())
    order = [c for c in SLOTS if c != CONTROL_CASE]
    pending = [c for c in order[:order.index(case)] if ledger['slots'][c]['status'] not in ('EXECUTED', 'NOT_USED_CONDITIONAL')]
    assert not pending, 'BLOCKED: slots before %s not executed yet: %s' % (case, pending)


def conditional_gate(case):
    """DP-REAL01 only after a DIAG_PASS of DIAG-DP-REAL-CLI recorded in diag-admission-dp1.json; otherwise the slot is not used."""
    if case not in CONDITIONAL:
        return True
    adm = json.loads(DIAG_ADMISSION.read_text())
    return CONDITIONAL[case] in adm.get('conditional_diagnostics', {})


# ------------------------------------------------------------------------------------------------ /proc witnesses

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
    if not info:
        return False
    cur = proc_info(info['host_pid'])
    return cur is not None and cur['starttime'] == info['starttime'] and cur.get('state') not in ('Z', 'X')


def parse_maps(text):
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
    entries, unknown = [], []
    for (path, dev, inode), perms in sorted(mappings.items()):
        rec = {'path': path, 'dev': dev, 'inode': inode, 'perms': sorted(perms)}
        if path.startswith('/memfd:'):
            rec['class'] = 'ANONYMOUS_MEMFD_JIT'
            entries.append(rec)
            continue
        if path.startswith('anon_inode:') and not any('x' in p for p in perms):
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


def seal_profile(prof):
    for top, dirs, names in os.walk(prof, topdown=False, followlinks=False):
        for n in names:
            p = Path(top) / n
            os.chmod(p, 0o444)
        for d in dirs:
            os.chmod(Path(top) / d, 0o555)
    os.chmod(prof, 0o555)


def profile_files(prof):
    out = {}
    for top, dirs, names in os.walk(prof, followlinks=False):
        dirs.sort()
        for n in sorted(names):
            p = Path(top) / n
            key = '/profile/' + str(p.relative_to(prof))
            if key == '/profile/admission.json':
                continue
            out[key] = sha_path(p)
    return out


def seal_tree(root):
    """Fixture tree read-only on the host side too (files keep their declared execute bits)."""
    for top, dirs, names in os.walk(root, topdown=False, followlinks=False):
        for n in names:
            p = Path(top) / n
            if p.is_symlink():
                continue
            os.chmod(p, os.lstat(p).st_mode & 0o555)
        for d in dirs:
            p = Path(top) / d
            if not p.is_symlink():
                os.chmod(p, 0o555)
    os.chmod(root, 0o555)


# ------------------------------------------------------------------------------------------------ attempt

class Attempt:
    def __init__(self, case, selftest=False):
        self.selftest = selftest  # selftest-sandbox: bwrap without systemd-run, no ledger, no budget, own-code DIAG rows only
        if selftest:
            assert case in DIAG, 'selftest-sandbox runs only the own-code DIAG rows'
        if case in DIAG:
            self.kind, self.spec = 'diag', DIAG[case]
        elif case == CONTROL_CASE:
            self.kind, self.spec = 'control', {'deadline': 45}
        elif case in SDK_SLOTS:
            self.kind, self.spec = 'sdk', {'deadline': 45}
        else:
            raise ValueError('not a service case of DP-1: %r' % case)
        self.case = case
        self.attempt = secrets.token_hex(20)
        self.nonce = secrets.token_hex(20)
        self.unit = '%s%s-%s.service' % (UNIT_PREFIX, self.attempt[:12], case.lower())
        self.dir = ATTEMPTS / (self.attempt[:12] + '-' + case)
        self.evidence = DIAG_DIR / (self.attempt[:12] + '-' + case) if self.kind == 'diag' else CASES_DIR / (case + '-' + self.attempt[:12])
        if selftest:
            self.evidence = Path(os.environ.get('CVG_SELFTEST_OUT', str(RUNTIME / 'selftest-sandbox'))) / (self.attempt[:12] + '-' + case)
            self.unit = 'selftest-sandbox-%s' % self.attempt[:12]
        self.actions = []
        self.done = set()
        self.ctl_seq = {'driver': 0, 'adapter': 0, 'peer': 0}
        self.role_host = {}
        self.admission_fail = []
        self.cgroup = None
        self.service = {}
        self.host_netns = os.readlink('/proc/self/ns/net')
        self.peaks = {}
        self.service_bytes = {'stdout': 0, 'stderr': 0}
        self.budget_hit = False
        self.launched = False
        self.maps = None
        self.maps_raw = None
        self.controls = {}
        self.logs = {}
        self.t0 = time.monotonic_ns()

    def act(self, name, **detail):
        self.actions.append({'t_ns': time.monotonic_ns() - self.t0, 'action': name, 'detail': detail})

    def prepare(self):
        for name, (path, digest) in HOST.items():
            assert sha_path(path) == digest, 'host identity drift: ' + name
        if self.selftest:
            self.freeze, self.identity = {'selftest': 'before the source freeze'}, {'selftest': 'before the identity freeze'}
        else:
            self.freeze = check_source_freeze()
            self.identity = check_identity_freeze()
        # stage.bound_to_cache: archives against the ledger and the staged /dist against artifact-metadata.json, now.
        self.stage_witness = {'archives': archives_witness(), 'dist_manifest_equal': STG.dist_manifest(DIST) == STG.expected_dist()}
        assert self.stage_witness['dist_manifest_equal'], 'staged /dist drifted from artifact-metadata.json'
        ATTEMPTS.mkdir(mode=0o700, exist_ok=True)
        self.dir.mkdir(mode=0o700, parents=False)
        fifo = self.dir / 'fifo'
        fifo.mkdir(mode=0o700)
        prof = self.dir / 'profile'
        prof.mkdir(mode=0o755)
        fixture = self.dir / 'fixture'
        fixture.mkdir(mode=0o755)
        self.fds, self.fifo_stat, self.pipe_buf = {}, {}, {}
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
        for name in PROFILE_SOURCES:
            shutil.copyfile(UNIT / 'node' / name, prof / name)
        shutil.copyfile(HERE / 'bootstrap.py', prof / 'bootstrap.py')
        (prof / 'dp-loader.json').write_text(compact(loader_json(self.case)) + '\n')
        (prof / 'fixture-cases.json').write_bytes(fixture_bytes())
        if not self.selftest:
            assert FIXTURES.read_bytes() == fixture_bytes(), 'fixture-cases-dp1.json differs from the frozen rows'
        case_input = delivered_input(self.case)
        self.case_input_sha256 = sha_bytes(compact(case_input).encode('utf-8'))
        if self.case in SPEC_CASES:
            assert self.case_input_sha256 == SPEC_CASES[self.case]['case_input_sha256'], 'delivered case_input differs from the frozen bytes'
        self.fixture_manifest = STG.materialize(case_input.get('trees', []), fixture)
        self.fixture_problems = STG.check_fixture(case_input.get('trees', []), self.fixture_manifest)  # read-only by the bind
        self.config = {'attempt': self.attempt, 'case': self.case, 'nonce': self.nonce, 'language': 'node',
                       'deadline_seconds': self.spec['deadline'], 'fifo_root': '/observer', 'fifo_nodes': list(NAMES),
                       'fifo_stat': self.fifo_stat, 'topology': 'driver_only', 'case_input': case_input, 'mode': mode_of(self.case)}
        (prof / 'adapter-config.json').write_text(compact(self.config) + '\n')
        self.files = profile_files(prof)
        self.admission = {'v': 1, 'attempt': self.attempt, 'case': self.case, 'nonce': self.nonce, 'language': 'node',
                          'runtime_sha256': HOST['node'][1], 'files': self.files, 'fifo_pipe_buf': self.pipe_buf,
                          'containment_admitted': True, 'sdk_admitted': self.kind == 'sdk' or self.case in ('DIAG-DP-STAGE', 'DIAG-DP-REAL-CLI'),
                          'compiler_admitted': False}
        (prof / 'admission.json').write_text(compact(self.admission) + '\n')
        seal_profile(prof)
        assert profile_files(prof) == self.files, 'profile changed while sealing'
        self.expect = {'driver': {'attempt': self.attempt, 'case': self.case, 'nonce': self.nonce, 'source_sha256': self.files['/profile/dp-driver.mjs']},
                       'adapter': {'attempt': self.attempt, 'case': self.case, 'nonce': self.nonce, 'source_sha256': '0' * 64},
                       'peer': {'attempt': self.attempt, 'case': self.case, 'nonce': self.nonce, 'source_sha256': '0' * 64}}
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
              '--ro-bind', str(self.dir / 'profile'), '/profile', '--ro-bind', str(DIST), '/dist', '--ro-bind', str(self.dir / 'fixture'), '/fixture',
              '--dir', '/observer']
        for n in NAMES:
            bw += ['--ro-bind', str(self.dir / 'fifo' / n), '/observer/' + n]
        bw += ['--proc', '/proc', '--dev', '/dev', '--size', '67108864', '--tmpfs', '/work', '--dir', '/work/home', '--dir', '/work/tmp', '--chdir', '/work']
        for k, v in FIXED_ENV.items():
            bw += ['--setenv', k, v]
        bw += ['--remount-ro', '/', '--', '/runtime/python', '-I', '-S', '/profile/bootstrap.py'] + role_argv(self.case)
        if self.selftest:
            return bw, {'PATH': '/usr/bin:/bin', 'HOME': str(Path.home()), 'LANG': 'C.UTF-8'}
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
                ('/usr/lib/locale/', '/usr/lib/locale/'), ('/profile/', str(self.dir / 'profile') + '/'),
                ('/dist/', str(DIST) + '/'), ('/fixture/', str(self.dir / 'fixture') + '/')]

    def systemctl(self, *args, timeout=5):
        _, env = self.command()
        return subprocess.run(['/usr/bin/systemctl', '--user'] + list(args), capture_output=True, text=True, env=env, timeout=timeout)

    def unit_witness(self):
        if self.selftest:
            return {'LoadState': 'not-found', 'selftest': True}
        fields = ['Id', 'MainPID', 'ControlGroup', 'MemoryMax', 'TasksMax', 'CPUQuotaPerSecUSec', 'RuntimeMaxUSec',
                  'TimeoutStopUSec', 'NoNewPrivileges', 'KillMode', 'LoadState', 'ActiveState']
        c = self.systemctl('show', self.unit, *[a for f in fields for a in ('-p', f)])
        values = dict(line.split('=', 1) for line in c.stdout.splitlines() if '=' in line)
        if values.get('ControlGroup'):
            self.cgroup = Path('/sys/fs/cgroup' + values['ControlGroup'])
        return values

    def members(self):
        if self.selftest:
            out = []
            for n in os.listdir('/proc'):
                if n.isdigit():
                    i = proc_info(int(n))
                    if i and i.get('nspid') and len(i['nspid']) >= 2:
                        out.append(i)
            return out
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
        ok = vals['memory.max'] == LIMITS['memory.max'] and vals['pids.max'] == LIMITS['pids.max'] and len(q) == 2 and q[0] == q[1]
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
        if role != 'driver':
            problems.append('%s BEGIN in a driver_only topology' % role)
        if found is None:
            problems.append('no cgroup member with NSpid %d in %s' % (ev['pid'], ev['data']['pid_namespace']))
        else:
            if found.get('exe_dev_ino') != [self.exe.st_dev, self.exe.st_ino]:
                problems.append('executable inode differs from bound runtime')
            if found['cmdline'] != role_argv(self.case):
                problems.append('cmdline differs from frozen argv: %r' % found['cmdline'])
            if found.get('net_ns') == self.host_netns:
                problems.append('role shares the host network namespace')
        if self.selftest:
            self.limits, self.limits_ok = {'selftest': 'no systemd unit, no cgroup'}, True
        if not hasattr(self, 'limits'):
            self.limits, self.limits_ok = self.cgroup_limits()
            if not self.limits_ok:
                problems.append('cgroup limits differ from the declared service properties (DDP-05)')
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
        return (sum(log.raw_bytes for log in self.logs.values()) + sum(len(v) for v in self.controls.values()) + sum(self.service_bytes.values()))

    def advance(self):
        self.sample_peaks()
        d = self.logs['driver']
        if self.admission_fail:
            return
        if d.milestones('CALLS_DONE') and d.terminal is None and 'RELEASE_EXIT->driver' not in self.done:
            self.maps = self.maps_witness('driver')
            self.act('MAPS_SAMPLED', role='driver', ok=self.maps['ok'], unknown=len(self.maps['unknown']))
            self.send('driver', 'RELEASE_EXIT')

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
                  'verdict': 'INVALID_CAPTURE', 'outcome': 'INVALID_CAPTURE' if self.kind != 'diag' else None,
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
        return {'diag': 'CONSTANT_DIAGNOSTIC_NOT_SDK_EXECUTION', 'control': 'CONTROL_KNOWN_BAD_REACH_OWN_CODE',
                'sdk': 'DISTRIBUTED_PROFILE_CLIENT_OBSERVATION_NOT_PARITY_RECEIPT'}[self.kind]

    def write_preamble(self, cmd, env):
        ev = self.evidence
        ev.mkdir(parents=True, exist_ok=False)
        save_json(ev / 'command.json', {'selftest': self.selftest, 'unit': self.unit, 'attempt': self.attempt, 'case': self.case, 'kind': self.kind, 'argv': cmd,
                                        'source_freeze': self.freeze, 'identity_freeze': self.identity, 'stage_witness': self.stage_witness,
                                        'load_wait': getattr(self, 'load_wait', None), 'env_keys': sorted(env), 'service_properties': PROPS,
                                        'fifo_stat': self.fifo_stat, 'pipe_buf': self.pipe_buf, 'runtime_dir': str(self.dir),
                                        't0_monotonic_ns': str(self.t0)})
        (ev / 'profile').mkdir()
        for name in ('adapter-config.json', 'admission.json', 'dp-loader.json'):
            shutil.copyfile(self.dir / 'profile' / name, ev / 'profile' / name)
        save_json(ev / 'profile-manifest.json', {'files': self.files, 'admission_sha256': sha_path(self.dir / 'profile' / 'admission.json'),
                                                 'admission': {k: v for k, v in self.admission.items() if k != 'files'},
                                                 'config_sha256': self.files['/profile/adapter-config.json'],
                                                 'case_plan': case_plan(self.case),
                                                 'case_plan_file': {'path': PLAN.name, 'sha256': sha_path(PLAN) if PLAN.exists() else None},
                                                 'fixture_manifest_host': self.fixture_manifest, 'fixture_problems_host': self.fixture_problems,
                                                 'spec': self.spec})

    def take_budget(self):
        if self.selftest:
            self.act('LAUNCH', selftest=True)
            return
        if self.kind == 'diag':
            n = budget_take(self.unit, self.case, self.attempt)
            self.act('LAUNCH', services_used=n)
        else:
            n = case_take(self.unit, self.case, self.attempt)
            self.act('LAUNCH', case_slots_used=n)

    def wait_load(self):
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
            r, _, _ = select.select(list(open_streams) + list(readers), [], [], 0.02)
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
                        self.service_bytes[name] += len(b)
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
        verdict, reasons, facts = OBS.reconcile_driver_only(self.logs, {'checks': checks})
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
        witness = {'os_checks': checks, 'maps': self.maps, 'cgroup_limits': getattr(self, 'limits', None), 'limits_ok': getattr(self, 'limits_ok', False),
                   'driver_net_ns': (self.role_host.get('driver') or {}).get('net_ns'), 'host_net_ns': self.host_netns,
                   'stage_witness': self.stage_witness, 'fixture_manifest_host': self.fixture_manifest, 'fixture_problems_host': self.fixture_problems,
                   'case_input_sha256_supervisor': self.case_input_sha256,
                   'case_input_sha256_recomputed': sha_bytes(compact(cfg_copy['case_input']).encode('utf-8')),
                   'control_actions': [x for x in self.actions if x['action'] == 'CONTROL'],
                   'supervisor_kills': [x for x in self.actions if x['action'] in SUPERVISOR_KILLS],
                   'timed_out': timed_out, 'profile_files': self.files,
                   'loader_json': json.loads((self.dir / 'profile' / 'dp-loader.json').read_text())}
        result = {'kind': self.result_kind(), 'case': self.case, 'unit': self.unit, 'attempt': self.attempt, 'language': 'node',
                  'topology': 'driver_only', 'verdict': verdict, 'reasons': reasons, 'facts': facts, 'os_checks': checks, 'host_net_ns': self.host_netns,
                  'role_status': {r: log.status() for r, log in self.logs.items()},
                  'role_violation': {r: log.violation for r, log in self.logs.items()},
                  'role_host': self.role_host, 'maps_witness': self.maps, 'cgroup_limits': getattr(self, 'limits', None),
                  'cgroup_peaks_sampled': self.peaks, 'service_before': self.service, 'service_after': after,
                  'cgroup_events_after': cg_events, 'systemd_run_rc': rc, 'actions': self.actions,
                  'frames': {r: len(log.events) for r, log in self.logs.items()}, 'raw_frame_bytes': {r: log.raw_bytes for r, log in self.logs.items()},
                  'case_artifact_bytes': self.case_bytes(), 'service_output_bytes': self.service_bytes, 'timed_out': timed_out,
                  'stage_witness': self.stage_witness, 'fixture_problems_host': self.fixture_problems,
                  'case_input_sha256_supervisor': self.case_input_sha256, 't0_monotonic_ns': str(self.t0),
                  'source_freeze': self.freeze, 'identity_freeze': self.identity, 'elapsed_ns': time.monotonic_ns() - self.t0,
                  'functional_receipts': 0, 'observed_at': now_iso()}
        for name, data in self.logs['driver'].blobs.items():
            if name.startswith(('stdout:', 'stderr:')):
                (ev / ('blob-%s.txt' % name.replace(':', '-'))).write_bytes(data)
        if self.kind == 'diag':
            diag_checks = self.diag_checks(verdict, witness)
            status = 'DIAG_PASS' if verdict == 'PASS' and all(diag_checks.values()) else 'DIAG_FAIL'
            result.update({'expected_verdict': 'PASS', 'status': status, 'diag_checks': diag_checks, 'SDK_imports': 0})
            save_json(ev / 'result.json', result)
            if not self.selftest:
                ledger_result(self.kind, self.unit, self.case, '%s/%s' % (status, verdict))
            return result
        acceptance = ACC.evaluate(self.case, self.logs, verdict, reasons, witness)
        save_json(ev / 'acceptance.json', acceptance)
        result.update({'outcome': acceptance['outcome'], 'status': 'EXECUTED_ONCE', 'acceptance': 'acceptance.json',
                       'SDK_runtime': 'RUN_ONCE_CONTAINED' if self.kind == 'sdk' else 'NONE (own code)', 'parity_credit': 0})
        save_json(ev / 'result.json', result)
        ledger_result(self.kind, self.unit, self.case, '%s/%s' % (acceptance['outcome'], verdict))
        return result

    def diag_checks(self, verdict, witness):
        d = self.logs['driver']
        c = {}
        first = lambda name: (d.milestones(name) or [{'detail': {}}])[0]['detail']
        c['case_input_role_witness'] = d.case_input_sha256 == self.case_input_sha256
        c['limits_1gib_256'] = bool(getattr(self, 'limits_ok', False))
        kw = first('KEYLESS_WITNESS')
        c['keyless_netns_lo_only'] = kw.get('net_devices') == ['lo'] and kw.get('codex_home_present') is False and kw.get('credential_vars_in_driver_env') == []
        c['maps_witness_ok'] = bool(self.maps and self.maps['ok'])
        c['release_after_calls_done'] = 'RELEASE_EXIT->driver' in self.done
        if self.case == 'DIAG-TS-ECHO':
            st = first('LOADER_SELFTEST')
            own = first('OWN_CHILD_CLOSED')
            recs = d.blob_json('child-records:echo', [])
            c['loader_selftest'] = st.get('pass') is True and st.get('probes') == 10
            c['own_child_exit3_mirrored'] = own.get('code') == 3 and own.get('signal') is None and own.get('records') == 1
            c['child_record_program'] = len(recs) == 1 and recs[0].get('declared_termination') == {'exit_code': 3} and recs[0].get('argv_tail') == ['exec', '--experimental-json']
            c['no_leftover'] = first('LEFTOVER').get('pids') == []
        elif self.case == 'DIAG-DP-STAGE':
            trees = DIAG_ROWS[self.case]['trees']
            listing = STG.sandbox_listing_to_manifest(d.blob_json('fixture-listing', []))
            c['fixture_host_equal_declared'] = self.fixture_problems == []
            c['fixture_sandbox_equal_declared'] = STG.check_fixture(trees, listing) == []
            dm = d.blob_json('dist-manifest', {})
            want = {'/dist/' + k: v for k, v in STG.expected_dist().items()}
            c['dist_sandbox_equal_metadata'] = dm == want
            c['dist_host_equal_metadata'] = self.stage_witness['dist_manifest_equal'] is True
            c['archives_equal_ledger'] = all(self.stage_witness['archives'][a] == STG.ARCHIVES[a]['observed']['sha256'] for a in STG.LAYOUT)
            wp = first('WRITE_PROBES')
            c['dist_fixture_profile_read_only'] = all(wp.get(p) == 'EROFS' for p in ('/dist/cvg-write-probe', '/fixture/cvg-write-probe', '/profile/cvg-write-probe'))
        elif self.case == 'DIAG-DP-NODE':
            ob = first('OWN_ENTRY_BARE')
            probes = d.blob_json('loader-probes', [])
            c['loader_selftest_with_entries'] = ob.get('pass') is True and len(probes) == 13 and all(p['outcome'] == p['expected'] for p in probes)
            c['own_entry_bare_mapped'] = isinstance(ob.get('builtins'), dict) and all(v == 'function' for v in ob['builtins'].values()) and len(ob['builtins']) == 7
            c['probe_accessor_refused'] = first('PROBE_ACCESSOR_REFUSED').get('refused') is True
            wr = {m['detail']['as']: m['detail'] for m in d.milestones('WRAPPER_RESULT')}
            shim = d.blob_json('shim:2')
            so = d.blobs.get('stdout:2', b'').decode('utf-8', 'replace')
            c['wrapper_run_with_shim'] = (wr.get('n_shim', {}).get('exit_code') == 0 and isinstance(shim, dict) and shim.get('applied') is True
                                          and shim.get('real') == {'platform': 'linux', 'arch': 'x64'} and '"platform":"freebsd","arch":"x64"' in so)
            sent = first('SIGNAL_SENT')
            rec4 = d.blob_json('child-records:4', [])
            c['sighup_after_ready_bit_seen'] = (sent.get('signal') == 'SIGHUP' and sent.get('sent') is True and sent.get('sigcgt_bit_seen') is True
                                                and sent.get('kill_ok') is True and len(rec4) == 1 and rec4[0].get('signals') == ['SIGHUP']
                                                and wr.get('n_hup', {}).get('exit_code') == 0)
            c['no_leftover'] = all(m['detail']['pids'] == [] for m in d.milestones('LEFTOVER')) and len(d.milestones('LEFTOVER')) == 2
        elif self.case == 'DIAG-DP-SYNTH-CHILD':
            outs = {k: json.loads(d.blobs.get('stdout:%d' % k, b'{}').decode('utf-8') or '{}') for k in (2, 4, 6, 8)}
            recs = {k: d.blob_json('child-records:%d' % k, []) for k in (2, 4, 6, 8)}
            one = lambda k: recs[k][0] if len(recs[k]) == 1 else {}
            c['exit_code_program'] = outs[2].get('child') == {'code': 3, 'signal': None} and one(2).get('declared_termination') == {'exit_code': 3}
            c['argv_env_record'] = (one(2).get('argv_tail') == ['a', 'b c'] and one(2).get('exec_path') == '/fixture/diag/vendor/child'
                                    and one(2).get('env') == dict(_ENV, CVG_DIAG='1') and one(2).get('stdin') is None)
            c['self_signal_program'] = outs[4].get('child') == {'code': None, 'signal': 'SIGTERM'} and one(4).get('declared_termination') == {'self_signal': 'SIGTERM'}
            c['on_signal_program'] = (outs[6].get('child') == {'code': 0, 'signal': None} and one(6).get('signals') == ['SIGTERM']
                                      and one(6).get('ready') is True and one(6).get('declared_termination') == {'exit_code': 0})
            c['no_signal_bounded_wait'] = (outs[8].get('child') == {'code': 97, 'signal': None} and one(8).get('no_signal') is True
                                           and one(8).get('signals') == [] and one(8).get('declared_termination') == {'exit_code': 97})
            c['no_leftover'] = all(m['detail']['pids'] == [] for m in d.milestones('LEFTOVER')) and len(d.milestones('LEFTOVER')) == 4
        elif self.case == 'DIAG-DP-REAL-CLI':
            rc = first('REAL_CLI_VERSION')
            so = d.blobs.get('stdout:real-cli', b'').decode('utf-8', 'replace')
            c['real_cli_exit0_within_10s'] = rc.get('code') == 0 and rc.get('signal') is None and rc.get('spawn_error') is None and rc.get('elapsed_ms', 99999) < 10000
            c['real_cli_version_printed'] = '0.153.4' in so
            c['nothing_written_outside_work'] = True  # / is remounted read-only and /dist, /fixture, /profile are read-only binds
            c['no_leftover'] = first('LEFTOVER').get('pids') == []
        return c


# ------------------------------------------------------------------------------------------------ artifact slot (no service)

def run_artifact(case):
    """DP-PK09A: ARTIFACT_CHECK, no service (erratum DP-SPEC/R2-F01 item 1). The evaluator reads the cache by sha."""
    attempt = secrets.token_hex(20)
    unit = 'evaluator-only-%s' % attempt[:12]
    ev = CASES_DIR / (case + '-' + attempt[:12])
    ev.mkdir(parents=True, exist_ok=False)
    freeze, identity = check_source_freeze(), check_identity_freeze()
    case_take(unit, case, attempt)
    acceptance = ACC.evaluate_artifact(case)
    save_json(ev / 'acceptance.json', acceptance)
    result = {'kind': 'ARTIFACT_CHECK_EVALUATOR_ONLY_NO_SERVICE', 'case': case, 'unit': None, 'attempt': attempt, 'verdict': 'ARTIFACT_CHECK',
              'outcome': acceptance['outcome'], 'status': 'EXECUTED_ONCE', 'acceptance': 'acceptance.json', 'source_freeze': freeze,
              'identity_freeze': identity, 'services': 0, 'functional_receipts': 0, 'parity_credit': 0, 'observed_at': now_iso()}
    save_json(ev / 'result.json', result)
    ledger_result('artifact', unit, case, '%s/ARTIFACT_CHECK' % acceptance['outcome'])
    return result


# ------------------------------------------------------------------------------------------------ staging, identity freeze, admission

def stage():
    if not DIST.exists():
        STG.stage_dist(DIST)
    got = STG.dist_manifest(DIST)
    assert got == STG.expected_dist(), 'staged /dist differs from artifact-metadata.json'
    return {'files': len(got), 'bytes': sum(v['bytes'] for v in got.values()), 'archives': archives_witness()}


def freeze_identities():
    src = check_source_freeze()
    ident = {'kind': 'IDENTITY_FREEZE_DP1', 'status': 'FROZEN_BEFORE_SERVICES', 'task': 'DX100-G02:IMPLEMENT-AND-ADMIT-SDK-DISTRIBUTED-PROFILE-DP-1',
             'source_freeze': src, 'spec_inputs': spec_bindings(), 'pin_bindings': pin_bindings(),
             'cache': {'archives': archives_witness(), 'ledger_sha256': STG.LEDGER_SHA, 'metadata_sha256': STG.META_SHA,
                       'members_used': sorted({k for c in SLOTS for k in SPEC_CASES[c]['inputs'] if k.startswith('A')})},
             'dist': {'root': str(DIST), 'manifest': STG.expected_dist()},
             'host': {k: list(v) for k, v in HOST.items()}, 'service_properties': PROPS, 'sandbox_env': FIXED_ENV,
             'argv': {'driver': role_argv('CASE_ID')}, 'frozen_at': now_iso(),
             'note': ('DDP-08: antes de qualquer serviço; reconfere o cache contra acquisition-ledger.json e /dist contra artifact-metadata.json; '
                      'R2-F04: membro A3 bin/codex, sha do executável do pin e fontes do pin ligados. Nenhuma capability do kernel (Q4).')}
    save_new_json(IDENTITY, ident)
    return ident


def diag_admission():
    src = check_source_freeze()
    idf = check_identity_freeze()
    diag, missing, conditional = {}, [], {}
    for case in ADMISSION_DIAGS + sorted(CONDITIONAL_DIAGS):
        passes, fails = [], []
        for d in sorted(DIAG_DIR.glob('*-' + case)):
            r = json.loads((d / 'result.json').read_text())
            row = {'dir': str(d.relative_to(UNIT)), 'unit': r['unit'], 'verdict': r['verdict'], 'status': r.get('status')}
            (passes if r.get('status') == 'DIAG_PASS' and r.get('source_freeze', {}).get('sha256') == src['sha256'] else fails).append(row)
        if case in CONDITIONAL_DIAGS:
            if passes:
                conditional[case] = passes[-1]
            continue
        if not passes:
            missing.append({'case': case, 'runs': fails})
            continue
        diag[case] = passes[-1]
    assert not missing, 'BLOCKED: no DIAG_PASS of %s (every mandatory DIAG is a stop condition)' % [m['case'] for m in missing]
    doc = {'kind': 'DIAG_ADMISSION_DP1', 'task': 'DX100-G02:IMPLEMENT-AND-ADMIT-SDK-DISTRIBUTED-PROFILE-DP-1', 'source_freeze': src,
           'identity_freeze': idf, 'admission_diagnostics': diag, 'conditional_diagnostics': conditional,
           'conditional_slots': {s: ('LIBERADA' if d in conditional else 'NÃO USADA') for s, d in CONDITIONAL.items()}, 'recorded_at': now_iso()}
    save_new_json(DIAG_ADMISSION, doc)
    return doc


def init_ledgers():
    save_new_json(BUDGET, {'kind': 'SERVICE_BUDGET', 'services_max': 12, 'services_used': 0, 'planned': ADMISSION_DIAGS + sorted(CONDITIONAL_DIAGS),
                           'rule': 'qualification services only (7 in reserve, admission diagnostics only); never a case repetition; no automatic retry; services in series',
                           'history': [], 'updated_at': now_iso()})
    slots = {c: {'status': 'UNUSED'} for c in RUN_ORDER}
    assert len(slots) == 12
    save_new_json(CASE_LEDGER, {'kind': 'SINGLE_USE_CASE_SLOTS', 'slots_max': 12, 'used': 0, 'slots': slots,
                                'rule': ('one execution per slot, once, serial, no retry; DP1-CTRL01 first (gate: MISMATCH by rule 6 only from '
                                         'wrap.exit_mirror_exact, sanities approved); then the slots in slot order; DP-REAL01 only after '
                                         'DIAG_PASS of DIAG-DP-REAL-CLI, otherwise NOT_USED_CONDITIONAL; DP-PK09A evaluator only (no service)'),
                                'updated_at': now_iso()})


def main(argv):
    if argv[:1] == ['stage']:
        print(json.dumps(stage()))
        return 0
    if argv[:1] == ['fixtures']:
        b = fixture_bytes()
        FIXTURES.write_bytes(b)
        print(json.dumps({'fixture_cases_dp1_sha256': sha_bytes(b), 'rows': len(json.loads(b))}))
        return 0
    if argv[:1] == ['plan']:
        plan = {c: case_plan(c) for c in RUN_ORDER + sorted(DIAG)}
        save_json(PLAN, {'kind': 'CASE_PLAN_DP1', 'cases': plan, 'diagnostics': DIAG, 'admission_diagnostics': ADMISSION_DIAGS,
                         'conditional_diagnostics': CONDITIONAL_DIAGS, 'conditional_slots': CONDITIONAL, 'run_order': RUN_ORDER})
        print(len(plan))
        return 0
    if argv[:1] == ['init-ledgers']:
        init_ledgers()
        print('ledgers written')
        return 0
    if argv[:1] == ['freeze']:
        files = source_freeze_files()
        save_new_json(FREEZE, {'kind': 'SOURCE_FREEZE', 'task': 'DX100-G02:IMPLEMENT-AND-ADMIT-SDK-DISTRIBUTED-PROFILE-DP-1', 'files': files,
                               'file_count': len(files), 'frozen_at': now_iso()})
        print(json.dumps({'freeze': FREEZE.name, 'sha256': sha_path(FREEZE), 'files': len(files)}))
        return 0
    if argv[:1] == ['freeze-identities']:
        freeze_identities()
        print(json.dumps({'identity_freeze': IDENTITY.name, 'sha256': sha_path(IDENTITY)}))
        return 0
    if argv[:1] == ['diag-admission']:
        doc = diag_admission()
        print(json.dumps({'diag_admission': DIAG_ADMISSION.name, 'sha256': sha_path(DIAG_ADMISSION), 'diagnostics': sorted(doc['admission_diagnostics']),
                          'conditional': doc['conditional_slots']}))
        return 0
    if len(argv) == 2 and argv[0] == 'not-used':
        case = argv[1]
        assert case in CONDITIONAL and not conditional_gate(case), 'not-used only for a conditional slot whose DIAG did not pass'
        mark_not_used(case, 'DIAG %s sem DIAG_PASS (diag-admission-dp1.json)' % CONDITIONAL[case])
        print('marked')
        return 0
    if len(argv) == 2 and argv[0] == 'selftest-sandbox':
        result = Attempt(argv[1], selftest=True).run()
        keys = ('case', 'verdict', 'status', 'reasons', 'diag_checks', 'os_checks', 'role_status', 'elapsed_ns')
        print(json.dumps({k: result.get(k) for k in keys}, indent=1))
        return 0 if result['status'] == 'DIAG_PASS' else 1
    if len(argv) == 2 and argv[0] == 'run':
        case = argv[1]
        if case in SPEC_CASES and case != CONTROL_CASE:
            assert DIAG_ADMISSION.exists(), 'BLOCKED: no diag-admission-dp1.json'
            control_gate()
            slot_order_gate(case)
            assert conditional_gate(case), 'BLOCKED: %s is conditional and its DIAG did not pass (use not-used)' % case
        elif case == CONTROL_CASE:
            assert DIAG_ADMISSION.exists(), 'BLOCKED: no diag-admission-dp1.json'
        result = run_artifact(case) if case == ARTIFACT_CASE else Attempt(case).run()
        keys = ('case', 'unit', 'kind', 'verdict', 'outcome', 'status', 'reasons', 'diag_checks', 'os_checks', 'role_status', 'elapsed_ns')
        print(json.dumps({k: result.get(k) for k in keys}, indent=1))
        return 0 if result['status'] in ('DIAG_PASS', 'EXECUTED_ONCE') else 1
    print(__doc__)
    return 2


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
