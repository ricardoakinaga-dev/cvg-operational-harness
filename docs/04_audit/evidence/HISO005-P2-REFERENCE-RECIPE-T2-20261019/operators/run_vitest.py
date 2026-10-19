"""Run focal vitest files in the candidate with pinned Node22 and a private TMPDIR; record command + JSON summary.

usage: run_vitest.py <label> <test-file> [<test-file> ...]
Writes <label>.vitest.json (reporter output) and <label>-command.json in the evidence folder.
"""
import json, shutil, subprocess, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

label, files = sys.argv[1], sys.argv[2:]
assert files
tmp = RUNTIME / ('vitest-' + label)
if tmp.exists():
    shutil.rmtree(tmp)
tmp.mkdir(parents=True)
out_json = tmp / 'report.json'
env = minimal_env(tmp)
env['HOME'] = str(tmp)
argv = [NODE, 'node_modules/vitest/vitest.mjs', 'run', *files, '--no-file-parallelism', '--maxWorkers=2',
        '--reporter=json', '--outputFile=' + str(out_json)]
source = {f: sha(CANDIDATE / f) for f in ['scripts/build-installed-reference.mjs', 'scripts/boundary-semantic-compiled.mjs', 'scripts/boundary-reference-process.mjs',
                                          *files]}
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
    summary['nonPassing'] = failed
    (EV / (label + '.vitest.json')).write_text(json.dumps(report, indent=1, ensure_ascii=False) + '\n')
rec = {'task': TASK, 'label': label, 'argv': argv, 'cwd': str(CANDIDATE), 'env': sorted(env), 'startedAt': started, 'finishedAt': now(),
       'exitCode': p.returncode, 'head': head(), 'dirty': subprocess.check_output(['git', 'status', '--porcelain'], cwd=CANDIDATE, text=True).splitlines(),
       'sourceSha256': source, 'summary': summary, 'stderrTail': p.stderr[-4000:], 'stdoutTail': p.stdout[-2000:]}
save(label + '-command.json', rec)
print(json.dumps({'label': label, 'exitCode': p.returncode, 'summary': {k: v for k, v in (summary or {}).items() if k != 'nonPassing'},
                  'nonPassing': [(x['file'], x['title'][:120]) for x in (summary or {}).get('nonPassing', [])]}, indent=1, ensure_ascii=False))
