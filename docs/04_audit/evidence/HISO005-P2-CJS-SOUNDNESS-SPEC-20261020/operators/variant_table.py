"""Uniform comparison of every engine of one probe run against v5, by fixture group: status counts, PROVEN kept or lost,
violations kept or lost, v5 tuples dropped, new PROVEN. Writes variant-table-<run>.json. usage: variant_table.py <run>"""
import json, sys
from collections import Counter
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

run = sys.argv[1]
P = load('probe-' + run + '.json')
FX = {f['id']: f for f in load('fixtures.json')['fixtures'] if f['id'] in P['results']}
labels = [l for l in P['engines'] if l != 'v5']
out = {'task': TASK, 'observedAt': now(), 'run': 'probe-' + run + '.json', 'fixtures': len(FX), 'groups': dict(Counter(f['group'] for f in FX.values())),
       'engines': P['engines'], 'variants': {}}
for lab in labels:
    row = {'statusByGroup': {}, 'groupA_closed': [], 'groupA_open': [], 'provenLost': {}, 'provenKept': [], 'newProven': [],
           'violationsLost': [], 'violationsKept': [], 'v5TuplesDropped': [], 'expectationMismatch': []}
    for fid, f in FX.items():
        a, b = P['results'][fid]['v5'], P['results'][fid][lab]
        g = f['group']
        row['statusByGroup'].setdefault(g, Counter())[b['status']] += 1
        if g == 'A': (row['groupA_closed'] if b['status'] != 'PROVEN' else row['groupA_open']).append(fid)
        if a['status'] == 'PROVEN' and b['status'] != 'PROVEN': row['provenLost'].setdefault(g, []).append(fid)
        if a['status'] == 'PROVEN' and b['status'] == 'PROVEN': row['provenKept'].append(fid)
        if a['status'] != 'PROVEN' and b['status'] == 'PROVEN': row['newProven'].append(fid)
        if len(b['violations']) < len(a['violations']): row['violationsLost'].append(fid)
        elif a['violations']: row['violationsKept'].append(fid)
        if Counter(map(tuple, a['unknowns'])) - Counter(map(tuple, b['unknowns'])): row['v5TuplesDropped'].append(fid)
        exp = f['expectV6']
        if lab == 'v6t3' and not (b['status'] == exp or (exp == 'VIOLATION_OR_UNKNOWN' and b['status'] in ('VIOLATION', 'UNKNOWN'))):
            row['expectationMismatch'].append([fid, exp, b['status']])
    row['statusByGroup'] = {k: dict(v) for k, v in sorted(row['statusByGroup'].items())}
    out['variants'][lab] = row
save('variant-table-' + run + '.json', out)
for lab, row in out['variants'].items():
    print(lab, 'A closed', len(row['groupA_closed']), 'open', row['groupA_open'], '| lost', {k: len(v) for k, v in row['provenLost'].items()},
          '| newProven', row['newProven'], '| violLost', row['violationsLost'], '| dropped', len(row['v5TuplesDropped']), '| mism', row['expectationMismatch'])
