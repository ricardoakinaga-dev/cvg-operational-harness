"""Versioned multiplicity ledger (537 + 1721 + 1072 + 581 + v4) and SPEC0241 §3.5 conservation (v3 same input vs v4).

No credit for disappearance or replacement of a cause; location correspondence is navigation only.
"""
import collections, gzip, json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

state, freeze, review, h = assert_frozen(allow_cert_dirty=True)
canon = lambda x: json.dumps(x, ensure_ascii=False, sort_keys=True, separators=(',', ':'))
rid = lambda row: shab(canon({k: v for k, v in row.items() if k != 'id'}).encode())
gz = lambda p: json.loads(gzip.decompress(Path(p).read_bytes()))
E = EV.parent
r0236 = gz(E / 'HISO005-0236-BUILTIN-REPAIR-20261018/real-postcert-normal-report.json.gz')
r0237 = gz(E / 'HISO005-P2-BUILD-0237-20261018/real-postcert-normal-report.json.gz')
r0240 = gz(E / 'HISO005-P2-BUILD-0240-20261018/real-postcert-normal-report.json.gz')
v4 = gz(EV / 'real-postcert-normal-report.json.gz')
v4g = gz(EV / 'real-postcert-normal-graph.json.gz')
v3 = gz(EV / 'real-v3same-normal-report.json.gz')
s36, s37, s40, s4, s3 = (r['semanticBoundary'] for r in (r0236, r0237, r0240, v4, v3))
assert len(s36['origins']) == 537 and len(s36['frontierOrigins']) == 1721
assert len(s37['frontierOrigins']) == 1072 and len(s40['frontierOrigins']) == 581
changed = {row['path'] for row in freeze['files']}

def physical(rows):
    out = collections.Counter()
    for row in rows:
        assert rid(row) == row['id']
        if row['file'] is None:
            assert row['fileSha256'] is None
            out['unavailableNull'] += 1
            continue
        p = CANDIDATE / row['file']
        if p.is_file() and not p.is_symlink() and sha(p) == row['fileSha256']:
            out['physicalExact'] += 1
        elif row['file'] in changed:
            out['fileChangedByThis0241Delta'] += 1
        else:
            out['physicalMismatchOther'] += 1
    return dict(out)

EDGE = set(json.loads((EV / 'reason-census-base.json').read_text())['perEdgeList']) | {'UNKNOWN_ENCODING'}
ENVELOPE = {'UNKNOWN_ANALYSIS_LIMIT', 'UNKNOWN_REVALIDATION', 'UNKNOWN_WORKER_ERROR', 'UNKNOWN_INVALID_WORKER_RESULT',
            'UNKNOWN_INPUT_REVALIDATION', 'UNKNOWN_INSTALLED_REFERENCE'}
T = lambda u: (u.get('file', ''), u['reason'], u.get('detail', '') or '')
v4set = collections.Counter(T(u) for u in s4['unknowns'])
v4byreason = collections.defaultdict(set)
for f, r, d in v4set:
    v4byreason[(r, d)].add(f)
persisted, exception1, exception2, exception3, envelope, defects = [], [], [], [], [], []
for u in s3['unknowns']:
    t = T(u)
    f, r, d = t
    if r in ENVELOPE:
        envelope.append(t)
    elif v4set[t]:
        persisted.append(t)
    elif f == '' and r in EDGE and any(x for x in v4byreason[(r, d)] if x):
        exception1.append({'v3': t, 'v4Files': sorted(x for x in v4byreason[(r, d)] if x)})
    elif r == 'UNKNOWN_COMPILED_PROVENANCE' and 'node_modules' in f.split('/') and (
            not v4set[(f, r, d)]):
        exception2.append({'v3': t, 'v4FileIdentity': sorted(x for (ff, rr, dd) in v4set if ff == f and rr == 'UNKNOWN_INSTALLED_FILE_IDENTITY' for x in [dd])})
    elif r == 'UNKNOWN_FUNCTION' and d == '' and any(ff == f and rr == r and dd for (ff, rr, dd) in v4set):
        exception3.append({'v3': t, 'v4Categories': sorted(dd for (ff, rr, dd) in v4set if ff == f and rr == r and dd)})
    else:
        defects.append(t)
viol = lambda r: collections.Counter(map(canon, r['violations'])) + collections.Counter(map(canon, r['semanticBoundary']['violations']))
v3viol, v4viol = viol(v3), viol(v4)
ids4 = collections.Counter(x['id'] for x in s4['frontierOrigins'])
reasons = lambda s: dict(sorted(collections.Counter(x['reason'] for x in s['unknowns']).items()))
result = {'task': TASK, 'status': 'LEDGER_RECORDED' if not defects else 'CONSERVATION_DEFECT', 'observedAt': now(), 'sourceCommit': h,
          'kernelVersions': {'0236': s36['kernelVersion'], '0237': s37['kernelVersion'], '0240-v3-sealed': s40['kernelVersion'],
                             'v3SameInput': s3['kernelVersion'], 'current': s4['kernelVersion']},
          'baseline': {'historical537': len(s36['origins']), 'currentTreeBaseline': len(s4['origins']),
                       'currentBaselineMultisetEqualsV3SameInput': collections.Counter(map(canon, s4['origins'])) == collections.Counter(map(canon, s3['origins'])),
                       'historical537ExactIdsInCurrentBaseline': sum(1 for x in s36['origins'] if x['id'] in {y['id'] for y in s4['origins']}),
                       'note': 'A composição af63ba60 avalia uma árvore maior (890 diagnósticos default); as 537 origens históricas da f22a74a0 ficam no ledger com seus hashes, sem crédito.'},
          'counts': {'baseline': len(s4['origins']), 'historical0236Frontier': len(s36['frontierOrigins']), 'frontier0237': len(s37['frontierOrigins']),
                     'frontier0240v3Sealed': len(s40['frontierOrigins']), 'v3SameInputFrontier': len(s3['frontierOrigins']),
                     'currentFrontier': len(s4['frontierOrigins']), 'currentDiagnostics': len(v4['diagnostics']),
                     'v3SameInputDiagnostics': len(v3['diagnostics'])},
          'physicalChecks': {'baseline537': physical(s4['origins']), 'historical1721': physical(s36['frontierOrigins']),
                             'frontier1072': physical(s37['frontierOrigins']), 'frontier581': physical(s40['frontierOrigins']),
                             'currentFrontier': physical(s4['frontierOrigins'])},
          'exactTupleOverlapWithCurrent': {'historical1721': sum(1 for x in s36['frontierOrigins'] if ids4[x['id']]),
                                           'frontier1072': sum(1 for x in s37['frontierOrigins'] if ids4[x['id']]),
                                           'frontier581': sum(1 for x in s40['frontierOrigins'] if ids4[x['id']])},
          'conservation': {'rule': 'SPEC0241 §3.5 + errata E5/E7, v3 and v4 on the same frozen candidate inputs and limits',
                           'v3Unknowns': len(s3['unknowns']), 'persistedExact': len(persisted),
                           'exception1EdgeTupleToImporter': exception1, 'exception2InstalledCompiledProvenance': exception2,
                           'exception3FunctionCategories': exception3, 'envelopeTuplesSeparated': envelope,
                           'defects': defects, 'pass': not defects},
          'violations': {'v3SameInput': sum(v3viol.values()), 'current': sum(v4viol.values()),
                         'v3MultisetContainedInCurrent': all(v4viol[k] >= n for k, n in v3viol.items())},
          'proofs': {'v3SameInput': len(s3['proofs']), 'current': len(s4['proofs'])},
          'reasons': {'v3SameInput': reasons(s3), 'current': reasons(s4)},
          'installed': {'rows': len(v4g['installed']), 'MATCH': sum(1 for x in v4g['installed'] if x['contentIdentity']['status'] == 'MATCH'),
                        'verified': sum(1 for x in v4g['installed'] if x['verified'])},
          'original537Tuples': s4['origins'], 'historical1721Tuples': s36['frontierOrigins'], 'frontier1072Tuples': s37['frontierOrigins'],
          'frontier581Tuples': s40['frontierOrigins'], 'currentTuples': s4['frontierOrigins'],
          'priorResolvedCredit': 0,
          'interpretation': 'Versioned semantic cause inventories. Every prior and current canonical occurrence is retained with multiplicity; a replaced cause, a changed pointer or a lower count earns no resolution credit. More UNKNOWN is not a trust regression. B6 remains open unless the full contract is met.',
          'b6Accepted': False, 'productionApproved': False}
save('profile-frontier-multiset-reconciliation.json', result)
print(json.dumps({k: v for k, v in result.items() if k in ('status', 'baseline', 'counts', 'physicalChecks', 'exactTupleOverlapWithCurrent', 'violations', 'proofs', 'installed', 'kernelVersions')}
                 | {'conservation': {k: (v if not isinstance(v, list) else len(v)) for k, v in result['conservation'].items()}, 'reasonsCurrent': result['reasons']['current']}, indent=1))
