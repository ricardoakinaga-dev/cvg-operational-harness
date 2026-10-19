"""npm run certify (16 gates, Node22) in the frozen 0240 candidate with own PG/ports/TMP/npm cache."""
import json, os, shutil, signal, subprocess, sys, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

attempt = sys.argv[1]
state, freeze, review, h = assert_frozen()
assert load('prepare-runtime.json')['status'] == 'RUNTIME_PREPARED_COMPILED_READER_PROVEN'
consumer = load('consumer-precert-summary.json')
assert consumer['status'] == 'FRESH_COMPILED_CONSUMER_PASS' and consumer['actualGenerationCommit'] == h
pg = load('postgres-resource.json')
assert pg['status'] == 'READY' and pg['label'] == PG_LABEL
assert shutil.disk_usage(CANDIDATE).free > 4 * 1024 ** 3
owned = RUNTIME / ('certify-' + attempt)
owned.mkdir()
(owned / 'tmp').mkdir()
(owned / 'npm-cache').mkdir()
for name in ['user.npmrc', 'global.npmrc']:
    (owned / name).write_text('')
env = {k: os.environ[k] for k in ['HOME', 'USER', 'LOGNAME', 'LANG', 'LC_ALL', 'TZ', 'DISPLAY', 'XAUTHORITY'] if k in os.environ}
env.update(PATH=NODEBIN + ':/usr/local/bin:/usr/bin:/bin', CI='true', CVG_TEST_SCOPE='all', TEST_DATABASE_URL=pg['testDatabaseUrl'],
           PHASE4A_DISPOSABLE_PG='1', PHASE4A_PG_REQUIRED='1', CVG_API_PORT=str(API_PORT), CVG_WEB_PORT=str(WEB_PORT),
           TMPDIR=str(owned / 'tmp'), NPM_CONFIG_CACHE=str(owned / 'npm-cache'), NPM_CONFIG_USERCONFIG=str(owned / 'user.npmrc'),
           NPM_CONFIG_GLOBALCONFIG=str(owned / 'global.npmrc'), NPM_CONFIG_UPDATE_NOTIFIER='false')
argv = [NODEBIN + '/npm', 'run', 'certify']
receipt = {'task': TASK, 'attempt': attempt, 'command': argv, 'cwd': str(CANDIDATE), 'head': h, 'startedAt': now(), 'status': 'RUNNING',
           'testScope': 'all', 'database': 'own synthetic loopback %d %s' % (PG_PORT, pg['database']), 'e2ePorts': [API_PORT, WEB_PORT],
           'ownNpmCache': str(owned / 'npm-cache'), 'environmentKeys': sorted(env), 'sourceFreeze': state['sourceFreeze'],
           'acceptedCodeReview': state['acceptedCodeReview'], 'reviewSha256': sha(EV / state['acceptedCodeReview'])}
logname = 'certify-' + attempt + '.log'
rname = 'certify-' + attempt + '-receipt.json'
start = time.time()
with (EV / logname).open('w') as log:
    process = subprocess.Popen(argv, cwd=CANDIDATE, env=env, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
    stat = Path(f'/proc/{process.pid}/stat').read_text()
    receipt.update(pid=process.pid, pgid=process.pid, processStartTicks=stat[stat.rindex(')') + 2:].split()[19])
    save(rname, receipt)
    print(json.dumps({'pid': process.pid, 'startedAt': receipt['startedAt']}), flush=True)
    while True:
        try:
            code = process.wait(timeout=5)
            break
        except subprocess.TimeoutExpired:
            free = shutil.disk_usage(CANDIDATE).free
            if free < 750 * 1024 ** 2 or time.time() - start > 7200:
                receipt['abortedByOwnedResourceGuard'] = {'availableCandidateBytes': free, 'elapsedSeconds': time.time() - start}
                os.killpg(process.pid, signal.SIGTERM)
                try:
                    code = process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    os.killpg(process.pid, signal.SIGKILL)
                    code = process.wait()
                break
receipt.update(status='FINISHED', exitCode=code, finishedAt=now(), elapsedSeconds=round(time.time() - start, 3))
save(rname, receipt)
print(json.dumps({'exitCode': code, 'elapsedSeconds': receipt['elapsedSeconds']}))
raise SystemExit(code)
