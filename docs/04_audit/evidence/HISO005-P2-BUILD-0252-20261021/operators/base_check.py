"""AB07 gate before the A/B: the base v7 measured now (same recipe, same epoch) must match the sealed BUILD0247 v7
reports (real-v7r1-{normal,strict}-report.json.gz): 11.723 diagnostics, 10.833 frontier tuples, diagnostics and tuple
multisets equal, normal = strict. Exit 1 (and the chain stops) when it does not match. usage: base_check.py <label>"""
import gzip, json, sys
from collections import Counter
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

label = sys.argv[1]
R = lambda p: json.loads(gzip.decompress(Path(p).read_bytes()))
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


out, ok = {}, True
for mode in ('normal', 'strict'):
    x = R(RUNTIME / 'reports' / f'real-{label}-{mode}-report.json.gz')
    s = R(SEALED_V7[mode])
    row = {'diagnostics': [len(x['diagnostics']), len(s['diagnostics'])],
           'frontierTuples': [len(x['semanticBoundary']['unknowns']), len(s['semanticBoundary']['unknowns'])],
           'kernel': [x['semanticBoundary']['kernelVersion'], s['semanticBoundary']['kernelVersion']],
           'diagnosticsMultisetEqual': D(x) == D(s), 'tuplesMultisetEqual': T(x) == T(s),
           'proofs': len(x['semanticBoundary']['proofs']), 'validation': x['semanticBoundary']['validation'],
           'sealed': str(SEALED_V7[mode].relative_to(PROJECT)), 'sealedSha256': sha(SEALED_V7[mode])}
    px, ps = dict(x), dict(s)
    px.pop('semanticTelemetry', None); ps.pop('semanticTelemetry', None)
    paths = diff(px, ps)
    row['payloadDiffPathsVsSealedExcludingTelemetry'] = paths
    row['payloadDiffValues'] = {q: [eval('x' + ''.join("['" + k + "']" for k in q.strip('/').split('/'))),
                                    eval('s' + ''.join("['" + k + "']" for k in q.strip('/').split('/')))] for q in paths if '[' not in q}
    row['payloadDiffNote'] = ('só o digest da referência compilada muda: a receita, os 121 arquivos e a árvore do compilador são os mesmos; '
                              'o manifesto da referência registra os caminhos do runtime desta medição') if set(paths) <= {'/semanticBoundary/compiledProvenance/referenceDigest'} else 'ver caminhos'
    row['match'] = (row['diagnostics'] == [11723, 11723] and row['frontierTuples'] == [10833, 10833] and row['diagnosticsMultisetEqual']
                    and row['tuplesMultisetEqual'] and row['kernel'][0] == OLD_VERSION and row['proofs'] == 0 and row['validation'] == {'valid': True})
    ok = ok and row['match']
    out[mode] = row
n, st = (R(RUNTIME / 'reports' / f'real-{label}-{m}-report.json.gz') for m in ('normal', 'strict'))
out['normalEqualsStrict'] = D(n) == D(st) and T(n) == T(st)
ok = ok and out['normalEqualsStrict']
save('base-vs-sealed.json', {'task': TASK, 'observedAt': now(), 'label': label, 'rule': 'AB07: a base v7 tem de bater com o selado do BUILD0247 antes do A/B; senão o BUILD para',
                             'modes': out, 'verdict': 'MATCH' if ok else 'MISMATCH'})
print(json.dumps(out, indent=1))
sys.exit(0 if ok else 1)
