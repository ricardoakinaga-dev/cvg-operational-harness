"""Runs the frozen new test (bytes of the freeze round) against the base v6 and each mutant copy (red_on_previous.py),
then summarises: the base must fail (first red on the frozen bytes) and every mutant must die (at least one failure),
with the tests that kill it. usage: mutants_run.py <round> <mutant-copy>..."""
import json, subprocess, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

rnd, copies = sys.argv[1], sys.argv[2:]
fz = load('source-freeze-' + rnd + '.json')
test = 'tests/b6-0247-cjs-export-value.test.js'
tsha = next(f['sha256'] for f in fz['files'] if f['path'] == test)
assert sha(CANDIDATE / test) == tsha
DOC = {'mc0': 'mutant_c0.py', 'mc0r': 'mutant_c0r.py', 'mc1': 'mutant_c1.py', 'mc1s': 'mutant_c1s.py', 'mc2': 'mutant_c2.py', 'mc3': 'mutant_c3.py'}
rows = []
for c in ['v6', *copies]:
    label = 'red-0247-' + rnd + '-on-' + c
    if not (EV / (label + '.json')).exists():
        p = subprocess.run(['/usr/bin/python3', '-I', '-B', str(OPS / 'red_on_previous.py'), label, c, test], cwd=str(OPS), capture_output=True, text=True)
        assert (EV / (label + '.json')).exists(), p.stderr[-1500:]
    r = load(label + '.json')
    failed = [x['title'] for x in r['results'] if x['status'] != 'passed']
    t = load('tools-' + c + '.json')
    rows.append({'copy': c, 'patch': [x['patch'] for x in t['patches']], 'engineSha256': t['scripts']['scripts/boundary-semantic-engine.mjs'],
                 'testSha256': r['tests'][test], 'total': r['summary']['numTotalTests'], 'failed': r['summary']['numFailedTests'],
                 'killed': r['summary']['numFailedTests'] > 0, 'killingTests': failed[:40], 'record': label + '.json'})
out = {'task': TASK, 'observedAt': now(), 'round': rnd, 'test': test, 'testSha256': tsha, 'rows': rows,
       'allMutantsKilled': all(r['killed'] for r in rows if r['copy'] != 'v6'), 'baseFails': rows[0]['killed']}
save('mutants-' + rnd + '.json', out)
for r in rows: print(r['copy'], r['failed'], '/', r['total'], r['killingTests'][:4])
print('allMutantsKilled', out['allMutantsKilled'], 'baseFails', out['baseFails'])
