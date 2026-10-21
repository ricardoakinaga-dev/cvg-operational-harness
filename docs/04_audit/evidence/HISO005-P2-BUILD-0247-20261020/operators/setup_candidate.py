"""Detached candidate at 1d40fe51 (BUILD0245 commit, kernel v6), physical dependency copy (cp -a from the BUILD0245
candidate, same lock; no install, no lock change) and preflight: SPEC/decision hashes, pre-images, Node and parser pins,
ports and PG name free. usage: setup_candidate.py"""
import json, socket, subprocess, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

log = []
env = {'PATH': '/usr/bin:/bin', 'LANG': 'C', 'LC_ALL': 'C'}
assert sha(PROJECT / SPEC[0]) == SPEC[1], 'SPEC0247 SHA'
assert not CANDIDATE.exists() and not RUNTIME.exists()
ports = {}
for port in (PG_PORT, API_PORT, WEB_PORT):
    with socket.socket() as s:
        s.bind(('127.0.0.1', port)); ports[port] = 'free'
pg_existing = subprocess.run(['docker', 'ps', '-a', '--filter', 'name=^' + PG_NAME + '$', '--format', '{{.ID}}'], capture_output=True, text=True).stdout.strip()
assert pg_existing == ''
assert head(DEPS_SOURCE) == BASE and git('status', '--porcelain', '--untracked-files=no', cwd=DEPS_SOURCE) == ''
RUNTIME.mkdir()
p, rec = run(['git', '-C', str(PROJECT), 'worktree', 'add', '--detach', str(CANDIDATE), BASE], PROJECT, env, log, timeout=900, keep=400)
assert p.returncode == 0, rec
assert head() == BASE
lock_c, lock_s = sha(CANDIDATE / 'package-lock.json'), sha(DEPS_SOURCE / 'package-lock.json')
assert lock_c == lock_s == LOCK_SHA, (lock_c, lock_s)
copied = []
for rel in ['node_modules', 'apps/web/node_modules']:
    src, dst = DEPS_SOURCE / rel, CANDIDATE / rel
    assert src.is_dir() and not dst.exists(), rel
    p, rec = run(['/usr/bin/cp', '-a', str(src), str(dst)], CANDIDATE, env, log, timeout=1800)
    assert p.returncode == 0, rec
    copied.append(rel)
links = []
for l in sorted((CANDIDATE / 'node_modules/@cvg').iterdir()):
    if l.is_symlink():
        assert l.resolve().is_relative_to(CANDIDATE), str(l)
        links.append(str(l.relative_to(CANDIDATE)))
watched = ['scripts/boundary-semantic-engine.mjs', 'scripts/check-product-boundary.mjs', 'scripts/boundary-semantic-resolution.mjs',
           'scripts/boundary-semantic-compiled.mjs', 'scripts/boundary-installed-identity.mjs', 'scripts/boundary-code-execution.mjs',
           'scripts/boundary-lexical.mjs', 'scripts/boundary-manifests.mjs', 'scripts/boundary-reference-process.mjs', 'scripts/build-installed-reference.mjs']
pre = {f: {'commitBlob': shab(subprocess.run(['git', 'show', BASE + ':' + f], cwd=CANDIDATE, capture_output=True).stdout), 'worktree': sha(CANDIDATE / f)} for f in watched}
status = git('status', '--porcelain', '--untracked-files=no')
prettier = json.loads((CANDIDATE / 'node_modules/prettier/package.json').read_text())['version']
out = {'task': TASK, 'observedAt': now(), 'candidate': str(CANDIDATE), 'runtime': str(RUNTIME), 'detached': True, 'head': head(), 'base': BASE,
       'baseIs': 'commit do BUILD0245 1d40fe51 (pai 6c9fc651 = main com BUILD0244); kernel v6 semantic-kernel-v6-tsx-parse',
       'spec': {'path': SPEC[0], 'sha256': SPEC[1]}, 'decision': DECISION, 'decisionSha256': sha(PROJECT / DECISION),
       'engineIsV6': sha(CANDIDATE / 'scripts/boundary-semantic-engine.mjs') == V6_ENGINE_SHA, 'preimages': pre,
       'preimagesMatchCommit': all(v['commitBlob'] == v['worktree'] for v in pre.values()),
       'lock': {'candidate': lock_c, 'dependencySource': lock_s, 'evalRoot': sha(EVAL_ROOT / 'package-lock.json'), 'equal': lock_c == lock_s == LOCK_SHA},
       'copiedDependencyTrees': copied, 'dependencySource': str(DEPS_SOURCE), 'dependencySourceHead': head(DEPS_SOURCE), 'copyMethod': 'cp -a (só leitura na origem)',
       'workspaceLinks': len(links), 'nodeSha256': sha(NODE), 'nodeMatchesPin': sha(NODE) == NODE_SHA,
       'parserSha256': sha(CANDIDATE / 'node_modules/typescript/lib/typescript.js'),
       'parserMatchesPin': sha(CANDIDATE / 'node_modules/typescript/lib/typescript.js') == PARSER_SHA, 'prettierVersion': prettier,
       'ports': ports, 'pgNameFree': True, 'trackedClean': status == '', 'install': False, 'commands': log}
out['status'] = 'PASS' if out['engineIsV6'] and out['preimagesMatchCommit'] and out['lock']['equal'] and out['nodeMatchesPin'] and out['parserMatchesPin'] and out['trackedClean'] and prettier == '3.8.3' else 'FAIL'
save('candidate-preflight.json', out)
print(json.dumps({k: v for k, v in out.items() if k not in ('commands', 'preimages')}, indent=1))
assert out['status'] == 'PASS'
