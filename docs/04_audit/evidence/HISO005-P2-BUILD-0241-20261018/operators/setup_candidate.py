"""Physical dependency copy (cp -a, no install/lock change) and preflight of the 0241 candidate."""
import json, shutil, subprocess, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

log = []
env = {'PATH': '/usr/bin:/bin', 'LANG': 'C', 'LC_ALL': 'C'}
assert head() == BASE, head()
assert sha(PROJECT / SPEC) == SPEC_SHA and sha(PROJECT / ERRATA) == ERRATA_SHA
copied = []
for rel in ['node_modules', 'apps/web/node_modules']:
    src, dst = PROJECT / rel, CANDIDATE / rel
    assert src.is_dir() and not dst.exists(), rel
    p, rec = run(['/usr/bin/cp', '-a', str(src), str(dst)], CANDIDATE, env, log, timeout=1800)
    assert p.returncode == 0, rec
    copied.append(rel)
# workspace links are relative and must resolve inside the candidate
links = []
for p in sorted((CANDIDATE / 'node_modules/@cvg').iterdir()):
    if p.is_symlink():
        t = p.resolve()
        assert t.is_relative_to(CANDIDATE), (str(p), str(t))
        links.append({'link': str(p.relative_to(CANDIDATE)), 'target': str(t.relative_to(CANDIDATE))})
lock = subprocess.run(['git', 'status', '--porcelain', '--', 'package-lock.json', 'package.json'], cwd=CANDIDATE, capture_output=True, text=True).stdout
status = subprocess.run(['git', 'status', '--porcelain', '--untracked-files=no'], cwd=CANDIDATE, capture_output=True, text=True).stdout
frozen = ['scripts/boundary-semantic-engine.mjs', 'scripts/boundary-semantic-resolution.mjs', 'scripts/check-product-boundary.mjs',
          'scripts/boundary-installed-identity.mjs', 'scripts/boundary-semantic-compiled.mjs', 'scripts/boundary-reference-process.mjs']
src_hashes = {f: sha(CANDIDATE / f) for f in frozen}
blob_equal = {f: subprocess.check_output(['git', 'show', BASE + ':' + f], cwd=CANDIDATE) == (CANDIDATE / f).read_bytes() for f in frozen}
out = {'task': TASK, 'status': 'PASS' if all(blob_equal.values()) and not lock and not status else 'FAIL', 'observedAt': now(),
       'candidate': str(CANDIDATE), 'branch': 'build/hiso005-0241-20261018', 'head': head(), 'base': BASE,
       'copiedDependencyTrees': copied, 'copyMethod': 'cp -a (relative workspace symlinks preserved)', 'workspaceLinks': links,
       'nodeSha256': sha(NODE), 'nodeMatchesPin': sha(NODE) == NODE_SHA,
       'parserSha256': sha(CANDIDATE / 'node_modules/typescript/lib/typescript.js'),
       'parserMatchesPin': sha(CANDIDATE / 'node_modules/typescript/lib/typescript.js') == PARSER_SHA,
       'lockUnchanged': lock == '', 'trackedClean': status == '', 'frozenSourceHashes': src_hashes, 'frozenSourceEqualsBaseBlob': blob_equal,
       'specSha256': SPEC_SHA, 'errataSha256': ERRATA_SHA, 'install': False,
       'note': 'node_modules copied from the shared root checkout; root package-lock differs from af63ba60 only in a workspace devDependencies stanza (no install performed, candidate lock untouched).',
       'commands': log}
save('candidate-preflight.json', out)
print(json.dumps({k: v for k, v in out.items() if k not in ('commands', 'workspaceLinks')}, indent=1))
assert out['status'] == 'PASS'
