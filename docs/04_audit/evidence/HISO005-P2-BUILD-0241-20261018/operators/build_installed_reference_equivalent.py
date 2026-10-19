"""Installed reference (runbook 0803 recipe, unchanged) from a private git snapshot with the candidate's resolution fingerprint.

The frozen recipe cannot list the consolidated candidate tree (81,607 paths; 8 MiB listing cap, see
reference-recipe-blocker.json). The installed content is a function of the resolution fingerprint only
(package-lock + root/workspace package.json + .npmrc), which the 0234 comparator re-checks against the
evaluated root. The snapshot carries exactly those tracked bytes; the fingerprint equality is asserted.
Deviation, declared: receipt.commit is the snapshot commit, not the candidate commit.
"""
import json, shutil, subprocess, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

label = sys.argv[1]
state, freeze, review, h = assert_frozen()
assert shutil.disk_usage(RUNTIME).free > 20 * 1024 ** 3
log = []
src = RUNTIME / ('resolution-source-' + label)
out_root = RUNTIME / ('installed-reference-' + label)
assert not src.exists() and not out_root.exists()
tracked = subprocess.check_output(['git', 'ls-tree', '-r', '--name-only', h], cwd=CANDIDATE, text=True).splitlines()
patterns = json.loads((CANDIDATE / 'package.json').read_text())['workspaces']
assert patterns == ['apps/*', 'packages/*', 'legacy/packages/*', 'products/*'], patterns
wanted = {'package.json', 'package-lock.json'}
for name in tracked:
    parts = name.split('/')
    base = '/'.join(parts[:-1])
    dirs = base.split('/') if base else []
    workspace = any(len(dirs) == len(pat.split('/')) and all(q == '*' or q == d for q, d in zip(pat.split('/'), dirs))
                    for pat in patterns)
    if parts[-1] in ('package.json', '.npmrc') and workspace:
        wanted.add(name)
    if parts[-1] == '.npmrc' and base == '':
        wanted.add(name)
# Mode 'code' (r4+): every tracked path except audit evidence (79,144 evidence files are not
# resolution inputs and make the frozen recipe's listing exceed its 8 MiB cap); a superset of the
# resolution files, so the fingerprint is unchanged and the snapshot is closer to the real source.
mode = sys.argv[2] if len(sys.argv) > 2 else 'resolution'
assert mode in ('resolution', 'code', 'budget')
if mode in ('code', 'budget'):
    wanted |= {n for n in tracked if not n.startswith('docs/04_audit/evidence/')}
if mode == 'budget':
    # Mode 'budget' (r7+): also tracked evidence files, in path order, while the recipe's own
    # `git ls-tree -r -l -z` listing stays <= 7.5 MiB. This reproduces the BUILD0240 snapshot scale
    # (~38k files) under which the frozen recipe's monitor walk did not race npm's renames.
    raw = subprocess.check_output(['git', 'ls-tree', '-r', '-l', '-z', h], cwd=CANDIDATE).split(b'\0')
    sizes = {r.split(b'\t', 1)[1].decode(): len(r) + 1 for r in raw if r}
    budget = int(7.5 * 1024 * 1024) - sum(sizes[n] for n in wanted)
    for n in sorted(x for x in tracked if x.startswith('docs/04_audit/evidence/')):
        if sizes[n] > budget:
            break
        wanted.add(n)
        budget -= sizes[n]
files = sorted(wanted)
src.mkdir(parents=True)
env = {'PATH': '/usr/bin:/bin', 'LANG': 'C', 'LC_ALL': 'C', 'TZ': 'UTC', 'HOME': str(src), 'GIT_CONFIG_NOSYSTEM': '1',
       'GIT_AUTHOR_NAME': 'cvg-build0241', 'GIT_AUTHOR_EMAIL': 'cvg-build0241@invalid', 'GIT_AUTHOR_DATE': '2026-10-18T00:00:00Z',
       'GIT_COMMITTER_NAME': 'cvg-build0241', 'GIT_COMMITTER_EMAIL': 'cvg-build0241@invalid', 'GIT_COMMITTER_DATE': '2026-10-18T00:00:00Z'}
p, rec = run(['/usr/bin/git', 'init', '-q', '-b', 'resolution', str(src)], src, env, log)
assert p.returncode == 0, rec
for name in files:
    data = subprocess.check_output(['git', 'show', h + ':' + name], cwd=CANDIDATE)
    target = src / name
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
    assert data == (CANDIDATE / name).read_bytes(), name
spec = src.parent / (src.name + '.pathspec')
spec.write_bytes(b'\0'.join(f.encode() for f in files) + b'\0')
for argv in (['/usr/bin/git', '-c', 'core.hooksPath=/dev/null', 'add', '-f', '--pathspec-from-file=' + str(spec), '--pathspec-file-nul'],
             ['/usr/bin/git', '-c', 'core.hooksPath=/dev/null', 'commit', '-q', '-m', 'HISO005-P2-BUILD-0241 resolution-equivalent snapshot of ' + h]):
    p, rec = run(argv, src, env, log)
    assert p.returncode == 0, rec
snap = subprocess.check_output(['/usr/bin/git', 'rev-parse', 'HEAD'], cwd=src, env=env, text=True).strip()
fp = ("import {fingerprintResolution} from './scripts/boundary-installed-identity.mjs';"
      "console.log(JSON.stringify([fingerprintResolution(process.argv[1]),fingerprintResolution(process.argv[2])]))")
p, rec = run([NODE, '--input-type=module', '-e', fp, str(CANDIDATE), str(src)], CANDIDATE, minimal_env(src), log)
assert p.returncode == 0, rec
a, b = json.loads(p.stdout)
assert a == b, (a, b)
renv = dict(minimal_env(RUNTIME / 'references-tmp'), HOME='/home/ricardo')
(RUNTIME / 'references-tmp').mkdir(exist_ok=True)
p, rec = run([NODE, 'scripts/build-installed-reference.mjs', '--source-root=' + str(src), '--commit=' + snap,
              '--output-root=' + str(out_root), '--cache-source=' + str(RUNTIME / 'npm-cache-source')], CANDIDATE, renv, log, timeout=1800)
status = 'INSTALLED_REFERENCE_BUILT' if p.returncode == 0 else 'INSTALLED_REFERENCE_FAILED'
installed = json.loads(p.stdout) if p.returncode == 0 else None
if installed:
    assert sha(installed['manifestPath']) == installed['expectedSha256']
assert_frozen()
result = {'task': TASK, 'label': label, 'snapshotMode': mode, 'snapshotFileCount': len(files), 'status': status, 'observedAt': now(), 'sourceCommit': h, 'resolutionSnapshot': str(src),
          'resolutionSnapshotCommit': snap, 'snapshotFiles': files, 'fingerprintCandidate': a, 'fingerprintSnapshot': b,
          'fingerprintEqual': a == b, 'installedReference': installed, 'compiledReference': None,
          'compiledReferenceStatus': 'BLOCKED (reference-recipe-blocker.json)', 'commands': log,
          'deviation': 'receipt.commit = resolutionSnapshotCommit; recipe code unchanged; content determined by the equal resolution fingerprint'}
save('references-' + label + '.json', result)
if installed:
    save('references-current.json', result)
print(json.dumps({k: v for k, v in result.items() if k not in ('commands', 'snapshotFiles')}, indent=1))
assert installed
