"""Unit validator of DX100-G02:IMPLEMENT-AND-ADMIT-SDK-DISTRIBUTED-PROFILE-DP-2 (offline, read-only over the frozen spec copies).

Run: python3 -I -B tools/validate_unit.py   -> writes validation-unit.json (exit 0 only when every check passes and every negative
control is refused with its exact message).

Rules over cases-dp-2.json and the DIAG rows of the supervisor, each with a negative control judged by the exact message:
- F4-01: case_input_sha256 is the sha256 of the compact case_input bytes;
- DDP-12 (erratum DP-SPEC/R2-F01 (6)): every service case declares its topology and it matches the steps (driver_only: no barrier, no
  peer_script, epilogue calls_done_release_exit_then_sdk_close_if_open; adapter_peer: peer_script or own DIAG-PY topology);
- DP-SPEC/R2-F03: a case judged on the real binary (form REAL_CLI_KEYLESS) declares no expected.process.spawns nor process.argv
  (adapter predicates) and no adapter predicate: message "adapter predicate or process.spawns/argv on the real binary: <case>";
- DDP-05: realcli.witness only after a proc.retain of the same alias and before the initialize call;
- DDP-06: runtime.path and driver_runtime only under /dist/py/site or /fixture/;
- DDP-11: every fixture entry under its root; copy_of_member names a member of artifact-metadata.json; copy_of_profile only from the
  closed profile sources;
- C32-ADM/R1-F03: wait_class only on the D3-05 list;
- every step api of every case and DIAG row is in the vocabulary of python-driver.py;
- the barrier plan covers exactly the barrier steps; the service properties equal the inherited table except the DDP-05 limits.
"""
import copy
import hashlib
import importlib.util
import json
import re
import sys
from pathlib import Path

sys.dont_write_bytecode = True
UNIT = Path(__file__).resolve().parent.parent


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


ACC = load('val_acceptance_dp2', UNIT / 'python' / 'acceptance.py')
SUP = load('val_supervisor_dp2', UNIT / 'python' / 'supervisor.py')
STG = load('val_stage_dp2', UNIT / 'python' / 'stage_dp.py')
DRV_SRC = (UNIT / 'python' / 'python-driver.py').read_text()
DRIVER_APIS = set(re.findall(r"api == '([^']+)'", DRV_SRC)) | {'dp.readback', 'dp.write_probe', 'dp.import_probe', 'dp.fs_snapshot',
                                                                 'dp.realcli_start', 'dp.realcli_initialize', 'dp.realcli_stop'}
NEW_SUFFIX = '.new'
ADAPTER_PREDICATES = ('proc.argv_exact', 'proc.env_path_exact', 'proc.witness_recorded', 'proc.spawn_count_exact', 'wire.initialize_handshake')
D305 = ('thread.join', 'hook.wait', 'excepthook.wait', 'worker.join', 'probe.until')


def compact(x):
    return json.dumps(x, ensure_ascii=False, separators=(',', ':'))


def steps_of(row):
    return row.get('sdk_calls') or row.get('diag_calls') or []


def problems_of(case, row, c=None):
    """Problems of one case (row = case_input or DIAG row; c = the spec case object or None for a DIAG row)."""
    out = []
    st = steps_of(row)
    topo = SUP.topology(case)
    if c is not None and c['kind'] != 'ARTIFACT_CHECK':
        if hashlib.sha256(compact(c['case_input']).encode('utf-8')).hexdigest() != c['case_input_sha256']:
            out.append('case_input bytes differ from case_input_sha256: %s' % case)
    if c is None or c['kind'] != 'ARTIFACT_CHECK':
        if topo == 'driver_only':
            if any(s['api'] == 'barrier' for s in st):
                out.append('topology driver_only with a barrier step: %s' % case)
            if 'peer_script' in row:
                out.append('topology driver_only with a peer_script: %s' % case)
            if st and st[-1].get('kind') != 'calls_done_release_exit_then_sdk_close_if_open':
                out.append('topology driver_only with another epilogue: %s' % case)
        elif 'peer_script' not in row and not case.startswith('DIAG-PY-') and 'control_client' not in row:
            out.append('topology adapter_peer without a peer_script: %s' % case)
    if c is not None and 'REAL_CLI_KEYLESS' in c['accepted_capture_forms']:
        proc = c['expected'].get('process', {})
        if 'spawns' in proc or 'argv' in proc or any(p in ADAPTER_PREDICATES for p in c['predicates']):
            out.append('adapter predicate or process.spawns/argv on the real binary: %s' % case)
        if topo != 'driver_only':
            out.append('real binary outside driver_only: %s' % case)
    retained = {}
    initialized = False
    for s in st:
        api = s['api']
        if api == 'proc.retain' or api == 'dp.realcli_start':
            retained[s['as']] = s['step']
        if api == 'call' and s.get('method') == 'initialize' or api == 'dp.realcli_initialize':
            initialized = True
        if api == 'realcli.witness' and not s.get('negative'):
            if s.get('pid_from') not in retained:
                out.append('realcli.witness before the proc.retain of its alias: %s step %s' % (case, s['step']))
            if initialized:
                out.append('realcli.witness after the initialize: %s step %s' % (case, s['step']))
        if api == 'runtime.path' and not any(s['insert'].startswith(r) for r in ('/dist/py/site', '/fixture/')):
            out.append('runtime.path outside /dist/py/site and /fixture: %s step %s' % (case, s['step']))
        if 'wait_class' in s and api not in D305:
            out.append('wait_class outside the D3-05 list: %s step %s' % (case, s['step']))
        known = api in DRIVER_APIS or api.endswith(NEW_SUFFIX) or api in ('artifact.check',)
        if not known:
            out.append('step api outside the driver vocabulary: %s %s' % (case, api))
    rt = (row.get('driver_runtime') or {}).get('sys_path_runtime')
    if rt is not None and not any(rt.startswith(r) for r in ('/dist/py/site', '/fixture/')):
        out.append('driver_runtime outside /dist/py/site and /fixture: %s' % case)
    for t in row.get('trees') or []:
        for e in t['entries']:
            if not e['path'].startswith(t['root'] + '/'):
                out.append('fixture entry outside its root: %s %s' % (case, e['path']))
            if e['kind'] == 'copy_of_member':
                aid, name = STG.member_ref(e['member'])
                if name not in STG.MEMBERS.get(aid, {}):
                    out.append('copy_of_member outside artifact-metadata.json: %s %s' % (case, e['member']))
            if e['kind'] == 'copy_of_profile' and e['from'] not in STG.PROFILE_SOURCES:
                out.append('copy_of_profile outside the closed profile sources: %s %s' % (case, e['from']))
    return out


def run():
    results = {}
    cases = SUP.SPEC_CASES
    for cid, c in cases.items():
        results[cid] = problems_of(cid, c['case_input'], c)
    for d, row in SUP.DIAG_ROWS.items():
        results[d] = problems_of(d, row)
    results['barrier_plan_coverage'] = SUP.plan_check()
    results['service_properties'] = [c for c in [SUP.CONTROL_CASE] + SUP.SDK_CASES + SUP.ADMISSION_DIAGS if not SUP.props_ok(c, SUP.props_of(c))]
    a20 = cases['DP-PY20A']['case_input']['sdk_calls']
    p20 = []
    for s in a20:
        if 'member' in s and STG.member_ref(s['member'])[1] not in STG.MEMBERS[STG.member_ref(s['member'])[0]]:
            p20.append('artifact.check member outside the metadata: %s' % s['member'])
        if 'ledger_item' in s and s['ledger_item'] not in STG.ARCHIVES:
            p20.append('artifact.check ledger item outside the ledger: %s' % s['ledger_item'])
        if 'cache_metadata' in s and s['cache_metadata'] != 'M7:release-rust-v0.153.4.json':
            p20.append('artifact.check cache metadata outside M7: %s' % s['cache_metadata'])
    results['DP-PY20A_artifact_steps'] = p20
    ok = all(not v for v in results.values())
    # negative controls: (name, mutated case id, mutator over a deep copy of the case object, exact expected message)
    neg_specs = [
        ('real binary with spawns 1 and the complete process.argv (DP-SPEC/R2-F03)', 'DP-PY02P',
         lambda c: c['expected']['process'].update(spawns=1, argv={'popen_args': c['expected']['process']['popen_args'],
                                                                    'proc_cmdline': c['expected']['process']['proc_cmdline'], 'self_report_argv_tail': []}),
         'adapter predicate or process.spawns/argv on the real binary: DP-PY02P'),
        ('driver_only case with a peer_script (DDP-12)', 'DP-PY19A', lambda c: c['case_input'].update(peer_script={'version': 2}),
         'topology driver_only with a peer_script: DP-PY19A'),
        ('adapter_peer case without a peer_script (DDP-12)', 'DP-PY19C', lambda c: c['case_input'].pop('peer_script'),
         'topology adapter_peer without a peer_script: DP-PY19C'),
        ('realcli.witness before the proc.retain (DDP-05)', 'DP-PY02P', lambda c: c['case_input']['sdk_calls'].insert(2, dict(c['case_input']['sdk_calls'][5], step=99)),
         'realcli.witness before the proc.retain of its alias: DP-PY02P step 99'),
        ('runtime.path outside the runtime roots (DDP-06)', 'DP-PY19B', lambda c: c['case_input']['sdk_calls'][0].update(insert='/work/site'),
         'runtime.path outside /dist/py/site and /fixture: DP-PY19B step 1'),
        ('copy_of_member outside the metadata (DDP-11)', 'DP-PY19C', lambda c: c['case_input']['trees'][0]['entries'][0].update(member='A1:codex_cli_bin/missing.py'),
         'copy_of_member outside artifact-metadata.json: DP-PY19C A1:codex_cli_bin/missing.py'),
        ('wait_class on worker.parked (C32-ADM/R1-F03)', 'DP-PY19A', lambda c: c['case_input']['sdk_calls'].insert(0, {'step': 98, 'api': 'worker.parked',
                                                                                                                   'names': ['W'], 'wait_class': 'CLIENT_EFFECT'}),
         'wait_class outside the D3-05 list: DP-PY19A step 98'),
        ('step api outside the driver vocabulary', 'DP-PY19A', lambda c: c['case_input']['sdk_calls'].insert(0, {'step': 97, 'api': 'net.fetch'}),
         'step api outside the driver vocabulary: DP-PY19A net.fetch'),
        ('case_input bytes changed (F4-01)', 'DP-PY19B', lambda c: c['case_input']['sdk_calls'][1]['config'].update(cwd='/work/x'),
         'case_input bytes differ from case_input_sha256: DP-PY19B'),
    ]
    neg = []
    for name, cid, mut, msg in neg_specs:
        c = copy.deepcopy(cases[cid])
        mut(c)
        got = problems_of(cid, c['case_input'], c)
        neg.append({'control': name, 'expected_message': msg, 'refused': msg in got, 'messages': got})
    props = dict(SUP.props_of('DP-PY02P'), KillMode='process')
    neg.append({'control': 'service property outside the inherited table (DP1-ADM/R2-F05)', 'expected_message': 'props_ok False',
                'refused': SUP.props_ok('DP-PY02P', props) is False, 'messages': [SUP.props_diff(props)]})
    keep = dict(SUP.BARRIER_PLAN['DP-PY19B'])
    SUP.BARRIER_PLAN['DP-PY19B'] = {}
    try:
        cov = SUP.plan_check()
    finally:
        SUP.BARRIER_PLAN['DP-PY19B'] = keep
    neg.append({'control': 'barrier plan without the DP-PY19B entry', 'expected_message': "['DP-PY19B', [12], []]",
                'refused': ['DP-PY19B', [12], []] in cov, 'messages': cov})
    all_refused = all(n['refused'] for n in neg)
    doc = {'kind': 'UNIT_VALIDATION_DP2', 'ok': ok and all_refused, 'results': results, 'negative_controls': neg,
           'negative_controls_refused': '%d/%d' % (sum(n['refused'] for n in neg), len(neg)),
           'note': ('Validador da IMPLEMENT do DP-2: regras sobre cases-dp-2.json e as linhas DIAG do supervisor (F4-01, DDP-05, DDP-06, DDP-11, DDP-12, '
                    'DP-SPEC/R2-F03, C32-ADM/R1-F03, vocabulário do driver, cobertura do plano de barreiras, propriedades de serviço); cada regra com controle '
                    'negativo julgado pela mensagem exata; nada é importado do SDK nem executado do cache.')}
    (UNIT / 'validation-unit.json').write_text(json.dumps(doc, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'ok': doc['ok'], 'problems': {k: v for k, v in results.items() if v}, 'negatives': doc['negative_controls_refused'],
                      'not_refused': [n['control'] for n in neg if not n['refused']]}, ensure_ascii=False, indent=1))
    return 0 if doc['ok'] else 1


if __name__ == '__main__':
    sys.exit(run())
