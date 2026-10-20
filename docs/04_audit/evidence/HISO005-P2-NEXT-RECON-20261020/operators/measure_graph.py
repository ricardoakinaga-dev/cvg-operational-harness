"""Scoped references (recipe of the PR #8 head) over 228e7918, then ONE normal checker run with the diagnostic
engine copy that dumps the semantic graph. Checks that the diagnostics equal the official final measurement."""
import gzip, json, subprocess, sys, time
from collections import Counter
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

wait_load()
tools, diag = RUNTIME / 'tools', RUNTIME / 'tools-diag'
tmp = RUNTIME / 'tmp'; tmp.mkdir(exist_ok=True)
env = dict(minimal_env(tmp), HOME=str(tmp))
log = []
def run(argv, cwd, envx=env, timeout=3600):
    t = now(); p = subprocess.run([str(a) for a in argv], cwd=str(cwd), env=envx, capture_output=True, timeout=timeout)
    log.append({'argv': [str(a) for a in argv], 'cwd': str(cwd), 'startedAt': t, 'finishedAt': now(), 'exitCode': p.returncode,
                'stderrTail': p.stderr.decode('utf8', 'replace')[-1500:]})
    return p
p = run([NODE, tools / 'scripts/build-installed-reference.mjs', '--source-root=' + str(RUNTIME / 'eval-228e'), '--commit=' + EVAL_COMMIT,
         '--output-root=' + str(RUNTIME / 'ref-installed'), '--cache-source=' + str(RUNTIME / 'npm-cache-source')], tools)
inst = json.loads(p.stdout)
p = run([NODE, tools / 'scripts/boundary-semantic-compiled.mjs', '--source-root=' + str(EVAL_ROOT), '--commit=' + EVAL_COMMIT,
         '--output-root=' + str(RUNTIME / 'ref-compiled'), '--dependencies-root=' + str(EVAL_ROOT),
         '--installed-reference=' + inst['manifestPath'], '--installed-reference-sha256=' + inst['expectedSha256']], tools)
comp = json.loads(p.stdout)
graph = RUNTIME / 'semantic-graph.json'
envd = dict(env, CVG_DIAG_GRAPH=str(graph))
t0 = time.time()
p = run([NODE, diag / 'scripts/check-product-boundary.mjs', str(EVAL_ROOT), '--graph=' + str(RUNTIME / 'lexical-graph.json'),
         '--installed-reference=' + inst['manifestPath'], '--installed-reference-sha256=' + inst['expectedSha256'], '--semantic',
         '--compiled-build-reference=' + comp['manifestPath'], '--compiled-build-reference-sha256=' + comp['expectedSha256']], EVAL_ROOT, envd)
wall = round(time.time() - t0, 1)
r = json.loads(p.stdout)
(RUNTIME / 'diag-normal-report.json.gz').write_bytes(gzip.compress(p.stdout, mtime=0))
official = report('normal')
d1 = Counter(json.dumps(d, sort_keys=True) for d in r['diagnostics'])
d0 = Counter(json.dumps(d, sort_keys=True) for d in official['diagnostics'])
g = json.loads(graph.read_text())
gz = gzip.compress(json.dumps(g, sort_keys=True).encode(), mtime=0)
(EV / 'semantic-graph.json.gz').write_bytes(gz)
lex = RUNTIME / 'lexical-graph.json'
if lex.exists():
    (EV / 'lexical-graph.json.gz').write_bytes(gzip.compress(lex.read_bytes(), mtime=0))
rec = {'task': TASK, 'diagnosticOnly': True, 'observedAt': now(), 'wallSeconds': wall, 'exitCode': p.returncode,
       'installedReference': inst, 'compiledReference': comp, 'diagEngineSha256': sha(diag / 'scripts/boundary-semantic-engine.mjs'),
       'diagnostics': sum(d1.values()), 'diagnosticsEqualOfficial': d1 == d0, 'officialReport': '../HISO005-P2-BUILD-0242-20261019/real-final-0242-normal-report.json.gz',
       'status': r['semanticBoundary']['status'], 'phases': r['semanticBoundary']['phases'], 'validation': r['semanticBoundary']['validation'],
       'telemetry': r.get('semanticTelemetry'), 'graph': {'files': len(g['files']), 'importers': len(g['edges']), 'edges': sum(len(v) for v in g['edges'].values()),
       'starts': len(g['starts']), 'reachedPackages': len(g['reachedPackages']), 'root': g['root'], 'sha256': shab(gz)}, 'commands': log}
save('diagnostic-measurement.json', rec)
print(json.dumps({k: v for k, v in rec.items() if k not in ('commands', 'installedReference', 'compiledReference')}, indent=1))
