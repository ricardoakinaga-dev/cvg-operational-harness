"""Preflight of DX100-G02:IMPLEMENT-AND-ADMIT-SDK-DISTRIBUTED-PROFILE-DP-1R (read-only; no service, no network).

Usage: python3 -I -B tools/preflight_dp1r.py <main-checkout-root>   (cwd = unit folder) -> preflight.json
Checks: the byte copies of inputs/ equal the folders of the main checkout (spec, acquisition, user decision, DP-1 and DP-2 records,
the two Lead decisions); the spec copies equal next-task.json#/spec; the Lead decisions (DV1-DV4 accepted, PK07 as a new case in the
DP-1R after the DP-2; DP-2 deviations accepted with the order DP-1R then BIND); the DP-1 adjudication of DP-PK07A; the premise of
the erratum (the A4 package.json member, read from the cache by sha, declares "type": "module"); the cache archives of the layout
equal the ledger; the candidate base c9b9650bf with the admitted DP-1 code tracked; observer and bootstrap byte copies; host identity.
"""
import hashlib
import importlib.util
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.dont_write_bytecode = True
UNIT = Path(__file__).resolve().parent.parent
G02 = UNIT.parent
MAIN = Path(sys.argv[1]) / 'docs' / '04_audit' / 'evidence' / 'CODEX100-EXEC-20261017' / 'g02'
checks = []


def sha(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()


def check(name, ok, detail=None):
    checks.append({'check': name, 'ok': bool(ok), 'detail': detail})


pairs = []
for p in sorted((UNIT / 'inputs' / 'spec-dp').rglob('*')):
    if p.is_file():
        pairs.append((p, MAIN / 'sdk-distributed-profile-spec' / p.relative_to(UNIT / 'inputs' / 'spec-dp')))
for p in sorted((UNIT / 'inputs' / 'acquisition').glob('*.json')):
    pairs.append((p, MAIN / 'sdk-distributed-acquisition' / p.name))
pairs.append((UNIT / 'inputs' / 'user-decision-distributed-profile-20261019.json', MAIN / 'sdk-batch-2b2-binding' / 'user-decision-distributed-profile-20261019.json'))
for p in sorted((UNIT / 'inputs' / 'dp1').rglob('*')):
    if p.is_file():
        rel = p.relative_to(UNIT / 'inputs' / 'dp1')
        src = MAIN / 'sdk-distributed-profile-dp1-admission' / (('cases/DP-PK07A-5f2fe0c80c5c/' + rel.name) if rel.parts[0] == 'pk07a' else str(rel))
        pairs.append((p, src))
for p in sorted((UNIT / 'inputs' / 'dp2').glob('*.json')):
    pairs.append((p, MAIN / 'sdk-distributed-profile-dp2-admission' / p.name))
diff = [str(a.relative_to(UNIT)) for a, b in pairs if not b.is_file() or sha(a) != sha(b)]
check('inputs are byte copies of the main checkout folders (spec, acquisition, user decision, DP-1, DP-2, Lead decisions)', not diff, {'files': len(pairs), 'differ': diff})
nt = json.loads((UNIT / 'inputs' / 'spec-dp' / 'next-task.json').read_text())
bound = {Path(v['path']).name: v['sha256'] for v in nt['spec'].values() if v['path'].split('/')[-2] == 'sdk-distributed-profile-spec'}
present = [n for n in bound if (UNIT / 'inputs' / 'spec-dp' / n).is_file()]
bad = [n for n in present if sha(UNIT / 'inputs' / 'spec-dp' / n) != bound[n]]
check('spec copies equal next-task.json#/spec', not bad and 'cases-dp-1.json' in present, {'present': present, 'differ': bad})
acq = {Path(v['path']).name: v['sha256'] for v in nt['spec'].values() if v['path'].split('/')[-2] == 'sdk-distributed-acquisition'}
check('acquisition copies equal next-task.json#/spec', all(sha(UNIT / 'inputs' / 'acquisition' / n) == s for n, s in acq.items()), acq)
ld = json.loads((UNIT / 'inputs' / 'dp1' / 'lead-decision-dv1-dv4.json').read_text())
check('Lead decision of the DP-1: DV1-DV4 ACCEPTED; PK07 as a new case in a DP-1R after the DP-2, no retry',
      {k: v['decision'] for k, v in ld['deviations'].items()} == {'DV1': 'ACCEPTED', 'DV2': 'ACCEPTED', 'DV3': 'ACCEPTED', 'DV4': 'ACCEPTED'}
      and ld['pk07']['decision'] == 'NEW_CASE_IN_DP1R_AFTER_DP2')
l2 = json.loads((UNIT / 'inputs' / 'dp2' / 'lead-decision-dv-dp2.json').read_text())
n2 = json.loads((UNIT / 'inputs' / 'dp2' / 'next-task.json').read_text())
s2 = json.loads((UNIT / 'inputs' / 'dp2' / 'state.json').read_text())
check('DP-2 closed and its Lead decision orders the DP-1R before the BIND; DP-2 next-task proposes this unit',
      l2['decision'] == 'ACCEPT_DV-DP2-01_TO_07_AS_DECLARED' and any('DP-1R' in x and 'BIND' in x for x in l2['notes'])
      and n2['task'].startswith('DX100-G02:IMPLEMENT-AND-ADMIT-SDK-DISTRIBUTED-PROFILE-DP-1R') and s2['status'].startswith('COMPLETED_LOCAL'),
      {'dp2_status': s2['status']})
adj = json.loads((UNIT / 'inputs' / 'dp1' / 'adjudication-dp1.json').read_text())
pk = json.loads((UNIT / 'inputs' / 'dp1' / 'pk07a' / 'acceptance.json').read_text())
check('DP-1: DP-PK07A INVALID_CAPTURE (rule 4) adjudicated as a fixture defect, ERR_UNKNOWN_FILE_EXTENSION in the win32 steps',
      pk['outcome'] == 'INVALID_CAPTURE' and pk['composition_rule'] == 4 and 'DP-PK07A' in json.dumps(adj)
      and b'ERR_UNKNOWN_FILE_EXTENSION' in (UNIT / 'inputs' / 'dp1' / 'pk07a' / 'blob-stderr-7.txt').read_bytes()
      and b'ERR_UNKNOWN_FILE_EXTENSION' in (UNIT / 'inputs' / 'dp1' / 'pk07a' / 'blob-stderr-8.txt').read_bytes())
spec = importlib.util.spec_from_file_location('pf_stage', UNIT / 'dplane' / 'stage.py')
STG = importlib.util.module_from_spec(spec)
spec.loader.exec_module(STG)
pkg, _ = STG.member_bytes('A4', 'package/package.json')
check('premise of EDP1R-01: the A4 package.json member (cache, sha checked) declares "type": "module"', json.loads(pkg).get('type') == 'module',
      {'member_sha256': hashlib.sha256(pkg).hexdigest()})
led = json.loads((UNIT / 'inputs' / 'acquisition' / 'acquisition-ledger.json').read_text())
arts = {a['id']: a for a in led['artifacts'] if a.get('result') == 'DIGEST_OK'}
check('cache archives of the layout (A2, A3, A4, A7) equal the ledger', all(sha(arts[a]['stored']) == arts[a]['observed']['sha256'] for a in ('A2', 'A3', 'A4', 'A7')))
head = subprocess.run(['git', '-C', str(UNIT), 'rev-parse', 'HEAD'], capture_output=True, text=True).stdout.strip()
base_files = ['dplane/observer.py', 'dplane/bootstrap.py', 'dplane/supervisor.py', 'node/dp-driver.mjs', 'node/dp-synth-child.mjs']
tracked = {f: subprocess.run(['git', '-C', str(UNIT), 'ls-files', '--error-unmatch', str(G02 / 'sdk-distributed-profile-dp1-admission' / f)],
                             capture_output=True).returncode == 0 for f in base_files}
check('candidate at c9b9650bf with the admitted DP-1 code tracked', head.startswith('c9b9650bf') and all(tracked.values()), {'head': head, 'tracked': tracked})
same = {f: sha(UNIT / f) == sha(G02 / 'sdk-distributed-profile-dp1-admission' / f) for f in ('dplane/observer.py', 'dplane/bootstrap.py', 'node/dp-synth-child.mjs',
                                                                                             'node/dp-loader.mjs', 'node/dp-platform-shim.mjs', 'node/dp-control-wrapper.mjs')}
check('observer, bootstrap, loader, shim, synthetic child and control wrapper are byte copies of the admitted DP-1 files', all(same.values()), same)
host = {'node': ('/home/ricardo/.nvm/versions/node/v24.20.0/bin/node', '89af8424dd53e560b1933f87ba650d8bf57c83ca5a04600eefb31f416aabbae7'),
        'python': ('/usr/bin/python3.12', 'e50d468e8b0adfb05733f5b87b3cff34829c4a8c1aea50c865aa8bdfe4bb150f'),
        'bwrap': ('/usr/bin/bwrap', 'e318903862396f96de3df57264e0158682b952fd3fb53ac23d876413e7b30f71')}
check('host identity (node v24.20.0, python 3.12, bwrap)', all(sha(p) == s for p, s in host.values()))
ok = all(c['ok'] for c in checks)
doc = {'kind': 'PREFLIGHT_DP1R', 'task': 'DX100-G02:IMPLEMENT-AND-ADMIT-SDK-DISTRIBUTED-PROFILE-DP-1R', 'result': 'PASS' if ok else 'FAIL', 'checks': checks,
       'network': False, 'checked_at': datetime.now(timezone.utc).isoformat()}
(UNIT / 'preflight.json').write_text(json.dumps(doc, ensure_ascii=False, indent=2) + '\n')
print(doc['result'], sum(c['ok'] for c in checks), '/', len(checks))
for c in checks:
    if not c['ok']:
        print('FAIL', c['check'], json.dumps(c['detail'])[:400])
sys.exit(0 if ok else 1)
