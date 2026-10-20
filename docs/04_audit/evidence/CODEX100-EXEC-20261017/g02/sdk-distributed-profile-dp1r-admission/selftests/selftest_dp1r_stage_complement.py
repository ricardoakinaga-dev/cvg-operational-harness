"""Complementary offline self-test of the DP-1R, written in the grouped repair R1 (review-r1, finding R1-F03) after the services.
It never changes a frozen file: results go to selftests/selftest-stage-complement-results.json. No service, no SDK, no cache file
executed (archives are only read as bytes).

Usage: python3 -I -B selftests/selftest_dp1r_stage_complement.py   (cwd = unit folder)
Covers the selftests_offline of CAP-DP-STAGE and the keyless negatives that the frozen DP-1R suite did not repeat, on the DP-1R
modules (derived from selftest_dp1_caps.py of the DP-1): member with a divergent sha refused; divergent cache archive refused;
divergent fixture copy refused; modes kept when staging an own tar.gz; staging into an existing directory refused; nothing written
under docs/; CODEX_HOME present, a credential variable in the case env and a device other than lo refused by
keyless.no_network_no_credential. It also proves, by AST, that the function bodies those tests exercise in the DP-1 are byte-identical
in the DP-1R modules (check_archive, member_bytes, member_ref, stage_dist, dist_manifest, expected_dist, entry_bytes, keyless).
"""
import ast
import copy
import importlib.util
import io
import json
import shutil
import sys
import tarfile
import tempfile
from pathlib import Path

sys.dont_write_bytecode = True
UNIT = Path(__file__).resolve().parent.parent
DP1 = UNIT.parent / 'sdk-distributed-profile-dp1-admission'
TMP_ROOT = '/mnt/dados/cvg-work/cvg-codex100-dp1r-runtime-20261020/tmp'
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


def bodies(path, names):
    tree = ast.parse(Path(path).read_text())
    out = {}
    for node in ast.walk(tree):
        if isinstance(node, ast.FunctionDef) and node.name in names:
            out[node.name] = ast.dump(node, include_attributes=False)
    return out


def run():
    before = unit_listing()
    stage_fns = ['check_archive', 'member_bytes', 'member_ref', 'stage_dist', 'dist_manifest', 'expected_dist', 'entry_bytes', 'archive_path', '_bound']
    b1, b2 = bodies(DP1 / 'dplane' / 'stage.py', stage_fns), bodies(UNIT / 'dplane' / 'stage.py', stage_fns)
    t('AST: the staging functions of the DP-1R stage.py are identical to the DP-1 ones (proved there by selftest_dp1_caps.py)',
      lambda: sorted(b1) == sorted(stage_fns) and b1 == b2)
    a1, a2 = bodies(DP1 / 'dplane' / 'acceptance.py', ['keyless']), bodies(UNIT / 'dplane' / 'acceptance.py', ['keyless'])
    t('AST: keyless() of acceptance-dp1r is identical to acceptance-dp1', lambda: list(a1) == ['keyless'] and a1 == a2)

    st = load(UNIT / 'dplane' / 'stage.py', 'comp_stage')
    good = st.MEMBERS['A4']['package/package.json']['sha256']
    st.MEMBERS['A4']['package/package.json']['sha256'] = '0' * 64
    t('stage: member with a divergent sha refused (A4 package.json)', lambda: raises(lambda: st.member_bytes('A4', 'package/package.json'), 'differs from artifact-metadata.json'))
    st.MEMBERS['A4']['package/package.json']['sha256'] = good
    good_a = st.ARCHIVES['A4']['observed']['sha256']
    st.ARCHIVES['A4']['observed']['sha256'] = '0' * 64
    st._ARCHIVE_OK.clear()
    t('stage: divergent cache archive refused (A4)', lambda: raises(lambda: st.check_archive('A4'), 'differs from acquisition-ledger.json'))
    st.ARCHIVES['A4']['observed']['sha256'] = good_a
    st._ARCHIVE_OK.clear()
    tmp = Path(tempfile.mkdtemp(prefix='dp1r-comp-', dir=TMP_ROOT))
    try:
        trees = [{'root': '/fixture/c', 'entries': [{'path': '/fixture/c/package.json', 'kind': 'copy_of_member', 'member': 'A4:package/package.json'}]}]
        root = tmp / 'fixture'
        root.mkdir()
        st.materialize(trees, root)
        t('stage: an exact copy passes before the tamper', lambda: st.check_fixture(trees, st.fixture_manifest(trees, root)) == [])
        (root / 'c' / 'package.json').write_bytes(b'{"type":"commonjs"}\n')
        t('stage: divergent fixture copy refused (fixture.tree_exact)', lambda: st.check_fixture(trees, st.fixture_manifest(trees, root)) != [])
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
    t('stage: nothing written under docs/ by these tests', lambda: unit_listing() == before)

    S = load(UNIT / 'selftests' / 'selftest_dp1r.py', 'comp_st')
    ACC = S.ACC
    c = ACC.CASES_DEF['DP-PK07B']
    f = S.Frames('DP-PK07B', c['case_input_sha256'])
    f.diag('KEYLESS_WITNESS', {'net_devices': ['lo'], 'codex_home_present': True, 'home_entries': ['.codex'], 'credential_vars_in_driver_env': []})
    t('keyless: CODEX_HOME present at the start refused', lambda: ACC.keyless(c, f.logs()['driver'], S.witness_for(c))[0] is False)
    cx = copy.deepcopy(c)
    cx['case_input']['sdk_calls'][0]['env']['OPENAI_API_KEY'] = 'x'
    f2 = S.Frames('DP-PK07B', c['case_input_sha256'])
    f2.diag('KEYLESS_WITNESS', {'net_devices': ['lo'], 'codex_home_present': False, 'home_entries': [], 'credential_vars_in_driver_env': []})
    t('keyless: a credential variable in the case env refused', lambda: ACC.keyless(cx, f2.logs()['driver'], S.witness_for(c))[0] is False)
    f3 = S.Frames('DP-PK07B', c['case_input_sha256'])
    f3.diag('KEYLESS_WITNESS', {'net_devices': ['lo', 'eth0'], 'codex_home_present': False, 'home_entries': [], 'credential_vars_in_driver_env': []})
    t('keyless: a network device other than lo refused', lambda: ACC.keyless(c, f3.logs()['driver'], S.witness_for(c))[0] is False)
    f4 = S.Frames('DP-PK07B', c['case_input_sha256'])
    f4.diag('KEYLESS_WITNESS', {'net_devices': ['lo'], 'codex_home_present': False, 'home_entries': [], 'credential_vars_in_driver_env': []})
    t('keyless: the clean witness passes (positive control)', lambda: ACC.keyless(c, f4.logs()['driver'], S.witness_for(c))[0] is True)

    passed = sum(1 for x in results if x['ok'])
    doc = {'kind': 'SELFTEST_STAGE_COMPLEMENT_DP1R', 'task': 'DX100-G02:IMPLEMENT-AND-ADMIT-SDK-DISTRIBUTED-PROFILE-DP-1R',
           'origin': 'repair-r1 (R1-F03), after the services; frozen files untouched', 'passed': passed, 'failed': len(results) - passed,
           'results': results, 'functional_receipts': 0}
    (UNIT / 'selftests' / 'selftest-stage-complement-results.json').write_text(json.dumps(doc, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'passed': passed, 'failed': len(results) - passed}))
    for x in results:
        if not x['ok']:
            print('FAIL', x['name'], x.get('error', ''))
    return 0 if passed == len(results) else 1


if __name__ == '__main__':
    sys.exit(run())
