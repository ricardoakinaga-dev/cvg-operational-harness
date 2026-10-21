"""(copied from HISO005-P2-BUILD-0245, unchanged logic) Run vitest files in the candidate with pinned Node22 and a private TMPDIR; record command + JSON summary.

usage: run_vitest.py <label> [--native] [--pg] [-t <pattern>] <test-file> [...]
Writes <label>.vitest.json and <label>-command.json in the task's evidence folder.
"""
import json, shutil, subprocess, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

label, args = sys.argv[1], sys.argv[2:]
native = '--native' in args
pg = '--pg' in args  # own synthetic PG of postgres-resource.json (isolation of certify failures)
args = [a for a in args if a not in ('--native', '--pg')]
pattern = None
if '-t' in args:
    i = args.index('-t'); pattern = args[i + 1]; args = args[:i] + args[i + 2:]
files = args
assert files
wait_load()
tmp = RUNTIME / ('vitest-' + label)
if tmp.exists():
    shutil.rmtree(tmp)
tmp.mkdir(parents=True)
out_json = tmp / 'report.json'
env = minimal_env(tmp)
env['HOME'] = str(tmp)
if pg:
    _pg = load('postgres-resource.json')
    assert _pg['status'] == 'READY' and _pg['label'] == PG_LABEL
    env.update(TEST_DATABASE_URL=_pg['testDatabaseUrl'], PHASE4A_DISPOSABLE_PG='1', PHASE4A_PG_REQUIRED='1', CVG_TEST_SCOPE='all')
argv = [NODE, 'node_modules/vitest/vitest.mjs', 'run', *(['--config', 'vitest.boundary-native.config.mts'] if native else []), *files,
        *(['-t', pattern] if pattern else []), '--no-file-parallelism', '--maxWorkers=2', '--reporter=json', '--outputFile=' + str(out_json)]
watched = ['scripts/boundary-semantic-engine.mjs', 'scripts/check-product-boundary.mjs', 'scripts/boundary-installed-identity.mjs',
           'scripts/build-installed-reference.mjs', 'scripts/boundary-semantic-compiled.mjs', 'scripts/boundary-semantic-resolution.mjs', *files]
source = {f: sha(CANDIDATE / f) for f in watched}
started = now()
p = subprocess.run(argv, cwd=CANDIDATE, env=env, capture_output=True, text=True, timeout=7200)
report = json.loads(out_json.read_text()) if out_json.exists() else None
summary = None
if report:
    summary = {k: report.get(k) for k in ['numTotalTests', 'numPassedTests', 'numFailedTests', 'numPendingTests', 'numTodoTests', 'success']}
    failed = []
    for tf in report.get('testResults', []):
        for a in tf.get('assertionResults', []):
            if a.get('status') != 'passed':
                failed.append({'file': Path(tf['name']).name, 'title': a.get('fullName') or a.get('title'), 'status': a.get('status'),
                               'firstMessage': (a.get('failureMessages') or [''])[0][:600]})
        if tf.get('status') == 'failed' and not tf.get('assertionResults'):
            failed.append({'file': Path(tf['name']).name, 'title': '<file>', 'status': 'failed', 'firstMessage': (tf.get('message') or '')[:600]})
    summary['nonPassing'] = failed
    (EV / (label + '.vitest.json')).write_text(json.dumps(report, indent=1, ensure_ascii=False) + '\n')
rec = {'task': TASK, 'label': label, 'argv': argv, 'cwd': str(CANDIDATE), 'env': sorted(env), 'startedAt': started, 'finishedAt': now(),
       'exitCode': p.returncode, 'head': head(), 'dirty': git('status', '--porcelain').splitlines(),
       'sourceSha256': source, 'summary': summary, 'stderrTail': p.stderr[-4000:], 'stdoutTail': p.stdout[-1500:]}
save(label + '-command.json', rec)
shutil.rmtree(tmp, ignore_errors=True)
print(json.dumps({'label': label, 'exitCode': p.returncode, 'summary': {k: v for k, v in (summary or {}).items() if k != 'nonPassing'},
                  'nonPassing': [(x['file'], x['title'][:110], x['firstMessage'][:160]) for x in (summary or {}).get('nonPassing', [])]}, indent=1, ensure_ascii=False))
