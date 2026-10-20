"""R3 measures for the R2 optional items, without touching the R2-frozen artifacts:
R2-O6: intrinsics split with the ECMA-262 (plus ECMA-402 Intl) global list instead of Node's globalThis;
R2-O2: denominator of the union admitted by §3.3 rule 3 (touched, downstream, cone) for v5a.
Writes r3-measures.json. Read-only over the sealed reports, the graphs, the tags and classification-r2.json."""
import gzip, json, sys
from collections import Counter
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

ECMA262 = {'globalThis', 'Infinity', 'NaN', 'undefined', 'eval', 'isFinite', 'isNaN', 'parseFloat', 'parseInt', 'decodeURI', 'decodeURIComponent',
           'encodeURI', 'encodeURIComponent', 'escape', 'unescape', 'AggregateError', 'Array', 'ArrayBuffer', 'BigInt', 'BigInt64Array',
           'BigUint64Array', 'Boolean', 'DataView', 'Date', 'Error', 'EvalError', 'FinalizationRegistry', 'Float16Array', 'Float32Array',
           'Float64Array', 'Function', 'Int8Array', 'Int16Array', 'Int32Array', 'Iterator', 'Map', 'Number', 'Object', 'Promise', 'Proxy',
           'RangeError', 'ReferenceError', 'RegExp', 'Set', 'SharedArrayBuffer', 'String', 'Symbol', 'SyntaxError', 'TypeError', 'Uint8Array',
           'Uint8ClampedArray', 'Uint16Array', 'Uint32Array', 'URIError', 'WeakMap', 'WeakRef', 'WeakSet', 'Atomics', 'JSON', 'Math', 'Reflect',
           'Intl'}
c2 = load('classification-r2.json')
U = report('normal')['semanticBoundary']['unknowns']
ct = json.loads(gzip.decompress((EV / 'cause-tags-k0.json.gz').read_bytes()))
refused = {f: set(v) for f, v in ct['refused']}
intr = [x for x in U if not (x['file'] or '').endswith('.tsx') and
        (x['reason'] == 'UNKNOWN_NATIVE_BUILTIN' or (x['reason'] == 'UNKNOWN_BINDING' and x['detail'] not in refused.get(x['file'], set())))]
r2_names = {n for k, rows in c2['intrinsics']['topNames'].items() for n, _ in rows if k != 'modulo_nativo'}
ambient = {n for n, _ in c2['intrinsics']['topNames'].get('global_de_ambiente_sem_declaracao', [])}
def kind(x):
    if x['reason'] == 'UNKNOWN_NATIVE_BUILTIN': return 'modulo_nativo'
    if x['detail'] in ECMA262: return 'global_ecmascript'
    if x['detail'] in ambient: return 'global_de_ambiente_sem_declaracao'
    return 'global_de_host'
split = Counter(kind(x) for x in intr)
assert len(intr) == c2['intrinsics']['tuples'] == sum(split.values())
names = {k: [[n, c] for n, c in Counter(x['detail'] for x in intr if kind(x) == k).most_common(20)] for k in split if k != 'modulo_nativo'}
moved = sorted({x['detail'] for x in intr if x['reason'] == 'UNKNOWN_BINDING' and kind(x) == 'global_de_host'} &
               {n for n, _ in c2['intrinsics']['topNames']['global_ecmascript']})
# union denominator of rule 3 (v5a)
g = json.loads(gzip.decompress((EV / 'semantic-graph.json.gz').read_bytes()))
g5 = json.loads((RUNTIME / 'graph-v5a.json').read_text())
root = g['root'] + '/'; rel = lambda p: p[len(root):] if p.startswith(root) else p
E = {rel(k): sorted({rel(x) for x in v}) for k, v in g['edges'].items()}
files = {rel(f) for f in g['files']}
touched = {rel(f) for f in g5['touched']}
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
down = set().union(*[clo(t) for t in touched])
cone = {f for f in files if clo(f) & touched}
union = (touched | down | cone) & files
rec = {'task': TASK, 'observedAt': now(), 'source': {'classification-r2.json': sha(EV / 'classification-r2.json'), 'graph-v5a.json': sha(RUNTIME / 'graph-v5a.json')},
       'intrinsicsECMA262': {'rule': 'global ECMAScript = propriedade do objeto global da ECMA-262 (mais Intl, ECMA-402); o resto do globalThis do Node e os nomes web/Node vão para host',
                             'tuples': len(intr), 'split': dict(split.most_common()), 'topNames': names, 'movedFromEcmascriptToHost': moved},
       'rule3Union': {'analyzedFiles': len(files), 'touched': len(touched & files), 'downstream': len(down & files), 'cone': len(cone),
                      'unionFiles': len(union), 'v4TuplesInUnion': sum(1 for x in U if x['file'] in union), 'v4Tuples': len(U)}}
save('r3-measures.json', rec)
print(json.dumps(rec, ensure_ascii=False, indent=1))
