"""First failure of new tests against a previous source round: builds RUNTIME/red-<label>/ with the scripts of a
tools copy (e.g. the r1 freeze), the current test files and configs, and node_modules linked to the candidate's;
runs vitest there. usage: red_on_previous.py <task> <label> <tools-name> [--native] [-t pattern] <test-file>..."""
import json, os, shutil, subprocess, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

task, label, tools_name, args = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4:]
native = '--native' in args
args = [a for a in args if a != '--native']
pattern = None
if '-t' in args:
    i = args.index('-t'); pattern = args[i + 1]; args = args[:i] + args[i + 2:]
wait_load()
root = RUNTIME / ('red-' + label)
assert not root.exists()
root.mkdir()
shutil.copytree(RUNTIME / ('tools-' + tools_name) / 'scripts', root / 'scripts', symlinks=True)
shutil.copytree(CANDIDATE / 'tests', root / 'tests', symlinks=True)
for f in ['vitest.config.mts', 'vitest.boundary-native.config.mts', 'package.json', 'tsconfig.json', 'tsconfig.base.json']:
    if (CANDIDATE / f).exists():
        shutil.copy2(CANDIDATE / f, root / f)
os.symlink(CANDIDATE / 'node_modules', root / 'node_modules')
tmp = root / 'tmp'
tmp.mkdir()
out_json = tmp / 'report.json'
env = dict(minimal_env(tmp), HOME=str(tmp))
argv = [NODE, 'node_modules/vitest/vitest.mjs', 'run', *(['--config', 'vitest.boundary-native.config.mts'] if native else []), *args,
        *(['-t', pattern] if pattern else []), '--no-file-parallelism', '--maxWorkers=2', '--reporter=json', '--outputFile=' + str(out_json)]
p = subprocess.run(argv, cwd=root, env=env, capture_output=True, text=True, timeout=7200)
report = json.loads(out_json.read_text()) if out_json.exists() else {}
rows = []
for tf in report.get('testResults', []):
    for a in tf.get('assertionResults', []):
        rows.append({'file': Path(tf['name']).name, 'title': a.get('fullName'), 'status': a.get('status'),
                     'firstMessage': (a.get('failureMessages') or [''])[0][:400]})
rec = {'task': TASKS[task], 'label': label, 'observedAt': now(), 'scriptsFrom': tools_name,
       'scripts': {f.name: sha(f) for f in sorted((root / 'scripts').glob('*.mjs')) if f.name in ('boundary-installed-identity.mjs', 'build-installed-reference.mjs', 'boundary-semantic-compiled.mjs')},
       'tests': {a: sha(CANDIDATE / a) for a in args}, 'argv': argv, 'exitCode': p.returncode,
       'summary': {k: report.get(k) for k in ('numTotalTests', 'numPassedTests', 'numFailedTests')}, 'results': rows, 'stderrTail': p.stderr[-1500:]}
save(task, label + '.json', rec)
shutil.rmtree(root)
print(json.dumps({'label': label, 'summary': rec['summary'], 'failed': [(r['title'][:90], r['firstMessage'][:150].replace('\n', ' ')) for r in rows if r['status'] != 'passed']}, indent=1, ensure_ascii=False))
