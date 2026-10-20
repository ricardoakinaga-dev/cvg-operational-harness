"""DIAGNOSTIC VARIANT run (normal) of tools-<name> with the references of measure_graph.py; compares the frontier
with the official measurement: counts by reason, tuples that disappear or appear, violations and proofs.
usage: run_variant.py <name>"""
import gzip, json, subprocess, sys, time
from collections import Counter
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

name = sys.argv[1]
wait_load()
m = load('diagnostic-measurement.json')
inst, comp = m['installedReference'], m['compiledReference']
tools = RUNTIME / ('tools-' + name)
tmp = RUNTIME / 'tmp'
graph = RUNTIME / ('graph-' + name + '.json')
env = dict(minimal_env(tmp), HOME=str(tmp), CVG_DIAG_GRAPH=str(graph))
t0 = time.time()
p = subprocess.run([NODE, str(tools / 'scripts/check-product-boundary.mjs'), str(EVAL_ROOT), '--graph=' + str(RUNTIME / ('lexical-' + name + '.json')),
                    '--installed-reference=' + inst['manifestPath'], '--installed-reference-sha256=' + inst['expectedSha256'], '--semantic',
                    '--compiled-build-reference=' + comp['manifestPath'], '--compiled-build-reference-sha256=' + comp['expectedSha256']],
                   cwd=EVAL_ROOT, env=env, capture_output=True, timeout=3600)
r = json.loads(p.stdout)
(RUNTIME / ('variant-' + name + '-report.json.gz')).write_bytes(gzip.compress(p.stdout, mtime=0))
base = report('normal')
key = lambda x: (x.get('file') or '', x['reason'], x.get('detail') or '')
tb = Counter(key(x) for x in base['semanticBoundary']['unknowns'])
tv = Counter(key(x) for x in r['semanticBoundary']['unknowns'])
gone, new = tb - tv, tv - tb
g = json.loads(graph.read_text())
tags = {}
for k, v in g.get('tags', []):
    item = json.loads(k)
    tags[(item['file'], item['reason'], item['detail'])] = v
rec = {'task': TASK, 'variant': name, 'diagnosticOnly': True, 'notAcceptanceNotOfficial': True, 'observedAt': now(),
       'wallSeconds': round(time.time() - t0, 1), 'exitCode': p.returncode, 'engineSha256': sha(tools / 'scripts/boundary-semantic-engine.mjs'),
       'diagnostics': {'official': len(base['diagnostics']), 'variant': len(r['diagnostics'])},
       'frontierTuples': {'official': sum(tb.values()), 'variant': sum(tv.values())},
       'goneByReason': dict(Counter(k[1] for k in gone.elements()).most_common()),
       'newByReason': dict(Counter(k[1] for k in new.elements()).most_common()),
       'newSample': [list(k) for k in list(new)[:20]],
       'violations': {'official': len(base['semanticBoundary']['violations']) + len(base['violations']),
                      'variant': len(r['semanticBoundary']['violations']) + len(r['violations'])},
       'proofs': len(r['semanticBoundary']['proofs']), 'status': r['semanticBoundary']['status'], 'validation': r['semanticBoundary']['validation'],
       'phases': r['semanticBoundary']['phases'], 'bodyCoverage': r['semanticBoundary']['bodyCoverage'],
       'variantTagsByReason': dict(Counter((k[1] + ' ' + '|'.join(v)) for k, v in tags.items()).most_common(30))}
save('variant-' + name + '.json', rec)
print(json.dumps({k: rec[k] for k in ('diagnostics', 'frontierTuples', 'goneByReason', 'newByReason', 'violations', 'proofs', 'status', 'validation')}, indent=1))
