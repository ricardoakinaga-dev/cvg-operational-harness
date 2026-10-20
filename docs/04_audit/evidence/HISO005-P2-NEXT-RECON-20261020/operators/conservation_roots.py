"""SPEC0244 r2 §3.3 check of a variant against the official v4 measurement:
(1) every v4 root (tuple whose trigger tags are not all U-*) persists, except the three listed classes;
(2) a v4 propagation tuple may disappear only in a file whose v4 closure contains a touched module;
(3) every new tuple is causally placed: in a touched module, downstream of one (a body made reachable through a
modeled star or bound class), or in a file whose closure contains one; (4) violations contained; (5) no proof on the
real root. Denominators of the admitted sets are published.
usage: conservation_roots.py <variant>"""
import gzip, json, sys
from collections import Counter
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

name = sys.argv[1]
base = report('normal')
var = json.loads(gzip.decompress((RUNTIME / ('variant-' + name + '-report.json.gz')).read_bytes()))
vg = json.loads((RUNTIME / ('graph-' + name + '.json')).read_text())
key = lambda x: (x.get('file') or '', x['reason'], x.get('detail') or '')
tb = Counter(key(x) for x in base['semanticBoundary']['unknowns'])
tv = Counter(key(x) for x in var['semanticBoundary']['unknowns'])
gone, new = list((tb - tv).elements()), list((tv - tb).elements())
ct = json.loads(gzip.decompress((EV / 'cause-tags-binding.json.gz').read_bytes()))
tags = {}
for k, v in ct['tags']:
    i = json.loads(k); tags[(i['file'], i['reason'], i['detail'])] = set(v)
refused = {f: set(v) for f, v in ct['refused']}
root = vg['root'] + '/'; rel = lambda p: p[len(root):] if p.startswith(root) else p
touched = {rel(f) for f in vg['touched']}
g = json.loads(gzip.decompress((EV / 'semantic-graph.json.gz').read_bytes()))
E = {rel(k): sorted({rel(x) for x in v}) for k, v in g['edges'].items()}
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
is_prop = lambda t: bool(tags.get(t)) and all(x.startswith('U-') for x in tags[t])
result = Counter(); bad = []
for t in gone:
    f, reason, detail = t
    if is_prop(t):
        ok = bool(clo(f) & touched); cls = 'propagação no cone de módulo tocado' if ok else 'PROPAGACAO_FORA_DO_CONE'
    elif reason == 'UNKNOWN_INHERITED_PROPERTY' and tags.get(t, set()) & {'missing-export-star-reexport', 'missing-export-refused-class'}:
        ok, cls = True, 'raiz (1): export ausente por estrela ou classe'
    elif reason == 'UNKNOWN_REEXPORT' and f in touched:
        ok, cls = True, 'raiz (2): estrela agora modelada'
    elif reason == 'UNKNOWN_BINDING' and detail in refused.get(f, set()):
        ok, cls = True, 'raiz (3): nome de classe agora ligado'
    else:
        ok, cls = False, 'RAIZ_PERDIDA'
    result[cls] += 1
    if not ok: bad.append(list(t))
down = set()
for t0 in touched:
    down |= clo(t0)
def new_cls(f):
    if f in touched: return 'modulo tocado'
    if f in down: return 'a jusante de modulo tocado (corpo alcancado por E1/E2)'
    if clo(f) & touched: return 'fecho contem modulo tocado'
    return 'SEM_CAUSA'
newc = Counter(new_cls(t[0]) for t in new)
new_bad = [list(t) for t in new if new_cls(t[0]) == 'SEM_CAUSA']
files_all = {rel(f) for f in g['files']}
props = [t for t in tb if is_prop(t)]
vb = Counter(json.dumps(v, sort_keys=True) for v in base['semanticBoundary']['violations'] + base['violations'])
vv = Counter(json.dumps(v, sort_keys=True) for v in var['semanticBoundary']['violations'] + var['violations'])
rec = {'task': TASK, 'variant': name, 'observedAt': now(), 'rule': 'SPEC0244 r2 §3.3', 'touchedModules': len(touched),
       'coneFiles': sum(1 for f in E.keys() | set(g['files']) if clo(rel(f)) & touched),
       'denominators': {'analyzedFiles': len(files_all), 'coneFiles': sum(1 for f in files_all if clo(f) & touched),
                        'downstreamFiles': len(down & files_all), 'v4Tuples': sum(tb.values()), 'v4PropagationTuples': len(props),
                        'v4PropagationTuplesInCone': sum(1 for t in props if clo(t[0]) & touched),
                        'v4RootTuples': sum(tb.values()) - len(props)},
       'gone': len(gone), 'goneClassified': dict(result), 'violatingTuples': bad[:30], 'new': len(new),
       'newByReason': dict(Counter(t[1] for t in new).most_common()), 'newClassified': dict(newc), 'newWithoutCause': new_bad[:30], 'violationsContained': not (vb - vv),
       'proofs': len(var['semanticBoundary']['proofs']), 'netDiagnostics': len(var['diagnostics']) - len(base['diagnostics']),
       'ambiguousNames': sum(len(v) for _, v in vg.get('ambiguous', [])), 'incompleteModules': len(vg.get('incomplete', [])),
       'status': 'PASS' if not bad and not new_bad and not (vb - vv) and not var['semanticBoundary']['proofs'] else 'FAIL'}
save('variant-' + name + '-conservation.json', rec)
print(json.dumps(rec, indent=1, ensure_ascii=False))
