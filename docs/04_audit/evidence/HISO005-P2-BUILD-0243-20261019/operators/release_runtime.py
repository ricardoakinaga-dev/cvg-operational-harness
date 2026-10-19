"""Release the private runtime after recording the hashes of what is removed. The eval-228e worktree goes with
`git worktree remove` (clean, own). The candidate stays as the detached anchor of the three commits."""
import json, shutil, subprocess, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

assert str(RUNTIME).endswith('cvg-hiso005-build0243-0242-runtime-20261019')
rec = {'observedAt': now(), 'runtime': str(RUNTIME), 'recordedBeforeRemoval': []}
for f in sorted(RUNTIME.glob('refs-*/*/reference.json')) + sorted(RUNTIME.glob('refs-*/compiled/commands.json')):
    rec['recordedBeforeRemoval'].append({'path': str(f.relative_to(RUNTIME)), 'bytes': f.stat().st_size, 'sha256': sha(f)})
procs = [p for p in subprocess.run(['pgrep', '-af', str(RUNTIME)], capture_output=True, text=True).stdout.splitlines() if 'pgrep' not in p and 'release_runtime' not in p]
assert not procs, procs
wt = RUNTIME / 'eval-228e'
if wt.exists():
    p = subprocess.run(['git', '-C', str(PROJECT), 'worktree', 'remove', str(wt)], capture_output=True, text=True)
    rec['worktreeRemove'] = {'exitCode': p.returncode, 'stderr': p.stderr[-300:]}
    assert p.returncode == 0, p.stderr
size = int(subprocess.check_output(['du', '-sb', str(RUNTIME)], text=True).split()[0])
rec['removed'] = sorted(c.name for c in RUNTIME.iterdir())
for child in sorted(RUNTIME.iterdir()):
    if child.is_dir() and not child.is_symlink():
        shutil.rmtree(child)
    else:
        child.unlink()
RUNTIME.rmdir()
rec.update(bytesReleased=size, runtimeExists=RUNTIME.exists(),
           worktreeListed=str(wt) in subprocess.check_output(['git', '-C', str(PROJECT), 'worktree', 'list'], text=True),
           postgres='cvg-hiso005-build0242-pg (56262) parado e removido depois do certify r2 e do verificador',
           ports='56262/3448/4448 livres', candidateKept={'path': str(CANDIDATE), 'head': head(), 'why': 'âncora detached dos commits 131ee6cd, 188745d0 e 32b92121 até a promoção pelo lead'},
           liveProcesses=[])
for task in ('0243', '0242'):
    save(task, 'runtime-release-receipt.json', rec)
print(json.dumps({k: rec[k] for k in ('bytesReleased', 'runtimeExists', 'worktreeListed', 'removed')})[:1500])
