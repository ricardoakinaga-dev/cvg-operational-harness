"""SPEC0247 §3.6 conservation on the reconstituted root 228e7918, normal and strict: base v6 (1d40fe51 scripts) against
vN (frozen candidate), same references, same epoch of the root. Rule 5: tuple multiset equal and payload equal except
the telemetry and the version literal (semanticBoundary.kernelVersion; every other occurrence of either literal is
listed and must be absent). Rules 1-4 by cause with the graph of the base (non-census dump) and the CJS rows of the
vN diagnostic copy: touched modules by cause (C0 category, C1 initial object where the base had VOID, C2 join that
changed the value), affected files, denominators (§3.6 rule 7). usage:
conservation_0247.py <base> <basediag> <vN> <vNdiag> <out>"""
import gzip, json, sys
from collections import Counter
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

b, bd, v, vd, outname = sys.argv[1:6]
rep = lambda l, m: json.loads(gzip.decompress((RUNTIME / 'reports' / ('real-' + l + '-' + m + '-report.json.gz')).read_bytes()))
gz = lambda n: json.loads(gzip.decompress((EV / n).read_bytes()))
key = lambda u: json.dumps(u, sort_keys=True)
sealed6 = json.loads(gzip.decompress(SEALED_V6.read_bytes()))
D = lambda r: Counter(json.dumps(d, sort_keys=True) for d in r['diagnostics'])


def paths_of(x, lit, p='$'):
    if isinstance(x, str):
        return [p] if lit in x else []
    if isinstance(x, dict):
        return [q for k, y in x.items() for q in paths_of(y, lit, p + '.' + k)]
    if isinstance(x, list):
        return [q for i, y in enumerate(x) for q in paths_of(y, lit, p + '[' + str(i) + ']')]
    return []


def strip(r):
    x = json.loads(json.dumps(r))
    x.pop('semanticTelemetry', None)
    x['semanticBoundary'].pop('kernelVersion', None)
    return json.dumps(x, sort_keys=True)


dbase, dvn = gz('diag-' + bd + '-normal.json.gz'), gz('diag-' + vd + '-normal.json.gz')
root = dbase['root'] + '/'
rel = lambda f: f[len(root):] if f.startswith(root) else f
E = {rel(k): {rel(x) for x in xs} for k, xs in dbase['edges'].items()}
eset = lambda d: {(rel(k), rel(x)) for k, xs in d['edges'].items() for x in xs}
def clo(f):
    seen, st = set(), [f]
    while st:
        n = st.pop()
        if n in seen: continue
        seen.add(n); st.extend(E.get(n, ()))
    return seen
rows = {rel(r['file']): r for r in dvn['cjs']}
touched = {}
for f, r in rows.items():
    if r.get('mode') != 'require':
        continue
    causes = []
    if r.get('categories'): causes.append('C0')
    if r.get('initialObjectKept') or r.get('foreignInitialObject'): causes.append('C1')
    if r.get('joinsChanged'): causes.append('C2')
    if causes: touched[f] = causes
files = {rel(f) for f in dbase['files']}
reach_touched = {f for f in files if clo(f) & set(touched)}
affected = set(touched) | reach_touched | set().union(*[clo(t) for t in touched]) if touched else set()
out = {'task': TASK, 'observedAt': now(), 'rule': 'SPEC0247 §3.6 (regras 1–7)', 'labels': {'base': b, 'baseDiag': bd, 'vN': v, 'vNDiag': vd}, 'modes': {}}
out.update({'touchedCriterion': 'C0 = ao menos uma categoria; C1 = o valor final contém o objeto inicial (a base tinha VOID); C2 = uma junção mudou o valor rastreado em algum ponto (joinsChanged > 0). O C2 é um superconjunto da definição da §3.6 (valor final diferente do da base; ex.: X07, em que a escrita seguinte devolve o mesmo 1): só alarga os módulos tocados e os arquivos afetados, o que é conservador para as regras 1–3 (R1-P3-03)'})
for mode in ('normal', 'strict'):
    a, c = rep(b, mode), rep(v, mode)
    sa, sc = a['semanticBoundary'], c['semanticBoundary']
    ta, tc = Counter(key(u) for u in sa['unknowns']), Counter(key(u) for u in sc['unknowns'])
    gone, new = ta - tc, tc - ta
    va = Counter(key(x) for x in sa['violations'] + a['violations']); vc = Counter(key(x) for x in sc['violations'] + c['violations'])
    lit_base = paths_of({k: y for k, y in a.items() if k != 'semanticTelemetry'}, OLD_VERSION)
    lit_vn = paths_of({k: y for k, y in c.items() if k != 'semanticTelemetry'}, NEW_VERSION)
    m = {'diagnostics': [len(a['diagnostics']), len(c['diagnostics'])], 'tuples': [sum(ta.values()), sum(tc.values())],
         'tuplesGone': [json.loads(x) for x in gone.elements()][:50], 'tuplesNew': [json.loads(x) for x in new.elements()][:50],
         'tupleMultisetEqual': not gone and not new, 'diagnosticsEqual': D(a) == D(c),
         'versionLiteralPaths': {'base': lit_base, 'vN': lit_vn}, 'kernelVersion': [sa['kernelVersion'], sc['kernelVersion']],
         'payloadEqualExceptTelemetryAndVersion': strip(a) == strip(c),
         'violations': [sum(va.values()), sum(vc.values())], 'violationsEqual': va == vc, 'proofs': [len(sa['proofs']), len(sc['proofs'])],
         'validation': [sa['validation'], sc['validation']], 'phases': [sa['phases'], sc['phases']], 'limitsEqual': sa['limits'] == sc['limits'],
         'usage': {k: [sa['usage'][k], sc['usage'][k]] for k in ('contexts', 'states', 'callDepth', 'unionValues', 'nodes', 'files')},
         'baseEqualsSealedV6Diagnostics': D(a) == D(sealed6)}
    m['pass'] = (m['tupleMultisetEqual'] and m['payloadEqualExceptTelemetryAndVersion'] and m['violationsEqual'] and m['proofs'] == [0, 0]
                 and all(x == {'valid': True} for x in m['validation']) and m['limitsEqual'] and lit_base == ['$.semanticBoundary.kernelVersion']
                 and lit_vn == ['$.semanticBoundary.kernelVersion'] and m['kernelVersion'] == [OLD_VERSION, NEW_VERSION])
    out['modes'][mode] = m
nstrip = lambda r: json.dumps({k: y for k, y in r.items() if k != 'semanticTelemetry'}, sort_keys=True)
out['vNNormalEqualsStrict'] = nstrip(rep(v, 'normal')) == nstrip(rep(v, 'strict'))
out['baseNormalEqualsStrict'] = nstrip(rep(b, 'normal')) == nstrip(rep(b, 'strict'))
req = [r for r in rows.values() if r.get('mode') == 'require']
modes_vn = Counter(dvn['modes'].values())
out['denominators'] = {
    'loadedModulesByMode': dict(modes_vn), 'cjsRows': len(rows), 'requireModeModules': len(req),
    'requireModeByExtension': dict(Counter(r['file'].rsplit('.', 1)[-1] for r in req)),
    'requireModeTopDirs': sorted({'/'.join(rel(r['file']).split('/')[:2]) for r in req}),
    'requireModeInstalled': sum(1 for r in req if 'node_modules/' in r['file']),
    'cjsWithTopLevelWrites': sum(1 for r in req if r['topWrites']), 'cjsWithFunctionBodyWrites': sum(1 for r in req if r['functionWrites']),
    'cjsByCategory': dict(Counter(c for r in req for c in r.get('categories') or [])), 'cjsWithAnyCategory': sum(1 for r in req if r.get('categories')),
    'cjsWithJoinThatChangedValue': sum(1 for r in req if r['joinsChanged']),
    'initialObjectKept': sum(1 for r in req if r.get('initialObjectKept')), 'foreignInitialObject': sum(1 for r in req if r.get('foreignInitialObject')),
    'opaqueForImporters': sum(1 for r in req if r.get('opaqueForImporters')),
    'finalKind': dict(Counter(r.get('finalKind') for r in req)),
    'touchedModules': len(touched), 'touchedByCause': dict(Counter(c for cs in touched.values() for c in cs)),
    'touchedList': [{'file': f, 'causes': cs} for f, cs in sorted(touched.items())],
    'affectedFiles': len(affected), 'filesReachingTouched': len(reach_touched), 'graphFiles': len(files),
    'graphEdges': sum(len(x) for x in E.values()), 'edgeSetEqualBaseVsVN': eset(dbase) == eset(dvn),
    'filesEqualBaseVsVN': sorted(rel(f) for f in dbase['files']) == sorted(rel(f) for f in dvn['files']),
    'contextsTopVN': dvn.get('contextsTop', [])[:5]}
caps = rep(v, 'normal')['semanticBoundary']['limits']
u = rep(v, 'normal')['semanticBoundary']['usage']
out['usageVsCaps'] = {k: {'used': u[k], 'cap': caps[c], 'margin': caps[c] - u[k]} for k, c in
                      (('contexts', 'maxContexts'), ('states', 'maxStates'), ('callDepth', 'maxCallDepth'), ('unionValues', 'maxUnionValues'), ('nodes', 'maxNodes'), ('files', 'maxFiles'))}
out['status'] = 'PASS' if all(m['pass'] for m in out['modes'].values()) and out['vNNormalEqualsStrict'] else 'FAIL'
save(outname, out)
print(json.dumps({'status': out['status'], 'vNNormalEqualsStrict': out['vNNormalEqualsStrict'],
                  'modes': {k: {x: y for x, y in m.items() if x in ('diagnostics', 'tuples', 'tupleMultisetEqual', 'payloadEqualExceptTelemetryAndVersion', 'versionLiteralPaths', 'violations', 'proofs', 'validation', 'usage', 'baseEqualsSealedV6Diagnostics', 'pass')} for k, m in out['modes'].items()},
                  'denominators': {k: y for k, y in out['denominators'].items() if k not in ('touchedList', 'contextsTopVN')}}, indent=1, ensure_ascii=False)[:6000])
