"""Second diagnostic run (normal) with the cause-tag copy (diag_patch.py + cause_patch.py), same references as
measure_graph.py. Confirms the diagnostics are unchanged and stores the tags with the graph."""
import gzip, json, subprocess, sys, time
from collections import Counter
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

wait_load()
m = load('diagnostic-measurement.json')
inst, comp = m['installedReference'], m['compiledReference']
diag = RUNTIME / (sys.argv[1] if len(sys.argv) > 1 else 'tools-diag')
tmp = RUNTIME / 'tmp'
label = sys.argv[2] if len(sys.argv) > 2 else ''
out = RUNTIME / ('semantic-graph-tags' + label + '.json')
env = dict(minimal_env(tmp), HOME=str(tmp), CVG_DIAG_GRAPH=str(out))
t0 = time.time()
p = subprocess.run([NODE, str(diag / 'scripts/check-product-boundary.mjs'), str(EVAL_ROOT), '--graph=' + str(RUNTIME / ('lexical-graph-tags' + label + '.json')),
                    '--installed-reference=' + inst['manifestPath'], '--installed-reference-sha256=' + inst['expectedSha256'], '--semantic',
                    '--compiled-build-reference=' + comp['manifestPath'], '--compiled-build-reference-sha256=' + comp['expectedSha256']],
                   cwd=EVAL_ROOT, env=env, capture_output=True, timeout=3600)
r = json.loads(p.stdout)
d1 = Counter(json.dumps(d, sort_keys=True) for d in r['diagnostics'])
d0 = Counter(json.dumps(d, sort_keys=True) for d in report('normal')['diagnostics'])
g = json.loads(out.read_text())
gz = gzip.compress(json.dumps({'root': g['root'], 'tags': g['tags'], 'refused': g['refused']}, sort_keys=True).encode(), mtime=0)
(EV / ('cause-tags' + label + '.json.gz')).write_bytes(gz)
rec = {'task': TASK, 'diagnosticOnly': True, 'observedAt': now(), 'wallSeconds': round(time.time() - t0, 1), 'exitCode': p.returncode,
       'engineSha256': sha(diag / 'scripts/boundary-semantic-engine.mjs'), 'diagnostics': sum(d1.values()), 'diagnosticsEqualOfficial': d1 == d0,
       'tags': len(g['tags']), 'refusedModules': len(g['refused']), 'causeTagsSha256': shab(gz), 'stderrTail': p.stderr.decode('utf8', 'replace')[-800:]}
save('diagnostic-measurement-tags' + label + '.json', rec)
print(json.dumps(rec, indent=1))
