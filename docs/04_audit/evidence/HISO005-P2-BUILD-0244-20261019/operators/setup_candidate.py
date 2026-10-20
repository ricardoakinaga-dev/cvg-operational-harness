"""Detached candidate at the PR #8 head (git worktree add --detach), physical dependency copy (cp -a from the PR #8
dependency tree; no install, no lock change) and preflight: base, SPEC/decision hashes, pre-images byte for byte,
Node and parser pins. The runtime folder is created empty."""
import json, subprocess, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

log = []
env = {'PATH': '/usr/bin:/bin', 'LANG': 'C', 'LC_ALL': 'C'}
assert sha(PROJECT / SPEC[0]) == SPEC[1], 'SPEC0244 SHA'
decision = json.loads((PROJECT / DECISION).read_text())
assert decision['id'] == 'SPEC0244-BUILD' and decision['decision'] == 'APPROVED_LOCAL_BUILD' and decision['specSha256'] == SPEC[1]
pr8 = json.loads(subprocess.check_output(['gh', 'pr', 'view', '8', '--json', 'state,headRefOid,mergedAt'], cwd=PROJECT, text=True))
assert pr8['headRefOid'] == BASE and pr8['state'] == 'OPEN', pr8
assert not CANDIDATE.exists() and not RUNTIME.exists()
RUNTIME.mkdir()
p, rec = run(['git', '-C', str(PROJECT), 'worktree', 'add', '--detach', str(CANDIDATE), BASE], PROJECT, env, log, timeout=600)
assert p.returncode == 0, rec
assert head() == BASE
assert head(DEPS_SOURCE) == BASE, head(DEPS_SOURCE)
copied = []
for rel in ['node_modules', 'apps/web/node_modules']:
    src, dst = DEPS_SOURCE / rel, CANDIDATE / rel
    assert src.is_dir() and not dst.exists(), rel
    p, rec = run(['/usr/bin/cp', '-a', str(src), str(dst)], CANDIDATE, env, log, timeout=1800)
    assert p.returncode == 0, rec
    copied.append(rel)
links = []
for p in sorted((CANDIDATE / 'node_modules/@cvg').iterdir()):
    if p.is_symlink():
        t = p.resolve()
        assert t.is_relative_to(CANDIDATE), (str(p), str(t))
        links.append(str(p.relative_to(CANDIDATE)))
pre = {f: {'expected': d, 'actual': sha(CANDIDATE / f)} for f, d in PREIMAGES.items()}
status = git('status', '--porcelain', '--untracked-files=no')
out = {'task': TASK, 'observedAt': now(), 'candidate': str(CANDIDATE), 'runtime': str(RUNTIME), 'detached': True, 'head': head(), 'base': BASE,
       'baseIs': 'cabeça do PR #8 (main ba9492b0 + BUILD0243/0242); PR #8 ainda OPEN, logo a main não contém 0243/0242', 'pr8': pr8,
       'originMain': git('rev-parse', 'origin/main', cwd=PROJECT),
       'spec': {'path': SPEC[0], 'sha256': SPEC[1]}, 'decision': DECISION, 'decisionSha256': sha(PROJECT / DECISION),
       'formatReceipt': FORMAT_RECEIPT, 'formatReceiptSha256': sha(PROJECT / FORMAT_RECEIPT),
       'preimages': pre, 'preimagesMatch': all(v['expected'] == v['actual'] for v in pre.values()),
       'copiedDependencyTrees': copied, 'dependencySource': str(DEPS_SOURCE), 'copyMethod': 'cp -a (links relativos de workspace preservados)',
       'workspaceLinks': len(links), 'nodeSha256': sha(NODE), 'nodeMatchesPin': sha(NODE) == NODE_SHA,
       'parserSha256': sha(CANDIDATE / 'node_modules/typescript/lib/typescript.js'),
       'parserMatchesPin': sha(CANDIDATE / 'node_modules/typescript/lib/typescript.js') == PARSER_SHA,
       'trackedClean': status == '', 'install': False, 'commands': log}
out['status'] = 'PASS' if out['preimagesMatch'] and out['nodeMatchesPin'] and out['parserMatchesPin'] and out['trackedClean'] else 'FAIL'
save('candidate-preflight.json', out)
print(json.dumps({k: v for k, v in out.items() if k not in ('commands', 'preimages')}, indent=1))
assert out['status'] == 'PASS'
