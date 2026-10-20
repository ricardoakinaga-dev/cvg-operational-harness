"""R2 classification (answers R1-01..R1-04, R1-O3): the 13,521 diagnostics of the integral measurement (normal =
strict) by family with explicit precedence, nature (analyzer limitation vs code fact vs consequence), closed reason,
category, package and module; propagation split by the origin of the U value (K0 entry parameter, parameter that got a
U argument, import, local, function) from the K0 tag copy; base origins split (lexical label vs installed closure
state); src/dist multiplier. Read-only over the sealed reports, the diagnostic graph and the tag files.
Precedence: (1) any tuple in a .tsx file -> tsx; (2) tags all U-* -> propagation; (3) INHERITED missing export by star
or refused class, or BINDING of a refused class name in the same file -> module shape; (4) BINDING / NATIVE_BUILTIN ->
intrinsics; (5) closed-reason family (domain, resolution/format/provenance, code fact; other INHERITED and non-U
propagation reasons -> domain)."""
import gzip, json, sys, subprocess
from collections import Counter, defaultdict
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

rn, rs = report('normal'), report('strict')
dn = Counter(json.dumps(d, sort_keys=True) for d in rn['diagnostics'])
ds = Counter(json.dumps(d, sort_keys=True) for d in rs['diagnostics'])
S = rn['semanticBoundary']; U = S['unknowns']
g = json.loads(gzip.decompress((EV / 'semantic-graph.json.gz').read_bytes()))
c1 = load('classification.json')
FAM1 = {}
for fam, reasons in {
    'propagacao': ['UNKNOWN_BINDING_VALUE', 'UNKNOWN_PROPERTY', 'UNKNOWN_CALL', 'UNKNOWN_EXPORT', 'UNKNOWN_INHERITED_PROPERTY'],
    'dominio': ['UNKNOWN_UNSUPPORTED_SYNTAX', 'UNKNOWN_FUNCTION', 'UNKNOWN_OPERATOR', 'UNKNOWN_TEMPLATE', 'UNKNOWN_OBJECT', 'UNKNOWN_ARRAY',
                'UNKNOWN_OPTIONAL_CHAIN', 'UNKNOWN_BINDING_PATTERN', 'UNKNOWN_THIS', 'UNKNOWN_PARTIAL_RETURN', 'UNKNOWN_MISSING_INITIALIZER',
                'UNKNOWN_RUNTIME_DECLARATION', 'UNKNOWN_REEXPORT', 'UNKNOWN_CYCLE', 'UNKNOWN_IMPORT_ATTRIBUTES'],
    'intrinsecos_builtins': ['UNKNOWN_BINDING', 'UNKNOWN_NATIVE_BUILTIN'],
    'resolucao_formato_proveniencia': ['UNKNOWN_FORMAT', 'UNKNOWN_MODULE_FORMAT', 'UNKNOWN_MODULE_INTEROP', 'UNKNOWN_ACQUISITION_ENOENT',
                'UNKNOWN_AMBIGUOUS_RESOLUTION', 'UNKNOWN_PARSE', 'UNKNOWN_RESOLUTION_CONFIG', 'UNKNOWN_WORKSPACE_LINK', 'UNKNOWN_WORKSPACE_CONFIG',
                'UNKNOWN_PACKAGE_SELF_REFERENCE', 'UNKNOWN_UNRESOLVED_EXPORT', 'UNKNOWN_UNSUPPORTED_EXPORTS', 'UNKNOWN_COMPILED_PROVENANCE',
                'UNKNOWN_UNREACHED_INSTALLED_ENTRY'],
    'fato_do_codigo': ['UNKNOWN_EXPORTED_MUTABLE_STATE', 'UNKNOWN_MUTABLE_BINDING', 'UNKNOWN_MUTATION', 'UNKNOWN_REFLECTION']}.items():
    for r in reasons: FAM1[r] = fam
assert not ({x['reason'] for x in U} - set(FAM1))
NATURE = {
    'propagacao': 'consequência: o gatilho é só um valor já desconhecido; a origem do U decide se é regra estrutural (K0), consequência de raiz diagnóstica (import, local, função) ou de argumento U',
    'dominio': 'limitação do analisador: sintaxe ou semântica fora de K0–K7 (o código existe e é comum; o intérprete não o modela)',
    'tsx_fora_do_dominio': 'limitação do analisador: .tsx parseado como TS (engine, ScriptKind.TS), UNKNOWN_PARSE e avaliação da AST recuperada; palavras de JSX viram UNKNOWN_BINDING',
    'forma_de_modulo': 'limitação do analisador: export ausente por estrela recusada ou classe recusada, repetido por importador com motivo errado',
    'resolucao_formato_proveniencia': 'limitação do analisador ou da proveniência: formato não JS, alvo ausente, interop, dist sem recibo compilado, entrada instalada não alcançada',
    'intrinsecos_builtins': 'limitação de modelo sobre fato do código: o código usa global intrínseco ou módulo nativo que o kernel não modela (modelar exige premissa nova)',
    'fato_do_codigo': 'fato do código: estado mutável exportado, let/var, atribuição, reflexão (o código faz isso; o kernel recusa por segurança)'}
LIMITATION = {'dominio', 'tsx_fora_do_dominio', 'forma_de_modulo', 'resolucao_formato_proveniencia'}

def tagmap(name):
    ct = json.loads(gzip.decompress((EV / name).read_bytes()))
    t = {}
    for k, v in ct['tags']:
        i = json.loads(k); t[(i['file'], i['reason'], i['detail'])] = set(v)
    return ct, t
ct, TAGS = tagmap('cause-tags-k0.json.gz')
_, TAGS1 = tagmap('cause-tags.json.gz')
assert set(TAGS) == set(TAGS1) == {(x['file'], x['reason'], x['detail']) for x in U}
refused = {f: set(v) for f, v in ct['refused']}
gl = set(json.loads(subprocess.run([NODE, '-e', 'console.log(JSON.stringify(Object.getOwnPropertyNames(globalThis)))'], capture_output=True, text=True,
                                   env={'PATH': NODEBIN}).stdout))
WEB_NODE = {'process', 'Buffer', 'window', 'self', 'document', 'global', 'File', 'navigator', 'location', 'localStorage', 'sessionStorage'}
key = lambda x: (x['file'], x['reason'], x['detail'])
is_u = lambda t: bool(t) and all(z.startswith('U-') for z in t)

def family(x):
    t = TAGS[key(x)]
    if (x['file'] or '').endswith('.tsx'): return 'tsx_fora_do_dominio'
    if is_u(t): return 'propagacao'
    if x['reason'] == 'UNKNOWN_INHERITED_PROPERTY' and t & {'missing-export-star-reexport', 'missing-export-refused-class'}: return 'forma_de_modulo'
    if x['reason'] == 'UNKNOWN_BINDING' and x['detail'] in refused.get(x['file'], set()): return 'forma_de_modulo'
    if FAM1[x['reason']] == 'propagacao': return 'dominio'
    return FAM1[x['reason']]

ORIGIN_NAME = {'U-binding:parametro-K0': 'K0: parâmetro de função ou método público (entrada externa U por regra)',
               'U-binding:parametro-argumento': 'parâmetro de chamada interna que recebeu argumento U',
               'U-binding:import': 'import de valor U (export U ou ausente no exportador)',
               'U-binding:local': 'local (const/let/var/catch/for) com inicializador U',
               'U-binding:funcao': 'função cuja declaração foi recusada (K3)',
               'U-binding:classe': 'classe recusada', 'U-binding:enum': 'enum (fora do domínio)'}
def prop_origin(x):
    t = TAGS[key(x)]
    b = sorted(z for z in t if z.startswith('U-binding'))
    if b:
        return b[0] if len(b) == 1 else 'misto:' + '+'.join(z.split(':', 1)[1] for z in b)
    return 'expressao:' + '+'.join(sorted(t))

def category(f):
    if not f: return 'global'
    if f.startswith('node_modules/') or '/node_modules/' in f: return 'instalado'
    if '/dist/' in f: return 'primeira-parte-dist'
    if '__tests__' in f or '.test.' in f or f.startswith('tests/'): return 'primeira-parte-teste'
    return 'primeira-parte-src'

def package(f):
    parts = (f or '').split('/')
    if 'node_modules' in parts:
        i = len(parts) - 1 - parts[::-1].index('node_modules')
        return 'npm:' + ('/'.join(parts[i + 1:i + 3]) if parts[i + 1].startswith('@') else parts[i + 1])
    if parts[0] in ('packages', 'apps', 'products') and len(parts) > 1: return parts[0] + '/' + parts[1]
    if parts[0] == 'legacy' and len(parts) > 2: return '/'.join(parts[:3])
    return parts[0]

F = {key(x): family(x) for x in U}
fam = Counter(F.values())
fam_pct = {k: [v, round(100 * v / len(U), 1)] for k, v in fam.most_common()}
fam_reason = {k: dict(Counter(x['reason'] for x in U if F[key(x)] == k).most_common()) for k in fam}
fam_cat = {k: dict(Counter(category(x['file']) for x in U if F[key(x)] == k).most_common()) for k in fam}
fam_pkg = {k: [[p, n] for p, n in Counter(package(x['file']) for x in U if F[key(x)] == k).most_common(8)] for k in fam}
# propagation by origin of U
P = [x for x in U if F[key(x)] == 'propagacao']
po = Counter(prop_origin(x) for x in P)
po_reason = defaultdict(Counter)
for x in P: po_reason[prop_origin(x)][x['reason']] += 1
k0 = po.get('U-binding:parametro-K0', 0)
# module shape detail and intrinsics detail
ms = [x for x in U if F[key(x)] == 'forma_de_modulo']
ms_detail = Counter('BINDING de nome de classe recusada' if x['reason'] == 'UNKNOWN_BINDING' else
                    ('INHERITED em namespace com estrela' if 'missing-export-star-reexport' in TAGS[key(x)] else 'INHERITED por classe recusada') for x in ms)
var1 = load('variant-v1.json')
V1 = {key(x) for x in json.loads(gzip.decompress((RUNTIME / 'variant-v1-report.json.gz').read_bytes()))['semanticBoundary']['unknowns']}
missing = [x for x in U if x['reason'] == 'UNKNOWN_INHERITED_PROPERTY' and TAGS[key(x)] & {'missing-export-star-reexport', 'missing-export-refused-class'}]
star_t = [x for x in missing if 'missing-export-star-reexport' in TAGS[key(x)]]
split = {'missingExportTuplesAllFiles': len(missing), 'inStarNamespace': len(star_t), 'byRefusedClass': len(missing) - len(star_t),
         'E1AloneRemoves': sum(1 for x in missing if key(x) not in V1), 'starNamespaceNeedingE2': sum(1 for x in star_t if key(x) in V1),
         'E2Needed': sum(1 for x in missing if key(x) in V1), 'classNameBindingTuples': sum(1 for x in U if x['reason'] == 'UNKNOWN_BINDING' and x['detail'] in refused.get(x['file'], set())),
         'newExportE1': var1['newByReason'].get('UNKNOWN_EXPORT', 0),
         'note': 'a etiqueta olha o módulo dono do namespace; parte das tuplas em namespace com estrela depende de classe recusada no módulo-fonte e só some com E2; uma das 1.402 está em .tsx e conta na família TSX'}
intr = [x for x in U if F[key(x)] == 'intrinsecos_builtins']
def intr_kind(x):
    if x['reason'] == 'UNKNOWN_NATIVE_BUILTIN': return 'modulo_nativo'
    return 'global_ecmascript' if x['detail'] in gl and x['detail'] not in WEB_NODE else ('global_de_host' if x['detail'] in gl | WEB_NODE else 'global_de_ambiente_sem_declaracao')
intr_split = Counter(intr_kind(x) for x in intr)
intr_names = {k: [[n, c] for n, c in Counter(x['detail'] for x in intr if intr_kind(x) == k).most_common(15)] for k in intr_split}
# tsx
T = [x for x in U if F[key(x)] == 'tsx_fora_do_dominio']
tsx_binding = [x for x in T if x['reason'] == 'UNKNOWN_BINDING']
tsx_bk = Counter('vazio' if not x['detail'] else 'global' if x['detail'] in gl | WEB_NODE else 'palavra_jsx_ou_nome_local' for x in tsx_binding)
tsx_files = Counter(x['file'] for x in T)
parse_files = {x['file'] for x in U if x['reason'] == 'UNKNOWN_PARSE'}
# dominant root causes (non-propagation) by (reason, detail-class)
def root_cause(x):
    f = F[key(x)]
    if f in ('tsx_fora_do_dominio', 'forma_de_modulo'): return f
    if x['reason'] in ('UNKNOWN_UNSUPPORTED_SYNTAX', 'UNKNOWN_FUNCTION'): return x['reason'] + ':' + x['detail']
    if f == 'intrinsecos_builtins': return 'intrinsecos_builtins:' + intr_kind(x)
    return x['reason']
roots = Counter(root_cause(x) for x in U if F[key(x)] != 'propagacao')
# base origins
O = S['origins']
reached = set(g['reachedPackages'])
pkg_dir = lambda f: f[:-len('/package.json')]
tuples_by_pkg = Counter()
for x in U:
    f = x['file'] or ''
    for p in reached:
        if f.startswith(p + '/'): tuples_by_pkg[p] += 1
inst = [o for o in O if o['reason'] == 'UNVERIFIED_INSTALLED_PACKAGE']
inst_reached = [o for o in inst if pkg_dir(o['file']) in reached]
lex = [d for d in rn['diagnostics'] if 'expression' in d and 'originId' not in d]
lex_reason = Counter(d['reason'] for d in lex)
lex_expr = [[e, n] for e, n in Counter(o['expression'] for o in O if o['reason'] in lex_reason).most_common(15)]
nonlit = [o for o in O if o['reason'] == 'NON_LITERAL_MODULE_REFERENCE']
origins = {
    'total': len(O),
    'lexicalFirstParty': {'count': len(lex), 'byReason': dict(lex_reason), 'topExpressions': lex_expr,
                          'nature': 'fato: a expressão existe no código (descritor, protótipo, Reflect, processo filho, loader); limitação: o rótulo é sobreaproximação léxica do loader-diagnostic, pendente de prova semântica (o K4 da SPEC0236 já modela parte disso); não demonstra execução dinâmica'},
    'installedPackages': {'count': len(inst), 'neverReached': len(inst) - len(inst_reached), 'reachedWithDirtyClosure': len(inst_reached),
                          'reached': sorted(pkg_dir(o['file']) for o in inst_reached),
                          'tuplesInReachedPackages': dict(tuples_by_pkg.most_common()),
                          'nature': 'estado de prova do fecho instalado: só vira VERIFIED com fecho semântico PROVEN; não alcançado = limite de escopo da análise (nenhum caminho do corpo chega ao pacote), alcançado = consequência da fronteira dentro do pacote',
                          'keyNote': 'a origem é registrada em node_modules/<pacote>/package.json; o r1 chamou de "fora do grafo" porque esse arquivo não é nó do grafo; o mapeamento correto é pelo diretório do pacote contra reachedPackages'},
    'nonLiteralModuleReference': {'count': len(nonlit), 'files': sorted({o['file'] for o in nonlit}),
                                  'nature': 'fato do código (especificador não literal) que o analisador não resolve'}}
assert len(lex) + len(inst) + len(nonlit) == len(O)
# src/dist multiplier
dist = [x for x in U if category(x['file']) == 'primeira-parte-dist']
srcset = {x['file'] for x in U}
def twin(f):
    a = f.replace('/dist/', '/src/', 1)
    return [a[:-3] + e for e in ('.ts', '.mts', '.tsx', '.js')] if a.endswith('.js') else [a]
dist_with_src_twin = sum(1 for x in dist if any(t in set(g['files']) | srcset for t in twin(x['file'])))
dist_fam = dict(Counter(F[key(x)] for x in dist).most_common())
nature_split = {'limitacao_do_analisador': sum(v for k, v in fam.items() if k in LIMITATION),
                'limitacao_de_modelo_sobre_fato': fam['intrinsecos_builtins'], 'fato_do_codigo': fam['fato_do_codigo'],
                'consequencia_propagacao': fam['propagacao']}
rec = {'task': TASK, 'round': 'r2', 'observedAt': now(),
       'source': {'normal': sha(REPORTS['normal']), 'strict': sha(REPORTS['strict']), 'graph': 'semantic-graph.json.gz',
                  'tags': {'cause-tags.json.gz': sha(EV / 'cause-tags.json.gz'), 'cause-tags-k0.json.gz': sha(EV / 'cause-tags-k0.json.gz')},
                  'r1': {'classification.json': sha(EV / 'classification.json')}},
       'normalEqualsStrict': dn == ds, 'diagnostics': sum(dn.values()),
       'composition': {'frontierTuples': len(U), 'baseOrigins': len(O)},
       'precedence': ['tsx_fora_do_dominio', 'propagacao', 'forma_de_modulo', 'intrinsecos_builtins', 'familia do motivo fechado'],
       'families': {'counts': fam_pct, 'nature': NATURE, 'natureSplit': nature_split, 'byReason': fam_reason, 'byCategory': fam_cat, 'topPackages': fam_pkg},
       'propagationByOrigin': {'tuples': len(P), 'counts': dict(po.most_common()), 'names': ORIGIN_NAME,
                               'byOriginAndReason': {k: dict(v.most_common()) for k, v in po_reason.items()},
                               'K0': {'tuples': k0, 'pctOfFrontier': round(100 * k0 / len(U), 1),
                                      'meaning': 'leitura de parâmetro de função ou método público chamado por checkExport com todos os parâmetros U (SPEC0236 K0); causa própria, estrutural, irredutível sem premissa nova sobre entrada externa'},
                               'method': 'cópia diagnóstica k0_origin_patch.py: o binding de parâmetro registra na criação se a chamada veio do checkExport (K0) ou de chamada comum; a etiqueta de UNKNOWN_BINDING_VALUE nomeia a declaração léxica; tuplas idênticas às oficiais'},
       'moduleShape': {'tuples': len(ms), 'detail': dict(ms_detail), 'measuredSplit': split},
       'tsx': {'tuples': len(T), 'files': len(tsx_files), 'filesWithParse': len(parse_files & set(tsx_files)), 'byReason': fam_reason['tsx_fora_do_dominio'],
               'bindingSplit': dict(tsx_bk), 'topFiles': [[f, n] for f, n in tsx_files.most_common(8)]},
       'intrinsics': {'tuples': len(intr), 'split': dict(intr_split), 'topNames': intr_names},
       'dominantRootCauses': [[k, v, round(100 * v / len(U), 1)] for k, v in roots.most_common(25)],
       'origins': origins,
       'srcDistMultiplier': {'distTuples': len(dist), 'pctOfFrontier': round(100 * len(dist) / len(U), 1), 'distTuplesWithSrcTwin': dist_with_src_twin,
                             'distByFamily': dist_fam, 'note': 'dist de primeira parte espelha o src compilado: cada causa de primeira parte conta duas vezes; as parcelas valem para a raiz como medida, não para causas distintas'},
       'byCategory': dict(Counter(category(x['file']) for x in U).most_common()),
       'byPackageTop': [[p, n] for p, n in Counter(package(x['file']) for x in U).most_common(20)],
       'byModuleTop': [[f, n] for f, n in Counter(x['file'] for x in U).most_common(15)],
       'r1Delta': {'r1Families': c1['refinedFamilies']['counts'], 'changes': [
           'TSX: 705 tuplas de 29 arquivos .tsx saem de todas as famílias (430 eram BINDING contados como intrínsecos) (R1-01)',
           'BINDING de nome de classe recusada (10) vai para forma de módulo (R1-01)',
           'propagação dividida por origem do U com K0 medido (R1-04)',
           'origens separadas em rótulo léxico, estado do fecho instalado e fato (R1-02)',
           'divisão medida E1/E2 (R1-03) e multiplicador src/dist (R1-O3)']}}
save('classification-r2.json', rec)
print(json.dumps({'fam': fam_pct, 'nature': nature_split, 'po': dict(po.most_common()), 'ms': dict(ms_detail), 'tsx': rec['tsx'], 'intr': dict(intr_split)}, ensure_ascii=False, indent=0))
print(json.dumps(rec['dominantRootCauses'], ensure_ascii=False))
print(json.dumps({k: v for k, v in origins['installedPackages'].items() if k not in ('nature', 'keyNote')}, ensure_ascii=False))
print(json.dumps(rec['srcDistMultiplier'], ensure_ascii=False), rec['moduleShape']['measuredSplit'])
