"""Detached candidate at the main 6c9fc651 (BUILD0244 merged), physical dependency copy (cp -a from the PR #9
dependency tree; no install, no lock change) and preflight: SPEC/decision hashes, pre-images, Node and parser pins."""
import json, subprocess, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

log = []
env = {'PATH': '/usr/bin:/bin', 'LANG': 'C', 'LC_ALL': 'C'}
assert sha(PROJECT / SPEC[0]) == SPEC[1], 'SPEC0245 SHA'
dec = json.loads((PROJECT / DECISION).read_text())
d45 = {d['id']: d for d in dec['decisions']}['SPEC0245-BUILD']
assert d45['decision'] == 'APPROVED_LOCAL_BUILD' and d45['specSha256'] == SPEC[1]
assert not CANDIDATE.exists()
RUNTIME.mkdir(exist_ok=True)
p, rec = run(['git', '-C', str(PROJECT), 'worktree', 'add', '--detach', str(CANDIDATE), BASE], PROJECT, env, log, timeout=600)
assert p.returncode == 0, rec
assert head() == BASE
assert sha(DEPS_SOURCE / 'package-lock.json') == sha(CANDIDATE / 'package-lock.json')
copied = []
for rel in ['node_modules', 'apps/web/node_modules']:
    src, dst = DEPS_SOURCE / rel, CANDIDATE / rel
    assert src.is_dir() and not dst.exists(), rel
    p, rec = run(['/usr/bin/cp', '-a', str(src), str(dst)], CANDIDATE, env, log, timeout=1800)
    assert p.returncode == 0, rec
    copied.append(rel)
links = [str(l.relative_to(CANDIDATE)) for l in sorted((CANDIDATE / 'node_modules/@cvg').iterdir()) if l.is_symlink() and l.resolve().is_relative_to(CANDIDATE)]
pre = {f: {'expected': d, 'actual': sha(CANDIDATE / f)} for f, d in PREIMAGES.items()}
status = git('status', '--porcelain', '--untracked-files=no')
out = {'task': TASK, 'observedAt': now(), 'candidate': str(CANDIDATE), 'runtime': str(RUNTIME), 'detached': True, 'head': head(), 'base': BASE,
       'baseIs': 'main 6c9fc651 (PR #9 mergeado: BUILD0244, kernel v5)', 'spec': {'path': SPEC[0], 'sha256': SPEC[1]}, 'decision': DECISION,
       'decisionSha256': sha(PROJECT / DECISION), 'preimages': pre, 'preimagesMatch': all(v['expected'] == v['actual'] for v in pre.values()),
       'copiedDependencyTrees': copied, 'dependencySource': str(DEPS_SOURCE), 'dependencySourceHead': head(DEPS_SOURCE), 'copyMethod': 'cp -a',
       'workspaceLinks': len(links), 'nodeSha256': sha(NODE), 'nodeMatchesPin': sha(NODE) == NODE_SHA,
       'parserSha256': sha(CANDIDATE / 'node_modules/typescript/lib/typescript.js'),
       'parserMatchesPin': sha(CANDIDATE / 'node_modules/typescript/lib/typescript.js') == PARSER_SHA,
       'trackedClean': status == '', 'install': False, 'evalRoot': {'path': str(EVAL_ROOT), 'reconstitution': 'eval-root-reconstitution.json'}, 'commands': log}
out['status'] = 'PASS' if out['preimagesMatch'] and out['nodeMatchesPin'] and out['parserMatchesPin'] and out['trackedClean'] else 'FAIL'
save('candidate-preflight.json', out)
print(json.dumps({k: v for k, v in out.items() if k not in ('commands', 'preimages')}, indent=1))
assert out['status'] == 'PASS'
