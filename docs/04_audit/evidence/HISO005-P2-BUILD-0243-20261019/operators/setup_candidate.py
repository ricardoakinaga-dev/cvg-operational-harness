"""Physical dependency copy (cp -a from the PR #6 port candidate; no install, no lock change) and preflight:
base commit, SPEC/decision hashes, pre-images of SPEC0242 §5 byte for byte, Node and parser pins."""
import json, subprocess, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

log = []
env = {'PATH': '/usr/bin:/bin', 'LANG': 'C', 'LC_ALL': 'C'}
assert head() == BASE, head()
for task, (spec, digest) in SPECS.items():
    assert sha(PROJECT / spec) == digest, spec
decision = json.loads((PROJECT / DECISION).read_text())
assert {d['id']: d['decision'] for d in decision['decisions']}['SPEC0243-BUILD'] == 'APPROVED_LOCAL_BUILD'
assert {d['id']: d['decision'] for d in decision['decisions']}['SPEC0242-BUILD'] == 'APPROVED_LOCAL_BUILD'
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
        links.append({'link': str(p.relative_to(CANDIDATE)), 'target': str(t.relative_to(CANDIDATE))})
pre = {f: {'expected': d, 'actual': sha(CANDIDATE / f)} for f, d in PREIMAGES.items()}
status = git('status', '--porcelain', '--untracked-files=no')
out = {'task': 'HISO005-P2-BUILD-0243 / HISO005-P2-BUILD-0242', 'observedAt': now(), 'candidate': str(CANDIDATE), 'detached': True,
       'head': head(), 'base': BASE, 'baseIs': 'cabeça do PR #6 (porte BUILD0241+T2 sobre a main 62dfba8d)', 'mainHead': git('rev-parse', '--short', 'main'),
       'specs': {t: {'path': s, 'sha256': d} for t, (s, d) in SPECS.items()}, 'decision': DECISION, 'decisionSha256': sha(PROJECT / DECISION),
       'preimages': pre, 'preimagesMatch': all(v['expected'] == v['actual'] for v in pre.values()),
       'copiedDependencyTrees': copied, 'dependencySource': str(DEPS_SOURCE), 'copyMethod': 'cp -a (links relativos de workspace preservados)',
       'workspaceLinks': len(links), 'nodeSha256': sha(NODE), 'nodeMatchesPin': sha(NODE) == NODE_SHA,
       'parserSha256': sha(CANDIDATE / 'node_modules/typescript/lib/typescript.js'),
       'parserMatchesPin': sha(CANDIDATE / 'node_modules/typescript/lib/typescript.js') == PARSER_SHA,
       'trackedClean': status == '', 'install': False, 'commands': log}
out['status'] = 'PASS' if out['preimagesMatch'] and out['nodeMatchesPin'] and out['parserMatchesPin'] and out['trackedClean'] else 'FAIL'
save('0243', 'candidate-preflight.json', out)
print(json.dumps({k: v for k, v in out.items() if k not in ('commands', 'preimages')}, indent=1))
assert out['status'] == 'PASS'
