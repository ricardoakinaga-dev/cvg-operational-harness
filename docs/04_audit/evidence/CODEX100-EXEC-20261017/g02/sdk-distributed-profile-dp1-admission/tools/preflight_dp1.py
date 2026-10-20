"""Preflight of DX100-G02:IMPLEMENT-AND-ADMIT-SDK-DISTRIBUTED-PROFILE-DP-1 (read-only; no service, no network).

Usage: python3 -I -B tools/preflight_dp1.py <main-checkout-root>   (cwd = unit folder) -> preflight.json
Checks: the byte copies of inputs/ equal the folders of the main checkout (spec, acquisition, user decision); the spec copies equal
next-task.json#/spec; the spec unit is closed as COMPLETED_LOCAL_WITH_CARRIED_P2 with the R2-F01 erratum mandatory; the Lead
confirmation (Q4 reading, Q3 cover, contingent questions not pursued); the cache archives equal the ledger; the code admitted most
recently (C3-1 tslane/node in this candidate at 76c047257) is the base of the derived files; host identity.
"""
import hashlib
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

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
diff = [str(a.relative_to(UNIT)) for a, b in pairs if not b.is_file() or sha(a) != sha(b)]
check('inputs are byte copies of the main checkout folders (spec, acquisition, user decision)', not diff, {'files': len(pairs), 'differ': diff})
nt = json.loads((UNIT / 'inputs' / 'spec-dp' / 'next-task.json').read_text())
bound = {Path(v['path']).name: v['sha256'] for v in nt['spec'].values() if v['path'].split('/')[-2] == 'sdk-distributed-profile-spec'}
bad = [n for n, s in bound.items() if (UNIT / 'inputs' / 'spec-dp' / n).is_file() and sha(UNIT / 'inputs' / 'spec-dp' / n) != s]
check('spec copies equal next-task.json#/spec', not bad and all((UNIT / 'inputs' / 'spec-dp' / n).is_file() for n in bound if n != 'cases-dp-2.json' and n != 'execution-budget-dp-2.json'), bad)
acq = {Path(v['path']).name: v['sha256'] for v in nt['spec'].values() if v['path'].split('/')[-2] == 'sdk-distributed-acquisition'}
check('acquisition copies equal next-task.json#/spec', all(sha(UNIT / 'inputs' / 'acquisition' / n) == s for n, s in acq.items()), acq)
st = json.loads((UNIT / 'inputs' / 'spec-dp' / 'state.json').read_text())
disp = json.loads((UNIT / 'inputs' / 'spec-dp' / 'review-r2' / 'executor-disposition.json').read_text())
check('spec unit closed COMPLETED_LOCAL_WITH_CARRIED_P2; R2-F01 mandatory for the IMPLEMENT', st['status'] == 'COMPLETED_LOCAL_WITH_CARRIED_P2'
      and [i['disposition'] for i in disp['items'] if i['id'] == 'R2-F01'] == ['CARRIED_TO_IMPLEMENT_MANDATORY'] and nt['task'].startswith('DX100-G02:IMPLEMENT-AND-ADMIT-SDK-DISTRIBUTED-PROFILE-DP-1'))
lc = json.loads((UNIT / 'inputs' / 'spec-dp' / 'lead-confirmation-20261019.json').read_text())
check('Lead confirmation: Q4 reading confirmed, DP-REAL01 and DP-PY02P within Q3, contingent questions not pursued',
      [i['decision'] for i in lc['items']] == ['CONFIRMED', 'WITHIN_Q3', 'NOT_PURSUED_NOW'])
dec = json.loads((UNIT / 'inputs' / 'user-decision-distributed-profile-20261019.json').read_text())
check('user decision Q1-Q4', {x['id']: x['decision'] for x in dec['decisions']} == {'Q1-PIN': 'ADOPT_RELEASE_0.153.4_AS_SEPARATE_PIN', 'Q2-ACQUISITION': 'AUTHORIZE_SINGLE_ACQUISITION_CODEX_LIST_ONLY',
                                                                                 'Q3-KEYLESS': 'ACCEPT_KEYLESS_ONLY', 'Q4-CAPABILITY': 'DENY_NEW_CAPABILITY'})
led = json.loads((UNIT / 'inputs' / 'acquisition' / 'acquisition-ledger.json').read_text())
arts = {a['id']: a for a in led['artifacts'] if a.get('result') == 'DIGEST_OK'}
check('cache archives of the DP-1 layout (A2, A3, A4, A7) equal the ledger', all(sha(arts[a]['stored']) == arts[a]['observed']['sha256'] for a in ('A2', 'A3', 'A4', 'A7')))
base = {'tslane/observer.py': '../sdk-continuation-3-1-admission/tslane/observer.py', 'tslane/bootstrap.py': '../sdk-continuation-3-1-admission/tslane/bootstrap.py',
        'node/channel.cjs': '../sdk-continuation-3-1-admission/node/channel.cjs'}
head = subprocess.run(['git', '-C', str(UNIT), 'rev-parse', 'HEAD'], capture_output=True, text=True).stdout.strip()
tracked = {k: subprocess.run(['git', '-C', str(UNIT), 'ls-files', '--error-unmatch', str((UNIT / v).resolve())], capture_output=True).returncode == 0 for k, v in base.items()}
check('derived files come from the C3-1 code committed in this candidate', all(tracked.values()) and head.startswith('76c047257'), {'head': head, 'tracked': tracked})
check('dplane/bootstrap.py is a byte copy of the admitted bootstrap', sha(UNIT / 'dplane' / 'bootstrap.py') == sha(UNIT / base['tslane/bootstrap.py']))
host = {'node': ('/home/ricardo/.nvm/versions/node/v24.20.0/bin/node', '89af8424dd53e560b1933f87ba650d8bf57c83ca5a04600eefb31f416aabbae7'),
        'python': ('/usr/bin/python3.12', 'e50d468e8b0adfb05733f5b87b3cff34829c4a8c1aea50c865aa8bdfe4bb150f'),
        'bwrap': ('/usr/bin/bwrap', 'e318903862396f96de3df57264e0158682b952fd3fb53ac23d876413e7b30f71')}
check('host identity (node v24.20.0, python 3.12, bwrap)', all(sha(p) == s for p, s in host.values()))
ok = all(c['ok'] for c in checks)
doc = {'kind': 'PREFLIGHT_DP1', 'task': 'DX100-G02:IMPLEMENT-AND-ADMIT-SDK-DISTRIBUTED-PROFILE-DP-1', 'result': 'PASS' if ok else 'FAIL', 'checks': checks,
       'network': False, 'checked_at': datetime.now(timezone.utc).isoformat()}
(UNIT / 'preflight.json').write_text(json.dumps(doc, ensure_ascii=False, indent=2) + '\n')
print(doc['result'], sum(c['ok'] for c in checks), '/', len(checks))
for c in checks:
    if not c['ok']:
        print('FAIL', c['check'], json.dumps(c['detail'])[:400])
sys.exit(0 if ok else 1)
