from pathlib import Path
import datetime
import hashlib
import json
import os
import signal
import socket
import subprocess
import time

work = Path('/tmp/cvg-aud0590-f07-20260929')
checkout = work / 'checkout'
setup = json.loads((work / 'setup.json').read_text())
assert (work / 'matrix-run.json').is_file(), 'Preserve the first run.'
assert not (work / 'matrix-r2-run.json').exists(), 'Second run already recorded.'
assert (checkout / 'packages/shared/dist/index.js').is_file(), 'Compile the shared workspace before running.'
for port in (3267, 4267):
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', port))
env = {key: os.environ[key] for key in ('HOME', 'LANG', 'LC_ALL', 'PATH') if key in os.environ}
env['PATH'] = '/home/ricardo/.nvm/versions/node/v22.23.2/bin:' + env.get('PATH', '/usr/bin:/bin')
env.update({'CI': '1', 'NO_COLOR': '1', 'CVG_API_PORT': '3267', 'CVG_WEB_PORT': '4267', 'PLAYWRIGHT_JSON_OUTPUT_NAME': str(work / 'matrix-r2-raw.json')})
command = ['node', 'node_modules/.bin/playwright', 'test', '--config=playwright.f07.config.ts', '--output=' + str(work / 'test-results-r2'), '--retries=0']
before = {str(p.relative_to(checkout)): hashlib.sha256(p.read_bytes()).hexdigest() for p in (checkout / 'packages/shared/dist').rglob('*') if p.is_file()}
started = datetime.datetime.now(datetime.timezone.utc).isoformat()
start = time.monotonic()
timed_out = False
with (work / 'matrix-r2.log').open('w') as log:
    process = subprocess.Popen(command, cwd=checkout, env=env, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
    try:
        code = process.wait(timeout=300)
    except subprocess.TimeoutExpired:
        timed_out = True
        os.killpg(process.pid, signal.SIGTERM)
        try:
            code = process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGKILL)
            code = process.wait()
changed = [name for name, digest in setup['trackedFileHashes'].items() if not (checkout / name).is_file() or hashlib.sha256((checkout / name).read_bytes()).hexdigest() != digest]
occupied = []
for port in (3267, 4267):
    with socket.socket() as sock:
        if sock.connect_ex(('127.0.0.1', port)) == 0:
            occupied.append(port)
result = {
    'sourceCommit': setup['sourceCommit'],
    'command': command,
    'startedAt': started,
    'endedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'durationSeconds': round(time.monotonic() - start, 3),
    'node': subprocess.check_output(['node', '--version'], env=env, text=True).strip(),
    'exitCode': code,
    'timedOut': timed_out,
    'trackedSourceDrift': changed,
    'portsStillListening': occupied,
    'reasonForNewRun': 'First run lacked packages/shared/dist/index.js required by package exports. tsc -b packages/shared/tsconfig.json passed; importing the package then returned shared_export function.',
    'buildCommand': 'node_modules/.bin/tsc -b packages/shared/tsconfig.json --pretty false',
    'buildExitCode': 0,
    'generatedSharedHashes': before,
    'syntheticEnvironment': 'Only HOME/LANG/LC_ALL/PATH inherited; no database/provider credentials or root .env.',
    'harnessChanges': 'Same loopback fixture/config as run 1; no assertion, timeout, retry, or product source changes.',
    'retries': 0,
    'artifacts': {}
}
for p in [work / 'matrix-r2.log', work / 'matrix-r2-raw.json', work / 'run_matrix_recheck.py']:
    if p.is_file():
        result['artifacts'][str(p.relative_to(work))] = hashlib.sha256(p.read_bytes()).hexdigest()
(work / 'matrix-r2-run.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({k: v for k, v in result.items() if k != 'generatedSharedHashes'}, indent=2))
raise SystemExit(code if code >= 0 else 1)
