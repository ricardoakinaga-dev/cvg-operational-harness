"""Host supervisor of DX100-G02:IMPLEMENT-AND-ADMIT-SDK-SOURCE-CONTINUATION-3-2 (runs OUTSIDE the target cgroup).

Derived from the supervisor of the batch 2B-2 (g02/sdk-batch-2b2-admission/python/supervisor.py: F4-01 delivered case_input from
the frozen slot bytes with supervisor, role and evaluator witnesses; FIFO observer channel; transient systemd unit + bwrap sandbox;
/proc and cgroup witnesses with the PROC_WITNESS of D2B-10; one global sequence index gidx over every received frame and every action;
D2B-11 barrier plan with hook conditions (id, event, occurrence)) with the deltas of freeze-r4-c3-delta.json for the Python sub-lot C3-2:

- D3-01 cases-c3-2.json bound by sha: 13 SDK slots + C32-CTRL01 (14); C3-PY02 is conditional on DIAG-PY-PROCWITNESS (a failure
  only switches that slot off and keeps the contingent T3 question of the 2B, with no new question);
- qualification rows: DIAG-PY-RPC, -STAGE, -UNSCRIPTED, -ASYNC, -BARRIER, -BEFOREREPLY, -FAULTCUT, -LOGIN (requalified), the
  conditional DIAG-PY-PROCWITNESS (2B-1 row) and the new own-code DIAG-PY-C3VOCAB (D3-04/D3-05 vocabulary): 10 of 12 services;
- barrier plan: C3-PY02 step 7 (PROC_WITNESS after the adapter BEGIN), C3-PY13F (the 2B-PY13D plan: steps 10 and 16 release on
  (h_stop, return, 1) and (h_cleanup_cb, return, 2)), C3-PY13ER (the 2B-PY13E plan) and the DIAG rows;
- D3-05: the wait classes of the plan come from the wait_class field of each step (the 2B-2 table CLIENT_EFFECT_WAITS is gone);
- D3-06 source-freeze-r4-c32 and identity-freeze-r4-c32 before any service (the identity freeze re-checks the stdlib anchors
  asyncio/tasks.py and concurrent/futures/_base.py, packaging/version.py and the trees); the DIAG passes and the decision of the
  conditional slot go to diag-admission-c32.json.

Commands (host python3.12 -I -B):
  supervisor.py stage-trees         copy the admitted sdk-python and python-deps trees into the private runtime (manifest-checked)
  supervisor.py fixtures            write fixture-cases.json (14 slots + DIAG rows; canonical sorted keys; never the delivered source)
  supervisor.py plan                write case-plan.json (barrier plans, wait classes, epilogues, acceptance plan)
  supervisor.py init-ledgers        budget.json (12 services) and case-ledger.json (14 single-use slots)
  supervisor.py freeze              source-freeze-r4-c32.json (refuses to overwrite)
  supervisor.py freeze-identities   identity-freeze-r4-c32.json (before any service)
  supervisor.py diag-admission      diag-admission-c32.json (DIAG passes and conditional decision; after the DIAG)
  supervisor.py run CASE            one transient service (DIAG budget 12, or a single-use slot in slot order; never retried)

The supervisor never imports SDK, Pydantic or acquired code. Load average above 12 before a service: wait and record.
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
SPEC = UNIT / 'inputs' / 'spec-c3'
SPEC_2B = UNIT / 'inputs' / 'spec-2b'
SPEC_R4 = UNIT / 'inputs' / 'spec-r4'
RUNTIME = Path('/mnt/dados/cvg-work/cvg-codex100-c32-runtime-20261019')
STAGED_FROM = Path('/mnt/dados/cvg-work/cvg-codex100-batch2a-runtime-20261019')
ATTEMPTS = RUNTIME / 'attempts'
SDK_PY_TREE = RUNTIME / 'sdk-python'
PY_DEPS_TREE = RUNTIME / 'python-deps'
DIAG_DIR = UNIT / 'diagnostics'
CASES_DIR = UNIT / 'cases'
FREEZE = UNIT / 'source-freeze-r4-c32.json'
IDENTITY = UNIT / 'identity-freeze-r4-c32.json'
DIAG_ADMISSION = UNIT / 'diag-admission-c32.json'
ADMISSION_IDENTITY = ADMISSION / 'identity-freeze.json'
ADMISSION_IDENTITY_SHA = 'ebfb308f17e6a21ab77c91ab3863b737dd646ed6b1b6bbd835cba73e62225b1d'
CASES_JSON = SPEC / 'cases-c3-2.json'
CASES_SHA = '9881180dff444b9193965a9ae85af0b52bbd07a55e4386118b803b3237a06849'
SPEC_SHA = {'cases-c3-2.json': CASES_SHA,
            'freeze-r4-c3-delta.json': '71468dd2ee4df077c0165f0d861fdcaabcec50e210cab229560e35d35d6652d5',
            'evaluator-r4-c3-delta.json': 'fede1a1dc43a0a3a36faed67777f924797a2689dc4cf696912ec035d1cf32d79',
            'control-slot-contract-c3.json': '7649589b93ca46e50a3026e8c7700179a7b4dbc98e19a94a39eaed9245d51eaa',
            'execution-budget-c3-2.json': 'd875fefadd9822b563cb002c6ea30d33f7856e4822c7562ca98c20139b42312c',
            'coverage-plan-c3.json': 'ec4cf5c913c358f7167394d5895ee4df45e57d46a7a471f9358046428e299e1e',
            't3-assessment.json': 'f8daae2e9ac8ffebf353000956d5fcee51abf46abaee2df9439c9638ceba354b'}
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
PROPS = {'MemoryMax': '536870912', 'TasksMax': '32', 'CPUQuota': '100%', 'RuntimeMaxSec': '45', 'KillMode': 'control-group',
         'TimeoutStopSec': '3', 'NoNewPrivileges': 'yes', 'LimitNOFILE': '128', 'LimitFSIZE': '8388608', 'LimitCORE': '0'}
FIXED_ENV = {'HOME': '/work/home', 'TMPDIR': '/work/tmp', 'PATH': '/runtime', 'LANG': 'C.UTF-8', 'LC_ALL': 'C.UTF-8',
             'TZ': 'UTC', 'PYTHONDONTWRITEBYTECODE': '1', 'UV_THREADPOOL_SIZE': '2'}
LAUNCH = ['/runtime/python', '-I', '-S', '/profile/adapter-python.py']
UNIT_PREFIX = 'cvg-dx100-c32-'
LOAD_LIMIT = 12.0
CASE_ARTIFACTS = 2097152
SERVICE_OUTPUT_CAP = 65536
BUDGET = UNIT / 'budget.json'
CASE_LEDGER = UNIT / 'case-ledger.json'
NAMES = [r + '.' + k for r in ('driver', 'adapter', 'peer') for k in ('events', 'control')]
PY_SOURCES = ('channel.py', 'adapter-python.py', 'adapter-python-exec', 'fixture-rpc.py', 'python-driver.py', 'control-client.py',
              'bootstrap.py', 'harness2b.py', 'own2b.py', 'ownmodels.py')
ROLE_SOURCE = {'driver': 'python-driver.py', 'adapter': 'adapter-python.py', 'peer': 'fixture-rpc.py'}
CONTROL_CASE = 'C32-CTRL01'
_INPUTS = json.loads(CASES_JSON.read_bytes())['inputs']
STDLIB_ANCHORS = {name: (inp['path_host'], inp['sha256']) for name, inp in _INPUTS.items() if name.startswith('stdlib/')}
PYDEPS_ANCHOR = ('packaging/version.py', '635693b717b7b27db138c6b905d23ce7e01c1eec9b6da9ce56412fbd24510bc2')
# D2B-14 / D3-06: the Pydantic anchor files of the C3-2 cases (staged python-deps tree, relative path, sha of the cases inputs).
PYDEPS_ANCHORS = {name[len('pydeps/'):]: inp['sha256'] for name, inp in _INPUTS.items() if name.startswith('pydeps/')}


def spec_cases():
    raw = CASES_JSON.read_bytes()
    assert hashlib.sha256(raw).hexdigest() == CASES_SHA, 'cases-c3-2.json drifted from the approved spec'
    return {c['id']: c for c in json.loads(raw)['cases']}  # insertion order preserved (F4-01)


SPEC_CASES = spec_cases()
SDK_CASES = [c for c, d in sorted(SPEC_CASES.items(), key=lambda kv: kv[1]['slot']) if d['kind'] == 'SDK']
assert len(SDK_CASES) == 13 and SPEC_CASES[CONTROL_CASE]['kind'] == 'CONTROL' and len(SPEC_CASES) == 14
CONDITIONAL = {'C3-PY02': 'DIAG-PY-PROCWITNESS'}  # execution-budget-c3-2.json#/conditional_diags

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
    # CAP-2B-ASYNC-DRIVER: own async client (OwnAsync): double-checked init under asyncio.Lock, held to_thread request
    # cancelled before its reply, start through an own executor cancelled after its result (block_release_wait_cancel).
    'DIAG-PY-ASYNC': {'driver_mode': 'async', 'diag_calls': [
        {'step': 1, 'api': 'hook.install', 'hooks': [
            {'id': 'h_set_result', 'code': 'concurrent.futures._base.Future.set_result', 'event': 'return', 'record': ['thread_name']},
            {'id': 'h_sub_close', 'code': 'own2b.OwnSubscription.close', 'event': 'return', 'record': ['self.label', 'self._closed', 'thread_name']},
            {'id': 'h_req_ret', 'code': 'own2b.OwnClient.request', 'event': 'return', 'record': ['arg:method', 'thread_name']}]},
        {'step': 2, 'api': 'own.new', 'class': 'OwnAsync', 'kwargs': {'launch': '$LAUNCH', 'cwd': '/work'}, 'as': 'oa'},
        {'step': 3, 'api': 'task.create', 'name': 'T1', 'call': {'api': 'call', 'on': 'oa', 'method': 'call', 'args': ['own/a'], 'await': True}},
        {'step': 4, 'api': 'task.create', 'name': 'T2', 'call': {'api': 'call', 'on': 'oa', 'method': 'call', 'args': ['own/a'], 'await': True}},
        {'step': 5, 'api': 'loop.yield_until', 'probe': {'path': ['oa', '._init_lock', '._waiters'], 'fn': 'len', 'equals': 1}, 'max_yields': 10000},
        {'step': 6, 'api': 'barrier', 'id': 'init_held', 'witness': {'driver_probes': [
            {'api': 'probe', 'id': 'waiters_at_barrier', 'path': ['oa', '._init_lock', '._waiters'], 'fn': 'len'},
            {'api': 'probe', 'id': 'initialized_at_barrier', 'path': ['oa', '._initialized'], 'fn': 'value'}],
            'supervisor': 'peer REQUEST_HELD initialize'}, 'release': 'RELEASE_REPLY initialize, depois STEP_RELEASE'},
        {'step': 7, 'api': 'task.await', 'name': 'T1'},
        {'step': 8, 'api': 'task.await', 'name': 'T2'},
        {'step': 9, 'api': 'task.create', 'name': 'T3', 'call': {'api': 'call', 'on': 'oa', 'method': 'call', 'args': ['own/slow'], 'await': True}},
        {'step': 10, 'api': 'barrier', 'id': 'slow_held', 'witness': {'supervisor': 'peer REQUEST_HELD own/slow'}},
        {'step': 11, 'api': 'task.cancel', 'name': 'T3'},
        {'step': 12, 'api': 'task.await', 'name': 'T3'},
        {'step': 13, 'api': 'barrier', 'id': 'slow_release_after_cancel', 'witness': {'driver': 'API_CANCELLED do passo 12'},
         'release': 'RELEASE_REPLY own/slow; STEP_RELEASE depois do evento h_req_ret com method own/slow'},
        {'step': 14, 'api': 'task.create', 'name': 'T4', 'call': {'api': 'call', 'on': 'oa', 'method': 'start', 'args': ['L'], 'await': True}},
        {'step': 15, 'api': 'barrier', 'id': 'start_held', 'witness': {'supervisor': 'peer REQUEST_HELD own/start'}},
        {'step': 16, 'api': 'loop.block_release_wait_cancel', 'release': 'RELEASE_REPLY own/start (controle síncrono no thread do loop)',
         'wait_hook': {'id': 'h_set_result', 'thread_name_prefix': 'cvg-own-start'}, 'cancel': 'T4'},
        {'step': 17, 'api': 'task.await', 'name': 'T4'},
        {'step': 18, 'api': 'epilogue', 'kind': 'eof_calls_done_release_exit_then_sdk_aclose'}],
        'peer_script': _ps({'match': {'method': 'initialize'}, 'hold': 'until_RELEASE_REPLY', 'reply': {'result': _INIT}},
                           {'match': {'method': 'own/a', 'params_absent': True}, 'reply': {'result': {'a': 1}}},
                           {'match': {'method': 'own/a', 'params_absent': True}, 'reply': {'result': {'a': 1}}},
                           {'match': {'method': 'own/slow', 'params_absent': True}, 'hold': 'until_RELEASE_REPLY', 'reply': {'result': {'slow': True}}},
                           {'match': {'method': 'own/start', 'params': {'label': 'L'}}, 'hold': 'until_RELEASE_REPLY', 'reply': {'result': {'started': 'L'}}})},
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
    # CAP-2B-FAULT-CUT (D2B-06): own objects and threads; call-through/raise-before faults with removal, the raise_on_call fault of a
    # composed own goal stream (KeyboardInterrupt branch) and a fault fired in an own cleanup thread seen by the excepthook recorder.
    'DIAG-PY-FAULTCUT': {'diag_calls': [
        {'step': 1, 'api': 'excepthook.install'},
        {'step': 2, 'api': 'own.new', 'class': 'OwnClient', 'kwargs': {'launch': '$LAUNCH', 'cwd': '/work'}, 'as': 'oc'},
        {'step': 3, 'api': 'call', 'on': 'oc', 'method': 'start'},
        {'step': 4, 'api': 'call', 'on': 'oc', 'method': 'initialize'},
        {'step': 5, 'api': 'own.new', 'class': 'OwnFaulty', 'as': 'of'},
        {'step': 6, 'api': 'fault.install', 'on': 'of', 'attr': 'work', 'mode': 'call_through_then_raise',
         'exception': {'class': 'RuntimeError', 'message': 'own injected failure'}},
        {'step': 7, 'api': 'call', 'on': 'of', 'method': 'work', 'args': [1]},
        {'step': 8, 'api': 'fault.remove', 'on': 'of', 'attr': 'work'},
        {'step': 9, 'api': 'call', 'on': 'of', 'method': 'work', 'args': [2]},
        {'step': 10, 'api': 'fault.install', 'on': 'of', 'attr': 'work', 'mode': 'raise_before_call', 'exception': {'class': 'KeyboardInterrupt'}},
        {'step': 11, 'api': 'call', 'on': 'of', 'method': 'work', 'args': [3]},
        {'step': 12, 'api': 'fault.remove', 'on': 'of', 'attr': 'work'},
        {'step': 13, 'api': 'probe', 'id': 'work_calls', 'path': ['of', '._calls'], 'fn': 'value'},
        {'step': 14, 'api': 'own.new', 'class': 'OwnGoalSource', 'kwargs': {'items': ['n1', 'n2']}, 'as': 'gsrc'},
        {'step': 15, 'api': 'call', 'on': 'gsrc', 'method': 'state', 'args': ['g1'], 'as': 'st'},
        {'step': 16, 'api': 'GoalStream.new', 'kind': 'sync', 'state': 'st', 'client': 'gsrc',
         'fault': {'next_notification': {'raise_on_call': 2, 'exception': {'class': 'KeyboardInterrupt'}}}, 'as': 'gs'},
        {'step': 17, 'api': 'gstream.next', 'stream': 'gs'},
        {'step': 18, 'api': 'gstream.next', 'stream': 'gs'},
        {'step': 19, 'api': 'gstream.next', 'stream': 'gs'},
        {'step': 20, 'api': 'probe', 'id': 'source_log', 'path': ['gsrc', '._log'], 'fn': 'value'},
        {'step': 21, 'api': 'fault.install', 'on': 'of', 'attr': 'cleanup', 'mode': 'call_through_then_raise',
         'exception': {'class': 'RuntimeError', 'message': 'own cleanup failure'}},
        {'step': 22, 'api': 'call', 'on': 'of', 'method': 'cleanup_in_thread'},
        {'step': 23, 'api': 'thread.join', 'thread_name': 'cvg-own-cleanup', 'timeout_s': 3},
        {'step': 24, 'api': 'excepthook.wait', 'count': 1, 'timeout_s': 3},
        {'step': 25, 'api': 'excepthook.snapshot'},
        {'step': 26, 'api': 'fault.remove', 'on': 'of', 'attr': 'cleanup'},
        {'step': 27, 'api': 'probe', 'id': 'cleanups', 'path': ['of', '._cleanups'], 'fn': 'value'},
        {'step': 28, 'api': 'epilogue', 'kind': 'eof_calls_done_release_exit_then_sdk_close'}],
        'peer_script': _ps(_INIT_RULE)},
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
    # CAP-2B-PROC-WITNESS (2B-1 row, requalified; conditional for C3-PY02): adapter through the exec launcher, PROC_WITNESS barrier
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
    # DIAG-PY-C3VOCAB (D3-04, D3-05; own code, no SDK): own class with _write_message and next_login_notification for fault.install and
    # the hook; CLIENT_EFFECT wait that times out goes on; CLIENT_EFFECT_UNLESS_ALIVE with an own thread never started goes on and with
    # an own thread alive invalidates; a wait without the class that times out invalidates; a declared fault with zero calls and a named
    # thread never started keeps the sanity.
    'DIAG-PY-C3VOCAB': {'diag_calls': [
        {'step': 1, 'api': 'hook.install', 'hooks': [
            {'id': 'h_own_login', 'code': 'own2b.OwnC3Client.next_login_notification', 'event': 'call', 'record': ['arg:login_id', 'thread_name']},
            {'id': 'h_own_never', 'code': 'own2b.OwnC3Client.cleanup', 'event': 'call', 'record': ['thread_name']}]},
        {'step': 2, 'api': 'own.new', 'class': 'OwnClient', 'kwargs': {'launch': '$LAUNCH', 'cwd': '/work'}, 'as': 'oc'},
        {'step': 3, 'api': 'call', 'on': 'oc', 'method': 'start'},
        {'step': 4, 'api': 'call', 'on': 'oc', 'method': 'initialize'},
        {'step': 5, 'api': 'own.new', 'class': 'OwnC3Client', 'as': 'o3'},
        {'step': 6, 'api': 'fault.install', 'on': 'o3', 'attr': '_write_message', 'mode': 'raise_before_call',
         'exception': {'class': 'RuntimeError', 'message': 'own injected write failure'}},
        {'step': 7, 'api': 'call', 'on': 'o3', 'method': 'request', 'args': ['own/never']},
        {'step': 8, 'api': 'probe', 'id': 'waiters_after_fault', 'path': ['o3', '._waiters'], 'fn': 'keys'},
        {'step': 9, 'api': 'fault.remove', 'on': 'o3', 'attr': '_write_message'},
        {'step': 10, 'api': 'call', 'on': 'o3', 'method': 'request', 'args': ['own/after']},
        {'step': 11, 'api': 'fault.install', 'on': 'o3', 'attr': 'next_login_notification', 'mode': 'raise_before_call',
         'exception': {'class': 'RuntimeError', 'message': 'own injected login wait failure'}},
        {'step': 12, 'api': 'call', 'on': 'o3', 'method': 'wait_login', 'args': ['L-own-a']},
        {'step': 13, 'api': 'probe', 'id': 'registered_after_fault', 'path': ['o3', '._login_notifications'], 'fn': 'keys'},
        {'step': 14, 'api': 'fault.remove', 'on': 'o3', 'attr': 'next_login_notification'},
        {'step': 15, 'api': 'call', 'on': 'o3', 'method': 'wait_login', 'args': ['L-own-a']},
        {'step': 16, 'api': 'hook.count', 'id': 'h_own_login', 'event': 'call'},
        {'step': 17, 'api': 'fault.install', 'on': 'o3', 'attr': 'cleanup', 'mode': 'call_through_then_raise',
         'exception': {'class': 'RuntimeError', 'message': 'own cleanup never called'}},
        {'step': 18, 'api': 'probe.until', 'path': ['o3', '._flag'], 'equals': True, 'timeout_s': 0.3, 'wait_class': 'CLIENT_EFFECT'},
        {'step': 19, 'api': 'thread.join', 'thread_name': 'cvg-c3-never-started', 'timeout_s': 0.3, 'wait_class': 'CLIENT_EFFECT_UNLESS_ALIVE'},
        {'step': 20, 'api': 'call', 'on': 'o3', 'method': 'start_held_thread', 'args': ['cvg-c3-held']},
        {'step': 21, 'api': 'diag.expect_capture_failure', 'call': {'api': 'thread.join', 'thread_name': 'cvg-c3-held', 'timeout_s': 0.3,
                                                                   'wait_class': 'CLIENT_EFFECT_UNLESS_ALIVE'}},
        {'step': 22, 'api': 'diag.expect_capture_failure', 'call': {'api': 'hook.wait', 'id': 'h_own_never', 'timeout_s': 0.3}},
        {'step': 23, 'api': 'call', 'on': 'o3', 'method': 'release_held_thread'},
        {'step': 24, 'api': 'thread.join', 'thread_name': 'cvg-c3-held', 'timeout_s': 3, 'wait_class': 'CLIENT_EFFECT_UNLESS_ALIVE'},
        {'step': 25, 'api': 'fault.remove', 'on': 'o3', 'attr': 'cleanup'},
        {'step': 26, 'api': 'epilogue', 'kind': 'eof_calls_done_release_exit_then_sdk_close'}],
        'peer_script': _ps(_INIT_RULE),
        'expected': {'fault': {'fired': [{'attr': '_write_message', 'count': 1}, {'attr': 'next_login_notification', 'count': 1},
                                         {'attr': 'cleanup', 'count': 1, 'zero_calls_client_effect_unless_started': 'cvg-c3-never-started'}]}}},
}
DIAG = {
    'DIAG-PY-RPC': {'expect': 'PASS'}, 'DIAG-PY-STAGE': {'expect': 'PASS'}, 'DIAG-PY-UNSCRIPTED': {'expect': 'PASS'},
    'DIAG-PY-ASYNC': {'expect': 'PASS'}, 'DIAG-PY-BARRIER': {'expect': 'PASS'}, 'DIAG-PY-BEFOREREPLY': {'expect': 'PASS'},
    'DIAG-PY-FAULTCUT': {'expect': 'PASS'}, 'DIAG-PY-LOGIN': {'expect': 'PASS'}, 'DIAG-PY-PROCWITNESS': {'expect': 'PASS'},
    'DIAG-PY-C3VOCAB': {'expect': 'PASS'},
}
# execution-budget-c3-2.json#/planned/qualification_services (10 of 12 services, 2 in reserve), in that order.
ADMISSION_DIAGS = ['DIAG-PY-RPC', 'DIAG-PY-STAGE', 'DIAG-PY-UNSCRIPTED', 'DIAG-PY-ASYNC', 'DIAG-PY-BARRIER', 'DIAG-PY-BEFOREREPLY',
                   'DIAG-PY-FAULTCUT', 'DIAG-PY-LOGIN', 'DIAG-PY-PROCWITNESS', 'DIAG-PY-C3VOCAB']
# A failure of a conditional DIAG only switches off the slots it decides; every other DIAG is a stop condition.
CONDITIONAL_DIAGS = {'DIAG-PY-PROCWITNESS': ['C3-PY02']}
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
    'C3-PY02': {7: {'gate': [('proc_witness',)], 'actions': [('STEP_RELEASE', [])]}},
    # C3-PY13F replays 2B-PY13D (same barrier steps): STEP_RELEASE after the declared (id, event, occurrence) (2B-1 R1-F01, approved).
    'C3-PY13F': {6: {'gate': [('held', 'thread/goal/set', {'threadId': 't13d1', 'status': 'active'})], 'actions': [('STEP_RELEASE', [])]},
                 10: {'gate': [('driver_cancelled', 8)], 'actions': [('RELEASE_REPLY', []), ('STEP_RELEASE', [('hook', 'h_stop', 'return', 1, {})])]},
                 13: {'gate': [('held', 'thread/goal/set', {'threadId': 't13d2', 'status': 'active'})], 'actions': [('STEP_RELEASE', [])]},
                 16: {'gate': [('driver_cancelled', 15)], 'actions': [('RELEASE_REPLY', []),
                                                                     ('STEP_RELEASE', [('hook', 'h_cleanup_cb', 'return', 2, {})])]}},
    # C3-PY13ER replays 2B-PY13E (same barrier steps; only the wait classes of steps 11-13 change, D3-05).
    'C3-PY13ER': {8: {'gate': [('held', 'thread/goal/set', {'threadId': 't13e', 'status': 'active'})], 'actions': [('STEP_RELEASE', [])]},
                 9: {'gate': [], 'actions': [('RELEASE_REPLY', []), ('STEP_RELEASE', [])]}},
    'DIAG-PY-ASYNC': {6: {'gate': [('held', 'initialize', {})], 'actions': [('RELEASE_REPLY', []), ('STEP_RELEASE', [])]},
                      10: {'gate': [('held', 'own/slow', {})], 'actions': [('STEP_RELEASE', [])]},
                      13: {'gate': [('driver_cancelled', 12)], 'actions': [('RELEASE_REPLY', []),
                                                                          ('STEP_RELEASE', [('hook', 'h_req_ret', 'return', None, {'arg:method': 'own/slow'})])]},
                      15: {'gate': [('held', 'own/start', {})], 'actions': [('STEP_RELEASE', [])]},
                      16: {'gate': [], 'actions': [('RELEASE_REPLY', []), ('STEP_RELEASE', [])]}},
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
        if sorted(steps) != sorted(BARRIER_PLAN.get(case, {})):
            problems.append([case, sorted(steps), sorted(BARRIER_PLAN.get(case, {}))])
    return problems


def _load(name, mod):
    spec = importlib.util.spec_from_file_location(mod, HERE / name)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


OBS = _load('observer.py', 'cvg_observer_c32')
ACC = _load('acceptance.py', 'cvg_acceptance_c32')


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
    assert len(rows) == 14
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


WAIT_APIS = ('worker.parked', 'worker.join', 'worker.still_parked', 'thread.join', 'probe.until', 'loop.yield_until', 'excepthook.wait',
             'hook.wait', 'loop.block_release_wait_cancel')


def wait_classes(case):
    """D3-05: class of every wait of the slot, from its wait_class field (HARNESS_PRECONDITION without it, E2B-14)."""
    return {str(s['step']): {'api': s['api'], 'class': s.get('wait_class', 'HARNESS_PRECONDITION'), 'thread_name': s.get('thread_name')}
            for s in steps_of(case) if s['api'] in WAIT_APIS}


def case_plan(case):
    kind = 'control' if case == CONTROL_CASE else ('diag' if case in DIAG else 'sdk')
    barriers = ['READY to each role after BEGIN identity + cgroup/PID witness']
    if case in HOLD_PY:
        barriers += ['ABORT_NOW->driver after peer REQUEST_HELD and the held line fully committed by the adapter',
                     'RELEASE_REPLY->peer after driver API_CANCELLED', 'FINISH_PEER->peer after driver LATE_REPLY_OBSERVED and peer STDIN_EOF']
    else:
        for step, entry in sorted(BARRIER_PLAN.get(case, {}).items()):
            barriers.append('step %d: gate %s -> actions %s' % (step, entry['gate'], entry['actions']))
        barriers.append('FINISH_PEER->peer after driver CALLS_DONE%s, unless the peer already ended (exit frame or forwarded signal)'
                        % (' + CLIENT_STDIN_CLOSED + peer STDIN_EOF (EOF-bounded interval)' if eof_case(case) else ''))
    barriers.append('RELEASE_EXIT->driver after driver CALLS_DONE and adapter and peer exits witnessed by the OS (dead, zombie or absent)')
    barriers.append('driver /proc maps sampled right before RELEASE_EXIT->driver (loaded-code identity)')
    driver = {'control': 'control-client.py (own constant client, no SDK)', 'diag': 'python-driver.py own code (no SDK)',
              'sdk': 'python-driver.py Interp (frozen sdk_calls)'}[kind]
    return {'language': 'python', 'kind': kind, 'driver': driver, 'peer': 'fixture-rpc ScriptV2 (peer v2, D2B-09) or v1 constant rows',
            'barriers': barriers, 'barrier_plan': {str(k): v for k, v in sorted(BARRIER_PLAN.get(case, {}).items())},
            'wait_classes_r2_f04': wait_classes(case), 'epilogue': epilogue_of(case), 'eof_bounded': eof_case(case),
            'acceptance_predicates': ACC.plan(case) if case in SPEC_CASES else 'diag_checks + observer.reconcile'}


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
                                       'python-driver.py', 'supervisor.py')]
              + ['case-plan.json', 'fixture-cases.json']
              + ['inputs/spec-c3/' + n for n in sorted(SPEC_SHA)] + ['inputs/spec-2b/' + n for n in sorted(SPEC_2B_SHA)]
              + ['inputs/spec-r4/' + n for n in sorted(SPEC_R4_SHA)]
              + ['selftests/selftest_c32.py', 'selftests/selftest-results.json', 'tools/validate_unit.py', 'validation-unit.json'])


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
    got = {'spec-c3': {n: sha_path(SPEC / n) for n in SPEC_SHA}, 'spec-2b': {n: sha_path(SPEC_2B / n) for n in SPEC_2B_SHA},
           'spec-r4': {n: sha_path(SPEC_R4 / n) for n in SPEC_R4_SHA}}
    assert got == {'spec-c3': SPEC_SHA, 'spec-2b': SPEC_2B_SHA, 'spec-r4': SPEC_R4_SHA}, 'approved spec inputs drifted'
    return got


def admitted_trees():
    assert sha_path(ADMISSION_IDENTITY) == ADMISSION_IDENTITY_SHA, 'admission identity freeze drift'
    return json.loads(ADMISSION_IDENTITY.read_text())['trees']


def stdlib_anchors():
    got = {name: [path, sha_path(path)] for name, (path, _) in STDLIB_ANCHORS.items()}
    bad = [n for n, (p, d) in STDLIB_ANCHORS.items() if got[n][1] != d]
    assert not bad, 'stdlib anchor drift (D2B-14): %s' % bad
    return got


def pydeps_anchors():
    """D2B-14: the Pydantic anchor files of the cases, re-checked in the staged python-deps tree."""
    got = {rel: sha_path(PY_DEPS_TREE / rel) for rel in PYDEPS_ANCHORS}
    bad = [rel for rel, d in PYDEPS_ANCHORS.items() if got[rel] != d]
    assert not bad, 'python-deps anchor drift (D2B-14): %s' % bad
    got[PYDEPS_ANCHOR[0]] = sha_path(PY_DEPS_TREE / PYDEPS_ANCHOR[0])
    assert got[PYDEPS_ANCHOR[0]] == PYDEPS_ANCHOR[1], 'packaging/version.py anchor'
    return got


def check_identity_freeze():
    assert IDENTITY.exists(), 'BLOCKED: no identity freeze r4-c32'
    raw = IDENTITY.read_bytes()
    ident = json.loads(raw)
    assert ident['status'] == 'FROZEN_BEFORE_SERVICES', 'identity freeze status'
    assert ident['source_freeze']['sha256'] == sha_bytes(FREEZE.read_bytes()), 'identity freeze binds another source freeze'
    assert tree_manifest(SDK_PY_TREE) == ident['trees']['sdk-python'], 'sdk-python tree drift'
    assert tree_manifest(PY_DEPS_TREE) == ident['trees']['python-deps'], 'python-deps tree drift'
    assert spec_hashes() == ident['spec_inputs'], 'spec inputs binding'
    assert stdlib_anchors() == ident['stdlib_anchors'], 'stdlib anchors binding'
    assert pydeps_anchors() == ident['pydeps_anchors'], 'python-deps anchors binding'
    assert case_input_anchors() == ident['case_input_anchors'], 'case input anchors binding (D3-06)'
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


# ------------------------------------------------------------------------------------------------ attempt

class Attempt:
    def __init__(self, case):
        if case in DIAG:
            self.kind, self.expect_verdict = 'diag', DIAG[case]['expect']
        elif case in SDK_CASES:
            self.kind, self.expect_verdict = 'sdk', None
        elif case == CONTROL_CASE:
            self.kind, self.expect_verdict = 'control', 'PASS'
        else:
            raise ValueError('unknown case %r' % case)
        self.case = case
        self.deadline = 30 if self.kind != 'diag' else 25
        self.attempt = secrets.token_hex(20)
        self.nonce = secrets.token_hex(20)
        self.unit = '%s%s-%s.service' % (UNIT_PREFIX, self.attempt[:12], case.lower())
        self.dir = ATTEMPTS / (self.attempt[:12] + '-' + case)
        self.evidence = DIAG_DIR / (self.attempt[:12] + '-' + case) if self.kind == 'diag' else CASES_DIR / (case + '-' + self.attempt[:12])
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
        self.freeze = check_source_freeze()
        spec_hashes()
        self.identity = check_identity_freeze()
        ATTEMPTS.mkdir(mode=0o700, exist_ok=True)
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
        case_input = delivered_input(self.case)
        self.case_input_sha256 = sha_bytes(compact(case_input).encode('utf-8'))  # F4-01 supervisor witness, before READY
        if self.case in SPEC_CASES:
            assert self.case_input_sha256 == SPEC_CASES[self.case]['case_input_sha256'], 'delivered case_input differs from the frozen bytes'
        self.config = {'attempt': self.attempt, 'case': self.case, 'nonce': self.nonce, 'language': 'python',
                       'deadline_seconds': self.deadline, 'fifo_root': '/observer', 'fifo_nodes': list(NAMES),
                       'fifo_stat': self.fifo_stat, 'peer_argv': role_argv('peer', self.case), 'case_input': case_input,
                       'mode': {'diag': 'diagnostic', 'sdk': 'sdk', 'control': 'control'}[self.kind]}
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
        return [('/runtime/python', HOST['python'][0]), ('/usr/lib64/ld-linux-x86-64.so.2', '/usr/lib/x86_64-linux-gnu/ld-linux-x86-64.so.2'),
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
        return vals, vals['memory.max'] == '536870912' and vals['pids.max'] == '32' and len(q) == 2 and q[0] == q[1]

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
            finished = d.milestones('CALLS_DONE')
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
                                        'source_freeze': self.freeze, 'identity_freeze': self.identity, 'load_wait': getattr(self, 'load_wait', None),
                                        'env_keys': sorted(env), 'service_properties': PROPS, 'fifo_stat': self.fifo_stat,
                                        'pipe_buf': self.pipe_buf, 'runtime_dir': str(self.dir), 't0_monotonic_ns': str(self.t0)})
        (ev / 'profile').mkdir()
        for name in ('adapter-config.json', 'admission.json'):
            shutil.copyfile(self.dir / 'profile' / name, ev / 'profile' / name)
        save_json(ev / 'profile-manifest.json', {'files': self.files, 'admission_sha256': sha_path(self.dir / 'profile' / 'admission.json'),
                                                 'admission': {k: v for k, v in self.admission.items() if k != 'files'},
                                                 'config_sha256': self.files['/profile/adapter-config.json'],
                                                 'case_plan': case_plan(self.case), 'deadline_seconds': self.deadline})

    def take_budget(self):
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
            'unit_collected': after.get('LoadState') == 'not-found',
            'fifo_eof_all': all(eof.values()),
            'supervisor_bound_not_hit': not timed_out,
            'driver_exit_zero': rc == 0,
            'case_artifact_budget': not self.budget_hit and self.case_bytes() <= CASE_ARTIFACTS,
            'service_output_within_cap': all(v <= SERVICE_OUTPUT_CAP for v in self.service_bytes.values()),
        }
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
                   'timed_out': timed_out, 'plan': {str(k): v for k, v in self.plan.items()}}
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
                  'identity_freeze': self.identity, 'elapsed_ns': time.monotonic_ns() - self.t0, 'functional_receipts': 0, 'observed_at': now_iso()}
        if self.kind == 'diag':
            diag_checks = ACC.diag_checks(self.case, self.logs, verdict, witness, self.config['case_input'], self.case_input_sha256)
            # info_* keys are recorded constants (never pass criteria of the DIAG); gate_* keys are kept from the 2B-1 form.
            status = 'DIAG_PASS' if verdict == self.expect_verdict and all(v for k, v in diag_checks.items()
                                                                           if not k.startswith('gate_') and not k.startswith('info_')) else 'DIAG_FAIL'
            result.update({'expected_verdict': self.expect_verdict, 'status': status, 'diag_checks': diag_checks, 'SDK_imports': 0})
            save_json(ev / 'result.json', result)
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


def freeze_identities():
    src = check_source_freeze()
    trees = admitted_trees()
    assert tree_manifest(SDK_PY_TREE) == trees['sdk-python'] and tree_manifest(PY_DEPS_TREE) == trees['python-deps'], 'staged trees drift'
    anchors = pydeps_anchors()
    static = json.loads((ADMISSION / 'static-admission.json').read_text())
    assert static['status'] == 'PASS', 'static admission not PASS'
    ident = {'kind': 'IDENTITY_FREEZE_R4_C32', 'status': 'FROZEN_BEFORE_SERVICES', 'task': 'DX100-G02:IMPLEMENT-AND-ADMIT-SDK-SOURCE-CONTINUATION-3-2',
             'source_freeze': src, 'trees': {'sdk-python': trees['sdk-python'], 'python-deps': trees['python-deps']},
             'admission_identity_freeze': {'path': 'g02/sdk-admission/identity-freeze.json', 'sha256': ADMISSION_IDENTITY_SHA},
             'static_admission': {'path': 'g02/sdk-admission/static-admission.json', 'sha256': sha_path(ADMISSION / 'static-admission.json')},
             'stdlib_anchors': stdlib_anchors(), 'pydeps_anchors': anchors,
             'dependency_identity': {'pydantic': '2.13.4', 'pydantic_core': '2.46.4'},
             'host': {k: list(v) for k, v in HOST.items()}, 'service_properties': PROPS, 'sandbox_env': FIXED_ENV,
             'argv': {role: role_argv(role, 'CASE_ID') for role in ('driver', 'adapter', 'peer')}, 'control_argv': role_argv('driver', CONTROL_CASE),
             'spec_inputs': spec_hashes(), 'frozen_at': now_iso(),
             'case_input_anchors': case_input_anchors(),
             'note': ('Antes de qualquer serviço (D3-06): reconfere as âncoras da stdlib, da Pydantic e do packaging dos casos do C3-2 e as '
                      'entradas do caso (fontes .py do pin e fixture-rpc.py do 2B-2); os DIAG ficam em diag-admission-c32.json. Nenhuma '
                      'capacidade nova (Q4 negada pelo usuário).')}
    save_new_json(IDENTITY, ident)
    return ident


def case_input_anchors():
    """cases-c3-2.json#/inputs with a path relative to the spec folder (../ is g02/): the .py sources of the pin and the peer v2 of
    the 2B-2, re-checked by sha; the unit copy of fixture-rpc.py is byte-equal to the anchor."""
    got = {}
    for name, inp in _INPUTS.items():
        if 'path' in inp:
            assert inp['path'].startswith('../'), 'input path relative to the spec folder'
            got[name] = sha_path(G02 / inp['path'][3:])
            assert got[name] == inp['sha256'], 'case input anchor drift: %s' % name
    assert sha_path(HERE / 'fixture-rpc.py') == _INPUTS['adm2b2/python/fixture-rpc.py']['sha256'], 'peer v2 anchor (fixture-rpc.py)'
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
                        'rule': 'execution-budget-c3-2.json#/conditional_diags: a falha de %s desliga só %s' % (need, slot)}
                 for slot, need in CONDITIONAL.items()}
    t3 = None
    if decisions['C3-PY02']['decision'] == 'NOT_USED':
        t3 = {'status': 'CONTINGENT_QUESTION_ACTIVE', 'source': 'inputs/spec-2b/t3-assessment.json', 'new_question': False}
    doc = {'kind': 'DIAG_ADMISSION_C32', 'task': 'DX100-G02:IMPLEMENT-AND-ADMIT-SDK-SOURCE-CONTINUATION-3-2', 'source_freeze': src, 'identity_freeze': idf,
           'admission_diagnostics': diag, 'conditional_diags_without_pass': missing, 'conditional_slots': decisions, 't3_contingent': t3,
           'recorded_at': now_iso()}
    save_new_json(DIAG_ADMISSION, doc)
    return doc


def init_ledgers():
    save_new_json(BUDGET, {'kind': 'SERVICE_BUDGET', 'services_max': 12, 'services_used': 0, 'planned': ADMISSION_DIAGS,
                           'rule': 'qualification services only (2 in reserve, admission diagnostics only); never a case repetition; no automatic retry',
                           'history': [], 'updated_at': now_iso()})
    slots = {c: {'status': 'UNUSED'} for c in [CONTROL_CASE] + SDK_CASES}
    assert len(slots) == 14
    save_new_json(CASE_LEDGER, {'kind': 'SINGLE_USE_CASE_SLOTS', 'slots_max': 14, 'used': 0, 'slots': slots,
                                'rule': 'one service per slot, once, serial, no retry; C32-CTRL01 first (gate: MISMATCH by rule 6 only from '
                                        'wire.no_turn_interrupt, sanities approved, peer.login_frames_synthetic included); then the SDK slots in slot '
                                        'order; C3-PY02 only with the RUN decision of DIAG-PY-PROCWITNESS, otherwise left unused and never reassigned',
                                'updated_at': now_iso()})


def slot_gate(case):
    """Serial slot order (a slot left unused by its conditional decision counts as passed) and the conditional decision."""
    ledger = json.loads(CASE_LEDGER.read_text())
    adm = json.loads(DIAG_ADMISSION.read_text())
    unused = {s for s, d in adm['conditional_slots'].items() if d['decision'] != 'RUN'}
    assert case not in unused, 'BLOCKED: conditional slot %s not released by its DIAG (left unused, never reassigned)' % case
    before = SDK_CASES[:SDK_CASES.index(case)]
    pending = [c for c in before if c not in unused and ledger['slots'][c]['status'] != 'EXECUTED']
    assert not pending, 'BLOCKED: slots before %s not executed yet: %s' % (case, pending)


def control_gate():
    """Carry-over R1-F06 of the continuation: rule 6 and failed predicates exactly [wire.no_turn_interrupt], sanities approved."""
    ledger = json.loads(CASE_LEDGER.read_text())
    assert ledger['slots'][CONTROL_CASE]['status'] == 'EXECUTED', 'BLOCKED: the CONTROL gate %s must run first' % CONTROL_CASE
    acc = json.loads(next(CASES_DIR.glob(CONTROL_CASE + '-*/acceptance.json')).read_text())
    ok = acc['outcome'] == 'MISMATCH' and acc['composition_rule'] == 6 and acc['failed_predicates'] == ['wire.no_turn_interrupt']
    assert ok, 'BLOCKED: CONTROL gate not met (%s, rule %s, %s)' % (acc['outcome'], acc['composition_rule'], acc['failed_predicates'])


def main(argv):
    if argv[:1] == ['stage-trees']:
        print(json.dumps(stage_trees()))
        return 0
    if argv[:1] == ['fixtures']:
        b = fixture_bytes()
        (UNIT / 'fixture-cases.json').write_bytes(b)
        print(json.dumps({'fixture_cases_sha256': sha_bytes(b), 'rows': len(json.loads(b))}))
        return 0
    if argv[:1] == ['plan']:
        problems = plan_check()
        assert not problems, 'barrier plan does not cover the barrier steps: %s' % problems
        plan = {c: case_plan(c) for c in [CONTROL_CASE] + SDK_CASES + ADMISSION_DIAGS}
        save_json(UNIT / 'case-plan.json', {'kind': 'CASE_PLAN_FROM_SUPERVISOR_TABLES', 'cases': plan, 'diagnostics': DIAG,
                                            'admission_diagnostics': ADMISSION_DIAGS, 'conditional_diags': CONDITIONAL_DIAGS,
                                            'conditional_slots': CONDITIONAL})
        print(len(plan))
        return 0
    if argv[:1] == ['init-ledgers']:
        init_ledgers()
        print('ledgers written')
        return 0
    if argv[:1] == ['freeze']:
        files = source_freeze_files()
        save_new_json(FREEZE, {'kind': 'SOURCE_FREEZE', 'task': 'DX100-G02:IMPLEMENT-AND-ADMIT-SDK-SOURCE-CONTINUATION-3-2', 'files': files,
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
    if len(argv) == 2 and argv[0] == 'run':
        case = argv[1]
        if case in SDK_CASES:
            assert DIAG_ADMISSION.exists(), 'BLOCKED: no diag-admission-c32.json'
            control_gate()
            slot_gate(case)
        if case == CONTROL_CASE:
            assert DIAG_ADMISSION.exists(), 'BLOCKED: the DIAG admission must precede the CONTROL'
            assert json.loads(CASE_LEDGER.read_text())['used'] == 0, 'BLOCKED: the CONTROL runs before every other slot'
        result = Attempt(case).run()
        keys = ('case', 'unit', 'kind', 'verdict', 'outcome', 'status', 'reasons', 'diag_checks', 'os_checks', 'role_status', 'elapsed_ns')
        print(json.dumps({k: result.get(k) for k in keys}, indent=1))
        return 0 if result['status'] in ('DIAG_PASS', 'EXECUTED_ONCE') else 1
    print(__doc__)
    return 2


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
