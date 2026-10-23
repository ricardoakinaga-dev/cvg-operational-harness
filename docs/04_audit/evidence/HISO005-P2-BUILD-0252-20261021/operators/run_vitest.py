"""(adapted from HISO005-P2-BUILD-0247 run_vitest.py) Run vitest files in the candidate worktree with pinned Node22
and a private TMPDIR/HOME; record the command and a JSON summary (and the full JSON report only with --keep-report).
usage: run_vitest.py <label> [--native] [--keep-report] [--no-save] [--core] [-t <pattern>] <test-file> [...]
--core: npm run test:core (vitest run --exclude 'products/**') with CVG_TEST_SCOPE=core, as the CI bar.
Writes <label>-command.json (and <label>.vitest.json.gz with --keep-report) in the evidence folder; --no-save only
prints (mutants)."""
import gzip, json, shutil, subprocess, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

label, args = sys.argv[1], sys.argv[2:]
native = '--native' in args
keep = '--keep-report' in args
nosave = '--no-save' in args
core = '--core' in args
args = [a for a in args if a not in ('--native', '--keep-report', '--no-save', '--core')]
pattern = None
if '-t' in args:
    i = args.index('-t'); pattern = args[i + 1]; args = args[:i] + args[i + 2:]
files = ['--exclude', 'products/**'] if core else args
assert files
wait_load()
tmp = RUNTIME / ('vitest-' + label)
if tmp.exists():
    shutil.rmtree(tmp)
tmp.mkdir(parents=True)
out_json = tmp / 'report.json'
env = minimal_env(tmp)
env['HOME'] = str(tmp)
if core:
    env['CVG_TEST_SCOPE'] = 'core'
argv = [NODE, 'node_modules/vitest/vitest.mjs', 'run', *(['--config', 'vitest.boundary-native.config.mts'] if native else []), *files,
        *(['-t', pattern] if pattern else []), '--no-file-parallelism', '--maxWorkers=2', '--reporter=json', '--outputFile=' + str(out_json)]
watched = [ENGINE, 'scripts/check-product-boundary.mjs', *[f for f in files if f.startswith('tests/')]]
source = {f: sha(CANDIDATE / f) for f in watched}
started = now()
p = subprocess.run(argv, cwd=CANDIDATE, env=env, capture_output=True, text=True, timeout=14400)
report = json.loads(out_json.read_text()) if out_json.exists() else None
summary = None
if report:
    summary = {k: report.get(k) for k in ['numTotalTests', 'numPassedTests', 'numFailedTests', 'numPendingTests', 'numTodoTests', 'success']}
    failed = []
    for tf in report.get('testResults', []):
        for a in tf.get('assertionResults', []):
            if a.get('status') != 'passed':
                failed.append({'file': Path(tf['name']).name, 'title': a.get('fullName') or a.get('title'), 'status': a.get('status'),
                               'firstMessage': (a.get('failureMessages') or [''])[0][:400]})
        if tf.get('status') == 'failed' and not tf.get('assertionResults'):
            failed.append({'file': Path(tf['name']).name, 'title': '<file>', 'status': 'failed', 'firstMessage': (tf.get('message') or '')[:600]})
    summary['nonPassing'] = failed
    if keep and not nosave:
        (EV / (label + '.vitest.json.gz')).write_bytes(gzip.compress(json.dumps(report, ensure_ascii=False).encode(), mtime=0))
rec = {'task': TASK, 'label': label, 'argv': argv, 'cwd': str(CANDIDATE), 'env': sorted(env), 'startedAt': started, 'finishedAt': now(),
       'exitCode': p.returncode, 'head': head(), 'dirty': git('status', '--porcelain', '--untracked-files=no').splitlines(),
       'sourceSha256': source, 'summary': summary, 'stderrTail': p.stderr[-3000:], 'stdoutTail': p.stdout[-1000:] if not report else ''}
if not nosave:
    save(label + '-command.json', rec)
shutil.rmtree(tmp, ignore_errors=True)
print(json.dumps({'label': label, 'exitCode': p.returncode, 'summary': {k: v for k, v in (summary or {}).items() if k != 'nonPassing'},
                  'nonPassing': len((summary or {}).get('nonPassing', [])),
                  'firstNonPassing': [(x['title'][:120], x['firstMessage'][:200]) for x in (summary or {}).get('nonPassing', [])[:8]]},
                 indent=1, ensure_ascii=False))
if nosave:
    print('@@SUMMARY@@' + json.dumps(summary, ensure_ascii=False))
