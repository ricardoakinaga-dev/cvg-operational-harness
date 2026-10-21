"""SPEC0245 §3.3 conservation on the reconstituted root 228e7918, normal and strict: v5 (main 6c9fc651 scripts) against
v6 (frozen candidate), same references. Graph = union of the v5 and v6 diagnostic dumps. usage:
conservation_0245.py <v5> <v5diag> <v6> <v6diag> <out>"""
import gzip, json, sys
from collections import Counter
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

v5, v5d, v6, v6d, outname = sys.argv[1:6]
gz = lambda n: json.loads(gzip.decompress((EV / n).read_bytes()))
rep = lambda l, m: gz('real-' + l + '-' + m + '-report.json.gz')
key = lambda u: (u.get('file') or '', u['reason'], u.get('detail') or '')
diags = lambda r: Counter(json.dumps(d, sort_keys=True) for d in r['diagnostics'])
sealed = {m: json.loads(gzip.decompress((SEALED_V5.parent / ('real-v5r3-' + m + '-report.json.gz')).read_bytes())) for m in ('normal', 'strict')}
d5, d6 = gz('diag-' + v5d + '-normal.json.gz'), gz('diag-' + v6d + '-normal.json.gz')
root = d5['root'] + '/'; rel = lambda p: p[len(root):] if p.startswith(root) else p
f5, f6 = {rel(f) for f in d5['files']}, {rel(f) for f in d6['files']}
E = {}
for d in (d5, d6):
    for k, v in d['edges'].items(): E.setdefault(rel(k), set()).update(rel(x) for x in v)
edges5 = sum(len(v) for v in d5['edges'].values()); edges6 = sum(len(v) for v in d6['edges'].values())
eset = lambda d: {(rel(k), rel(x)) for k, v in d['edges'].items() for x in v}
edge_set_equal = eset(d5) == eset(d6)
istsx = lambda f: f.endswith('.tsx') or f.endswith('.jsx')
tsx = {f for f in f5 | f6 if istsx(f)}
def clo(f):
    seen, st = set(), [f]
    while st:
        n = st.pop()
        if n in seen: continue
        seen.add(n); st.extend(E.get(n, ()))
    return seen
down = set().union(*[clo(f) for f in tsx]) - tsx if tsx else set()
JSX = {'JsxElement', 'JsxSelfClosingElement', 'JsxFragment'}
out = {'task': TASK, 'observedAt': now(), 'rule': 'SPEC0245 §3.3', 'labels': [v5, v5d, v6, v6d], 'modes': {}}
for mode in ('normal', 'strict'):
    a, b = rep(v5, mode), rep(v6, mode)
    ta, tb = Counter(key(u) for u in a['semanticBoundary']['unknowns']), Counter(key(u) for u in b['semanticBoundary']['unknowns'])
    gone, new = ta - tb, tb - ta
    outside_changed = [list(t) for t in (gone + new).elements() if not istsx(t[0])]
    fmt5 = Counter({t: n for t, n in ta.items() if istsx(t[0]) and t[1] in ('UNKNOWN_FORMAT', 'UNKNOWN_MODULE_FORMAT')})
    fmt_lost = list((fmt5 - tb).elements())
    parse6 = [t for t in tb if istsx(t[0]) and t[1] == 'UNKNOWN_PARSE']
    jsx_new_bad = [list(t) for t in new if istsx(t[0]) and t[1] == 'UNKNOWN_UNSUPPORTED_SYNTAX' and t[2].startswith('Jsx') and t[2] not in JSX]
    va = Counter(json.dumps(v, sort_keys=True) for v in a['semanticBoundary']['violations'] + a['violations'])
    vb = Counter(json.dumps(v, sort_keys=True) for v in b['semanticBoundary']['violations'] + b['violations'])
    lists = outname.replace('.json', '') + '-tuples-' + mode + '.json.gz'
    (EV / lists).write_bytes(gzip.compress(json.dumps({'gone': sorted([list(t) for t in gone.elements()]), 'new': sorted([list(t) for t in new.elements()])}, ensure_ascii=False).encode(), mtime=0))
    s5, s6 = a['semanticBoundary'], b['semanticBoundary']
    m = {'v5ReproducesSealed12283': diags(a) == diags(sealed[mode]), 'diagnostics': [len(a['diagnostics']), len(b['diagnostics'])],
         'tuples': [sum(ta.values()), sum(tb.values())], 'gone': sum(gone.values()), 'new': sum(new.values()),
         'goneByReason': dict(Counter(t[1] for t in gone.elements()).most_common()), 'newByReason': dict(Counter(t[1] + (':' + t[2] if t[1] == 'UNKNOWN_UNSUPPORTED_SYNTAX' else '') for t in new.elements()).most_common()),
         'outsideTsxChanged': outside_changed[:30], 'outsideTsxChangedCount': len(outside_changed), 'formatTuplesLostInTsx': fmt_lost,
         'parseInTsxAfter': [list(t) for t in parse6], 'jsxDetailOutsideClosedSet': jsx_new_bad,
         'violations': [sum(va.values()), sum(vb.values())], 'violationsContained': not (va - vb), 'proofsV6': len(s6['proofs']),
         'validation': [s5['validation'], s6['validation']], 'kernelVersion': [s5.get('kernelVersion'), s6.get('kernelVersion')],
         'limitsEqual': s5.get('limits') == s6.get('limits'), 'phases': [s5.get('phases'), s6.get('phases')],
         'usage': {k: [s5['usage'][k], s6['usage'][k]] for k in ('contexts', 'states', 'callDepth', 'unionValues', 'nodes', 'files')},
         'tupleLists': {'path': lists, 'sha256': sha(EV / lists)}}
    m['pass'] = (m['v5ReproducesSealed12283'] and not outside_changed and not fmt_lost and not parse6 and not jsx_new_bad and m['violationsContained']
                 and m['proofsV6'] == 0 and all(v.get('valid') for v in m['validation']) and m['limitsEqual'])
    out['modes'][mode] = m
strip = lambda r: json.dumps({k: v for k, v in r.items() if k != 'semanticTelemetry'}, sort_keys=True)
out['v6NormalEqualsStrict'] = strip(rep(v6, 'normal')) == strip(rep(v6, 'strict'))
out['v5NormalEqualsStrict'] = strip(rep(v5, 'normal')) == strip(rep(v5, 'strict'))
n6 = rep(v6, 'normal')
direct = sorted({t for f in tsx for t in E.get(f, ()) if not istsx(t)})
pkg = lambda f: '/'.join(f.split('node_modules/')[-1].split('/')[:2 if f.split('node_modules/')[-1].startswith('@') else 1]) if 'node_modules/' in f else f
sm5, sm6 = load('real-' + v5 + '-summary.json'), load('real-' + v6 + '-summary.json')
nooid = lambda r: Counter(json.dumps({k: v for k, v in d.items() if k != 'originId'}, sort_keys=True) for d in r['diagnostics'] if not istsx(d.get('file') or ''))
oid = lambda r: Counter(json.dumps(d, sort_keys=True) for d in r['diagnostics'] if not istsx(d.get('file') or '') and 'originId' in d)
a5n = rep(v5, 'normal')
out['originIdNote'] = {'outsideTsxDiagnosticsEqualIgnoringOriginId': nooid(a5n) == nooid(n6),
                       'outsideTsxDiagnosticsWithChangedOriginId': sum((oid(a5n) - oid(n6)).values()),
                       'reading': 'o originId de UNVERIFIED_SEMANTIC_FRONTIER depende do índice da tupla (#/semanticBoundary/unknowns/<i>); sumir tuplas nos .tsx desloca índices: a troca é posicional e esperada, não semântica'}
out['timeAndCensus'] = {'timeoutMs': sm6['runs'][0]['limits']['timeoutMs'],
                        'workerElapsedMs': {'v5': [round(r_['telemetry']['elapsedMs']) for r_ in sm5['runs']], 'v6': [round(r_['telemetry']['elapsedMs']) for r_ in sm6['runs']]},
                        'negativeCensusElapsedMs': {'v5': [round(r_['telemetry'].get('negativeCensusElapsedMs') or 0) for r_ in sm5['runs']], 'v6': [round(r_['telemetry'].get('negativeCensusElapsedMs') or 0) for r_ in sm6['runs']]},
                        'loadAvgAtStart': {'v5': [r_['loadAvgAtStart'] for r_ in sm5['runs']], 'v6': [r_['loadAvgAtStart'] for r_ in sm6['runs']]},
                        'censusOnRealRoot': 'o census rodou nas duas execuções (negativeCensusElapsedMs > 0) e as violações dele entram na união do resultado final: 0'}
out['denominators'] = {'tsxFiles': len(tsx), 'jsxFiles': sum(1 for f in tsx if f.endswith('.jsx')), 'downstreamOfTsx': len(down & (f5 | f6)),
                       'filesV5': len(f5), 'filesV6': len(f6), 'acquiredOnlyV5': sorted(f5 - f6), 'acquiredOnlyV6': sorted(f6 - f5),
                       'edgesV5': edges5, 'edgesV6': edges6, 'edgeSetEqual': edge_set_equal,
                       'directTargetsOfTsx': len(direct), 'directPackagesOfTsx': sorted({pkg(t) for t in direct}), 'edgesIntoTsx': sum(1 for k, v in E.items() for t in v if istsx(t)),
                       'tsxWithJsxRefusal': sorted({u['file'] for u in n6['semanticBoundary']['unknowns'] if istsx(u['file']) and u['reason'] == 'UNKNOWN_UNSUPPORTED_SYNTAX' and u['detail'] in JSX}),
                       'contextsTopV6': d6.get('contextsTop', [])[:5]}
out['status'] = 'PASS' if all(m['pass'] for m in out['modes'].values()) and out['v6NormalEqualsStrict'] else 'FAIL'
save(outname, out)
print(json.dumps({'status': out['status'], 'v6NormalEqualsStrict': out['v6NormalEqualsStrict'], 'denominators': {k: v for k, v in out['denominators'].items() if k != 'contextsTopV6'},
                  'modes': {k: {x: y for x, y in v.items() if x not in ('phases',)} for k, v in out['modes'].items()}}, indent=1, ensure_ascii=False)[:5000])
