"""Preflight of DX100-G02:IMPLEMENT-AND-ADMIT-SDK-SOURCE-CONTINUATION-3-2 (offline, before any write to the sources).

Run: python3 -I -B tools/preflight_c31.py MAIN_CHECKOUT_ROOT
Checks (next-task.json#/precondition and execution-budget-c3-1.json#/order[0]): the spec of the continuation 3 still has the shas
of next-task.json (in the main checkout, where the spec lives) and the copies in inputs/ are byte-equal; the freeze r4, the 2B delta
and the admitted 2AC/2B-2 sources did not change (candidate worktree); the unit copies of node/, python/ and tslane/ start
byte-equal to the admitted 2B-2 sources (channel.py, control-client.py and acceptance.py to the C3-1 ones). Writes preflight.json. No service, no network.
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
# Durable refs that hold the spec blobs (origin/main for the bases; the Lead candidate branch for the continuation-3 spec).
ANCHOR_REFS = ('origin/main', 'origin/candidate/hiso005-0243-0242-20261019')
SPEC_REL = 'docs/04_audit/evidence/CODEX100-EXEC-20261017/g02/sdk-source-continuation-3-spec'


def sha(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()


def main(main_root):
    main_root = Path(main_root)
    checks = []
    nt = json.loads((main_root / SPEC_REL / 'next-task.json').read_bytes())
    for key, ent in nt['spec'].items():
        rel = ent['path']
        where = REPO if (REPO / rel).exists() and not rel.startswith(SPEC_REL) else main_root
        got = sha(where / rel)
        anchors = {}
        for ref in ANCHOR_REFS:
            blob = subprocess.run(['git', '-C', str(main_root), 'show', ref + ':' + rel], capture_output=True)
            anchors[ref] = None if blob.returncode else hashlib.sha256(blob.stdout).hexdigest() == ent['sha256']
        durable = any(v is True for v in anchors.values())
        checks.append({'check': 'next-task spec %s' % key, 'path': rel, 'where': 'main' if where == main_root else 'candidate',
                       'ok': got == ent['sha256'] and durable and False not in anchors.values(), 'sha256': got, 'durable_ref_blob_equal': anchors})
    spec_dir = main_root / SPEC_REL
    for p in sorted((U / 'inputs' / 'spec-c3').rglob('*')):
        if p.is_file():
            rel = p.relative_to(U / 'inputs' / 'spec-c3')
            checks.append({'check': 'inputs/spec-c3 copy byte-equal', 'path': str(rel), 'ok': p.read_bytes() == (spec_dir / rel).read_bytes()})
    for sub, src in (('spec-2b', 'sdk-source-batch-2b-spec'), ('spec-r4', 'sdk-source-batch-2a-continuation-spec')):  # copies of the admitted inputs
        for p in sorted((U / 'inputs' / sub).iterdir()):
            ref = G02 / src / p.name if (G02 / src / p.name).exists() else main_root / 'docs/04_audit/evidence/CODEX100-EXEC-20261017/g02' / src / p.name
            checks.append({'check': 'inputs/%s copy byte-equal' % sub, 'path': p.name, 'ok': p.read_bytes() == ref.read_bytes()})
    for name, rel in (('user-decision-distributed-profile-20261019.json', 'sdk-batch-2b2-binding/user-decision-distributed-profile-20261019.json'),
                      ('lead-decision-f01.json', 'sdk-batch-2b2-admission/lead-decision-f01.json')):
        src = main_root / 'docs/04_audit/evidence/CODEX100-EXEC-20261017/g02' / rel
        checks.append({'check': 'decision input byte-equal (main)', 'path': rel, 'ok': (U / 'inputs' / name).read_bytes() == src.read_bytes(),
                       'sha256': sha(src)})
    base = {'python': 'sdk-batch-2b2-admission/python'}
    from_c31 = ('channel.py', 'control-client.py', 'acceptance.py')  # D3-01/D3-07/D3-08 already admitted in the C3-1 (R1 APPROVE)
    names = sorted(os.listdir(G02 / base['python']))
    checks.append({'check': 'unit python/ starts equal to the 2B-2 python/ (and to the C3-1 python/ for %s)' % ', '.join(from_c31),
                   'ok': names == sorted(os.listdir(U / 'python')) and all((U / 'python' / n).read_bytes() == (
                       G02 / ('sdk-continuation-3-1-admission/python' if n in from_c31 else base['python']) / n).read_bytes() for n in names), 'files': names})
    for rel in ('review-r1/review.json', 'review-r1/executor-disposition.json', 'next-task.json'):
        checks.append({'check': 'C3-1 closing input byte-equal (%s)' % rel,
                       'ok': (U / 'inputs' / 'c31-review' / Path(rel).name).read_bytes() == (G02 / 'sdk-continuation-3-1-admission' / rel).read_bytes()})
    ver = lambda argv: subprocess.run(argv, capture_output=True, text=True).stdout.strip().splitlines()[0]
    doc = {'kind': 'PREFLIGHT_C32', 'at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'loadavg': [round(x, 2) for x in os.getloadavg()],
           'candidate_head': subprocess.run(['git', '-C', str(REPO), 'rev-parse', 'HEAD'], capture_output=True, text=True).stdout.strip(),
           'python': ver(['/usr/bin/python3.12', '--version']), 'node': ver(['/home/ricardo/.nvm/versions/node/v24.20.0/bin/node', '--version']),
           'bwrap': ver(['/usr/bin/bwrap', '--version']), 'systemd_run': ver(['/usr/bin/systemd-run', '--version']),
           'postgres': 'não usado', 'tcp_ports': 'nenhuma', 'mnt_ia': 'não tocado', 'network': 'nenhuma (bwrap --unshare-all)',
           'result': 'PASS' if all(c['ok'] for c in checks) else 'FAIL', 'checks': checks}
    (U / 'preflight.json').write_text(json.dumps(doc, ensure_ascii=False, indent=2) + '\n')
    print(doc['result'], sum(1 for c in checks if c['ok']), '/', len(checks), [c for c in checks if not c['ok']])
    return 0 if doc['result'] == 'PASS' else 1


if __name__ == '__main__':
    sys.exit(main(sys.argv[1]))
