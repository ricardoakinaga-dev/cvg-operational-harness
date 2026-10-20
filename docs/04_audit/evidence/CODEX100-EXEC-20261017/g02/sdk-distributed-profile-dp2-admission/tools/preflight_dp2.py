"""Preflight of DX100-G02:IMPLEMENT-AND-ADMIT-SDK-DISTRIBUTED-PROFILE-DP-2 (offline, before any change to the copied sources).

Run: python3 -I -B tools/preflight_dp2.py MAIN_CHECKOUT_ROOT
Checks (execution-budget-dp-2.json#/stops and the DP-1 next-task): the spec copies in inputs/spec-dp are byte-equal to the main checkout
spec folder, and every file the DP-1 commit carries (inputs/spec-dp of ../sdk-distributed-profile-dp1-admission) is byte-equal to it;
the DP-2 files (cases-dp-2.json, execution-budget-dp-2.json and the deltas) have the sha of ../sdk-distributed-profile-dp1-admission/
next-task.json#/spec (committed); the acquisition records equal the main checkout and the DP-1 copies; the cache archives and the M7
metadata have the sha of acquisition-ledger.json (cache divergente = stop); the unit python/ starts byte-equal to the admitted C3-2
python/ and python/stage_dp.py to the DP-1 dplane/stage.py. Writes preflight.json. No service, no network.
"""
import datetime
import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path

U = Path(__file__).resolve().parent.parent
G02 = U.parent
REPO = U.parents[5]
G02_REL = 'docs/04_audit/evidence/CODEX100-EXEC-20261017/g02'
CACHE = Path('/mnt/dados/cvg-work/cvg-codex100-distributed-cache-20261019')


def sha(p):
    h = hashlib.sha256()
    with open(p, 'rb') as f:
        for block in iter(lambda: f.read(1 << 20), b''):
            h.update(block)
    return h.hexdigest()


def main(main_root):
    main_g02 = Path(main_root) / G02_REL
    checks = []
    dp1 = G02 / 'sdk-distributed-profile-dp1-admission'
    spec_main = main_g02 / 'sdk-distributed-profile-spec'
    for p in sorted((U / 'inputs' / 'spec-dp').rglob('*')):
        if not p.is_file():
            continue
        rel = p.relative_to(U / 'inputs' / 'spec-dp')
        row = {'check': 'inputs/spec-dp copy byte-equal to the main checkout spec', 'path': str(rel), 'ok': p.read_bytes() == (spec_main / rel).read_bytes()}
        anchored = dp1 / 'inputs' / 'spec-dp' / rel
        if anchored.exists():
            row['dp1_commit_copy_equal'] = p.read_bytes() == anchored.read_bytes()
            row['ok'] = row['ok'] and row['dp1_commit_copy_equal']
        checks.append(row)
    nt = json.loads((dp1 / 'next-task.json').read_text())
    for key, ent in nt['spec'].items():
        name = Path(ent['path']).name
        got = sha(U / 'inputs' / 'spec-dp' / name)
        checks.append({'check': 'DP-1 next-task spec sha (%s)' % key, 'path': name, 'ok': got == ent['sha256'], 'sha256': got})
    for name in ('acquisition-ledger.json', 'artifact-metadata.json', 'digest-verification.json', 'lead-decision-loopback-a5.json'):
        b = (U / 'inputs' / 'acquisition' / name).read_bytes()
        checks.append({'check': 'acquisition record byte-equal (main checkout and DP-1 commit)', 'path': name,
                       'ok': b == (main_g02 / 'sdk-distributed-acquisition' / name).read_bytes() and b == (dp1 / 'inputs' / 'acquisition' / name).read_bytes(),
                       'sha256': hashlib.sha256(b).hexdigest()})
    for name in ('next-task.json', 'adjudication-dp1.json', 'freeze-addendum-dp1.json', 'state.json', 'post-review-checks-dp1.json'):
        checks.append({'check': 'DP-1 record byte-equal (DP-1 commit)', 'path': name, 'ok': (U / 'inputs' / 'dp1' / name).read_bytes() == (dp1 / name).read_bytes()})
    lead = main_g02 / 'sdk-distributed-profile-dp1-admission' / 'lead-decision-dv1-dv4.json'
    checks.append({'check': 'DP-1 Lead decision byte-equal (main checkout)', 'path': 'lead-decision-dv1-dv4.json',
                   'ok': (U / 'inputs' / 'dp1' / 'lead-decision-dv1-dv4.json').read_bytes() == lead.read_bytes(), 'sha256': sha(lead)})
    c32 = G02 / 'sdk-continuation-3-2-admission'
    for name, src in (('next-task.json', c32 / 'next-task.json'), ('executor-disposition.json', c32 / 'review-r1' / 'executor-disposition.json')):
        checks.append({'check': 'C3-2 closing record byte-equal (C3-2 commit)', 'path': name, 'ok': (U / 'inputs' / 'c32' / name).read_bytes() == src.read_bytes()})
    for sub in ('spec-2b', 'spec-r4'):
        for p in sorted((U / 'inputs' / sub).iterdir()):
            checks.append({'check': 'inputs/%s byte-equal to the C3-2 inputs' % sub, 'path': p.name, 'ok': p.read_bytes() == (c32 / 'inputs' / sub / p.name).read_bytes()})
    ud = 'user-decision-distributed-profile-20261019.json'
    checks.append({'check': 'user decision byte-equal (C3-2 inputs)', 'path': ud, 'ok': (U / 'inputs' / ud).read_bytes() == (c32 / 'inputs' / ud).read_bytes()})
    names = sorted(os.listdir(c32 / 'python'))
    checks.append({'check': 'unit python/ starts byte-equal to the admitted C3-2 python/ (plus stage_dp.py = DP-1 dplane/stage.py)',
                   'ok': sorted(n for n in os.listdir(U / 'python') if n != 'stage_dp.py') == names
                   and all((U / 'python' / n).read_bytes() == (c32 / 'python' / n).read_bytes() for n in names)
                   and (U / 'python' / 'stage_dp.py').read_bytes() == (dp1 / 'dplane' / 'stage.py').read_bytes(), 'files': names + ['stage_dp.py']})
    ledger = json.loads((U / 'inputs' / 'acquisition' / 'acquisition-ledger.json').read_text())
    for a in ledger['artifacts']:
        if a.get('result') != 'DIGEST_OK':
            continue
        p = Path(a['stored'])
        ok = str(p).startswith(str(CACHE) + '/artifacts/' + a['id'] + '/') and p.is_file() and sha(p) == a['observed']['sha256']
        checks.append({'check': 'cache archive sha256 equal to acquisition-ledger.json', 'path': a['id'], 'ok': ok, 'bytes': p.stat().st_size if p.exists() else None})
    m7 = [r for r in ledger['requests'] if r['id'] == 'M7'][0]
    checks.append({'check': 'cache metadata M7 sha256 equal to acquisition-ledger.json#/requests[M7]', 'path': Path(m7['dest']).name,
                   'ok': m7['dest'].startswith(str(CACHE) + '/metadata/') and sha(m7['dest']) == m7['sha256']})
    ver = lambda argv: subprocess.run(argv, capture_output=True, text=True).stdout.strip().splitlines()[0]
    doc = {'kind': 'PREFLIGHT_DP2', 'at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'loadavg': [round(x, 2) for x in os.getloadavg()],
           'candidate_head': subprocess.run(['git', '-C', str(REPO), 'rev-parse', 'HEAD'], capture_output=True, text=True).stdout.strip(),
           'python': ver(['/usr/bin/python3.12', '--version']), 'bwrap': ver(['/usr/bin/bwrap', '--version']),
           'systemd_run': ver(['/usr/bin/systemd-run', '--version']), 'postgres': 'não usado', 'tcp_ports': 'nenhuma',
           'mnt_ia': 'não tocado', 'network': 'nenhuma (bwrap --unshare-all)', 'cache_written': False,
           'result': 'PASS' if all(c['ok'] for c in checks) else 'FAIL', 'checks': checks}
    (U / 'preflight.json').write_text(json.dumps(doc, ensure_ascii=False, indent=2) + '\n')
    print(doc['result'], sum(1 for c in checks if c['ok']), '/', len(checks), [c for c in checks if not c['ok']])
    return 0 if doc['result'] == 'PASS' else 1


if __name__ == '__main__':
    sys.exit(main(sys.argv[1]))
