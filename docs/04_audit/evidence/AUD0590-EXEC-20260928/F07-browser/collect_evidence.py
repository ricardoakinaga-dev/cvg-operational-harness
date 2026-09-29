"""Collect the two isolated browser runs without changing product sources."""

from pathlib import Path
from urllib.parse import urlsplit
from zipfile import ZipFile
import hashlib
import json
import shutil


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def tests_in(suites: list[dict]) -> list[dict]:
    result = []
    for suite in suites:
        result.extend(tests_in(suite.get('suites', [])))
        for spec in suite.get('specs', []):
            for test in spec.get('tests', []):
                result.append({
                    'title': spec.get('title'),
                    'project': test.get('projectName'),
                    'outcome': test.get('status'),
                    'attempts': [
                        {'status': item.get('status'), 'retry': item.get('retry')}
                        for item in test.get('results', [])
                    ],
                })
    return result


destination = Path(__file__).resolve().parent
root = destination.parents[4]
work = Path('/tmp/cvg-aud0590-f07-20260929')
old = root / 'docs/04_audit/evidence/AUD0590-DEEP-20260928'
assert (work / 'matrix-r2-run.json').is_file(), 'Wait for the second run.'
copies = {
    'historical-trace.zip': old / 'browser-failure-trace.zip',
    'historical-blank.png': old / 'browser-failure-test-failed-1.png',
    'setup.json': work / 'setup.json',
    'prepare.py': work / 'prepare.py',
    'run_matrix.py': work / 'run_matrix.py',
    'run_matrix_recheck.py': work / 'run_matrix_recheck.py',
    'matrix-run.json': work / 'matrix-run.json',
    'matrix.log': work / 'matrix.log',
    'matrix-raw.json': work / 'matrix-raw.json',
    'matrix-r2-run.json': work / 'matrix-r2-run.json',
    'matrix-r2.log': work / 'matrix-r2.log',
    'matrix-r2-raw.json': work / 'matrix-r2-raw.json',
    'loopback-main.ts': work / 'checkout/apps/api/src/f07-loopback-main.ts',
    'loopback-playwright.config.ts': work / 'checkout/playwright.f07.config.ts',
}
for name, source in copies.items():
    target = destination / name
    assert not target.exists(), f'Preserve existing evidence: {target}'
    shutil.copyfile(source, target)

trace = destination / 'historical-trace.zip'
console = []
failed_requests = []
api_requests = []
with ZipFile(trace) as archive:
    for line, raw in enumerate(archive.read('0-trace.trace').decode().splitlines(), 1):
        item = json.loads(raw)
        if item.get('type') == 'console' and item.get('messageType') == 'error':
            console.append({
                'line': line,
                'message': item.get('text'),
                'path': urlsplit(item.get('location', {}).get('url', '')).path,
                'time': item.get('time'),
            })
    for line, raw in enumerate(archive.read('0-trace.network').decode().splitlines(), 1):
        item = json.loads(raw).get('snapshot', {})
        path = urlsplit(item.get('request', {}).get('url', '')).path
        status = item.get('response', {}).get('status')
        if status == -1:
            failed_requests.append({'line': line, 'path': path, 'status': status})
        if path.startswith('/v1/'):
            api_requests.append({'line': line, 'path': path, 'status': status})

proof = {
    'criterion': 'F07/A59-08',
    'sourceCommit': json.loads((work / 'setup.json').read_text())['sourceCommit'],
    'historicalObservation': {
        'traceSha256': sha256(trace),
        'consoleErrors': console,
        'failedRequests': failed_requests,
        'recordedApiRequests': api_requests,
        'interpretation': 'Module requests failed before the expected heading rendered. The trace reports ERR_NETWORK_CHANGED; the underlying host/network cause is unproven.',
        'limitation': 'No recorded /v1 request is not proof of absence outside the captured interval. A white screenshot alone does not prove an authorization or accessibility defect.',
    },
    'runs': [],
    'productionVerdict': 'NO_GO',
    'scope': 'Existing synthetic bootstrap/session matrix on an isolated committed snapshot; memory API, partial route fixtures, loopback listener derivative. Not integrated release, corporate OIDC, PostgreSQL, or production proof.',
    'artifacts': {},
}
for prefix, classification in [('matrix', 'INVALID_SETUP_MISSING_SHARED_DIST'), ('matrix-r2', 'LOCAL_SYNTHETIC_RECHECK')]:
    report = json.loads((destination / (prefix + '-raw.json')).read_text())
    run = json.loads((destination / (prefix + '-run.json')).read_text())
    proof['runs'].append({
        'classification': classification,
        'record': prefix + '-run.json',
        'exitCode': run['exitCode'],
        'stats': report.get('stats'),
        'tests': tests_in(report.get('suites', [])),
        'trackedSourceDrift': run['trackedSourceDrift'],
        'portsStillListening': run['portsStillListening'],
    })
for name in copies:
    proof['artifacts'][name] = sha256(destination / name)
proof['artifacts']['collect_evidence.py'] = sha256(Path(__file__))
(destination / 'proof.json').write_text(json.dumps(proof, indent=2, ensure_ascii=False) + '\n')
print(json.dumps({'runs': [{'exitCode': x['exitCode'], 'stats': x['stats']} for x in proof['runs']], 'artifacts': len(proof['artifacts']), 'proofSha256': sha256(destination / 'proof.json')}, indent=2))
