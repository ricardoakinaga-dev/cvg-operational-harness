"""Summary of the final fixture run (probe-<run>.json: v5 and the proposal <label>) plus the exploratory variants
(probe-r1: v6a/v6b, probe-r2s: v6s). Checks the expectation of fixtures.json and the inclusion of the v5 tuples.
usage: fixture_summary.py <run> <label>   (final run: final2 v6t2; first run of the proposal T: final v6t)"""
import json, sys
from collections import Counter
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

RUN, LAB = sys.argv[1], sys.argv[2]
FX = {f['id']: f for f in load('fixtures.json')['fixtures']}
fin = load('probe-' + RUN + '.json')['results']
FX = {k: v for k, v in FX.items() if k in fin}
r1 = load('probe-r1.json')['results']
r2 = load('probe-r2s.json')['results']
rows, groups = [], Counter()
for fid, f in FX.items():
    v5, v6 = fin[fid]['v5'], fin[fid][LAB]
    t5 = Counter(tuple(u) for u in v5['unknowns']); t6 = Counter(tuple(u) for u in v6['unknowns'])
    expect = f['expectV6']
    ok = v6['status'] == expect or (expect == 'VIOLATION_OR_UNKNOWN' and v6['status'] in ('VIOLATION', 'UNKNOWN'))
    rows.append({'id': fid, 'group': f['group'], 'v5': v5['status'], 'proposal': v6['status'], 'expectV6': expect, 'meetsExpectation': ok,
                 'proposalNewRoots': sorted({u[2] for u in v6['unknowns'] if u[0] == 'UNKNOWN_CJS_EXPORTS'}),
                 'v5TuplesKept': not (t5 - t6), 'v5TuplesDropped': [list(x) for x in (t5 - t6)],
                 'violationsV5': len(v5['violations']), 'violationsProposal': len(v6['violations']),
                 'proofsProposal': len(v6['proofs']), 'validationProposal': v6['validation'],
                 'exploratory': {'v6a': (r1.get(fid) or {}).get('v6a', {}).get('status'), 'v6b': (r1.get(fid) or {}).get('v6b', {}).get('status'),
                                 'v6s': (r2.get(fid) or {}).get('v6s', {}).get('status')},
                 'why': f['why']})
    groups[f['group']] += 1
falseProven = [r['id'] for r in rows if r['group'] == 'A' and r['v5'] == 'PROVEN']
out = {'task': TASK, 'observedAt': now(), 'run': 'probe-' + RUN + '.json', 'proposalLabel': LAB, 'engines': load('probe-' + RUN + '.json')['engines'], 'count': len(rows), 'groups': dict(groups),
       'falseProvenInV5': falseProven, 'falseProvenClosedByProposal': [i for i in falseProven if fin[i][LAB]['status'] != 'PROVEN'],
       'allMeetExpectation': all(r['meetsExpectation'] for r in rows),
       'v5TuplesDroppedIn': [r['id'] for r in rows if not r['v5TuplesKept']],
       'violationsLostIn': [r['id'] for r in rows if r['violationsProposal'] < r['violationsV5']],
       'provenKept': [r['id'] for r in rows if r['v5'] == 'PROVEN' and r['proposal'] == 'PROVEN'],
       'newProven': [r['id'] for r in rows if r['v5'] != 'PROVEN' and r['proposal'] == 'PROVEN'],
       'provenLostSound': [r['id'] for r in rows if r['group'] == 'D'],
       'rows': rows}
save('fixture-summary.json' if RUN == 'final3' else 'fixture-summary-' + RUN + '.json', out)
print(json.dumps({k: v for k, v in out.items() if k not in ('rows', 'engines')}, indent=1, ensure_ascii=False))
for r in rows:
    if r['v5TuplesDropped']: print(r['id'], r['v5TuplesDropped'])
