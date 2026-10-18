"""Read-only reconciliation of local recon evidence; never imports target code."""
from pathlib import Path
import collections
import datetime
import gzip
import hashlib
import json
import os
import subprocess

EV = Path(__file__).resolve().parent
ROOT = EV.parents[3]
OLD = EV.parent / 'HISO005-P2-BUILD-0237-20261018'
recovery = json.loads((EV / 'recovery.json').read_text())
CANDIDATE = Path(recovery['candidate'])
RUNTIME = Path(recovery['runtime'])
checks = []


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def check(name, condition, detail):
    checks.append({'check': name, 'result': 'PASS' if condition else 'FAIL', 'detail': detail})


def canonical(obj):
    return json.dumps(obj, sort_keys=True, ensure_ascii=False, separators=(',', ':'))


manifest_path = OLD / 'evidence-manifest-final.json'
manifest = json.loads(manifest_path.read_text())
bad = []
for row in manifest['files']:
    f = OLD / row['path']
    if not f.is_file() or f.stat().st_size != row['bytes'] or sha(f) != row['sha256']:
        bad.append(row['path'])
check('NR01_previous_seal', not bad and sha(manifest_path) == recovery['previousManifestSha256'],
      {'files': len(manifest['files']), 'bytes': sum(x['bytes'] for x in manifest['files']), 'mismatches': bad})
bad_source = [r['path'] for r in recovery['sourcePreimages'] if sha(CANDIDATE / r['path']) != r['sha256']]
bad_root = [r['path'] for r in recovery['sourcePreimages'][:7] if sha(ROOT / r['path']) != r['sha256']]
check('NR01_candidate20_root7', not bad_source and not bad_root,
      {'candidateMismatches': bad_source, 'rootMismatches': bad_root})


def git(*args):
    return subprocess.check_output(['git', '-C', str(ROOT), *args], text=True).strip()


index = Path(git('rev-parse', '--git-path', 'index'))
if not index.is_absolute():
    index = ROOT / index
current = {'head': git('rev-parse', 'HEAD'), 'branch': git('branch', '--show-current'), 'indexSha256': sha(index)}
check('NR01_root_control_metadata', current['head'] == recovery['rootHead'] and
      current['branch'] == recovery['rootBranch'] and current['indexSha256'] == recovery['rootIndexSha256'], current)
census = json.loads((EV / 'census.json').read_text())
census_command = json.loads((EV / 'census-command.json').read_text())
census_stdout = json.loads(census_command['stdout'])
raw = OLD / 'real-postcert-normal-report.json.gz'
report = json.loads(gzip.decompress(raw.read_bytes()))
origins = [x for x in report['semanticBoundary']['frontierOrigins']
           if x['semanticPointer']['reason'] == 'UNKNOWN_AMBIGUOUS_RESOLUTION']
expected = collections.Counter(map(canonical, origins))
observed = collections.Counter(canonical(x['origin']) for x in census['records'])
check('NR02_all359_origins', expected == observed and len(origins) == 359 and
      sha(raw) == census['sourceReportCompressedSha256'] and
      sha(EV / 'collect-ambiguity-candidates.mjs') == census['operatorSha256'] and
      census_command['exitCode'] == 0 and census_stdout['summary'] == census['summary'],
      {'origins': len(origins), 'uniqueIds': len({x['id'] for x in origins}),
       'missing': sum((expected - observed).values()), 'extra': sum((observed - expected).values()),
       'operatorSha256': census['operatorSha256'], 'rawCensusSummaryEqual': census_stdout['summary'] == census['summary']})
bad_files = [x['file'] for x in census['files'] if sha(CANDIDATE / x['file']) != x['sourceSha256']]
bad_owners = [x['file'] for x in census['ownerManifests'] if sha(CANDIDATE / x['file']) != x['sha256']]
edges = [x for x in census['edges'] if x.get('reason') == 'UNKNOWN_AMBIGUOUS_RESOLUTION']
check('NR02_physical_and_guard', not bad_files and not bad_owners and len(census['files']) == 358 and
      len(census['edges']) == 1586 and len(edges) == 360 and
      all(x['guardClass'] == 'OWNER_BROWSER_OR_IMPORTS_PRESENCE' and ':949:' in x['stack'] for x in edges),
      {'physical': len(census['files']), 'candidates': len(census['edges']), 'guardEdges': len(edges),
       'sourceMismatches': bad_files, 'ownerMismatches': bad_owners, 'attribution': census['summary']['attribution']})
check('NR02_fd_and_target_control', census['trackedResidualAtEnd'] == 0 and
      census['summary']['allOwnFDsClosed'] and census['targetModuleEvaluations'] == 0 and census['blockedTargetLoads'] == 0,
      {'residualFDs': census['trackedResidualAtEnd'], 'highWaterOnly': census['summary']['maximumDescriptorHighWater'],
       'targetModuleEvaluations': census['targetModuleEvaluations'], 'observerCorrection': 'descriptor-observer-correction.json'})
bindings = json.loads((EV / 'node-primary-source-binding.json').read_text())
check('NR03_native_primary_binding', sha(Path(bindings['binary'])) == bindings['binarySha256'] and
      all(sha(EV / x['path']) == x['sha256'] for x in bindings['sources']),
      {'binarySha256': bindings['binarySha256'], 'sources': len(bindings['sources'])})
fixtures = json.loads((EV / 'selector-fixture-inventory.json').read_text())
bad_fixtures = []
for x in fixtures['files']:
    f = RUNTIME / x['path']
    if x['kind'] == 'symlink':
        ok = f.is_symlink() and os.readlink(f) == x['target']
    else:
        ok = f.is_file() and not f.is_symlink() and f.stat().st_size == x['bytes'] and sha(f) == x['sha256']
    if not ok:
        bad_fixtures.append(x['path'])
markers = list(RUNTIME.rglob('TARGET_WAS_EXECUTED'))
check('NR03_fixture_hashes_no_execution', not bad_fixtures and not markers,
      {'filesAndLinks': len(fixtures['files']), 'mismatches': bad_fixtures, 'markers': [str(x) for x in markers]})
witnesses = json.loads((EV / 'selector-witnesses.json').read_text())
real = json.loads((EV / 'real-node-resolution-witnesses.json').read_text())
commands = json.loads((EV / 'node-witness-commands.json').read_text())
expected_outputs = collections.Counter(canonical(x['nodeResolution']) for x in real['rows'])
expected_outputs.update(canonical(x['node']) for x in witnesses['cases'])
expected_outputs.update(canonical(x['frozenHelper']) for x in witnesses['cases'])
actual_outputs = collections.Counter(canonical(json.loads(x['stdout'])) for x in commands[1:])
check('NR03_native_resolution_captures', len(witnesses['cases']) == 28 and len(real['rows']) == 4 and
      expected_outputs == actual_outputs and
      all(x['exitCode'] == 0 for x in commands) and
      all(x['node']['blockedLoads'] == 0 and x['node']['targetModuleEvaluations'] == 0 for x in witnesses['cases']) and
      all(x['nodeResolution']['blockedLoads'] == 0 and x['nodeResolution']['targetModuleEvaluations'] == 0 for x in real['rows']),
      {'privateCases': len(witnesses['cases']), 'realCases': len(real['rows']), 'commands': len(commands),
       'rawSummaryMultisetEqual': expected_outputs == actual_outputs,
       'nativeCwdPassedExplicitly': 'collect-node-witnesses.py:5'})
body = json.loads((EV / 'body-separation.json').read_text())
body_raw = json.loads((EV / 'body-separation-commands.json').read_text())
bad_body = []
for summary, row in zip(body['cases'], body_raw):
    data = json.loads(row['stdout'])
    o = data['out']
    ok = (row['exitCode'] == 0 and summary['case'] == row['case'] and summary['mode'] == row['mode'] and
          summary['rawOutputSha256'] == hashlib.sha256(row['stdout'].encode()).hexdigest() and
          summary['status'] == o['status'] and summary['proofs'] == len(o['proofs']) and
          summary['violations'] == o['violations'] and summary['validation'] == o['validation'] and
          summary['unknownReasons'] == sorted({x['reason'] for x in o['unknowns']}) and
          o['validation']['valid'] and data['blockedCallerTargetLoads'] == 0)
    if not ok:
        bad_body.append([row['case'], row['mode']])
check('NR04_raw_body_control_binding', len(body['cases']) == len(body_raw) == 14 and not bad_body,
      {'rawCases': len(body_raw), 'mismatches': bad_body,
       'statusCounts': dict(collections.Counter(x['status'] for x in body['cases'])),
       'cwdCorrection': 'body-operator-metadata-correction.json', 'futureV3Tests': 'NOT_RUN'})
freeze_path = EV / ('contract-freeze-r2.json' if (EV / 'contract-freeze-r2.json').exists() else 'contract-freeze-r1.json')
freeze = json.loads(freeze_path.read_text())
frozen_ok = sha(ROOT / freeze['spec']['path']) == freeze['spec']['sha256'] and all(
    sha(ROOT / x['path']) == x['sha256'] for x in freeze['inputs'])
check('NR05_current_contract_freeze', frozen_ok, {'freeze': freeze_path.name, 'specSha256': freeze['spec']['sha256'], 'inputs': len(freeze['inputs'])})
result = {'status': 'PASS' if all(x['result'] == 'PASS' for x in checks) else 'FAIL',
          'observedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'checks': checks,
          'scope': 'Read-only reconciliation only; not application certification or approval of SPEC0240',
          'b6Accepted': False}
(EV / 'lead-reconciliation.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'status': result['status'], 'checks': len(checks),
                  'failed': [x for x in checks if x['result'] == 'FAIL']}, ensure_ascii=False))
raise SystemExit(0 if result['status'] == 'PASS' else 1)
