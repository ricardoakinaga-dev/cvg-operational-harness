"""DIAGNOSTIC ONLY: full official pipeline (checker -> census + worker analysis + worker recomputation + parent
revalidation) through the private engine copy with experimental caps, normal and strict. Never official.

usage: pipeline.py <label> '<limits-json>'
"""
import gzip, json, os, subprocess, sys, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

label, limits = sys.argv[1], json.loads(sys.argv[2])
while os.getloadavg()[0] > 12:
    time.sleep(30)
inst = load('installed-recipe-ref.json')['installedReference']
comp = load('compiled-recipe-ref.json')['compiledReference']
work = RUNTIME / ('pipeline-' + label)
work.mkdir(exist_ok=True)
env = dict(minimal_env(work), CVG_DIAG_LIMITS=json.dumps(limits))
tools = RUNTIME / 'tools-diag/scripts'
runs, payloads = [], []
for mode in ['normal', 'strict']:
    argv = [NODE, str(tools / 'check-product-boundary.mjs'), str(BUILD0241), '--graph=' + str(work / (mode + '-graph.json')),
            '--installed-reference=' + inst['manifestPath'], '--installed-reference-sha256=' + inst['expectedSha256'], '--semantic',
            '--compiled-build-reference=' + comp['manifestPath'], '--compiled-build-reference-sha256=' + comp['expectedSha256']] + (['--strict'] if mode == 'strict' else [])
    t = time.time(); load0 = os.getloadavg()[0]
    p = subprocess.run(argv, cwd=BUILD0241, env=env, capture_output=True, timeout=3600)
    wall = round(time.time() - t, 1)
    r = json.loads(p.stdout)
    s = r['semanticBoundary']
    body = dict(r); body.pop('semanticTelemetry', None)
    payloads.append(json.dumps(body, sort_keys=True))
    reasons = {}
    for u in s['unknowns']:
        reasons[u['reason']] = reasons.get(u['reason'], 0) + 1
    runs.append({'mode': mode, 'exitCode': p.returncode, 'wallSeconds': wall, 'loadAvgAtStart': round(load0, 2), 'telemetry': r.get('semanticTelemetry'),
                 'diagnostics': len(r['diagnostics']), 'occurrences': {k: s['occurrences'][k] for k in ('baseline', 'resolved', 'new')},
                 'status': s['status'], 'phases': s.get('phases'), 'bodyCoverage': s.get('bodyCoverage'), 'proofs': len(s['proofs']),
                 'violations': len(s['violations']) + len(r['violations']), 'unknownReasons': reasons, 'reportBytes': len(p.stdout),
                 'envelope': s.get('phases') is None})
    (work / (mode + '-report.json.gz')).write_bytes(gzip.compress(p.stdout, mtime=0))
rec = {'task': TASK, 'label': label, 'diagnosticOnly': True, 'notAcceptanceNotOfficial': True, 'limits': limits, 'observedAt': now(),
       'runs': runs, 'normalStrictPayloadEqualExcludingTelemetry': payloads[0] == payloads[1]}
save('pipeline-' + label + '.json', rec)
print(json.dumps({'label': label, 'equal': rec['normalStrictPayloadEqualExcludingTelemetry'], 'runs': [{k: x[k] for k in ('mode', 'wallSeconds', 'telemetry', 'diagnostics', 'phases', 'bodyCoverage', 'proofs', 'violations', 'envelope', 'reportBytes')} for x in runs]}, indent=1))
