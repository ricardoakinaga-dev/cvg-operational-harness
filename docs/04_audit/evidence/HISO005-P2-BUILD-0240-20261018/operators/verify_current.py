"""Official current verifier (npm run certification:verify) after certify; expects 38 artifact hashes."""
import json, os, re, subprocess, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

attempt, label = sys.argv[1], sys.argv[2]
receipt = load('certify-' + attempt + '-receipt.json')
assert receipt['status'] == 'FINISHED' and receipt['exitCode'] == 0
state, freeze, review, h = assert_frozen(allow_cert_dirty=True)
assert h == receipt['head']
owned = RUNTIME / ('certify-' + attempt)
pg = load('postgres-resource.json')
env = {k: os.environ[k] for k in ['HOME', 'USER', 'LOGNAME', 'LANG', 'LC_ALL', 'TZ'] if k in os.environ}
env.update(PATH=NODEBIN + ':/usr/local/bin:/usr/bin:/bin', CI='true', CVG_TEST_SCOPE='all', TEST_DATABASE_URL=pg['testDatabaseUrl'],
           PHASE4A_DISPOSABLE_PG='1', PHASE4A_PG_REQUIRED='1', CVG_API_PORT=str(API_PORT), CVG_WEB_PORT=str(WEB_PORT),
           TMPDIR=str(owned / 'tmp'), NPM_CONFIG_CACHE=str(owned / 'npm-cache'), NPM_CONFIG_USERCONFIG=str(owned / 'user.npmrc'),
           NPM_CONFIG_GLOBALCONFIG=str(owned / 'global.npmrc'), NPM_CONFIG_UPDATE_NOTIFIER='false')
argv = [NODEBIN + '/npm', 'run', 'certification:verify']
started = now()
p = subprocess.run(argv, cwd=CANDIDATE, env=env, capture_output=True, text=True, timeout=300)
qualified = re.findall(r'current candidate qualified: ([a-f0-9]{64})', p.stdout + p.stderr)
counts = re.findall(r'verified (\d+) artifact hashes', p.stdout + p.stderr)
record = {'status': 'PASS_CURRENT_38_HASHES' if p.returncode == 0 and len(qualified) == 1 and counts == ['38'] else 'FAIL',
          'label': label, 'mode': 'current', 'sourceCommit': h, 'startedAt': started, 'finishedAt': now(), 'argv': argv,
          'exitCode': p.returncode, 'stdout': p.stdout, 'stderr': p.stderr, 'qualifiedCandidateIds': qualified, 'verifiedArtifactCounts': counts}
save('certification-current-verification-' + label + '.json', record)
print(json.dumps({k: v for k, v in record.items() if k not in ('stdout', 'stderr')}))
assert record['status'] == 'PASS_CURRENT_38_HASHES'
