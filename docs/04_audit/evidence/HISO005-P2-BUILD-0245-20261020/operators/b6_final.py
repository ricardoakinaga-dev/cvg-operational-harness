"""B6 antes (v5 na raiz reconstituída, igual ao selado) e depois (v6 do commit) em normal e strict, as invariantes
do MT06 (limites, perfil, receitas e referências iguais; versão nova) e a folga de uso contra os tetos.
usage: b6_final.py <v5-label> <v6-label> <v6-tools-label> [<diag labels>...]"""
import gzip, json, sys
from collections import Counter
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

v5, v6, tools6 = sys.argv[1:4]
diag = sys.argv[4:]
c = load('commit-0245.json')
eng_commit = next(f['sha256'] for f in c['files'] if f['path'] == 'scripts/boundary-semantic-engine.mjs')
t6 = load('tools-' + tools6 + '.json')
assert t6['engineBeforePatches'] == eng_commit and t6['patches'] == [] and not t6['diagnosticOnly']
rep = lambda label, mode: json.loads(gzip.decompress((EV / f'real-{label}-{mode}-report.json.gz').read_bytes()))
sealed = json.loads(gzip.decompress(SEALED_V5.read_bytes()))
side = lambda r: {'diagnostics': len(r['diagnostics']), 'frontierTuples': len(r['semanticBoundary']['unknowns']),
                  'origins': len(r['semanticBoundary']['origins']), 'kernel': r['semanticBoundary']['kernelVersion'],
                  'status': r['semanticBoundary']['status'], 'proofs': len(r['semanticBoundary']['proofs']),
                  'violations': len(r['semanticBoundary']['violations']) + len(r['violations']),
                  'validation': r['semanticBoundary']['validation'], 'phases': r['semanticBoundary']['phases'],
                  'bodyCoverage': r['semanticBoundary']['bodyCoverage']}
reasons = lambda r: Counter(u['reason'] for u in r['semanticBoundary']['unknowns'])
SAME = ['limits', 'inputs', 'installed', 'installedFileIdentity', 'schemaVersion']
modes, inv = {}, {}
for mode in ('normal', 'strict'):
    a, b = rep(v5, mode), rep(v6, mode)
    ra, rb = reasons(a), reasons(b)
    modes[mode] = {'before': side(a), 'after': side(b), 'delta': len(b['diagnostics']) - len(a['diagnostics']),
                   'reasonDelta': {k: rb[k] - ra[k] for k in sorted(set(ra) | set(rb)) if rb[k] != ra[k]},
                   'beforeEqualsSealedDiagnostics': Counter(json.dumps(d, sort_keys=True) for d in a['diagnostics']) == Counter(json.dumps(d, sort_keys=True) for d in sealed['diagnostics'])}
    sa, sb = a['semanticBoundary'], b['semanticBoundary']
    inv[mode] = {**{k: sa[k] == sb[k] for k in SAME},
                 'runtimeResolution': sa['runtimeResolution'] == sb['runtimeResolution'],
                 'resolutionProfile': [sa['runtimeResolution']['profile'], sb['runtimeResolution']['profile']],
                 'compiledProvenance': sa['compiledProvenance'] == sb['compiledProvenance'],
                 'compiledRecipe': [sa['compiledProvenance'].get('recipeVersion'), sb['compiledProvenance'].get('recipeVersion')],
                 'compiledFiles': [len(sa['compiledProvenance']['files']), len(sb['compiledProvenance']['files'])],
                 'kernelVersion': [sa['kernelVersion'], sb['kernelVersion']]}
summ = {l: load('real-' + l + '-summary.json') for l in (v5, v6, *diag)}
limits = summ[v6]['runs'][0]['limits']
cap = {'contexts': 'maxContexts', 'states': 'maxStates', 'callDepth': 'maxCallDepth', 'unionValues': 'maxUnionValues', 'nodes': 'maxNodes', 'files': 'maxFiles'}
runs = {l + ':' + r['mode']: r for l in (v5, v6, *diag) for r in summ[l]['runs']}
margins = {k: {'limit': limits[lim], 'v5': runs[v5 + ':normal']['usage'][k], 'v6': runs[v6 + ':normal']['usage'][k],
               'v6Pct': round(100 * runs[v6 + ':normal']['usage'][k] / limits[lim], 1), 'v6Margin': limits[lim] - runs[v6 + ':normal']['usage'][k]}
           for k, lim in cap.items()}
margins['timeMs'] = {'limit': limits['timeoutMs'], 'workerElapsedMs': {k: round(r['telemetry']['elapsedMs']) for k, r in runs.items()},
                     'loadAvgAtStart': {k: r['loadAvgAtStart'] for k, r in runs.items()},
                     'v6MaxPct': round(100 * max(runs[v6 + ':' + m]['telemetry']['elapsedMs'] for m in ('normal', 'strict')) / limits['timeoutMs'], 1),
                     'v6MaxPctInclDiag': round(100 * max(r['telemetry']['elapsedMs'] for k, r in runs.items() if not k.startswith(v5)) / limits['timeoutMs'], 1),
                     'wallSeconds': {k: r['wallSeconds'] for k, r in runs.items()},
                     'note': 'o tempo depende da carga da máquina (loadAvgAtStart registrado por execução); as cópias diag (*diag) despejam o grafo e os contextos e custam mais'}
margins['timeRisk'] = ('R2-O04: com load em torno de 11 a v6 levou 154–164 s (normal/strict) e a cópia diag 188 s, contra cerca de 114 s na SPEC e o teto global de 300 s; '
                       'um corte por prazo cai na regra de parada (phases.body CUT / erro de worker) e não esconde nada, mas a folga sob carga é risco operacional da promoção')
out = {'task': TASK, 'observedAt': now(), 'evaluatedRoot': EVAL_COMMIT, 'evaluatedRootPath': str(EVAL_ROOT),
       'references': 'references-scoped2.json', 'commit': c['commit'], 'engineSha256': eng_commit,
       'measuredWith': {'before': v5, 'after': v6, 'afterTools': 'tools-' + tools6 + '.json (engine igual ao do commit, sem patch)'},
       'sealedBefore': str(SEALED_V5.relative_to(PROJECT)), 'modes': modes,
       'normalEqualsStrict': {'before': modes['normal']['before']['diagnostics'] == modes['strict']['before']['diagnostics'],
                              'after': Counter(json.dumps(d, sort_keys=True) for d in rep(v6, 'normal')['diagnostics']) == Counter(json.dumps(d, sort_keys=True) for d in rep(v6, 'strict')['diagnostics'])},
       'mt06Invariants': inv, 'usageMargins': margins,
       'contextsRisk': 'maxContexts segue a menor folga: 229/256 antes e depois (27 de folga); estourar qualquer teto corta o corpo (phases.body CUT) e para a promoção',
       'b6': 'INCOMPLETE (0 provas, 0 violações; regra global: qualquer UNKNOWN suprime provas)'}
save('b6-final-comparison.json', out)
print(json.dumps({m: [modes[m]['before']['diagnostics'], modes[m]['after']['diagnostics'], modes[m]['delta'], modes[m]['beforeEqualsSealedDiagnostics']] for m in modes}),
      json.dumps(inv['normal']), json.dumps({k: (v.get('v6'), v.get('limit')) for k, v in margins.items() if k not in ('timeMs', 'timeRisk')}), margins['timeMs']['v6MaxPct'])
