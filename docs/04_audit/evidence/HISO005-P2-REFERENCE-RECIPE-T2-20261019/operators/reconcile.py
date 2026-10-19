"""SPEC0241 §3.5 conservation (v3 vs v4, same inputs and references) and tuple comparison with the sealed BUILD0241 v4 measurement.

No credit for any disappearance or replacement; counts are observations only.
"""
import collections, gzip, json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

gz = lambda p: json.loads(gzip.decompress(Path(p).read_bytes()))
B = EV.parent / 'HISO005-P2-BUILD-0241-20261018'
L4, L3 = (sys.argv[1], sys.argv[2]) if len(sys.argv) > 2 else ('v4', 'v3same')
v4, v3 = gz(EV / ('real-' + L4 + '-normal-report.json.gz')), gz(EV / ('real-' + L3 + '-normal-report.json.gz'))
b4, b3 = gz(B / 'real-postcert-normal-report.json.gz'), gz(B / 'real-v3same-normal-report.json.gz')
s4, s3, t4, t3 = (r['semanticBoundary'] for r in (v4, v3, b4, b3))
EDGE = set(json.loads((B / 'reason-census-base.json').read_text())['perEdgeList']) | {'UNKNOWN_ENCODING'}
ENVELOPE = {'UNKNOWN_ANALYSIS_LIMIT', 'UNKNOWN_REVALIDATION', 'UNKNOWN_WORKER_ERROR', 'UNKNOWN_INVALID_WORKER_RESULT', 'UNKNOWN_INPUT_REVALIDATION', 'UNKNOWN_INSTALLED_REFERENCE'}
T = lambda u: (u.get('file', ''), u['reason'], u.get('detail', '') or '')
v4set = collections.Counter(T(u) for u in s4['unknowns'])
byreason = collections.defaultdict(set)
for f, r, d in v4set:
    byreason[(r, d)].add(f)
classes = collections.Counter(); defects = []
for u in s3['unknowns']:
    f, r, d = t = T(u)
    if r in ENVELOPE: classes['envelope'] += 1
    elif v4set[t]: classes['persistedExact'] += 1
    elif f == '' and r in EDGE and any(byreason[(r, d)]): classes['exception1'] += 1
    elif r == 'UNKNOWN_COMPILED_PROVENANCE' and 'node_modules' in f.split('/') and not v4set[t]: classes['exception2'] += 1
    elif r == 'UNKNOWN_FUNCTION' and d == '' and any(ff == f and rr == r and dd for (ff, rr, dd) in v4set): classes['exception3'] += 1
    else: defects.append(t)
canon = lambda x: json.dumps(x, ensure_ascii=False, sort_keys=True, separators=(',', ':'))
viol = lambda r: collections.Counter(map(canon, r['violations'])) + collections.Counter(map(canon, r['semanticBoundary']['violations']))
same = lambda a, b: collections.Counter(map(canon, a)) == collections.Counter(map(canon, b))
cmp = {
  'diagnostics': {'now': len(v4['diagnostics']), 'build0241': len(b4['diagnostics'])},
  'unknownTupleMultisetEqual': collections.Counter(T(u) for u in s4['unknowns']) == collections.Counter(T(u) for u in t4['unknowns']),
  'frontierOriginIdsEqual': collections.Counter(x['id'] for x in s4['frontierOrigins']) == collections.Counter(x['id'] for x in t4['frontierOrigins']),
  'baselineOriginsEqual': same(s4['origins'], t4['origins']),
  'violationsEqual': viol(v4) == viol(b4), 'proofs': {'now': len(s4['proofs']), 'build0241': len(t4['proofs'])},
  'phasesEqual': s4.get('phases') == t4.get('phases'), 'bodyCoverageEqual': s4.get('bodyCoverage') == t4.get('bodyCoverage'),
  'installedFileIdentityFilesEqual': [x['file'] for x in s4['installedFileIdentity']['files']] == [x['file'] for x in t4['installedFileIdentity']['files']],
  'compiledProvenance': {'now': s4['compiledProvenance']['status'], 'build0241': t4['compiledProvenance']['status']},
  'v3SameInputUnknownTuplesEqual': collections.Counter(T(u) for u in s3['unknowns']) == collections.Counter(T(u) for u in t3['unknowns']),
  'v3SameInputDiagnostics': {'now': len(v3['diagnostics']), 'build0241': len(b3['diagnostics'])}}
out = {'task': TASK, 'observedAt': now(), 'status': 'PASS' if not defects else 'CONSERVATION_DEFECT',
       'conservation': {'rule': 'SPEC0241 §3.5 + errata E5/E7: v3 (ferramentas af63ba60 com o módulo compilado T2) e v4 nos mesmos inputs e referências',
                        'v3Unknowns': len(s3['unknowns']), **dict(classes), 'defects': defects, 'violationsV3ContainedInV4': all(viol(v4)[k] >= n for k, n in viol(v3).items())},
       'comparisonWithBuild0241': cmp, 'credit': 0,
       'interpretation': 'Mesmos inputs avaliados (árvore 228e7918 da candidata do BUILD0241, sem mudança). As referências passaram a vir da própria fonte pela receita corrigida (instalada da árvore completa, compilada da raiz avaliada). Contagem e frontier são observação; nenhuma igualdade ou diferença vira crédito. B6 continua INCOMPLETE.'}
out['labels'] = {'v4': L4, 'v3SameInput': L3}
save('reconciliation-' + L4 + '.json', out)
print(json.dumps(out, indent=1, ensure_ascii=False)[:3000])
