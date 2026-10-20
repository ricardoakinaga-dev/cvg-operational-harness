"""Post-review checks of DX100-G02:IMPLEMENT-AND-ADMIT-SDK-DISTRIBUTED-PROFILE-DP-1 (grouped repair R1: R1-F01, R1-F03, R1-F04, R1-F05).

Usage: python3 -I -B tools/post_review_checks.py   (cwd = unit folder) -> post-review-checks-dp1.json
Read-only over the executed folders; never changes a frozen file. Each check has a negative control that must be refused with the
exact message of the check it names (string equality, lesson of DP-SPEC/R2-F03):
- per-case topology (erratum DP-SPEC/R2-F01): every slot and the CONTROL declare driver_only in the plan of the folder and in
  profile/adapter-config.json; no adapter or peer byte; only the driver vocabulary in the steps; DP-PK09A without service;
- service properties: MemoryMax and TasksMax of DDP-05, CPUQuota inherited, RuntimeMaxSec the declared deviation DV3 (90 instead of
  the inherited 45), in the supervisor table and in the argv of every service;
- DIAG-DP-REAL-CLI judged a posteriori on its recorded listing: /work unchanged by the published binary except HOME (R1-F04);
- the freeze addendum binds the source and identity freezes by sha.
"""
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

U = Path(__file__).resolve().parent.parent
DRIVER_VOCAB = {'import', 'shim.platform', 'shim.restore', 'new Codex', 'startThread', 'run', 'probe', 'file.sha256', 'wrapper.run', 'child.program'}
INHERITED = {'CPUQuota': '100%', 'RuntimeMaxSec': '45'}
DECLARED = {'MemoryMax': '1073741824', 'TasksMax': '256', 'RuntimeMaxSec': '90'}


def load(p):
    return json.loads(Path(p).read_text())


def sha(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()


def topology_problems(folders):
    out = []
    for case, d in folders.items():
        res = d['result']
        if case == 'DP-PK09A':
            if res.get('kind') != 'ARTIFACT_CHECK_EVALUATOR_ONLY_NO_SERVICE' or res.get('unit') is not None or res.get('services') != 0:
                out.append('DP-PK09A ran a service')
            continue
        if d['config'].get('topology') != 'driver_only':
            out.append('%s: config topology is not driver_only' % case)
        if (d['manifest'].get('case_plan') or {}).get('topology') != 'driver_only':
            out.append('%s: plan topology is not driver_only' % case)
        if res['raw_frame_bytes'].get('adapter') != 0 or res['raw_frame_bytes'].get('peer') != 0:
            out.append('%s: adapter or peer bytes in a driver_only capture' % case)
        bad = sorted({s['api'] for s in d['config']['case_input'].get('sdk_calls', []) if s['api'] not in DRIVER_VOCAB})
        if bad:
            out.append('%s: steps outside the driver vocabulary: %s' % (case, bad))
    return out


def props_problems(table, argvs):
    out = []
    for k, v in DECLARED.items():
        if table.get(k) != v:
            out.append('property %s differs from DDP-05/DV3' % k)
    if table.get('CPUQuota') != INHERITED['CPUQuota']:
        out.append('property CPUQuota differs from the inherited value')
    for name, argv in argvs.items():
        props = {a.split('=', 1)[0]: a.split('=', 1)[1] for a in argv if '=' in a and a.split('=', 1)[0] in table}
        if props != table:
            out.append('%s: service argv properties differ from the supervisor table' % name)
    return out


def realcli_problems(detail):
    out = []
    if detail.get('work_before') != detail.get('work_after'):
        out.append('/work changed by the published binary')
    if detail.get('code') != 0:
        out.append('published binary exit code')
    return out


def addendum_problems(add, freeze_sha, identity_sha):
    out = []
    if add.get('binds', {}).get('source_freeze', {}).get('sha256') != freeze_sha:
        out.append('addendum binds another source freeze')
    if add.get('binds', {}).get('identity_freeze', {}).get('sha256') != identity_sha:
        out.append('addendum binds another identity freeze')
    return out


def main():
    import importlib.util
    spec = importlib.util.spec_from_file_location('prc_sup', U / 'dplane' / 'supervisor.py')
    sup = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(sup)
    folders = {}
    for d in sorted((U / 'cases').iterdir()):
        case = d.name.rsplit('-', 1)[0]
        res = load(d / 'result.json')
        folders[case] = {'result': res, 'config': load(d / 'profile' / 'adapter-config.json') if (d / 'profile').exists() else {},
                         'manifest': load(d / 'profile-manifest.json') if (d / 'profile-manifest.json').exists() else {}}
    argvs = {}
    for d in sorted(list((U / 'cases').iterdir()) + list((U / 'diagnostics').iterdir())):
        if (d / 'command.json').exists():
            argvs[d.name] = load(d / 'command.json')['argv']
    real = [d for d in (U / 'diagnostics').iterdir() if d.name.endswith('DIAG-DP-REAL-CLI')][0]
    detail = None
    for line in (real / 'events-driver.jsonl').read_text().splitlines():
        e = json.loads(line)
        if e['kind'] == 'DIAGNOSTIC' and e['data']['milestone'] == 'REAL_CLI_VERSION':
            detail = e['data']['detail']
    add = load(U / 'freeze-addendum-dp1.json')
    checks = [
        {'check': 'per-case topology driver_only (plan, config, no adapter/peer byte, driver vocabulary; DP-PK09A without service)', 'problems': topology_problems(folders)},
        {'check': 'service properties: DDP-05 limits, CPUQuota inherited, RuntimeMaxSec = declared DV3, equal in every service argv', 'problems': props_problems(sup.PROPS, argvs)},
        {'check': 'DIAG-DP-REAL-CLI judged on its recorded /work listing (R1-F04)', 'problems': realcli_problems(detail or {})},
        {'check': 'freeze addendum bound to the source and identity freezes', 'problems': addendum_problems(add, sha(U / 'source-freeze-dp1.json'), sha(U / 'identity-freeze-dp1.json'))},
    ]
    for c in checks:
        c['ok'] = not c['problems']
    negatives = []

    def neg(name, must, problems):
        negatives.append({'control': name, 'expected_message': must, 'rejected': must in problems, 'got': problems[:3]})

    f2 = json.loads(json.dumps(folders))
    f2['DP-PK04A']['config']['topology'] = 'adapter_peer'
    neg('slot with another topology', 'DP-PK04A: config topology is not driver_only', topology_problems(f2))
    f3 = json.loads(json.dumps(folders))
    f3['DP-PK06A']['result']['raw_frame_bytes']['adapter'] = 12
    neg('adapter bytes in a driver_only slot', 'DP-PK06A: adapter or peer bytes in a driver_only capture', topology_problems(f3))
    f4 = json.loads(json.dumps(folders))
    f4['DP-PK09A']['result']['unit'] = 'cvg-dx100-dp1-x.service'
    neg('artifact slot with a service', 'DP-PK09A ran a service', topology_problems(f4))
    f5 = json.loads(json.dumps(folders))
    f5['DP-PK05A']['config']['case_input']['sdk_calls'][0]['api'] = 'adapter.spawn'
    neg('step outside the driver vocabulary', "DP-PK05A: steps outside the driver vocabulary: ['adapter.spawn']", topology_problems(f5))
    neg('RuntimeMaxSec back to an undeclared value', 'property RuntimeMaxSec differs from DDP-05/DV3', props_problems(dict(sup.PROPS, RuntimeMaxSec='120'), {}))
    neg('CPUQuota changed', 'property CPUQuota differs from the inherited value', props_problems(dict(sup.PROPS, CPUQuota='200%'), {}))
    neg('service argv differing from the table', 'x: service argv properties differ from the supervisor table', props_problems(sup.PROPS, {'x': ['TasksMax=32']}))
    neg('/work changed', '/work changed by the published binary', realcli_problems(dict(detail or {}, work_after=['child', 'extra'])))
    neg('addendum bound to another freeze', 'addendum binds another source freeze', addendum_problems(add, '0' * 64, sha(U / 'identity-freeze-dp1.json')))
    ok = all(c['ok'] for c in checks) and all(n['rejected'] for n in negatives)
    doc = {'kind': 'POST_REVIEW_CHECKS_DP1', 'task': 'DX100-G02:IMPLEMENT-AND-ADMIT-SDK-DISTRIBUTED-PROFILE-DP-1', 'origin': 'repair-r1 (R1-F01, R1-F03, R1-F04, R1-F05)',
           'ok': ok, 'checks': checks, 'negative_controls': negatives, 'negative_controls_refused': sum(n['rejected'] for n in negatives),
           'matching': 'exact message equality', 'checked_at': datetime.now(timezone.utc).isoformat()}
    (U / 'post-review-checks-dp1.json').write_text(json.dumps(doc, ensure_ascii=False, indent=2) + '\n')
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
