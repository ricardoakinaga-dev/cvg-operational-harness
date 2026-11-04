from pathlib import Path
import datetime, hashlib, json, os, signal, subprocess, sys, time

ROOT = Path('/home/ricardo/Área de trabalho/cvg-operational-harness')
CANDIDATE = Path('/mnt/dados/cvg-work/codex-incorporation-20261101/cleanup-quality-candidate')
EVIDENCE = ROOT / 'docs/04_audit/evidence/CODEX-INCORPORATION-20261101/cleanup-quality'
setup = json.loads((EVIDENCE / 'setup.json').read_text())
name, limit, *argv = sys.argv[1:]
assert name.replace('-', '').isalnum()
limit = float(limit)
assert 10 <= limit <= 3600
outputs = EVIDENCE / 'checks'
outputs.mkdir(exist_ok=True)
assert not (outputs / (name + '.json')).exists()
assert not (outputs / (name + '.log')).exists()
env = {key: os.environ[key] for key in ['HOME', 'USER', 'LOGNAME', 'LANG', 'TZ'] if key in os.environ}
env.update(PATH='/home/ricardo/.nvm/versions/node/v22.23.2/bin:/usr/local/bin:/usr/bin:/bin', TMPDIR=setup['TMPDIR'], CI='true', NO_COLOR='1', npm_config_cache=str(CANDIDATE / '.cquality/npm-cache'), npm_config_offline='true', npm_config_ignore_scripts='true', npm_config_update_notifier='false')
override = CANDIDATE / '.cquality' / (name + '-env.json')
extra = json.loads(override.read_text()) if override.exists() else {}
assert set(extra).issubset({'TEST_DATABASE_URL', 'DATABASE_URL', 'PHASE4A_PG_REQUIRED', 'PHASE4A_DISPOSABLE_PG', 'CVG_COVERAGE_PER_FILE', 'CVG_API_PORT', 'CVG_WEB_PORT', 'PLAYWRIGHT_JSON_OUTPUT_NAME', 'CI_RUN_ID', 'CI_CANDIDATE_ID', 'CVG_E2E_EXECUTION_ID', 'PLAYWRIGHT_BROWSERS_PATH'})
env.update(extra)
paths = list(setup['source_pins_before']) + ['package-lock.json', 'package.json', 'vitest.config.mts', 'playwright.config.ts']
def pins():
    return {p: hashlib.sha256((CANDIDATE / p).read_bytes()).hexdigest() for p in paths}
before = pins()
started = time.monotonic()
at = datetime.datetime.now(datetime.timezone.utc).isoformat()
log = outputs / (name + '.log')
with log.open('xb') as stream:
    child = subprocess.Popen(argv, cwd=CANDIDATE, env=env, stdout=stream, stderr=subprocess.STDOUT, start_new_session=True)
    live = dict(name=name, argv=argv, pid=child.pid, pgid=child.pid, limit_seconds=limit, started_at=at, runner_pid=os.getpid(), output=str(log))
    (CANDIDATE / '.cquality' / (name + '-live.json')).write_text(json.dumps(live, indent=2) + '\n')
    timed_out = False
    try:
        child.wait(timeout=limit - 8)
    except subprocess.TimeoutExpired:
        timed_out = True
        os.killpg(child.pid, signal.SIGTERM)
        try:
            child.wait(timeout=5)
        except subprocess.TimeoutExpired:
            os.killpg(child.pid, signal.SIGKILL)
            child.wait(timeout=3)
residue = []
for entry in Path('/proc').iterdir():
    if not entry.name.isdigit() or int(entry.name) == os.getpid():
        continue
    try:
        stat = (entry / 'stat').read_text()
        fields = stat[stat.rfind(')') + 2:].split()
        args = (entry / 'cmdline').read_bytes().replace(b'\0', b' ').decode(errors='replace')
        cwd = str((entry / 'cwd').resolve())
        if int(fields[2]) == child.pid or cwd == str(CANDIDATE) or str(CANDIDATE) in args:
            residue.append({'pid': int(entry.name), 'ppid': int(fields[1]), 'pgid': int(fields[2]), 'state': fields[0], 'start_ticks': fields[19], 'candidate_cwd': cwd == str(CANDIDATE)})
    except (FileNotFoundError, PermissionError, ProcessLookupError):
        pass
safe_env = {k: ('<OWN_SYNTHETIC_PG_URL>' if k in {'DATABASE_URL', 'TEST_DATABASE_URL'} else v) for k, v in env.items()}
result = dict(live, elapsed_seconds=round(time.monotonic()-started, 3), exit=child.returncode, timed_out=timed_out, source_pre=before, source_post=pins(), environment=safe_env, log_sha256=hashlib.sha256(log.read_bytes()).hexdigest(), test_scope='UNSET_DEFAULT_ALL', no_added_filters=True)
result['source_unchanged'] = result['source_pre'] == result['source_post']
result['own_candidate_processes_after_gate'] = residue
if name.startswith('host-'):
    result['validation_scope'] = 'FOCAL_HOST_COVERAGE_DIAGNOSTIC_NOT_GLOBAL_ACCEPTANCE'
    result['no_added_filters'] = False
    result['selected_coverage_source'] = 'packages/harness/src/kernel/host.ts'
(outputs / (name + '.json')).write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({k: result[k] for k in ['name', 'exit', 'elapsed_seconds', 'timed_out', 'source_unchanged']}))
print(log.read_text(errors='replace')[-2400:])
