"""Independent, read-only reconciliation of the final frozen source report."""
from pathlib import Path
from collections import Counter
import datetime, gzip, hashlib, json, subprocess

ev = Path(__file__).resolve().parent
root = ev.parents[3]
candidate = Path('/home/ricardo/cvg-candidates/hiso005-resolver-fix-20261018')
tmp = Path('/tmp/cvg-hiso005-resolver-fix-20261018')
sha = lambda b: hashlib.sha256(b).hexdigest()
canonical = lambda x: json.dumps(x, sort_keys=True, ensure_ascii=False, separators=(',', ':'))
head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=candidate, text=True).strip()
freeze = json.loads((ev/'source-freeze-r2.json').read_text())
assert head == freeze['commit']
for row in freeze['files']:
    assert sha((candidate/row['path']).read_bytes()) == row['sha256']
report = json.loads((tmp/'real-postcert-normal.json').read_text())
strict = json.loads((tmp/'real-postcert-strict.json').read_text())
baseline = json.loads(gzip.decompress((ev/'compatibility-postcert-default-report.json.gz').read_bytes()))
old = json.loads(gzip.decompress((ev.parent/'HISO005-0234-BUILD-20261017/boundary-final-normal.json.gz').read_bytes()))
graph = json.loads((tmp/'real-postcert-normal-graph.json').read_text())
old_graph = json.loads(gzip.decompress((ev.parent/'HISO005-0234-BUILD-20261017/boundary-final-normal-graph.json.gz').read_bytes()))
sem = report['semanticBoundary']
new = [d for d in report['diagnostics'] if d['reason'] == 'UNVERIFIED_SEMANTIC_FRONTIER']
legacy = [d for d in report['diagnostics'] if d['reason'] != 'UNVERIFIED_SEMANTIC_FRONTIER']
assert Counter(map(canonical, legacy)) == Counter(map(canonical, baseline['diagnostics']))
assert not (Counter(map(canonical, old['diagnostics'])) - Counter(map(canonical, legacy)))
baseline_ids = {o['id'] for o in sem['origins']}
frontier = sem['frontierOrigins']
assert len(baseline_ids) == len(legacy) == len(baseline['diagnostics'])
assert sem['occurrences']['unresolvedOrigins'] == [o['id'] for o in sem['origins']]
assert not report['resolvedDiagnostics'] and not sem['proofs']
assert len(new) == len(frontier) == len(sem['unknowns']) == sem['occurrences']['new']
assert [o['id'] for o in frontier] == sem['occurrences']['newOriginIds']
assert len(set(sem['occurrences']['newOriginIds'])) == len(new)
assert baseline_ids.isdisjoint(sem['occurrences']['newOriginIds'])
physical = unavailable = 0
for i, (origin, diagnostic, unknown) in enumerate(zip(frontier, new, sem['unknowns'])):
    tuple_ = {k:v for k,v in origin.items() if k != 'id'}
    assert sha(canonical(tuple_).encode()) == origin['id'] == diagnostic['originId']
    assert origin['kind'] == 'NonAstDiagnostic' and origin['start'] is None and origin['end'] is None
    assert origin['context'] == 'semantic-frontier'
    pointer = origin['semanticPointer']
    assert pointer == {'path': '#/semanticBoundary/unknowns/'+str(i), 'reportedFile': unknown.get('file') or None,
                       'reason': unknown['reason'], 'detail': unknown.get('detail'), 'causalOriginId': unknown.get('originId')}
    assert diagnostic['detail'] == unknown['reason'] and diagnostic['semanticDetail'] == unknown.get('detail')
    assert diagnostic.get('causalOriginId') == unknown.get('originId')
    if origin['file'] is None:
        assert origin['fileSha256'] is None
        unavailable += 1
    else:
        path = candidate/origin['file']
        assert path.resolve().is_relative_to(candidate) and path.resolve() == path
        assert path.is_file() and not path.is_symlink() and sha(path.read_bytes()) == origin['fileSha256']
        physical += 1
for origin in sem['origins']:
    assert sha(canonical({k:v for k,v in origin.items() if k != 'id'}).encode()) == origin['id']
nodes = lambda g: {x['node'] for x in g['installed']}
assert nodes(graph) == nodes(old_graph) and len(nodes(graph)) == 303
assert not any(x.get('verified') for x in graph['installed'])
assert all(x['status'] == 'UNKNOWN' and not x['proofIds'] for x in sem['installed'])
assert {k:v for k,v in report.items() if k != 'semanticTelemetry'} == {k:v for k,v in strict.items() if k != 'semanticTelemetry'}
assert (tmp/'real-postcert-normal-graph.json').read_bytes() == (tmp/'real-postcert-strict-graph.json').read_bytes()
assert report['status'] == 'INCOMPLETE' and sem['status'] == 'UNKNOWN'
result = {'status':'PASS_OCCURRENCE_AND_PROVENANCE_RECONCILIATION', 'observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
          'sourceCommit':head, 'baselineDiagnostics':len(legacy), 'originalFirstPartyPreserved':168,
          'currentFirstParty':len(legacy)-303, 'baselineResolved':0, 'baselineOpen':len(legacy),
          'newFrontier':len(new), 'uniqueNewOrigins':len(frontier), 'newPhysicalHashVerified':physical,
          'newUnavailablePhysicalOriginNull':unavailable, 'originalInstalledPreserved':len(nodes(old_graph)),
          'currentInstalled':len(nodes(graph)), 'verified':0, 'proofs':0, 'sourceFilesVerified':len(freeze['files']),
          'normalStrictPayloadExactIgnoringTelemetry':True, 'normalStrictGraphByteExact':True,
          'reportSha256':sha((tmp/'real-postcert-normal.json').read_bytes()),
          'scope':'Independent canonical tuple, physical raw-byte hash, unknown pointer, baseline multiset and installed-node reconciliation. No B6 approval.'}
(ev/'postcert-frontier-independent-reconciliation.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result))
