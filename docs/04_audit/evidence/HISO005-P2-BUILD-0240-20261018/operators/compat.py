"""Default/identity (P1) byte equivalence of the current checker vs frozen predecessors on identical inputs, plus CLI error pairs."""
import gzip, json, shutil, subprocess, sys, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

state, freeze, review, h = assert_frozen(allow_cert_dirty=True)
refs = load('references-current.json')
inst = refs['installedReference']
CLOSURE = ['check-product-boundary.mjs', 'boundary-manifests.mjs', 'tsconfig-path-grammar.mjs', 'boundary-code-execution.mjs',
           'boundary-lexical.mjs', 'boundary-installed-identity.mjs', 'boundary-semantic-engine.mjs', 'boundary-semantic-resolution.mjs',
           'boundary-semantic-compiled.mjs', 'boundary-reference-process.mjs']
baselines = {'v2-84d8': '84d8d4b4ed053493533d7e9ad55e574a9e6f9047', 'p1-9b49': '9b494a4d70c3899e25cb249a78316055c306fc99'}
dirs = {}
for name, commit in baselines.items():
    d = RUNTIME / ('baseline-tools-' + name)
    if not d.exists():
        (d / 'scripts').mkdir(parents=True)
        for f in CLOSURE:
            p = subprocess.run(['git', 'show', commit + ':scripts/' + f], cwd=CANDIDATE, capture_output=True)
            if p.returncode == 0:
                (d / 'scripts' / f).write_bytes(p.stdout)
        shutil.copytree(CANDIDATE / 'node_modules/typescript', d / 'node_modules/typescript', symlinks=True)
    if not (d / 'node_modules/semver').exists():
        shutil.copytree(CANDIDATE / 'node_modules/semver', d / 'node_modules/semver', symlinks=True)
    for f in (d / 'scripts').glob('*.mjs'):
        assert f.read_bytes() == subprocess.check_output(['git', 'show', commit + ':scripts/' + f.name], cwd=CANDIDATE)
    assert sha(d / 'node_modules/typescript/lib/typescript.js') == PARSER_SHA
    dirs[name] = d / 'scripts'
work = RUNTIME / 'compat'
work.mkdir(exist_ok=True)
env = minimal_env(work)
checkers = [*dirs.items(), ('current', CANDIDATE / 'scripts')]
rows = []
for mode in ['default', 'identity']:
    flags = [] if mode == 'default' else ['--installed-reference=' + inst['manifestPath'], '--installed-reference-sha256=' + inst['expectedSha256']]
    runs = []
    for label, cdir in checkers:
        out, graph = work / (mode + '-' + label + '.json'), work / (mode + '-' + label + '-graph.json')
        argv = [NODE, str(cdir / 'check-product-boundary.mjs'), str(CANDIDATE), '--graph=' + str(graph), *flags]
        t = time.time()
        with out.open('wb') as stream:
            p = subprocess.run(argv, cwd=CANDIDATE, env=env, stdout=stream, stderr=subprocess.PIPE, timeout=300)
        rep = json.loads(out.read_text())
        runs.append({'label': label, 'argv': argv, 'exitCode': p.returncode, 'stderr': p.stderr.decode(errors='replace'),
                     'elapsedSeconds': round(time.time() - t, 2), 'status': rep['status'], 'diagnostics': len(rep['diagnostics']),
                     'reportSha256': sha(out), 'graphSha256': sha(graph)})
        if label == 'current':
            for kind, path in [('report', out), ('graph', graph)]:
                (EV / ('compatibility-' + mode + '-' + kind + '.json.gz')).write_bytes(gzip.compress(path.read_bytes(), mtime=0))
    equal = len({(x['reportSha256'], x['graphSha256'], x['exitCode'], x['stderr']) for x in runs}) == 1
    rows.append({'mode': mode, 'allByteEqual': equal, 'runs': runs})
errs = []
cases = [['--unknown'], ['--exceptions'], ['--allowlist=/nonexistent'], ['--graph='], ['--installed-reference=/nonexistent'],
         ['--installed-reference-sha256=' + 'a' * 64], ['extra-root'],
         ['--installed-reference=/nonexistent', '--installed-reference=/nonexistent', '--installed-reference-sha256=' + 'a' * 64]]
for flags in cases:
    pair = []
    for label, cdir in checkers:
        argv = [NODE, str(cdir / 'check-product-boundary.mjs'), str(CANDIDATE), *flags]
        p = subprocess.run(argv, cwd=CANDIDATE, env=env, capture_output=True, text=True, timeout=60)
        pair.append({'label': label, 'exitCode': p.returncode, 'stdout': p.stdout, 'stderr': p.stderr})
    errs.append({'flags': flags, 'allEqual': len({(x['exitCode'], x['stdout'], x['stderr']) for x in pair}) == 1, 'exitCodes': [x['exitCode'] for x in pair], 'runs': pair})
ok = all(r['allByteEqual'] for r in rows) and all(e['allEqual'] for e in errs)
result = {'task': TASK, 'sourceCommit': h, 'observedAt': now(), 'status': 'PASS_DEFAULT_AND_IDENTITY_BYTE_EQUIVALENCE' if ok else 'FAIL',
          'baselines': baselines, 'evaluatedPhysicalInputs': str(CANDIDATE), 'installedReferenceSha256': inst['expectedSha256'],
          'rows': rows, 'cliErrorRows': errs, 'b6Accepted': False}
save('compatibility-postcert.json', result)
print(json.dumps({'status': result['status'], 'rows': [{'mode': r['mode'], 'equal': r['allByteEqual'], 'diag': [x['diagnostics'] for x in r['runs']], 'exit': [x['exitCode'] for x in r['runs']]} for r in rows], 'errorsEqual': [e['allEqual'] for e in errs]}))
assert ok
