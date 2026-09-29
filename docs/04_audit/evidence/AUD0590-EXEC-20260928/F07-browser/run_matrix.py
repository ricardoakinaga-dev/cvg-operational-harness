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
assert not (work / 'matrix-run.json').exists(), 'A run is already recorded.'
for port in (3267, 4267):
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', port))

# Separate synthetic boot fixture: original entrypoint wiring, loopback bind.
# The original tracked main.ts and all assertions remain unchanged.
main = (checkout / 'apps/api/src/main.ts').read_text()
assert main.count("host: '0.0.0.0'") == 1
fixture = checkout / 'apps/api/src/f07-loopback-main.ts'
assert not fixture.exists()
fixture.write_text(main.replace("host: '0.0.0.0'", "host: '127.0.0.1'"))
config = checkout / 'playwright.f07.config.ts'
assert not config.exists()
config.write_text("""import { defineConfig } from '@playwright/test'
import base from './playwright.rem21-014.config.ts'
if (!Array.isArray(base.webServer)) throw new Error('Expected two servers')
export default defineConfig({
  ...base,
  webServer: base.webServer.map((server, index) => ({
    ...server,
    command: index === 0
      ? server.command!.replace('npm run dev:api', 'node --import tsx apps/api/src/f07-loopback-main.ts')
      : server.command + ' --host 127.0.0.1 --strictPort'
  }))
})
""")
env = {key: os.environ[key] for key in ('HOME', 'LANG', 'LC_ALL', 'PATH') if key in os.environ}
env['PATH'] = '/home/ricardo/.nvm/versions/node/v22.23.2/bin:' + env.get('PATH', '/usr/bin:/bin')
env.update({
    'CI': '1',
    'NO_COLOR': '1',
    'CVG_API_PORT': '3267',
    'CVG_WEB_PORT': '4267',
    'PLAYWRIGHT_JSON_OUTPUT_NAME': str(work / 'matrix-raw.json')
})
command = ['node', 'node_modules/.bin/playwright', 'test', '--config=playwright.f07.config.ts', '--output=' + str(work / 'test-results'), '--retries=0']
started = datetime.datetime.now(datetime.timezone.utc).isoformat()
start = time.monotonic()
timed_out = False
with (work / 'matrix.log').open('w') as log:
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
changed = []
for name, digest in setup['trackedFileHashes'].items():
    p = checkout / name
    if not p.is_file() or hashlib.sha256(p.read_bytes()).hexdigest() != digest:
        changed.append(name)
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
    'syntheticEnvironment': 'Only HOME/LANG/LC_ALL/PATH inherited; no database/provider credentials or root .env.',
    'harnessChanges': 'Additional main fixture differs only by 127.0.0.1 bind; wrapper restricts Vite bind, ports/output paths; original assertions and sources unchanged.',
    'artifacts': {}
}
for p in [fixture, config, work / 'matrix.log', work / 'matrix-raw.json']:
    if p.is_file():
        result['artifacts'][str(p.relative_to(work))] = hashlib.sha256(p.read_bytes()).hexdigest()
(work / 'matrix-run.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result, indent=2))
raise SystemExit(code if code >= 0 else 1)
