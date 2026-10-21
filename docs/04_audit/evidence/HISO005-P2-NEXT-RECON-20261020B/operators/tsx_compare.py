"""SPEC0245 measurement: v5 baseline (tag copy, equal to the BUILD0244 final) against each TSX variant, tuple by
tuple: where tuples go and come (in .tsx files, in files downstream of a .tsx file through the baseline graph, or
elsewhere), by reason and detail; TSX parse failures; JSX refusals; contexts usage. usage: tsx_compare.py <variant>..."""
import gzip, json, sys
from collections import Counter
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

gz = lambda n: json.loads(gzip.decompress((EV / n).read_bytes()))
base = gz('real-v5tags-normal-report.json.gz')
dump = gz('diag-v5tags-normal.json.gz')
root = dump['root'] + '/'; rel = lambda p: p[len(root):] if p.startswith(root) else p
E = {}
for k, v in dump['edges'].items(): E.setdefault(rel(k), set()).update(rel(x) for x in v)
files = {rel(f) for f in dump['files']}
tsx = {f for f in files if f.endswith('.tsx') or f.endswith('.jsx')}
def clo(f):
    seen, st = set(), [f]
    while st:
        n = st.pop()
        if n in seen: continue
        seen.add(n); st.extend(E.get(n, ()))
    return seen
down = set().union(*[clo(f) for f in tsx]) - tsx
key = lambda u: (u.get('file') or '', u['reason'], u.get('detail') or '')
tb = Counter(key(u) for u in base['semanticBoundary']['unknowns'])
place = lambda f: 'tsx' if f.endswith('.tsx') or f.endswith('.jsx') else ('a jusante de tsx' if f in down else 'outro')
out = {'task': TASK, 'observedAt': now(), 'baseline': {'label': 'v5tags', 'diagnostics': len(base['diagnostics']), 'tuples': sum(tb.values()),
       'tsxFiles': len(tsx), 'tsxTuples': sum(n for t, n in tb.items() if place(t[0]) == 'tsx'), 'downstreamFiles': len(down),
       'parseInTsx': sum(1 for t in tb if t[1] == 'UNKNOWN_PARSE' and place(t[0]) == 'tsx')}, 'variants': {}}
for v in sys.argv[1:]:
    r = gz('real-' + v + '-normal-report.json.gz')
    d = gz('diag-' + v + '-normal.json.gz')
    tv = Counter(key(u) for u in r['semanticBoundary']['unknowns'])
    gone, new = tb - tv, tv - tb
    summ = load('real-' + v + '-summary.json')['runs'][0]
    out['variants'][v] = {
        'diagnostics': len(r['diagnostics']), 'delta': len(r['diagnostics']) - len(base['diagnostics']), 'tuples': sum(tv.values()),
        'goneByPlace': dict(Counter(place(t[0]) for t in gone.elements())), 'newByPlace': dict(Counter(place(t[0]) for t in new.elements())),
        'goneOutsideTsxAndDownstream': [list(t) for t in gone.elements() if place(t[0]) == 'outro'][:20],
        'newOutsideTsxAndDownstream': [list(t) for t in new.elements() if place(t[0]) == 'outro'][:20],
        'goneByReason': dict(Counter(t[1] for t in gone.elements()).most_common()), 'newByReason': dict(Counter(t[1] + (':' + t[2] if t[1] == 'UNKNOWN_UNSUPPORTED_SYNTAX' else '') for t in new.elements()).most_common(15)),
        'tsxTuplesAfter': sum(n for t, n in tv.items() if place(t[0]) == 'tsx'),
        'tsxByReasonAfter': dict(Counter(t[1] + (':' + t[2] if t[1] in ('UNKNOWN_UNSUPPORTED_SYNTAX',) else '') for t in tv.elements() if place(t[0]) == 'tsx').most_common(20)),
        'parseInTsxAfter': sum(1 for t in tv if t[1] == 'UNKNOWN_PARSE' and place(t[0]) == 'tsx'),
        'violations': len(r['semanticBoundary']['violations']) + len(r['violations']), 'proofs': len(r['semanticBoundary']['proofs']),
        'validation': r['semanticBoundary']['validation'], 'phases': r['semanticBoundary']['phases'],
        'usage': {k: summ['usage'][k] for k in ('contexts', 'states', 'callDepth', 'unionValues', 'nodes')}, 'limits': summ['limits'],
        'contextsTop': d.get('contextsTop', [])[:5], 'workerElapsedMs': round(summ['telemetry']['elapsedMs'])}
save('tsx-variants.json', out)
print(json.dumps(out['baseline']))
for v, x in out['variants'].items():
    print(v, x['diagnostics'], x['delta'], 'gone', x['goneByPlace'], 'new', x['newByPlace'], 'tsxAfter', x['tsxTuplesAfter'], 'parseAfter', x['parseInTsxAfter'], 'ctx', x['usage']['contexts'], x['usage']['states'])
    print('   newByReason', x['newByReason']); print('   outside gone/new', x['goneOutsideTsxAndDownstream'][:5], x['newOutsideTsxAndDownstream'][:5])
    print('   tsxAfter', x['tsxByReasonAfter'])
