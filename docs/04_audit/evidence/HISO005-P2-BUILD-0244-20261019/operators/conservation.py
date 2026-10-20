"""SPEC0244 §3.3 conservation on the evaluated root 228e7918, tuple by tuple, normal and strict:
v4 (base scripts) against v5 (frozen candidate), same references; trigger tags from the v4 tag copy (diag_patch +
cause_patch, proven to reproduce the v4 tuples of both runs); touched modules from the v5 dump copy (proven to
reproduce the v5 tuples); graph = v4 non-census resolution edges. Root class 1 requires the tags to be contained in the
missing-export tags plus U-* (with at least one missing-export tag). The verdict is computed with the published
touched superset and with the SPEC wording (touchedStrict); every gone and new tuple is listed per mode in
<out>-tuples-<mode>.json.gz. usage: conservation.py <v4> <v4tags> <v5> <v5diag> <out>"""
import gzip, json, sys
from collections import Counter
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

v4, v4tags, v5, v5diag, outname = sys.argv[1:6]
ENVELOPE = {'UNKNOWN_ANALYSIS_LIMIT', 'UNKNOWN_REVALIDATION', 'UNKNOWN_WORKER_ERROR', 'UNKNOWN_INVALID_WORKER_RESULT', 'UNKNOWN_INPUT_REVALIDATION',
            'UNKNOWN_INSTALLED_REFERENCE', 'UNKNOWN_HOST_VALIDATION'}
gz = lambda name: json.loads(gzip.decompress((EV / name).read_bytes()))
def rep(label, mode):
    return gz('real-' + label + '-' + mode + '-report.json.gz')
key = lambda u: (u.get('file') or '', u['reason'], u.get('detail') or '')
tuples = lambda r: Counter(key(u) for u in r['semanticBoundary']['unknowns'])
diags = lambda r: Counter(json.dumps(d, sort_keys=True) for d in r['diagnostics'])
viol = lambda r: Counter(json.dumps(v, sort_keys=True) for v in r['semanticBoundary']['violations'] + r['violations'])
official = {m: json.loads(gzip.decompress((OFFICIAL_V4 / ('real-final-0242-' + m + '-report.json.gz')).read_bytes())) for m in ('normal', 'strict')}
out = {'task': TASK, 'observedAt': now(), 'rule': 'SPEC0244 §3.3', 'labels': {'v4': v4, 'v4tags': v4tags, 'v5': v5, 'v5diag': v5diag}, 'modes': {}}
dump4 = gz('diag-' + v4tags + '-normal.json.gz')
dump5 = gz('diag-' + v5diag + '-normal.json.gz')
root = dump4['root'] + '/'
rel = lambda p: p[len(root):] if p.startswith(root) else p
E = {rel(k): sorted({rel(x) for x in v}) for k, v in dump4['edges'].items()}
files = {rel(f) for f in dump4['files']}
FAMILY = {}
for fam, reasons in {'propagacao_ou_dominio': ['UNKNOWN_BINDING_VALUE', 'UNKNOWN_PROPERTY', 'UNKNOWN_CALL', 'UNKNOWN_EXPORT', 'UNKNOWN_INHERITED_PROPERTY'],
                     'dominio': ['UNKNOWN_UNSUPPORTED_SYNTAX', 'UNKNOWN_FUNCTION', 'UNKNOWN_OPERATOR', 'UNKNOWN_TEMPLATE', 'UNKNOWN_OBJECT', 'UNKNOWN_ARRAY',
                                 'UNKNOWN_OPTIONAL_CHAIN', 'UNKNOWN_BINDING_PATTERN', 'UNKNOWN_THIS', 'UNKNOWN_PARTIAL_RETURN', 'UNKNOWN_MISSING_INITIALIZER',
                                 'UNKNOWN_RUNTIME_DECLARATION', 'UNKNOWN_REEXPORT', 'UNKNOWN_CYCLE', 'UNKNOWN_IMPORT_ATTRIBUTES'],
                     'intrinsecos_builtins': ['UNKNOWN_BINDING', 'UNKNOWN_NATIVE_BUILTIN'],
                     'fato_do_codigo': ['UNKNOWN_EXPORTED_MUTABLE_STATE', 'UNKNOWN_MUTABLE_BINDING', 'UNKNOWN_MUTATION', 'UNKNOWN_REFLECTION']}.items():
    for r_ in reasons:
        FAMILY[r_] = fam
MISSING = {'missing-export-star-reexport', 'missing-export-refused-class'}
touched = {rel(f) for f in dump5['touched']}
touched_strict = {rel(f) for f in dump5.get('touchedStrict', dump5['touched'])}
memo = {}
def clo(f):
    if f in memo: return memo[f]
    seen, st = set(), [f]
    while st:
        n = st.pop()
        if n in seen: continue
        seen.add(n); st.extend(E.get(n, []))
    memo[f] = seen
    return seen
def sets(tset):
    down_ = set().union(*[clo(t) for t in tset]) if tset else set()
    cone_ = {f for f in files if clo(f) & tset}
    return down_, cone_, (tset | down_ | cone_)
down, cone, union = sets(touched)
downS, coneS, unionS = sets(touched_strict)
for mode in ('normal', 'strict'):
    r4, r4t, r5 = rep(v4, mode), rep(v4tags, mode), rep(v5, mode)
    dumpt = gz('diag-' + v4tags + '-' + mode + '.json.gz')
    T = {}
    for k, v in dumpt['tags']:
        i = json.loads(k); T[(i['file'] or '', i['reason'], i['detail'] or '')] = set(v)
    refused = {f: set(v) for f, v in dumpt['refused']}
    t4, t5 = tuples(r4), tuples(r5)
    is_prop = lambda t: bool(T.get(t)) and all(x.startswith('U-') for x in T[t])
    gone, new = list((t4 - t5).elements()), list((t5 - t4).elements())
    goneCls, bad, goneRows = Counter(), [], []
    for t in gone:
        f, reason, detail = t
        if reason in ENVELOPE:
            c, ok = 'envelope (fora da regra)', True
        elif is_prop(t):
            ok = bool(clo(f) & touched); c = 'propagação em arquivo cujo fecho contém módulo tocado' if ok else 'PROPAGACAO_FORA_DO_CONE'
        elif reason == 'UNKNOWN_INHERITED_PROPERTY' and T.get(t, set()) & MISSING and all(x in MISSING or x.startswith('U-') for x in T[t]):
            c, ok = 'raiz 1: export ausente por estrela ou classe', True
        elif reason == 'UNKNOWN_REEXPORT' and detail == '' and f in touched:
            c, ok = 'raiz 2: estrela agora modelada', True
        elif reason == 'UNKNOWN_BINDING' and detail in refused.get(f, set()):
            c, ok = 'raiz 3: nome de classe agora ligado', True
        else:
            c, ok = 'RAIZ_PERDIDA', False
        goneCls[c] += 1
        goneRows.append({'tuple': list(t), 'class': c, 'tags': sorted(T.get(t, [])), 'strictConeOk': (not is_prop(t)) or bool(clo(f) & touched_strict)})
        if not ok: bad.append(list(t))
    def place(f):
        if f in touched: return 'em módulo tocado'
        if f in down: return 'a jusante de módulo tocado'
        if clo(f) & touched: return 'em arquivo cujo fecho contém módulo tocado'
        return 'SEM_CAUSA'
    def placeStrict(f):
        if f in touched_strict: return 'em módulo tocado'
        if f in downS: return 'a jusante de módulo tocado'
        if clo(f) & touched_strict: return 'em arquivo cujo fecho contém módulo tocado'
        return 'SEM_CAUSA'
    newRows = [{'tuple': list(t), 'placement': place(t[0]), 'placementStrict': placeStrict(t[0]), 'reason': t[1], 'family': FAMILY.get(t[1], 'resolucao_formato_proveniencia')} for t in new]
    lists = outname.replace('.json', '') + '-tuples-' + mode + '.json.gz'
    (EV / lists).write_bytes(gzip.compress(json.dumps({'gone': sorted(goneRows, key=lambda x: x['tuple']), 'new': sorted(newRows, key=lambda x: x['tuple'])},
                                                     ensure_ascii=False, sort_keys=True).encode(), mtime=0))
    newCls = Counter(place(t[0]) for t in new if t[1] not in ENVELOPE)
    newBad = [list(t) for t in new if t[1] not in ENVELOPE and place(t[0]) == 'SEM_CAUSA']
    props = [t for t in t4 if is_prop(t)]
    s4, s5 = r4['semanticBoundary'], r5['semanticBoundary']
    m = {'v4ReproducesOfficial13521': diags(r4) == diags(official[mode]), 'v4Diagnostics': len(r4['diagnostics']), 'v5Diagnostics': len(r5['diagnostics']),
         'tagCopyReproducesV4': {'diagnostics': diags(r4t) == diags(r4), 'tuples': tuples(r4t) == t4, 'tagKeysEqualTuples': set(T) == set(t4)},
         'v4Tuples': sum(t4.values()), 'v5Tuples': sum(t5.values()), 'gone': len(gone), 'goneClassified': dict(goneCls), 'rootsLost': bad[:50],
         'goneByReason': dict(Counter(t[1] for t in gone).most_common()), 'new': len(new), 'newPlaced': dict(newCls), 'newWithoutCause': newBad[:50],
         'newByReason': dict(Counter(t[1] for t in new).most_common()),
         'violationsV4ContainedInV5': not (viol(r4) - viol(r5)), 'violations': [sum(viol(r4).values()), sum(viol(r5).values())],
         'proofsV5': len(s5['proofs']), 'status': [s4['status'], s5['status']], 'validation': [s4['validation'], s5['validation']],
         'kernelVersion': [s4.get('kernelVersion'), s5.get('kernelVersion')], 'limitsEqual': s4.get('limits') == s5.get('limits'),
         'phases': [s4.get('phases'), s5.get('phases')], 'bodyCoverage': [s4.get('bodyCoverage'), s5.get('bodyCoverage')],
         'inputsEqual': s4.get('inputs') == s5.get('inputs'), 'runtimeResolutionEqual': s4.get('runtimeResolution') == s5.get('runtimeResolution'),
         'compiledProvenanceEqual': s4.get('compiledProvenance') == s5.get('compiledProvenance'),
         'installedFileIdentityEqual': s4.get('installedFileIdentity') == s5.get('installedFileIdentity'),
         'denominators': {'analyzedFiles': len(files), 'touched': len(touched & files), 'downstream': len(down & files), 'cone': len(cone),
                          'union': len(union & files), 'v4TuplesInUnion': sum(n for t, n in t4.items() if t[0] in union),
                          'v4Roots': sum(t4.values()) - len(props), 'v4Propagations': len(props),
                          'v4PropagationsAdmissible': sum(1 for t in props if clo(t[0]) & touched),
                          'propagationsGone': goneCls.get('propagação em arquivo cujo fecho contém módulo tocado', 0)},
         'denominatorsStrict': {'touched': len(touched_strict & files), 'downstream': len(downS & files), 'cone': len(coneS), 'union': len(unionS & files),
                                'v4TuplesInUnion': sum(n for t, n in t4.items() if t[0] in unionS),
                                'v4PropagationsAdmissible': sum(1 for t in props if clo(t[0]) & touched_strict)},
         'strictVerdict': {'propagationsGoneOutsideStrictCone': sum(1 for x in goneRows if not x['strictConeOk']),
                           'newWithoutStrictCause': sum(1 for x in newRows if x['reason'] not in ENVELOPE and x['placementStrict'] == 'SEM_CAUSA'),
                           'newPlacedStrict': dict(Counter(x['placementStrict'] for x in newRows))},
         'tupleLists': {'path': lists, 'sha256': sha(EV / lists)}}
    m['passStrict'] = m['strictVerdict']['propagationsGoneOutsideStrictCone'] == 0 and m['strictVerdict']['newWithoutStrictCause'] == 0
    m['pass'] = (m['v4ReproducesOfficial13521'] and all(m['tagCopyReproducesV4'].values()) and not bad and not newBad and m['violationsV4ContainedInV5']
                 and m['proofsV5'] == 0 and all(v.get('valid') for v in m['validation']) and m['limitsEqual'])
    out['modes'][mode] = m
r5n, r5s, r5d = rep(v5, 'normal'), rep(v5, 'strict'), rep(v5diag, 'normal')
strip = lambda r: json.dumps({k: v for k, v in r.items() if k != 'semanticTelemetry'}, sort_keys=True)
out['v5NormalEqualsStrict'] = strip(r5n) == strip(r5s)
out['v4NormalEqualsStrict'] = strip(rep(v4, 'normal')) == strip(rep(v4, 'strict'))
out['v5DumpCopyReproducesV5'] = {'diagnostics': diags(r5d) == diags(r5n), 'tuples': tuples(r5d) == tuples(r5n)}
out['touchedDefinition'] = {'touched': 'superconjunto publicado: E1 processou qualquer estrela do módulo (qualificada ou não) ou E2 encontrou/pré-declarou uma classe',
                             'touchedStrict': 'texto da SPEC: E1 modelou uma estrela qualificada ou E2 ligou um nome de classe'}
out['touchedModules'] = sorted(touched)
out['touchedStrictModules'] = sorted(touched_strict)
out['incompleteNamespaces'] = sorted(rel(f) for f in dump5['incomplete'])
out['ambiguousStarNames'] = [[rel(f), v] for f, v in dump5['ambiguous']]
out['status'] = 'PASS' if all(m['pass'] for m in out['modes'].values()) and out['v5NormalEqualsStrict'] and all(out['v5DumpCopyReproducesV5'].values()) else 'FAIL'
save(outname, out)
print(json.dumps({'status': out['status'], 'v5NormalEqualsStrict': out['v5NormalEqualsStrict'], 'dump': out['v5DumpCopyReproducesV5'],
                  'modes': {m: {k: v for k, v in x.items() if k not in ('phases', 'bodyCoverage', 'rootsLost', 'newWithoutCause')} for m, x in out['modes'].items()},
                  'ambiguous': out['ambiguousStarNames'], 'incomplete': len(out['incompleteNamespaces'])}, indent=1, ensure_ascii=False)[:6000])
