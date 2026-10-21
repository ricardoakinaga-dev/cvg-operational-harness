"""Agrega as tentativas do certify (certify-<attempt>-summary.json) em certify-summary.json; a final é a última.
usage: python3 -B certify_aggregate.py <attempt>..."""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

attempts = sys.argv[1:]
rows = [load('certify-' + a + '-summary.json') for a in attempts]
final = rows[-1]
out = {'task': TASK, 'observedAt': now(), 'commit': final['commit'], 'finalAttempt': attempts[-1],
       'gates': final['gates'], 'allPass': final['allPass'], 'decision': final['decision'], 'certification': final['certification'],
       'unit': final['unit'], 'exitCode': final['exitCode'], 'elapsedSeconds': final['elapsedSeconds'],
       'attempts': [{'attempt': a, 'summary': 'certify-' + a + '-summary.json', 'exitCode': r['exitCode'], 'allPass': r['allPass'],
                     'decision': r['decision'], 'unit': r['unit'], 'failedGates': [g['gate'] for g in r['gateResults'] if g['result'] != 'PASS'],
                     'failedTests': [f['file'] + ' > ' + f['test'] for f in r['failedTests']]} for a, r in zip(attempts, rows)],
       'retryReason': 'certify-r1-analysis.json' if len(attempts) > 1 else None}
save('certify-summary.json', out)
print(json.dumps({k: out[k] for k in ('finalAttempt', 'gates', 'allPass', 'decision', 'certification', 'unit')}), [(a['attempt'], a['allPass']) for a in out['attempts']])
