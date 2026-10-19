"""DIAGNOSTIC ONLY (never official): normal-mode checker runs from tools-probe (identity_probe_patch.py) to time
the installed-identity comparator lifetime against the semantic phase.

usage: identity_probe.py
"""
import gzip, json, os, re, subprocess, sys, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

inst = load('installed-recipe-ref.json')['installedReference']
comp = load('compiled-recipe-ref.json')['compiledReference']
tools = RUNTIME / 'tools-probe/scripts'
CASES = [
    ('P1-official', {}, None),
    ('P2-caps256-250k', {'maxContexts': 256, 'maxStates': 250000}, None),
    ('P3-caps256-250k-240s-cmp300s', {'maxContexts': 256, 'maxStates': 250000, 'timeoutMs': 240000}, 300000),
]
runs = []
for label, limits, cmp in CASES:
    while os.getloadavg()[0] > 12:
        time.sleep(30)
    work = RUNTIME / ('probe-' + label)
    work.mkdir(exist_ok=True)
    env = dict(minimal_env(work), CVG_DIAG_LIMITS=json.dumps(limits))
    if cmp:
        env['CVG_DIAG_COMPARATOR_TIMEOUT_MS'] = str(cmp)
    argv = [NODE, str(tools / 'check-product-boundary.mjs'), str(BUILD0241), '--graph=' + str(work / 'graph.json'),
            '--installed-reference=' + inst['manifestPath'], '--installed-reference-sha256=' + inst['expectedSha256'], '--semantic',
            '--compiled-build-reference=' + comp['manifestPath'], '--compiled-build-reference-sha256=' + comp['expectedSha256']]
    t = time.time(); l0 = os.getloadavg()[0]
    p = subprocess.run(argv, cwd=BUILD0241, env=env, capture_output=True, timeout=3600)
    wall = round(time.time() - t, 1)
    lines = [l for l in p.stderr.decode('utf8', 'replace').splitlines() if l.startswith('CVG_DIAG_IDENTITY')]
    marks = {}
    for l in lines:
        m = re.search(r't=(\d+)$', l)
        key = l.split()[1]
        body = l[len('CVG_DIAG_IDENTITY ' + key + ' '):].rsplit(' t=', 1)[0]
        marks[key] = {'t': int(m.group(1)), 'result': json.loads(body) if body.startswith('{') else None}
    r = json.loads(p.stdout)
    (work / 'report.json.gz').write_bytes(gzip.compress(p.stdout, mtime=0))
    s = r['semanticBoundary']
    env_tuples = [u for u in s['unknowns'] if u['reason'] in ('UNKNOWN_INSTALLED_REFERENCE', 'UNKNOWN_INPUT_REVALIDATION', 'UNKNOWN_HOST_VALIDATION') or u['reason'] == 'UNKNOWN_ANALYSIS_LIMIT']
    c0 = marks.get('verifierCreated', {}).get('t')
    runs.append({'label': label, 'limitsOverride': limits, 'comparatorDeadlineOverrideMs': cmp, 'loadAvgAtStart': round(l0, 2), 'wallSeconds': wall,
                 'exitCode': p.returncode, 'semanticTelemetry': r.get('semanticTelemetry'),
                 'verifierAgeAtFirstFinalizeMs': marks['first']['t'] - c0 if c0 is not None and 'first' in marks else None,
                 'verifierAgeAtFinalFinalizeMs': marks['final']['t'] - c0 if c0 is not None and 'final' in marks else None,
                 'firstFinalize': marks.get('first', {}).get('result'), 'finalFinalize': marks.get('final', {}).get('result'),
                 'validation': s.get('validation'), 'phases': s.get('phases'), 'bodyCoverage': s.get('bodyCoverage'),
                 'envelopeTuples': env_tuples, 'diagnostics': len(r['diagnostics']), 'proofs': len(s['proofs']),
                 'violations': len(s['violations']) + len(r['violations'])})
    print(json.dumps(runs[-1])[:1500], flush=True)
save('identity-deadline-probe.json', {'task': TASK, 'diagnosticOnly': True, 'notAcceptanceNotOfficial': True, 'observedAt': now(),
                                      'comparisonTimeoutMs': 120000, 'semanticTimeoutMs': 120000, 'runs': runs})
