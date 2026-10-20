"""What blocks the first B6 proof: the global rule in the engine, modules whose semantic closure is UNKNOWN-free,
and the origins with the smallest blocking closures (with their blocking tuples)."""
import gzip, json, sys
from collections import Counter, defaultdict
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

c = load('classification.json')
r = report('normal'); s = r['semanticBoundary']; U = s['unknowns']
g = json.loads(gzip.decompress((EV / 'semantic-graph.json.gz').read_bytes()))
root = g['root'] + '/'; rel = lambda p: p[len(root):] if p.startswith(root) else p
E = {rel(k): sorted({rel(x) for x in v}) for k, v in g['edges'].items()}
nt = defaultdict(list)
for x in U:
    nt[x['file']].append(x)
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
per_file = defaultdict(list)
for o in s['origins']:
    if o['file'] and not o['file'].startswith('node_modules'):
        per_file[o['file']].append(o)
rows = []
for f, os_ in per_file.items():
    cl = clo(f)
    blockers = sorted({(x['file'], x['reason'], x['detail']) for n in cl for x in nt.get(n, [])})
    rows.append({'file': f, 'origins': len(os_), 'originReasons': dict(Counter(o['reason'] for o in os_)), 'closureFiles': len(cl),
                 'blockingTuples': len(blockers), 'blockers': [list(b) for b in blockers[:8]]})
rows.sort(key=lambda x: (x['blockingTuples'], x['file']))
engine = (RUNTIME / 'tools/scripts/boundary-semantic-engine.mjs').read_text().splitlines()
rule_line = next(i + 1 for i, l in enumerate(engine) if 'out.status = out.violations.length' in l)
rec = {'task': TASK, 'observedAt': now(),
       'globalRule': {'engine': 'scripts/boundary-semantic-engine.mjs (cabeça do PR #8)', 'line': rule_line,
                      'text': 'status = VIOLATION se há violação; senão UNKNOWN se há qualquer UNKNOWN; senão PROVEN. Provas K5 (módulo) e K7 (origem) só são emitidas com status PROVEN global.',
                      'unknownsToday': len(U)},
       'modulesWithCleanClosure': {'count': c['graph']['filesWithCleanClosure'], 'byCategory': c['graph']['cleanClosureByCategory'],
                                   'firstPartySrc': c['graph']['cleanClosureFirstPartySrc'],
                                   'meaning': 'fecho semântico (o próprio módulo e tudo que ele resolve) sem nenhuma tupla UNKNOWN e sem origem de base; seriam as primeiras provas K5 se uma regra por fecho, avaliado como entrada num realm novo, fosse aprovada (T3)'},
       'origins': {'baseline': len(s['origins']), 'firstParty': sum(len(v) for v in per_file.values()), 'filesWithOrigins': len(per_file),
                   'closureDistribution': c['origins']['closureDistribution'], 'withCleanClosure': 0, 'nearest': rows[:12]},
       'structural': {'K0': 'parâmetro de função exportada é U por regra (SPEC0236 K0); toda função pública que usa a entrada gera UNKNOWN_BINDING_VALUE, mesmo sem relação com carga de módulo',
                      'propagationShare': c['refinedFamilies']['counts']['propagacao']}}
save('first-proof-path.json', rec)
print(json.dumps({k: rec[k] for k in ('globalRule', 'modulesWithCleanClosure')}, indent=1, ensure_ascii=False)[:1500])
for x in rows[:8]: print(x['blockingTuples'], x['file'], x['originReasons'], x['blockers'])
