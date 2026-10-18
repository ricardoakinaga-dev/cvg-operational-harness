"""Versioned multiplicity ledger: 537 baseline + 1721 historical (0236) + 1072 (0237) + current v3, and v2 same-input comparison.

No credit for disappearance of a cause; location correspondence is navigation only.
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
g0237 = gz(E / 'HISO005-P2-BUILD-0237-20261018/real-postcert-normal-graph.json.gz')
v3 = gz(EV / 'real-postcert-normal-report.json.gz')
v3g = gz(EV / 'real-postcert-normal-graph.json.gz')
v2 = gz(EV / 'real-v2same-normal-report.json.gz')
s36, s37, s3, s2 = r0236['semanticBoundary'], r0237['semanticBoundary'], v3['semanticBoundary'], v2['semanticBoundary']
assert len(s36['origins']) == 537 and len(s36['frontierOrigins']) == 1721 and len(s37['frontierOrigins']) == 1072
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
            out['fileChangedByThis0240Delta'] += 1
        else:
            out['physicalMismatchOther'] += 1
    return dict(out)

base_equal = collections.Counter(map(canon, s36['origins'])) == collections.Counter(map(canon, s3['origins'])) == collections.Counter(map(canon, s37['origins']))
ids3 = collections.Counter(x['id'] for x in s3['frontierOrigins'])
ids2 = collections.Counter(x['id'] for x in s2['frontierOrigins'])
loc = lambda row: (row['semanticPointer']['reportedFile'] or None, row['semanticPointer']['causalOriginId'])
by3 = collections.defaultdict(list)
for row in s3['frontierOrigins']:
    by3[loc(row)].append(row['id'])

def continuity(rows, tag):
    return [{'priorOriginId': row['id'], 'priorInventory': tag, 'credit': 'NOT_CREDITED_AS_RESOLVED',
             'exactCurrentTupleRetained': row['id'] in ids3, 'sameLogicalLocationCurrentOriginIds': by3[loc(row)]} for row in rows]

strip_ref = lambda x: canon({**x, 'contentIdentity': {k: v for k, v in x['contentIdentity'].items() if k != 'referenceDigest'}})
inst_equal_mod_ref = collections.Counter(map(strip_ref, g0237['installed'])) == collections.Counter(map(strip_ref, v3g['installed']))
viol = lambda r: collections.Counter(map(canon, r['violations'])) + collections.Counter(map(canon, r['semanticBoundary']['violations']))
v2viol, v3viol = viol(v2), viol(v3)
v2_retained = all(v3viol[k] >= n for k, n in v2viol.items())
reasons = lambda s: collections.Counter(x['reason'] for x in s['unknowns'])
only_v2 = [x for x in s2['frontierOrigins'] if ids3[x['id']] == 0]
only_v3 = [x for x in s3['frontierOrigins'] if ids2[x['id']] == 0]
result = {'task': TASK, 'status': 'LEDGER_RECORDED', 'observedAt': now(), 'sourceCommit': h,
          'kernelVersions': {'0236': s36['kernelVersion'], '0237': s37['kernelVersion'], 'v2SameInput': s2['kernelVersion'], 'current': s3['kernelVersion']},
          'original537BaselineMultisetEqualAcross0236_0237_current': base_equal,
          'counts': {'baseline': len(s3['origins']), 'historical0236Frontier': len(s36['frontierOrigins']), 'frontier0237': len(s37['frontierOrigins']),
                     'v2SameInputFrontier': len(s2['frontierOrigins']), 'currentFrontier': len(s3['frontierOrigins']),
                     'currentDiagnostics': len(v3['diagnostics']), 'v2SameInputDiagnostics': len(v2['diagnostics'])},
          'physicalChecks': {'baseline537': physical(s3['origins']), 'historical1721': physical(s36['frontierOrigins']),
                             'frontier1072': physical(s37['frontierOrigins']), 'currentFrontier': physical(s3['frontierOrigins'])},
          'exactTupleOverlap': {'historical1721InCurrent': sum(1 for x in s36['frontierOrigins'] if ids3[x['id']]),
                                'frontier1072InCurrent': sum(1 for x in s37['frontierOrigins'] if ids3[x['id']]),
                                'v2SameInputOnly': len(only_v2), 'currentOnly': len(only_v3)},
          'reasons': {'0237': dict(sorted(reasons(s37).items())), 'v2SameInput': dict(sorted(reasons(s2).items())), 'current': dict(sorted(reasons(s3).items()))},
          'violations': {'v2SameInput': sum(v2viol.values()), 'current': sum(v3viol.values()), 'v2MultisetRetainedInCurrent': v2_retained},
          'proofs': {'v2SameInput': len(s2['proofs']), 'current': len(s3['proofs']), 'currentProofs': s3['proofs']},
          'installed': {'0237Rows': len(g0237['installed']), 'currentRows': len(v3g['installed']), 'equalModuloReferenceDigest': inst_equal_mod_ref,
                        'currentMATCH': sum(1 for x in v3g['installed'] if x['contentIdentity']['status'] == 'MATCH'),
                        'currentVerified': sum(1 for x in v3g['installed'] if x['verified'])},
          'v2SameInputOnlyTuples': only_v2, 'currentOnlyTuples': only_v3,
          'original537Tuples': s3['origins'], 'historical1721Tuples': s36['frontierOrigins'], 'frontier1072Tuples': s37['frontierOrigins'],
          'currentTuples': s3['frontierOrigins'],
          'continuity': continuity(s36['frontierOrigins'], '0236-historical') + continuity(s37['frontierOrigins'], '0237'),
          'priorResolvedCredit': 0,
          'interpretation': 'Versioned semantic cause inventories over the frozen 0240 inputs. Every prior and current canonical occurrence is retained with multiplicity; a replaced cause, a changed pointer or a lower count earns no resolution credit. Only a validated proof for the exact origin could record resolution. B6 remains open unless the full contract is met.',
          'b6Accepted': False, 'productionApproved': False}
save('profile-frontier-multiset-reconciliation.json', result)
print(json.dumps({k: v for k, v in result.items() if k in ('original537BaselineMultisetEqualAcross0236_0237_current', 'counts', 'physicalChecks', 'exactTupleOverlap', 'violations', 'installed', 'kernelVersions')} | {'proofs': {k: v for k, v in result['proofs'].items() if k != 'currentProofs'}, 'reasonsCurrent': result['reasons']['current'], 'reasonsV2': result['reasons']['v2SameInput']}))
