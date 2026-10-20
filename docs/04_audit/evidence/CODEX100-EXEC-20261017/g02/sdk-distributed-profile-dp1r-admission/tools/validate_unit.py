"""Unit validator of DX100-G02:IMPLEMENT-AND-ADMIT-SDK-DISTRIBUTED-PROFILE-DP-1R (read-only, offline) -> validation-unit.json.

Usage: python3 -I -B tools/validate_unit.py   (cwd = unit folder)
Derived from the DP-1 validator. Every check has at least one negative control that must be refused with the exact message of the
check (string equality: lessons DP-SPEC/R2-F03 and DP1-ADM/R1-F05). Checks: spec bindings and the erratum binding; the erratum
recomputed from cases-dp-1.json; frozen rows and plan equal to the supervisor tables, CONTROL first, each case plan entry equal
(R2-F05 subcheck); loader entries; every service property equal to the DP-1 identity freeze (R2-F05); topology driver_only; module
scope (DDP1R-07) of the slots and of the DIAG row; self-tests passing with the current sources; dry runs bound to the current
sources; the DDP1R-09 freeze gates refuse a failing self-test, stale sources and a failed validation; no binary, empty file or file
over 5 MB in the unit folder.
"""
import copy
import hashlib
import importlib.util
import json
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

sys.dont_write_bytecode = True
UNIT = Path(__file__).resolve().parent.parent


def load(path, mod):
    spec = importlib.util.spec_from_file_location(mod, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


SUP = load(UNIT / 'dplane' / 'supervisor.py', 'val_sup')
BUILD = load(UNIT / 'tools' / 'build_cases_dp1r.py', 'val_build')
checks, negatives = [], []


def sha(b):
    return hashlib.sha256(b).hexdigest()


def check(name, problems):
    checks.append({'check': name, 'ok': not problems, 'detail': problems[:10]})


def c_spec(bindings):
    nt = json.loads((UNIT / 'inputs' / 'spec-dp' / 'next-task.json').read_text())
    want = {Path(v['path']).name: v['sha256'] for v in nt['spec'].values() if v['path'].split('/')[-2] == 'sdk-distributed-profile-spec'}
    err = json.loads((UNIT / 'erratum-dp1r.json').read_text())
    want['cases-dp-1r.json'] = err['outputs']['cases-dp-1r.json']['sha256']
    want['erratum-dp1r.json'] = sha((UNIT / 'erratum-dp1r.json').read_bytes())
    return ['spec input differs from its binding: %s' % n for n, s in sorted(bindings.items()) if want.get(n) != s]


def c_erratum(cases_bytes, err_bytes):
    out = []
    cb, eb = BUILD.build()
    if cases_bytes != cb:
        out.append('cases-dp-1r.json differs from the recomputation')
    if err_bytes != eb:
        out.append('erratum-dp1r.json differs from the recomputation')
    return out


def c_rows(fixture_bytes, plan_doc):
    out = []
    if fixture_bytes != SUP.fixture_bytes():
        out.append('fixture-cases-dp1r.json differs from the supervisor rows')
    want = json.loads(json.dumps({c: SUP.case_plan(c) for c in SUP.RUN_ORDER + sorted(SUP.DIAG)}))
    for c in sorted(set(want) | set(plan_doc.get('cases', {}))):
        if plan_doc.get('cases', {}).get(c) != want.get(c):
            out.append('case-plan-dp1r.json entry differs from the supervisor plan: %s' % c)
    if plan_doc.get('run_order') != SUP.RUN_ORDER or SUP.RUN_ORDER != ['DP1R-CTRL01', 'DP-PK07B']:
        out.append('run order is not CONTROL first then DP-PK07B')
    return out


def c_loader(entries_of):
    out = []
    for c in SUP.RUN_ORDER:
        if entries_of(c) != {}:
            out.append('%s admits SDK entries (DP-1R has no import step)' % c)
    node = entries_of('DIAG-DP-NODE')
    if sorted(node) != ['file:///profile/dp-diag-sdkbad.mjs', 'file:///profile/dp-diag-sdkdrift.mjs', 'file:///profile/dp-diag-sdklike.mjs'] or node['file:///profile/dp-diag-sdkdrift.mjs'] != '0' * 64:
        out.append('DIAG-DP-NODE entries')
    if any(entries_of(d) for d in SUP.DIAG if d != 'DIAG-DP-NODE'):
        out.append('a DIAG other than DIAG-DP-NODE admits SDK entries')
    return out


def c_props(props, inherited):
    out = []
    for k in sorted(set(props) | set(inherited)):
        if props.get(k) != inherited.get(k):
            out.append('service property differs from the DP-1 identity freeze: %s' % k)
    return out


def c_topology(channel_src, driver_src):
    out = []
    if "c.topology === 'driver_only'" not in channel_src:
        out.append('channel does not require topology driver_only')
    if "topology: 'driver_only'" not in driver_src:
        out.append('driver does not declare topology driver_only')
    return out


def c_scope(problems_of):
    out = []
    for c in SUP.RUN_ORDER:
        if problems_of(c):
            out.append('module-scope problem in the fixture of %s' % c)
    if [x['path'] for x in problems_of('DIAG-DP-SYNTH-CHILD')] != SUP.DIAG_ROWS['DIAG-DP-SYNTH-CHILD']['module_scope_expect']:
        out.append('DIAG-DP-SYNTH-CHILD module-scope rows differ from the declared negative')
    return out


def c_selftests(doc):
    out = []
    if doc.get('failed') != 0 or doc.get('passed', 0) < 70 or doc.get('node', {}).get('failed') != 0:
        out.append('self-tests not all passing')
    now = {rel: sha((UNIT / rel).read_bytes()) for rel in SUP.SELFTEST_SOURCES}
    if doc.get('sources_sha256') != now:
        out.append('self-test sources differ from the current sources')
    names = [r['name'] for r in doc.get('results', [])]
    for need in ('R2-F01: synthetic DP1R-CTRL01 -> MISMATCH by rule 6 only from wrap.exit_mirror_exact',
                 'golden synthetic capture of DP-PK07B -> PASS_CLIENT_OBSERVATION (lane conventions aligned with the evaluator)',
                 'node: EDP1R-01 negative: .exe stand-in in the "type": "module" scope is refused with ERR_UNKNOWN_FILE_EXTENSION and leaves no record (the DP-PK07A defect)',
                 'node: mutant child that creates CHILD_READY before its listeners is detected by the same check',
                 'node: wrapper.run deadline (injected 400 ms) with an own script that never closes: wrapper killed, WRAPPER_DEADLINE recorded, step throws',
                 'node: LEFTOVER negative: an own orphan is listed and killed when the cleanup is allowed'):
        if need not in names:
            out.append('missing self-test: ' + need)
    return out


def c_dry(doc, host_now, profile_now):
    out = []
    if not doc.get('all_pass') or sorted(r['case'] for r in doc.get('runs', [])) != sorted(SUP.ADMISSION_DIAGS):
        out.append('dry runs missing or not passing')
    if doc.get('host_sources_sha256_at_dry_run') != host_now:
        out.append('dry runs bound to other host sources')
    for r in doc.get('runs', []):
        if any(profile_now.get(k) != v for k, v in r['profile_files'].items() if k.startswith('/profile/dp-') and k != '/profile/dp-loader.json'):
            out.append('dry run %s bound to other profile sources' % r['case'])
    return out


def c_gate(selftest_doc, validation_doc):
    """Runs the DDP1R-09 freeze gates of the supervisor over the given documents (temporary files outside docs/)."""
    with tempfile.TemporaryDirectory(dir='/mnt/dados/cvg-work/cvg-codex100-dp1r-runtime-20261020/tmp') as d:
        st, va = Path(d) / 'st.json', Path(d) / 'va.json'
        st.write_text(json.dumps(selftest_doc))
        va.write_text(json.dumps(validation_doc))
        old = SUP.SELFTEST_RESULTS, SUP.VALIDATION
        SUP.SELFTEST_RESULTS, SUP.VALIDATION = st, va
        try:
            SUP.freeze_gates()
            return []
        except AssertionError as exc:
            return [str(exc)]
        finally:
            SUP.SELFTEST_RESULTS, SUP.VALIDATION = old


def c_files(files):
    out = []
    for rel, (size, head) in files.items():
        if size == 0:
            out.append('empty file: ' + rel)
        if size > 5242880:
            out.append('file over 5 MB: ' + rel)
        if head.startswith(b'\x7fELF') or head.startswith(b'\x1f\x8b') or head.startswith(b'PK\x03\x04'):
            out.append('binary, gzip or zip: ' + rel)
    return out


bindings = SUP.spec_bindings()
cases_raw, err_raw = (UNIT / 'cases-dp-1r.json').read_bytes(), (UNIT / 'erratum-dp1r.json').read_bytes()
fixture_raw = (UNIT / 'fixture-cases-dp1r.json').read_bytes()
plan_doc = json.loads((UNIT / 'case-plan-dp1r.json').read_text())
selftest_doc = json.loads((UNIT / 'selftests' / 'selftest-results.json').read_text())
dry_doc = json.loads((UNIT / 'dry-runs-before-freeze.json').read_text())
channel_src = (UNIT / 'node' / 'dp-channel.cjs').read_text()
driver_src = (UNIT / 'node' / 'dp-driver.mjs').read_text()
host_now = {p: sha((UNIT / p).read_bytes()) for p in dry_doc.get('host_sources_sha256_at_dry_run', {})}
profile_now = {'/profile/' + n: sha((UNIT / 'node' / n).read_bytes()) for n in SUP.PROFILE_SOURCES}
scope_of = lambda c: SUP.STG.module_scope_problems(SUP.delivered_input(c).get('trees', []))
files = {}
for p in sorted(UNIT.rglob('*')):
    rel = p.relative_to(UNIT)
    if p.is_file() and rel.parts[0] not in ('cases', 'diagnostics'):
        with open(p, 'rb') as f:
            files[str(rel)] = (p.stat().st_size, f.read(4))

check('spec inputs equal next-task.json#/spec; cases-dp-1r.json bound by erratum-dp1r.json', c_spec(bindings))
check('erratum EDP1R-01 recomputed byte for byte from cases-dp-1.json', c_erratum(cases_raw, err_raw))
check('frozen rows and plan equal the supervisor tables (entry by entry); CONTROL first', c_rows(fixture_raw, plan_doc))
check('loader SDK entries: none in the two slots, own modules only in DIAG-DP-NODE', c_loader(SUP.sdk_entries))
check('every service property equal to the DP-1 identity freeze (DV3 accepted), none declared anew (R2-F05)', c_props(SUP.PROPS, SUP.inherited_props()))
check('topology driver_only required by the channel and declared by the driver (erratum DP-SPEC/R2-F01)', c_topology(channel_src, driver_src))
check('module scope (DDP1R-07): slots clean, DIAG-DP-SYNTH-CHILD exactly its declared negative', c_scope(scope_of))
check('self-tests passing over the current sources, with the DP-1R tests', c_selftests(selftest_doc))
check('dry runs before the freeze passing and bound to the current sources (DP2-ADM/R1-F06)', c_dry(dry_doc, host_now, profile_now))
check('no binary, empty file or file over 5 MB in the unit folder (cases/ and diagnostics/ checked by the closing tools)', c_files(files))


def neg(name, must, fn):
    problems = fn()
    negatives.append({'control': name, 'expected_message': must, 'rejected': must in problems, 'got': problems[:3]})


nb = dict(bindings)
nb['cases-dp-1r.json'] = '0' * 64
neg('derived cases binding changed', 'spec input differs from its binding: cases-dp-1r.json', lambda: c_spec(nb))
neg('erratum file edited', 'erratum-dp1r.json differs from the recomputation', lambda: c_erratum(cases_raw, err_raw + b' '))
neg('fixture rows changed', 'fixture-cases-dp1r.json differs from the supervisor rows', lambda: c_rows(fixture_raw + b' ', plan_doc))
pd = copy.deepcopy(plan_doc)
pd['cases']['DP-PK07B']['fixture_entries'] = 11
neg('plan entry of the case changed (R2-F05 subcheck)', 'case-plan-dp1r.json entry differs from the supervisor plan: DP-PK07B', lambda: c_rows(fixture_raw, pd))
pd2 = copy.deepcopy(plan_doc)
pd2['run_order'] = list(reversed(pd2['run_order']))
neg('run order changed', 'run order is not CONTROL first then DP-PK07B', lambda: c_rows(fixture_raw, pd2))
neg('CONTROL admits an SDK entry', 'DP1R-CTRL01 admits SDK entries (DP-1R has no import step)', lambda: c_loader(lambda c: {'file:///x.js': 'a' * 64} if c == 'DP1R-CTRL01' else SUP.sdk_entries(c)))
neg('TimeoutStopSec changed (R2-F05)', 'service property differs from the DP-1 identity freeze: TimeoutStopSec', lambda: c_props(dict(SUP.PROPS, TimeoutStopSec='30'), SUP.inherited_props()))
neg('RuntimeMaxSec back to 45 without a declaration', 'service property differs from the DP-1 identity freeze: RuntimeMaxSec', lambda: c_props(dict(SUP.PROPS, RuntimeMaxSec='45'), SUP.inherited_props()))
neg('channel without the topology check', 'channel does not require topology driver_only', lambda: c_topology(channel_src.replace("c.topology === 'driver_only'", 'true'), driver_src))
src_cases = {c['id']: c for c in json.loads((UNIT / 'inputs' / 'spec-dp' / 'cases-dp-1.json').read_bytes())['cases']}
neg('the DP-1 fixture of DP-PK07A in the slot (DP1-ADM/PK07A)', 'module-scope problem in the fixture of DP-PK07B',
    lambda: c_scope(lambda c: SUP.STG.module_scope_problems(src_cases['DP-PK07A']['case_input']['trees']) if c == 'DP-PK07B' else scope_of(c)))
neg('DIAG negative row missing', 'DIAG-DP-SYNTH-CHILD module-scope rows differ from the declared negative', lambda: c_scope(lambda c: [] if c == 'DIAG-DP-SYNTH-CHILD' else scope_of(c)))
neg('a failing self-test', 'self-tests not all passing', lambda: c_selftests(dict(selftest_doc, failed=1)))
neg('self-test sources stale', 'self-test sources differ from the current sources', lambda: c_selftests(dict(selftest_doc, sources_sha256={})))
neg('dry run bound to another driver', 'dry run DIAG-DP-NODE bound to other profile sources',
    lambda: c_dry(dry_doc, host_now, dict(profile_now, **{'/profile/dp-driver.mjs': '0' * 64})))
neg('freeze gate: failing self-test (DDP1R-09)', 'BLOCKED: self-tests failing (failed=1)', lambda: c_gate(dict(selftest_doc, failed=1), {'ok': True}))
neg('freeze gate: stale self-test sources (DDP1R-09)', 'BLOCKED: self-test sources differ from the current sources', lambda: c_gate(dict(selftest_doc, sources_sha256={'x': '0'}), {'ok': True}))
neg('freeze gate: failed validation (DDP1R-09)', 'BLOCKED: unit validation not ok', lambda: c_gate(selftest_doc, {'ok': False}))
neg('ELF in the unit folder', 'binary, gzip or zip: x', lambda: c_files({'x': (10, b'\x7fELF')}))
ok = all(c['ok'] for c in checks) and all(n['rejected'] for n in negatives)
doc = {'kind': 'UNIT_VALIDATION_DP1R', 'task': 'DX100-G02:IMPLEMENT-AND-ADMIT-SDK-DISTRIBUTED-PROFILE-DP-1R', 'ok': ok, 'checks': checks,
       'negative_controls': negatives, 'negative_controls_refused': sum(n['rejected'] for n in negatives), 'matching': 'exact message equality',
       'validated_at': datetime.now(timezone.utc).isoformat()}
(UNIT / 'validation-unit.json').write_text(json.dumps(doc, ensure_ascii=False, indent=2) + '\n')
print('ok' if ok else 'FAIL', sum(c['ok'] for c in checks), '/', len(checks), 'negatives', doc['negative_controls_refused'], '/', len(negatives))
for c in checks:
    if not c['ok']:
        print('FAIL', c['check'], c['detail'])
for n in negatives:
    if not n['rejected']:
        print('NEG NOT REJECTED', n)
sys.exit(0 if ok else 1)
