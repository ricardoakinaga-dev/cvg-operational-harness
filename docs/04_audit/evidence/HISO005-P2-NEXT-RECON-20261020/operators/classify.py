"""Classification of the 13,521 diagnostics of the integral measurement (normal = strict) by class, closed reason,
family, category, package and module; root/propagation attribution over the semantic graph; per-closure analysis
of what blocks a first proof. Read-only over the sealed reports and the diagnostic graph."""
import gzip, json, sys
from collections import Counter, defaultdict
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

rn, rs = report('normal'), report('strict')
dn = Counter(json.dumps(d, sort_keys=True) for d in rn['diagnostics'])
ds = Counter(json.dumps(d, sort_keys=True) for d in rs['diagnostics'])
s = rn['semanticBoundary']
U = s['unknowns']
g = json.loads(gzip.decompress((EV / 'semantic-graph.json.gz').read_bytes()))
root = g['root'] + '/'
rel = lambda p: p[len(root):] if p.startswith(root) else p
FILES = [rel(f) for f in g['files']]
EDGES = {rel(k): sorted({rel(x) for x in v}) for k, v in g['edges'].items()}
STARTS = [rel(x) for x in g['starts']]

FAMILY = {}
for r in ['UNKNOWN_BINDING_VALUE', 'UNKNOWN_PROPERTY', 'UNKNOWN_CALL', 'UNKNOWN_EXPORT', 'UNKNOWN_INHERITED_PROPERTY']:
    FAMILY[r] = 'propagacao'
for r in ['UNKNOWN_UNSUPPORTED_SYNTAX', 'UNKNOWN_FUNCTION', 'UNKNOWN_OPERATOR', 'UNKNOWN_TEMPLATE', 'UNKNOWN_OBJECT', 'UNKNOWN_ARRAY',
          'UNKNOWN_OPTIONAL_CHAIN', 'UNKNOWN_BINDING_PATTERN', 'UNKNOWN_THIS', 'UNKNOWN_PARTIAL_RETURN', 'UNKNOWN_MISSING_INITIALIZER',
          'UNKNOWN_RUNTIME_DECLARATION', 'UNKNOWN_REEXPORT', 'UNKNOWN_CYCLE', 'UNKNOWN_IMPORT_ATTRIBUTES']:
    FAMILY[r] = 'dominio'
for r in ['UNKNOWN_BINDING', 'UNKNOWN_NATIVE_BUILTIN']:
    FAMILY[r] = 'intrinsecos_builtins'
for r in ['UNKNOWN_FORMAT', 'UNKNOWN_MODULE_FORMAT', 'UNKNOWN_MODULE_INTEROP', 'UNKNOWN_ACQUISITION_ENOENT', 'UNKNOWN_AMBIGUOUS_RESOLUTION',
          'UNKNOWN_PARSE', 'UNKNOWN_RESOLUTION_CONFIG', 'UNKNOWN_WORKSPACE_LINK', 'UNKNOWN_WORKSPACE_CONFIG', 'UNKNOWN_PACKAGE_SELF_REFERENCE',
          'UNKNOWN_UNRESOLVED_EXPORT', 'UNKNOWN_UNSUPPORTED_EXPORTS', 'UNKNOWN_COMPILED_PROVENANCE', 'UNKNOWN_UNREACHED_INSTALLED_ENTRY']:
    FAMILY[r] = 'resolucao_formato_proveniencia'
for r in ['UNKNOWN_EXPORTED_MUTABLE_STATE', 'UNKNOWN_MUTABLE_BINDING', 'UNKNOWN_MUTATION', 'UNKNOWN_REFLECTION']:
    FAMILY[r] = 'fato_do_codigo_mutabilidade_reflexao'
NATURE = {'propagacao': 'consequência de outro UNKNOWN (valor U, export ausente ou receptor desconhecido)',
          'dominio': 'limitação do analisador: sintaxe ou semântica fora de K0–K7',
          'intrinsecos_builtins': 'limitação de modelo sobre fato do código: global intrínseco ou módulo nativo sem modelo (modelar exigiria premissa nova)',
          'resolucao_formato_proveniencia': 'limitação do analisador ou da proveniência: formato não JS, resolução recusada, dist sem recibo, pacote não alcançado',
          'fato_do_codigo_mutabilidade_reflexao': 'fato do código: estado mutável exportado, let/var, atribuição, reflexão'}
unmapped = sorted({x['reason'] for x in U} - set(FAMILY))
assert not unmapped, unmapped


def category(f):
    if not f:
        return 'global'
    if f.startswith('node_modules/') or '/node_modules/' in f:
        return 'instalado'
    if '/dist/' in f:
        return 'primeira-parte-dist'
    if '__tests__' in f or '.test.' in f or f.startswith('tests/'):
        return 'primeira-parte-teste'
    return 'primeira-parte-src'


def package(f):
    parts = f.split('/')
    if 'node_modules' in parts:
        i = len(parts) - 1 - parts[::-1].index('node_modules')
        return 'npm:' + ('/'.join(parts[i + 1:i + 3]) if parts[i + 1].startswith('@') else parts[i + 1])
    if parts[0] in ('packages', 'apps', 'products') and len(parts) > 1:
        return parts[0] + '/' + parts[1]
    if parts[0] == 'legacy' and len(parts) > 2:
        return '/'.join(parts[:3])
    return parts[0]


def top(counter, n=25):
    return [[k, v] for k, v in counter.most_common(n)]


# ---- diagnostics classes
classes = Counter()
for d in rn['diagnostics']:
    if 'originId' in d:
        classes['fronteira_semantica'] += 1
    elif 'expression' in d:
        classes['origem_lexica_primeira_parte:' + d['reason']] += 1
    else:
        classes['origem_base:' + d['reason']] += 1
# ---- frontier
by_reason = Counter(x['reason'] for x in U)
by_family = Counter(FAMILY[x['reason']] for x in U)
by_cat = Counter(category(x['file']) for x in U)
by_pkg = Counter(package(x['file']) for x in U)
by_file = Counter(x['file'] for x in U)
fam_cat = defaultdict(Counter)
for x in U:
    fam_cat[FAMILY[x['reason']]][category(x['file'])] += 1
details = {r: top(Counter(x['detail'] for x in U if x['reason'] == r), 12) for r in
           ['UNKNOWN_BINDING_VALUE', 'UNKNOWN_INHERITED_PROPERTY', 'UNKNOWN_UNSUPPORTED_SYNTAX', 'UNKNOWN_BINDING', 'UNKNOWN_FUNCTION']}
files_per_reason = {r: len({x['file'] for x in U if x['reason'] == r}) for r in by_reason}
# ---- tag-refined families (cause-tags.json.gz from the diagnostic copy; tuples unchanged)
ct = json.loads(gzip.decompress((EV / 'cause-tags.json.gz').read_bytes()))
TAGS = {}
for k, v in ct['tags']:
    i = json.loads(k)
    TAGS[(i['file'], i['reason'], i['detail'])] = set(v)
CONSEQ = {'U-binding', 'U-callee', 'U-receiver', 'U-export', 'U-operand'}
def refined(x):
    tags = TAGS.get((x['file'], x['reason'], x['detail']), set())
    if tags and tags <= CONSEQ:
        return 'propagacao'
    if x['reason'] == 'UNKNOWN_INHERITED_PROPERTY':
        if tags & {'missing-export-star-reexport', 'missing-export-refused-class'}:
            return 'forma_de_modulo'
        return 'dominio'
    if FAMILY[x['reason']] == 'propagacao':
        return 'dominio'
    return FAMILY[x['reason']]
refined_counts = Counter(refined(x) for x in U)
tag_rows = Counter((x['reason'], '|'.join(sorted(TAGS.get((x['file'], x['reason'], x['detail']), {'?'})))) for x in U)
# ---- graph: closures
node_tuples = defaultdict(list)
for x in U:
    node_tuples[x['file']].append(x)
memo = {}
def closure(f):
    if f in memo:
        return memo[f]
    seen, stack = set(), [f]
    while stack:
        n = stack.pop()
        if n in seen:
            continue
        seen.add(n)
        stack.extend(EDGES.get(n, []))
    memo[f] = seen
    return seen
own_root_fams = {f: {FAMILY[x['reason']] for x in xs if FAMILY[x['reason']] != 'propagacao'} for f, xs in node_tuples.items()}
analysis = {}
for f in FILES:
    c = closure(f)
    cu = sum(len(node_tuples.get(n, [])) for n in c)
    fams = set().union(*[own_root_fams.get(n, set()) for n in c]) if c else set()
    analysis[f] = {'closureSize': len(c), 'closureTuples': cu, 'ownTuples': len(node_tuples.get(f, [])), 'closureRootFamilies': sorted(fams)}
clean_closure = [f for f, a in analysis.items() if a['closureTuples'] == 0]
clean_own = [f for f, a in analysis.items() if a['ownTuples'] == 0]
pure_propagation_files = [f for f, xs in node_tuples.items() if xs and all(FAMILY[x['reason']] == 'propagacao' for x in xs)]
prop_tuples = [x for x in U if FAMILY[x['reason']] == 'propagacao']
prop_in_files_without_own_root = sum(1 for x in prop_tuples if not own_root_fams.get(x['file']))
# per family estimate: lower = direct tuples; upper = all tuples of files whose closure roots are subset of {F}
estimates = {}
for fam in sorted(set(FAMILY.values()) - {'propagacao'}):
    direct = by_family[fam]
    cleared = [f for f, a in analysis.items() if a['closureTuples'] and set(a['closureRootFamilies']) <= {fam}]
    upper = sum(analysis[f]['ownTuples'] for f in cleared)
    estimates[fam] = {'directTuples': direct, 'filesFullyClearedIfOnlyThisFamilyWereSolved': len(cleared), 'tuplesInThoseFiles': upper}
# origins
origins = s['origins']
orig_rows = []
for o in origins:
    a = analysis.get(o['file'])
    orig_rows.append({'file': o['file'], 'reason': o['reason'], 'inGraph': a is not None, 'closureTuples': a['closureTuples'] if a else None,
                      'ownTuples': a['ownTuples'] if a else len(node_tuples.get(o['file'], []))})
orig_clean = [x for x in orig_rows if x['inGraph'] and x['closureTuples'] == 0]
orig_dist = Counter('fora do grafo' if not x['inGraph'] else ('0' if x['closureTuples'] == 0 else '1-10' if x['closureTuples'] <= 10 else '11-100' if x['closureTuples'] <= 100 else '>100') for x in orig_rows)
clean_by_cat = Counter(category(f) for f in clean_closure)
smallest = sorted(((a['closureTuples'], f) for f, a in analysis.items() if category(f) == 'primeira-parte-src' and a['closureTuples'] > 0))[:15]
rec = {'task': TASK, 'observedAt': now(), 'source': {'normal': sha(REPORTS['normal']), 'strict': sha(REPORTS['strict']), 'graph': 'semantic-graph.json.gz'},
       'normalEqualsStrict': dn == ds, 'diagnostics': sum(dn.values()),
       'classes': dict(classes.most_common()),
       'frontier': {'tuples': len(U), 'byFamily': dict(by_family.most_common()), 'familyNature': NATURE, 'byReason': dict(by_reason.most_common()),
                    'filesPerReason': files_per_reason, 'byCategory': dict(by_cat.most_common()),
                    'familyByCategory': {k: dict(v) for k, v in fam_cat.items()}, 'byPackageTop': top(by_pkg, 30), 'byModuleTop': top(by_file, 25),
                    'distinctFiles': len(by_file), 'detailsTop': details},
       'graph': {'analyzedFiles': len(FILES), 'importers': len(EDGES), 'edges': sum(len(v) for v in EDGES.values()), 'starts': len(STARTS),
                 'filesWithoutOwnTuples': len(clean_own), 'filesWithCleanClosure': len(clean_closure), 'cleanClosureByCategory': dict(clean_by_cat),
                 'cleanClosureFirstPartySrc': sorted(f for f in clean_closure if category(f) == 'primeira-parte-src'),
                 'smallestDirtyFirstPartySrcClosures': [[n, f] for n, f in smallest]},
       'propagation': {'tuples': len(prop_tuples), 'filesWithOnlyPropagation': len(pure_propagation_files),
                       'propagationTuplesInFilesWithoutOwnRoot': prop_in_files_without_own_root},
       'familyEstimates': estimates,
       'refinedFamilies': {'counts': dict(refined_counts.most_common()), 'rule': 'tupla cujas tags são só U-* (operando, receptor, callee, binding ou export desconhecidos) é propagação; INHERITED_PROPERTY por export ausente de reexport estrela ou de classe recusada é forma de módulo; o resto segue a família do motivo'},
       'causeTagsByReason': [[r, t, n] for (r, t), n in tag_rows.most_common(45)],
       'origins': {'baseline': len(origins), 'closureDistribution': dict(orig_dist), 'withCleanClosure': orig_clean[:50],
                   'byReason': dict(Counter(o['reason'] for o in origins))}}
save('classification.json', rec)
print(json.dumps({k: rec[k] for k in ('normalEqualsStrict', 'diagnostics', 'classes')}, ensure_ascii=False))
print(json.dumps(rec['frontier']['byFamily']), json.dumps(rec['frontier']['byCategory']))
print(json.dumps(rec['graph'], ensure_ascii=False)[:1500])
print(json.dumps(rec['propagation']), json.dumps(rec['familyEstimates'], ensure_ascii=False))
print(json.dumps(rec['origins']['closureDistribution']), len(orig_clean))
