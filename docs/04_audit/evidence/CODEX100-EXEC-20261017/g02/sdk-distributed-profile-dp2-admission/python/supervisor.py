"""Host supervisor of DX100-G02:IMPLEMENT-AND-ADMIT-SDK-DISTRIBUTED-PROFILE-DP-2 (runs OUTSIDE the target cgroup).

Derived from the supervisor of the continuation 3-2 (../sdk-continuation-3-2-admission/python/supervisor.py, itself the 2B-2 supervisor:
F4-01 delivered case_input from the frozen slot bytes with supervisor, role and evaluator witnesses; FIFO observer channel; transient
systemd unit + bwrap sandbox; /proc and cgroup witnesses with the PROC_WITNESS of D2B-10; one global sequence index gidx; D2B-11
barrier plan) with the deltas of freeze-r4-dp-delta.json for the Python sub-lot DP-2 and the declared DDP-12 of this IMPLEMENT:

- DDP-01 cases-dp-2.json bound by sha: DP-PY19A, DP-PY19B, DP-PY19C, DP-PY02P (conditional on DIAG-DP-REAL-CLI-APPSERVER), the artifact
  check DP-PY20A (no service; judged by the evaluator from the cache by sha) and DP2-CTRL01 (copy of 2B2-CTRL01, DDP-09): 6 slots;
- DDP-02/DDP-11 (CAP-DP-STAGE): /dist staged once per sub-lot from the cache (stage_dp.py, layout A7, A2, A3, A4, A1), checked on the
  host against artifact-metadata.json before each service that binds it (stage.bound_to_cache); fixture trees materialized per attempt
  and bound read-only at /fixture (fixture.tree_exact, root scan);
- DDP-05 (CAP-DP-REAL-CLI-KEYLESS): MemoryMax 1073741824 and TasksMax 256 only for DP-PY02P and DIAG-DP-REAL-CLI-APPSERVER, 536870912
  and 32 elsewhere, checked in the cgroup (service.limits_declared); every other property equal to the inherited 2B-2 table (DP1-ADM/R2-F05);
  realcli.witness: the driver asks with WITNESS_REQUEST after its PROC_RETAIN, the supervisor maps the pid by NSpid in the cgroup, reads
  cmdline, environ, /proc/<pid>/exe and the direct children of the driver, records REALCLI_WITNESS and answers WITNESS_DONE (5 s bound);
- DDP-06 (CAP-DP-PY-RUNTIME): driver_runtime.sys_path_runtime and runtime.path in the driver (SYS_PATH milestones);
- DDP-07 (CAP-DP-ARTIFACT-CHECK): DP-PY20A judged by acceptance.evaluate_artifact, no service;
- DDP-10 2B2-ADM R1-F02/R1-F03/R1-F04 kept from the C3-2 evaluator;
- DDP-12 (erratum DP-SPEC/R2-F01): topology per case (driver_only: DP-PY19A, DP-PY02P and the three DIAG-DP rows; adapter_peer: DP-PY19B,
  DP-PY19C, DP2-CTRL01 and the DIAG-PY rows); in driver_only the adapter and peer FIFOs are bound and must stay empty, the plan has no
  FINISH_PEER and the capture is reconciled by observer.reconcile_driver_only;
- C3-2 carry-overs on the Python stack: thread registry by threading.local (C32-ADM/R1-F01), WAIT_APIS closed on the D3-05 list
  (C32-ADM/R1-F03), case_plan_file recorded in every profile-manifest.json (C32-ADM/DV-C32-02).

Commands (host python3.12 -I -B):
  supervisor.py stage-trees         copy the admitted sdk-python and python-deps trees into the private runtime (manifest-checked)
  supervisor.py stage-dist          stage /dist of the sub-lot from the cache (refuses an existing directory)
  supervisor.py fixtures            write fixture-cases.json (6 slots + DIAG rows; canonical sorted keys; never the delivered source)
  supervisor.py plan                write case-plan.json (topology, barrier plans, wait classes, epilogues, limits, acceptance plan)
  supervisor.py init-ledgers        budget.json (12 services) and case-ledger.json (6 single-use slots)
  supervisor.py freeze              source-freeze-dp2.json (refuses to overwrite)
  supervisor.py freeze-identities   identity-freeze-dp2.json (before any service; re-checks the cache against acquisition-ledger.json)
  supervisor.py diag-admission      diag-admission-dp2.json (DIAG passes and conditional decision; after the DIAG)
  supervisor.py run CASE            one transient service (DIAG budget 12, or a single-use slot in slot order; never retried);
                                    DP-PY20A uses its slot without a service
  supervisor.py dry CASE            pre-freeze sandbox run without systemd-run, ledgers or budget, refused in code outside DRY_ROWS
                                    (own-code DIAG rows only; never the real binary nor the SDK; DP1-ADM/DV2 carry-over)

The supervisor never imports SDK, Pydantic or acquired code and never executes a cache file. Load average above 12 before a service:
wait and record.
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

sys.dont_write_bytecode = True

HERE = Path(__file__).resolve().parent
UNIT = HERE.parent
G02 = UNIT.parent
ADMISSION = G02 / 'sdk-admission'
ARTIFACTS = G02 / 'sdk-profile-artifacts'
SPEC = UNIT / 'inputs' / 'spec-dp'
SPEC_2B = UNIT / 'inputs' / 'spec-2b'
SPEC_R4 = UNIT / 'inputs' / 'spec-r4'
ACQ = UNIT / 'inputs' / 'acquisition'
RUNTIME = Path('/mnt/dados/cvg-work/cvg-codex100-dp2-runtime-20261020')
STAGED_FROM = Path('/mnt/dados/cvg-work/cvg-codex100-batch2a-runtime-20261019')
ATTEMPTS = RUNTIME / 'attempts'
DRY = RUNTIME / 'dry'
SDK_PY_TREE = RUNTIME / 'sdk-python'
PY_DEPS_TREE = RUNTIME / 'python-deps'
DIST = RUNTIME / 'dist'
DIAG_DIR = UNIT / 'diagnostics'
CASES_DIR = UNIT / 'cases'
FREEZE = UNIT / 'source-freeze-dp2.json'
IDENTITY = UNIT / 'identity-freeze-dp2.json'
DIAG_ADMISSION = UNIT / 'diag-admission-dp2.json'
PLAN_FILE = UNIT / 'case-plan.json'
ADMISSION_IDENTITY = ADMISSION / 'identity-freeze.json'
ADMISSION_IDENTITY_SHA = 'ebfb308f17e6a21ab77c91ab3863b737dd646ed6b1b6bbd835cba73e62225b1d'
CASES_JSON = SPEC / 'cases-dp-2.json'
CASES_SHA = '82e32644a9d472160fbc24b3ce4a62b02a7d37e0c31c57862ba7400a37278a60'
SPEC_SHA = {'cases-dp-2.json': CASES_SHA,
            'capability-contracts-dp.json': 'f8f6c7956c9dd31896a8fee5da8e3cc7b5997966aa1be5ba6a6bc8c80892098b',
            'coverage-plan-dp.json': '1065a69a9ad81c394cc435f1df42af9b371d349cb79d695d8b682bb53a2d5678',
            'freeze-r4-dp-delta.json': 'daffa28b13cdb4cdfa1126c239bf7857bd0317f5893004f230f9352ca37c7f31',
            'evaluator-r4-dp-delta.json': '73ae948285f4a81103474519c64b788c51f0b751ba51bd024e795b411097c29a',
            'execution-budget-dp-2.json': '51b7a19b6064f837eb0f954b719caf22bef6e16b21b7f1bf518147894bfefd12',
            't3-assessment.json': '05d564fefa510a54c1f93bbd1ba2121d743c3e7978ac76bffb1fc9533ebdbebe'}
SPEC_EXTRA = ('control-slot-contract-dp.json', 'lead-confirmation-20261019.json', 'next-task.json', 'review-r2/executor-disposition.json')
SPEC_2B_SHA = {'cases-2b-1.json': '96b1e4d92d6333addfff638dbdbe6c0550d17625f9e57cf67291aa9548098105',
               'cases-2b-2.json': '382d7b2956717634f95545276020fc47b6328465a5fd81f5a690424d065eaedc',
               'freeze-r4-2b-delta.json': '55c561192009c44a0b0de25c561f9f95bb675285221124a35edb7f7d67d93136',
               'evaluator-r4-2b-delta.json': '87a4169617c358da6f557d6b57d621649eaca6a2dbae66a6aad55d0e47de1ba9',
               'capability-contracts-2b.json': '78bc3c9fb3789134b1e8d37527dcbfbed867a39f7d618546d1f00ed1da2bdf3a',
               'control-slot-contract-2b.json': 'ea2d910a123908c247a26baa847120b3323fa2585ca90af4d80790ce4db69c3b',
               't3-assessment.json': 'd7b0c5e4901f4526a8367965c255f0c479859ebdbc30b229e9ea7e16a3414512'}
SPEC_R4_SHA = {'freeze-r4-contract.json': '14ad70297aa907e5a88add489196c1b38dfdbf15ef50454f40250185957688ed',
               'evaluator-r4-contract.json': '62d948a1373ab0b7eb7ac55d02bfd3a638bdadbf6d194b3765dd273d63c89b72',
               'control-slot-contract.json': '35a7f210c7eb2c40762009d924177164cadce5661172d12d12fbcaea53d68c73'}
HOST = {
    'python': ('/usr/bin/python3.12', 'e50d468e8b0adfb05733f5b87b3cff34829c4a8c1aea50c865aa8bdfe4bb150f'),
    'bwrap': ('/usr/bin/bwrap', 'e318903862396f96de3df57264e0158682b952fd3fb53ac23d876413e7b30f71'),
    'systemd-run': ('/usr/bin/systemd-run', 'dbc8b988a849d5c9d7ef2de7068a6f107021bc6c11e0d7864c73f373eef726a7'),
    'systemctl': ('/usr/bin/systemctl', 'e0d3d0e9444da1b2b58c792c3f5028b69f049b77d5ca17b3ec0d09f89117225b'),
}
# Inherited table of the 2B-2 (and C3-2) supervisor: every DP-2 service uses it; only MemoryMax and TasksMax differ, and only in
# LIMITS_1G cases (DDP-05). RuntimeMaxSec stays 45 (DP1-ADM/DV3 carry-over: no deviation in the DP-2).
INHERITED_PROPS = {'MemoryMax': '536870912', 'TasksMax': '32', 'CPUQuota': '100%', 'RuntimeMaxSec': '45', 'KillMode': 'control-group',
                   'TimeoutStopSec': '3', 'NoNewPrivileges': 'yes', 'LimitNOFILE': '128', 'LimitFSIZE': '8388608', 'LimitCORE': '0'}
LIMITS_1G = ('DP-PY02P', 'DIAG-DP-REAL-CLI-APPSERVER')
DECLARED_DIFF = {'MemoryMax': '1073741824', 'TasksMax': '256'}


def props_of(case):
    """Service properties of one case: the inherited table, with the DDP-05 limits only where declared."""
    p = dict(INHERITED_PROPS)
    if case in LIMITS_1G:
        p.update(DECLARED_DIFF)
    return p


def props_diff(props):
    """Differences of a property table from the inherited one (DP1-ADM/R2-F05): only MemoryMax and TasksMax may differ."""
    keys = sorted(set(props) | set(INHERITED_PROPS))
    return {k: [INHERITED_PROPS.get(k), props.get(k)] for k in keys if props.get(k) != INHERITED_PROPS.get(k)}


def props_ok(case, props):
    diff = props_diff(props)
    want = {k: [INHERITED_PROPS[k], v] for k, v in DECLARED_DIFF.items()} if case in LIMITS_1G else {}
    return diff == want


FIXED_ENV = {'HOME': '/work/home', 'TMPDIR': '/work/tmp', 'PATH': '/runtime', 'LANG': 'C.UTF-8', 'LC_ALL': 'C.UTF-8',
             'TZ': 'UTC', 'PYTHONDONTWRITEBYTECODE': '1', 'UV_THREADPOOL_SIZE': '2'}
# keyless.no_network_no_credential: closed list of credential variables (OPENAI_API_KEY, CODEX_API_KEY, GH_TOKEN, GITHUB_TOKEN and kin).
CREDENTIAL_KEYS = ('OPENAI_API_KEY', 'CODEX_API_KEY', 'GH_TOKEN', 'GITHUB_TOKEN', 'ANTHROPIC_API_KEY', 'AZURE_OPENAI_API_KEY',
                   'OPENAI_ORG_ID', 'OPENAI_PROJECT_ID', 'CODEX_ACCESS_TOKEN', 'OPENAI_BASE_URL')
LAUNCH = ['/runtime/python', '-I', '-S', '/profile/adapter-python.py']
UNIT_PREFIX = 'cvg-dx100-dp2-'
LOAD_LIMIT = 12.0
CASE_ARTIFACTS = 2097152
SERVICE_OUTPUT_CAP = 65536
BUDGET = UNIT / 'budget.json'
CASE_LEDGER = UNIT / 'case-ledger.json'
NAMES = [r + '.' + k for r in ('driver', 'adapter', 'peer') for k in ('events', 'control')]
PY_SOURCES = ('channel.py', 'adapter-python.py', 'adapter-python-exec', 'fixture-rpc.py', 'python-driver.py', 'control-client.py',
              'bootstrap.py', 'harness2b.py', 'own2b.py', 'ownmodels.py')
ROLE_SOURCE = {'driver': 'python-driver.py', 'adapter': 'adapter-python.py', 'peer': 'fixture-rpc.py'}
CONTROL_CASE = 'DP2-CTRL01'
REAL_BIN_REL = 'py/site/codex_cli_bin/bin/codex'
REAL_BIN_MEMBER = ('A1', 'codex_cli_bin/bin/codex')
_INPUTS = json.loads(CASES_JSON.read_bytes())['inputs']
PYDEPS_ANCHOR = ('packaging/version.py', '635693b717b7b27db138c6b905d23ce7e01c1eec9b6da9ce56412fbd24510bc2')


def spec_cases():
    raw = CASES_JSON.read_bytes()
    assert hashlib.sha256(raw).hexdigest() == CASES_SHA, 'cases-dp-2.json drifted from the approved spec'
    return {c['id']: c for c in json.loads(raw)['cases']}  # insertion order preserved (F4-01)


SPEC_CASES = spec_cases()
SLOT_CASES = [c for c, d in sorted(SPEC_CASES.items(), key=lambda kv: kv[1]['slot']) if d['kind'] in ('SDK', 'ARTIFACT_CHECK')]
SDK_CASES = [c for c in SLOT_CASES if SPEC_CASES[c]['kind'] == 'SDK']
ARTIFACT_CASES = [c for c in SLOT_CASES if SPEC_CASES[c]['kind'] == 'ARTIFACT_CHECK']
assert SDK_CASES == ['DP-PY19A', 'DP-PY19B', 'DP-PY19C', 'DP-PY02P'] and ARTIFACT_CASES == ['DP-PY20A']
assert SPEC_CASES[CONTROL_CASE]['kind'] == 'CONTROL' and len(SPEC_CASES) == 6
CONDITIONAL = {'DP-PY02P': 'DIAG-DP-REAL-CLI-APPSERVER'}  # execution-budget-dp-2.json#/conditional_diags
# DDP-12 (erratum DP-SPEC/R2-F01 (1)): declared topology of every service; the ARTIFACT_CHECK cases raise no service.
DRIVER_ONLY = ('DP-PY19A', 'DP-PY02P', 'DIAG-DP-STAGE', 'DIAG-DP-PYRUNTIME', 'DIAG-DP-REAL-CLI-APPSERVER')
# Cases that bind the staged /dist (CAP-DP-STAGE infra) and cases with fixture trees.
DIST_CASES = ('DP-PY19B', 'DP-PY19C', 'DP-PY02P', 'DIAG-DP-STAGE', 'DIAG-DP-REAL-CLI-APPSERVER')


def topology(case):
    return 'driver_only' if case in DRIVER_ONLY else 'adapter_peer'


# ------------------------------------------------------------------------------------------------ DIAG rows
_INIT = {'serverInfo': {'name': 'synthetic-diagnostic', 'version': '0.151.0'}, 'userAgent': 'synthetic-diagnostic/0.151.0'}
_TURN = {'result': {'turn': {'id': 'A', 'items': [], 'status': 'inProgress'}}}
_UNSCRIPTED = {'code': -32601, 'message': 'cvg synthetic: unscripted request', 'data': {'cvg_synthetic': True},
               'data_merge_rule': 'o peer acrescenta "method": <método recebido> ao data declarado',
               'sdk_class': 'openai_codex.errors.MethodNotFoundError'}
_INIT_RULE = {'match': {'method': 'initialize'}, 'reply': {'result': _INIT}}
PROCWITNESS_TAIL = ['--config', 'cvg="diag"', 'app-server', '--listen', 'stdio://']  # 2B-1 row of DIAG-PY-PROCWITNESS


def _ps(*rules):
    return {'version': 2, 'unscripted_error': _UNSCRIPTED, 'on_request': list(rules)}


def _note(method):
    return {'notification': {'method': method, 'params': {}}}


DIAG_ROWS = {
    # inherited (freeze r4), requalified under the 2B-1 sources
    'DIAG-PY-RPC': {'initialize_result': _INIT, 'turn_start_reply': _TURN},
    'DIAG-PY-STAGE': {'initialize_result': _INIT, 'large_bytes': 4096},
    'DIAG-PY-UNSCRIPTED': {'sdk_calls': [], 'peer_script': _ps(_INIT_RULE)},
    # CAP-2B-CONC-BARRIER: own Condition/Queue consumers parked, held request released by the plan, hooks on an own raising
    # function (return on unwind) and an own generator (call+return per resumption, counted per (id, event)), excepthook.
    'DIAG-PY-BARRIER': {'diag_calls': [
        {'step': 1, 'api': 'hook.install', 'hooks': [
            {'id': 'h_raise_ret', 'code': 'own2b.own_raises', 'event': 'return', 'record': ['arg:label', 'thread_name']},
            {'id': 'h_gen', 'code': 'own2b.own_generator', 'event': 'call+return', 'record': ['thread_name']}]},
        {'step': 2, 'api': 'excepthook.install'},
        {'step': 3, 'api': 'own.new', 'class': 'OwnClient', 'kwargs': {'launch': '$LAUNCH', 'cwd': '/work'}, 'as': 'oc'},
        {'step': 4, 'api': 'call', 'on': 'oc', 'method': 'start'},
        {'step': 5, 'api': 'call', 'on': 'oc', 'method': 'initialize'},
        {'step': 6, 'api': 'own.new', 'class': 'OwnBox', 'as': 'box'},
        {'step': 7, 'api': 'worker.start', 'name': 'W1', 'call': {'api': 'call', 'on': 'box', 'method': 'wait_item'}},
        {'step': 8, 'api': 'worker.start', 'name': 'W2', 'call': {'api': 'call', 'on': 'box', 'method': 'queue_get'}},
        {'step': 9, 'api': 'worker.parked', 'names': ['W1', 'W2'], 'timeout_s': 3},
        {'step': 10, 'api': 'worker.start', 'name': 'W3', 'call': {'api': 'call', 'on': 'oc', 'method': 'request', 'args': ['own/held']}},
        {'step': 11, 'api': 'barrier', 'id': 'held', 'witness': {'supervisor': 'peer REQUEST_HELD own/held'},
         'release': 'RELEASE_REPLY own/held, depois STEP_RELEASE'},
        {'step': 12, 'api': 'worker.join', 'names': ['W3'], 'timeout_s': 3},
        {'step': 13, 'api': 'call', 'on': 'box', 'method': 'put_one', 'args': ['a']},
        {'step': 14, 'api': 'call', 'on': 'box', 'method': 'queue_put', 'args': ['b']},
        {'step': 15, 'api': 'worker.join', 'names': ['W1', 'W2'], 'timeout_s': 3},
        {'step': 16, 'api': 'probe', 'id': 'box_items', 'path': ['box', '._items'], 'fn': 'value'},
        {'step': 17, 'api': 'call', 'on': 'own', 'method': 'own_raises', 'args': ['x']},
        {'step': 18, 'api': 'call', 'on': 'own', 'method': 'own_generator_drain', 'args': [2]},
        {'step': 19, 'api': 'call', 'on': 'own', 'method': 'own_thread_that_raises', 'args': ['t'], 'as': 'th'},
        {'step': 20, 'api': 'excepthook.wait', 'count': 1, 'timeout_s': 3},
        {'step': 21, 'api': 'excepthook.snapshot'},
        {'step': 22, 'api': 'epilogue', 'kind': 'eof_calls_done_release_exit_then_sdk_close'}],
        'peer_script': _ps(_INIT_RULE, {'match': {'method': 'own/held', 'params_absent': True}, 'hold': 'until_RELEASE_REPLY',
                                        'reply': {'result': {'held': True}}})},
    # CAP-2B-PEER-BEFORE-REPLY: two rules with frames before the reply, one of them held.
    'DIAG-PY-BEFOREREPLY': {'diag_calls': [
        {'step': 1, 'api': 'own.new', 'class': 'OwnClient', 'kwargs': {'launch': '$LAUNCH', 'cwd': '/work'}, 'as': 'oc'},
        {'step': 2, 'api': 'call', 'on': 'oc', 'method': 'start'},
        {'step': 3, 'api': 'call', 'on': 'oc', 'method': 'initialize'},
        {'step': 4, 'api': 'call', 'on': 'oc', 'method': 'request', 'args': ['own/early']},
        {'step': 5, 'api': 'worker.start', 'name': 'W1', 'call': {'api': 'call', 'on': 'oc', 'method': 'request', 'args': ['own/heldearly']}},
        {'step': 6, 'api': 'barrier', 'id': 'held_with_frames', 'witness': {'supervisor': 'peer REQUEST_HELD own/heldearly'},
         'release': 'RELEASE_REPLY own/heldearly, depois STEP_RELEASE'},
        {'step': 7, 'api': 'worker.join', 'names': ['W1'], 'timeout_s': 3},
        {'step': 8, 'api': 'probe', 'id': 'reader_order', 'path': ['oc', '._log'], 'fn': 'value'},
        {'step': 9, 'api': 'epilogue', 'kind': 'eof_calls_done_release_exit_then_sdk_close'}],
        'peer_script': _ps(_INIT_RULE,
                           {'match': {'method': 'own/early', 'params_absent': True}, 'before_reply': [_note('own/n1'), _note('own/n2')],
                            'reply': {'result': {'early': True}}},
                           {'match': {'method': 'own/heldearly', 'params_absent': True}, 'before_reply': [_note('own/n3')],
                            'hold': 'until_RELEASE_REPLY', 'reply': {'result': {'held': True}}})},
    # CAP-2B-PEER-LOGIN (D2B-08): own client (no SDK) sends account/login/start and account/login/cancel; login frames before and
    # after the reply; LOGIN_FRAME per frame, admission of the script, no UNSCRIPTED.
    'DIAG-PY-LOGIN': {'diag_calls': [
        {'step': 1, 'api': 'own.new', 'class': 'OwnClient', 'kwargs': {'launch': '$LAUNCH', 'cwd': '/work'}, 'as': 'oc'},
        {'step': 2, 'api': 'call', 'on': 'oc', 'method': 'start'},
        {'step': 3, 'api': 'call', 'on': 'oc', 'method': 'initialize'},
        {'step': 4, 'api': 'call', 'on': 'oc', 'method': 'request', 'args': ['account/login/start', {'type': 'chatgpt'}]},
        {'step': 5, 'api': 'call', 'on': 'oc', 'method': 'request', 'args': ['account/login/start', {'type': 'chatgptDeviceCode'}]},
        {'step': 6, 'api': 'call', 'on': 'oc', 'method': 'request', 'args': ['account/login/cancel', {'loginId': 'L-diag-a'}]},
        {'step': 7, 'api': 'probe.until', 'path': ['oc', '._log'], 'fn': 'len', 'equals': 7, 'timeout_s': 3},
        {'step': 8, 'api': 'probe', 'id': 'reader_order', 'path': ['oc', '._log'], 'fn': 'value'},
        {'step': 9, 'api': 'epilogue', 'kind': 'eof_calls_done_release_exit_then_sdk_close'}],
        'peer_script': _ps(_INIT_RULE,
                           {'match': {'method': 'account/login/start', 'params': {'type': 'chatgpt'}},
                            'before_reply': [{'notification': {'method': 'account/login/completed', 'params': {'loginId': 'L-diag-a', 'success': True}}}],
                            'reply': {'result': {'type': 'chatgpt', 'loginId': 'L-diag-a', 'authUrl': 'https://login.invalid/cvg-diag-a'}}},
                           {'match': {'method': 'account/login/start', 'params': {'type': 'chatgptDeviceCode'}},
                            'reply': {'result': {'type': 'chatgptDeviceCode', 'loginId': 'L-diag-b', 'userCode': 'CVG-DIAG',
                                                 'verificationUrl': 'https://login.invalid/cvg-diag-device'}},
                            'after_reply': [{'notification': {'method': 'account/login/completed',
                                                              'params': {'loginId': 'L-diag-b', 'success': False, 'error': 'synthetic denied'}}}]},
                           {'match': {'method': 'account/login/cancel', 'params': {'loginId': 'L-diag-a'}}, 'reply': {'result': {'status': 'canceled'}},
                            'after_reply': [{'notification': {'method': 'account/login/completed',
                                                              'params': {'loginId': 'L-diag-a', 'success': False, 'error': 'canceled'}}}]})},
    # CAP-2B-PROC-WITNESS (2B-1 row, requalified; not conditional in the DP-2: DP-PY19B and DP-PY19C need it): adapter through the exec launcher, PROC_WITNESS barrier
    # after the adapter BEGIN; a forced read before the BEGIN is the recorded negative control.
    'DIAG-PY-PROCWITNESS': {'diag_calls': [
        {'step': 1, 'api': 'own.new', 'class': 'OwnClient', 'kwargs': {'launch': ['/profile/adapter-python-exec'] + PROCWITNESS_TAIL,
                                                                      'cwd': '/work/tmp', 'env': {'CVG_DIAG_ENV': 'procwitness'}}, 'as': 'oc'},
        {'step': 2, 'api': 'call', 'on': 'oc', 'method': 'start'},
        {'step': 3, 'api': 'proc.retain', 'path': ['oc', '._proc'], 'as': 'p'},
        {'step': 4, 'api': 'barrier', 'id': 'proc_witness', 'witness': {'supervisor': 'PROC_WITNESS do adapter pelo lançador (forma pós-execv), '
                                                                                     'lido só depois do BEGIN do adapter; leitura forçada antes do BEGIN registrada como falha'}},
        {'step': 5, 'api': 'call', 'on': 'oc', 'method': 'initialize'},
        {'step': 6, 'api': 'epilogue', 'kind': 'eof_calls_done_release_exit_then_sdk_close'}],
        'peer_script': _ps(_INIT_RULE)},

    # CAP-DP-STAGE (DDP-02, DDP-11; own code): the staged /dist of the sub-lot, an own tar.gz and an own wheel staged by the same
    # streaming path (/fixture/ownstage), and a fixture tree with every DP-2 kind, read back inside the sandbox; writes refused (EROFS).
    'DIAG-DP-STAGE': {'diag_calls': [
        {'step': 1, 'api': 'dp.readback', 'id': 'dist_manifest', 'root': '/dist'},
        {'step': 2, 'api': 'dp.readback', 'id': 'fixture_manifest', 'root': '/fixture/dpstage'},
        {'step': 3, 'api': 'dp.readback', 'id': 'own_manifest', 'root': '/fixture/ownstage'},
        {'step': 4, 'api': 'dp.write_probe', 'id': 'write_probe', 'paths': ['/dist/py/site/cvg-write-probe', '/fixture/dpstage/cvg-write-probe',
                                                                           '/fixture/ownstage/cvg-write-probe', '/work/cvg-write-probe']},
        {'step': 5, 'api': 'epilogue', 'kind': 'calls_done_release_exit_then_sdk_close_if_open'}],
        'trees': [{'root': '/fixture/dpstage', 'entries': [
            {'path': '/fixture/dpstage/copy/codex-package.json', 'kind': 'copy_of_member', 'member': 'A1:codex_cli_bin/codex-package.json'},
            {'path': '/fixture/dpstage/copy/__init__.py', 'kind': 'copy_of_member', 'member': 'A1:codex_cli_bin/__init__.py'},
            {'path': '/fixture/dpstage/own/file.txt', 'kind': 'file', 'content': 'constant own file\n', 'mode': '0644'},
            {'path': '/fixture/dpstage/own/script', 'kind': 'file', 'content': '#!/bin/sh\nexit 0\n', 'mode': '0755'},
            {'path': '/fixture/dpstage/own/value.json', 'kind': 'json', 'value': {'own': True, 'n': 1}},
            {'path': '/fixture/dpstage/own/emptydir', 'kind': 'dir'},
            {'path': '/fixture/dpstage/launcher', 'kind': 'copy_of_profile', 'from': '/profile/adapter-python-exec', 'mode': '0755'},
            {'path': '/fixture/dpstage/link', 'kind': 'symlink', 'target': '/fixture/dpstage/copy/codex-package.json'}]}],
        'own_stage': '/fixture/ownstage'},
    # CAP-DP-PY-RUNTIME (DDP-06; own code): two own sites with a module of the same name; each import after a switch with purge comes
    # from the declared site; a switch without purge keeps the cached module (control of the purge).
    'DIAG-DP-PYRUNTIME': {'diag_calls': [
        {'step': 1, 'api': 'dp.import_probe', 'id': 'import_1', 'module': 'cvg_dp_mod'},
        {'step': 2, 'api': 'runtime.path', 'insert': '/fixture/pyrt/siteB', 'purge_modules': ['cvg_dp_mod']},
        {'step': 3, 'api': 'dp.import_probe', 'id': 'import_2', 'module': 'cvg_dp_mod'},
        {'step': 4, 'api': 'runtime.path', 'insert': '/fixture/pyrt/siteA', 'purge_modules': []},
        {'step': 5, 'api': 'dp.import_probe', 'id': 'import_3', 'module': 'cvg_dp_mod'},
        {'step': 6, 'api': 'runtime.path', 'insert': '/fixture/pyrt/siteA', 'purge_modules': ['cvg_dp_mod']},
        {'step': 7, 'api': 'dp.import_probe', 'id': 'import_4', 'module': 'cvg_dp_mod'},
        {'step': 8, 'api': 'epilogue', 'kind': 'calls_done_release_exit_then_sdk_close_if_open'}],
        'driver_runtime': {'sys_path_runtime': '/fixture/pyrt/siteA'},
        'trees': [{'root': '/fixture/pyrt', 'entries': [
            {'path': '/fixture/pyrt/siteA/cvg_dp_mod/__init__.py', 'kind': 'file', 'content': "SITE = 'A'\n", 'mode': '0644'},
            {'path': '/fixture/pyrt/siteB/cvg_dp_mod/__init__.py', 'kind': 'file', 'content': "SITE = 'B'\n", 'mode': '0644'}]}]},
    # CAP-DP-REAL-CLI-KEYLESS (DDP-05; own client, no SDK; DP-SPEC/R2-F05 and DP1-ADM/R2-F03): the published binary of the wheel
    # staging, started with the argv and the env the SDK builds in DP-PY02P, app-server on stdio, initialize + initialized, then stdin
    # closed and SIGTERM; realcli.witness after the PROC_RETAIN, with a forced request before it as the recorded negative control;
    # /dev and the tree outside /work recorded before and after and judged equal; limits 1 GiB and 256 tasks.
    'DIAG-DP-REAL-CLI-APPSERVER': {'diag_calls': [
        {'step': 1, 'api': 'dp.fs_snapshot', 'id': 'fs_before'},
        {'step': 2, 'api': 'realcli.witness', 'id': 'negative_before_retain', 'negative': True},
        {'step': 3, 'api': 'dp.realcli_start', 'as': 'rp',
         'argv': ['/dist/py/site/codex_cli_bin/bin/codex', '--config', 'model="cvg-dp"', 'app-server', '--listen', 'stdio://'],
         'env': dict(FIXED_ENV, PATH='/dist/py/site/codex_cli_bin/codex-path:/runtime'), 'cwd': '/work'},
        {'step': 4, 'api': 'realcli.witness', 'id': 'realcli_witness', 'pid_from': 'rp'},
        {'step': 5, 'api': 'dp.realcli_initialize', 'on': 'rp', 'timeout_s': 15},
        {'step': 6, 'api': 'dp.realcli_stop', 'on': 'rp', 'sigterm_wait_s': 2},
        {'step': 7, 'api': 'dp.fs_snapshot', 'id': 'fs_after', 'compare_to': 'fs_before'},
        {'step': 8, 'api': 'epilogue', 'kind': 'calls_done_release_exit_then_sdk_close_if_open'}]},
}
DIAG = {name: {'expect': 'PASS'} for name in DIAG_ROWS}
# execution-budget-dp-2.json#/planned/qualification_services (10 of 12 services, 2 in reserve), in that order.
ADMISSION_DIAGS = ['DIAG-PY-RPC', 'DIAG-PY-STAGE', 'DIAG-PY-UNSCRIPTED', 'DIAG-PY-BEFOREREPLY', 'DIAG-PY-BARRIER', 'DIAG-PY-LOGIN',
                   'DIAG-PY-PROCWITNESS', 'DIAG-DP-STAGE', 'DIAG-DP-PYRUNTIME', 'DIAG-DP-REAL-CLI-APPSERVER']
assert sorted(ADMISSION_DIAGS) == sorted(DIAG_ROWS)
# A failure of a conditional DIAG only switches off the slots it decides; every other DIAG is a stop condition
# (DIAG-PY-PROCWITNESS is not conditional in the DP-2: execution-budget-dp-2.json#/non_conditional_note).
CONDITIONAL_DIAGS = {'DIAG-DP-REAL-CLI-APPSERVER': ['DP-PY02P']}
# Own-code DIAG rows allowed in the pre-freeze dry mode (DP1-ADM/DV2 carry-over: never the real binary, never the SDK).
DRY_ROWS = ('DIAG-DP-STAGE', 'DIAG-DP-PYRUNTIME', 'DIAG-PY-BARRIER')
HOLD_PY = {'DIAG-PY-RPC'}  # inherited: held turn/start released after the driver cancellation witness
EOF_INHERITED = {'DIAG-PY-RPC', 'DIAG-PY-STAGE', 'DIAG-PY-UNSCRIPTED'}


def delivered_input(case):
    """F4-01: the case_input delivered to the roles, never derived from the sorted fixture-cases.json."""
    return SPEC_CASES[case]['case_input'] if case in SPEC_CASES else DIAG_ROWS[case]


def steps_of(case):
    ci = delivered_input(case)
    return ci.get('sdk_calls') or ci.get('diag_calls') or []


def epilogue_of(case):
    st = steps_of(case)
    return st[-1]['kind'] if st and st[-1]['api'] == 'epilogue' else None


def eof_case(case):
    """EOF-bounded interval: inherited DIAG rows, the CONTROL slot and every eof_* epilogue (D2B-12)."""
    return case in EOF_INHERITED or case == CONTROL_CASE or (epilogue_of(case) or '').startswith('eof_')


# ------------------------------------------------------------------------------------------------ D2B-11 barrier plan
# gate/conditions (supervisor-evaluable): ('held', method, params_subset) peer REQUEST_HELD of that client request;
# ('received', method, kind, n) peer RECEIVED count >= n; ('zero_spawn',) ZERO_SPAWN_CHECK; ('proc_witness',) PROC_WITNESS read
# after the adapter BEGIN; ('adapter_killed',) FAULT sigterm_ignored + zombie with SIGKILL status; ('driver_cancelled', step)
# driver API_CANCELLED of that step; ('hook', id, event, occurrence, record_subset) the occurrence-th driver HOOK_EVENT of
# (id, event), recounted here over the frames (None: any occurrence with the record subset). Actions run in order, each after its
# own conditions. Every entry is derived from the witness/release texts of the frozen barrier step of the same number.
BARRIER_PLAN = {
    # DP-PY19B / DP-PY19C: PROC_WITNESS of the adapter (cmdline and environ) after its BEGIN, then STEP_RELEASE (erratum R2-F01 (5):
    # barrier entries of DP-PY19B and DP-PY19C in the BARRIER_PLAN of the 2B-2).
    'DP-PY19B': {12: {'gate': [('proc_witness',)], 'actions': [('STEP_RELEASE', [])]}},
    'DP-PY19C': {6: {'gate': [('proc_witness',)], 'actions': [('STEP_RELEASE', [])]}},
    'DIAG-PY-BARRIER': {11: {'gate': [('held', 'own/held', {})], 'actions': [('RELEASE_REPLY', []), ('STEP_RELEASE', [])]}},
    'DIAG-PY-BEFOREREPLY': {6: {'gate': [('held', 'own/heldearly', {})], 'actions': [('RELEASE_REPLY', []), ('STEP_RELEASE', [])]}},
    'DIAG-PY-PROCWITNESS': {4: {'gate': [('proc_witness',)], 'actions': [('STEP_RELEASE', [])]}},
}
BARRIER_APIS = ('barrier', 'loop.block_release_wait_cancel')


def plan_check():
    """Every barrier step of every slot has exactly one plan entry and vice versa (selftest + plan command)."""
    problems = []
    for case in list(SPEC_CASES) + [d for d in DIAG_ROWS if 'diag_calls' in DIAG_ROWS[d]]:
        steps = {s['step'] for s in steps_of(case) if s['api'] in BARRIER_APIS}
        if steps and topology(case) == 'driver_only':
            problems.append([case, 'barrier step in a driver_only case'])
        if sorted(steps) != sorted(BARRIER_PLAN.get(case, {})):
            problems.append([case, sorted(steps), sorted(BARRIER_PLAN.get(case, {}))])
    return problems


def _load(name, mod):
    spec = importlib.util.spec_from_file_location(mod, HERE / name)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


OBS = _load('observer.py', 'cvg_observer_dp2')
ACC = _load('acceptance.py', 'cvg_acceptance_dp2')
STG = _load('stage_dp.py', 'cvg_stage_dp2')


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


def sdk_rows():
    rows = {}
    for cid, c in SPEC_CASES.items():
        row = c['case_input']
        assert sha_bytes(compact(row).encode('utf-8')) == c['case_input_sha256'], 'frozen case_input bytes of %s' % cid
        rows[cid] = row
    assert len(rows) == 6
    return rows


def fixture_bytes():
    rows = sdk_rows()
    assert not set(rows) & set(DIAG_ROWS)
    rows.update(DIAG_ROWS)
    return (json.dumps(rows, sort_keys=True, separators=(',', ':'), ensure_ascii=False) + '\n').encode('utf-8')


def role_argv(role, case):
    driver = '/profile/control-client.py' if case == CONTROL_CASE else '/profile/python-driver.py'
    return {'driver': ['/runtime/python', '-I', '-S', driver, '--case', case], 'adapter': list(LAUNCH),
            'peer': ['/runtime/python', '-I', '-S', '/profile/fixture-rpc.py', '--case', case]}[role]


# C32-ADM/R1-F03: wait_class only on the D3-05 list; the other waits of the vocabulary are always HARNESS_PRECONDITION.
WAIT_CLASS_APIS = ('thread.join', 'hook.wait', 'excepthook.wait', 'worker.join', 'probe.until')
WAIT_STEP_APIS = WAIT_CLASS_APIS + ('worker.parked', 'worker.still_parked', 'loop.yield_until', 'loop.block_release_wait_cancel')


def wait_classes(case):
    """D3-05: class of every wait of the slot, from its wait_class field (HARNESS_PRECONDITION without it, E2B-14)."""
    out = {}
    for s in steps_of(case):
        if s['api'] in WAIT_STEP_APIS:
            assert 'wait_class' not in s or s['api'] in WAIT_CLASS_APIS, 'wait_class outside the D3-05 list at %s step %s' % (case, s['step'])
            out[str(s['step'])] = {'api': s['api'], 'class': s.get('wait_class', 'HARNESS_PRECONDITION'), 'thread_name': s.get('thread_name')}
    return out


EPILOGUE_NOTES = {  # DP-SPEC/R2-F06: epilogue note per topology
    'adapter_peer': ('Sem barreira EOF: o driver emite CALLS_DONE; o supervisor manda FINISH_PEER se o peer ainda não terminou e libera '
                     'RELEASE_EXIT depois das saídas do adapter e do peer testemunhadas pelo SO; o close do SDK vem no finally do driver '
                     'se o caso não o chamou (no DP-PY19B e no DP-PY19C o caso chama close antes do epílogo).'),
    'driver_only': ('Sem adapter nem peer: o driver emite CALLS_DONE e o supervisor libera RELEASE_EXIT sem FINISH_PEER (FIFOs do adapter e '
                    'do peer vazios por declaração); o close do SDK vem no finally do driver se o caso não o chamou; o término do binário '
                    'publicado (DP-PY02P) é registrado, não julgado.')}


def trees_of(case):
    return delivered_input(case).get('trees') or []


def case_plan(case):
    if case in ARTIFACT_CASES:
        return {'language': 'python', 'kind': 'artifact_check', 'topology': 'none (no service; evaluator only, CAP-DP-ARTIFACT-CHECK)',
                'service': None, 'acceptance_predicates': ACC.plan(case)}
    kind = 'control' if case == CONTROL_CASE else ('diag' if case in DIAG else 'sdk')
    topo = topology(case)
    barriers = ['READY to each role after BEGIN identity + cgroup/PID witness' if topo == 'adapter_peer'
                else 'READY to the driver after its BEGIN identity + cgroup/PID witness (adapter and peer FIFOs bound and empty, DDP-12)']
    if case in HOLD_PY:
        barriers += ['ABORT_NOW->driver after peer REQUEST_HELD and the held line fully committed by the adapter',
                     'RELEASE_REPLY->peer after driver API_CANCELLED', 'FINISH_PEER->peer after driver LATE_REPLY_OBSERVED and peer STDIN_EOF']
    else:
        for step, entry in sorted(BARRIER_PLAN.get(case, {}).items()):
            barriers.append('step %d: gate %s -> actions %s' % (step, entry['gate'], entry['actions']))
        if topo == 'adapter_peer':
            barriers.append('FINISH_PEER->peer after driver CALLS_DONE%s, unless the peer already ended (exit frame or forwarded signal)'
                            % (' + CLIENT_STDIN_CLOSED + peer STDIN_EOF (EOF-bounded interval)' if eof_case(case) else ''))
    for s_ in steps_of(case):
        if s_['api'] == 'realcli.witness':
            barriers.append('step %d: WITNESS_REQUEST -> REALCLI_WITNESS (pid mapped by NSpid; refused before a PROC_RETAIN) -> WITNESS_DONE->driver'
                            % s_['step'])
    barriers.append('RELEASE_EXIT->driver after driver CALLS_DONE and adapter and peer exits witnessed by the OS (dead, zombie or absent)'
                    if topo == 'adapter_peer' else 'RELEASE_EXIT->driver after driver CALLS_DONE (no adapter or peer frame allowed)')
    barriers.append('driver /proc maps sampled right before RELEASE_EXIT->driver (loaded-code identity)')
    driver = {'control': 'control-client.py (own constant client, no SDK)', 'diag': 'python-driver.py own code (no SDK)',
              'sdk': 'python-driver.py Interp (frozen sdk_calls)'}[kind]
    ci = delivered_input(case)
    return {'language': 'python', 'kind': kind, 'topology': topo, 'driver': driver,
            'peer': 'fixture-rpc ScriptV2 (peer v2, D2B-09) or v1 constant rows' if topo == 'adapter_peer' else None,
            'barriers': barriers, 'barrier_plan': {str(k): v for k, v in sorted(BARRIER_PLAN.get(case, {}).items())},
            'wait_classes_r2_f04': wait_classes(case), 'epilogue': epilogue_of(case), 'eof_bounded': eof_case(case),
            'epilogue_note_r2_f06': EPILOGUE_NOTES[topo] if case in SDK_CASES else None,
            'service_properties': props_of(case), 'service_properties_diff_from_inherited': props_diff(props_of(case)),
            'binds': {'/dist': case in DIST_CASES, '/fixture': bool(trees_of(case)) or case == 'DIAG-DP-STAGE'},
            'driver_runtime': ci.get('driver_runtime'),
            'acceptance_predicates': ACC.plan(case) if case in SPEC_CASES else 'diag_checks + observer.reconcile%s' % (
                '_driver_only' if topo == 'driver_only' else '')}


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


# ------------------------------------------------------------------------------------------------ freezes

SOURCE_SET = (['python/' + n for n in ('acceptance.py', 'adapter-python.py', 'adapter-python-exec', 'bootstrap.py', 'channel.py',
                                       'control-client.py', 'fixture-rpc.py', 'harness2b.py', 'observer.py', 'own2b.py', 'ownmodels.py',
                                       'python-driver.py', 'stage_dp.py', 'supervisor.py')]
              + ['case-plan.json', 'fixture-cases.json']
              + ['inputs/spec-dp/' + n for n in sorted(SPEC_SHA)] + ['inputs/spec-dp/' + n for n in SPEC_EXTRA]
              + ['inputs/acquisition/' + n for n in ('acquisition-ledger.json', 'artifact-metadata.json', 'digest-verification.json',
                                                     'lead-decision-loopback-a5.json')]
              + ['inputs/spec-2b/' + n for n in sorted(SPEC_2B_SHA)] + ['inputs/spec-r4/' + n for n in sorted(SPEC_R4_SHA)]
              + ['selftests/selftest_dp2.py', 'selftests/selftest-results.json', 'tools/validate_unit.py', 'validation-unit.json'])


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
    got = {'spec-dp': {n: sha_path(SPEC / n) for n in SPEC_SHA}, 'spec-2b': {n: sha_path(SPEC_2B / n) for n in SPEC_2B_SHA},
           'spec-r4': {n: sha_path(SPEC_R4 / n) for n in SPEC_R4_SHA}}
    assert got == {'spec-dp': SPEC_SHA, 'spec-2b': SPEC_2B_SHA, 'spec-r4': SPEC_R4_SHA}, 'approved spec inputs drifted'
    return got


def admitted_trees():
    assert sha_path(ADMISSION_IDENTITY) == ADMISSION_IDENTITY_SHA, 'admission identity freeze drift'
    return json.loads(ADMISSION_IDENTITY.read_text())['trees']


def pydeps_anchors():
    """D2B-14: packaging/version.py of the staged python-deps tree (the DP-2 cases carry no stdlib or pydantic anchor of their own)."""
    got = {PYDEPS_ANCHOR[0]: sha_path(PY_DEPS_TREE / PYDEPS_ANCHOR[0])}
    assert got[PYDEPS_ANCHOR[0]] == PYDEPS_ANCHOR[1], 'packaging/version.py anchor'
    return got


def cache_identity():
    """DDP-08: the cache re-checked against acquisition-ledger.json (every DIGEST_OK archive and the M7 metadata) and the members of
    every cases-dp-2.json input against artifact-metadata.json; DP-SPEC/R2-F04: the A5 asset by the ledger and its members compared
    with the A1 payload in the identity freeze."""
    STG._ARCHIVE_OK.clear()
    archives = {aid: STG.check_archive(aid) for aid in sorted(STG.ARCHIVES)}
    _m7, m7_sha = STG.m7_metadata()
    members = {}
    for name, inp in _INPUTS.items():
        if 'member' in inp:
            aid = name.split(':', 1)[0]
            assert inp['archive_sha256'] == archives[aid], 'case input archive sha differs from the ledger: %s' % name
            members[name] = STG.member_sha(aid, inp['member'])
            assert members[name] == inp['member_sha256'], 'case input member drift: %s' % name
        elif 'cache_file' in inp:
            assert inp['sha256'] == m7_sha and inp['cache_file'] == STG.REQUESTS['M7']['dest'], 'M7 binding of %s' % name
    payload, problems = STG.compare_members('A1:codex_cli_bin/', 'A5:')
    assert not problems, 'A1/A5 payload differs: %s' % problems
    a5 = STG.ledger_item('A5')
    return {'archives': archives, 'm7_sha256': m7_sha, 'case_input_members': members, 'a5_ledger_item': a5, 'a1_a5_common_members': payload,
            'real_binary_member': {'ref': '%s:%s' % REAL_BIN_MEMBER, 'sha256': STG.MEMBERS[REAL_BIN_MEMBER[0]][REAL_BIN_MEMBER[1]]['sha256']}}


def dist_identity():
    """The staged /dist of the sub-lot against artifact-metadata.json (host-side hash of every file, modes included)."""
    got = STG.dist_manifest(DIST)
    assert got == STG.expected_dist(), 'staged /dist differs from artifact-metadata.json'
    return {'files': len(got), 'manifest_sha256': sha_bytes(compact(got).encode('utf-8'))}


def check_identity_freeze():
    assert IDENTITY.exists(), 'BLOCKED: no identity freeze dp2'
    raw = IDENTITY.read_bytes()
    ident = json.loads(raw)
    assert ident['status'] == 'FROZEN_BEFORE_SERVICES', 'identity freeze status'
    assert ident['source_freeze']['sha256'] == sha_bytes(FREEZE.read_bytes()), 'identity freeze binds another source freeze'
    assert tree_manifest(SDK_PY_TREE) == ident['trees']['sdk-python'], 'sdk-python tree drift'
    assert tree_manifest(PY_DEPS_TREE) == ident['trees']['python-deps'], 'python-deps tree drift'
    assert spec_hashes() == ident['spec_inputs'], 'spec inputs binding'
    assert pydeps_anchors() == ident['pydeps_anchors'], 'python-deps anchors binding'
    assert case_input_anchors() == ident['case_input_anchors'], 'case input anchors binding'
    for name, (path, digest) in HOST.items():
        assert ident['host'][name] == [path, digest], 'host identity binding'
    return {'path': IDENTITY.name, 'sha256': sha_bytes(raw)}


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
                'cmdline': [x.decode('utf-8', 'replace') for x in (cmd[:-1] if cmd and cmd[-1] == b'' else cmd)]}
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


def environ_of(info):
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


def role_of_cmdline(cmd):
    if not cmd:
        return 'unknown'
    if cmd[0].endswith('bwrap'):
        return 'bwrap'
    if '/profile/bootstrap.py' in cmd:
        return 'bootstrap'
    if '/profile/python-driver.py' in cmd or '/profile/control-client.py' in cmd:
        return 'driver'
    if '/profile/fixture-rpc.py' in cmd:
        return 'peer'
    if '/profile/adapter-python.py' in cmd or '/profile/adapter-python-exec' in cmd:
        return 'extra' if 'generate-json-schema' in cmd else 'adapter'
    return 'extra'


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
            if st.st_ino == int(inode) and ('%02x:%02x' % (os.major(st.st_dev), os.minor(st.st_dev))) == dev.lower():
                match = c
                break
        rec['class'] = 'ALLOWED_RO_ROOT' if match else 'UNKNOWN'
        rec['host_path'] = match
        entries.append(rec)
        if not match:
            unknown.append(rec)
    return entries, unknown


def stage_tree(src, dst):
    for rel in tree_manifest(src):
        q = dst / rel
        q.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(src / rel, q)


def seal_profile(prof):
    for top, dirs, names in os.walk(prof, topdown=False, followlinks=False):
        for n in names:
            p = Path(top) / n
            if p.is_symlink():
                continue
            os.chmod(p, 0o555 if (p.name == 'adapter-python-exec' and p.parent == prof) else 0o444)
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


def keyless_witness(info):
    """keyless.no_network_no_credential (DDP-05): interfaces and routes of the driver network namespace read from the host
    (/proc/<pid>/net/dev and /proc/<pid>/net/route), the driver environ keys against the closed credential list and CODEX_HOME."""
    pid = info['host_pid']
    out = {'host_pid': pid}
    try:
        dev = Path('/proc/%d/net/dev' % pid).read_text().splitlines()[2:]
        out['interfaces'] = sorted(x.split(':', 1)[0].strip() for x in dev if ':' in x)
        route = Path('/proc/%d/net/route' % pid).read_text().splitlines()[1:]
        out['routes'] = len([x for x in route if x.strip()])
        env = environ_of(info)
        out['environ_keys'] = sorted(env)
        out['credential_keys'] = sorted(k for k in env if k in CREDENTIAL_KEYS)
        out['codex_home_set'] = 'CODEX_HOME' in env
        out['net_ns_differs_from_host'] = info.get('net_ns') != os.readlink('/proc/self/ns/net')
    except OSError as exc:
        out['error'] = str(exc)[:200]
    out['ok'] = ('error' not in out and out.get('interfaces') == ['lo'] and out.get('routes') == 0 and not out.get('credential_keys')
                 and not out.get('codex_home_set') and out.get('net_ns_differs_from_host') is True)
    return out


# ------------------------------------------------------------------------------------------------ attempt

class Attempt:
    def __init__(self, case, dry=False):
        if dry:
            assert case in DRY_ROWS, 'dry mode refused for %s: only own-code DIAG rows %s (DP1-ADM/DV2)' % (case, list(DRY_ROWS))
        if case in DIAG:
            self.kind, self.expect_verdict = 'diag', DIAG[case]['expect']
        elif case in SDK_CASES:
            self.kind, self.expect_verdict = 'sdk', None
        elif case == CONTROL_CASE:
            self.kind, self.expect_verdict = 'control', 'PASS'
        else:
            raise ValueError('unknown case %r' % case)
        self.case = case
        self.dry = dry
        self.topology = topology(case)
        self.props = props_of(case)
        assert props_ok(case, self.props), 'service properties differ from the inherited table beyond DDP-05'
        self.deadline = 30 if self.kind != 'diag' else 25
        self.attempt = secrets.token_hex(20)
        self.nonce = secrets.token_hex(20)
        self.unit = '%s%s-%s.service' % (UNIT_PREFIX, self.attempt[:12], case.lower())
        base = DRY if dry else ATTEMPTS
        self.dir = base / (self.attempt[:12] + '-' + case)
        if dry:
            self.evidence = DRY / ('evidence-' + self.attempt[:12] + '-' + case)
        else:
            self.evidence = DIAG_DIR / (self.attempt[:12] + '-' + case) if self.kind == 'diag' else CASES_DIR / (case + '-' + self.attempt[:12])
        self.realcli = []
        self.witness_handled = 0
        self.keyless = None
        self.stage_witness = None
        self.fixture_host = None
        self.fixture_problems_host = None
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
        self.adapter_environ = None
        self.controls = {}
        self.logs = {}
        self.gidx = 0
        self.frame_gidx = {'driver': [], 'adapter': [], 'peer': []}
        self.barrier_state = {}
        self.barrier_log = []
        self.released = []  # RELEASE_REPLY targets (method, params, sha), in order
        self.proc_witnesses = []
        self.term = {}
        self.scan = {'adapter_pids': [], 'extra': [], 'samples': 0}
        self.zero_checks = []
        self._cond_step = None
        self.t0 = time.monotonic_ns()

    def act(self, name, **detail):
        self.gidx += 1
        self.actions.append({'t_ns': time.monotonic_ns() - self.t0, 'gidx': self.gidx, 'action': name, 'detail': detail})

    # ----------------------------------------------------------------- preparation
    def prepare(self):
        for name, (path, digest) in HOST.items():
            assert sha_path(path) == digest, 'host identity drift: ' + name
        if self.dry:
            assert not FREEZE.exists(), 'dry mode only before the source freeze'
            self.freeze, self.identity = {'dry': True}, {'dry': True}
        else:
            self.freeze = check_source_freeze()
            self.identity = check_identity_freeze()
        spec_hashes()
        self.dir.parent.mkdir(mode=0o700, exist_ok=True)
        self.dir.mkdir(mode=0o700, parents=False)
        fifo = self.dir / 'fifo'
        fifo.mkdir(mode=0o700)
        prof = self.dir / 'profile'
        prof.mkdir(mode=0o755)
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
        for name in PY_SOURCES:
            shutil.copyfile(HERE / name, prof / name)
        if self.case == CONTROL_CASE:
            os.remove(prof / 'python-driver.py')  # the CONTROL driver role is control-client.py; no SDK driver in its profile
        else:
            os.remove(prof / 'control-client.py')
        unbound = ()
        if self.kind == 'sdk' or self.case == 'DIAG-PY-STAGE':
            stage_tree(SDK_PY_TREE, prof / 'sdk-python')
            stage_tree(PY_DEPS_TREE, prof / 'python-deps')
        elif self.case == 'DIAG-PY-MODELORACLE':
            stage_tree(PY_DEPS_TREE, prof / 'python-deps')  # D2B-07: pydantic only; openai_codex is never in this profile
        if self.case == 'DIAG-PY-STAGE':
            (prof / 'sdk-drift-extra').mkdir()
            (prof / 'sdk-drift-extra' / 'bound.txt').write_text('constant bound file\n')
            (prof / 'sdk-drift-extra' / 'unbound.txt').write_text('constant unbound file\n')
            (prof / 'sdk-drift-link').mkdir()
            (prof / 'sdk-drift-link' / 'bound.txt').write_text('constant bound file\n')
            os.symlink('bound.txt', prof / 'sdk-drift-link' / 'link.txt')
            unbound = ('/profile/sdk-drift-extra/unbound.txt',)
        (prof / 'fixture-cases.json').write_bytes(fixture_bytes())
        self.stage()
        case_input = delivered_input(self.case)
        self.case_input_sha256 = sha_bytes(compact(case_input).encode('utf-8'))  # F4-01 supervisor witness, before READY
        if self.case in SPEC_CASES:
            assert self.case_input_sha256 == SPEC_CASES[self.case]['case_input_sha256'], 'delivered case_input differs from the frozen bytes'
        self.config = {'attempt': self.attempt, 'case': self.case, 'nonce': self.nonce, 'language': 'python',
                       'deadline_seconds': self.deadline, 'fifo_root': '/observer', 'fifo_nodes': list(NAMES),
                       'fifo_stat': self.fifo_stat, 'peer_argv': role_argv('peer', self.case), 'case_input': case_input,
                       'mode': {'diag': 'diagnostic', 'sdk': 'sdk', 'control': 'control'}[self.kind], 'topology': self.topology}
        (prof / 'adapter-config.json').write_text(compact(self.config) + '\n')
        self.files = profile_files(prof, unbound)
        self.admission = {'v': 1, 'attempt': self.attempt, 'case': self.case, 'nonce': self.nonce, 'language': 'python',
                          'runtime_sha256': HOST['python'][1], 'files': self.files, 'fifo_pipe_buf': self.pipe_buf,
                          'containment_admitted': True, 'sdk_admitted': self.kind == 'sdk', 'compiler_admitted': False}
        (prof / 'admission.json').write_text(compact(self.admission) + '\n')
        seal_profile(prof)
        assert profile_files(prof, unbound) == self.files, 'profile changed while sealing'
        self.expect = {}
        for role, src in ROLE_SOURCE.items():
            if role == 'driver' and self.case == CONTROL_CASE:
                src = 'control-client.py'
            self.expect[role] = {'attempt': self.attempt, 'case': self.case, 'nonce': self.nonce, 'source_sha256': self.files['/profile/' + src]}
        self.logs = {role: OBS.RoleLog(role, self.expect[role]) for role in self.expect}
        self.exe = os.stat(HOST['python'][0])
        self.plan = BARRIER_PLAN.get(self.case, {})

    def stage(self):
        """CAP-DP-STAGE on the host before the launch: fixture trees of the case (and the own staging of DIAG-DP-STAGE) under the
        attempt, read-only at /fixture; the sub-lot /dist re-checked against artifact-metadata.json and its archives against the
        ledger before every service that binds it (stage.bound_to_cache). Nothing is written to the cache."""
        trees = trees_of(self.case)
        own = DIAG_ROWS.get(self.case, {}).get('own_stage')
        self.fixture_dir = None
        if trees or own:
            self.fixture_dir = self.dir / 'fixture'
            self.fixture_dir.mkdir(mode=0o755)
            os.chmod(self.fixture_dir, 0o755)
            STG._ARCHIVE_OK.clear()
            if trees:
                STG.materialize(trees, self.fixture_dir)
            if own:
                STG.stage_own(STG.host_path(self.fixture_dir, own))
            self.fixture_host = STG.fixture_manifest(trees, self.fixture_dir) if trees else {}
            self.fixture_problems_host = STG.check_fixture(trees, self.fixture_host) if trees else []
            assert not self.fixture_problems_host, 'fixture trees differ from the declaration on the host: %s' % self.fixture_problems_host[:3]
        if self.case in DIST_CASES:
            STG._ARCHIVE_OK.clear()
            archives = {aid: STG.check_archive(aid) for aid, _p, _t in STG.LAYOUT}
            dist = dist_identity()
            real = os.stat(DIST / REAL_BIN_REL)
            self.stage_witness = {'archives': archives, 'archives_ok': all(archives[a] == STG.ARCHIVES[a]['observed']['sha256'] for a in archives),
                                  'dist': dist, 'dist_ok': True, 'real_binary': {'host_path': str(DIST / REAL_BIN_REL), 'dev_ino': [real.st_dev, real.st_ino],
                                                                                   'member': '%s:%s' % REAL_BIN_MEMBER}}
        elif trees:
            self.stage_witness = {'archives': {aid: STG._ARCHIVE_OK[aid] for aid in sorted(STG._ARCHIVE_OK)},
                                  'archives_ok': all(STG._ARCHIVE_OK[a] == STG.ARCHIVES[a]['observed']['sha256'] for a in STG._ARCHIVE_OK),
                                  'dist': None, 'dist_ok': None}

    def command(self):
        py = HOST['python'][0]
        bw = ['/usr/bin/bwrap', '--unshare-all', '--uid', '0', '--gid', '0', '--new-session', '--die-with-parent', '--clearenv',
              '--dir', '/runtime', '--dir', '/usr/lib', '--dir', '/usr/lib64', '--symlink', 'usr/lib', '/lib', '--symlink', 'usr/lib64', '/lib64',
              '--ro-bind', py, '/runtime/python',
              '--ro-bind', '/usr/lib/python3.12', '/usr/lib/python3.12', '--ro-bind', '/usr/lib/x86_64-linux-gnu', '/usr/lib/x86_64-linux-gnu',
              '--ro-bind', '/usr/lib/locale', '/usr/lib/locale',
              '--ro-bind', '/usr/lib/x86_64-linux-gnu/ld-linux-x86-64.so.2', '/usr/lib64/ld-linux-x86-64.so.2',
              '--ro-bind', str(self.dir / 'profile'), '/profile', '--dir', '/observer']
        for n in NAMES:
            bw += ['--ro-bind', str(self.dir / 'fifo' / n), '/observer/' + n]
        if self.case in DIST_CASES:
            bw += ['--ro-bind', str(DIST), '/dist']
        if self.fixture_dir is not None:
            bw += ['--ro-bind', str(self.fixture_dir), '/fixture']
        bw += ['--proc', '/proc', '--dev', '/dev', '--size', '67108864', '--tmpfs', '/work', '--dir', '/work/home', '--dir', '/work/tmp', '--chdir', '/work']
        for k, v in FIXED_ENV.items():
            bw += ['--setenv', k, v]
        bw += ['--remount-ro', '/', '--', '/runtime/python', '-I', '-S', '/profile/bootstrap.py'] + role_argv('driver', self.case)
        uid = os.getuid()
        env = {'PATH': '/usr/bin:/bin', 'HOME': str(Path.home()), 'LANG': 'C.UTF-8', 'XDG_RUNTIME_DIR': '/run/user/%d' % uid,
               'DBUS_SESSION_BUS_ADDRESS': 'unix:path=/run/user/%d/bus' % uid}
        if self.dry:  # pre-freeze own-code run: no systemd unit, no ledger, no budget (DRY_ROWS only)
            return bw, env
        cmd = ['/usr/bin/systemd-run', '--user', '--quiet', '--unit', self.unit, '--wait', '--pipe', '--collect']
        for k, v in self.props.items():
            cmd += ['--property', '%s=%s' % (k, v)]
        return cmd + ['--'] + bw, env

    def map_roots(self):
        return [('/runtime/python', HOST['python'][0]), ('/usr/lib64/ld-linux-x86-64.so.2', '/usr/lib/x86_64-linux-gnu/ld-linux-x86-64.so.2'),
                ('/usr/lib/python3.12/', '/usr/lib/python3.12/'), ('/usr/lib/x86_64-linux-gnu/', '/usr/lib/x86_64-linux-gnu/'),
                ('/usr/lib/locale/', '/usr/lib/locale/'), ('/profile/', str(self.dir / 'profile') + '/'), ('/dist/', str(DIST) + '/')] + (
                    [('/fixture/', str(self.fixture_dir) + '/')] if self.fixture_dir is not None else [])

    # ----------------------------------------------------------------- systemd/cgroup witnesses
    def systemctl(self, *args, timeout=5):
        _, env = self.command()
        if self.dry:  # no unit: stop/kill act on the process group of the bwrap child; show returns nothing
            proc = getattr(self, 'proc', None)
            if args and args[0] in ('stop', 'kill') and proc is not None and proc.poll() is None:
                try:
                    os.killpg(proc.pid, 9)
                except OSError:
                    pass
            return subprocess.CompletedProcess(args, 0, '', '')
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
        if self.dry:  # descendants of the bwrap child (no cgroup of our own in the dry mode)
            proc = getattr(self, 'proc', None)
            if proc is None:
                return []
            kids, out = {proc.pid}, []
            infos = [i for i in (proc_info(int(x)) for x in os.listdir('/proc') if x.isdigit()) if i]
            changed = True
            while changed:
                changed = False
                for i in infos:
                    if i['ppid'] in kids and i['host_pid'] not in kids:
                        kids.add(i['host_pid'])
                        changed = True
            return [i for i in infos if i['host_pid'] in kids and i['host_pid'] != proc.pid]
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
        if self.dry:
            return {'dry': 'no cgroup (pre-freeze own-code run)'}, True
        try:
            vals = {n: (self.cgroup / n).read_text().strip() for n in ('memory.max', 'pids.max', 'cpu.max')}
        except (OSError, TypeError):
            return {'error': 'unreadable'}, False
        q = vals['cpu.max'].split()
        return vals, (vals['memory.max'] == self.props['MemoryMax'] and vals['pids.max'] == self.props['TasksMax'] and len(q) == 2
                      and q[0] == q[1])

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
                ok = found['cmdline'][:4] == LAUNCH  # D2B-10: the tail (codex_bin form) is a client fact, judged by proc.argv_exact
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
            if role == 'driver':
                self.keyless = keyless_witness(found)
        if role != 'driver' and self.topology == 'driver_only':
            problems.append('%s BEGIN in a driver_only case (DDP-12)' % role)
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

    # ----------------------------------------------------------------- DDP-05 realcli.witness
    def realcli_requests(self):
        """Serve every new driver WITNESS_REQUEST in order: refused (and recorded) before a PROC_RETAIN of the requested pid; else the
        pid is mapped by NSpid in the cgroup (pid namespace of the driver), then cmdline, environ, /proc/<pid>/exe and the direct
        children of the driver are read and REALCLI_WITNESS is recorded; WITNESS_DONE always answers (the predicates decide)."""
        d = self.logs['driver']
        reqs = [e for e in d.kinds('DIAGNOSTIC') if e['data']['milestone'] == 'WITNESS_REQUEST']
        while self.witness_handled < len(reqs):
            req = reqs[self.witness_handled]
            self.witness_handled += 1
            det = req['data']['detail']
            retained = [e['data'] for e in d.kinds('PROC_RETAIN') if int(e['mono_ns']) < int(req['mono_ns'])]
            rec = {'request': self.witness_handled, 'step': det.get('step'), 'id': det.get('id'), 'pid': det.get('pid'), 'read': False}
            if det.get('pid') is None or not any(r.get('pid') == det.get('pid') for r in retained):
                rec.update({'ok': False, 'failure': 'read before the PROC_RETAIN of the pid is refused (realcli.witness_read)',
                            'retained_before': [r.get('pid') for r in retained]})
            else:
                rec.update(self.realcli_read(det['pid']))
            self.realcli.append(rec)
            self.act('REALCLI_WITNESS', **rec)
            self.send('driver', 'WITNESS_DONE', tag=self.witness_handled, request=self.witness_handled)

    def realcli_read(self, ns_pid):
        drv = self.role_host.get('driver')
        if drv is None:
            return {'ok': False, 'failure': 'driver not mapped'}
        found = None
        for m in self.members():
            if m['nspid'] and m['nspid'][-1] == ns_pid and m.get('pid_ns') == drv.get('pid_ns'):
                found = m
                break
        if found is None:
            return {'ok': False, 'failure': 'no cgroup member with NSpid %d in the driver pid namespace' % ns_pid}
        hp = found['host_pid']
        out = {'host_pid': hp, 'read': True, 'cmdline': found['cmdline'], 'ppid_is_driver': found['ppid'] == drv['host_pid']}
        try:
            out['environ'] = environ_of(found)
            st = os.stat('/proc/%d/exe' % hp)
            out['exe_dev_ino'] = [st.st_dev, st.st_ino]
            out['exe_link'] = os.readlink('/proc/%d/exe' % hp)
        except OSError as exc:
            out.update({'ok': False, 'failure': str(exc)[:200]})
            return out
        real = os.stat(DIST / REAL_BIN_REL)
        out['staging_dev_ino'] = [real.st_dev, real.st_ino]
        out['driver_children'] = sorted([[m['host_pid'], m['nspid'][-1] if m['nspid'] else None, m['cmdline'][:1]]
                                         for m in self.members() if m['ppid'] == drv['host_pid']])
        out['alive_after'] = alive(found)
        out['ok'] = out['alive_after'] and 'error' not in out['environ']
        if not out['ok']:
            out['failure'] = out['environ'].get('error') or 'process changed during the read'
        return out

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

    # ----------------------------------------------------------------- D2B-10 process witnesses
    def proc_witness(self, reason, force_before_begin=False):
        """cmdline, environ and cwd of the adapter, without privilege, only after the adapter BEGIN (else refused + recorded)."""
        a = self.logs['adapter']
        if force_before_begin or a.begin is None or 'adapter' not in self.role_host:
            rec = {'reason': reason, 'ok': False, 'failure': 'read before the adapter BEGIN is refused (proc.witness_recorded)', 'read': False,
                   'begin_seen': a.begin is not None}
            self.proc_witnesses.append(rec)
            self.act('PROC_WITNESS', **rec)
            return rec
        info = self.role_host['adapter']
        pid = info['host_pid']
        rec = {'reason': reason, 'host_pid': pid, 'read': True}
        try:
            rec['cmdline'] = [x.decode('utf-8', 'replace') for x in Path('/proc/%d/cmdline' % pid).read_bytes().split(b'\0')[:-1]]
            env = environ_of(info)
            rec['environ'] = env
            rec['cwd'] = os.readlink('/proc/%d/cwd' % pid)
            rec['alive_after'] = alive(info)
            rec['ok'] = rec['alive_after'] and 'error' not in env
            if not rec['ok']:
                rec['failure'] = env.get('error') or 'process changed during the read'
        except PermissionError as exc:
            rec.update({'ok': False, 'failure': 'privilege required: %s' % exc, 'privilege_required': True})
        except OSError as exc:
            rec.update({'ok': False, 'failure': str(exc)[:200]})
        self.proc_witnesses.append(rec)
        self.act('PROC_WITNESS', **rec)
        return rec

    def track_processes(self):
        """Termination tracker of mapped roles + cgroup scan (spawn count, extra processes)."""
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
        if self.cgroup is None:
            return
        self.scan['samples'] += 1
        for m in self.members():
            r = role_of_cmdline(m.get('cmdline'))
            key = [m['host_pid'], m['starttime']]
            if r == 'adapter' and key not in self.scan['adapter_pids']:
                self.scan['adapter_pids'].append(key)
                if self.case == 'DIAG-PY-PROCWITNESS' and self.logs['adapter'].begin is None and not self.proc_witnesses:
                    self.proc_witness('negative control: forced read before the adapter BEGIN', force_before_begin=True)
            elif r == 'extra' and key not in [x['key'] for x in self.scan['extra']]:
                self.scan['extra'].append({'key': key, 'cmdline': m.get('cmdline'), 't_ns': time.monotonic_ns() - self.t0})

    def zero_spawn(self):
        procs = {'adapter': 0, 'peer': 0}
        for m in self.members():
            r = role_of_cmdline(m.get('cmdline'))
            if r in procs:
                procs[r] += 1
        rec = {'adapter_processes': procs['adapter'], 'peer_processes': procs['peer'], 'adapter_frames': len(self.logs['adapter'].events),
               'ok': procs == {'adapter': 0, 'peer': 0} and not self.logs['adapter'].events}
        self.zero_checks.append(rec)
        self.act('ZERO_SPAWN_CHECK', **rec)
        return rec['ok']

    def adapter_killed(self):
        t = self.term.get('adapter') or {}
        return self.logs['adapter'].fault == 'sigterm_ignored' and t.get('zombie_exit_code') == 9

    # ----------------------------------------------------------------- control
    def send(self, role, command, tag=None, **detail):
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
        self.act('CONTROL', role=role, command=command, seq=obj['seq'], tag=tag, **detail)

    def role_exited(self, role):
        return role in self.role_host and not alive(self.role_host[role])

    def role_done(self, role):
        return self.logs[role].terminal is not None or self.role_exited(role)

    def exited_or_absent(self, role):
        if role in self.role_host:
            return self.role_exited(role)
        return not self.logs[role].events and not self.logs[role].raw_bytes

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
        return (sum(log.raw_bytes for log in self.logs.values()) + sum(len(v) for v in self.controls.values()) + sum(self.service_bytes.values()))

    # ----------------------------------------------------------------- barrier plan executor (D2B-11)
    def held_requests(self):
        """Peer REQUEST_HELD frames joined with the adapter-committed stdin line of the same bytes: [(method, params, sha)]."""
        lines, _ = OBS.lines_of(self.logs['adapter'].committed_bytes('stdin'))
        out = []
        for e in self.logs['peer'].kinds('REQUEST_HELD'):
            hit = [x for x in lines if len(x) == e['data']['bytes'] and OBS.h(x) == e['data']['sha256']]
            obj = ACC.strict_obj(hit[0][:-1]) if hit else None
            out.append((obj.get('method') if obj else None, (obj or {}).get('params'), e['data']['sha256']))
        return out

    def cond_ok(self, c):
        d, p = self.logs['driver'], self.logs['peer']
        kind = c[0]
        if kind == 'held':
            for m, prm, _sha in self.held_requests()[len(self.released):]:
                if m == c[1] and (not c[2] or (isinstance(prm, dict) and all(k in prm and ACC.jeq(prm[k], v) for k, v in c[2].items()))):
                    return True
            return False
        if kind == 'received':
            return sum(1 for m in p.milestones('RECEIVED') if m['detail'].get('method') == c[1] and m['detail'].get('kind') == c[2]) >= c[3]
        if kind == 'zero_spawn':
            self.zero_spawn()  # recorded; a spawn here is a client fact judged by proc.spawn_count_exact (never a stall)
            return True
        if kind == 'proc_witness':
            if self.logs['adapter'].begin is None or 'adapter' not in self.role_host:
                if self.case == 'DIAG-PY-PROCWITNESS' and not self.proc_witnesses:
                    self.proc_witness('negative control: forced read before the adapter BEGIN (barrier)', force_before_begin=True)
                return False
            self.proc_witness('barrier')  # a failed read is recorded; the release follows and the predicates decide
            return True
        if kind == 'adapter_killed':
            # Harness precondition with a bound: after 5 s from the driver witness the release follows and proc.witness_recorded fails.
            st = self.barrier_state.get(self._cond_step)
            if self.adapter_killed():
                return True
            if st is not None and time.monotonic() - st['t'] > 5.0:
                self.act('BARRIER_GATE_TIMEOUT', step=self._cond_step, condition='adapter_killed', termination=self.term.get('adapter'))
                return True
            return False
        if kind == 'driver_cancelled':
            return any(e['data']['message'].split(':', 1)[0] == str(c[1]) for e in d.kinds('API_CANCELLED'))
        if kind == 'hook':
            return self.hook_cond(c)
        raise AssertionError('unknown barrier condition %r' % (c,))

    def hook_cond(self, c):
        """('hook', id, event, occurrence, record_subset): the occurrence is recounted over the driver HOOK_EVENT frames per
        (id, event) (carry-over R1-F02); a frame whose self-reported occurrence differs from the recount stops the plan."""
        _, hid, ev, occ, subset = c
        seen = [e['data'] for e in self.logs['driver'].kinds('HOOK_EVENT') if e['data']['id'] == hid and e['data']['event'] == ev]
        bad = [k for k, x in enumerate(seen, 1) if x['occurrence'] != k]
        if bad:
            if 'HOOK_RECOUNT_STOP' not in self.done:
                self.done.add('HOOK_RECOUNT_STOP')
                self.admission_fail.append('HOOK_EVENT occurrence of %s:%s differs from the recount at %s' % (hid, ev, bad[:3]))
                self.act('HOOK_RECOUNT_MISMATCH', hook=hid, event=ev, positions=bad[:8])
            return False

        def rec_ok(x):
            return all(x['record'].get(k) == v for k, v in subset.items())
        if occ is None:
            return any(rec_ok(x) for x in seen)
        return len(seen) >= occ and rec_ok(seen[occ - 1])

    def run_plan(self):
        d = self.logs['driver']
        for e in d.milestones('STEP_WITNESS'):
            step = e['detail']['step']
            st = self.barrier_state.get(step)
            if st is None:
                if step not in self.plan:
                    if 'PLAN_STOP' not in self.done:
                        self.done.add('PLAN_STOP')
                        self.admission_fail.append('STEP_WITNESS of step %r outside the barrier plan (D2B-11)' % step)
                        c = self.systemctl('stop', self.unit, timeout=10)
                        self.act('PLAN_STOP', step=step, rc=c.returncode)
                    return
                st = self.barrier_state[step] = {'gate_done': False, 'next': 0, 't': time.monotonic()}
            entry = self.plan[step]
            self._cond_step = step
            if not st['gate_done']:
                if not all(self.cond_ok(c) for c in entry['gate']):
                    continue
                st['gate_done'] = True
                rec = {'step': step, 'gate': entry['gate'], 'witness': e['detail'],
                       'received_turn_start': sum(1 for m in self.logs['peer'].milestones('RECEIVED') if m['detail'].get('method') == 'turn/start')}
                self.barrier_log.append(rec)
                self.act('BARRIER_GATE', **rec)
            while st['next'] < len(entry['actions']):
                action, conds = entry['actions'][st['next']]
                if not all(self.cond_ok(c) for c in conds):
                    break
                if action == 'RELEASE_REPLY':
                    pending = self.held_requests()[len(self.released):]
                    if not pending:
                        break
                    self.released.append(pending[0])
                    self.send('peer', 'RELEASE_REPLY', tag='%d#%d' % (step, len(self.released)), method=pending[0][0],
                              params=pending[0][1], held_sha256=pending[0][2], step=step)
                elif action == 'STEP_RELEASE':
                    self.send('driver', 'STEP_RELEASE', tag=step, step=step)
                st['next'] += 1

    def advance(self):
        self.sample_peaks()
        self.track_processes()
        if self.admission_fail:
            return
        L = self.logs
        d, a, p = L['driver'], L['adapter'], L['peer']
        case = self.case
        if case in HOLD_PY:
            held = p.kinds('REQUEST_HELD')
            if held and not self.role_done('driver'):
                lines, _ = OBS.lines_of(a.committed_bytes('stdin'))
                hd = held[0]['data']
                if any(len(x) == hd['bytes'] and OBS.h(x) == hd['sha256'] for x in lines):
                    self.send('driver', 'ABORT_NOW')
            if 'ABORT_NOW->driver' in self.done and d.kinds('API_CANCELLED'):
                self.send('peer', 'RELEASE_REPLY')
            finished = d.milestones('LATE_REPLY_OBSERVED')
        else:
            self.run_plan()
            self.realcli_requests()
            finished = d.milestones('CALLS_DONE')
        if self.topology == 'driver_only':
            if finished and not self.role_done('driver') and not a.events and not p.events:
                self.release_driver()
            return
        if eof_case(case):
            finished = finished and d.milestones('CLIENT_STDIN_CLOSED') and p.milestones('STDIN_EOF')
        if finished and not self.role_done('peer') and not p.milestones('EXIT_AFTER_SCRIPT'):
            self.send('peer', 'FINISH_PEER')
        if (d.milestones('CALLS_DONE') or d.milestones('LATE_REPLY_OBSERVED')) and self.exited_or_absent('adapter') \
                and self.exited_or_absent('peer') and not self.role_done('driver'):
            self.release_driver()

    def take_batch(self, batch):
        """E2B-04 unit sequence: frames read in one select batch get their gidx in emission order (frame mono_ns, the same
        CLOCK_MONOTONIC in every role), all before any action the batch triggers; batches keep their arrival order."""
        rank = {'driver': 0, 'adapter': 1, 'peer': 2}
        batch.sort(key=lambda x: (int(x[1]['mono_ns']), rank[x[0]], x[1]['seq']))
        for role, _ev in batch:
            self.gidx += 1
            self.frame_gidx[role].append(self.gidx)
        for role, ev in batch:
            self.on_event(role, ev)

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
        except Exception as exc:  # noqa: BLE001
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
                  'role_status': {r: log.status() for r, log in self.logs.items()}, 'stop_rc': stop, 'actions': self.actions,
                  'elapsed_ns': time.monotonic_ns() - self.t0, 'functional_receipts': 0, 'observed_at': now_iso()}
        self.evidence.mkdir(parents=True, exist_ok=True)
        save_json(self.evidence / 'result.json', result)
        if self.launched and not self.dry:
            ledger_result(self.kind, self.unit, self.case, 'SUPERVISOR_ERROR/INVALID_CAPTURE')
        return result

    def result_kind(self):
        return {'diag': 'CONSTANT_DIAGNOSTIC_NOT_SDK_EXECUTION', 'control': 'CONTROL_KNOWN_BAD_REACH_NOT_SDK_OBSERVATION',
                'sdk': 'SDK_CLIENT_OBSERVATION_REFERENCE_PROFILE_NOT_PARITY_RECEIPT'}[self.kind]

    def write_preamble(self, cmd, env):
        ev = self.evidence
        ev.mkdir(parents=True, exist_ok=False)
        save_json(ev / 'command.json', {'unit': self.unit, 'attempt': self.attempt, 'case': self.case, 'kind': self.kind, 'argv': cmd,
                                        'source_freeze': self.freeze, 'identity_freeze': self.identity, 'load_wait': getattr(self, 'load_wait', None),
                                        'env_keys': sorted(env), 'service_properties': self.props, 'topology': self.topology,
                                        'service_properties_inherited': INHERITED_PROPS, 'service_properties_diff': props_diff(self.props),
                                        'service_properties_ok_r2_f05': props_ok(self.case, self.props), 'dry': self.dry,
                                        'fifo_stat': self.fifo_stat, 'pipe_buf': self.pipe_buf, 'runtime_dir': str(self.dir),
                                        't0_monotonic_ns': str(self.t0)})
        (ev / 'profile').mkdir()
        for name in ('adapter-config.json', 'admission.json'):
            shutil.copyfile(self.dir / 'profile' / name, ev / 'profile' / name)
        save_json(ev / 'profile-manifest.json', {'files': self.files, 'admission_sha256': sha_path(self.dir / 'profile' / 'admission.json'),
                                                 'admission': {k: v for k, v in self.admission.items() if k != 'files'},
                                                 'config_sha256': self.files['/profile/adapter-config.json'],
                                                 'case_plan': case_plan(self.case), 'deadline_seconds': self.deadline,
                                                 # C32-ADM/DV-C32-02: the folder records the plan file it ran under.
                                                 'case_plan_file': {'path': PLAN_FILE.name, 'sha256': sha_path(PLAN_FILE) if PLAN_FILE.exists() else None},
                                                 'topology': self.topology, 'stage_witness': self.stage_witness,
                                                 'fixture_manifest_host': self.fixture_host, 'fixture_problems_host': self.fixture_problems_host})

    def take_budget(self):
        if self.dry:
            self.act('LAUNCH', dry=True)
            return
        if self.kind in ('sdk', 'control'):
            self.act('LAUNCH', case_slots_used=case_take(self.unit, self.case, self.attempt))
        else:
            self.act('LAUNCH', services_used=budget_take(self.unit, self.case, self.attempt))

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
        hard = time.monotonic() + self.deadline + 25
        timed_out = False
        while True:
            if time.monotonic() > hard:
                timed_out = True
                c = self.systemctl('kill', '--signal=SIGKILL', self.unit)
                self.act('SUPERVISOR_BOUND_KILL', rc=c.returncode)
                break
            r, _, _ = select.select(list(open_streams) + list(readers), [], [], 0.02)
            batch = []
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
                batch += [(role, ev) for ev in self.logs[role].feed(b, time.monotonic_ns() - self.t0)]
            self.take_batch(batch)
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
                    self.gidx += 1
                    self.frame_gidx[r].append(self.gidx)
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
            'unit_collected': self.dry or after.get('LoadState') == 'not-found',
            'fifo_eof_all': all(eof.values()),
            'supervisor_bound_not_hit': not timed_out,
            'driver_exit_zero': rc == 0,
            'case_artifact_budget': not self.budget_hit and self.case_bytes() <= CASE_ARTIFACTS,
            'service_output_within_cap': all(v <= SERVICE_OUTPUT_CAP for v in self.service_bytes.values()),
        }
        if self.topology == 'driver_only':
            verdict, reasons, facts = OBS.reconcile_driver_only(self.logs, {'checks': checks})
        else:
            verdict, reasons, facts = OBS.reconcile(self.logs, 'python', {'checks': checks}, None, None)
        ev = self.evidence
        for r, log in self.logs.items():
            (ev / ('events-%s.bin' % r)).write_bytes(bytes(log.raw))
            (ev / ('events-%s.jsonl' % r)).write_text(''.join(compact(e) + '\n' for e in log.events))
            (ev / ('events-%s.recv.jsonl' % r)).write_text(''.join(compact({'seq': e['seq'], 'kind': e['kind'], 'recv_ns': rn, 'gidx': g}) + '\n'
                                                                   for e, rn, g in zip(log.events, log.recv_ns, self.frame_gidx[r])))
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
                   'control_actions': [x for x in self.actions if x['action'] == 'CONTROL'], 'actions': self.actions,
                   'frame_gidx': self.frame_gidx, 'barrier_log': self.barrier_log, 'proc_witnesses': self.proc_witnesses,
                   'termination': self.term, 'scan': self.scan, 'zero_checks': self.zero_checks, 'role_mapped': sorted(self.role_host),
                   'timed_out': timed_out, 'plan': {str(k): v for k, v in self.plan.items()},
                   'topology': self.topology, 'realcli_witnesses': self.realcli, 'keyless': self.keyless, 'cgroup_limits': getattr(self, 'limits', None),
                   'limits_ok': bool(getattr(self, 'limits_ok', False)), 'declared_limits': {k: self.props[k] for k in ('MemoryMax', 'TasksMax')},
                   'stage_witness': self.stage_witness, 'fixture_manifest_host': self.fixture_host,
                   'fixture_problems_host': self.fixture_problems_host, 'dry': self.dry}
        result = {'kind': self.result_kind(), 'case': self.case, 'unit': self.unit, 'attempt': self.attempt, 'language': 'python',
                  'verdict': verdict, 'reasons': reasons, 'facts': facts, 'os_checks': checks,
                  'role_status': {r: log.status() for r, log in self.logs.items()}, 'role_violation': {r: log.violation for r, log in self.logs.items()},
                  'role_host': self.role_host, 'adapter_environ': self.adapter_environ, 'maps_witness': self.maps,
                  'cgroup_limits': getattr(self, 'limits', None), 'cgroup_peaks_sampled': self.peaks,
                  'service_before': self.service, 'service_after': after, 'cgroup_events_after': cg_events, 'systemd_run_rc': rc,
                  'actions': self.actions, 'frames': {r: len(log.events) for r, log in self.logs.items()},
                  'raw_frame_bytes': {r: log.raw_bytes for r, log in self.logs.items()}, 'case_artifact_bytes': self.case_bytes(),
                  'service_output_bytes': self.service_bytes, 'timed_out': timed_out, 'barrier_log': self.barrier_log,
                  'proc_witnesses': self.proc_witnesses, 'termination': self.term, 'process_scan': self.scan, 'zero_checks': self.zero_checks,
                  'case_input_sha256_supervisor': self.case_input_sha256, 't0_monotonic_ns': str(self.t0), 'source_freeze': self.freeze,
                  'topology': self.topology, 'realcli_witnesses': self.realcli, 'keyless': self.keyless, 'stage_witness': self.stage_witness,
                  'declared_limits': {k: self.props[k] for k in ('MemoryMax', 'TasksMax')}, 'host_net_ns': self.host_netns, 'dry': self.dry,
                  'identity_freeze': self.identity, 'elapsed_ns': time.monotonic_ns() - self.t0, 'functional_receipts': 0, 'observed_at': now_iso()}
        if self.kind == 'diag':
            diag_checks = ACC.diag_checks(self.case, self.logs, verdict, witness, self.config['case_input'], self.case_input_sha256)
            # info_* keys are recorded constants (never pass criteria of the DIAG); gate_* keys are kept from the 2B-1 form.
            status = 'DIAG_PASS' if verdict == self.expect_verdict and all(v for k, v in diag_checks.items()
                                                                           if not k.startswith('gate_') and not k.startswith('info_')) else 'DIAG_FAIL'
            result.update({'expected_verdict': self.expect_verdict, 'status': status, 'diag_checks': diag_checks, 'SDK_imports': 0})
            save_json(ev / 'result.json', result)
            if not self.dry:
                ledger_result(self.kind, self.unit, self.case, '%s/%s' % (status, verdict))
            return result
        acceptance = ACC.evaluate(self.case, self.logs, verdict, reasons, witness)
        save_json(ev / 'acceptance.json', acceptance)
        result.update({'outcome': acceptance['outcome'], 'status': 'EXECUTED_ONCE', 'acceptance': 'acceptance.json',
                       'SDK_runtime': 'RUN_ONCE_CONTAINED' if self.kind == 'sdk' else 'NOT_IN_THIS_SERVICE (control client, no SDK)',
                       'parity_credit': 0})
        save_json(ev / 'result.json', result)
        ledger_result(self.kind, self.unit, self.case, '%s/%s' % (acceptance['outcome'], verdict))
        return result


# ------------------------------------------------------------------------------------------------ commands

def stage_trees():
    trees = admitted_trees()
    for name, dst in (('sdk-python', SDK_PY_TREE), ('python-deps', PY_DEPS_TREE)):
        if not dst.exists():
            stage_tree(STAGED_FROM / name, dst)
        assert tree_manifest(dst) == trees[name], '%s differs from the admitted tree' % name
    validation = json.loads((ARTIFACTS / 'validation.json').read_text())
    deps_expected = {f['path']: {'bytes': f['bytes'], 'sha256': f['sha256']} for f in validation['merged_python']['files']}
    assert tree_manifest(PY_DEPS_TREE) == deps_expected, 'python-deps differs from the authenticated validation.json merge'
    pydeps_anchors()
    return {k: len(v) for k, v in trees.items()}


def stage_dist():
    """CAP-DP-STAGE: /dist of the sub-lot from the cache (archives checked against the ledger, members against the metadata)."""
    got = STG.stage_dist(DIST)
    return {'dist': str(DIST), 'files': len(got), 'manifest_sha256': sha_bytes(compact(got).encode('utf-8'))}


def freeze_identities():
    src = check_source_freeze()
    trees = admitted_trees()
    assert tree_manifest(SDK_PY_TREE) == trees['sdk-python'] and tree_manifest(PY_DEPS_TREE) == trees['python-deps'], 'staged trees drift'
    static = json.loads((ADMISSION / 'static-admission.json').read_text())
    assert static['status'] == 'PASS', 'static admission not PASS'
    ident = {'kind': 'IDENTITY_FREEZE_DP2', 'status': 'FROZEN_BEFORE_SERVICES', 'task': 'DX100-G02:IMPLEMENT-AND-ADMIT-SDK-DISTRIBUTED-PROFILE-DP-2',
             'source_freeze': src, 'trees': {'sdk-python': trees['sdk-python'], 'python-deps': trees['python-deps']},
             'admission_identity_freeze': {'path': 'g02/sdk-admission/identity-freeze.json', 'sha256': ADMISSION_IDENTITY_SHA},
             'static_admission': {'path': 'g02/sdk-admission/static-admission.json', 'sha256': sha_path(ADMISSION / 'static-admission.json')},
             'pydeps_anchors': pydeps_anchors(), 'dependency_identity': {'pydantic': '2.13.4', 'pydantic_core': '2.46.4'},
             'cache': cache_identity(), 'dist': dist_identity(),
             'host': {k: list(v) for k, v in HOST.items()}, 'service_properties': {c: props_of(c) for c in [CONTROL_CASE] + SDK_CASES + ADMISSION_DIAGS},
             'service_properties_inherited': INHERITED_PROPS, 'sandbox_env': FIXED_ENV, 'topology': {c: topology(c) for c in [CONTROL_CASE] + SDK_CASES + ADMISSION_DIAGS},
             'argv': {role: role_argv(role, 'CASE_ID') for role in ('driver', 'adapter', 'peer')}, 'control_argv': role_argv('driver', CONTROL_CASE),
             'spec_inputs': spec_hashes(), 'frozen_at': now_iso(), 'case_input_anchors': case_input_anchors(),
             'note': ('Antes de qualquer serviço (DDP-08): reconfere o cache contra acquisition-ledger.json (arquivos compactados e M7), os membros '
                      'das entradas dos casos contra artifact-metadata.json, o A5 pelo registro e os membros comuns A1/A5 (DP-SPEC/R2-F04), o /dist '
                      'do sub-lote, as fontes .py do pin e as árvores admitidas; os DIAG ficam em diag-admission-dp2.json. Nenhuma capability do '
                      'kernel nem privilégio (Q4); binário publicado só dentro da contenção (Q3).')}
    save_new_json(IDENTITY, ident)
    return ident


def case_input_anchors():
    """cases-dp-2.json#/inputs: the .py sources of the pin re-checked by sha (path relative to the spec folder; ../ is g02/); the cache
    inputs are re-checked by cache_identity()."""
    got = {}
    for name, inp in _INPUTS.items():
        if 'path' in inp:
            assert inp['path'].startswith('../'), 'input path relative to the spec folder'
            got[name] = sha_path(G02 / inp['path'][3:])
            assert got[name] == inp['sha256'], 'case input anchor drift: %s' % name
    return got


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
    stop = [m['case'] for m in missing if m['case'] not in CONDITIONAL_DIAGS]
    assert not stop, 'BLOCKED: no DIAG_PASS of non-conditional %s (stop condition of the sub-lot)' % stop
    decisions = {slot: {'decision': 'RUN' if need in diag else 'NOT_USED', 'needs': {need: diag.get(need)},
                        'rule': 'execution-budget-dp-2.json#/conditional_diags: a falha de %s desliga só %s' % (need, slot)}
                 for slot, need in CONDITIONAL.items()}
    doc = {'kind': 'DIAG_ADMISSION_DP2', 'task': 'DX100-G02:IMPLEMENT-AND-ADMIT-SDK-DISTRIBUTED-PROFILE-DP-2', 'source_freeze': src, 'identity_freeze': idf,
           'admission_diagnostics': diag, 'conditional_diags_without_pass': missing, 'conditional_slots': decisions,
           'open_if_not_used': {'DP-PY02P': ['PY02.B11', 'PY19.B05']}, 'recorded_at': now_iso()}
    save_new_json(DIAG_ADMISSION, doc)
    return doc


def init_ledgers():
    save_new_json(BUDGET, {'kind': 'SERVICE_BUDGET', 'services_max': 12, 'services_used': 0, 'planned': ADMISSION_DIAGS,
                           'rule': 'qualification services only (2 in reserve, admission diagnostics only); never a case repetition; no automatic retry',
                           'history': [], 'updated_at': now_iso()})
    slots = {c: {'status': 'UNUSED'} for c in [CONTROL_CASE] + SLOT_CASES}
    assert len(slots) == 6
    save_new_json(CASE_LEDGER, {'kind': 'SINGLE_USE_CASE_SLOTS', 'slots_max': 6, 'used': 0, 'slots': slots,
                                'rule': 'one use per slot, once, serial, no retry; DP2-CTRL01 first (gate: MISMATCH by rule 6 only from '
                                        'wire.no_turn_interrupt, sanities approved, peer.login_frames_synthetic included); then the slots in slot '
                                        'order; DP-PY02P only with the RUN decision of DIAG-DP-REAL-CLI-APPSERVER, otherwise left unused and never '
                                        'reassigned; DP-PY20A uses its slot without a service (evaluator only)',
                                'updated_at': now_iso()})


def slot_gate(case):
    """Serial slot order (a slot left unused by its conditional decision counts as passed) and the conditional decision."""
    ledger = json.loads(CASE_LEDGER.read_text())
    adm = json.loads(DIAG_ADMISSION.read_text())
    unused = {s for s, d in adm['conditional_slots'].items() if d['decision'] != 'RUN'}
    assert case not in unused, 'BLOCKED: conditional slot %s not released by its DIAG (left unused, never reassigned)' % case
    before = SLOT_CASES[:SLOT_CASES.index(case)]
    pending = [c for c in before if c not in unused and ledger['slots'][c]['status'] != 'EXECUTED']
    assert not pending, 'BLOCKED: slots before %s not executed yet: %s' % (case, pending)


def control_gate():
    """Rule 6 and failed predicates exactly [wire.no_turn_interrupt], sanities approved."""
    ledger = json.loads(CASE_LEDGER.read_text())
    assert ledger['slots'][CONTROL_CASE]['status'] == 'EXECUTED', 'BLOCKED: the CONTROL gate %s must run first' % CONTROL_CASE
    acc = json.loads(next(CASES_DIR.glob(CONTROL_CASE + '-*/acceptance.json')).read_text())
    ok = acc['outcome'] == 'MISMATCH' and acc['composition_rule'] == 6 and acc['failed_predicates'] == ['wire.no_turn_interrupt']
    assert ok, 'BLOCKED: CONTROL gate not met (%s, rule %s, %s)' % (acc['outcome'], acc['composition_rule'], acc['failed_predicates'])


def run_artifact(case):
    """DP-PY20A (CAP-DP-ARTIFACT-CHECK): the single-use slot without a service; the evaluator reads the cache by sha."""
    check_source_freeze()
    check_identity_freeze()
    attempt = secrets.token_hex(20)
    unit = 'no-service-%s-%s' % (attempt[:12], case.lower())
    ev = CASES_DIR / (case + '-' + attempt[:12])
    ev.mkdir(parents=True, exist_ok=False)
    case_take(unit, case, attempt)
    t0 = time.monotonic_ns()
    acc = ACC.evaluate_artifact(case)
    save_json(ev / 'acceptance.json', acc)
    result = {'kind': 'ARTIFACT_CHECK_EVALUATOR_ONLY_NO_SERVICE', 'case': case, 'unit': unit, 'attempt': attempt, 'verdict': 'ARTIFACT_CHECK',
              'outcome': acc['outcome'], 'status': 'EXECUTED_ONCE', 'acceptance': 'acceptance.json', 'service': None,
              'source_freeze': check_source_freeze(), 'identity_freeze': check_identity_freeze(),
              'case_plan_file': {'path': PLAN_FILE.name, 'sha256': sha_path(PLAN_FILE)}, 'elapsed_ns': time.monotonic_ns() - t0,
              'functional_receipts': 0, 'parity_credit': 0, 'observed_at': now_iso()}
    save_json(ev / 'result.json', result)
    ledger_result('sdk', unit, case, '%s/ARTIFACT_CHECK' % acc['outcome'])
    return result


def main(argv):
    if argv[:1] == ['stage-trees']:
        print(json.dumps(stage_trees()))
        return 0
    if argv[:1] == ['stage-dist']:
        print(json.dumps(stage_dist()))
        return 0
    if argv[:1] == ['fixtures']:
        b = fixture_bytes()
        (UNIT / 'fixture-cases.json').write_bytes(b)
        print(json.dumps({'fixture_cases_sha256': sha_bytes(b), 'rows': len(json.loads(b))}))
        return 0
    if argv[:1] == ['plan']:
        problems = plan_check()
        assert not problems, 'barrier plan does not cover the barrier steps: %s' % problems
        plan = {c: case_plan(c) for c in [CONTROL_CASE] + SLOT_CASES + ADMISSION_DIAGS}
        save_json(PLAN_FILE, {'kind': 'CASE_PLAN_FROM_SUPERVISOR_TABLES', 'cases': plan, 'diagnostics': DIAG,
                              'admission_diagnostics': ADMISSION_DIAGS, 'conditional_diags': CONDITIONAL_DIAGS,
                              'conditional_slots': CONDITIONAL, 'topology': {c: plan[c]['topology'] for c in plan},
                              'dry_rows': list(DRY_ROWS)})
        print(len(plan))
        return 0
    if argv[:1] == ['init-ledgers']:
        init_ledgers()
        print('ledgers written')
        return 0
    if argv[:1] == ['freeze']:
        files = source_freeze_files()
        save_new_json(FREEZE, {'kind': 'SOURCE_FREEZE', 'task': 'DX100-G02:IMPLEMENT-AND-ADMIT-SDK-DISTRIBUTED-PROFILE-DP-2', 'files': files,
                               'file_count': len(files), 'frozen_at': now_iso()})
        print(json.dumps({'freeze': FREEZE.name, 'sha256': sha_path(FREEZE), 'files': len(files)}))
        return 0
    if argv[:1] == ['freeze-identities']:
        freeze_identities()
        print(json.dumps({'identity_freeze': IDENTITY.name, 'sha256': sha_path(IDENTITY)}))
        return 0
    if argv[:1] == ['diag-admission']:
        doc = diag_admission()
        print(json.dumps({'diag_admission': DIAG_ADMISSION.name, 'sha256': sha_path(DIAG_ADMISSION),
                          'diagnostics': sorted(doc['admission_diagnostics']),
                          'conditional_slots': {k: v['decision'] for k, v in doc['conditional_slots'].items()}}))
        return 0
    if len(argv) == 2 and argv[0] == 'dry':
        result = Attempt(argv[1], dry=True).run()
        keys = ('case', 'verdict', 'status', 'reasons', 'diag_checks', 'os_checks', 'role_status', 'elapsed_ns')
        print(json.dumps({k: result.get(k) for k in keys}, indent=1, default=str))
        return 0 if result.get('status') == 'DIAG_PASS' else 1
    if len(argv) == 2 and argv[0] == 'run':
        case = argv[1]
        if case in SLOT_CASES:
            assert DIAG_ADMISSION.exists(), 'BLOCKED: no diag-admission-dp2.json'
            control_gate()
            slot_gate(case)
        if case == CONTROL_CASE:
            assert DIAG_ADMISSION.exists(), 'BLOCKED: the DIAG admission must precede the CONTROL'
            assert json.loads(CASE_LEDGER.read_text())['used'] == 0, 'BLOCKED: the CONTROL runs before every other slot'
        result = run_artifact(case) if case in ARTIFACT_CASES else Attempt(case).run()
        keys = ('case', 'unit', 'kind', 'verdict', 'outcome', 'status', 'reasons', 'diag_checks', 'os_checks', 'role_status', 'elapsed_ns')
        print(json.dumps({k: result.get(k) for k in keys}, indent=1, default=str))
        return 0 if result['status'] in ('DIAG_PASS', 'EXECUTED_ONCE') else 1
    print(__doc__)
    return 2


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
