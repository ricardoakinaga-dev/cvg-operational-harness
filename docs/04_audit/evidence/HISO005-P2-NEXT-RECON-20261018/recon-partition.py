"""Partition of the sealed BUILD0240 v3 measurement (1118) by cause.

Readonly: reads only the sealed BUILD0240 evidence. Writes cause-partition.json
in this folder. A count is navigation, never resolution credit.
Usage: python3 -I recon-partition.py [output-dir]  (default: this folder)
"""
from pathlib import Path
import collections
import datetime
import gzip
import hashlib
import json
import re
import sys

EV = Path(__file__).resolve().parent
ROOT = EV.parents[3]
OUT = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else EV
B = ROOT / 'docs/04_audit/evidence/HISO005-P2-BUILD-0240-20261018'

receipts = json.loads((B / 'real-postcert-receipts.json').read_text())
summary = json.loads((B / 'real-postcert-summary.json').read_text())


def load(name):
    raw = gzip.open(B / name).read()
    return raw, json.loads(raw)


raw_n, rep = load('real-postcert-normal-report.json.gz')
raw_s, rep_s = load('real-postcert-strict-report.json.gz')
raw_v2, rep_v2 = load('real-v2same-normal-report.json.gz')
checks = []


def check(name, ok, detail=None):
    checks.append({'name': name, 'ok': bool(ok), 'detail': detail})


check('normalReportSha256EqualsReceipt', hashlib.sha256(raw_n).hexdigest() == receipts[0]['reportSha256'],
      hashlib.sha256(raw_n).hexdigest())
check('strictReportSha256EqualsReceipt', hashlib.sha256(raw_s).hexdigest() == receipts[1]['reportSha256'],
      hashlib.sha256(raw_s).hexdigest())
check('checkerSha256', receipts[0]['checkerSha256'] == '35cba39fcd164a8cb44d1372fa872f986c8bde8d41a1f3324bcc38e5c348a70c')

sb = rep['semanticBoundary']
diags = rep['diagnostics']
check('total1118', len(diags) == 1118 == summary['diagnostics'], len(diags))
check('status', rep['status'] == 'INCOMPLETE' and sb['status'] == 'UNKNOWN', [rep['status'], sb['status']])
check('zeroProofs', len(sb['proofs']) == 0 and len(rep['resolvedDiagnostics']) == 0)
check('zeroViolations', len(rep['violations']) == 0 and len(sb['violations']) == 0)

# Baseline origins (537) and frontier (581): identities and multiplicity.
origins = sb['origins']
frontier = sb['frontierOrigins']
check('origins537', len(origins) == 537 and len({o['id'] for o in origins}) == 537)
check('frontier581', len(frontier) == 581 and len({o['id'] for o in frontier}) == 581)
check('unknowns581', len(sb['unknowns']) == 581)
diag_reason = collections.Counter(d['reason'] for d in diags)
baseline_diags = [d for d in diags if d['reason'] != 'UNVERIFIED_SEMANTIC_FRONTIER']
check('baselineDiagnostics537', len(baseline_diags) == 537, len(baseline_diags))
ptr_ok = all(
    sb['unknowns'][int(o['semanticPointer']['path'].rsplit('/', 1)[1])]['reason'] == o['semanticPointer']['reason']
    for o in frontier)
check('frontierPointersResolve', ptr_ok)


def area(f):
    if not f:
        return '<none>'
    p = f.split('/')
    if 'node_modules' in p:
        i = p.index('node_modules')
        return '/'.join(p[:i + (3 if p[i + 1].startswith('@') else 2)])
    return '/'.join(p[:2])


def klass(f):
    if not f:
        return 'unattributed'
    p = f.split('/')
    inst = 'node_modules' in p
    test = bool(re.search(r'(__tests__/|\.test\.|\.spec\.)', f))
    dist = 'dist' in p
    return ('installed' if inst else 'first-party') + ('/dist' if dist else '') + ('/test' if test else '')


# Baseline 537 sub-partition.
base_rows = collections.Counter()
for d in baseline_diags:
    f = d['file'].rsplit(':', 1)[0] if re.search(r':\d+$', d['file']) else d['file']
    base_rows[(d['reason'], klass(f))] += 1
installed_status = collections.Counter((x['status'], x['reason']) for x in sb['installed'])

# Frontier 581 by reason x class.
fr = collections.defaultdict(collections.Counter)
fr_files = collections.defaultdict(set)
for u in sb['unknowns']:
    fr[u['reason']][klass(u['file'])] += 1
    if u['file']:
        fr_files[u['reason']].add(u['file'])
frontier_table = sorted(
    ({'reason': r, 'occurrences': sum(c.values()), 'distinctFiles': len(fr_files[r]), 'byClass': dict(c)}
     for r, c in fr.items()), key=lambda x: (-x['occurrences'], x['reason']))

# v2 same inputs for comparison (no credit).
v2 = collections.Counter(u['reason'] for u in rep_v2['semanticBoundary']['unknowns'])
v3 = collections.Counter(u['reason'] for u in sb['unknowns'])
delta = {r: {'v2': v2.get(r, 0), 'v3': v3.get(r, 0)} for r in sorted(set(v2) | set(v3))}

# Body-phase truncation signature: usage counters and body-level reasons.
BODY_REASONS = {
    'UNKNOWN_FUNCTION', 'UNKNOWN_CALL', 'UNKNOWN_PROPERTY', 'UNKNOWN_INHERITED_PROPERTY', 'UNKNOWN_BINDING',
    'UNKNOWN_BINDING_VALUE', 'UNKNOWN_UNSUPPORTED_SYNTAX', 'UNKNOWN_MUTABLE_BINDING', 'UNKNOWN_OPERATOR',
    'UNKNOWN_OBJECT', 'UNKNOWN_ARRAY', 'UNKNOWN_EXPORT', 'UNKNOWN_EXPORTED_MUTABLE_STATE', 'UNKNOWN_REEXPORT',
    'UNKNOWN_ESCAPED_CAPABILITY', 'UNKNOWN_MUTATION', 'UNKNOWN_TEMPLATE', 'UNKNOWN_THIS', 'UNKNOWN_REFLECTION',
    'UNKNOWN_DYNAMIC_IMPORT_PROMISE', 'UNKNOWN_PARTIAL_RETURN', 'UNKNOWN_OPTIONAL_CHAIN', 'UNKNOWN_BINDING_PATTERN',
    'UNKNOWN_COMPUTED_BINDING', 'UNKNOWN_MISSING_INITIALIZER', 'UNKNOWN_RUNTIME_DECLARATION', 'UNKNOWN_CYCLE',
    'UNKNOWN_MODULE_FORMAT', 'UNKNOWN_COMPILED_PROVENANCE', 'UNKNOWN_TOP_LEVEL_RETURN', 'UNKNOWN_RUNTIME_SYNTAX'}
body_present = {r: v3[r] for r in sorted(BODY_REASONS) if v3.get(r)}
body_present_v2 = {r: v2[r] for r in sorted(BODY_REASONS) if v2.get(r)}
unattributed = [u for u in sb['unknowns'] if u['file'] == '']
unattributed_v2 = [u for u in rep_v2['semanticBoundary']['unknowns'] if u['file'] == '']
truncation = {
    'usageV3': {k: sb['usage'][k] for k in ('states', 'contexts', 'callDepth', 'unionValues', 'nodes', 'files')},
    'usageV2': {k: rep_v2['semanticBoundary']['usage'][k] for k in ('states', 'contexts', 'callDepth', 'unionValues', 'nodes', 'files')},
    'bodyLevelReasonsV3': body_present,
    'bodyLevelReasonsV2': body_present_v2,
    'unattributedUnknownsV3': unattributed,
    'unattributedUnknownsV2': unattributed_v2,
    'starts': None,
    'telemetryV3': rep['semanticTelemetry'],
    'interpretation': (
        'O analisador registrou estado K6 para 7 instruções (v2: 1), zero contextos de chamada e zero valores de '
        'união, e uma única família de motivo de corpo (UNKNOWN_FUNCTION) além de UNKNOWN_COMPILED_PROVENANCE. '
        'A entrada sem arquivo é a assinatura do catch externo do worker. Ver chain-witness.json e body-controls.json.')
}
graph = json.loads(gzip.open(B / 'real-postcert-normal-graph.json.gz').read())
truncation['starts'] = len(graph['starts'])
# Same abort signature in v2: first sorted module, first edge without a resolution record.
first = 'apps/api/src/__tests__/approval-actions.test.ts'
v2res = rep_v2['semanticBoundary']['runtimeResolution']['resolutions']
v3res = sb['runtimeResolution']['resolutions']
truncation['v2FirstEdge'] = {
    'importer': first, 'specifier': 'vitest',
    'v2ResolutionRecord': any(r['from'] == first and r['specifier'] == 'vitest' for r in v2res),
    'v3ResolutionRecord': any(r['from'] == first and r['specifier'] == 'vitest' for r in v3res),
    'v2ImporterUnknowns': sorted({u['reason'] for u in rep_v2['semanticBoundary']['unknowns'] if u['file'] == first}),
    'interpretation': ('v2 parou na 1a aresta (vitest recusado por metadados, sem registro de resolução): states=1. '
                       'v3 resolve vitest e para 6 módulos adiante. A origem antes "sem atribuição" é o catch externo.')}
check('v2AbortAtFirstEdge', not truncation['v2FirstEdge']['v2ResolutionRecord'] and truncation['v2FirstEdge']['v3ResolutionRecord'])

# Dist census of acquired code inputs, with compiled receipt coverage.
inputs = {x['file']: x['sha256'] for x in sb['inputs']}
cp = {x['file']: x['sha256'] for x in sb['compiledProvenance']['files']}
code = [f for f in inputs if re.search(r'\.(js|mjs|cjs|ts|mts|cts|tsx|jsx)$', f)]
analysable = [f for f in code if re.search(r'\.(js|mjs|cjs|ts|mts|cts)$', f) and not re.search(r'\.d\.[cm]?ts$', f)]
dist_rows = collections.Counter()
dist_pkgs = collections.defaultdict(collections.Counter)
for f in analysable:
    p = f.split('/')
    if 'dist' not in p:
        continue
    if 'node_modules' in p:
        c = 'installed-dist'
    elif f in cp and cp[f] == inputs[f]:
        c = 'first-party-dist-covered-by-receipt'
    else:
        c = 'first-party-dist-not-covered'
    dist_rows[c] += 1
    dist_pkgs[c][area(f)] += 1
receipt_projects = sorted({'/'.join(f.split('/')[:2]) for f in cp})

out = {
    'task': 'HISO005-P2-NEXT-RECON-20261018',
    'observedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'source': {'evidence': str(B.relative_to(ROOT)), 'normalReportSha256': hashlib.sha256(raw_n).hexdigest(),
               'strictReportSha256': hashlib.sha256(raw_s).hexdigest(),
               'v2SameReportSha256': hashlib.sha256(raw_v2).hexdigest(), 'sourceCommit': summary['sourceCommit'],
               'kernelVersion': sb['kernelVersion']},
    'checks': checks,
    'totals': {'diagnostics': len(diags), 'baselineUnresolved': len(baseline_diags), 'frontier': len(frontier),
               'byDiagnosticReason': dict(diag_reason)},
    'baseline537': {
        'globalBlocker': ('semanticBoundary.status=UNKNOWN: o engine só emite provas quando status=PROVEN '
                          '(scripts/boundary-semantic-engine.mjs, bloco out.status/emit); nenhuma origem baseline '
                          'pode ser resolvida enquanto houver qualquer UNKNOWN. Não há atribuição causal por origem.'),
        'byReasonAndClass': [{'reason': r, 'class': c, 'occurrences': n} for (r, c), n in sorted(base_rows.items())],
        'installedStatus': [{'status': s, 'reason': r, 'count': n} for (s, r), n in installed_status.items()],
    },
    'frontier581': frontier_table,
    'v2SameInputComparison': {'note': 'Mesmos inputs; diferença é navegação, não resolução.', 'byReason': delta,
                              'totalV2': sum(v2.values()), 'totalV3': sum(v3.values())},
    'bodyPhaseTruncation': truncation,
    'distCensus': {
        'note': 'Arquivos de código analisáveis adquiridos (exclui .d.ts/.tsx). Latente: só 6 foram carregados no corpo.',
        'analysableCodeInputs': len(analysable), 'codeInputs': len(code),
        'byClass': dict(dist_rows), 'byClassAndArea': {k: dict(v) for k, v in dist_pkgs.items()},
        'compiledReceiptProjects': receipt_projects, 'compiledReceiptFiles': len(cp),
        'engineRule': "file.split('/').includes('dist') => exige input.compiled PROVEN e sha do arquivo no receipt; senão UNKNOWN_COMPILED_PROVENANCE",
    },
}
out['status'] = 'PASS' if all(c['ok'] for c in checks) else 'FAIL'
(OUT / 'cause-partition.json').write_text(json.dumps(out, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'status': out['status'], 'failed': [c['name'] for c in checks if not c['ok']],
                  'frontierTop': [(x['reason'], x['occurrences'], x['distinctFiles']) for x in frontier_table],
                  'baseline': out['baseline537']['byReasonAndClass'], 'dist': dict(dist_rows),
                  'truncation': {k: truncation[k] for k in ('usageV3', 'usageV2', 'bodyLevelReasonsV3', 'starts')}},
                 ensure_ascii=False, indent=1))
raise SystemExit(0 if out['status'] == 'PASS' else 1)
