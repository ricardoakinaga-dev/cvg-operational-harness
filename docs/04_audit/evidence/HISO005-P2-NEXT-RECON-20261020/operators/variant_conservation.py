"""Explains every tuple that disappears or appears in a variant against the official measurement, using the
baseline cause tags, the refused-class / star re-export lists and the semantic graph. usage: variant_conservation.py v2"""
import gzip, json, sys
from collections import Counter, defaultdict
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

name = sys.argv[1]
base = report('normal')
var = json.loads(gzip.decompress((RUNTIME / ('variant-' + name + '-report.json.gz')).read_bytes()))
key = lambda x: (x.get('file') or '', x['reason'], x.get('detail') or '')
tb = Counter(key(x) for x in base['semanticBoundary']['unknowns'])
tv = Counter(key(x) for x in var['semanticBoundary']['unknowns'])
gone, new = list((tb - tv).elements()), list((tv - tb).elements())
ct = json.loads(gzip.decompress((EV / 'cause-tags.json.gz').read_bytes()))
btags = {}
for k, v in ct['tags']:
    i = json.loads(k); btags[(i['file'], i['reason'], i['detail'])] = set(v)
refused = {f: set(v) for f, v in ct['refused']}
g = json.loads(gzip.decompress((EV / 'semantic-graph.json.gz').read_bytes()))
root = g['root'] + '/'; rel = lambda p: p[len(root):] if p.startswith(root) else p
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
touched = set(refused)
def explain_gone(t):
    f, reason, detail = t
    tags = btags.get(t, set())
    if reason == 'UNKNOWN_INHERITED_PROPERTY' and tags & {'missing-export-star-reexport', 'missing-export-refused-class'}:
        return 'export ausente por estrela/classe recusada'
    if reason == 'UNKNOWN_REEXPORT' and '*' in refused.get(f, set()):
        return 'reexport estrela agora modelado'
    if reason == 'UNKNOWN_BINDING' and detail in refused.get(f, set()):
        return 'nome de classe recusada agora ligado'
    if tags and tags <= {'U-binding', 'U-callee', 'U-receiver', 'U-export', 'U-operand'} and clo(f) & touched:
        return 'consequência com fecho tocado'
    return 'NAO_EXPLICADO'
def explain_new(t):
    f, reason, detail = t
    if f in touched or clo(f) & touched:
        return 'arquivo ou fecho tocado'
    return 'NAO_EXPLICADO'
eg = Counter(explain_gone(t) for t in gone)
en = Counter(explain_new(t) for t in new)
rec = {'task': TASK, 'variant': name, 'observedAt': now(), 'gone': len(gone), 'new': len(new), 'goneExplained': dict(eg), 'newExplained': dict(en),
       'unexplainedGone': [list(t) for t in gone if explain_gone(t) == 'NAO_EXPLICADO'][:20],
       'unexplainedNew': [list(t) for t in new if explain_new(t) == 'NAO_EXPLICADO'][:20],
       'violations': [len(base['semanticBoundary']['violations']), len(var['semanticBoundary']['violations'])],
       'proofs': len(var['semanticBoundary']['proofs']), 'netDiagnostics': len(var['diagnostics']) - len(base['diagnostics'])}
save('variant-' + name + '-conservation.json', rec)
print(json.dumps(rec, indent=1, ensure_ascii=False)[:2500])
