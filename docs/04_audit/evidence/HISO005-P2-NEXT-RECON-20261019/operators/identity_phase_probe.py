"""DIAGNOSTIC ONLY (never official): runs the L3 phase clock (identity_phase_patch.py) with the SPEC0242-draft
values 256 / 250000 / 300 s and the unchanged 120 s comparator budget, normal and strict; records phase durations,
validation, envelope tuples and the conservation against the T2 cut report. usage: identity_phase_probe.py"""
import gzip, json, os, re, subprocess, sys, time
from collections import Counter
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

inst = load('installed-recipe-ref.json')['installedReference']
comp = load('compiled-recipe-ref.json')['compiledReference']
tools = RUNTIME / 'tools-probe/scripts'
limits = {'maxContexts': 256, 'maxStates': 250000, 'timeoutMs': 300000}
heap = subprocess.check_output([NODE, '-e', "console.log(require('v8').getHeapStatistics().heap_size_limit)"], text=True).strip()
runs, payloads = [], []
cut = json.loads(gzip.decompress((PROJECT / 'docs/04_audit/evidence/HISO005-P2-REFERENCE-RECIPE-T2-20261019/real-v4r2-normal-report.json.gz').read_bytes()))
tc = Counter((u.get('file') or '', u['reason'], u.get('detail') or '') for u in cut['semanticBoundary']['unknowns'])
for mode in ['normal', 'strict']:
    while os.getloadavg()[0] > 12:
        time.sleep(30)
    work = RUNTIME / ('probe-P4-phase-' + mode)
    work.mkdir(exist_ok=True)
    env = dict(minimal_env(work), CVG_DIAG_LIMITS=json.dumps(limits), CVG_DIAG_PHASE_CLOCK='1')
    argv = [NODE, str(tools / 'check-product-boundary.mjs'), str(BUILD0241), '--graph=' + str(work / 'graph.json'),
            '--installed-reference=' + inst['manifestPath'], '--installed-reference-sha256=' + inst['expectedSha256'], '--semantic',
            '--compiled-build-reference=' + comp['manifestPath'], '--compiled-build-reference-sha256=' + comp['expectedSha256']] + (['--strict'] if mode == 'strict' else [])
    t = time.time(); l0 = os.getloadavg()[0]
    p = subprocess.run(argv, cwd=BUILD0241, env=env, capture_output=True, timeout=3600)
    wall = round(time.time() - t, 1)
    err = p.stderr.decode('utf8', 'replace').splitlines()
    phases = [json.loads(l[len('CVG_DIAG_PHASE '):]) for l in err if l.startswith('CVG_DIAG_PHASE ')]
    marks = [l for l in err if l.startswith('CVG_DIAG_IDENTITY')]
    r = json.loads(p.stdout)
    (work / 'report.json.gz').write_bytes(gzip.compress(p.stdout, mtime=0))
    s = r['semanticBoundary']
    body = dict(r); body.pop('semanticTelemetry', None)
    payloads.append(json.dumps(body, sort_keys=True))
    tf = Counter((u.get('file') or '', u['reason'], u.get('detail') or '') for u in s['unknowns'])
    missing = sorted(set(tc) - set(tf))
    runs.append({'mode': mode, 'loadAvgAtStart': round(l0, 2), 'wallSeconds': wall, 'exitCode': p.returncode, 'semanticTelemetry': r.get('semanticTelemetry'),
                 'phaseClock': phases, 'identityMarks': [m[:300] for m in marks], 'validation': s['validation'], 'phases': s.get('phases'),
                 'bodyCoverage': s.get('bodyCoverage'), 'usage': {k: s['usage'][k] for k in ('states', 'contexts', 'callDepth', 'unionValues', 'nodes', 'files')},
                 'envelopeTuples': [u for u in s['unknowns'] if u['reason'] in ('UNKNOWN_INSTALLED_REFERENCE', 'UNKNOWN_INPUT_REVALIDATION', 'UNKNOWN_HOST_VALIDATION', 'UNKNOWN_ANALYSIS_LIMIT')],
                 'diagnostics': len(r['diagnostics']), 'proofs': len(s['proofs']), 'violations': len(s['violations']) + len(r['violations']),
                 'semanticPayloadCompactBytes': len(json.dumps(s, separators=(',', ':'))),
                 'conservationVsT2Cut': {'cutDistinct': len(tc), 'fullDistinct': len(tf), 'missing': [list(m) for m in missing],
                                         'onlyEnvelopeMissing': all(m[1] == 'UNKNOWN_ANALYSIS_LIMIT' for m in missing)}})
    print(json.dumps(runs[-1])[:1200], flush=True)
save('identity-phase-probe.json', {'task': TASK, 'diagnosticOnly': True, 'notAcceptanceNotOfficial': True, 'observedAt': now(),
                                   'limitsOverride': limits, 'comparisonTimeoutMs': 120000, 'phaseClock': 'L3 do rascunho SPEC0242 (cópia diagnóstica)',
                                   'probeScripts': {'identity': sha(tools / 'boundary-installed-identity.mjs'), 'checker': sha(tools / 'check-product-boundary.mjs'),
                                                    'engine': sha(tools / 'boundary-semantic-engine.mjs')},
                                   'pinnedNodeHeapSizeLimitBytes': int(heap), 'workerHeapFlag': 'nenhuma (worker oficial sem --max-old-space-size)',
                                   'runs': runs, 'normalStrictPayloadEqualExcludingTelemetry': payloads[0] == payloads[1]})
