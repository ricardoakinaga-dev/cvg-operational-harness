"""DIAGNOSTIC ONLY (never official): B6 checker with OFFICIAL caps over the BUILD0241 root, fed with the
installed/compiled references built WITH docs/04_audit/evidence excluded (q2_patch.py copies); compares the
diagnostics with the sealed T2 v4r2 measurement (references built over the full tree).

usage: q2_measure.py
"""
import gzip, json, os, subprocess, sys, time
from collections import Counter
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

while os.getloadavg()[0] > 12:
    time.sleep(30)
inst = load('installed-recipe-excl.json')['installedReference']
comp = load('compiled-recipe-excl.json')['compiledReference']
work = RUNTIME / 'pipeline-q2-excl'
work.mkdir(exist_ok=True)
env = dict(minimal_env(work), CVG_DIAG_LIMITS='{}')  # official caps, unchanged
tools = RUNTIME / 'tools-q2chk/scripts'
T2 = PROJECT / 'docs/04_audit/evidence/HISO005-P2-REFERENCE-RECIPE-T2-20261019'


def norm(report):
    s = report['semanticBoundary']
    diags = Counter(json.dumps(d, sort_keys=True) for d in report['diagnostics'])
    tuples = Counter(json.dumps([u.get('file') or '', u['reason'], u.get('detail') or ''], sort_keys=True) for u in s['unknowns'])
    return diags, tuples, s


runs = []
for mode in ['normal', 'strict']:
    argv = [NODE, str(tools / 'check-product-boundary.mjs'), str(BUILD0241), '--graph=' + str(work / (mode + '-graph.json')),
            '--installed-reference=' + inst['manifestPath'], '--installed-reference-sha256=' + inst['expectedSha256'], '--semantic',
            '--compiled-build-reference=' + comp['manifestPath'], '--compiled-build-reference-sha256=' + comp['expectedSha256']] + (['--strict'] if mode == 'strict' else [])
    t = time.time()
    p = subprocess.run(argv, cwd=BUILD0241, env=env, capture_output=True, timeout=3600)
    wall = round(time.time() - t, 1)
    r = json.loads(p.stdout)
    (work / (mode + '-report.json.gz')).write_bytes(gzip.compress(p.stdout, mtime=0))
    ref = json.loads(gzip.decompress((T2 / ('real-v4r2-' + mode + '-report.json.gz')).read_bytes()))
    d1, t1, s1 = norm(r)
    d0, t0, s0 = norm(ref)
    runs.append({'mode': mode, 'exitCode': p.returncode, 'wallSeconds': wall, 'telemetry': r.get('semanticTelemetry'),
                 'diagnostics': {'excl': sum(d1.values()), 't2': sum(d0.values())},
                 'diagnosticsMultisetEqual': d1 == d0, 'diagnosticsOnlyInExcl': sorted((d1 - d0).elements())[:5],
                 'diagnosticsOnlyInT2': sorted((d0 - d1).elements())[:5],
                 'unknownTuplesEqual': t1 == t0, 'status': [s1['status'], s0['status']],
                 'phases': [s1.get('phases'), s0.get('phases')], 'bodyCoverage': [s1.get('bodyCoverage'), s0.get('bodyCoverage')],
                 'violations': [len(s1['violations']) + len(r['violations']), len(s0['violations']) + len(ref['violations'])],
                 'proofs': [len(s1['proofs']), len(s0['proofs'])]})
rec = {'task': TASK, 'label': 'q2-excl', 'diagnosticOnly': True, 'notAcceptanceNotOfficial': True, 'limits': 'official (CVG_DIAG_LIMITS={})',
       'observedAt': now(), 'installedReference': inst, 'compiledReference': comp, 'comparedWith': '../HISO005-P2-REFERENCE-RECIPE-T2-20261019/real-v4r2-{normal,strict}-report.json.gz',
       'runs': runs}
save('q2-measure-excl-vs-t2.json', rec)
print(json.dumps(rec, indent=1)[:4000])
