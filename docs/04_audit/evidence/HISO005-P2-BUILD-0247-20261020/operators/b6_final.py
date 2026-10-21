"""B6 before (v6 base, 1d40fe51 scripts, equal to the sealed BUILD0245 v6) and after (vN of the commit) in normal and
strict on the evaluated root, the MC07 invariants (limits, inputs, installed, profile, runtime resolution, compiled
recipe equal; version new), diag copies equal to the plain runs, usage margins against the caps, and the final
reports copied to the evidence. usage: b6_final.py <base> <vN> <vN-tools> <base-diag> <vN-diag>"""
import gzip, json, shutil, sys
from collections import Counter
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

b, v, tv, bd, vd = sys.argv[1:6]
c = load('commit-0247.json') if (EV / 'commit-0247.json').exists() else None
eng = load('tools-' + tv + '.json')
assert eng['patches'] == [] and not eng['patched']
eng_sha = eng['scripts']['scripts/boundary-semantic-engine.mjs']
if c:
    assert next(f['sha256'] for f in c['files'] if f['path'] == 'scripts/boundary-semantic-engine.mjs') == eng_sha
R = lambda l, m: json.loads(gzip.decompress((RUNTIME / 'reports' / f'real-{l}-{m}-report.json.gz').read_bytes()))
D = lambda r: Counter(json.dumps(d, sort_keys=True) for d in r['diagnostics'])
sealed = json.loads(gzip.decompress(SEALED_V6.read_bytes()))
side = lambda r: {'diagnostics': len(r['diagnostics']), 'frontierTuples': len(r['semanticBoundary']['unknowns']),
                  'origins': len(r['semanticBoundary']['origins']), 'kernel': r['semanticBoundary']['kernelVersion'],
                  'status': r['semanticBoundary']['status'], 'proofs': len(r['semanticBoundary']['proofs']),
                  'violations': len(r['semanticBoundary']['violations']) + len(r['violations']),
                  'validation': r['semanticBoundary']['validation'], 'phases': r['semanticBoundary']['phases'], 'bodyCoverage': r['semanticBoundary']['bodyCoverage']}
SAME = ['limits', 'inputs', 'installed', 'installedFileIdentity', 'schemaVersion', 'origins', 'usage']
modes, inv = {}, {}
for mode in ('normal', 'strict'):
    x, y = R(b, mode), R(v, mode)
    modes[mode] = {'before': side(x), 'after': side(y), 'delta': len(y['diagnostics']) - len(x['diagnostics']),
                   'beforeEqualsSealedV6Diagnostics': D(x) == D(sealed), 'diagnosticsEqual': D(x) == D(y)}
    sx, sy = x['semanticBoundary'], y['semanticBoundary']
    inv[mode] = {**{k: sx.get(k) == sy.get(k) for k in SAME}, 'runtimeResolution': sx['runtimeResolution'] == sy['runtimeResolution'],
                 'resolutionProfile': [sx['runtimeResolution']['profile'], sy['runtimeResolution']['profile']],
                 'compiledProvenance': sx['compiledProvenance'] == sy['compiledProvenance'],
                 'compiledRecipe': [sx['compiledProvenance'].get('recipeVersion'), sy['compiledProvenance'].get('recipeVersion')],
                 'compiledFiles': [len(sx['compiledProvenance']['files']), len(sy['compiledProvenance']['files'])],
                 'kernelVersion': [sx['kernelVersion'], sy['kernelVersion']]}
diag_equal = {bd: D(R(bd, 'normal')) == D(R(b, 'normal')), vd: D(R(vd, 'normal')) == D(R(v, 'normal'))}
summ = {l: load('real-' + l + '-summary.json') for l in (b, v, bd, vd)}
limits = summ[v]['runs'][0]['limits']
cap = {'contexts': 'maxContexts', 'states': 'maxStates', 'callDepth': 'maxCallDepth', 'unionValues': 'maxUnionValues', 'nodes': 'maxNodes', 'files': 'maxFiles'}
runs = {l + ':' + r['mode']: r for l in summ for r in summ[l]['runs']}
margins = {k: {'limit': limits[lim], 'base': runs[b + ':normal']['usage'][k], 'vN': runs[v + ':normal']['usage'][k],
               'vNPct': round(100 * runs[v + ':normal']['usage'][k] / limits[lim], 1), 'vNMargin': limits[lim] - runs[v + ':normal']['usage'][k]} for k, lim in cap.items()}
margins['timeMs'] = {'limit': limits['timeoutMs'], 'workerElapsedMs': {k: round(r['telemetry']['elapsedMs']) for k, r in runs.items()},
                     'loadAvgAtStart': {k: r['loadAvgAtStart'] for k, r in runs.items()}, 'wallSeconds': {k: r['wallSeconds'] for k, r in runs.items()},
                     'vNMaxPct': round(100 * max(runs[v + ':' + m]['telemetry']['elapsedMs'] for m in ('normal', 'strict')) / limits['timeoutMs'], 1)}
copied = []
for l in (b, v):
    for m in ('normal', 'strict'):
        src = RUNTIME / 'reports' / f'real-{l}-{m}-report.json.gz'
        shutil.copyfile(src, EV / src.name); copied.append({'file': src.name, 'sha256': sha(EV / src.name)})
out = {'task': TASK, 'observedAt': now(), 'evaluatedRoot': EVAL_COMMIT, 'evaluatedRootPath': str(EVAL_ROOT), 'references': 'references-scoped.json',
       'commit': c['commit'] if c else None, 'engineSha256': eng_sha, 'measuredWith': {'before': b, 'after': v, 'afterTools': 'tools-' + tv + '.json (engine dos bytes congelados, sem patch)'},
       'sealedBefore': str(SEALED_V6.relative_to(PROJECT)), 'modes': modes,
       'normalEqualsStrict': {'before': D(R(b, 'normal')) == D(R(b, 'strict')), 'after': D(R(v, 'normal')) == D(R(v, 'strict'))},
       'mc07Invariants': inv, 'diagCopiesEqualPlainRuns': diag_equal, 'usageMargins': margins, 'reportsCopied': copied,
       'b6': 'INCOMPLETE (0 provas, 0 violações; regra global: qualquer UNKNOWN suprime provas)'}
save('b6-final-comparison.json', out)
print(json.dumps({m: [modes[m]['before']['diagnostics'], modes[m]['after']['diagnostics'], modes[m]['delta'], modes[m]['beforeEqualsSealedV6Diagnostics'], modes[m]['diagnosticsEqual']] for m in modes}),
      json.dumps(inv['normal']), diag_equal, json.dumps({k: (x.get('vN'), x.get('limit')) for k, x in margins.items() if k != 'timeMs'}), margins['timeMs']['vNMaxPct'])
