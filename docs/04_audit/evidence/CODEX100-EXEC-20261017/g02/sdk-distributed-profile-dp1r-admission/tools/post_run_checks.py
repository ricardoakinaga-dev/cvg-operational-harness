"""Post-run checks of DX100-G02:IMPLEMENT-AND-ADMIT-SDK-DISTRIBUTED-PROFILE-DP-1R (read-only over the executed folders) ->
post-run-checks-dp1r.json. Derived from post_review_checks.py of the DP-1 (repair R1 there), run here before the review.

Usage: python3 -I -B tools/post_run_checks.py   (cwd = unit folder)
Each check has a negative control refused with the exact message (string equality):
- source freeze intact after the services (every frozen file recomputed);
- per-folder topology driver_only (config and plan), no adapter or peer byte, only the driver vocabulary in the steps;
- every service argv carries exactly the supervisor property table, equal to the DP-1 identity freeze;
- module scope recorded by the supervisor: [] in both slots, exactly the declared negative in DIAG-DP-SYNTH-CHILD;
- the win32 records of DP-PK07B carry the .exe paths of the frozen expected values;
- the five units are the only cvg-dx100-dp1r-* units, each with a distinct cgroup recorded and released;
- run order: the CONTROL unit started before the DP-PK07B unit and after the three DIAG units and the diag admission;
- (repair R1, finding R1-F07) no ELF, gzip, zip or PE file and no file over 5 MB in cases/ and diagnostics/.
"""
import base64
import hashlib
import importlib.util
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.dont_write_bytecode = True
U = Path(__file__).resolve().parent.parent
DRIVER_VOCAB = {'import', 'shim.platform', 'shim.restore', 'new Codex', 'startThread', 'run', 'probe', 'file.sha256', 'wrapper.run', 'child.program'}


def load(p):
    return json.loads(Path(p).read_text())


def sha(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()


def freeze_problems(frozen, current):
    return ['frozen file changed after the freeze: %s' % k for k in sorted(frozen) if current.get(k) != frozen[k]]


def topology_problems(folders):
    out = []
    for name, d in folders.items():
        if d['config'].get('topology') != 'driver_only':
            out.append('%s: config topology is not driver_only' % name)
        if (d['manifest'].get('case_plan') or {}).get('topology') != 'driver_only':
            out.append('%s: plan topology is not driver_only' % name)
        if d['result']['raw_frame_bytes'].get('adapter') != 0 or d['result']['raw_frame_bytes'].get('peer') != 0:
            out.append('%s: adapter or peer bytes in a driver_only capture' % name)
        ci = d['config'].get('case_input', {})
        bad = sorted({s['api'] for s in ci.get('sdk_calls', []) + ci.get('diag_calls', []) if s['api'] not in DRIVER_VOCAB})
        if bad:
            out.append('%s: steps outside the driver vocabulary: %s' % (name, bad))
    return out


def props_problems(table, inherited, argvs):
    out = []
    if table != inherited:
        out.append('supervisor property table differs from the DP-1 identity freeze')
    for name, argv in sorted(argvs.items()):
        props = {a.split('=', 1)[0]: a.split('=', 1)[1] for i, a in enumerate(argv) if i > 0 and argv[i - 1] == '--property'}
        if props != table:
            out.append('%s: service argv properties differ from the supervisor table' % name)
    return out


def scope_problems(scopes, expect):
    out = []
    for name, got in sorted(scopes.items()):
        want = expect.get(name, [])
        if [x['path'] for x in got] != want:
            out.append('%s: recorded module scope differs from the declaration' % name)
    return out


def win32_problems(records, expected):
    out = []
    for step, as_ in ((7, 'p_win32_x64'), (8, 'p_win32_arm64')):
        got = [r.get('exec_path') for r in records.get(step, [])]
        if got != [expected[as_]['child_executed_path']] or not got[0].endswith('.exe'):
            out.append('DP-PK07B step %d: win32 record differs from the frozen .exe path' % step)
    return out


def units_problems(results, listed):
    out = []
    units = [r['unit'] for r in results]
    if len(units) != 5 or len(set(units)) != 5 or not all(u.startswith('cvg-dx100-dp1r-') for u in units):
        out.append('units are not five distinct cvg-dx100-dp1r-* units')
    cgs = [((r.get('service_before') or {}).get('ControlGroup')) for r in results]
    if any(not c for c in cgs) or len(set(cgs)) != len(cgs):
        out.append('a unit without its own recorded cgroup')
    if any(not r['os_checks'].get('cgroup_removed_or_empty') or not r['os_checks'].get('unit_collected') for r in results):
        out.append('a unit not released')
    if listed:
        out.append('cvg-dx100-dp1r-* units still listed')
    return out


def order_problems(starts, admission_at):
    out = []
    diag = [t for n, t in starts.items() if 'DIAG-' in n]
    ctrl = [t for n, t in starts.items() if 'DP1R-CTRL01' in n]
    case = [t for n, t in starts.items() if 'DP-PK07B' in n]
    if not (len(diag) == 3 and len(ctrl) == 1 and len(case) == 1 and max(diag) < admission_at < ctrl[0] < case[0]):
        out.append('run order is not DIAG, admission, CONTROL, DP-PK07B')
    return out


def files_problems(files):
    out = []
    for rel, (size, head) in sorted(files.items()):
        if size > 5242880:
            out.append('file over 5 MB: ' + rel)
        if head.startswith((b'\x7fELF', b'\x1f\x8b', b'PK\x03\x04', b'MZ')):
            out.append('binary, gzip, zip or PE: ' + rel)
    return out


def blobs(ev):
    out = {}
    for line in (ev / 'events-driver.jsonl').read_text().splitlines():
        e = json.loads(line)
        if e['kind'] == 'BLOB':
            out[e['data']['name']] = out.get(e['data']['name'], b'') + base64.b64decode(e['data']['base64'])
    return out


def main():
    spec = importlib.util.spec_from_file_location('prc_sup', U / 'dplane' / 'supervisor.py')
    sup = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(sup)
    frozen = {k: v['sha256'] for k, v in load(U / 'source-freeze-dp1r.json')['files'].items()}
    current = {k: sha(U / k) for k in frozen}
    dirs = sorted((U / 'cases').iterdir()) + sorted((U / 'diagnostics').iterdir())
    folders, argvs, scopes, results, starts = {}, {}, {}, [], {}
    for d in dirs:
        res = load(d / 'result.json')
        man = load(d / 'profile-manifest.json')
        folders[d.name] = {'result': res, 'config': load(d / 'profile' / 'adapter-config.json'), 'manifest': man}
        argvs[d.name] = load(d / 'command.json')['argv']
        scopes[d.name] = man['module_scope_problems']
        results.append(res)
        starts[d.name] = datetime.fromisoformat(res['observed_at']).timestamp() - res['elapsed_ns'] / 1e9  # start of the attempt
    admission_at = datetime.fromisoformat(load(U / 'diag-admission-dp1r.json')['recorded_at']).timestamp()
    expect = {d.name: (sup.DIAG_ROWS['DIAG-DP-SYNTH-CHILD']['module_scope_expect'] if d.name.endswith('DIAG-DP-SYNTH-CHILD') else []) for d in dirs}
    pk = [d for d in dirs if d.name.startswith('DP-PK07B-')][0]
    b = blobs(pk)
    records = {n: json.loads(b.get('child-records:%d' % n, b'[]')) for n in range(1, 11)}
    expected = sup.SPEC_CASES['DP-PK07B']['expected']['wrappers']
    scanned = {}
    for p in sorted(list((U / 'cases').rglob('*')) + list((U / 'diagnostics').rglob('*'))):
        if p.is_file():
            with open(p, 'rb') as fh:
                scanned[p.relative_to(U).as_posix()] = (p.stat().st_size, fh.read(4))
    listed = (subprocess.run(['systemctl', '--user', 'list-units', '--all', 'cvg-dx100-dp1r-*', '--no-legend'], capture_output=True, text=True).stdout.strip()
              + subprocess.run(['systemctl', 'list-units', '--all', 'cvg-dx100-dp1r-*', '--no-legend'], capture_output=True, text=True).stdout.strip())
    checks = [
        {'check': 'source freeze intact after the services', 'problems': freeze_problems(frozen, current)},
        {'check': 'per-folder topology driver_only, no adapter or peer byte, driver vocabulary only', 'problems': topology_problems(folders)},
        {'check': 'service argv properties equal the supervisor table, equal to the DP-1 identity freeze', 'problems': props_problems(sup.PROPS, sup.inherited_props(), argvs)},
        {'check': 'module scope recorded: [] in the slots, the declared negative in DIAG-DP-SYNTH-CHILD', 'problems': scope_problems(scopes, expect)},
        {'check': 'DP-PK07B win32 records carry the frozen .exe paths', 'problems': win32_problems(records, expected)},
        {'check': 'five distinct cvg-dx100-dp1r-* units, own cgroups, all released', 'problems': units_problems(results, listed)},
        {'check': 'run order DIAG, diag admission, CONTROL, DP-PK07B', 'problems': order_problems(starts, admission_at)},
        {'check': 'no ELF, gzip, zip or PE file and no file over 5 MB in cases/ and diagnostics/ (repair R1, R1-F07)', 'problems': files_problems(scanned)},
    ]
    for c in checks:
        c['ok'] = not c['problems']
    negatives = []

    def neg(name, must, problems):
        negatives.append({'control': name, 'expected_message': must, 'rejected': must in problems, 'got': problems[:3]})

    some = sorted(frozen)[0]
    neg('a frozen file changed', 'frozen file changed after the freeze: %s' % some, freeze_problems(frozen, dict(current, **{some: '0' * 64})))
    f2 = json.loads(json.dumps(folders))
    f2[pk.name]['config']['topology'] = 'adapter_peer'
    neg('slot with another topology', '%s: config topology is not driver_only' % pk.name, topology_problems(f2))
    f3 = json.loads(json.dumps(folders))
    f3[pk.name]['result']['raw_frame_bytes']['peer'] = 4
    neg('peer bytes in a driver_only slot', '%s: adapter or peer bytes in a driver_only capture' % pk.name, topology_problems(f3))
    neg('service argv with TasksMax 32', 'x: service argv properties differ from the supervisor table', props_problems(sup.PROPS, sup.inherited_props(), {'x': ['systemd-run', '--property', 'TasksMax=32']}))
    neg('property table drifted', 'supervisor property table differs from the DP-1 identity freeze', props_problems(dict(sup.PROPS, KillMode='process'), sup.inherited_props(), {}))
    neg('slot recorded with a module-scope problem', '%s: recorded module scope differs from the declaration' % pk.name, scope_problems(dict(scopes, **{pk.name: [{'path': '/x.exe'}]}), expect))
    neg('win32 record without .exe', 'DP-PK07B step 7: win32 record differs from the frozen .exe path',
        win32_problems({**records, 7: [{'exec_path': expected['p_win32_x64']['child_executed_path'][:-4]}]}, expected))
    neg('a sixth unit', 'units are not five distinct cvg-dx100-dp1r-* units', units_problems(results + [results[0]], ''))
    neg('a unit still listed', 'cvg-dx100-dp1r-* units still listed', units_problems(results, 'cvg-dx100-dp1r-x.service loaded active'))
    neg('CONTROL after the case', 'run order is not DIAG, admission, CONTROL, DP-PK07B',
        order_problems({k: (v + 10000 if 'DP1R-CTRL01' in k else v) for k, v in starts.items()}, admission_at))
    neg('an ELF in a case folder', 'binary, gzip, zip or PE: cases/x/a.out', files_problems({'cases/x/a.out': (100, b'\x7fELF')}))
    neg('a file over 5 MB in diagnostics/', 'file over 5 MB: diagnostics/x/big.txt', files_problems({'diagnostics/x/big.txt': (5242881, b'{"a"')}))
    ok = all(c['ok'] for c in checks) and all(n['rejected'] for n in negatives)
    doc = {'kind': 'POST_RUN_CHECKS_DP1R', 'task': 'DX100-G02:IMPLEMENT-AND-ADMIT-SDK-DISTRIBUTED-PROFILE-DP-1R', 'ok': ok, 'checks': checks,
           'files_scanned_in_cases_and_diagnostics': len(scanned), 'revision': 'repair R1 (R1-F07): scan of cases/ and diagnostics/ added; preimage in archives/r1-preimages/',
           'negative_controls': negatives, 'negative_controls_refused': sum(n['rejected'] for n in negatives), 'matching': 'exact message equality',
           'checked_at': datetime.now(timezone.utc).isoformat()}
    (U / 'post-run-checks-dp1r.json').write_text(json.dumps(doc, ensure_ascii=False, indent=2) + '\n')
    print('ok' if ok else 'FAIL', sum(c['ok'] for c in checks), '/', len(checks), 'negatives', doc['negative_controls_refused'], '/', len(negatives))
    for c in checks:
        if not c['ok']:
            print('FAIL', c['check'], c['problems'][:5])
    for n in negatives:
        if not n['rejected']:
            print('NEG NOT REJECTED', n)
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main())
