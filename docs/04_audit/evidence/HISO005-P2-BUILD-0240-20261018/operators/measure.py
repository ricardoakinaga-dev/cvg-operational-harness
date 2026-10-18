"""Full B6 measurement normal/strict with a given checker tree over the frozen 0240 candidate inputs.

usage: measure.py <label> <checker-scripts-dir>
Writes real-<label>-{normal,strict}-{report,graph}.json.gz, real-<label>-receipts.json, real-<label>-summary.json.
No allowlist, no cap change. Counts are observations, never resolution credit.
"""
import collections, gzip, json, subprocess, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

label, checker_dir = sys.argv[1], Path(sys.argv[2])
state, freeze, review, h = assert_frozen(allow_cert_dirty=True)
refs = load('references-current.json')
inst, comp = refs['installedReference'], refs['compiledReference']
assert sha(inst['manifestPath']) == inst['expectedSha256'] and sha(comp['manifestPath']) == comp['expectedSha256']
work = RUNTIME / ('measure-' + label)
work.mkdir()
env = minimal_env(work)
flags = ['--installed-reference=' + inst['manifestPath'], '--installed-reference-sha256=' + inst['expectedSha256'], '--semantic',
         '--compiled-build-reference=' + comp['manifestPath'], '--compiled-build-reference-sha256=' + comp['expectedSha256']]
reports, graphs, receipts = [], [], []
for mode in ['normal', 'strict']:
    graph = work / (mode + '-graph.json')
    argv = [NODE, str(checker_dir / 'check-product-boundary.mjs'), str(CANDIDATE), '--graph=' + str(graph), *flags] + (['--strict'] if mode == 'strict' else [])
    started = now()
    p = subprocess.run(argv, cwd=CANDIDATE, env=env, capture_output=True, timeout=900)
    (EV / ('real-' + label + '-' + mode + '-report.json.gz')).write_bytes(gzip.compress(p.stdout, mtime=0))
    gb = graph.read_bytes() if graph.exists() else b''
    (EV / ('real-' + label + '-' + mode + '-graph.json.gz')).write_bytes(gzip.compress(gb, mtime=0))
    receipts.append({'argv': argv, 'cwd': str(CANDIDATE), 'startedAt': started, 'finishedAt': now(), 'exitCode': p.returncode,
                     'stderr': p.stderr.decode(errors='replace'), 'reportSha256': shab(p.stdout), 'graphSha256': shab(gb),
                     'checkerSha256': sha(checker_dir / 'check-product-boundary.mjs')})
    save('real-' + label + '-receipts.json', receipts)
    assert p.returncode in (0, 1) and p.stdout, p.stderr.decode(errors='replace')
    reports.append(json.loads(p.stdout))
    graphs.append(gb)
sem = [dict(r) for r in reports]
for r in sem:
    r.pop('semanticTelemetry', None)
payload_equal = sem[0] == sem[1]
graph_equal = graphs[0] == graphs[1]
r = reports[0]
s = r['semanticBoundary']
canon = lambda x: json.dumps(x, ensure_ascii=False, sort_keys=True, separators=(',', ':'))
ids_ok = all(shab(canon({k: v for k, v in o.items() if k != 'id'}).encode()) == o['id'] for o in s['origins'] + s['frontierOrigins'])
occ = s['occurrences']
physical = unavailable = mismatched = 0
for row in s['frontierOrigins']:
    if row['file'] is None:
        assert row['fileSha256'] is None
        unavailable += 1
        continue
    p = CANDIDATE / row['file']
    if p.is_file() and not p.is_symlink() and sha(p) == row['fileSha256']:
        physical += 1
    else:
        mismatched += 1
summary = {'task': TASK, 'label': label, 'observedAt': now(), 'sourceCommit': h, 'checkerDir': str(checker_dir),
           'B6status': r['status'], 'exitCode': receipts[0]['exitCode'], 'kernelVersion': s['kernelVersion'],
           'diagnostics': len(r['diagnostics']), 'baseline': occ['baseline'], 'resolved': occ['resolved'], 'unresolved': occ['unresolved'],
           'new': occ['new'], 'installed': r['installedPackageCount'], 'installedMATCH': sum(1 for x in json.loads(graphs[0])['installed'] if x['contentIdentity']['status'] == 'MATCH'),
           'installedVerified': sum(1 for x in json.loads(graphs[0])['installed'] if x['verified']),
           'semanticInstalledProven': sum(x['status'] == 'PROVEN' for x in s['installed']), 'consumableProofs': len(s['proofs']),
           'violationsTop': len(r['violations']), 'violationsSemantic': len(s['violations']), 'compiledProvenance': s['compiledProvenance']['status'],
           'originIdsRecomputed': ids_ok, 'frontierPhysicalHashesVerified': physical, 'frontierUnavailableNull': unavailable, 'frontierHashMismatch': mismatched,
           'normalStrictPayloadEqualExcludingTelemetry': payload_equal, 'normalStrictGraphByteEqual': graph_equal,
           'frontierReasons': dict(sorted(collections.Counter(x['reason'] for x in s['unknowns']).items())),
           'installedLockDrift': r['installedLockDrift'], 'b6Accepted': False, 'productionApproved': False}
save('real-' + label + '-summary.json', summary)
print(json.dumps(summary))
