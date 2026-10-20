"""R2 path to the first B6 proof (answers R1-08, R1-O4): global rule; clean closures with explicit edge and origin
checks; edge-proof candidates (importers with a clean closure) and the nearest importers with their blockers and
whether a refusal hides a body; base origins with the installed ones mapped to their package directory; the same
count under the aligned E1+E2 variant (v5a). Read-only over the sealed reports, the graphs and classification-r2."""
import gzip, json, sys
from collections import Counter, defaultdict
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

c2 = load('classification-r2.json')
r = report('normal'); S = r['semanticBoundary']; U = S['unknowns']
g = json.loads(gzip.decompress((EV / 'semantic-graph.json.gz').read_bytes()))
root = g['root'] + '/'; rel = lambda p: p[len(root):] if p.startswith(root) else p
FILES = {rel(f) for f in g['files']}
E = {rel(k): sorted({rel(x) for x in v}) for k, v in g['edges'].items()}
ct = json.loads(gzip.decompress((EV / 'cause-tags-k0.json.gz').read_bytes()))
TAGS = {}
for k, v in ct['tags']:
    i = json.loads(k); TAGS[(i['file'], i['reason'], i['detail'])] = set(v)
BODY_SYNTAX = {'ClassDeclaration', 'ClassExpression', 'TryStatement', 'ForOfStatement', 'ForStatement', 'ForInStatement', 'WhileStatement',
               'DoStatement', 'SwitchStatement', 'LabeledStatement'}
hides = lambda b: b[1] == 'UNKNOWN_FUNCTION' or (b[1] == 'UNKNOWN_UNSUPPORTED_SYNTAX' and b[2] in BODY_SYNTAX)

def closures(unknowns, edges):
    nt = defaultdict(list)
    for x in unknowns: nt[x['file']].append(x)
    memo = {}
    def clo(f):
        if f in memo: return memo[f]
        seen, st = set(), [f]
        while st:
            n = st.pop()
            if n in seen: continue
            seen.add(n); st.extend(edges.get(n, []))
        memo[f] = seen
        return seen
    return nt, clo
nt, clo = closures(U, E)
origin_files = Counter(o['file'] for o in S['origins'])
pkg_of = lambda f: next((p for p in g['reachedPackages'] if f.startswith(p + '/')), None)
def blockers(f, nt_, clo_):
    return sorted({(x['file'], x['reason'], x['detail']) for n in clo_(f) for x in nt_.get(n, [])})
def origins_in(f, clo_):
    return sum(origin_files.get(n, 0) for n in clo_(f))
def package_state(f, clo_):
    return sorted({pkg_of(n) for n in clo_(f)} - {None})
clean = sorted(f for f in FILES if not blockers(f, nt, clo))
clean_rows = [{'file': f, 'edges': len(E.get(f, [])), 'originsInClosure': origins_in(f, clo), 'installedPackageState': package_state(f, clo),
               'importedBy': sorted(k for k, v in E.items() if f in v)}
              for f in clean]
importers = [f for f in FILES if E.get(f)]
edge_candidates = [f for f in importers if not blockers(f, nt, clo) and not origins_in(f, clo)]
def label(b):
    t = TAGS.get(tuple(b), set())
    k0 = 'K0' if 'U-binding:parametro-K0' in t else ''
    hide = 'esconde corpo' if hides(b) else ''
    return [x for x in (k0, hide) if x]
near = []
for f in importers:
    b = blockers(f, nt, clo)
    near.append((len(b), f, b))
near.sort()
nearest = [{'file': f, 'closureFiles': len(clo(f)), 'blockingTuples': n, 'originsInClosure': origins_in(f, clo),
            'bodyHiddenByRefusal': any(hides(x) for x in b), 'installedPackageState': package_state(f, clo),
            'blockers': [[*x, label(x)] for x in b[:10]]} for n, f, b in near[:12]]
honest = [x for x in nearest if not x['bodyHiddenByRefusal']]
near_honest = []
for n, f, b in near:
    if not any(hides(x) for x in b):
        near_honest.append({'file': f, 'blockingTuples': n, 'closureFiles': len(clo(f)), 'originsInClosure': origins_in(f, clo),
                            'installedPackageState': package_state(f, clo), 'blockers': [[*x, label(x)] for x in b[:12]]})
    if len(near_honest) == 5: break
edges_to_clean = [(k, t) for k, v in E.items() for t in v if t in set(clean)]
# variant v5a (aligned E1+E2), diagnostic only
v5 = json.loads(gzip.decompress((RUNTIME / 'variant-v5a-report.json.gz').read_bytes()))
g5 = json.loads((RUNTIME / 'graph-v5a.json').read_text())
E5 = {rel(k): sorted({rel(x) for x in v}) for k, v in g5['edges'].items()}
nt5, clo5 = closures(v5['semanticBoundary']['unknowns'], E5)
clean5 = sorted(f for f in {rel(x) for x in g5['files']} if not blockers(f, nt5, clo5))
imp5 = [f for f in {rel(x) for x in g5['files']} if E5.get(f)]
edge5 = [f for f in imp5 if not blockers(f, nt5, clo5)]
# origins
orow = []
for o in S['origins']:
    f = o['file']
    if o['reason'] == 'UNVERIFIED_INSTALLED_PACKAGE':
        p = f[:-len('/package.json')]
        files = [x for x in FILES if x.startswith(p + '/')]
        if not files:
            orow.append(('pacote não alcançado', None)); continue
        cl = set().union(*[clo(x) for x in files])
        orow.append(('instalado alcançado', sum(len(nt.get(n, [])) for n in cl)))
    else:
        cl = clo(f) if f in FILES else {f}
        orow.append(('primeira parte', sum(len(nt.get(n, [])) for n in cl)))
bucket = lambda n: '0' if n == 0 else '1-10' if n <= 10 else '11-100' if n <= 100 else '>100'
odist = Counter(k if n is None else k + ' ' + bucket(n) for k, n in orow)
engine = (RUNTIME / 'tools/scripts/boundary-semantic-engine.mjs').read_text().splitlines()
rule_line = next(i + 1 for i, l in enumerate(engine) if 'out.status = out.violations.length' in l)
k0 = c2['propagationByOrigin']['K0']['tuples']
rec = {'task': TASK, 'round': 'r2', 'observedAt': now(),
       'globalRule': {'line': rule_line, 'text': 'status = VIOLATION se há violação; senão UNKNOWN se há qualquer UNKNOWN; senão PROVEN. K5 (módulo) e K7 (origem) só saem com PROVEN global.',
                      'unknownsToday': len(U), 'consequence': 'com a regra atual nenhuma correção local produz prova enquanto existir uma única tupla na raiz'},
       'cleanClosures': {'count': len(clean), 'rows': clean_rows, 'allLeaves': all(x['edges'] == 0 for x in clean_rows),
                         'allWithoutOrigins': all(x['originsInClosure'] == 0 for x in clean_rows),
                         'originRule': 'originsInClosure conta origens de base registradas em arquivos do fecho (léxicas e não literais); a origem UNVERIFIED_INSTALLED_PACKAGE fica no package.json e é estado do fecho do pacote inteiro: aparece em installedPackageState e só se resolve com o pacote PROVEN',
                         'edgesPointingToCleanLeaves': len(edges_to_clean), 'importersOfCleanLeavesAllDirty': all(blockers(k, nt, clo) for k, _ in edges_to_clean),
                         'meaning': 'folhas sem aresta e sem origem que só exportam constantes primitivas; seriam provas K5 triviais sob uma regra por fecho (T3)'},
       'edgeProof': {'importers': len(importers), 'candidatesToday': len(edge_candidates), 'nearest': nearest, 'nearestWithoutHiddenBody': near_honest,
                     'hidesBodyRule': 'UNKNOWN_FUNCTION (qualquer detalhe) ou UNKNOWN_UNSUPPORTED_SYNTAX de classe ou de instrução com corpo (try, for, for…of, for…in, while, do, switch, rótulo): o engine registra a tupla e não avalia o corpo (fallback de instrução segue para a próxima)',
                     'note': 'contagem pequena engana quando uma recusa esconde o corpo: o corpo revelaria os próprios UNKNOWN (v3: +483 ao abrir parâmetro com valor padrão)'},
       'variantV5a': {'diagnosticOnly': True, 'cleanClosures': len(clean5), 'newClean': sorted(set(clean5) - set(clean)), 'edgeCandidates': len(edge5),
                      'meaning': 'E1+E2 não aproxima a primeira prova: 13 → 13 fechos limpos, 0 candidatos a aresta'},
       'origins': {'total': len(S['origins']), 'distribution': dict(odist), 'withCleanClosure': sum(1 for k, n in orow if n == 0),
                   'note': 'instalado mapeado pelo diretório do pacote (a origem é registrada no package.json, que não é nó do grafo); r1 dizia "fora do grafo"'},
       'structuralK0': {'K0Tuples': k0, 'rule': 'checkExport chama cada função ou método público com todos os parâmetros U; qualquer leitura de binding U emite UNKNOWN_BINDING_VALUE',
                        'consequence': 'módulo cuja superfície pública lê a própria entrada nunca fecha limpo; objeto exportado emite EXPORTED_MUTABLE_STATE; só fecha limpo quem exporta primitivas ou funções que não leem parâmetros'},
       'minimumPath': [
           'T3 regra por escopo (fecho avaliado como entrada própria, com census e realm próprios): sem ela, zero provas qualquer que seja o delta local',
           'com a regra por escopo e o estado atual: 13 provas K5 triviais (folhas sem aresta e sem origem) e 0 provas de aresta',
           'para a primeira prova de aresta: um importador cujo fecho inteiro fique limpo; o mais próximo por contagem (6 tuplas) tem corpo escondido por ClassDeclaration; os mais próximos sem corpo escondido estão listados em nearestWithoutHiddenBody',
           'K0 é estrutural: superfície pública que lê parâmetro não fecha; a primeira aresta provável é de importador que só reexporta ou exporta primitivas, ou exige decisão T3 sobre o modelo de entrada externa',
           'E1+E2 (SPEC0244 proposta) não muda nenhum desses números; o efeito dela é diagnóstico, não de prova']}
save('first-proof-path-r2.json', rec)
print(json.dumps({k: rec[k] for k in ('cleanClosures',)}, ensure_ascii=False)[:1200])
print(json.dumps(rec['edgeProof'], ensure_ascii=False)[:4000])
print(json.dumps(rec['variantV5a'], ensure_ascii=False), json.dumps(rec['origins'], ensure_ascii=False))
