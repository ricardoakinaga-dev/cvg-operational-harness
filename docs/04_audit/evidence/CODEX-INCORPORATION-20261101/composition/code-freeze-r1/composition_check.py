from pathlib import Path
import datetime, hashlib, json, os, signal, subprocess, sys, time

ROOT = Path('/home/ricardo/Área de trabalho/cvg-operational-harness')
CANDIDATE = Path('/mnt/dados/cvg-work/codex-incorporation-20261101/composed-candidate')
EVIDENCE = ROOT / 'docs/04_audit/evidence/CODEX-INCORPORATION-20261101/composition/checks'
setup = json.loads((CANDIDATE / '.composition/setup.json').read_text())
name, timeout, *argv = sys.argv[1:]
if argv == ['@builder-baseline']:
    argv = ['node', 'scripts/build-runtime.mjs', '--context-dir', setup['baseline_context']]
elif argv == ['@builder-green']:
    argv = ['node', 'scripts/build-runtime.mjs', '--context-dir', setup['green_context']]
elif argv in [['@pack-baseline'], ['@pack-green']]:
    stage = argv[0].removeprefix('@pack-')
    argv = ['node', '/home/ricardo/.nvm/versions/node/v22.23.2/lib/node_modules/npm/bin/npm-cli.js', 'pack', str(Path(setup[stage + '_context']) / 'packages/harness'), '--offline', '--ignore-scripts', '--pack-destination', str(CANDIDATE / '.composition/tarballs' / stage), '--json']
EVIDENCE.mkdir(exist_ok=True)
assert not (EVIDENCE / (name + '.json')).exists(), 'Preserve every attempt'
env = dict(os.environ, PATH='/home/ricardo/.nvm/versions/node/v22.23.2/bin:' + os.environ['PATH'], CVG_TEST_SCOPE='core', TMPDIR=setup['TMPDIR'], npm_config_cache=str(CANDIDATE / '.composition/npm-cache'), npm_config_offline='true', npm_config_ignore_scripts='true', npm_config_update_notifier='false')
paths = ['scripts/build-runtime.mjs', 'scripts/lib/runtime-native-assets.mjs', 'tests/runtime-native-assets.test.js', 'packages/harness/src/kernel/host.ts', 'packages/harness/src/__tests__/managed-native-cleanup-intake.test.ts', '.composition/probe-source.mjs']
def pins():
    return {p: hashlib.sha256((CANDIDATE / p).read_bytes()).hexdigest() if (CANDIDATE / p).exists() else None for p in paths}
before = pins()
start = time.monotonic()
at = datetime.datetime.now(datetime.timezone.utc).isoformat()
process = subprocess.Popen(argv, cwd=CANDIDATE, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, start_new_session=True)
timed_out = False
try:
    output, _ = process.communicate(timeout=float(timeout))
except subprocess.TimeoutExpired:
    timed_out = True
    os.killpg(process.pid, signal.SIGKILL)
    output, _ = process.communicate()
log = EVIDENCE / (name + '.log')
log.write_bytes(output)
result = dict(name=name, argv=argv, started_at=at, limit_seconds=float(timeout), elapsed_seconds=round(time.monotonic()-start, 3), pid=process.pid, exit=process.returncode, timed_out=timed_out, TMPDIR=setup['TMPDIR'], source_pre=before, source_post=pins(), log_sha256=hashlib.sha256(output).hexdigest())
result['source_unchanged'] = result['source_pre'] == result['source_post']
(EVIDENCE / (name + '.json')).write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({k: result[k] for k in ['name', 'exit', 'elapsed_seconds', 'timed_out', 'source_unchanged']}))
print(output.decode(errors='replace')[-2200:])
