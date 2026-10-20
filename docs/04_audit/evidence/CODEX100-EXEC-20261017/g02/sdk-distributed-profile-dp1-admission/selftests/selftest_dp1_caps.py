"""Offline capability self-tests of DX100-G02:IMPLEMENT-AND-ADMIT-SDK-DISTRIBUTED-PROFILE-DP-1, written in the grouped repair R1
(review-r1, finding R1-F02). They run after the services and never change the frozen files: results go to
selftests/selftest-caps-results.json. No service, no SDK, no cache file executed (archives are only read as bytes).

Usage: python3 -I -B selftests/selftest_dp1_caps.py   (cwd = unit folder)
Covers the selftests_offline of capability-contracts-dp.json that the frozen selftest-results.json did not cover:
- CAP-DP-STAGE: member with a divergent sha refused; divergent archive refused; divergent fixture copy refused; modes kept when staging
  an own tar.gz; nothing written under docs/;
- CAP-DP-NODE-DRIVER / CAP-DP-SYNTH-CHILD: the Node part (selftest_dp1_caps_driver.mjs) plus the evaluator side of NOT_REACHED (no
  failure added by itself) and of a driver deadline (INVALID_CAPTURE, rule 1);
- CAP-DP-REAL-CLI-KEYLESS: CODEX_HOME present and a credential variable in the case env refused by keyless.no_network_no_credential;
- CAP-DP-ARTIFACT-CHECK: a divergent field gives MISMATCH (rule 6); a divergent cache archive gives INVALID_CAPTURE (rule 3).
"""
import copy
import importlib.util
import io
import json
import os
import shutil
import subprocess
import sys
import tarfile
import tempfile
from pathlib import Path

sys.dont_write_bytecode = True
UNIT = Path(__file__).resolve().parent.parent
NODE = '/home/ricardo/.nvm/versions/node/v24.20.0/bin/node'
TMP_ROOT = '/mnt/dados/cvg-work/cvg-codex100-dp1-runtime-20261019/tmp'
results = []


def load(path, mod):
    spec = importlib.util.spec_from_file_location(mod, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def t(name, fn):
    try:
        ok = fn()
        results.append({'name': name, 'ok': ok is True})
    except Exception as exc:  # noqa: BLE001
        results.append({'name': name, 'ok': False, 'error': ('%s: %s' % (type(exc).__name__, exc))[:300]})


def raises(fn, text=None):
    try:
        fn()
        return False
    except Exception as exc:  # noqa: BLE001
        return text is None or text in str(exc)


def unit_listing():
    return sorted(str(p.relative_to(UNIT)) for p in UNIT.rglob('*') if p.is_file())


def run():
    os.makedirs(TMP_ROOT, exist_ok=True)
    r = subprocess.run([NODE, str(UNIT / 'selftests' / 'selftest_dp1_caps_driver.mjs'), str(UNIT)], capture_output=True, text=True, timeout=120, cwd=TMP_ROOT,
                       env={'PATH': '/usr/bin:/bin', 'HOME': TMP_ROOT, 'CVG_SELFTEST_TMP': TMP_ROOT})
    node = json.loads(r.stdout.strip().splitlines()[-1])
    for x in node['results']:
        results.append({'name': 'node: ' + x['name'], 'ok': x['ok'], **({'error': x['error']} if 'error' in x else {})})
    before = unit_listing()

    # ------------------------------------------------------------------------------------------- CAP-DP-STAGE (own module instance)
    st = load(UNIT / 'dplane' / 'stage.py', 'caps_stage')
    good = st.MEMBERS['A2']['package/package.json']['sha256']
    st.MEMBERS['A2']['package/package.json']['sha256'] = '0' * 64
    t('stage: member with a divergent sha refused', lambda: raises(lambda: st.member_bytes('A2', 'package/package.json'), 'differs from artifact-metadata.json'))
    st.MEMBERS['A2']['package/package.json']['sha256'] = good
    good_a = st.ARCHIVES['A2']['observed']['sha256']
    st.ARCHIVES['A2']['observed']['sha256'] = '0' * 64
    st._ARCHIVE_OK.clear()
    t('stage: divergent cache archive refused', lambda: raises(lambda: st.check_archive('A2'), 'differs from acquisition-ledger.json'))
    st.ARCHIVES['A2']['observed']['sha256'] = good_a
    st._ARCHIVE_OK.clear()
    tmp = Path(tempfile.mkdtemp(prefix='dp1-caps-', dir=TMP_ROOT))
    try:
        trees = [{'root': '/fixture/c', 'entries': [{'path': '/fixture/c/package.json', 'kind': 'copy_of_member', 'member': 'A2:package/package.json'}]}]
        root = tmp / 'fixture'
        root.mkdir()
        st.materialize(trees, root)
        (root / 'c' / 'package.json').write_bytes(b'{"name":"other"}\n')
        t('stage: divergent fixture copy refused (fixture.tree_exact)', lambda: st.check_fixture(trees, st.fixture_manifest(trees, root)) != [])
        # own tar.gz staged through stage_dist with the module tables pointed at it
        cache = tmp / 'cache'
        (cache / 'artifacts' / 'Z').mkdir(parents=True)
        buf = io.BytesIO()
        files = {'package/bin/run.js': (b'#!/x\n', 0o755), 'package/package.json': (b'{}\n', 0o644), 'package/vendor/t/bin/tool': (b'\x00tool', 0o755)}
        with tarfile.open(fileobj=buf, mode='w:gz') as tf:
            for name, (data, mode) in files.items():
                ti = tarfile.TarInfo(name)
                ti.size, ti.mode = len(data), mode
                tf.addfile(ti, io.BytesIO(data))
        arch = cache / 'artifacts' / 'Z' / 'z.tgz'
        arch.write_bytes(buf.getvalue())
        st.CACHE = str(cache)
        st.ARCHIVES = {'Z': {'stored': str(arch), 'observed': {'sha256': st.sha_path(arch)}}}
        st.MEMBERS = {'Z': {n: {'name': n, 'sha256': st.sha_bytes(d), 'size': len(d), 'mode': oct(m)} for n, (d, m) in files.items()}}
        st.LAYOUT = {'Z': 'own'}
        st._ARCHIVE_OK.clear()
        got = st.stage_dist(tmp / 'dist')
        t('stage: modes kept when staging an own tar.gz (0755 bin and ELF-like, 0644 manifest)',
          lambda: got['npm/node_modules/@openai/own/bin/run.js']['mode'] == '0755' and got['npm/node_modules/@openai/own/package.json']['mode'] == '0644'
          and got['npm/node_modules/@openai/own/vendor/t/bin/tool']['mode'] == '0755')
        t('stage: staging into an existing directory refused', lambda: raises(lambda: st.stage_dist(tmp / 'dist'), 'already exists'))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    t('stage: nothing written under docs/ by the staging tests', lambda: unit_listing() == before)

    # ------------------------------------------------------------------------------------------- evaluator side (reuses the frozen selftest helpers)
    S = load(UNIT / 'selftests' / 'selftest_dp1.py', 'caps_st')
    ACC = S.ACC
    c = ACC.CASES_DEF['DP-PK02R']
    f = S.Frames('DP-PK02R', c['case_input_sha256'])
    f.diag('KEYLESS_WITNESS', {'net_devices': ['lo'], 'codex_home_present': False, 'home_entries': [], 'credential_vars_in_driver_env': []})
    f.blob('fixture-listing', [])
    f.blob('dist-manifest', {'/dist/' + k: v for k, v in S.STG.expected_dist().items()})
    f.add('API_ERROR', {'api': '1:import', 'name': 'Error', 'message': 'own import failure', 'cause': None})
    f.diag('PROC_SAMPLE', {'step': 1, 'pids': []})
    for n in (2, 3, 4, 5):
        f.diag('NOT_REACHED', {'step': n, 'missing_alias': 'sdk'})
        f.diag('PROC_SAMPLE', {'step': n, 'pids': []})
    f.diag('CALLS_DONE', {'source_sdk_claim': False, 'topology': 'driver_only'})
    f.add('END', {'streams': {}, 'child_exit_code': None, 'child_signal': None, 'complete': True})
    logs = f.logs()
    v, rs, _ = S.OBS.reconcile_driver_only(logs, S.OS_OK)
    acc = ACC.evaluate('DP-PK02R', logs, v, rs, S.witness_for(c))
    t('EDP-07: NOT_REACHED adds no failure by itself: only the client probe fails (MISMATCH, rule 6)',
      lambda: acc['outcome'] == 'MISMATCH' and acc['composition_rule'] == 6 and acc['failed_predicates'] == ['probe.dp_values_exact'])
    f2 = S.Frames('DP-PK04A', ACC.CASES_DEF['DP-PK04A']['case_input_sha256'])
    f2.diag('KEYLESS_WITNESS', {'net_devices': ['lo'], 'codex_home_present': False, 'home_entries': [], 'credential_vars_in_driver_env': []})
    f2.add('INVALID', {'reason': 'wrapper.run deadline (step 1)'})
    logs2 = f2.logs()
    v2, rs2, _ = S.OBS.reconcile_driver_only(logs2, S.OS_OK)
    acc2 = ACC.evaluate('DP-PK04A', logs2, v2, rs2, S.witness_for(ACC.CASES_DEF['DP-PK04A']))
    t('EDP-07: driver deadline (INVALID frame) gives INVALID_CAPTURE by rule 1', lambda: v2 == 'INVALID_CAPTURE' and acc2['outcome'] == 'INVALID_CAPTURE' and acc2['composition_rule'] == 1)

    # ------------------------------------------------------------------------------------------- CAP-DP-REAL-CLI-KEYLESS (keyless predicate)
    c3 = ACC.CASES_DEF['DP-PK03A']
    d_ok = S.Frames('DP-PK03A', c3['case_input_sha256'])
    d_ok.diag('KEYLESS_WITNESS', {'net_devices': ['lo'], 'codex_home_present': True, 'home_entries': ['.codex'], 'credential_vars_in_driver_env': []})
    t('keyless: CODEX_HOME present at the start refused', lambda: ACC.keyless(c3, d_ok.logs()['driver'], S.witness_for(c3))[0] is False)
    c3x = copy.deepcopy(c3)
    c3x['case_input']['sdk_calls'][1]['options']['env']['OPENAI_API_KEY'] = 'x'
    d2 = S.Frames('DP-PK03A', c3['case_input_sha256'])
    d2.diag('KEYLESS_WITNESS', {'net_devices': ['lo'], 'codex_home_present': False, 'home_entries': [], 'credential_vars_in_driver_env': []})
    t('keyless: a credential variable in the case env refused', lambda: ACC.keyless(c3x, d2.logs()['driver'], S.witness_for(c3))[0] is False)
    d3 = S.Frames('DP-PK03A', c3['case_input_sha256'])
    d3.diag('KEYLESS_WITNESS', {'net_devices': ['lo', 'eth0'], 'codex_home_present': False, 'home_entries': [], 'credential_vars_in_driver_env': []})
    t('keyless: a network device other than lo refused', lambda: ACC.keyless(c3, d3.logs()['driver'], S.witness_for(c3))[0] is False)

    # ------------------------------------------------------------------------------------------- CAP-DP-ARTIFACT-CHECK
    keep = copy.deepcopy(ACC.CASES_DEF['DP-PK09A'])
    ACC.CASES_DEF['DP-PK09A']['expected']['artifacts']['cli_manifest']['version'] = '0.0.0-dev'
    a1 = ACC.evaluate_artifact('DP-PK09A')
    ACC.CASES_DEF['DP-PK09A'] = keep
    t('artifact check: a divergent field gives MISMATCH (rule 6)', lambda: a1['outcome'] == 'MISMATCH' and a1['composition_rule'] == 6 and a1['failed_predicates'] == ['artifact.manifest_fields_exact'])
    good_a2 = ACC.STG.ARCHIVES['A2']['observed']['sha256']
    ACC.STG.ARCHIVES['A2']['observed']['sha256'] = '0' * 64
    a2 = ACC.evaluate_artifact('DP-PK09A')
    ACC.STG.ARCHIVES['A2']['observed']['sha256'] = good_a2
    ACC.STG._ARCHIVE_OK.clear()
    t('artifact check: a divergent cache archive gives INVALID_CAPTURE (rule 3)', lambda: a2['outcome'] == 'INVALID_CAPTURE' and a2['composition_rule'] == 3)
    a3 = ACC.evaluate_artifact('DP-PK09A')
    t('artifact check: the frozen expectation still passes after the restores', lambda: a3['outcome'] == 'PASS_CLIENT_OBSERVATION')

    passed = sum(1 for x in results if x['ok'])
    doc = {'kind': 'SELFTEST_CAPS_RESULTS_DP1', 'task': 'DX100-G02:IMPLEMENT-AND-ADMIT-SDK-DISTRIBUTED-PROFILE-DP-1', 'origin': 'repair-r1 (R1-F02), after the services; frozen files untouched',
           'passed': passed, 'failed': len(results) - passed, 'node': {'version': node['node'], 'passed': node['passed'], 'failed': node['failed'], 'info': node.get('info')},
           'results': results, 'functional_receipts': 0}
    (UNIT / 'selftests' / 'selftest-caps-results.json').write_text(json.dumps(doc, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'passed': passed, 'failed': len(results) - passed}))
    for x in results:
        if not x['ok']:
            print('FAIL', x['name'], x.get('error', ''))
    return 0 if passed == len(results) else 1


if __name__ == '__main__':
    sys.exit(run())
