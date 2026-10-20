"""Unit validator of DX100-G02:IMPLEMENT-AND-ADMIT-SDK-DISTRIBUTED-PROFILE-DP-1 (read-only, offline) -> validation-unit.json.

Usage: python3 -I -B tools/validate_unit.py   (cwd = unit folder)
Checks the static properties the services rely on, each with a negative control that must be refused by the very check it names
(exact message, lesson of DP-SPEC/R2-F03): spec bindings; frozen rows and plan equal to the supervisor tables; loader SDK entries
(published copies bound by the A7 member sha; none in the CONTROL; own modules only in DIAG-DP-NODE); service limits of DDP-05;
topology driver_only; self-tests including the R2-F01 erratum tests; no binary or file over 5 MB in the unit folder.
"""
import copy
import hashlib
import importlib.util
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.dont_write_bytecode = True
UNIT = Path(__file__).resolve().parent.parent


def load(name, mod):
    spec = importlib.util.spec_from_file_location(mod, UNIT / 'dplane' / name)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


SUP = load('supervisor.py', 'val_sup')
checks, negatives = [], []


def check(name, problems):
    checks.append({'check': name, 'ok': not problems, 'detail': problems[:10]})


def c_spec(bindings):
    nt = json.loads((UNIT / 'inputs' / 'spec-dp' / 'next-task.json').read_text())
    want = {Path(v['path']).name: v['sha256'] for v in nt['spec'].values() if v['path'].split('/')[-2] == 'sdk-distributed-profile-spec'}
    return ['spec input differs from next-task.json: %s' % n for n, s in bindings.items() if want.get(n) != s]


def c_rows(fixture_bytes, plan_doc):
    out = []
    if fixture_bytes != SUP.fixture_bytes():
        out.append('fixture-cases-dp1.json differs from the supervisor rows')
    want = {c: SUP.case_plan(c) for c in SUP.RUN_ORDER + sorted(SUP.DIAG)}
    if plan_doc.get('cases') != json.loads(json.dumps(want)):
        out.append('case-plan-dp1.json differs from the supervisor plan')
    if plan_doc.get('run_order') != SUP.RUN_ORDER or SUP.RUN_ORDER[0] != SUP.CONTROL_CASE:
        out.append('run order is not CONTROL first then slot order')
    return out


def c_loader(entries_of):
    out = []
    for c in SUP.RUN_ORDER:
        e = entries_of(c)
        if c == SUP.CONTROL_CASE and e != {}:
            out.append('CONTROL with SDK entries')
        if c in SUP.SPEC_CASES and SUP.SPEC_CASES[c]['kind'] == 'SDK':
            imports = ['file://' + s['module'] for s in SUP.SPEC_CASES[c]['case_input']['sdk_calls'] if s['api'] == 'import']
            if sorted(e) != sorted(imports) or any(v != SUP.A7_INDEX_SHA for v in e.values()):
                out.append('SDK entries of %s differ from its import steps bound by the A7 sha' % c)
    node = entries_of('DIAG-DP-NODE')
    if sorted(node) != ['file:///profile/dp-diag-sdkbad.mjs', 'file:///profile/dp-diag-sdkdrift.mjs', 'file:///profile/dp-diag-sdklike.mjs'] or node['file:///profile/dp-diag-sdkdrift.mjs'] != '0' * 64:
        out.append('DIAG-DP-NODE entries')
    if any(entries_of(d) for d in SUP.DIAG if d != 'DIAG-DP-NODE'):
        out.append('a DIAG other than DIAG-DP-NODE admits SDK entries')
    if SUP.A7_INDEX_SHA != SUP.STG.MEMBERS['A7']['package/dist/index.js']['sha256']:
        out.append('A7 sha of the supervisor differs from artifact-metadata.json')
    return out


def c_props(props):
    out = []
    if props.get('MemoryMax') != '1073741824' or props.get('TasksMax') != '256':
        out.append('service limits differ from DDP-05')
    if props.get('NoNewPrivileges') != 'yes':
        out.append('NoNewPrivileges must stay yes')
    return out


def c_topology(channel_src, driver_src):
    out = []
    if "c.topology === 'driver_only'" not in channel_src:
        out.append('channel does not require topology driver_only')
    if "topology: 'driver_only'" not in driver_src:
        out.append('driver does not declare topology driver_only')
    return out


def c_selftests(doc):
    out = []
    if doc.get('failed') != 0 or doc.get('passed', 0) < 60:
        out.append('self-tests not all passing')
    names = [r['name'] for r in doc.get('results', [])]
    for need in ('R2-F01: complete synthetic driver_only capture -> observer PASS', 'R2-F01: an adapter frame in driver_only -> INVALID_CAPTURE',
                 'R2-F01: synthetic DP1-CTRL01 -> MISMATCH by rule 6 only from wrap.exit_mirror_exact'):
        if need not in names:
            out.append('missing erratum self-test: ' + need)
    return out


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
fixture_raw = (UNIT / 'fixture-cases-dp1.json').read_bytes()
plan_doc = json.loads((UNIT / 'case-plan-dp1.json').read_text())
selftest_doc = json.loads((UNIT / 'selftests' / 'selftest-results.json').read_text())
channel_src = (UNIT / 'node' / 'dp-channel.cjs').read_text()
driver_src = (UNIT / 'node' / 'dp-driver.mjs').read_text()
files = {}
for p in sorted(UNIT.rglob('*')):
    if p.is_file() and 'cases' not in p.relative_to(UNIT).parts[:1] and 'diagnostics' not in p.relative_to(UNIT).parts[:1]:
        with open(p, 'rb') as f:
            files[str(p.relative_to(UNIT))] = (p.stat().st_size, f.read(4))

check('spec inputs equal next-task.json#/spec', c_spec(bindings))
check('frozen rows and plan equal the supervisor tables; CONTROL first', c_rows(fixture_raw, plan_doc))
check('loader SDK entries: published copies by the A7 sha, none in the CONTROL, own modules only in DIAG-DP-NODE', c_loader(SUP.sdk_entries))
check('service properties of DDP-05 (1 GiB, 256 tasks, NoNewPrivileges)', c_props(SUP.PROPS))
check('topology driver_only required by the channel and declared by the driver (erratum DP-SPEC/R2-F01)', c_topology(channel_src, driver_src))
check('self-tests passing, with the R2-F01 erratum tests', c_selftests(selftest_doc))
check('no binary, empty file or file over 5 MB in the unit folder (cases/ and diagnostics/ checked by the closing tools)', c_files(files))


def neg(name, must, fn):
    problems = fn()
    negatives.append({'control': name, 'expected_message': must, 'rejected': any(p == must or p.startswith(must) for p in problems), 'first': problems[0] if problems else None})


nb = dict(bindings)
nb['cases-dp-1.json'] = '0' * 64
neg('spec binding changed', 'spec input differs from next-task.json: cases-dp-1.json', lambda: c_spec(nb))
neg('fixture rows changed', 'fixture-cases-dp1.json differs from the supervisor rows', lambda: c_rows(fixture_raw + b' ', plan_doc))
pd = copy.deepcopy(plan_doc)
pd['run_order'] = list(reversed(pd['run_order']))
neg('run order changed', 'run order is not CONTROL first then slot order', lambda: c_rows(fixture_raw, pd))
neg('CONTROL admits an SDK entry', 'CONTROL with SDK entries', lambda: c_loader(lambda c: {'file:///x.js': 'a' * 64} if c == SUP.CONTROL_CASE else SUP.sdk_entries(c)))
neg('SDK entry with another sha', 'SDK entries of DP-PK01A differ', lambda: c_loader(lambda c: {k: '1' * 64 for k in SUP.sdk_entries(c)} if c == 'DP-PK01A' else SUP.sdk_entries(c)))
neg('service limits back to 512 MiB / 32', 'service limits differ from DDP-05', lambda: c_props(dict(SUP.PROPS, MemoryMax='536870912', TasksMax='32')))
neg('channel without the topology check', 'channel does not require topology driver_only', lambda: c_topology(channel_src.replace("c.topology === 'driver_only'", 'true'), driver_src))
neg('erratum self-test missing', 'missing erratum self-test: R2-F01: an adapter frame', lambda: c_selftests(dict(selftest_doc, results=[r for r in selftest_doc['results'] if 'adapter frame' not in r['name']])))
neg('ELF in the unit folder', 'binary, gzip or zip: x', lambda: c_files({'x': (10, b'\x7fELF')}))
ok = all(c['ok'] for c in checks) and all(n['rejected'] for n in negatives)
doc = {'kind': 'UNIT_VALIDATION_DP1', 'task': 'DX100-G02:IMPLEMENT-AND-ADMIT-SDK-DISTRIBUTED-PROFILE-DP-1', 'ok': ok, 'checks': checks,
       'negative_controls': negatives, 'negative_controls_refused': sum(n['rejected'] for n in negatives), 'validated_at': datetime.now(timezone.utc).isoformat()}
(UNIT / 'validation-unit.json').write_text(json.dumps(doc, ensure_ascii=False, indent=2) + '\n')
print('ok' if ok else 'FAIL', sum(c['ok'] for c in checks), '/', len(checks), 'negatives', doc['negative_controls_refused'], '/', len(negatives))
for c in checks:
    if not c['ok']:
        print('FAIL', c['check'], c['detail'])
for n in negatives:
    if not n['rejected']:
        print('NEG NOT REJECTED', n)
sys.exit(0 if ok else 1)
