"""Run the DIAGNOSTIC checker copy (official caps) over the BUILD0241 root to dump the exact engine input; confirm the count."""
import gzip, json, subprocess, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

inst = load('installed-recipe-ref.json')['installedReference']
comp = load('compiled-recipe-ref.json')['compiledReference']
work = RUNTIME / 'dump'
work.mkdir(exist_ok=True)
env = dict(minimal_env(work), CVG_DIAG_INPUT_DUMP=str(RUNTIME / 'engine-input.json'))
tools = RUNTIME / 'tools-diag/scripts'
argv = [NODE, str(tools / 'check-product-boundary.mjs'), str(BUILD0241), '--graph=' + str(work / 'graph.json'),
        '--installed-reference=' + inst['manifestPath'], '--installed-reference-sha256=' + inst['expectedSha256'], '--semantic',
        '--compiled-build-reference=' + comp['manifestPath'], '--compiled-build-reference-sha256=' + comp['expectedSha256']]
started = now()
p = subprocess.run(argv, cwd=BUILD0241, env=env, capture_output=True, timeout=1800)
r = json.loads(p.stdout)
s = r['semanticBoundary']
inp = json.loads((RUNTIME / 'engine-input.json').read_text())
rec = {'task': TASK, 'observedAt': now(), 'startedAt': started, 'argv': [a if 'reference' not in a else a.split('=')[0] + '=<runtime>' for a in argv],
       'exitCode': p.returncode, 'diagnostics': len(r['diagnostics']), 'baseline': s['occurrences']['baseline'], 'new': s['occurrences']['new'],
       'phases': s.get('phases'), 'bodyCoverage': s.get('bodyCoverage'), 'compiledProvenance': s['compiledProvenance']['status'],
       'reportSha256': shab(p.stdout)[:16], 'engineInput': {'bytes': (RUNTIME / 'engine-input.json').stat().st_size, 'sha256': sha(RUNTIME / 'engine-input.json')[:16],
       'starts': len(inp['starts']), 'origins': len(inp['origins']), 'installed': len(inp['installed']), 'compiledStatus': inp.get('compiled', {}).get('status')},
       'diagEngineSha256': sha(tools / 'boundary-semantic-engine.mjs')[:16], 'officialEngineSha256': sha(CANDIDATE / 'scripts/boundary-semantic-engine.mjs')[:16],
       'note': 'Cópia de diagnóstico com tetos oficiais (CVG_DIAG_LIMITS ausente): reproduz a medição da T2.'}
save('engine-input-dump.json', rec)
print(json.dumps(rec, indent=1, ensure_ascii=False))
