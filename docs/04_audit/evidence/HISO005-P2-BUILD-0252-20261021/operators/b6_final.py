"""(adapted from HISO005-P2-BUILD-0247 b6_final.py) AB07: B6 before (base v7 of 24cdb463, checked against the sealed
BUILD0247 v7 by base_check.py) and after (vN of the BUILD commit) in normal and strict on the evaluated root 228e7918:
tuple and diagnostic multisets, the full payload diffed path by path (telemetry removed; only the version literal may
differ), invariants (limits, inputs, installed, usage, runtime resolution, compiled recipe), normal = strict, zero
proofs, validation true, zero UNKNOWN_ANNEXB_FUNCTION; usage margins; final reports copied (gzip) to the evidence.
usage: b6_final.py <base> <vN> <vN-tools> <commit>"""
import gzip, json, shutil, sys
from collections import Counter
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

b, v, tv, commit = sys.argv[1:5]
eng = load('tools-' + tv + '.json')
assert not eng['patched'] and eng['origin']['commit'] == git('rev-parse', commit)
eng_sha = eng['scripts'][ENGINE]
assert sha(CANDIDATE / ENGINE) == eng_sha
R = lambda l, m: json.loads(gzip.decompress((RUNTIME / 'reports' / f'real-{l}-{m}-report.json.gz').read_bytes()))
D = lambda r: Counter(json.dumps(d, sort_keys=True) for d in r['diagnostics'])
T = lambda r: Counter(json.dumps([u['reason'], u['file'], u['detail'], u.get('originId')], sort_keys=True) for u in r['semanticBoundary']['unknowns'])


def diff(x, y, p='', out=None):
    out = [] if out is None else out
    if type(x) is not type(y):
        out.append(p or '/')
    elif isinstance(x, dict):
        for k in sorted(set(x) | set(y)):
            if k not in x or k not in y:
                out.append(p + '/' + k)
            else:
                diff(x[k], y[k], p + '/' + k, out)
    elif isinstance(x, list):
        if len(x) != len(y):
            out.append(p + '[len]')
        else:
            for i, (a, c) in enumerate(zip(x, y)):
                diff(a, c, p + '[' + str(i) + ']', out)
    elif x != y:
        out.append(p)
    return out


side = lambda r: {'diagnostics': len(r['diagnostics']), 'frontierTuples': len(r['semanticBoundary']['unknowns']),
                  'origins': len(r['semanticBoundary']['origins']), 'kernel': r['semanticBoundary']['kernelVersion'],
                  'status': r['semanticBoundary']['status'], 'proofs': len(r['semanticBoundary']['proofs']),
                  'violations': len(r['semanticBoundary']['violations']) + len(r['violations']),
                  'validation': r['semanticBoundary']['validation'], 'phases': r['semanticBoundary']['phases'],
                  'bodyCoverage': r['semanticBoundary']['bodyCoverage'],
                  'annexbTuples': sum(u['reason'] == 'UNKNOWN_ANNEXB_FUNCTION' for u in r['semanticBoundary']['unknowns'])}
SAME = ['limits', 'inputs', 'installed', 'installedFileIdentity', 'schemaVersion', 'origins', 'usage']
modes, inv = {}, {}
for mode in ('normal', 'strict'):
    x, y = R(b, mode), R(v, mode)
    px, py = dict(x), dict(y)
    px.pop('semanticTelemetry', None); py.pop('semanticTelemetry', None)
    paths = diff(px, py)
    modes[mode] = {'before': side(x), 'after': side(y), 'delta': len(y['diagnostics']) - len(x['diagnostics']),
                   'diagnosticsEqual': D(x) == D(y), 'tuplesEqual': T(x) == T(y), 'payloadDiffPathsExcludingTelemetry': paths}
    sx, sy = x['semanticBoundary'], y['semanticBoundary']
    inv[mode] = {**{k: sx.get(k) == sy.get(k) for k in SAME}, 'runtimeResolution': sx['runtimeResolution'] == sy['runtimeResolution'],
                 'resolutionProfile': [sx['runtimeResolution']['profile'], sy['runtimeResolution']['profile']],
                 'compiledProvenance': sx['compiledProvenance'] == sy['compiledProvenance'],
                 'compiledRecipe': [sx['compiledProvenance'].get('recipeVersion'), sy['compiledProvenance'].get('recipeVersion')],
                 'compiledFiles': [len(sx['compiledProvenance']['files']), len(sy['compiledProvenance']['files'])],
                 'kernelVersion': [sx['kernelVersion'], sy['kernelVersion']]}
summ = {l: load('real-' + l + '-summary.json') for l in (b, v)}
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
        shutil.copyfile(src, EV / src.name)
        copied.append({'file': src.name, 'sha256': sha(EV / src.name)})
ok = all(modes[m]['tuplesEqual'] and modes[m]['diagnosticsEqual'] and modes[m]['after']['proofs'] == 0
         and modes[m]['after']['validation'] == {'valid': True} and modes[m]['after']['annexbTuples'] == 0
         and set(modes[m]['payloadDiffPathsExcludingTelemetry']) <= {'/semanticBoundary/kernelVersion'} for m in modes)
nes = {'before': D(R(b, 'normal')) == D(R(b, 'strict')) and T(R(b, 'normal')) == T(R(b, 'strict')),
       'after': D(R(v, 'normal')) == D(R(v, 'strict')) and T(R(v, 'normal')) == T(R(v, 'strict'))}
out = {'task': TASK, 'observedAt': now(), 'acceptance': 'AB07', 'evaluatedRoot': EVAL_COMMIT, 'evaluatedRootPath': str(EVAL_ROOT),
       'references': 'references-scoped.json', 'baseCheck': 'base-vs-sealed.json', 'commit': git('rev-parse', commit), 'engineSha256': eng_sha,
       'measuredWith': {'before': b + ' (tools-v7.json, 24cdb463)', 'after': v + ' (tools-' + tv + '.json)'}, 'modes': modes,
       'normalEqualsStrict': nes, 'invariants': inv, 'usageMargins': margins, 'reportsCopied': copied,
       'verdict': 'PASS' if ok and nes['before'] and nes['after'] else 'FAIL',
       'b6': 'INCOMPLETE (0 provas; regra global: qualquer UNKNOWN suprime provas)'}
save('b6-final-comparison.json', out)
print(json.dumps({m: [modes[m]['before']['diagnostics'], modes[m]['after']['diagnostics'], modes[m]['before']['frontierTuples'], modes[m]['after']['frontierTuples'],
                      modes[m]['tuplesEqual'], modes[m]['payloadDiffPathsExcludingTelemetry']] for m in modes}), nes, out['verdict'],
      json.dumps({k: (x.get('vN'), x.get('limit')) for k, x in margins.items() if k != 'timeMs'}), margins['timeMs']['vNMaxPct'])
